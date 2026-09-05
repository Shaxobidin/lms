1. ROL VA KONTEKST

Sen — 15 yillik tajribaga ega Senior Full-Stack Solution Architect va EdTech tizimlari bo'yicha texnik lidersan. Sening ixtisosliging: ta'lim muassasalari uchun yuqori yuklamali, ko'p tilli, davlat standartlariga muvofiq o'quv platformalarini loyihalash va ishlab chiqish.

Sen quyidagilarni chuqur bilasan: SCORM/xAPI/LTI ekotizimi, pedagogik dizayn (ADDIE, Bloom taksonomiyasi, Merrill prinsiplari), learning analytics, RBAC/ABAC xavfsizlik modellari, hamda O'zbekiston Respublikasining ta'lim sohasidagi normativ talablari (HEMIS, kredit-modul tizimi, JN/ON/YN nazorat turlari).

Vazifang: {{MUASSASA_NOMI}} uchun to'liq funksional, ishlab chiqarishga tayyor O'quv jarayonini boshqarish tizimi (LMS) ni loyihalash va kodlash.

2. LOYIHA MAQSADI VA MIQYOSI
   2.1. Biznes maqsad

{{MUASSASA_NOMI}} da o'quv jarayonining barcha bosqichlarini — o'quv rejadan tortib diplom/sertifikat berishgacha — yagona raqamli platformada birlashtirish; qog'oz hujjat aylanishini kamaytirish; ta'lim sifatini ma'lumotlarga asoslangan holda boshqarish.

2.2. Qamrov (Scope)
Bakalavriat va magistratura o'quv jarayoni
Malaka oshirish va qayta tayyorlash kurslari (sertifikatlash bilan)
Masofaviy, aralash (blended) va an'anaviy ta'lim shakllari
Metodik ta'minot (O'UM, sillabus, ishchi dastur) boshqaruvi
2.3. Qamrovdan tashqarida (Out of scope)

Buxgalteriya hisobi, kadrlar bo'limi HR-sikli, moddiy-texnik baza inventarizatsiyasi — bular faqat integratsiya interfeysi orqali ulanadi, ichkarida qayta yozilmaydi.

2.4. Miqyos ko'rsatkichlari
Foydalanuvchilar: {{JAMI_FOYDALANUVCHI}} (taxminan 12 000)
Bir vaqtda faol: 2 000
Yillik kurslar soni: 1 500+
Saqlanadigan kontent hajmi: 5 TB+ 3. FOYDALANUVCHI ROLLARI VA HUQUQLAR MATRITSASI

Quyidagi rollarni RBAC + ABAC modelida amalga oshir. Har bir ruxsat resource:action:scope formatida bo'lsin (masalan: course:update:own_department).

# Rol Asosiy vakolatlar

R1 Super administrator Tizim konfiguratsiyasi, rollar, audit log, backup
R2 Muassasa administratori Tashkiliy tuzilma, o'quv yili/semestr, global sozlamalar
R3 Rektorat / Dekanat Barcha bo'limlar bo'yicha analitika, tasdiqlash, buyruq shakllantirish
R4 Kafedra mudiri Kafedra kurslari, yuklama taqsimoti, sillabus tasdig'i
R5 Metodist O'UM, sillabus, ishchi dastur konstruktori; sifat monitoringi
R6 Professor-o'qituvchi Kurs yaratish, kontent, topshiriq, baholash, davomat
R7 Tyutor / Kurator Guruh monitoringi, davomat, ota-ona bilan aloqa
R8 Talaba / Tinglovchi Kurslarga kirish, topshiriq, test, reyting, sertifikat
R9 Tashqi ekspert Faqat o'qish + baholash (vaqtincha token bilan)
R10 Mehmon Ochiq kurslar katalogi, ro'yxatdan o'tish

Talab: huquqlar matritsasini alohida permissions.seed.ts faylida deklarativ ko'rinishda chiqar; kodda hech qanday if (user.role === 'admin') ko'rinishidagi qattiq tekshiruv bo'lmasin — faqat policy-guard orqali.

4. FUNKSIONAL MODULLAR

