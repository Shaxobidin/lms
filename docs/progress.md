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
| B5      | Domen modullari F-01 … F-18                | ✅    | 182 endpoint, 214 operatsiya (OpenAPI 3.1)              |
| B6      | Frontend: layout, sahifalar, dizayn tizimi | ✅    | Next.js 15 App Router, 4 til, dark mode                 |
| B7      | Standartlar: SCORM, xAPI, GOST             | ✅    | SCORM RTE, xAPI LRS, DOCX/XLSX GOST 7.32                |
| B8      | Integratsiyalar (adapter + mock)           | ✅    | HEMIS, One ID, E-IMZO, SMS, Telegram, BBB/Jitsi, to'lov |
| B9      | Testlar va sifat nazorati                  | ✅    | 256 unit + 48 e2e + 35 smoke + 44 oqim, qamrov 85.55%   |
| B10     | Hujjatlar, deploy, yakuniy tekshiruv       | ✅    | 7 ta hujjat (o'zbekcha), `docker compose up`            |

---

## 2. O'lchangan ko'rsatkichlar

| Ko'rsatkich                          | Qiymat                                                               | Talab             |
| ------------------------------------ | -------------------------------------------------------------------- | ----------------- |
| Unit testlar (shared)                | 85 ✅                                                                | —                 |
| Unit/integratsion testlar (API)      | 184 ✅                                                               | —                 |
| Unit testlar (web)                   | 25 ✅                                                                | —                 |
| Qamrov (statements)                  | **85.55%**                                                           | ≥ 70%             |
| Qamrov (functions / lines)           | 87.27% / 86.74%                                                      | ≥ 70%             |
| E2E testlar (Playwright)             | **110** ✅ (9 spec; 1 tasi loyihalangan holatda o'tkazib yuboriladi) | —                 |
| Smoke tekshiruvlari                  | **35/35** ✅                                                         | —                 |
| i18n to'liqligi                      | 4 til × 1 435 kalit = **5 740** qiymat                               | 0 ta yetishmovchi |
| OpenAPI                              | 198 yo'l, 234 operatsiya                                             | 3.1               |
| Lighthouse Performance (ochiq)       | **100**                                                              | ≥ 85              |
| Lighthouse Accessibility (ochiq)     | **100**                                                              | ≥ 95              |
| Lighthouse Best Practices            | **100**                                                              | —                 |
| axe-core WCAG 2.1 AA (10 sahifa)     | **0 buzilish** (yorug' va qorong'i)                                  | 0                 |
| LCP (eng yomon, autentifikatsiyali)  | **424 ms**                                                           | < 2500 ms         |
| ESLint                               | **0 muammo**                                                         | 0                 |
| TODO/FIXME markerlari                | **0**                                                                | 0                 |
| Docker (prod) — ilova xotirasi       | ~300 MB (api+web+worker)                                             | —                 |
| Hujjat oqimi tekshiruvi              | **13/13** ✅                                                         | —                 |
| Navbat oqimi tekshiruvi              | **8/8** ✅                                                           | —                 |
| Kurs konstruktori tekshiruvi         | **37/37** ✅                                                         | —                 |
| Uzilishlar tekshiruvi (`check:gaps`) | **203/203** ✅ (§3b–§3p)                                             | —                 |
| API p95 (60 VU, 1 instansiya)        | **258 ms**                                                           | < 300 ms (NF-01)  |
| Tezlik (60 VU, 1 instansiya)         | **319 RPS**                                                          | —                 |
| Gorizontal masshtablanish            | 1→2 instansiya: 258 → **344 RPS**                                    | §5 (stateless)    |

> **Lighthouse va autentifikatsiya:** Lighthouse har navigatsiyada yangi brauzer
> konteksti ochadi, shu sababli `httpOnly` refresh cookie yo'qoladi va sahifa
> kirish sahifasiga qaytadi (bu ADR-005 ning kutilgan oqibati, xatolik emas).
> Shuning uchun ichki sahifalar Lighthouse ning Accessibility kategoriyasi
> asosidagi **axe-core** dvigateli bilan to'g'ridan-to'g'ri o'lchandi, LCP esa
> brauzerning `PerformanceObserver` idan olindi.

---

## 3. Ushbu bosqichda topilgan va tuzatilgan kamchiliklar

Testlar va o'lchovlar **haqiqiy** nuqsonlarni ochdi — hammasi tuzatildi:

| #   | Kamchilik                                                                                         | Qanday topildi                    | Tuzatish                                              |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 1   | `buildAttemptPayload` urinish egasini tekshirmasdi (xavfsizlik)                                   | ESLint (foydalanilmagan `userId`) | `findFirst({ id, userId })`                           |
| 2   | Kirish sahifasidagi "Parolni unutdingizmi?" 404 beruvchi havola                                   | Lighthouse tarmoq jurnali         | `/forgot-password` va `/reset-password` yaratildi     |
| 3   | Skip-link nishoni fokuslanmas edi (WCAG 2.4.1)                                                    | Lighthouse a11y                   | `<main id="main-content" tabIndex={-1}>`              |
| 4   | Sarlavhalar ketma-ketligi buzilardi (h1 → h3)                                                     | Lighthouse a11y                   | `CardTitle` standart darajasi `h2`                    |
| 5   | `--warning` yorug' rejimda AA dan past (3.65:1)                                                   | axe-core                          | Yorqinlik 38% → 30% (5.14:1)                          |
| 6   | `--destructive` qorong'i rejimda AA dan past (4.42:1)                                             | axe-core                          | Yorqinlik 62% → 70% (5.55:1)                          |
| 7   | `Alert` ichidagi `opacity-90` kontrastni pasaytirardi                                             | axe-core                          | Olib tashlandi                                        |
| 8   | Anonim foydalanuvchida har yuklanishda keraksiz 401 `/auth/refresh`                               | Lighthouse konsol jurnali         | `lms_session` belgi-cookie (sirsiz)                   |
| 9   | E2E testlar 3 joyda jimgina `skip` qilardi                                                        | JSON hisobot tahlili              | Kutish + qat'iy assertion ga almashtirildi            |
| 10  | `vitest` web da Playwright fayllarini yuklab yiqilardi                                            | `npm run verify`                  | `vitest.config.ts` + 25 ta frontend testi             |
| 11  | Docker dev rejimida `nest start` `dist/main` ni qidirardi                                         | `docker compose up`               | `apps/api/nest-cli.json` (`entryFile`)                |
| 12  | `.env` dagi host porti (`REDIS_PORT=56379`) konteynerga o'tib ketardi                             | `docker compose up`               | Compose da ichki port qadaldi (`6379`)                |
| 13  | Dev target da 3 ta watcher ~2.5 GB olib, `web` `ENOMEM` bilan yiqilardi                           | `docker compose up`               | Hujjatlashtirildi + prod target tavsiya etiladi       |
| 14  | `certificate.issue` va `integration.hemis.sync` ishlovchisi yo'q navbatga tushardi                | Konteynerda sertifikat berish     | Ish turi ishlovchisi turgan navbatga bog'landi        |
| 15  | `email.send` / `sms.send` / `telegram.send` navbatlarida iste'molchi yo'q edi                     | Navbat xaritasi tahlili           | `channel.worker.ts` — 3 ta yangi ishlovchi            |
| 16  | Presigned havola ichki manzil (`minio:9000`) bilan imzolanardi                                    | Fayl yuklab olish                 | Imzolash uchun `MEDIA_PUBLIC_URL` li alohida mijoz    |
| 17  | `params` shablonga qarab tekshirilmasdi — worker ichida Prisma xatosi                             | Hujjat generatsiyasi              | `generateDocumentSchema.superRefine` (§8)             |
| 18  | `PROTOCOL` va `SYLLABUS` shablonlari e'lon qilingan, ammo yozilmagan                              | Barcha shablonlarni sinash        | Ikkala DOCX quruvchisi yozildi (§16)                  |
| 19  | 83 ta API xatolik kalitidan 40 tasining tarjimasi yo'q edi                                        | API/katalog solishtiruvi          | 40 kalit x 4 til + tekshiruvchiga yangi qoida         |
| 20  | `GET /certificates/templates` yo'q edi — `templateId` ni bilib bo'lmasdi                          | Sertifikat berish oqimi           | Endpoint qo'shildi                                    |
| 21  | Rolga qarab rate limit AMALDA ishlamasdi: `checkApi` hech qayerdan chaqirilmasdi                  | Yuk sinoviga tayyorgarlik         | `RateLimitGuard` + 8 ta test (§8)                     |
| 22  | Kurs tuzilmasini UI dan boshqarib bo'lmasdi: modul/mavzu yaratish, tahrirlash, o'chirish yo'q edi | Kurs konstruktori talabi          | 7 endpoint + konstruktor UI + dars muharriri          |
| 23  | Soft delete ichma-ich munosabatlarga qo'llanmasdi — o'chirilgan modul tuzilmada ko'rinardi        | `check:builder`                   | Prisma kengaytmasida nested filtr                     |
| 24  | `findUnique` soft delete ni tekshirmasdi — o'chirilgan dars ochilaverardi                         | `check:builder`                   | Natijani qaytargandan keyin tekshirish                |
| 25  | `module`, `topic`, `resource` uchun ABAC resolver yo'q edi                                        | Yangi endpointlarni yozishda      | 3 ta scope resolver — begona kursga tegib bo'lmaydi   |
| 26  | `common.title` kaliti yo'q edi; tekshiruvchi UI kalitlarini ko'rmasdi                             | Konstruktor e2e testi             | Kalit qo'shildi + tekshiruvga uchinchi qoida          |
| 27  | Kurs elementlarini qo'shishning yagona joyi yo'q edi                                              | Moodle uslubidagi talab           | Element tanlash oynasi: 15 tur, qidiruv, toifalar     |
| 28  | `TEXT`, `H5P` turlari enum da bor edi, lekin ularni yaratib bo'lmasdi                             | Barcha turlarni sinashda          | Turga qarab validatsiya + `FOLDER`, `EMBED` qo'shildi |
| 29  | `progress.md` da B7 "LTI, QTI" ✅ deb turardi — ular yozilmagan                                   | Element ro'yxatini tuzishda       | Da'vo aniqlashtirildi, hujjatga izoh qo'shildi        |

---

## 3a. Baholash va savollar banki interfeysi (2026-09-05)

`promt.md` bo'yicha o'tkazilgan tahlil backend va interfeys o'rtasidagi eng
katta uzilishni ko'rsatdi: 183 API operatsiyasiga qarshi web'da atigi 31 ta
yozuv amali bor edi. §15 ning 3-mezoni ("o'qituvchi ... test tuzib, talabani
baholay oladi") faqat API darajasida qoplangan, interfeys orqali esa
bajarilmas edi. Quyidagilar yozildi:

| Yo'l                          | Nima qiladi                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `/assignments/[assignmentId]` | Baholash ish o'rni: rubrika, ishlar jadvali, navbat bilan baholash   |
| `/question-banks`             | Banklar ro'yxati va yangi bank yaratish                              |
| `/question-banks/[bankId]`    | Bankdagi savollar, filtrlar, item analysis, savol muharriri (10 tur) |
| `/quizzes/[quizId]/questions` | Test konstruktori: bankdan savol biriktirish, tartib, ball, pool teg |
| `/courses/[courseId]/rubrics` | Rubrika muharriri: mezonlar, darajalar, qulflash, o'chirish          |

Yangi komponentlar: `components/grading/submission-grader.tsx`,
`components/grading/rubric-editor.tsx`, `components/questions/question-editor.tsx`,
`components/questions/payload-editors.tsx`.

Topshiriq yaratish formasiga rubrika tanlash qo'shildi — ilgari interfeys orqali
yaratilgan topshiriqqa rubrikani umuman biriktirib bo'lmasdi, ya'ni baholash
oynasidagi rubrika yo'li faqat API orqali yaratilgan topshiriqda ishlardi.

Interfeys uchun yetishmagan endpointlar qo'shildi:

| Endpoint                     | Sabab                                                     |
| ---------------------------- | --------------------------------------------------------- |
| `GET /assignments/:id`       | Baholash ish o'rniga rubrika mezonlari kerak              |
| `GET /quizzes/:id/questions` | Konstruktorga testning joriy tarkibi va qulf holati kerak |
| `PATCH /rubrics/:id`         | Rubrikani tahrirlash (ilgari faqat yaratish mumkin edi)   |
| `DELETE /rubrics/:id`        | Ishlatilmagan rubrikani mantiqiy o'chirish                |

`GET /courses/:id/rubrics` kengaytirildi: har bir rubrika bilan `locked`
(mezonlar bo'yicha ball qo'yilganmi) va `_count.assignments` qaytariladi —
interfeys shu ikki qiymatga qarab tahrirlash va o'chirishni cheklaydi.

Rubrika yaxlitligi qoidalari (server ham, interfeys ham qo'llaydi):

| Holat                             | Ruxsat                                            |
| --------------------------------- | ------------------------------------------------- |
| Mezon bo'yicha ball qo'yilgan     | Faqat nom va tavsif (`errors.rubric_has_grades`)  |
| Rubrika topshiriqqa biriktirilgan | O'chirib bo'lmaydi (`errors.rubric_in_use`)       |
| Mezon ro'yxatdan chiqarilgan      | Mantiqiy o'chiriladi — qo'yilgan ballar saqlanadi |

Tekshiruv natijalari:

| Tekshiruv                              | Natija            |
| -------------------------------------- | ----------------- |
| `npm run check:grading` (yangi skript) | **52/52** ✅      |
| `apps/web/e2e/grading.spec.ts` (yangi) | **18/18** ✅      |
| To'liq e2e to'plami                    | 64/65 (quyida)    |
| `npm run verify`                       | ✅                |
| i18n                                   | 4 til x 853 kalit |
| OpenAPI                                | 160 yo'l, 187 op  |

E2E testlar seed'da tasodifan mavjud yozuvlarga tayanmaydi: `e2e/fixtures.ts`
har bir bo'lim uchun kerakli holatni API orqali oldindan yaratadi, shu sababli
bitta ham test jimgina `skip` bo'lmaydi.

## 3b. Forum, davomat va kursga yozilish (2026-09-05)

Tahlildagi uzilishlarning yana uchtasi yopildi. Uchala modul ham backendda
tayyor edi — faqat interfeys yo'q edi.

| Yo'l                                   | Nima qiladi                                                             |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `/courses/[courseId]/forum`            | Mavzular ro'yxati, yangi mavzu (savol rejimi bilan)                     |
| `/courses/[courseId]/forum/[threadId]` | Ichma-ich javoblar daraxti, javob yozish, eng yaxshi javob, moderatsiya |
| `/attendance/[sessionId]`              | Davomat jurnali: guruh ro'yxati, 4 holat, izoh, ommaviy belgilash       |
| `/attendance` (kengaytirildi)          | Yaqin darslar ro'yxati — jurnalga kirish nuqtasi                        |
| `/courses` (kengaytirildi)             | Talaba uchun "Yozilish" tugmasi va "Yozilgansiz" belgisi                |

Backendga bitta endpoint qo'shildi va bittasi kengaytirildi:

| O'zgarish                        | Sabab                                                     |
| -------------------------------- | --------------------------------------------------------- |
| `GET /class-sessions/:id/roster` | Jurnalga guruh ro'yxati va MAVJUD belgilar kerak          |
| `GET /courses` → `enrollments`   | Katalogda "Yozilish" yoki "Yozilgansiz" ni ajratish uchun |

Roster talabalarni sessiyaning GURUHIDAN oladi (kursga yozilganlardan emas):
bir kursni bir necha guruh o'qiydi, davomat esa guruh jadvaliga bog'langan.

### Ruxsat modeli haqida topilgan nozik joy

O'zini kursga yozish tugmasi dastlab `can('enrollment:create:own')` bilan
boshqarilgan edi va O'QITUVCHIGA ham chiqib qolgandi: `SCOPE_RANK` da
`own_course` (3) `own` (4) dan keng, shuning uchun `hasPermission` uni
qanoatlantiradi. Ammo o'qituvchining `enrollment:create:own_course` ruxsati
BOSHQALARNI o'z kursiga yozish uchun. Shu sababli tugma `hasRole('STUDENT')`
bilan chegaralandi (§3, R8) — ruxsat matritsasi o'zgartirilmadi.

Tekshiruv natijalari:

| Tekshiruv                           | Natija            |
| ----------------------------------- | ----------------- |
| `npm run check:gaps` (yangi)        | **26/26** ✅      |
| `apps/web/e2e/gaps.spec.ts` (yangi) | **12/12** ✅      |
| `npm run verify`                    | ✅                |
| i18n                                | 4 til x 890 kalit |
| OpenAPI                             | 161 yo'l, 188 op  |

## 3c. Shaxsiy xabar yuborish (2026-09-06)

`/messages` sahifasi ilgari faqat kiruvchi/chiquvchi qutini ko'rsatar va
"o'qildi" belgisini qo'yardi — xabar YOZISH imkoni yo'q edi (i18n kalitlari
`messaging.compose`, `recipient`, `subject` katalogda turgan, ya'ni interfeys
rejalashtirilgan-u yozilmagan).

Qo'shildi:

- **Yangi xabar** oynasi — qabul qiluvchi, mavzu, matn;
- kiruvchi xabarda **Javob berish** — qabul qiluvchi tayyor va o'zgartirilmaydi,
  `replyToId` bilan bog'lanadi;
- yuborilgach "Yuborilgan" qutisi ochiladi.

### Kimga yozish mumkin — `GET /messages/contacts`

Qabul qiluvchini tanlash uchun foydalanuvchilar ro'yxati kerak, ammo global
`GET /users` faqat administrativ rollarda ochiq va shunday qolishi shart (§11):
aks holda har qanday talaba butun universitet ro'yxatini yig'ib olardi.

Yangi endpoint doirani UMUMIY KURSDAN chiqaradi:

| Kim        | Kimni ko'radi                                                     |
| ---------- | ----------------------------------------------------------------- |
| Talaba     | O'zi yozilgan kurslarning o'qituvchilari                          |
| O'qituvchi | O'z kurslariga yozilgan talabalar va o'sha kurslardagi hamkasblar |
| Tyutor     | Kurator bo'lgan guruh a'zolari                                    |

Ro'yxat 100 ta bilan cheklangan, familiya bo'yicha tartiblanadi, `search`
parametri ism/familiya bo'yicha filtrlaydi. `check-gaps.mjs` §4 buni ikki
tomondan tasdiqlaydi: talabaning kontaktlari administrator ko'radigan
ro'yxatdan ancha kam (6 / 100+) va umumiy kursi yo'q administrator ro'yxatda
yo'q.

Tekshiruv natijalari:

| Tekshiruv                   | Natija            |
| --------------------------- | ----------------- |
| `npm run check:gaps`        | **38/38** ✅      |
| `apps/web/e2e/gaps.spec.ts` | **15/15** ✅      |
| `npm run verify`            | ✅                |
| i18n                        | 4 til x 893 kalit |
| OpenAPI                     | 162 yo'l, 189 op  |

## 3d. Sertifikat berish (2026-09-06)

`/certificates` sahifasi ilgari faqat reestrni ko'rsatar va PDF yuklab
berardi. Qo'shildi: **Sertifikat berish** oynasi (kurs, shablon, "tugatgan
hammaga" yoki tanlangan talabalar, amal muddati), reestrda **egasi** ustuni va
kurs/holat filtrlari, dekanat uchun **bekor qilish** (sabab majburiy), PDF
tayyor bo'lguncha reestrning avtomatik yangilanishi.

### Topilgan va tuzatilgan ikki nuqson

**1. O'qituvchi sertifikat bera olar, lekin reestrga 403 olardi.**
`GET /certificates/registry` faqat `certificate:read:*` ruxsatlarini qabul
qilar, o'qituvchida esa faqat `certificate:create:own_course` bor. Ya'ni berish
oqimi ko'r edi: o'qituvchi bergan sertifikatini hech qachon ko'rmasdi. Endi
endpoint `create:own_course` ni ham qabul qiladi va natijani o'qituvchining
`scope.courseIds` doirasiga toraytiradi; begona kurs so'ralsa bo'sh ro'yxat.
Ruxsat matritsasi o'zgartirilmadi.

**2. `POST /certificates/issue` aniq `userIds` bilan yozilishni tekshirmasdi.**
Foydalanuvchi identifikatorini bilgan har kimga sertifikat berib bo'lardi —
reestrning ishonchliligi uchun bu qabul qilib bo'lmas holat (§16). Endi
ko'rsatilgan talabalar kursga yozilgan (va chiqib ketmagan) bo'lishi shart,
aks holda `errors.certificate_not_enrolled`.

### UX nuqsoni: bir dialogda ikkita "Bekor qilish"

`common.cancel` ham, `certificates.revoke` ham "Bekor qilish" — bekor qilish
oynasida ikkala tugma bir xil o'qilar edi (e2e buni strict-mode xatosi bilan
topdi). Tasdiqlash tugmasi uchun `certificates.revokeConfirm`
("Sertifikatni bekor qilish") kiritildi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                        |
| --------------------------- | ----------------------------- |
| `npm run check:gaps`        | **51/51** ✅ (+13 sertifikat) |
| `apps/web/e2e/gaps.spec.ts` | **19/19** ✅ (+4)             |
| `npm run verify`            | ✅                            |
| i18n                        | 4 til x 912 kalit             |
| OpenAPI                     | 162 yo'l, 189 op              |

## 3e. Sillabus konstruktori va tasdiqlash oqimi (2026-09-06)

`/curriculum` sahifasi ilgari fanlar va o'quv rejalar ro'yxatini ko'rsatar,
sillabusga esa yo'l yo'q edi — F-03 ning "O'UM konstruktori, versiyalash va
tasdiqlash oqimi" qismi faqat API da yashardi.

| Yo'l                                        | Nima qiladi                                                        |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `/curriculum` (kengaytirildi)               | Har bir fan qatorida **Sillabusni ochish / yaratish** havolasi     |
| `/curriculum/subjects/[subjectId]/syllabus` | Mazmun, baholash siyosati, versiyalar tarixi, oqim tugmalari       |
| `components/curriculum/syllabus-editor.tsx` | Konstruktor: 6 bo'lim, jonli soat/og'irlik hisobi, zod validatsiya |

Konstruktor ikki rejimda ishlaydi: yaratish (`POST /syllabi`) va yangi versiya
(`POST /syllabi/:id/versions`, oldingi mazmun bilan ochiladi). Oqim tugmalari
holat mashinasi (`TRANSITIONS`) va ruxsatga qarab chiqadi:
DRAFT/REJECTED → _yuborish_, REVIEW → _tasdiqlash/qaytarish_, APPROVED →
_arxivlash_; REVIEW holatida "yangi versiya" yashiriladi — u ko'rib chiqishni
bekor qilib qoralamaga qaytarardi.

### Tuzatilgan nuqson: metodist o'z sillabusini o'zi tasdiqlay olardi

`POST /syllabi/:id/transition` marshruti `syllabus:update:own_faculty` ni ham
qabul qiladi (metodistga SUBMIT uchun kerak), ammo holat mashinasi amal turini
rolga bog'lamas edi — o'sha ruxsat bilan APPROVE ham o'tardi. Bu §3 dagi
vazifalar ajratilishiga (R5 yozadi, R4/R3 tasdiqlaydi) zid. Endi APPROVE/REJECT
uchun `syllabus:approve:*` talab qilinadi (`errors.syllabus_approval_forbidden`);
ruxsat matritsasi o'zgartirilmadi.

### Kuzatuv (2026-09-06 da tuzatildi, §3n): dekanat fanlar ro'yxatini ko'ra olmaydi

Dekanatda `syllabus:approve:own_faculty` bor, lekin `subject:read:*` yo'q —
`GET /subjects` 403 qaytaradi, demak dekanat sillabusga interfeys orqali yetib
bora olmaydi. Oqim kafedra mudiri orqali to'liq yopiladi; dekanat yo'li uchun
`listSubjects` scope mantig'i kengaytirilishi kerak. Ruxsat matritsasi masalasi
bo'lgani uchun alohida qaror talab qiladi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                      |
| --------------------------- | --------------------------- |
| `npm run check:gaps`        | **66/66** ✅ (+15 sillabus) |
| `apps/web/e2e/gaps.spec.ts` | **22/22** ✅ (+3)           |
| `npm run verify`            | ✅                          |
| i18n                        | 4 til x 938 kalit           |

E2E fikstura umumiy kafedrada **yangi fan + DRAFT sillabus** yaratadi: seed
fanlari boshqa ishga tushirishlar tomonidan REVIEW da qolgan bo'lishi yoki
mudirning kafedrasida bo'lmasligi mumkin — o'shanda tasdiqlash oqimini yopib
bo'lmasdi (birinchi versiyada aynan shu sababli ikki test yiqilgan).

## 3f. Tashkiliy tuzilma CRUD va akademik kalendar (2026-09-06)

`/structure` sahifasi ilgari faqat `/org/tree` ni ko'rsatar edi. Endi:

| Yo'l                  | Nima qiladi                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `/structure`          | Har darajada yaratish/tahrirlash; fakultetni o'chirish; guruh a'zolari va biriktirish |
| `/structure/calendar` | O'quv yillari va semestrlar: yaratish, tahrirlash, joriy deb belgilash                |

Sahifa daraxtni `/org/tree` dan emas, **tekis ro'yxatlardan** quradi: tree
keshlangan va unda dekan/mudir/kurator identifikatorlari yo'q, tahrirlash
oynalari esa aynan shularni talab qiladi. Ko'ruvchi ham, menejer ham bir xil
daraxtni ko'radi — faqat amallar ruxsatga qarab chiqadi.

Backend: 4 ta yetishmagan `PATCH` qo'shildi — `specialities/:id`, `groups/:id`
(shared'da `update*Schema` allaqachon bor edi), `academic-years/:id`,
`semesters/:id` (yangi `updateAcademicYearSchema` / `updateSemesterSchema`;
`create*` sxemalari `.refine()` bilan o'ralgani uchun `.partial()` ishlamaydi —
maydonlar aniq sanab o'tildi). Joriy yil/semestr almashganda oldingisi
tranzaksiya ichida olib tashlanadi — yaratishdagi qoida bilan bir xil.

### Topilma: demo `admin@qdu.uz` tuzilmani boshqara olmaydi

`admin@qdu.uz` — SUPER_ADMIN; `faculty:manage:all` va boshqa `*:manage:all`
ruxsatlari INSTITUTION_ADMIN da (`rector@qdu.uz`). Bu §3 ga mos (R1 tizim
konfiguratsiyasi, R2 tashkiliy tuzilma), lekin `docs/admin-guide.md` §2 buni
aytmas edi — endi aytadi. Interfeys ham shunga qarab gating qiladi.

### Muhit topilmasi: `docker restart` compose'dagi yangi volume'ni qo'llamaydi

`shared/dist` mounti compose'ga avval qo'shilgan edi, ammo konteyner faqat
`restart` qilingan — mountlar ro'yxatida `dist` yo'q edi va yangi
`updateSemesterSchema` konteynerda `undefined` bo'lib, PATCH 500 qaytardi
(`ZodValidationPipe … reading 'parse'`). Volume o'zgarishi uchun
`docker compose up -d api` (qayta yaratish) kerak — bu `docs/progress.md` dagi
avvalgi izohga qo'shildi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                      |
| --------------------------- | --------------------------- |
| `npm run check:gaps`        | 85/85 ✅ (19 ta yangi)      |
| `apps/web/e2e/gaps.spec.ts` | 26/26 ✅ (4 ta yangi)       |
| `npm run verify`            | ✅                          |
| i18n                        | 4 til x 987 kalit           |
| OpenAPI                     | 166 yo'l, 193 op (+4 PATCH) |

## 3g. Savollar importi (QTI 3.0, AIKEN, GIFT, CSV) va LTI 1.3 Tool Provider (2026-09-06)

`importQuestionsSchema` shu paytgacha hech qayerda ishlatilmas edi; §10 dagi
LTI 1.3 umuman yo'q edi. Endi:

| Yo'l                                      | Kim           | Nima qiladi                                                        |
| ----------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `POST /questions/import`                  | o'qituvchi    | `dryRun` — tahlil va oldindan ko'rish; aks holda bankka yozish     |
| `GET /lti/jwks`                           | ochiq         | Tool ochiq kalitlari                                               |
| `GET/POST /lti/login`                     | platforma     | OIDC login initiation → platformaga `state`/`nonce` bilan          |
| `POST /lti/launch`                        | platforma     | `id_token` tekshiruvi, foydalanuvchi, sessiya, kursga yo'naltirish |
| `GET/POST/PATCH/DELETE /lti/platforms`    | SUPER_ADMIN   | Platformalar ro'yxati (INSTITUTION_ADMIN faqat o'qiydi)            |
| `/question-banks/[id]` → "Fayldan import" | o'qituvchi    | Ikki bosqichli oyna: tahlil → tasdiqlash                           |
| `/admin/lti`                              | administrator | Tool manzillari (nusxalash) va platformalar CRUD                   |

Qarorlar:

- **Matnli tahlilchilar `@lms/shared` da** (`import/question-formats.ts`) — sof
  funksiyalar, vitest bilan 8 ta test; **QTI tahlilchisi backend'da**
  (`qti-parser.ts`, `fast-xml-parser` `preserveOrder` rejimida) — XML kutubxonasi
  frontend'ga kirmaydi. QTI 3.0 (`qti-choice-interaction`) va 2.x
  (`choiceInteraction`) nomlari bitta ko'rinishga normallashtiriladi — bitta kod yo'li.
- Har bir tahlil natijasi bazaga tushishdan oldin `questionPayloadSchema` dan
  o'tkaziladi — tahlilchi xatosi noto'g'ri payload'ni bazaga o'tkaza olmaydi.
  Muammolar yutilmaydi: qator/item raqami va `import.*` kaliti bilan qaytadi (§16).
- LTI: `state` va `nonce` Redis'da **bir martalik** (takroriy launch 422),
  cookie bo'lsa qo'shimcha brauzer bog'lanishi; `id_token` RS256 imzosi Node
  `crypto` bilan tekshiriladi (qo'shimcha kutubxona yo'q). Platforma kaliti —
  JWKS URL (1 soat kesh, `kid` topilmasa qayta yuklash) yoki qo'lda JWKS.
- Foydalanuvchi: `sub` bog'lanishi → email → yangi hisob (Instructor → TEACHER,
  aks holda STUDENT). O'qituvchiga kursga huquq **avtomatik berilmaydi**;
  talaba `custom.course_id` bo'lsa yoziladi.
- Auth cookie'lari `common/auth/auth-cookies.ts` ga chiqarildi — login va LTI
  launch bir xil qoidani ishlatadi; `AuthService.loginExternal` parolsiz sessiya ochadi.

### Topilmalar

- **ICU qavslar i18n matnlarida.** GIFT sintaksisini tushuntiruvchi matnda
  `{ =to'g'ri ~noto'g'ri }` yozilgan edi — `next-intl` uni argument deb o'qib,
  butun sahifani buzdi (e2e ushladi). Qoida: tarjima matnida literal `{ }`
  ishlatilmaydi. Shu sababli `import.gift_braces_missing` ham qayta yozildi.
- `prisma migrate deploy` host'da `dotenv` siz ishlamaydi (`npm run db:deploy`
  ishlating); konteynerda `apps/api/prisma` mount qilinmagan — yangi sxema uchun
  `docker cp` + `prisma generate` + restart kerak.
- INSTITUTION_ADMIN da `integration:read:all` bor: LTI ro'yxatini ko'radi, ammo
  yarata olmaydi — tekshiruv shunga moslandi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                                     |
| --------------------------- | ------------------------------------------ |
| `npm run check:gaps`        | 107/107 ✅ (22 ta yangi: import 8, LTI 14) |
| `apps/web/e2e/gaps.spec.ts` | 28/28 ✅ (2 ta yangi)                      |
| `npm run verify`            | ✅ — jest 166, vitest +8, i18n 4 × 1070    |
| OpenAPI                     | 172 yo'l, 202 op (+6 yo'l, +9 op)          |

## 3h. IMS Common Cartridge import (2026-09-06)

§10 ro'yxatidagi oxirgi e-learning standarti. `POST /content/cc/import`
(`dryRun` — reja) va kurs konstruktorida **"IMS CC paketidan import"** oynasi.

| CC element                          | Bizda                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| item daraxti (1/2/3+ daraja)        | Modul / Mavzu / Dars; `rooted-hierarchy` ildizi ochiladi                                    |
| `webcontent` HTML (`href`)          | Dars `contentHtml` (sanitizer), `$IMS-CC-FILEBASE$` olib tashlanadi                         |
| `webcontent` boshqa fayllar         | S3 (`putObject`) + `FileObject(READY)` + Resource PDF/VIDEO/AUDIO/FILE                      |
| `imswl_*`, `imsbasiclti_*`          | Resource LINK (`externalUrl`)                                                               |
| `imsdt_*`                           | ForumThread + birinchi ForumPost                                                            |
| `imsqti_*/assessment` (QTI **1.2**) | QuestionBank + Question[] + Quiz (topicId, `qmd_timelimit`, nashr etilmagan) + QuizQuestion |
| boshqa turlar, `question-bank`      | `skipped` ro'yxatida sabab bilan                                                            |

Qarorlar:

- Tahlil sof funksiyalarda (`cc-parser.ts`: manifest, webLink, discussion,
  basic LTI, QTI 1.2) — 5 jest test. QTI 1.2 `resprocessing` dan to'g'ri javob
  `SCORE > 0` beradigan `respcondition` lardan olinadi; `<not>` ichidagi
  `varequal` hisobga olinmaydi (multiple_response).
- Fayllar S3 ga tranzaksiyadan tashqarida yuklanadi, bazaga yozuvlar bitta
  tranzaksiyada (120 s) — yarim import qolmaydi.
- Import qo'shadi, hech narsani o'chirmaydi; modullar mavjudlardan keyin.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                   |
| --------------------------- | ------------------------ |
| `npm run check:gaps`        | 118/118 ✅ (11 ta yangi) |
| `apps/web/e2e/gaps.spec.ts` | 29/29 ✅ (1 ta yangi)    |
| `npm run verify`            | ✅                       |
| i18n                        | 4 til x 1097 kalit       |
| OpenAPI                     | 173 yo'l, 203 op (+1)    |

## 3i. Qolgan uzilishlar: LTI Advantage, QTI/CC eksport, hotspot/gapMatch, CC rasmlari (2026-09-06)

Oldingi bo'limlarda "hozircha yo'q" deb qayd etilgan to'rt narsa yopildi.

| Uzilish                        | Yechim                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CC HTML ichidagi rasmlar       | Import HTML dagi nisbiy `src/href` → paketdagi fayl `FileObject` (resurs qatorisiz), `src="/lms-file/<id>"`; mijozda `LessonHtml` id bo'yicha imzolangan havola oladi                             |
| QTI hotspot / gapMatch importi | `gapMatchInteraction` → DRAG_DROP; `hotspotInteraction` → HOTSPOT: rasm paketdan S3 ga, koordinatalar pikseldan foizga (`image-dimensions.ts` PNG/JPEG/GIF sarlavhasi)                            |
| QTI 3.0 eksport                | `POST /question-banks/:id/export` → ZIP (manifest + item + media), 10 tur; round-trip testi bizning tahlilchi bilan                                                                               |
| IMS CC eksport                 | `POST /content/cc/export` → `.imscc` (manifest, dars HTML + fayllar + inline rasmlar, weblink, QTI 1.2 test); round-trip                                                                          |
| LTI Deep Linking               | `LtiDeepLinkingRequest` → `/lti/deep-link?token` sahifasi → `POST /lti/deep-link/respond` → tool kaliti bilan imzolangan `LtiDeepLinkingResponse` (content item `custom.course_id`) → `form_post` |
| LTI AGS                        | Launch'dagi `lineitem/lineitems` saqlanadi (`LtiResourceLink`); `client_credentials` JWT assertion → token → `scores` POST; baho o'zgarganda `lti.ags.push` navbat ishi, kursda qo'lda tugma      |
| LTI NRPS                       | `context_memberships_url` → a'zolar ro'yxati; sync: talabalar uchun hisob + yozilish, o'qituvchilar yozilmaydi                                                                                    |

Qarorlar:

- Kontent fayllari xususiy — `<img src>` uchun to'g'ridan-to'g'ri URL yo'q.
  Sanitizer `data-file-id` ni saqlamaydi (DOMPurify `ALLOW_DATA_ATTR:false`),
  shuning uchun mijoz `/lms-file/<id>` manzilidan id ni oladi.
- AGS bahosi — kurs jurnalidagi barcha baholar yig'indisining foizi
  (`scoreMaximum: 100`); platformaga yolg'on baho yuborilmaydi: bahosi yo'q
  foydalanuvchi `no_grades` bilan o'tkazib yuboriladi.
- Resurs havolasi yangilanishi **qisman**: AGS/NRPS claim'siz launch oldingi
  manzillarni o'chirmaydi. O'chirilgan/faol bo'lmagan platformalar havolalari
  xizmatlarda hisobga olinmaydi (avval eski platformaning havolasi olinib,
  a'zolar noto'g'ri bog'lanardi — check-skript ushladi).
- Tekshiruv skripti host'da **soxta platforma** (`node:http`, :47123) ko'taradi;
  konteyner unga `host.docker.internal` orqali chiqadi — token so'rovi, scores
  POST, memberships va Deep Linking qaytishi haqiqiy HTTP orqali tekshiriladi.

### Topilmalar

- `LessonHtml` da React StrictMode ikki marta effekt ishga tushiradi: tugunga
  belgi qo'yib "yechilgan" deb hisoblash ikkinchi ishga tushishda rasmni
  yangilanmagan qoldirdi — belgi effekt ichidagi `WeakSet` ga ko'chirildi,
  `MutationObserver` React `innerHTML` ni qayta o'rnatganda ham yechadi.
- **ICU `<teg>`**: `lti.customParamHint` dagi `<kurs UUID>` va
  `activities.labelPlaceholder` dagi `<p>` `next-intl` da INVALID_TAG berib
  sahifani yiqitdi (brauzer konsolida topildi). `check-i18n` endi matnda
  `<teg>` va juftlanmagan `{ }` bo'lsa yiqiladi — bu sinf xatolar darvozada ushlanadi.
- Kommentdagi `*/` (`imsqti_*/assessment`) faylni buzdi — endi `imsqti_...`.
- Python heredoc orqali yozilgan regex'da `\b` boshqaruv belgisiga aylandi
  (`no-control-regex`) — skriptlar fayl sifatida yoziladi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `npm run check:gaps`        | 140/140 ✅ (22 ta yangi: rasm 2, hotspot 5, eksport 6, LTI Advantage 9) |
| `apps/web/e2e/gaps.spec.ts` | 31/31 ✅ (3 ta yangi: QTI eksport, Deep Linking, IMS CC import)         |
| `npm run verify`            | ✅ — jest 178 (qti-writer, cc-writer round-trip), i18n 4 × 1123         |
| OpenAPI                     | 181 yo'l, 211 op (+8)                                                   |

## 3j. Moodle uslubidagi muharrir va sozlamalar formalari (2026-09-06)

Foydalanuvchi talabi: kurs elementlari va testlar Moodle'dagi kabi muharrir va
sozlamalar bilan yaratilsin/tahrirlansin. Ilgari dars matni xom HTML `textarea`
edi, test/topshiriq yaratish oynasi 3–4 maydonli, tahrirlash sahifasi yo'q edi.

| Qism                                 | Nima qilindi                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/editor/rich-text-editor` | TipTap (ProseMirror) WYSIWYG: sarlavha, qalin/kursiv/tagiga/ustiga, ro'yxatlar, iqtibos, kod, tekislash, havola, **rasm (S3 ga yuklanadi, `/lms-file/<id>`)**, jadval, HTML manba; `LocalizedRichField` — 4 til yorliqlari |
| `components/ui/settings-sections`    | Moodle "Expand all" uslubidagi yig'iladigan bo'limlar                                                                                                                                                                      |
| `quiz-settings-form`                 | 8 bo'lim, `createQuizSchema`/`updateQuizSchema` bilan tekshiruv; yaratish oynasi va `/quizzes/[id]/settings` sahifasi                                                                                                      |
| `assignment-settings-form`           | 7 bo'lim (fayl turlari guruhlari, o'zaro baholash, plagiat); `/assignments/[id]/settings`                                                                                                                                  |
| Backend                              | `GET/PATCH /quizzes/:id`, `PATCH /assignments/:id` (`updateAssignmentSchema` kengaytirildi), builder select'ida `questionsPerPage`                                                                                         |
| `resource-edit-dialog`               | Mavjud resursni tahrirlash: nom, TEXT matni (muharrir, 4 til), LINK/EMBED manzili va balandligi, majburiylik; `updateResourceSchema` ga `externalUrl` qo'shildi                                                            |
| Qo'llanish joylari                   | dars muharriri, TEXT resurs, forum xabari, savol matni/izohi, test/topshiriq tavsifi; konstruktorda sahifa ajratgichlari va "Sozlamalar" havolasi                                                                          |

Qarorlar:

- `localizedRichTextSchema` endi **bo'sh bo'lishi mumkin** (refine olib tashlandi):
  tavsifsiz element yoki hali yozilmagan dars yaroqli — Moodle'dagi kabi.
  Majburiylik sarlavha (`localizedTextSchema`) da qoladi.
- Muharrir chiqishi HTML; xavfsizlik chegarasi serverda (DOMPurify) — muharrir
  "toza HTML" kafolati bermaydi va berishi shart emas.
- Rasm muharrir ichida ham `/lms-file/<id>` orqali (node view imzolangan havola
  oladi) — vaqtinchalik S3 havolasi bazaga tushmaydi.

### Topilmalar

- **Port 3000 ni boshqa loyiha egallagan.** e2e to'liq yugurishda login 404
  bo'ldi: `:3000` da `D:\python\klinika\frontend` ning Vite serveri turgan edi
  (LMS Next dev serveri yo'q). LMS web dev serveri **3100** portda ishga
  tushirildi (`next dev -p 3100`), `.env` `CORS_ORIGINS` ga `http://localhost:3100`
  qo'shildi, testlar `E2E_BASE_URL=http://localhost:3100` bilan yuritiladi.
- `docker compose up -d api` konteynerni image'dagi eski `prisma/schema.prisma`
  bilan qayta yaratadi → `prisma generate` eski klient → 33 TS xato, API
  `unhealthy`. `./apps/api/prisma` endi compose'da mount qilingan — sxema va
  migratsiyalar doim joriy.
- **`javascript:` manzil zod `url()` dan o'tar edi.** Resurs tahrirlash
  tekshiruvi `externalUrl: 'javascript:alert(1)'` ni 200 bilan qabul qilganini
  ko'rsatdi — `z.string().url()` istalgan sxemani yaroqli deb biladi. Endi
  `httpUrlSchema` (faqat `http(s)://`) resurs yaratish/tahrirlash va sillabus
  adabiyot havolalarida ishlatiladi; xato kaliti `validation.url_http_only`.
- e2e: yuklama ostida havola bosish 10 s da o'tmasa `href` bo'yicha o'tiladi
  (`clickOrNavigate`), tugma bosish server javobini kutib qayta uriniladi.

Tekshiruv natijalari:

| Tekshiruv                   | Natija                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `npm run check:gaps`        | 155/155 ✅ (9 ta sozlamalar + 6 ta resurs tahrirlash)                   |
| `apps/web/e2e/gaps.spec.ts` | 35/35 ✅ (4 ta yangi: muharrir, sozlamalar, chooser, resurs tahrirlash) |
| `npm run verify`            | ✅ — jest 178, vitest 81, i18n 4 × 1220                                 |
| OpenAPI                     | 182 yo'l, 214 op (+3)                                                   |

## 3k. AGS: har bir test/topshiriq uchun alohida line item (2026-09-06)

Ilgari AGS faqat kurs jamlanmasini (foiz) launch'da kelgan bitta `lineitem` ga
yuborardi — Moodle jurnalida bitta ustun. Endi:

| Qism                         | Nima qilindi                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `LtiLineItem` (Prisma)       | resurs havolasi × test/topshiriq → platformadagi line item manzili, yorliq, maksimal ball                      |
| `lti-services.pushUserGrade` | `activities[]` parametri: jamlanma + har bir faoliyat o'z line item'iga **xom ball** bilan                     |
| `ensureActivityLineItem`     | `lineitems` konteynerida `resourceId=quiz:<id>                                                                 | assignment:<id>`, `tag`, `label`=nom bilan yaratadi, saqlaydi |
| `grading.service`            | topshiriq bahosi ham navbatga qo'yiladi (ilgari faqat test va qo'lda baho); payload'da `quizId`/`assignmentId` |
| `pushCourseGrades`           | qo'lda push: har bir talaba uchun jamlanma + barcha faoliyat baholari                                          |
| `GET /lti/courses/:id/links` | `lineItems[]` — web panelida soni va nomlari (title)                                                           |

