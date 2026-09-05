/**
 * Maqsad: NF-01 (API p95 < 300 ms) va NF-02 (500 RPS) ni o'lchash.
 *
 * Yondashuv: yuk KO'P foydalanuvchi ustiga taqsimlanadi — bu ham haqiqiy
 * foydalanishga yaqin, ham rolga qarab qo'yilgan rate limit (§8) o'lchovni
 * buzmasligini ta'minlaydi. Har bir virtual foydalanuvchi bir marta kirib,
 * so'ng o'z tokeni bilan real sahifalar ochadigan so'rovlarni yuboradi.
 *
 * Ishga tushirish:
 *   node scripts/load-test.mjs                 # standart: 50 VU, 30 s
 *   VUS=100 DURATION=60 node scripts/load-test.mjs
 *   TARGET_RPS=500 VUS=200 node scripts/load-test.mjs
 *
 * Eslatma: natija SINOV MASHINASI imkoniyatiga bog'liq. Ishlab chiqarish
 * ko'rsatkichlari alohida serverda, `BUILD_TARGET=production` bilan o'lchanadi.
 *
 * Brute-force himoyasi (§11) bitta login uchun 15 daqiqada 10 ta urinishga
 * ruxsat beradi. Shuning uchun tokenlar diskda keshlanadi va qayta ishga
 * tushirilganda qayta ishlatiladi. Agar baribir limitga urilsangiz — SINOV
 * muhitida hisoblagichni tozalash mumkin:
 *
 *   docker exec lms-redis redis-cli --scan --pattern 'rl:auth:*' | \
 *     xargs -r docker exec -i lms-redis redis-cli DEL
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const VUS = Number(process.env.VUS ?? 50);
const DURATION_SECONDS = Number(process.env.DURATION ?? 30);
const WARMUP_SECONDS = Number(process.env.WARMUP ?? 5);
const TARGET_RPS = process.env.TARGET_RPS ? Number(process.env.TARGET_RPS) : null;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo!2026';

/**
 * Ssenariylar va ularning og'irligi. Taqsimot haqiqiy foydalanishga taqlid
 * qiladi: talaba ko'p o'qiydi, o'qituvchi kamroq, lekin og'irroq so'rov yuboradi.
 */
const SCENARIOS = [
  { name: 'GET /courses', weight: 18, path: () => '/courses?limit=20' },
  { name: 'GET /courses/:id', weight: 14, path: (ctx) => `/courses/${ctx.courseId}` },
  {
    name: 'GET /content/progress/course/:id',
    weight: 14,
    path: (ctx) => `/content/progress/course/${ctx.courseId}`,
  },
  {
    name: 'GET /courses/:id/assignments',
    weight: 14,
    path: (ctx) => `/courses/${ctx.courseId}/assignments`,
  },
  {
    name: 'GET /grading/courses/:id/my-result',
    weight: 14,
    path: (ctx) => `/grading/courses/${ctx.courseId}/my-result`,
  },
  { name: 'GET /notifications', weight: 10, path: () => '/notifications?limit=20' },
  {
    name: 'GET /courses/:id/quizzes',
    weight: 8,
    path: (ctx) => `/courses/${ctx.courseId}/quizzes`,
  },
  { name: 'GET /analytics/student-overview', weight: 8, path: () => '/analytics/student-overview' },
];

const WEIGHT_TOTAL = SCENARIOS.reduce((sum, item) => sum + item.weight, 0);

function pickScenario(random) {
  let threshold = random * WEIGHT_TOTAL;
  for (const scenario of SCENARIOS) {
    threshold -= scenario.weight;
    if (threshold <= 0) return scenario;
  }
  return SCENARIOS[0];
}

/** Foizli (percentile) qiymat — kutish vaqtlari ro'yxati saralangan bo'lishi shart. */
function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Token keshi: brute-force himoyasi (15 daqiqada 10 urinish) sinovni qayta-qayta
 * ishga tushirishga xalaqit qilmasligi uchun tokenlar diskda saqlanadi.
 * Access token 15 daqiqa yashaydi, shuning uchun kesh ham shu muddat bilan
 * chegaralanadi.
 */
const CACHE_FILE = join(tmpdir(), 'qdu-lms-load-test-tokens.json');
const CACHE_TTL_MS = 12 * 60 * 1000;

let tokenCache = {};
try {
  const raw = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  if (Date.now() - raw.savedAt < CACHE_TTL_MS) tokenCache = raw.tokens ?? {};
} catch {
  // Kesh yo'q yoki buzilgan — muammo emas, qaytadan kirib olamiz
  tokenCache = {};
}

function saveTokenCache() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ savedAt: Date.now(), tokens: tokenCache }), 'utf8');
  } catch (error) {
    console.log(`Kesh saqlanmadi (muhim emas): ${error.message}`);
  }
}

