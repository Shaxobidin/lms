# B0 — Talablar tahlili, taxminlar va risk registri

**Loyiha:** Qo'qon Davlat Universiteti (QDU) O'quv jarayonini boshqarish tizimi — `QDU LMS`
**Hujjat versiyasi:** 1.0
**Sana:** 2026-09-04
**Muallif:** Solution Architecture guruhi

---

## 1. Kirish

Ushbu hujjat `promt.md` da bayon etilgan texnik topshiriqning tahlilini, aniqlanmagan
nuqtalar bo'yicha qabul qilingan qarorlarni (taxminlar) va loyiha risklarini qayd etadi.
Barcha keyingi bosqichlar (B1–B10) shu hujjatdagi taxminlarga tayanadi.

## 2. To'ldirilgan o'zgaruvchilar (ILOVA C)

Texnik topshiriqda `{{...}}` ko'rinishida qoldirilgan o'zgaruvchilar quyidagicha
to'ldirildi. Har bir qiymat `.env` va `packages/shared/src/tenant.ts` orqali
konfiguratsiya qilinadi — kodda hech qayerda qattiq yozilmaydi.

| O'zgaruvchi          | Qabul qilingan qiymat                                                  | Izoh                                        |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `MUASSASA_NOMI`      | Qo'qon Davlat Universiteti                                             | Topshiriqning namunaviy qiymati             |
| `MUASSASA_QISQA`     | QDU                                                                    | Brend, sertifikat va hujjatlarda            |
| `JAMI_FOYDALANUVCHI` | 12 000                                                                 | Sig'im rejalashtirish asosi                 |
| `FAKULTETLAR`        | 5 ta (Pedagogika, Aniq fanlar, Filologiya, Iqtisodiyot, Tabiiy fanlar) | Seed uchun 3 tasi to'liq                    |
| `TA'LIM_SHAKLLARI`   | Kunduzgi, sirtqi, kechki, masofaviy                                    | `EducationForm` enum                        |
| `BAHOLASH_SHKALASI`  | 100 ballik (asosiy) + GPA (4.0) + 5 ballik (ko'rsatish uchun)          | `GradeScale` jadvali orqali sozlanadi       |
| `ASOSIY_TIL`         | `uz-Latn`                                                              | Fallback zanjiri: `uz-Latn` → `ru` → `en`   |
| `DOMEN`              | `lms.qdu.uz`                                                           | Dev: `localhost`                            |
| `HEMIS_KERAKMI`      | Ha                                                                     | Adapter + mock; real kalitlar `.env` orqali |
| `TO'LOV_KERAKMI`     | Ha                                                                     | Payme/Click adapterlari + mock provider     |

## 3. Talablarni tahlil qilish

### 3.1. Asosiy foydalanuvchi oqimlari (critical paths)

Tizimning qiymati quyidagi 5 ta uzluksiz oqimda namoyon bo'ladi. Arxitektura va
test strategiyasi aynan shularga optimallashtiriladi:

1. **O'qituvchi oqimi:** kurs yaratish → modul/mavzu/dars → kontent yuklash →
   topshiriq va rubrika → test tuzish → baholash → jurnal yopish.
2. **Talaba oqimi:** katalog → yozilish → dars ko'rish (progress) → topshiriq yuborish →
   test topshirish → baho va reyting → transkript.
3. **Metodik oqim:** o'quv reja → fan kartasi → sillabus (versiyalash) → kafedra
   mudiri tasdig'i → dekanat tasdig'i → kursga bog'lash.
4. **Ma'muriy oqim:** o'quv yili/semestr ochish → guruhlar → yuklama taqsimoti →
   reyting varaqasi (DOCX/GOST) → buyruq loyihasi.
5. **Sertifikatlash oqimi:** malaka oshirish kursi → bitiruv ishi → sertifikat PDF +
   QR → ochiq verifikatsiya sahifasi → reestr.

### 3.2. Modullar bog'liqlik grafi

```
F-01 auth ─┬─> F-02 tuzilma ─┬─> F-03 o'quv reja ──> F-04 kurs ──> F-05 kontent
           │                 │                                        │
           │                 └─> F-09 davomat <── F-11 virtual sinf   │
           │                                                          v
           ├─> F-17 admin/audit                     F-06 topshiriq ─┬─> F-08 baholash
           │                                        F-07 test ──────┘        │
           ├─> F-18 i18n (barcha modullar)                                   v
           ├─> F-10 kommunikatsiya                             F-13 analitika, F-14 hujjat
           └─> F-16 PWA                                        F-12 sertifikat, F-15 gamifikatsiya
```

Kritik yo'l: **F-01 → F-02 → F-04 → F-06/F-07 → F-08 → F-13/F-14**.
F-15 (gamifikatsiya) va F-11 (virtual sinf) — kechiktirilishi mumkin bo'lgan yagona modullar,
shuning uchun ular B6/B8 ga qo'yilgan.

### 3.3. Yuklama profili tahlili

| Ssenariy                | Xususiyat                         | Arxitektura javobi                                          |
| ----------------------- | --------------------------------- | ----------------------------------------------------------- |
| Imtihon sessiyasi (pik) | 2 000 bir vaqtda, yozish-intensiv | Quiz javoblari Redis buferida, batch flush; optimistik lock |
| Dars boshlanishi 08:00  | Autentifikatsiya spike            | Refresh token Redis'da, JWT stateless verify                |
| Video ko'rish           | Katta trafik, uzoq sessiya        | MinIO/S3 → Nginx, HLS segmentlari kesh-mos                  |
| Semestr yakuni          | Og'ir hisobotlar                  | BullMQ navbat, natija fayl sifatida S3 ga                   |
| Kontent yuklash         | Katta fayl, CPU (FFmpeg)          | Presigned upload + alohida transkod worker                  |

**Xulosa:** API stateless bo'lishi shart; barcha og'ir vazifalar navbatga chiqariladi
(NF-08). Bu qaror ADR-004 da rasmiylashtirilgan.

## 4. TAXMINLAR (Assumptions)

Savol berilmasdan qabul qilingan qarorlar. Har biri o'zgartirilishi mumkin bo'lgan
nuqta sifatida belgilangan (`A-nn`).

| #    | Noaniqlik                                    | Qabul qilingan qaror                                                                                                    | Asos                                                                             |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A-01 | Monorepo menejeri (pnpm/turbo aytilmagan)    | **npm workspaces + npm scripts**                                                                                        | Muhitda `pnpm` yo'q; npm 12 workspaces yetarli, qo'shimcha bog'liqlik kiritmaydi |
| A-02 | Ko'p-ijarachilik (multi-tenancy)             | **Bitta muassasa (single-tenant)**, ammo `Setting` jadvali orqali brendlash                                             | Topshiriqda bitta muassasa nomi; ortiqcha murakkablik NF-01 ga zarar             |
| A-03 | HEMIS API real spetsifikatsiyasi mavjud emas | Adapter interfeysi + **mock implementatsiya** + `HEMIS_MODE=mock\|live`                                                 | §10 talabi: "real kalitlar bo'lmasa — interfeys + mock"                          |
| A-04 | One ID sertifikat va client_id yo'q          | OIDC Authorization Code + PKCE adapteri, mock IdP bilan                                                                 | Standart OIDC; almashtirish `.env` orqali                                        |
| A-05 | E-IMZO faqat brauzer plaginida ishlaydi      | **`SignatureProvider` interfeysi** + `MockSignatureProvider`; hujjatga imzo metadatasi va `signatureHash` maydoni       | Backend E-IMZO CSP'ga to'g'ridan-to'g'ri ulana olmaydi                           |
| A-06 | SCORM pleyer: to'liq runtime yozilsinmi?     | **SCORM 1.2 + 2004 RTE JS adapteri o'z ichida** (`API` / `API_1484_11` obyekti), paket import `imsmanifest.xml` parsing | Tashqi tijorat kutubxonalarga bog'liq bo'lmaslik uchun                           |
| A-07 | xAPI LRS                                     | **Ichki minimal LRS**: `POST/GET /api/v1/xapi/statements` (xAPI 1.0.3 subset: statements, state)                        | To'liq LRS ortiqcha; cmi5 uchun shu yetarli                                      |
| A-08 | LTI 1.3 roli                                 | **Tool Provider** (platforma emas) — JWKS, OIDC login; deep linking v1 dan tashqarida                                   | §12 aynan Tool Provider deydi                                                    |
| A-09 | Proctoring                                   | Faqat **hook**: `ProctoringProvider` interfeysi + fokus yo'qotish/tab almashtirish hodisalari jurnali                   | §F-07 "proctoring hooklari"                                                      |
| A-10 | O'xshashlikni tekshirish (plagiat)           | `PlagiarismProvider` interfeysi + ichki **n-gram shingling** implementatsiyasi bazadagi topshiriqlar bo'yicha           | Tashqi xizmat kalitisiz ham real qiymat beradi                                   |
| A-11 | Video transkodlash                           | FFmpeg → HLS 3 daraja (360p/720p/1080p), worker konteynerda                                                             | NF-01 va past tezlikdagi internet (F-16)                                         |
| A-12 | Obyekt saqlash                               | **MinIO** (S3 API), prod'da almashtirilishi mumkin                                                                      | Ma'lumot O'zbekiston hududida (§11)                                              |
| A-13 | Qidiruv (global Cmd+K)                       | **PostgreSQL FTS** (`tsvector` + `pg_trgm`), Elasticsearch emas                                                         | 12k foydalanuvchi uchun yetarli; infra soddaligi                                 |
| A-14 | Real-time (forum, bildirishnoma)             | **SSE** (Server-Sent Events) + Redis pub/sub; WebSocket emas                                                            | Stateless, Nginx orqali sodda, PWA bilan mos                                     |
| A-15 | Ko'p tillilik: kontent darajasi              | `translations JSONB` maydoni + `LocalizedText` yordamchisi; alohida tarjima jadvali emas                                | N+1 ni oldini oladi, sxemani soddalashtiradi                                     |
| A-16 | Kirill/Lotin translit                        | **Ichki deterministik translit kutubxonasi** (`packages/shared/src/translit`), qidiruvda ham qo'llaniladi               | Tashqi kutubxonalar sifatsiz                                                     |
| A-17 | GPA formulasi                                | 4.0 shkala: A(86–100)=4.0, B(71–85)=3.0, C(60–70)=2.0, F(<60)=0                                                         | O'zbekiston OTM amaliyoti; `GradeScale` orqali sozlanadi                         |
| A-18 | JN/ON/YN og'irliklari                        | JN 30% + ON 30% + YN 40% (standart), sillabusda qayta belgilanadi                                                       | Kredit-modul tizimi amaliyoti                                                    |
| A-19 | Saralash chegarasi                           | Fanni o'zlashtirish uchun ≥ 60 ball, YN ga kirish uchun JN+ON ≥ 36 ball                                                 | Odatiy me'yor                                                                    |
| A-20 | To'lov                                       | Payme/Click adapterlari + `MockPaymentProvider`; faqat malaka oshirish kurslari uchun                                   | §10; bakalavriat kontrakti §2.3 bo'yicha tashqarida                              |
| A-21 | SMS                                          | Eskiz adapteri (REST) + mock                                                                                            | §10                                                                              |
| A-22 | Virtual sinf                                 | **Jitsi** birlamchi (kalitsiz ishlaydi), BBB adapteri ham yoziladi                                                      | Dev muhitida ishga tushadi                                                       |
| A-23 | Autentifikatsiya token joyi                  | Access token — xotirada (JS), refresh — `httpOnly; Secure; SameSite=Lax` cookie                                         | XSS/CSRF muvozanati (§11)                                                        |
| A-24 | Test qamrovi hisobi                          | Backend domen/servis qatlami bo'yicha ≥ 70%; UI — kritik komponentlar + e2e                                             | NF-10 realistik talqini                                                          |
| A-25 | Ma'lumotlar bazasi vaqti                     | Barcha `timestamptz` UTC da saqlanadi, ko'rsatishda `Asia/Tashkent`                                                     | NF-09                                                                            |
| A-26 | Soft delete                                  | `deletedAt` + Prisma extension orqali global filtr; audit yozuvlari hech qachon o'chirilmaydi                           | §7                                                                               |
| A-27 | Migratsiyalarni qaytarish                    | Prisma migrate forward-only, shuning uchun **har bir migratsiya uchun qo'lda `down.sql`** yoziladi                      | §16 "reversible" talabi                                                          |
| A-28 | Elektron pochta dev'da                       | **MailHog** konteyneri                                                                                                  | Real SMTP kalitisiz e2e ishlashi uchun                                           |
| A-29 | Feature flags                                | Bazadagi `FeatureFlag` jadvali + Redis kesh, 30 s TTL                                                                   | F-17                                                                             |
| A-30 | Litsenziya                                   | MIT (ichki foydalanish uchun)                                                                                           | Aniqlik uchun                                                                    |

## 5. Risk registri

Ehtimollik (E) va Ta'sir (T): 1 — past, 5 — yuqori. **R = E × T**.

| #      | Risk                                                     | E   | T   | R   | Yumshatish chorasi                                                                              | Egasi        |
| ------ | -------------------------------------------------------- | --- | --- | --- | ----------------------------------------------------------------------------------------------- | ------------ |
| RSK-01 | HEMIS API spetsifikatsiyasi o'zgarishi / mavjud emasligi | 4   | 4   | 16  | Adapter + anti-corruption layer; sinxronizatsiya idempotent; mock rejim                         | Backend lead |
| RSK-02 | Imtihon sessiyasida pik yuklama (2000 talaba)            | 4   | 5   | 20  | Javoblarni Redis'ga buferlash, gorizontal masshtab, load-test (k6), avtomatik baholash navbatda | Platform     |
| RSK-03 | Video saqlash 5 TB+ va transkodlash narxi                | 3   | 4   | 12  | HLS + adaptiv bitreyt, arxiv uchun sovuq saqlash, kvota tizimi                                  | Infra        |
| RSK-04 | Shaxsiy ma'lumotlar sizib chiqishi                       | 2   | 5   | 10  | Argon2id, at-rest shifrlash, audit log, loglarda PII maskirovka, RBAC/ABAC                      | Security     |
| RSK-05 | E-IMZO integratsiyasi brauzerga bog'liqligi              | 4   | 3   | 12  | Provider interfeysi; imzo bo'lmasa hujjat "loyiha" statusida qoladi, oqimni bloklamaydi         | Backend      |
| RSK-06 | SCORM paketlarining sifatsizligi (buzuq manifest)        | 3   | 3   | 9   | Import vaqtida qat'iy validatsiya, xatolar ro'yxati bilan rad etish, sandbox iframe             | Content      |
| RSK-07 | 4 tilli kontentni to'liq to'ldirmaslik                   | 4   | 2   | 8   | Fallback zanjiri + CI da yetishmayotgan kalitlarni tekshiruvchi test                            | Frontend     |
| RSK-08 | Past tezlikdagi internet (viloyat)                       | 4   | 3   | 12  | PWA offline kesh, lazy loading, javob hajmini cheklash, cursor pagination                       | Frontend     |
| RSK-09 | O'qituvchilarning tizimga o'tishga qarshiligi            | 3   | 4   | 12  | Bulk amallar, klaviatura yorliqlari, XLSX import/eksport, qo'llanmalar                          | Product      |
| RSK-10 | Baho manipulyatsiyasi                                    | 2   | 5   | 10  | Append-only baho tarixi; jurnal yopilgach faqat dekanat ruxsati bilan o'zgarish                 | Security     |
| RSK-11 | Migratsiya davomida ma'lumot yo'qolishi                  | 2   | 5   | 10  | Har bir migratsiyaga `down.sql`, prod'da avtomatik `pg_dump` pre-hook                           | Infra        |
| RSK-12 | Qamrov kengayishi (scope creep)                          | 5   | 3   | 15  | §2.3 dagi out-of-scope qat'iy; yangi talab → ADR                                                | Architect    |

**Eng yuqori 3 risk:** RSK-02 (imtihon yuklamasi), RSK-01 (HEMIS), RSK-12 (qamrov).

## 6. Aniqlanmagan, ammo bloklamaydigan savollar

1. Sertifikat blankasining rasmiy dizayni → shablon konstruktori (`CertificateTemplate`),
   HTML+CSS shablon bazada saqlanadi, dizayn keyin yuklanadi.
2. Buyruq matnlarining rasmiy shakllari → DOCX shablonlari kod ichida parametrlashtirilgan,
   matnlar `Setting` orqali tahrirlanadi.
3. Kafedralar va fanlarning to'liq ro'yxati → seed'da realistik namuna; import CSV orqali.

## 7. Muvaffaqiyat mezonlari (o'lchanadigan)

`promt.md` §15 dagi mezonlar quyidagi avtomatik tekshiruvlarga bog'landi:

| Mezon                            | Avtomatik tekshiruv                                     |
| -------------------------------- | ------------------------------------------------------- |
| Bitta buyruq bilan ishga tushish | `docker compose up -d` → `scripts/smoke.sh`             |
| Har bir rol uchun kirish         | e2e: `roles-dashboard.spec.ts`                          |
| O'qituvchi to'liq oqimi          | e2e: `teacher-flow.spec.ts`                             |
| Talaba to'liq oqimi              | e2e: `student-flow.spec.ts`                             |
| Sertifikat + QR                  | e2e: `certificate.spec.ts`                              |
| GOST DOCX eksport                | unit: `gost-docx.spec.ts` (shrift, interval, maydonlar) |
| 4 til to'liqligi                 | unit: `i18n-completeness.spec.ts`                       |
| Qamrov ≥ 70%                     | `npm run test:cov` — CI gate                            |
| Lighthouse                       | CI: Performance ≥ 85, A11y ≥ 95                         |
| TODO/FIXME yo'q                  | CI: `scripts/check-no-todo.sh`                          |

---

## Bosqich yakuni

**Bajarildi:** o'zgaruvchilar to'ldirildi, 30 ta taxmin qayd etildi, 12 risk baholandi,
kritik oqimlar va modul bog'liqliklari aniqlandi, qabul mezonlari avtomatik tekshiruvlarga bog'landi.

**Keyingi (B1):** C4 diagrammalari (Context / Container / Component), to'liq ERD (Mermaid),
ADR to'plami, API konvensiyalari va xatolik katalogi.