### Topilma: `lms-worker` eski production image bilan ishlagan

Tekshiruv birinchi yugurishda ishchi hech narsa yubormadi. Sabab: `qdu-lms-worker`
image'i **production** bosqichidan qurilgan bo'lib, konteyner 2026-09-05 dagi
qotib qolgan `dist/main.js` ni ishga tushirar edi (`api` esa development
bosqichi — `npm run dev`, `nest --watch`). Eski kod yangi ish turlarini
(`lti.ags.push` va undan keyingi barchasini) `default: skipped` bilan
**jimgina yutib yuborgan** — navbatda `failed` ham qolmagan. Yechim: worker ham
API bilan bir xil dev image'da ishlashi kerak —

```bash
docker tag qdu-lms-api qdu-lms-worker && docker compose up -d --no-build worker
# yoki to'liq: docker compose build worker && docker compose up -d worker
```

Tekshiruv belgisi: `docker inspect lms-worker --format '{{.Config.Cmd}}'` →
`[npm run dev]`.

Narxi: `nest --watch` rejimida `lms-api` ham, `lms-worker` ham ~1.1 GB xotira
oladi (Docker VM 3.7 GB, host 8 GB). Playwright + Next dev server bilan birga
bu tizimni swap'ga tushiradi — sahifalar sovuq kompilyatsiyada 10–60 s, testlar
vaqt bo'yicha yiqiladi. E2E paytida worker'ni vaqtincha to'xtatish
(`docker stop lms-worker`, keyin `docker start lms-worker`) ~1 GB bo'shatadi;
navbat ishlari (AGS push, e-mail) o'sha paytda kutib turadi va worker qayta
yoqilgach bajariladi. `apps/api/src` o'zgargach worker'ni ham `docker restart
lms-worker` qilish kerak (Windows bind mount, §3j dagi kabi).