async function login(loginValue) {
  const cached = tokenCache[loginValue];
  if (cached) return cached;

  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(`${loginValue}: ${JSON.stringify(body.error).slice(0, 160)}`);

  tokenCache[loginValue] = body.data.tokens.accessToken;
  return tokenCache[loginValue];
}

/**
 * Seed dagi talaba loginlari — yuk shular ustiga taqsimlanadi.
 *
 * Hovuz ataylab kerakligidan KATTA olinadi: brute-force himoyasi bitta login
 * uchun 15 daqiqada 10 ta urinishga ruxsat beradi (§11), shuning uchun sinov
 * qayta-qayta ishga tushirilganda zaxira nomzodlar kerak bo'ladi.
 */
async function collectStudentLogins(count) {
  const adminToken = await login('admin@qdu.uz');
  const logins = [];
  let cursor = null;

  // Kursor bo'yicha sahifalash (§8): bitta sahifada eng ko'pi 100 ta yozuv
  while (logins.length < count + 20) {
    const query = new URLSearchParams({ limit: '100', role: 'STUDENT' });
    if (cursor) query.set('cursor', cursor);

    const response = await fetch(`${API}/users?${query}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await response.json();
    if (!body.success) throw new Error(`Talabalar ro'yxati: ${JSON.stringify(body.error)}`);

    logins.push(...body.data.map((user) => user.email).filter(Boolean));

    if (!body.meta?.hasMore || !body.meta?.nextCursor) break;
    cursor = body.meta.nextCursor;
  }

  if (logins.length === 0) {
    throw new Error('Seed da talaba topilmadi — `npm run db:seed` ishlating');
  }
  if (logins.length < count) {
    console.log(`Diqqat: ${logins.length} ta talaba topildi, ${count} ta so'ralgan edi.`);
  }
  return logins;
}

/** Login rate-limitga uchrasa keyingi nomzodga o'tadi. */
async function loginWithFallback(candidates, startIndex) {
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(startIndex + offset) % candidates.length];
    try {
      return { token: await login(candidate), login: candidate };
    } catch (error) {
      if (!String(error.message).includes('RATE_LIMITED')) throw error;
    }
  }
  throw new Error(
    "Barcha loginlar rate-limitga uchradi — 15 daqiqa kuting yoki seed'ni kengaytiring",
  );
}

const stats = new Map();

function record(name, durationMs, status) {
  let entry = stats.get(name);
  if (!entry) {
    entry = { durations: [], ok: 0, rateLimited: 0, failed: 0 };
    stats.set(name, entry);
  }

  entry.durations.push(durationMs);
  if (status === 429) entry.rateLimited += 1;
  else if (status >= 200 && status < 400) entry.ok += 1;
  else entry.failed += 1;
}

