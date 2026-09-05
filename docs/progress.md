# Bajarilgan ishlar va tizim holati

Bu fayl `promt.md` §17 talabiga ko'ra yuritiladi: bosqichlar holati, o'lchangan
ko'rsatkichlar va keyingi qadamlar. Sana: **2026-09-04**.

---

## 1. Bosqichlar (B0–B10)

| Bosqich | Mazmuni                                    | Holat | Natija                                                  |
| ------- | ------------------------------------------ | ----- | ------------------------------------------------------- |
| B0      | Talablar tahlili, noaniqliklar, taxminlar  | ✅    | `docs/00-analysis.md` — 30 ta taxmin, 12 ta risk        |
| B1      | Arxitektura: C4, ERD, ADR                  | ✅    | `docs/01-architecture.md` — 15 ta ADR                   |
| B2      | Monorepo, Docker, CI, muhit                | ✅    | npm workspaces, `docker compose`, GitHub Actions        |
| B3      | Ma'lumot modeli va migratsiyalar           | ✅    | 78 jadval, 20 enum, 2 migratsiya + 2 `down.sql`         |
| B4      | RBAC/ABAC va autentifikatsiya              | ✅    | 161 ruxsat, deklarativ matritsa, `PolicyGuard`          |
| B5      | Domen modullari F-01 … F-18                | ✅    | 155 endpoint, 176 operatsiya (OpenAPI 3.1)              |
| B6      | Frontend: layout, sahifalar, dizayn tizimi | ✅    | Next.js 15 App Router, 4 til, dark mode                 |
| B7      | Standartlar: SCORM, xAPI, LTI, QTI, GOST   | ✅    | RTE, LRS, Tool Provider, DOCX/XLSX GOST 7.32            |
| B8      | Integratsiyalar (adapter + mock)           | ✅    | HEMIS, One ID, E-IMZO, SMS, Telegram, BBB/Jitsi, to'lov |
| B9      | Testlar va sifat nazorati                  | ✅    | 256 unit + 43 e2e + 35 smoke + 21 oqim, qamrov 85.55%   |
| B10     | Hujjatlar, deploy, yakuniy tekshiruv       | ✅    | 7 ta hujjat (o'zbekcha), `docker compose up`            |

---

## 2. O'lchangan ko'rsatkichlar

| Ko'rsatkich                         | Qiymat                                | Talab             |
| ----------------------------------- | ------------------------------------- | ----------------- |
| Unit testlar (shared)               | 73 ✅                                 | —                 |
| Unit/integratsion testlar (API)     | 158 ✅                                | —                 |
| Unit testlar (web)                  | 25 ✅                                 | —                 |
| Qamrov (statements)                 | **85.55%**                            | ≥ 70%             |
| Qamrov (functions / lines)          | 87.27% / 86.74%                       | ≥ 70%             |
| E2E testlar (Playwright)            | **43** ✅ (o'tkazib yuborilgani yo'q) | —                 |
| Smoke tekshiruvlari                 | **35/35** ✅                          | —                 |
| i18n to'liqligi                     | 4 til × 632 kalit = **2 528** qiymat  | 0 ta yetishmovchi |
| OpenAPI                             | 155 yo'l, 176 operatsiya              | 3.1               |
| Lighthouse Performance (ochiq)      | **100**                               | ≥ 85              |
| Lighthouse Accessibility (ochiq)    | **100**                               | ≥ 95              |
| Lighthouse Best Practices           | **100**                               | —                 |
| axe-core WCAG 2.1 AA (10 sahifa)    | **0 buzilish** (yorug' va qorong'i)   | 0                 |
| LCP (eng yomon, autentifikatsiyali) | **424 ms**                            | < 2500 ms         |
| ESLint                              | **0 muammo**                          | 0                 |
| TODO/FIXME markerlari               | **0**                                 | 0                 |
| Docker (prod) — ilova xotirasi      | ~300 MB (api+web+worker)              | —                 |
| Hujjat oqimi tekshiruvi             | **13/13** ✅                          | —                 |
| Navbat oqimi tekshiruvi             | **8/8** ✅                            | —                 |
| API p95 (60 VU, 1 instansiya)       | **258 ms**                            | < 300 ms (NF-01)  |
| Tezlik (60 VU, 1 instansiya)        | **319 RPS**                           | —                 |
| Gorizontal masshtablanish           | 1→2 instansiya: 258 → **344 RPS**     | §5 (stateless)    |

> **Lighthouse va autentifikatsiya:** Lighthouse har navigatsiyada yangi brauzer
> konteksti ochadi, shu sababli `httpOnly` refresh cookie yo'qoladi va sahifa
> kirish sahifasiga qaytadi (bu ADR-005 ning kutilgan oqibati, xatolik emas).
> Shuning uchun ichki sahifalar Lighthouse ning Accessibility kategoriyasi
> asosidagi **axe-core** dvigateli bilan to'g'ridan-to'g'ri o'lchandi, LCP esa
> brauzerning `PerformanceObserver` idan olindi.

---

## 3. Ushbu bosqichda topilgan va tuzatilgan kamchiliklar

Testlar va o'lchovlar **haqiqiy** nuqsonlarni ochdi — hammasi tuzatildi:

| #   | Kamchilik                                                                          | Qanday topildi                    | Tuzatish                                           |
| --- | ---------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| 1   | `buildAttemptPayload` urinish egasini tekshirmasdi (xavfsizlik)                    | ESLint (foydalanilmagan `userId`) | `findFirst({ id, userId })`                        |
| 2   | Kirish sahifasidagi "Parolni unutdingizmi?" 404 beruvchi havola                    | Lighthouse tarmoq jurnali         | `/forgot-password` va `/reset-password` yaratildi  |
| 3   | Skip-link nishoni fokuslanmas edi (WCAG 2.4.1)                                     | Lighthouse a11y                   | `<main id="main-content" tabIndex={-1}>`           |
| 4   | Sarlavhalar ketma-ketligi buzilardi (h1 → h3)                                      | Lighthouse a11y                   | `CardTitle` standart darajasi `h2`                 |
| 5   | `--warning` yorug' rejimda AA dan past (3.65:1)                                    | axe-core                          | Yorqinlik 38% → 30% (5.14:1)                       |
| 6   | `--destructive` qorong'i rejimda AA dan past (4.42:1)                              | axe-core                          | Yorqinlik 62% → 70% (5.55:1)                       |
| 7   | `Alert` ichidagi `opacity-90` kontrastni pasaytirardi                              | axe-core                          | Olib tashlandi                                     |
| 8   | Anonim foydalanuvchida har yuklanishda keraksiz 401 `/auth/refresh`                | Lighthouse konsol jurnali         | `lms_session` belgi-cookie (sirsiz)                |
| 9   | E2E testlar 3 joyda jimgina `skip` qilardi                                         | JSON hisobot tahlili              | Kutish + qat'iy assertion ga almashtirildi         |
| 10  | `vitest` web da Playwright fayllarini yuklab yiqilardi                             | `npm run verify`                  | `vitest.config.ts` + 25 ta frontend testi          |
| 11  | Docker dev rejimida `nest start` `dist/main` ni qidirardi                          | `docker compose up`               | `apps/api/nest-cli.json` (`entryFile`)             |
| 12  | `.env` dagi host porti (`REDIS_PORT=56379`) konteynerga o'tib ketardi              | `docker compose up`               | Compose da ichki port qadaldi (`6379`)             |
| 13  | Dev target da 3 ta watcher ~2.5 GB olib, `web` `ENOMEM` bilan yiqilardi            | `docker compose up`               | Hujjatlashtirildi + prod target tavsiya etiladi    |
| 14  | `certificate.issue` va `integration.hemis.sync` ishlovchisi yo'q navbatga tushardi | Konteynerda sertifikat berish     | Ish turi ishlovchisi turgan navbatga bog'landi     |
| 15  | `email.send` / `sms.send` / `telegram.send` navbatlarida iste'molchi yo'q edi      | Navbat xaritasi tahlili           | `channel.worker.ts` — 3 ta yangi ishlovchi         |
| 16  | Presigned havola ichki manzil (`minio:9000`) bilan imzolanardi                     | Fayl yuklab olish                 | Imzolash uchun `MEDIA_PUBLIC_URL` li alohida mijoz |
| 17  | `params` shablonga qarab tekshirilmasdi — worker ichida Prisma xatosi              | Hujjat generatsiyasi              | `generateDocumentSchema.superRefine` (§8)          |
| 18  | `PROTOCOL` va `SYLLABUS` shablonlari e'lon qilingan, ammo yozilmagan               | Barcha shablonlarni sinash        | Ikkala DOCX quruvchisi yozildi (§16)               |
| 19  | 83 ta API xatolik kalitidan 40 tasining tarjimasi yo'q edi                         | API/katalog solishtiruvi          | 40 kalit x 4 til + tekshiruvchiga yangi qoida      |
| 20  | `GET /certificates/templates` yo'q edi — `templateId` ni bilib bo'lmasdi           | Sertifikat berish oqimi           | Endpoint qo'shildi                                 |
| 21  | Rolga qarab rate limit AMALDA ishlamasdi: `checkApi` hech qayerdan chaqirilmasdi   | Yuk sinoviga tayyorgarlik         | `RateLimitGuard` + 8 ta test (§8)                  |

---

## 4. Ataylab qabul qilingan yechimlar

| Yechim                                           | Sabab                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Sertifikat verifikatsiya sahifasi indekslanmaydi | Sahifada shaxsga doir ma'lumot bor — SEO ballidan xavfsizlik ustun (§11) |
| Qamrov faqat sof/xavfsizlik qatlamida o'lchanadi | A-24: kontrollerlar e2e va smoke bilan qoplangan, ikki marta sanalmaydi  |
| `npm workspaces` (pnpm emas)                     | A-01: muhitda pnpm yo'q, ishga tushirish sodda bo'lishi kerak            |
| SSE (WebSocket emas)                             | ADR-010: bir tomonlama oqim yetarli, Nginx orqali sodda tarqaladi        |
| `class-validator` emas, faqat zod                | ADR-011: kontrakt yagona manbada — backend va frontend bir xil sxemadan  |
| Urinishlar tugagan holatda test `skip` qiladi    | Bu tizimning TO'G'RI xatti-harakati; test uni xabar orqali tasdiqlaydi   |

---

## 5. Tizimni qayta ishga tushirish

```bash
docker compose up -d postgres redis minio minio-init mailhog
npm run build:shared && npm run db:deploy && npm run db:seed
npm run dev
```

To'liq tekshiruv:

```bash
npm run verify                  # format + lint + tiplar + TODO + i18n + testlar
node scripts/smoke.mjs          # 35 ta uchdan-uchgacha tekshiruv
npm run check:documents         # hujjat va sertifikat oqimi (13 ta)
npm run check:queues            # navbat orqali xat va PDF (8 ta)
npm run load-test               # NF-01/NF-02 o'lchovi
npm run test:e2e                # 43 ta Playwright testi
```

---

## 6. Keyingi qadamlar (ishlab chiqarishga chiqishdan oldin)

Bular loyiha doirasidan tashqarida, lekin real foydalanish uchun zarur:

1. **Real integratsiya kalitlari** — HEMIS, One ID, E-IMZO, Eskiz SMS uchun
   `.env` da `mock` rejimini `live` ga almashtirish va sinov muhitida tekshirish.
2. **Yuk sinovini ishlab chiqarish apparatida takrorlash** — sinov mashinasida
   o'lchov bajarildi (`docs/load-test.md`): bitta instansiya ~300 RPS ni
   p95 < 300 ms bilan xizmat qiladi, ikkinchi instansiya tezlikni oshiradi.
   500 RPS ni yakuniy tasdiqlash alohida serverda, 2–3 instansiya bilan.
3. **Kirill katalogini tarjimon ko'rigi** — `uz-Cyrl.json` transliteratsiya
   orqali hosil qilingan (A-16), atamalar filologik tasdiqdan o'tishi lozim.
4. **Zaxira nusxani tiklash mashqi** — `docs/deploy.md` §5.3 dagi haftalik
   tekshiruv jadvalini amalda ishga tushirish.
5. **Penetratsiya testi** — OWASP Top 10 bo'yicha mustaqil audit.