Tekshiruv (`check:gaps` 9a, +4): LTI talabasi topshiriqni topshiradi, o'qituvchi
baholaydi → ishchi soxta platformada `lineitems` POST (label, scoreMaximum=20,
resourceId) va `scores` POST (15/20) qiladi; jamlanma ham yangilanadi; qo'lda
push mavjud line item'ni qayta yaratmaydi.

Natijalar: `check:gaps` **159/159**, `npm run verify` ✅ (jest 178, vitest 81+25,
i18n 4 × 1232), OpenAPI 182 yo'l / 214 op (javob shakli o'zgardi, yo'l qo'shilmadi).

## 3l. QTI: poly hotspot, inlineChoice, slider (2026-09-06)

| Qism                      | Nima qilindi                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `questionPayloadSchema`   | HOTSPOT `shape: 'POLY'` + `points[]` (foiz); CLOZE bo'shlig'ida `options[]` (ochiladigan ro'yxat); NUMERIC `range {min,max,step}` (slayder)                           |
| `qti-parser`              | `inlineChoiceInteraction` → CLOZE bo'shlig'i (`options`, to'g'ri identifikator → matn); `sliderInteraction` → NUMERIC `range`; hotspot `poly` → uchlar                |
| `question-import.service` | poly uchlari ham rasm o'lchamiga nisbatan foizga o'giriladi                                                                                                           |
| `qti-writer`              | ro'yxatli bo'shliq → `qti-inline-choice-interaction`, `range` → `qti-slider-interaction`, poly → `shape="poly"` (round-trip testi)                                    |
| `strip-answers`           | talabaga `options`, `range`, `points` yuboriladi (javob emas), `accepted`/`correctValue` avvalgidek yashirin                                                          |
| Web                       | talaba: ro'yxatli bo'shliq `select`, slayder `range`; muharrir: variantlar maydoni, slayder kaliti (min/maks/qadam), ko'pburchak shakli (SVG ko'rinish, uchlar matni) |