async function runVirtualUser(token, context, deadline, pacingMs, collecting) {
  while (Date.now() < deadline) {
    const scenario = pickScenario(Math.random());
    const startedAt = performance.now();

    try {
      const response = await fetch(`${API}${scenario.path(context)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await response.arrayBuffer();

      if (collecting()) {
        record(scenario.name, performance.now() - startedAt, response.status);
      }
    } catch (error) {
      if (collecting()) {
        record(scenario.name, performance.now() - startedAt, 0);
      }
      void error;
    }

    if (pacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pacingMs));
    }
  }
}

// ---------------------------------------------------------------- ishga tushirish

console.log(
  `Yuk sinovi: ${VUS} virtual foydalanuvchi, ${DURATION_SECONDS} s (+${WARMUP_SECONDS} s isitish)`,
);
console.log(`Manzil: ${API}`);
if (TARGET_RPS) console.log(`Maqsadli tezlik: ${TARGET_RPS} RPS`);

const logins = await collectStudentLogins(VUS);
console.log(`Seed dan ${logins.length} ta talaba topildi — yuk shular ustiga taqsimlanadi.\n`);

/**
 * Har bir virtual foydalanuvchi O'ZI ko'ra oladigan kurs bilan ishlaydi.
 *
 * Buni e'tiborsiz qoldirish o'lchovni buzadi: ABAC boshqa talabaning kursiga
 * murojaatni 403/404 bilan ARZON rad etadi va p95 sun'iy ravishda yaxshi
 * ko'rinadi. Shuning uchun kontekst sessiyaga bog'lanadi.
 */
const sessions = [];
for (let index = 0; index < VUS; index += 1) {
  const { token, login: loginValue } = await loginWithFallback(logins, index);

  const own = await fetch(`${API}/courses?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ownBody = await own.json();
  const courseId = ownBody.data?.[0]?.id;
  if (!courseId) throw new Error(`${loginValue}: ko'rinadigan kurs topilmadi`);

  sessions.push({ token, context: { courseId } });
}
saveTokenCache();
console.log(`${sessions.length} ta sessiya ochildi.`);

const context = sessions[0].context;
const tokens = sessions.map((session) => session.token);

// Ssenariylarni oldindan tekshiramiz: noto'g'ri endpoint o'lchovni buzmasin.
// Avvalgi tajriba: 404 qaytaruvchi yo'llar "tez" ko'rinib, p95 ni pasaytirardi.
console.log('\nSsenariylarni tekshirish:');
for (const scenario of SCENARIOS) {
  const probe = await fetch(`${API}${scenario.path(context)}`, {
    headers: { Authorization: `Bearer ${tokens[0]}` },
  });
  console.log(`  ${probe.ok ? '✓' : '✗'} ${scenario.name.padEnd(34)} ${probe.status}`);
  if (!probe.ok) {
    throw new Error(`${scenario.name} ${probe.status} qaytardi — ssenariyni to'g'rilang`);
  }
}
console.log('');

// Har bir VU uchun pacing: maqsadli RPS berilgan bo'lsa, so'rovlar tezligi cheklanadi
const pacingMs = TARGET_RPS ? Math.max(0, Math.round((VUS * 1000) / TARGET_RPS)) : 0;
if (pacingMs > 0) console.log(`Har bir foydalanuvchi so'rovlar orasida ${pacingMs} ms kutadi.`);

const warmupUntil = Date.now() + WARMUP_SECONDS * 1000;
const deadline = warmupUntil + DURATION_SECONDS * 1000;
const collecting = () => Date.now() >= warmupUntil;

console.log('Isitish...');
const startedAt = Date.now();
await Promise.all(
  sessions.map((session) =>
    runVirtualUser(session.token, session.context, deadline, pacingMs, collecting),
  ),
);
const elapsedSeconds = (Date.now() - warmupUntil) / 1000;

// ------------------------------------------------------------------- hisobot

let totalRequests = 0;
let totalOk = 0;
let totalRateLimited = 0;
let totalFailed = 0;
const allDurations = [];

console.log(
  `\nO'lchov davri: ${elapsedSeconds.toFixed(1)} s (jami ${((Date.now() - startedAt) / 1000).toFixed(1)} s)\n`,
);
console.log('Endpoint bo`yicha kechikish (ms):');
console.log(
  '  ' +
    'Endpoint'.padEnd(34) +
    'n'.padStart(7) +
    'p50'.padStart(8) +
    'p95'.padStart(8) +
    'p99'.padStart(8) +
    '  429',
);

for (const [name, entry] of [...stats.entries()].sort()) {
  const sorted = [...entry.durations].sort((a, b) => a - b);
  totalRequests += entry.durations.length;
  totalOk += entry.ok;
  totalRateLimited += entry.rateLimited;
  totalFailed += entry.failed;
  allDurations.push(...entry.durations);

  console.log(
    '  ' +
      name.padEnd(34) +
      String(entry.durations.length).padStart(7) +
      percentile(sorted, 0.5).toFixed(0).padStart(8) +
      percentile(sorted, 0.95).toFixed(0).padStart(8) +
      percentile(sorted, 0.99).toFixed(0).padStart(8) +
      String(entry.rateLimited).padStart(5),
  );
}

const sortedAll = [...allDurations].sort((a, b) => a - b);
const p95 = percentile(sortedAll, 0.95);
const rps = totalRequests / elapsedSeconds;

console.log('\nUmumiy natija:');
console.log(
  `  So'rovlar:        ${totalRequests} (${totalOk} muvaffaqiyatli, ${totalRateLimited} rate-limited, ${totalFailed} xato)`,
);
console.log(`  Tezlik:           ${rps.toFixed(1)} RPS`);
console.log(`  Kechikish p50:    ${percentile(sortedAll, 0.5).toFixed(0)} ms`);
console.log(`  Kechikish p95:    ${p95.toFixed(0)} ms   (NF-01 talabi: < 300 ms)`);
console.log(`  Kechikish p99:    ${percentile(sortedAll, 0.99).toFixed(0)} ms`);
console.log(`  Maksimal:         ${sortedAll[sortedAll.length - 1]?.toFixed(0) ?? 0} ms`);

const nf01 = p95 < 300;
console.log(`\n  NF-01 (p95 < 300 ms): ${nf01 ? '✓ bajarildi' : '✗ bajarilmadi'}`);
if (TARGET_RPS) {
  const nf02 = rps >= TARGET_RPS * 0.95;
  console.log(
    `  NF-02 (${TARGET_RPS} RPS):     ${nf02 ? '✓ bajarildi' : `✗ erishilgani ${rps.toFixed(0)} RPS`}`,
  );
}

process.exit(nf01 && totalFailed === 0 ? 0 : 1);
