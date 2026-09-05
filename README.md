# QDU LMS — O'quv jarayonini boshqarish tizimi

Qo'qon Davlat Universiteti uchun ishlab chiqilgan to'liq funksional LMS:
o'quv rejadan tortib diplom/sertifikat berishgacha bo'lgan barcha bosqichlarni
yagona raqamli platformada birlashtiradi.

**Texnologiyalar:** Next.js 15 · NestJS 10 · PostgreSQL 16 · Prisma 6 · Redis 7 · MinIO · Docker

---

## Tez boshlash

Talab qilinadi: **Docker** va **Node.js 20+**.

```bash
# 1. Muhit o'zgaruvchilarini tayyorlash
cp .env.example .env

# 2. Bog'liqliklarni o'rnatish
npm install

# 3. Infratuzilmani ko'tarish (PostgreSQL, Redis, MinIO, MailHog)
docker compose up -d postgres redis minio minio-init mailhog

# 4. Umumiy paketni qurish, migratsiya va demo ma'lumotlar
npm run build:shared
npm run db:deploy
npm run db:seed

# 5. Ishga tushirish (API + web bir vaqtda)
npm run dev
```

Ochiladi:

| Xizmat                | Manzil                            |
| --------------------- | --------------------------------- |
| Ilova                 | http://localhost:3000             |
| API                   | http://localhost:4000/api/v1      |
| API hujjati (Swagger) | http://localhost:4000/api/v1/docs |
| MailHog (xatlar)      | http://localhost:8025             |
| MinIO konsoli         | http://localhost:9001             |

> **Portlar band bo'lsa:** `.env` dagi `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`,
> `SMTP_PORT_HOST`, `MAILHOG_UI_PORT` qiymatlarini o'zgartiring — konteynerlar
> ichidagi portlar o'zgarmaydi.

### To'liq Docker rejimi

```bash
# Tavsiya etiladi: kompilyatsiya qilingan image lar (tez, kam xotira)
BUILD_TARGET=production docker compose up -d

# Nginx bilan (prod profil)
BUILD_TARGET=production docker compose --profile prod up -d

# Hot-reload bilan ishlab chiqish rejimi (ko'p xotira talab qiladi)
docker compose up -d
```

> **Xotira talabi.** Standart `docker compose up` **development** target ni
> quradi: `api`, `worker` va `web` konteynerlarining har biri o'z
> TypeScript/Next.js kuzatuvchisini ishga tushiradi va birgalikda **~2.5 GB**
> egallaydi. Docker Desktop ga 4 GB dan kam ajratilgan bo'lsa `web` konteyneri
> `ENOMEM` bilan yiqiladi. Shuning uchun:
>
> - **tizimni shunchaki ishga tushirish** uchun `BUILD_TARGET=production`
>   ishlating — uchala konteyner birgalikda **~300 MB** oladi;
> - **kod yozish** uchun dev rejimini ishlating va Docker ga kamida **6 GB**
>   ajrating (yoki `npm run dev` ni host da ishga tushiring).

---

## Demo hisoblar

Seed har bir rol uchun hisob yaratadi. **Parol barchasida bir xil: `Demo!2026`**

| Rol                     | Login              | Nimani ko'radi                        |
| ----------------------- | ------------------ | ------------------------------------- |
| Super administrator     | `admin@qdu.uz`     | Tizim sozlamalari, audit, rollar      |
| Muassasa administratori | `rector@qdu.uz`    | Tuzilma, o'quv yili, foydalanuvchilar |
| Dekanat                 | `dekan@qdu.uz`     | Fakultet analitikasi, tasdiqlash      |
| Kafedra mudiri          | `mudir@qdu.uz`     | Kafedra kurslari, sillabus tasdig'i   |
| Metodist                | `metodist@qdu.uz`  | O'UM, sillabus konstruktori           |
| O'qituvchi              | `oqituvchi@qdu.uz` | Kurs, kontent, test, baholash         |
| Tyutor                  | `tyutor@qdu.uz`    | Guruh monitoringi, davomat            |
| Talaba                  | `talaba@qdu.uz`    | Kurslar, topshiriq, test, baho        |
| Tashqi ekspert          | `ekspert@qdu.uz`   | Faqat o'qish + baholash               |