Tekshiruv: jest QTI spec'lari (round-trip'ga ro'yxatli bo'shliq, slayder, poly
qo'shildi; +1 test), `check:gaps` 8-bo'limga 3 ta yangi (poly foiz, inlineChoice
options, slider range) va eksport/qayta-import endi 7 ta savol bilan. Natija:
`check:gaps` **162/162**, `npm run verify` ✅ (jest 179, vitest 81+25, i18n 4 × 1243),
OpenAPI 182 / 214, `format:check` ✅.

## 3m. IMS CC eksport: forum mavzulari (2026-09-06)

Forum mavzulari kurs darajasida (mavzuga bog'lanmagan), CC da esa muhokama —
tuzilma elementi. Shuning uchun eksportda ular alohida **"Forum"** moduli →
"Muhokamalar" (paket tilida) mavzusi ostida `imsdt_xmlv1p1` discussion topic
sifatida yoziladi (`discussions/<id>.xml`, matn — mavzuning birinchi xabari).
Bizning import bu paketni qayta o'qiganda mavzular kurs forumiga tushadi (mavjud
`discussion` importi), Moodle/Canvas esa muhokama elementi sifatida ko'rsatadi.
`counts.discussions` qaytadi; `counts.modules` faqat haqiqiy modullarni sanaydi.

