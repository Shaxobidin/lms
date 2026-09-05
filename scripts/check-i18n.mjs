/**
 * Maqsad: i18n kataloglarining to'liqligini tekshirish (F-18, RSK-07).
 *
 * CI gate: agar biror tilda kalit yetishmasa yoki ortiqcha bo'lsa,
 * yoki ICU o'rinbosarlari mos kelmasa — build to'xtaydi.
 *
 * Ishga tushirish: node scripts/check-i18n.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MESSAGES_DIR = join(process.cwd(), 'apps', 'web', 'messages');
const REFERENCE_LOCALE = 'uz-Latn';
const LOCALES = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'];

/** Ichma-ich obyektni `a.b.c` ko'rinishidagi kalitlar ro'yxatiga yoyadi. */
function flatten(value, prefix = '') {
  const result = new Map();

  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const [nested, nestedValue] of flatten(item, path)) {
        result.set(nested, nestedValue);
      }
    } else {
      result.set(path, item);
    }
  }

  return result;
}

/** Matndagi ICU o'rinbosarlari: `{name}`, `{count}`. */
function placeholders(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const catalogs = new Map();
for (const locale of LOCALES) {
  const raw = await readFile(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  catalogs.set(locale, flatten(JSON.parse(raw)));
}

const reference = catalogs.get(REFERENCE_LOCALE);
const problems = [];

for (const locale of LOCALES) {
  if (locale === REFERENCE_LOCALE) continue;
  const catalog = catalogs.get(locale);

  for (const [key, referenceValue] of reference) {
    if (!catalog.has(key)) {
      problems.push({ locale, key, issue: 'yetishmayapti' });
      continue;
    }

    const value = catalog.get(key);
    if (typeof value !== 'string' || value.trim().length === 0) {
      problems.push({ locale, key, issue: "bo'sh qiymat" });
      continue;
    }

    const expected = placeholders(referenceValue).join(',');
    const actual = placeholders(value).join(',');
    if (expected !== actual) {
      problems.push({
        locale,
        key,
        issue: `o'rinbosarlar mos emas (kutilgan: ${expected || '—'}, olingan: ${actual || '—'})`,
      });
    }
  }

  for (const key of catalog.keys()) {
    if (!reference.has(key)) {
      problems.push({ locale, key, issue: 'ortiqcha kalit' });
    }
  }
}

// --- API xatolik kalitlari ---------------------------------------------------

/**
 * Backend `AppException` orqali `errors.*` kalitlarini qaytaradi va matn
 * FAQAT frontendda tanlanadi (P7). Demak har bir kalit katalogda bo'lishi shart,
 * aks holda foydalanuvchi xom kalit ko'radi.
 */
const API_SOURCE_DIR = join(process.cwd(), 'apps', 'api', 'src');
const ERROR_KEY_PATTERN = /'(errors\.[a-z0-9_]+)'/g;

async function collectErrorKeys(dir) {
  const keys = new Set();
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      for (const key of await collectErrorKeys(fullPath)) keys.add(key);
      continue;
    }

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;

    const content = await readFile(fullPath, 'utf8');
    for (const match of content.matchAll(ERROR_KEY_PATTERN)) {
      keys.add(match[1]);
    }
  }

  return keys;
}

for (const key of await collectErrorKeys(API_SOURCE_DIR)) {
  if (!reference.has(key)) {
    problems.push({
      locale: REFERENCE_LOCALE,
      key,
      issue: "API shu kalitni qaytaradi, lekin katalogda tarjimasi yo'q",
    });
  }
}

const totalKeys = reference.size;

if (problems.length === 0) {
  console.log(
    `i18n to'liq: ${LOCALES.length} til x ${totalKeys} kalit = ${LOCALES.length * totalKeys} qiymat.`,
  );
  process.exit(0);
}

console.error(`i18n muammolari topildi (${problems.length} ta):\n`);
for (const problem of problems.slice(0, 60)) {
  console.error(`  [${problem.locale}] ${problem.key} — ${problem.issue}`);
}
if (problems.length > 60) {
  console.error(`  ... va yana ${problems.length - 60} ta`);
}
process.exit(1);