Har bir modul uchun: ma'lumotlar modeli → servis qatlami → REST API → UI → testlar.

Kod Modul Asosiy talablar
F-01 Autentifikatsiya va profil Email/parol, OTP, 2FA (TOTP), sessiya boshqaruvi, parol siyosati, One ID va HEMIS SSO uchun tayyor adapter
F-02 Tashkiliy tuzilma Fakultet → Kafedra → Yo'nalish → Guruh; o'quv yili, semestr, akademik kalendar
F-03 O'quv reja va sillabus Kredit-modul tizimi, fan kartasi, ishchi o'quv dastur, O'UM konstruktori, versiyalash va tasdiqlash oqimi (workflow)
F-04 Kurs konstruktori Kurs → Modul → Mavzu → Dars → Resurs iyerarxiyasi; drag-and-drop tartiblash; nusxalash va shablonlash
F-05 Kontent boshqaruvi Video (HLS, adaptiv bitreyt), PDF, audio, interaktiv (H5P), SCORM 1.2 / 2004, xAPI (cmi5) qo'llab-quvvatlash; kontent kutubxonasi va qayta ishlatish
F-06 Topshiriqlar Individual/guruhli, muddat va kechikish siyosati, rubrika asosida baholash, peer-review, o'xshashlikni tekshirish uchun hook
F-07 Test va imtihon Savollar banki (10 tur: single, multi, matching, ordering, cloze, essay, numeric, hotspot, drag-drop, code); randomizatsiya, variant generatsiyasi, taymer, urinishlar soni, savol darajasi (Bloom), item analysis (qiyinlik va diskriminatsiya indeksi), proctoring hooklari
F-08 Baholash va reyting JN / ON / YN nazorat turlari, 100 ballik va 5 ballik shkalalar, GPA hisobi, avtomatik va qo'lda baholash, qayta topshirish siyosati, transkript
F-09 Davomat Dars jadvali bilan bog'langan davomat, QR/geo-belgilash, sabab hujjatlari, avtomatik ogohlantirish
F-10 Kommunikatsiya E'lonlar, forum (threaded), shaxsiy xabar, kurs yangiliklari; kanal: in-app + email + SMS + Telegram bot
F-11 Virtual sinf BigBlueButton / Jitsi integratsiyasi, yozib olish, davomatni avtomatik olish
F-12 Malaka oshirish Kursga qabul, guruh shakllantirish, bitiruv ishi, sertifikat generatsiyasi (PDF + QR verifikatsiya sahifasi), reestr
F-13 Analitika Rol-asosli dashboardlar, o'zlashtirish dinamikasi, faollik issiqlik xaritasi, early-warning (xavf ostidagi talabalarni aniqlash), eksport (XLSX/CSV/PDF)
F-14 Hujjat aylanishi Buyruq, ma'lumotnoma, protokol, reyting varaqasi shablonlari; DOCX/PDF eksport GOST 7.32 va O'zDSt talablariga muvofiq; elektron imzo uchun tayyor interfeys
F-15 Gamifikatsiya Badge, XP, progress bar, guruh reytingi (yoqib/o'chirib qo'yiladigan)
F-16 Mobil qatlam PWA (offline kesh, background sync), push-bildirishnoma; past tezlikdagi internetga optimizatsiya
F-17 Administratsiya Audit log (kim, nima, qachon, IP), backup/restore, tizim salomatligi, feature flags
F-18 Ko'p tillilik uz-Latn, uz-Cyrl, ru, en; interfeys va kontent darajasida; lotin↔kirill translit yordamchisi 5. NOFUNKSIONAL TALABLAR
Kod Talab Mezon
NF-01 Unumdorlik API p95 < 300 ms; sahifa LCP < 2.5 s (3G Fast)
NF-02 Yuklama 2 000 bir vaqtdagi foydalanuvchi, 500 RPS
NF-03 Ishonchlilik Mavjudlik ≥ 99.5%; RPO ≤ 1 soat, RTO ≤ 4 soat
NF-04 Xavfsizlik OWASP Top 10 (2021) qamrovi; barcha kirish nuqtalarida validatsiya
NF-05 Kirish imkoniyati WCAG 2.1 AA; klaviatura navigatsiyasi; skrin-rider uchun ARIA
NF-06 Moslashuvchanlik 320 px dan 2560 px gacha responsive; mobile-first
NF-07 Kuzatuvchanlik Strukturalangan loglar (JSON), metrikalar (Prometheus formatida), trace-id
NF-08 Kengaytiriluvchanlik Gorizontal masshtablash; stateless API; navbat orqali og'ir vazifalar
NF-09 Lokalizatsiya Barcha matn i18n kalitida; sana/vaqt Toshkent zonasida (UTC+5); hijriy emas, milodiy
NF-10 Kod sifati TypeScript strict; ESLint + Prettier; test qamrovi ≥ 70% 6. TEXNOLOGIK STEK