Tekshiruv: cc-writer round-trip testi (discussion ham), `check:gaps` +1 (paketda
imsdt fayli va manifest turi, qayta o'qishda `discussions >= 1`).
Natija: `check:gaps` **163/163**, `npm run verify` ✅ (jest 179, vitest 81+25,
i18n 4 × 1243), OpenAPI 182 / 214, `format:check` ✅.

Topilma (jarayon): patch skriptidagi `open(p,'w').write(fn(s))` — `open` avval
faylni bo'shatadi, `fn` xato bersa fayl bo'sh qoladi (`cc-import.service.ts`
shunday 0 qatorga tushdi; git indeksidan tiklandi, diff faqat kunlik qo'shimcha).
Endi helper avval `fn(s)` ni hisoblab, keyin yozadi.

## 3n. Dekanat fanlar ro'yxatini ko'radi (2026-09-06)

§3e dagi kuzatuv yopildi. Spetsifikatsiya R3 (Rektorat/Dekanat) uchun
"tasdiqlash" ni aniq beradi; tasdiqlash interfeysi fanlar ro'yxati orqali
ochiladi, ammo `DEANERY` da `subject:read:*` yo'q edi — `GET /subjects` 403,
menyuda "O'quv reja" bandi bor, sahifa esa bo'sh. Yechim: matritsaga
`subject:read:own_faculty` qo'shildi (dekan o'z fakultetining fanlarini ko'radi,
yaratish/tahrirlash huquqi yo'q — bu metodist va mudirda qoladi). Ruxsatlar
ish vaqtida `permissionsForRoles` (matritsa) dan hisoblanadi, shuning uchun
`build:shared` + API restart yetarli; `db:seed` faqat audit uchun mos yozuvni
yangilaydi.

Tekshiruv: `check:gaps` 6-bo'limga 2 ta (dekan fanlarni ko'radi, yangi fan
sillabusiga yetib boradi), e2e "Sillabus konstruktori" ga 1 ta (dekan
ro'yxatdan sillabus sahifasiga o'tadi).

### To'liq e2e regressiyasi va ikkita mahsulot tuzatishi

Bugungi web o'zgarishlaridan keyin barcha 9 spec (106 test) yuritildi. Ikki
haqiqiy topilma tuzatildi:

- **Topshiriq yaratish oynasida rubrika ko'rinmas edi** — yangi bo'limli
  formada rubrika "Baho" bo'limida yig'ilgan. Endi yaratish rejimida "Umumiy",
  "Mavjudlik" bilan birga "Baho" ham ochiq keladi (maksimal ball va rubrika —
  asosiy qaror).
- **Savolsiz nashr etilgan testda talabaga "Testni boshlash" chiqar edi**,
  server esa `quiz_has_no_questions` bilan 422 qaytarardi. Endi kurs sahifasida
  bunday test uchun tugma o'rniga "Savollar hali qo'shilmagan" belgisi (Moodle
  uslubi). (Fikstura kursida test yugurishlari qoldirgan bo'sh testlar buni
  ochib berdi.)