Demo ma'lumotlar hajmi: **3 fakultet, 7 kafedra, 44 guruh, 251 foydalanuvchi
(23 o'qituvchi, 221 talaba), 16 fan, 17 kurs, 72 dars, 9 turdagi savol.**

---

## Loyiha tuzilishi

```
qdu-lms/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── prisma/             # sxema, migratsiyalar, seed
│   │   └── src/
│   │       ├── common/         # infratuzilma: auth, kesh, navbat, saqlash
│   │       ├── config/         # muhit o'zgaruvchilari validatsiyasi
│   │       ├── modules/        # domen modullari (F-01 ... F-17)
│   │       └── workers/        # BullMQ ishlovchilari
│   └── web/                    # Next.js 15 frontend
│       ├── messages/           # 4 tildagi kataloglar
│       ├── e2e/                # Playwright testlari
│       └── src/
│           ├── app/[locale]/   # sahifalar (App Router)
│           ├── components/     # UI va layout
│           └── lib/            # API mijozi, holat, utilitalar
├── packages/shared/            # zod sxemalari, RBAC, domen qoidalari
├── infra/                      # Nginx, PostgreSQL init
├── scripts/                    # smoke, i18n va TODO tekshiruvlari
└── docs/                       # arxitektura va qo'llanmalar
```

**Asosiy printsip:** kontraktlar (`packages/shared`) yagona manbada — backend ham,
frontend ham bir xil zod sxemalari va ruxsat mantig'idan foydalanadi.

---

## Buyruqlar

| Buyruq                    | Vazifasi                                           |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | API va web ni hot-reload bilan ishga tushirish     |
| `npm run build`           | Barcha paketlarni qurish                           |
| `npm run verify`          | Format + lint + tiplar + TODO + i18n + testlar     |
| `npm test`                | Unit testlar (248 ta: shared, API, web)            |
| `npm run test:cov`        | Qamrov bilan (chegara: 70%)                        |
| `npm run test:e2e`        | Playwright e2e testlari (43 ta)                    |
| `npm run db:migrate`      | Yangi migratsiya yaratish                          |
| `npm run db:deploy`       | Migratsiyalarni qo'llash                           |
| `npm run db:seed`         | Demo ma'lumotlarni yuklash                         |
| `npm run db:reset`        | Bazani tozalab qayta yaratish                      |
| `npm run openapi`         | OpenAPI 3.1 spetsifikatsiyasini generatsiya qilish |
| `node scripts/smoke.mjs`  | Tizim uchdan-uchgacha ishlashini tekshirish        |
| `npm run check:documents` | Hujjat va sertifikat oqimi (GOST DOCX, PDF, QR)    |
| `npm run check:queues`    | Navbat oqimi: xat yuborish va sertifikat PDF       |

---

## Amalga oshirilgan modullar

| Kod  | Modul                                                             | Holat |
| ---- | ----------------------------------------------------------------- | ----- |
| F-01 | Autentifikatsiya, 2FA, OTP, sessiya rotatsiyasi                   | ✅    |
| F-02 | Tashkiliy tuzilma, o'quv yili, semestr                            | ✅    |
| F-03 | O'quv reja, fan kartasi, sillabus versiyalash                     | ✅    |
| F-04 | Kurs konstruktori, tartiblash, nusxalash                          | ✅    |
| F-05 | Kontent, SCORM 1.2/2004, xAPI, HLS transkodlash                   | ✅    |
| F-06 | Topshiriq, rubrika, peer-review, plagiat tekshiruvi               | ✅    |
| F-07 | Savollar banki (10 tur), test, item analysis, proctoring hooklari | ✅    |
| F-08 | JN/ON/YN baholash, GPA, transkript, reyting                       | ✅    |
| F-09 | Dars jadvali, davomat, QR/geo belgilash                           | ✅    |
| F-10 | E'lon, forum, xabar, bildirishnoma (4 kanal)                      | ✅    |
| F-11 | Virtual sinf (Jitsi/BBB), avtomatik davomat                       | ✅    |
| F-12 | Sertifikat, PDF + QR verifikatsiya                                | ✅    |
| F-13 | Analitika, dinamika, early-warning                                | ✅    |
| F-14 | GOST 7.32 hujjatlar (DOCX/XLSX), e-imzo interfeysi                | ✅    |
| F-15 | Gamifikatsiya: badge, XP, reyting                                 | ✅    |
| F-16 | PWA: offline kesh, background sync, push                          | ✅    |
| F-17 | Audit log, sozlamalar, feature flags                              | ✅    |
| F-18 | 4 tilli interfeys, lotin↔kirill translit                          | ✅    |

Batafsil: [`docs/01-architecture.md`](docs/01-architecture.md)

---

## Integratsiyalar

Har biri **adapter pattern** orqali — real kalitlarsiz ham tizim to'liq ishlaydi
(mock implementatsiya bilan).

| Integratsiya   | Rejim            | Sozlash                                           |
| -------------- | ---------------- | ------------------------------------------------- |
| HEMIS          | `mock` / `live`  | `HEMIS_MODE`, `HEMIS_BASE_URL`, `HEMIS_API_TOKEN` |
| One ID (SSO)   | o'chirilgan      | `ONEID_ENABLED`, `ONEID_CLIENT_ID`                |
| E-IMZO         | `mock` / `eimzo` | `SIGNATURE_PROVIDER`, `EIMZO_VERIFY_URL`          |
| SMS (Eskiz)    | `mock` / `eskiz` | `SMS_PROVIDER`, `ESKIZ_EMAIL`                     |
| Telegram bot   | o'chirilgan      | `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`          |
| To'lov (Payme) | `mock` / `payme` | `PAYMENT_PROVIDER`, `PAYME_MERCHANT_ID`           |
| Virtual sinf   | `jitsi` / `bbb`  | `CLASSROOM_PROVIDER`, `JITSI_DOMAIN`              |

---

## Hujjatlar

| Hujjat                                               | Mazmuni                                                  |
| ---------------------------------------------------- | -------------------------------------------------------- |
| [`docs/00-analysis.md`](docs/00-analysis.md)         | Talablar tahlili, 30 ta taxmin, risk registri            |
| [`docs/01-architecture.md`](docs/01-architecture.md) | C4, ERD, 15 ta ADR, API konvensiyalari                   |
| [`docs/admin-guide.md`](docs/admin-guide.md)         | Administrator qo'llanmasi                                |
| [`docs/teacher-guide.md`](docs/teacher-guide.md)     | O'qituvchi qo'llanmasi                                   |
| [`docs/student-guide.md`](docs/student-guide.md)     | Talaba qo'llanmasi                                       |
| [`docs/deploy.md`](docs/deploy.md)                   | Deploy, zaxira nusxa, monitoring                         |
| [`docs/progress.md`](docs/progress.md)               | Bajarilgan ishlar va holat                               |
| `apps/api/openapi.json`                              | OpenAPI 3.1 spetsifikatsiyasi (155 yo`l, 176 operatsiya) |

---

## Xavfsizlik

- Parollar: **Argon2id** (OWASP 2021 parametrlari)
- Sessiya: qisqa muddatli JWT + refresh rotatsiyasi va **reuse detection**
- Ruxsatlar: **RBAC + ABAC**, deklarativ matritsa, kodda rol tekshiruvi yo'q
- Kontent: server tomonida **DOMPurify** sanitizatsiyasi + CSP sarlavhalari
- Fayllar: MIME **va magic bytes** tekshiruvi, karantin holati
- Audit: barcha o'zgarishlar, baza triggeri bilan himoyalangan (append-only)
- Sirlar: faqat muhit o'zgaruvchilarida; CI da kodga tushib qolgani tekshiriladi

Batafsil: `docs/01-architecture.md` §5–6 va `promt.md` §11.

---

## Litsenziya

MIT