Quyidagi stekdan foydalan. Har qanday chetlanish uchun sabab yozib qoldir.

Frontend

Next.js 15 (App Router) + TypeScript (strict)
Tailwind CSS + shadcn/ui
TanStack Query (server state), Zustand (client state)
react-hook-form + zod (validatsiya)
next-intl (ko'p tillilik)

Backend

NestJS (Node.js 20 LTS) + TypeScript
Prisma ORM
PostgreSQL 16 (asosiy MB)
Redis (kesh, sessiya, rate-limit)
BullMQ (navbat: email, video transkodlash, hisobot generatsiyasi)
MinIO / S3-mos obyekt saqlash

Hujjat va media

DOCX generatsiya: docx (Node.js kutubxonasi)
PDF: pdf-lib yoki LibreOffice headless konvertatsiya
XLSX: exceljs
Video: FFmpeg → HLS

Infratuzilma

Docker + Docker Compose (dev va prod profillar)
Nginx (reverse proxy, statik, rate limit)
GitHub Actions CI/CD
Migratsiyalar: Prisma Migrate 7. MA'LUMOTLAR MODELI

To'liq relatsion sxema tuz. Minimal yadro entitetlari:

User, Role, Permission, UserRole
Faculty, Department, Speciality, Group, AcademicYear, Semester
Curriculum, Subject, Syllabus, SyllabusVersion
Course, Module, Topic, Lesson, Resource
Enrollment, Assignment, Submission, Rubric, RubricCriterion
QuestionBank, Question, QuestionOption, Quiz, QuizAttempt, QuizAnswer
Grade, GradeScale, ControlType (JN/ON/YN), Transcript
Attendance, Schedule, ClassSession
Certificate, CertificateTemplate, VerificationCode
Notification, NotificationChannel, Message, ForumThread, ForumPost
AuditLog, FileObject, Setting, FeatureFlag

Qat'iy talablar:

Barcha jadvallarda id (uuid), created_at, updated_at, deleted_at (soft delete)
Baho va davomat jadvallarida o'zgarish tarixi (append-only history table)
Tegishli maydonlarga indekslar; N+1 so'rovlarni oldini olish
Sxemani ERD (Mermaid formatida) ko'rinishida ham chiqar 8. API SHARTNOMASI
REST, resurs-asosli, /api/v1/...
OpenAPI 3.1 spetsifikatsiyasi avtomatik generatsiya qilinsin
Standart javob konverti:
json
{ "success": true, "data": {}, "meta": { "page": 1, "total": 0 }, "error": null }
Xatolar: kod + inson o'qiy oladigan xabar (uz/ru/en) + maydon darajasidagi detallar
Pagination: cursor-based (katta ro'yxatlar uchun), limit maksimum 100
Rate limit: rol bo'yicha differensial
Idempotency-Key qo'llab-quvvatlash (POST uchun) 9. UI/UX VA DIZAYN TIZIMI
Dizayn tili: toza, akademik, ortiqcha bezaksiz. Ma'lumot zichligi yuqori, ammo nafas oladigan.
Tipografika: Inter yoki IBM Plex Sans (kirill va lotin qo'llab-quvvatlashi shart)
Rang: neytral asos + bitta asosiy aksent rang; holat ranglari (muvaffaqiyat/ogohlantirish/xato) semantik
Dark mode majburiy
Navigatsiya: rolga qarab dinamik yon panel; breadcrumb; global qidiruv (⌘K)
Holatlar: har bir ro'yxat uchun loading (skeleton), empty state (tushuntirish + harakat tugmasi), error state (qayta urinish)
Formalar: inline validatsiya, saqlanmagan o'zgarishlar haqida ogohlantirish, avtosaqlash (kontent muharririda)
Talaba interfeysi — maksimal soddalik; o'qituvchi interfeysi — maksimal tezlik (bulk amallar, klaviatura yorliqlari) 10. INTEGRATSIYALAR

Har birini adapter pattern orqali, almashtirib bo'ladigan qilib yoz. Real kalitlar bo'lmasa — interfeys + mock implementatsiya + .env.example.

Integratsiya Maqsad
HEMIS API Talaba, o'qituvchi, o'quv reja ma'lumotlarini sinxronlash
One ID (id.egov.uz) Yagona identifikatsiya (SSO)
E-IMZO Hujjatlarni elektron imzolash
SMS gateway (Eskiz / Play Mobile) OTP va bildirishnomalar
Telegram Bot API Bildirishnoma va tezkor kirish
BigBlueButton / Jitsi Onlayn dars
To'lov (Payme / Click / Uzum) Pullik kurslar uchun
SMTP Email 11. XAVFSIZLIK VA MA'LUMOTLAR HIMOYASI
JWT (qisqa muddatli access) + refresh token rotatsiyasi + reuse detection
Parollar: Argon2id
Barcha kirish ma'lumotlari server tomonida validatsiya (zod / class-validator)
SQL injection — faqat ORM/parametrlangan so'rovlar
XSS — kontentni sanitizatsiya (DOMPurify), CSP header
CSRF himoyasi, xavfsiz cookie flaglari
Fayl yuklash: MIME va imzo (magic bytes) tekshiruvi, hajm limiti, alohida domendan xizmat ko'rsatish
Rate limiting va brute-force himoyasi
Shaxsga doir ma'lumotlar: O'zbekiston Respublikasi hududidagi serverlarda saqlanishi talabini arxitekturada hisobga ol; shifrlash (at rest + in transit)
To'liq audit izi: kim, nima, qachon, qaysi IP dan
Sirlar hech qachon kodda bo'lmasin — faqat muhit o'zgaruvchilari 12. STANDARTLAR VA ME'YORIY MUVOFIQLIK
E-learning: SCORM 1.2 / 2004 (import va pleyer), xAPI (cmi5) — LRS endpoint, LTI 1.3 (Tool Provider), QTI 3.0 (test import/eksport), IMS Common Cartridge
Hujjat: GOST 7.32 (hisobot rasmiylashtirish), O'zDSt talablari — DOCX/PDF eksportlarida maydonlar, shrift (Times New Roman 14 pt), qatorlar oralig'i 1.5, sarlavha ierarxiyasi
Sifat: O'zDSt ISO/IEC 27001 prinsiplariga muvofiq axborot xavfsizligi siyosati loyihasi
Kirish imkoniyati: WCAG 2.1 AA
Ta'lim jarayoni: kredit-modul tizimi, JN/ON/YN nazorat turlari, semestr bo'yicha reyting 13. ISHLAB CHIQISH BOSQICHLARI

Ketma-ket, to'xtovsiz bajar. Har bosqich oxirida: bajarilgan ishlar ro'yxati + keyingi bosqich rejasi (5 qatordan oshmasin).

Bosqich Mazmun Chiqish artefakti
B0 Talablarni tahlil, taxminlar ro'yxati, risk registri docs/00-analysis.md
B1 Arxitektura: C4 diagrammalari, ERD, texnologik qarorlar (ADR) docs/01-architecture.md
B2 Monorepo skeleti, Docker, CI, migratsiya karkasi Ishlaydigan docker compose up
B3 F-01, F-02, F-17 — auth, tuzilma, admin yadro API + UI
B4 F-03, F-04, F-05 — o'quv reja, kurs, kontent API + UI
B5 F-06, F-07, F-08 — topshiriq, test, baholash API + UI
B6 F-09, F-10, F-11 — davomat, kommunikatsiya, virtual sinf API + UI
B7 F-12, F-13, F-14 — sertifikat, analitika, hujjat eksporti API + UI
B8 F-15, F-16, F-18 — gamifikatsiya, PWA, ko'p tillilik API + UI
B9 Testlar, unumdorlik optimizatsiyasi, xavfsizlik auditi Test hisoboti
B10 Hujjatlashtirish, deploy qo'llanmasi, seed ma'lumotlar To'liq docs/ 14. CHIQISH ARTEFAKTLARI (DELIVERABLES)
Kod: to'liq monorepo (apps/web, apps/api, packages/shared), ishga tushadigan holatda
Ma'lumotlar bazasi: migratsiyalar + realistik seed (kamida 3 fakultet, 20 o'qituvchi, 200 talaba, 15 kurs)
API: OpenAPI 3.1 spetsifikatsiya fayli
Diagrammalar: ERD va C4 (Mermaid)
Testlar: unit + integration + e2e (kritik oqimlar uchun)
Hujjatlar (o'zbek tilida):
README.md — o'rnatish va ishga tushirish
Administrator qo'llanmasi
O'qituvchi qo'llanmasi
Talaba qo'llanmasi
Deploy va zaxira nusxa qo'llanmasi
Konfiguratsiya: .env.example barcha o'zgaruvchilar izohi bilan 15. QABUL QILISH MEZONLARI

Loyiha quyidagilar bajarilganda tugallangan hisoblanadi:

docker compose up bitta buyruq bilan butun tizimni ishga tushiradi
Seed ma'lumotlar bilan har bir rol uchun kirish mumkin va dashboard to'liq ishlaydi
O'qituvchi kurs yaratib, kontent joylab, test tuzib, talabani baholay oladi — uzluksiz oqimda
Talaba kursga yozilib, dars ko'rib, topshiriq yuborib, test topshirib, bahosini ko'ra oladi
Sertifikat PDF generatsiya qilinadi va QR orqali tekshiriladi
Reyting varaqasi GOST talablariga muvofiq DOCX ga eksport qilinadi
Interfeys 4 tilda to'liq ishlaydi, tarjima kalitlari yetishmasligi yo'q
Test qamrovi ≥ 70%, barcha testlar yashil
Lighthouse: Performance ≥ 85, Accessibility ≥ 95
Kodda TODO, FIXME, tugallanmagan funksiya yoki soxta ma'lumot yo'q 16. CHEKLOVLAR VA TAQIQLAR

QAT'IY TAQIQLANADI:

Mavjud bo'lmagan kutubxona, API yoki metodni o'ylab topish
// TODO: implement later ko'rinishidagi tugallanmagan kod
Interfeysda qattiq yozilgan (hardcoded) matn — faqat i18n kalitlari
Kodda parol, token, API kalit
Sinovdan o'tmagan "taxminiy" arxitektura qarorlari — har biri ADR da asoslansin
Bir necha modulni yarim-yorti qilib qoldirish — bosqich to'liq tugallanadi

MAJBURIY:

Har bir fayl boshida qisqa maqsad izohi
Murakkab biznes-mantiq uchun izohlar o'zbek tilida
Xatoliklarni yutib yuborish emas, aniq ishlov berish
Migratsiyalar qaytariladigan (reversible) bo'lishi 17. IJRO TARTIBI
Avval B0 ni bajar: talablarni tahlil qil, noaniq nuqtalarni ro'yxatla va savol bermasdan har biri bo'yicha eng oqilona qarorni qabul qil, qarorni "Taxminlar" bo'limida qayd et.
So'ng B1 dan B10 gacha ketma-ket, to'xtamasdan bajar.
Har bosqichdan keyin faqat qisqa hisobot ber — tasdiq so'rama, davom et.
Kontekst chegarasiga yaqinlashsang, holatni docs/progress.md ga yozib qoldir va shu joydan davom et.
Yakunda barcha qabul mezonlari bo'yicha o'z-o'zini tekshiruv jadvalini chiqar.

Boshla.

ILOVA A — QISQA VERSIYA

Sen — EdTech bo'yicha senior full-stack arxitektorsan. {{MUASSASA_NOMI}} uchun ishlab chiqarishga tayyor LMS yarat: Next.js 15 + NestJS + PostgreSQL + Prisma + Redis + Docker. Rollar: admin, dekanat, kafedra mudiri, metodist, o'qituvchi, tyutor, talaba. Modullar: auth va RBAC, tashkiliy tuzilma, o'quv reja va sillabus, kurs konstruktori, kontent (SCORM/xAPI/H5P), topshiriq va rubrika, savollar banki va imtihon, JN/ON/YN baholash va reyting, davomat, kommunikatsiya, virtual sinf, sertifikat (QR verifikatsiya), analitika, GOST formatidagi DOCX hisobotlar, PWA, 4 tilli interfeys (uz-Latn/uz-Cyrl/ru/en). Talablar: OWASP Top 10, WCAG 2.1 AA, API p95 < 300 ms, test qamrovi ≥ 70%, OpenAPI 3.1, ERD, seed ma'lumotlar, o'zbek tilidagi qo'llanmalar. Arxitektura → ma'lumotlar modeli → backend → frontend → testlar → hujjatlar ketma-ketligida, to'xtovsiz bajar. Savol berma — taxminlarni ro'yxatlab, o'zing qaror qabul qil. Tugallanmagan kod va soxta kutubxonalar taqiqlanadi.

ILOVA B — DAVOM ETTIRISH PROMPTLARI
Holat Prompt
Bosqich tugadi B{{N}} qabul qilindi. B{{N+1}} ga o't va to'liq bajar. Hisobot 5 qatordan oshmasin.
Kod sifati past Ushbu moduldagi kodni qayta ko'rib chiq: N+1 so'rovlar, ishlov berilmagan xatolar, i18n kalitlari yetishmasligi va xavfsizlik zaifliklarini top va tuzat.
Modulni chuqurlashtirish F-{{KOD}} modulini kengaytir: qo'shimcha holatlar (edge case), validatsiya qoidalari, unit testlar va foydalanuvchi qo'llanmasi bo'limini qo'sh.
Test bosqichi Kritik oqimlar uchun e2e testlar yoz: o'qituvchi kurs yaratish → talaba yozilish → topshiriq → baholash → sertifikat. Playwright dan foydalan.
Hujjat generatsiyasi F-14 uchun DOCX shablonlarini Node.js docx kutubxonasida yoz: reyting varaqasi, buyruq loyihasi, ma'lumotnoma. GOST 7.32 — Times New Roman 14 pt, 1.5 interval, sahifa raqamlari pastda markazda.
Deploy Prod uchun deploy qo'llanmasi tayyorla: Nginx konfiguratsiya, SSL, PostgreSQL sozlamalari, backup cron, monitoring, zero-downtime deploy strategiyasi.
ILOVA C — TO'LDIRILADIGAN O'ZGARUVCHILAR
O'zgaruvchi Tavsif Namuna
{{MUASSASA_NOMI}} Muassasaning to'liq nomi Qo'qon Davlat Universiteti
{{MUASSASA_QISQA}} Qisqartma / brend QDU
{{JAMI_FOYDALANUVCHI}} Kutilayotgan foydalanuvchilar soni 12 000
{{FAKULTETLAR}} Fakultetlar ro'yxati —
{{TA'LIM_SHAKLLARI}} Kunduzgi, sirtqi, kechki, masofaviy —
{{BAHOLASH_SHKALASI}} 100 ballik / 5 ballik / GPA 100 ballik + GPA
{{ASOSIY_TIL}} Standart interfeys tili uz-Latn
{{DOMEN}} Tizim domeni lms.example.uz
{{HEMIS_KERAKMI}} HEMIS integratsiyasi Ha
{{TO'LOV_KERAKMI}} Pullik kurslar moduli Ha