Qolgan yiqilishlar muhitga bog'liq edi va iliq holatda o'tdi. Sabab: Next dev
server standart `onDemandEntries.maxInactiveAge` (60 s) bilan ishlatilmagan
sahifani bo'shatadi — ketma-ket testlarda har sahifa qayta "sovuq"
kompilyatsiya bo'lib 8 GB mashinada 10–60 s olardi. `next.config.mjs` ga
`onDemandEntries { maxInactiveAge: 1 soat, pagesBufferLength: 100 }` qo'shildi
(faqat dev serverga ta'sir qiladi); global setup 5+ daqiqadan 30 soniyaga
tushdi.

Yana bir test poygasi tuzatildi: `student-flow.spec` kurs kartalarini kutmasdan
`count()` chaqirar edi (skelet holatida 0 → "test topilmadi"). Natija: 106/106
(1 ta o'tkazib yuborilgan — urinishlari tugagan test, loyihalangan holat),
`check:gaps` 165/165, `npm run verify` ✅ (jest 179, vitest 81+25, i18n 4 × 1244).

## 3o. Sayt boshqaruvi — Moodle "Site administration" daraxti (2026-09-06)

Foydalanuvchi Moodle'ning sayt boshqaruvi menyusini (Foydalanuvchilar,
Administratorga e'lon, Registration, Moodle services, Feedback, Kengaytirilgan
imkoniyatlar, Analytics, Competencies, Nishonlar, H5P, Ruxsatnoma, Joylashuv,
Til, Messaging, Mobile, Payments, Himoya, Ma'lumotlar/Old sahifa, Mobile app,
MoodleNet) so'radi. Qabul qilingan talqin: xuddi shu tuzilmadagi sozlamalar
daraxti, har bir band bizning platformadagi haqiqiy sozlamaga bog'langan;
Moodle'ga xos bandlar eng yaqin ekvivalentga xaritalangan va izohlangan.

| Qism                                   | Nima qilindi                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lms/shared` `admin/site-settings.ts` | **Deklarativ reestr**: 15 toifa, 38 bo'lim, 100+ maydon (tur, standart, `isPublic`, variantlar, chegaralar), 4 tilda yorliqlar; `siteSectionSchema` (zod), `ipMatches/isIpAllowed` (sof), 4 unit test  |
| `SiteSettingsService` (global)         | `Setting` jadvalidan keshlab o'qish (30 s), tur mos kelmasa standart; yozuvdan keyin invalidatsiya                                                                                                     |
| `GET/PUT /admin/site[/:section]`       | daraxt + qiymatlar; bo'limni reestr sxemasi bilan yangilash (`isPublic`/tavsif reestrdan), audit, `settings/public` keshi tozalanadi                                                                   |
| **IP bloklovchi**                      | `IpBlockGuard` — barcha guard'lardan oldin; `x-forwarded-for`; `/health` istisno; 403 `errors.ip_blocked`                                                                                              |
| **Ro'yxatdan o'tish**                  | `registration.enabled`, `allowedEmailDomains`, `defaultRole` — `AuthService.register` da; parol minimal uzunligi `security.passwordMinLength` (`.env` dan kichik bo'lsa e'tiborsiz)                    |
| **Xabarlar**                           | `messaging.enabled`, `messaging.studentToStudent` — `sendMessage` da (faqat STUDENT rolli ikki tomon)                                                                                                  |
| **Tilni moslashtirish**                | `i18n.overrides` ochiq sozlamasi `i18n/request.ts` da katalog ustiga qo'yiladi (60 s revalidate)                                                                                                       |
| Web `/admin/site`                      | daraxt + qidiruv, reestrdan chiziladigan forma (boolean/number/string/text/select/multiselect/list/json/color), vidjetlar: statistika, feature flag'lar, nishonlar (ro'yxat + qo'shish), til paketlari |

Tekshiruv: `check:gaps` 13-bo'lim — 13 ta (daraxt, ruxsatlar, ochiq sozlama,
sxema 400/404, IP bloklovchi 403 → tiklanish, domen/o'chirilgan ro'yxatdan
o'tish 422, talaba→talaba 422, standart til 422); e2e "Sayt boshqaruvi" 1 ta.
Natija: `check:gaps` **179/179**, e2e "Sayt boshqaruvi" 2 ✅ (jami 108), `npm run
verify` ✅ (jest 179, vitest 85+25, i18n 4 × 1270), OpenAPI 184 yo'l / 217 op.

### Sozlamalar qo'llanadigan nuqtalar (ikkinchi bosqich)

| Sozlama                                                                                   | Qayerda kuchga kiradi                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `notifications.inApp/email/sms/telegram/push`, `quietHoursStart/End`                      | `notification.worker`: sayt darajasida o'chirilgan kanal yuborilmaydi; foydalanuvchi sokin soati bo'lmasa saytniki |
| `security.maxUploadMb`, `h5p.maxSizeMb`                                                   | `files.service.presign`: maqsad chegarasi, sayt chegarasi va `.h5p` uchun H5P chegarasidan eng kichigi             |
| `attendance.warningThreshold`, `analytics.lowProgressPercent`, `analytics.inactivityDays` | `analytics.service.riskThresholds()` → `assessRisk` chegaralari (kritik = ogohlantiruvchi − 15 / +10 / ½)          |
| `mobile.appTitle`                                                                         | `app-shell` brendi (`usePublicSettings`)                                                                           |
| `messaging.enabled`, `badges.enabled`, `advanced.forum`                                   | menyudagi "Xabarlar", "Yutuqlar" bandlari va kurs sahifasidagi Forum tugmasi yashirinadi (`settingKey`)            |
| `frontpage.loggedInDefault`                                                               | login sahifasi: `my-courses`/`courses` tanlansa rol bo'yicha standart o'rniga o'sha sahifa                         |
| `mobile.appTitle`, `mobile.themeColor`, `ui.defaultLocale`, `site.description`            | `app/manifest.ts` — PWA manifesti dinamik (statik `public/manifest.webmanifest` olib tashlandi)                    |

Hali faqat saqlanadigan (qo'llaydigan modul yo'q): HTTP himoyasi (Nginx),
ruxsatnoma, kompetensiya, to'lov provayderlari ro'yxati, H5P tur cheklovi.

## 3p. HEMIS uslubidagi "Talaba" bo'limi (2026-09-07)

Foydalanuvchi HEMIS talaba menyusini (Fan tanlov, Mening fanlarim, Dars
jadvali, Vazifalar, Qayta o'qish, Yakuniy, Individual shaxsiy reja, Ma'lumot,
So'rovnoma, Talaba xizmatlari) so'radi. Talqin: talaba uchun xuddi shu
tuzilmadagi menyu guruhi, har bir band haqiqiy ma'lumot/xizmatga bog'langan.

| Qism                | Nima qilindi                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ma'lumotlar modeli  | `StudentRequest` (6 tur, 5 holat, hujjatga bog'lanish), `Survey` (savollar JSON, auditoriya, anonimlik), `SurveyResponse` (`respondentKey` bilan takrorsiz); migratsiya `20260907000000_student_portal`                                                                                 |
| Seed                | 22 ta tasdiqlangan o'quv reja (mutaxassislik × qabul yili, semestrlar, tanlov fanlari), 1 nashr etilgan so'rovnoma; akademik kalendar seed'i idempotent                                                                                                                                 |
| Ruxsatlar           | resurslar `studentrequest`, `survey`; STUDENT: `curriculum:read:own`, `studentrequest:create/read:own`, `survey:read:own`; DEANERY `manage:own_faculty`, TUTOR `read:own_group`, admin `manage:all`; scope resolverlar                                                                  |
| API `StudentModule` | `/student/plan`, `/electives` (+ yozilish/chiqish), `/retakes`, `/finals`, `/info`, `/requests`, `/surveys/:id/responses`; xodimlar: `/student-requests` (doira bo'yicha), `PATCH` (tasdiqlashda ma'lumotnoma/transkript hujjati avtomatik, bildirishnoma), `/surveys` CRUD + `results` |
| Web                 | "Talaba" menyu guruhi (rol bo'yicha), 7 sahifa (`/student/*`), xodimlar: `/admin/student-requests`, `/admin/surveys`; i18n `student.*` 4 tilda                                                                                                                                          |

Tekshiruv: `check:gaps` 14-bo'lim — 19 ta (reja, 403, fan tanlov yozilish/
chiqish/422, qayta o'qish, yakuniy, ma'lumot, ariza → takror 422 → dekanat
ko'radi → tasdiqlaydi → hujjat → talaba ko'radi, so'rovnoma yaratish → javob →
takror 422 → agregat natija), e2e 2 ta (menyu + reja, ariza yuborish).

Natija: `check:gaps` **203/203**, e2e 110 (2 yangi ✅), `npm run verify` ✅ (jest
184, vitest 85+25, i18n 4 × 1435), OpenAPI 198 yo'l / 234 op.

Topilmalar: (1) 7-bo'lim demo talabani sinov guruhiga o'tkazib qo'yardi
(o'quv rejasiz mutaxassislik) — `context()` endi tasdiqlangan o'quv rejasi bor
guruhni afzal ko'radi, tekshiruv esa talabani seed guruhiga qaytaradi; (2)
kurssiz so'rovnoma uchun `own_faculty` doirasi ishlamasdi — `Survey.facultyId`
(muallif fakulteti) qo'shildi; (3) o'quv yili nomi tasodifiy juftlikdan
to'qnashardi — mavjudlar bilan solishtirib tanlanadi; (4) host'da qolib ketgan
`apps/api/dist` jarayoni Prisma dvigatelini qulflab `prisma generate` ni
buzardi (EPERM) — to'xtatildi.

### Yopilmagan holicha qolgan uzilishlar

Tahlilda topilgan, ammo bu bosqichda YOZILMAGAN interfeyslar — ular hamon
faqat API orqali ishlaydi:

- (bo'sh) — tahlildagi barcha uzilishlar yopildi.

### Muhit nuqsoni: konteynerdagi `@lms/shared` eskirib qoladi

`docker-compose.yml` da `api` va `worker` xizmatlari `packages/shared/src` ni
mount qiladi, ammo ishga tushirilganda `@lms/shared` **`packages/shared/dist`**
orqali yechiladi — u esa image ichida qotib qolgan. Natijada `packages/shared`
dagi har qanday yangi eksport (masalan `updateRubricSchema`) konteynerda
`undefined` bo'lib qoladi va so'rov `ZodValidationPipe` da 500 bilan yiqiladi.

Vaqtinchalik yechim (shu bosqichda qo'llanilgan):

```bash
docker exec lms-api npm run build --workspace=@lms/shared && docker restart lms-api
```

Doimiy yechim **qo'llanildi** — `docker-compose.yml` da `api` va `worker`
volumelariga qo'shildi:

```yaml
- ./packages/shared/dist:/app/packages/shared/dist
```

Shart: konteynerni ko'tarishdan oldin `npm run build:shared` bajarilgan
bo'lishi kerak (bu allaqachon §5 dagi ishga tushirish ketma-ketligida bor).

> **Volume o'zgarishi:** `docker-compose.yml` da volume qo'shilsa, `docker restart`
> uni qo'llamaydi — `docker compose up -d api` bilan konteyner qayta yaratilishi kerak.
>
> **Windows haqida:** konteyner ichidagi `nest start --watch` bind mount
> orqali host'dagi fayl o'zgarishlarini KO'RMAYDI (inotify hodisalari
> uzatilmaydi). `apps/api/src` o'zgargach `docker restart lms-api` kerak —
> konteyner ishga tushganda qaytadan kompilyatsiya qiladi.

### Tuzatilgan nuqson: urinish boshlashdagi poyga

`POST /quizzes/:id/attempts` ni bir vaqtda ikki marta chaqirganda (React
StrictMode `useEffect` ni ikki marta ishga tushiradi; foydalanuvchi ham
ikki marta bosishi mumkin) ikkala so'rov `previousCount` ni bir xil hisoblab,
bir xil `attemptNumber` bilan yozuv yaratmoqchi bo'lardi.
`@@unique([quizId, userId, attemptNumber])` ikkinchisini rad etar va
foydalanuvchi `CONFLICT` xatosini ko'rardi.

Yechim (`quizzes.service.ts`): cheklov buzilganda xato yutilmaydi, balki
birinchi so'rov yaratgan FAOL urinish qaytariladi — natija idempotent bo'ladi.
Boshqa sababdan kelgan `P2002` esa oldingidek yuqoriga uzatiladi.

Regressiya tekshiruvi `scripts/check-grading.mjs` §8 da: ikkita so'rov
`Promise.all` bilan yuboriladi va ikkalasi ham `201` hamda AYNAN BIR
`attemptId` qaytarishi, bazada esa bitta urinish qolishi tasdiqlanadi.

`e2e/student-flow.spec.ts` dagi "urinishlar tugadi" tekshiruvi ham
mustahkamlandi: ilgari `isVisible()` darhol o'qilardi va server javobidan
oldin `false` qaytarib, testni noto'g'ri yiqitardi — endi taymer yoki xabar,
qaysi biri birinchi kelsa, o'sha kutiladi.

### i18n kalit nomi va xavfsizlik testi

`quizzes.correctValue` kaliti `quizzes.numericAnswer` ga qayta nomlandi.
Sabab: next-intl butun katalogni sahifa HTML iga joylaydi, `student-flow`
esa HTML da javob maydonlari nomi bo'lmasligini tekshiradi
(`expect(html).not.toContain('correctValue')`). Kalit nomi shu qat'iy
tekshiruvni soxta yiqitardi. Tekshiruv qat'iy qoldirildi, kalit o'zgartirildi.

### Aniqlangan mavjud nuqson (bu bosqichda tuzatilmagan)

Bu bo'limda ochiq nuqson qolmadi — yuqoridagi urinish poygasi tuzatildi.

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
npm run check:builder           # kurs konstruktori oqimi (23 ta)
npm run check:grading           # baholash, rubrika va savollar banki (52 ta)
npm run check:gaps              # forum, davomat, yozilish, xabar, sertifikat, sillabus, tuzilma, import/eksport, LTI Advantage, IMS CC, sozlamalar
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
