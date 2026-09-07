# Administrator qo'llanmasi

QDU LMS ni sozlash, boshqarish va nazorat qilish.

> **Demo hisoblar:** `admin@qdu.uz` (super administrator), `rector@qdu.uz`
> (muassasa administratori) · parol `Demo!2026`

---

## 1. Rollar va mas'uliyat chegaralari

| Rol                         | Nimani boshqaradi                                   | Nimaga tegmaydi                |
| --------------------------- | --------------------------------------------------- | ------------------------------ |
| **Super administrator**     | Tizim konfiguratsiyasi, rollar, audit, zaxira nusxa | Baholar, kurs mazmuni          |
| **Muassasa administratori** | Tashkiliy tuzilma, o'quv yili, foydalanuvchilar     | Tizim sirlari, audit o'chirish |
| **Dekanat**                 | Fakultet analitikasi, tasdiqlash, buyruqlar         | Boshqa fakultet ma'lumotlari   |
| **Kafedra mudiri**          | Kafedra kurslari, sillabus tasdig'i, yuklama        | Boshqa kafedra                 |
| **Metodist**                | O'UM, sillabus, o'quv reja                          | Baholar, foydalanuvchilar      |

Ruxsatlar `resource:action:scope` formatida beriladi va **deklarativ matritsada**
saqlanadi (`packages/shared/src/rbac/permissions.ts`). Kodda alohida rol
tekshiruvi yo'q — bu ruxsatlarni bir joydan boshqarish imkonini beradi.

---

## 1a. Sayt boshqaruvi (Moodle uslubidagi sozlamalar daraxti)

`Sozlamalar → Sayt boshqaruvi` (`/admin/site`) — Moodle "Site administration"
kabi chap tomonda toifa → bo'lim daraxti, o'ngda bo'lim formasi. Qidiruv maydoni
bo'lim yoki sozlama nomi bo'yicha filtrlaydi. O'zgarishlar **darhol** kuchga
kiradi (30 soniyagacha keshlanadi), har bir saqlash audit jurnaliga tushadi.
Ko'rish uchun `system:read:all`, saqlash uchun `system:manage:all` (SUPER_ADMIN)
kerak.

| Toifa                          | Bo'limlar va nima qiladi                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foydalanuvchilar bilan ishlash | Foydalanuvchilar (havola), Administratorga e'lon (qaysi hodisalar e-mail qilinadi), **Ro'yxatdan o'tish** (yoqish, ruxsat etilgan e-mail domenlari, beriladigan rol — server tekshiradi), Tashqi xizmatlar (LTI/HEMIS/One ID), Fikr-mulohaza |
| Kengaytirilgan imkoniyatlar    | Modul kalitlari + feature flag'lar                                                                                                                                                                                                           |
| Analitika                      | Sayt ma'lumotlari (statistika), Analitika sozlamalari (davomat/xavf chegaralari), Analitika modellari                                                                                                                                        |
| Kompetensiyalar                | Sozlamalar, freymvorklar, o'quv reja shablonlari (sillabus Bloom darajalariga bog'lanadi)                                                                                                                                                    |
| Nishonlar                      | Sozlamalar, **Nishonlarni boshqarish** (ro'yxat + yangi nishon qo'shish), Backpack                                                                                                                                                           |
| H5P                            | Umumiy, kontent turlari, sozlamalar                                                                                                                                                                                                          |
| Ruxsatnoma                     | Standart ruxsatnoma, ruxsatnomalar menejeri                                                                                                                                                                                                  |
| Joylashuv                      | Vaqt zonasi (NF-09 bo'yicha Toshkent, o'zgarmas), mamlakat, shahar, manzil, telefon                                                                                                                                                          |
| Til                            | Til sozlamalari (standart va yoqilgan tillar), **Tilni moslashtirish** (interfeys matnlarini kalit bo'yicha qayta yozish — darhol amal qiladi), Til paketlari                                                                                |
| Xabarlar                       | **Xabarlar sozlamalari** (talaba→talaba yozishmasi — server tekshiradi), Bildirishnoma kanallari, Telegram bot                                                                                                                               |
| To'lovlar                      | To'lov hisoblari (provayderlar), sozlamalar                                                                                                                                                                                                  |
| Himoya                         | **IP bloklovchi** (taqiq/ruxsat ro'yxatlari — API darajasida 403, `/health` istisno), Sayt siyosatlari (parol uzunligi ham shu yerda), HTTP himoyasi                                                                                         |
| Ma'lumotlar va bosh sahifa     | Sayt ma'lumotlari (nom, tavsif, qo'llab-quvvatlash e-mail — ochiq sozlama), Bosh sahifa sozlamalari                                                                                                                                          |
| Mobil ilova                    | PWA sozlamalari, do'kon havolalari, mobil autentifikatsiya, ko'rinish, offline bo'limlar                                                                                                                                                     |
| Kontent almashinuvi            | IMS CC / QTI / SCORM import-eksport kalitlari (Moodle "MoodleNet" o'rniga)                                                                                                                                                                   |

Moodle'ga xos bandlar bizning ekvivalentga xaritalangan va bo'lim izohida
ko'rsatilgan: "Moodle services" → Tashqi xizmatlar, "Jabber" → Telegram bot,
"Moodle app subscription" → PWA (obuna yo'q), "MoodleNet" → Kontent almashinuvi.

**Darhol kuchga kiradiganlar**: IP bloklovchi, ro'yxatdan o'tish qoidalari,
parol uzunligi, xabarlar (modul va talaba→talaba), bildirishnoma kanallari va
sokin soatlar, yuklash hajmi chegarasi (H5P alohida), analitika chegaralari,
tilni moslashtirish, brend (ilova nomi), menyu bandlari (xabarlar, yutuqlar,
forum), kirishdan keyingi sahifa, PWA manifesti (nom, rang, til).

**IP bloklovchi** formatlari: aniq IP (`203.0.113.7`), prefiks (`192.168.`),
IPv4 CIDR (`10.0.0.0/8`). Taqiq ro'yxati har doim ustun; ruxsat ro'yxati
bo'sh bo'lsa hamma kiradi. O'zingizni bloklab qo'ymaslik uchun avval ruxsat
ro'yxatiga o'z IP'ingizni qo'shing.

## 1b. Talaba arizalari va so'rovnomalar

- `Sozlamalar → Talaba arizalari` (`/admin/student-requests`): dekanat (o'z
  fakulteti), kurator (o'z guruhi, faqat ko'rish) va administratorlar
  arizalarni ko'radi. "Ko'rib chiqishga olish" → "Tasdiqlash" / "Rad etish" →
  "Bajarildi". Izoh talabaga bildirishnoma bilan boradi. **Ma'lumotnoma** va
  **Transkript** arizasi tasdiqlanganda hujjat avtomatik generatsiya qilinadi
  (F-14) va talabaning "Ma'lumot" bo'limida ko'rinadi.
- `Sozlamalar → So'rovnomalar` (`/admin/surveys`): so'rovnoma yaratish (savollar
  qatorma-qator: `matn | SCALE`, `matn | CHOICE | a; b`, `matn | TEXT`), nashr
  qilish/yopish, natijalar (o'rtacha, taqsimot, matnlar). Anonim so'rovnomada
  javob beruvchi saqlanmaydi, takror javob esa oldini olinadi.

## 2. Tashkiliy tuzilma

**Tuzilma** bo'limi iyerarxiyani boshqaradi:

```
Fakultet → Kafedra → Yo'nalish → Guruh → Talaba
```

> **Kim boshqaradi:** tuzilmani o'zgartirish **Muassasa administratori**
> (INSTITUTION_ADMIN) vakolati. Super administrator tuzilmani faqat ko'radi —
> u tizim konfiguratsiyasi uchun, akademik tuzilma uchun emas (§1).

### Tartib

**Tuzilma** sahifasi daraxtni ko'rsatadi; har bir darajaning yonida
tahrirlash (qalam) va o'sha darajaga bola qo'shish tugmalari turadi.

1. **Fakultet yaratish** — kod (noyob), nom 4 tilda, dekan (ro'yxatdan),
   tartib raqami.
2. Fakultetni ochib **Kafedra qo'shish** — kod, nom, kafedra mudiri.
3. Kafedra qatorida **Yo'nalish qo'shish** — davlat klassifikatori kodi
   (masalan `60110100`), ta'lim darajasi, muddati (yil).
4. Yo'nalish qatorida **Guruh qo'shish** — nom (`MI-24-01`), qabul yili,
   ta'lim shakli, ta'lim tili, kurator (tyutorlar ro'yxatidan).

Guruh belgisini bossangiz **a'zolar oynasi** ochiladi: talabalar ro'yxati va
**Talabani biriktirish** formasi (ism/email bo'yicha qidiruv, sabab yoki buyruq
raqami). Talaba boshqa guruhda bo'lsa, u yerdagi a'zoligi yopiladi — tarix
saqlanadi va audit jurnaliga tushadi.

> **Fakultetni o'chirish** faqat u bo'sh bo'lsa mumkin (tugma kafedrasi bor
> fakultetda o'chirilgan turadi, server ham rad etadi). Bu tasodifiy ma'lumot
> yo'qotishning oldini oladi — avval kafedralarni ko'chiring. Kafedra, yo'nalish
> va guruh o'chirilmaydi — faqat tahrirlanadi.

### O'quv yili va semestr

**Tuzilma → Akademik kalendar**

1. **O'quv yili yaratish**: nom `2026-2027` ko'rinishida, boshlanish/tugash
   sanalari (boshlanish tugashdan oldin bo'lishi shart).
2. Yil kartasida **Semestr qo'shish** (1, 2, …) — sanalar va **jurnal yopilish
   sanasi**: undan keyin baho kiritish faqat dekanat ruxsati bilan.
3. **Joriy deb belgilash** — yil va semestr uchun alohida tugma; u butun
   tizimda standart sifatida ishlatiladi. Oldingi joriy yozuv avtomatik
   olib tashlanadi.

> Bir vaqtning o'zida faqat **bitta** joriy o'quv yili va bitta joriy semestr
> bo'lishi mumkin — buni baza darajasidagi cheklov ham kafolatlaydi.

---

## 3. Foydalanuvchilar

### Yaratish

**Foydalanuvchilar → Yangi**

Parol ko'rsatilmasa, tizim tasodifiy parol generatsiya qiladi va uni
foydalanuvchiga **email orqali** yuboradi.

### Rol berish

Rol berish uchun **doira (scope)** ham ko'rsatiladi:

| Rol            | Kerakli scope       |
| -------------- | ------------------- |
| Dekanat        | Fakultet            |
| Kafedra mudiri | Kafedra             |
| Metodist       | Fakultet            |
| Tashqi ekspert | **Muddat majburiy** |

Bu talab **majburiy**: doirasiz yuborilgan so'rov 400 (`VALIDATION_ERROR`) bilan qaytadi
(`validation.scope_faculty_required`, `validation.scope_department_required`,
`validation.required_for_temporary_role`), foydalanuvchi yaratishda ham xuddi
shu qoida amal qiladi. Kafedra mudiri uchun fakultet **kafedradan avtomatik
chiqariladi**; kafedra boshqa fakultetga tegishli bo'lsa —
`validation.department_not_in_faculty`.

Interfeys: **Foydalanuvchilar → qator → "Rol berish"**. Oynada joriy rollar
(doirasi bilan, "×" — bekor qilish), rol tanlovi va rolga qarab fakultet /
kafedra / muddat maydonlari; talab bajarilmaguncha "Saqlash" faol bo'lmaydi.
Ro'yxatda rol nishoni doira bilan ko'rsatiladi: _Dekanat · Aniq fanlar_.

Rol berilgandan keyin foydalanuvchining ruxsatlari **darhol** yangilanadi.

### Bloklash

Foydalanuvchini o'chirish o'rniga **bloklang**: hisob ishlamay qoladi, barcha
sessiyalari bekor qilinadi, ammo ma'lumotlari (baholar, ishlar) saqlanadi.

> Tizimda **fizik o'chirish yo'q**. Barcha o'chirishlar mantiqiy (`deletedAt`)
> va tiklanishi mumkin.

---

## 4. Xavfsizlik

### Parol siyosati

`.env` orqali sozlanadi:

```bash
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_MIXED_CASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SYMBOL=false
PASSWORD_HISTORY_SIZE=5      # oxirgi 5 parolni qayta ishlatib bo'lmaydi
LOGIN_MAX_ATTEMPTS=5         # keyin hisob vaqtincha bloklanadi
LOGIN_LOCKOUT_MINUTES=15
```

Parollar **Argon2id** bilan xeshlanadi (OWASP 2021 parametrlari).

### Sessiyalar

- Access token — 15 daqiqa, faqat brauzer xotirasida;
- Refresh token — 30 kun, `httpOnly` cookie da, har yangilashda **rotatsiya**.

Agar eski refresh token qayta ishlatilsa (o'g'irlik alomati), butun token
oilasi bekor qilinadi va foydalanuvchi barcha qurilmalardan chiqariladi.

### Audit jurnali

**Audit** bo'limida barcha muhim amallar: kim, nima qildi, qachon, qaysi IP dan.

Jurnal **o'zgartirilmaydi**: baza triggeri `UPDATE` va `DELETE` ni bloklaydi.
Baho va davomat tarixi ham xuddi shunday himoyalangan.

Maxfiy maydonlar (parol, token, TOTP siri) jurnalda `***` bilan almashtiriladi.

---

## 5. Sozlamalar va feature flags

### Sozlamalar

**Sozlamalar** bo'limida muassasa nomi, manzili, baholash chegaralari va
brendlash parametrlari. `isPublic` belgilangan sozlamalar autentifikatsiyasiz
ham o'qiladi (login sahifasida ko'rsatish uchun).

### Feature flags

Imkoniyatlarni bosqichma-bosqich yoqish uchun:

| Bayroq         | Ta'siri                    |
| -------------- | -------------------------- |
| `gamification` | Nishonlar, XP, reyting     |
| `payments`     | Pullik kurslar             |
| `proctoring`   | Imtihon nazorati hooklari  |
| `telegram`     | Telegram bildirishnomalari |
| `peer_review`  | O'zaro baholash            |

Bayroq o'zgarishi **30 soniya** ichida kuchga kiradi (kesh TTL).

---

## 6. Integratsiyalar

Har bir integratsiya `mock` rejimda ham ishlaydi — tizim kalitlarsiz to'liq
sinaladi. Real ulanish uchun `.env` da rejimni o'zgartiring.

### HEMIS

```bash
HEMIS_MODE=live
HEMIS_BASE_URL=https://hemis.qdu.uz/api
HEMIS_API_TOKEN=...
HEMIS_SYNC_CRON="0 3 * * *"
```

**Integratsiyalar → HEMIS → Sinxronlash** yoki har kuni 03:00 da avtomatik.

Sinxronizatsiya printsiplari:

- **Idempotent** — bir necha marta ishlatilsa dublikat yaratmaydi;
- HEMIS ma'lumoti **lokal o'zgarishlarni o'chirmaydi** (masalan, qo'lda
  tuzatilgan email saqlanadi);
- chetlashtirilgan talaba **bloklanadi**, o'chirilmaydi;
- har bir seans jurnalga yoziladi: nechta o'qildi, yaratildi, xatolik.

> HEMIS spetsifikatsiyasi o'zgarsa, o'zgarish faqat
> `apps/api/src/modules/integrations/providers/hemis.adapter.ts` fayliga tegadi.

### SMS (Eskiz)

```bash
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=...
ESKIZ_PASSWORD=...
ESKIZ_SENDER=4546
```

OTP so'rovlari cheklangan: bir raqamga **10 daqiqada 3 marta**.

### E-IMZO

```bash
SIGNATURE_PROVIDER=eimzo
EIMZO_VERIFY_URL=https://...
```

Imzo brauzerdagi E-IMZO plaginida yaratiladi, server uni tekshiradi va
hujjatga imzo metadatasini biriktiradi.

### To'lov

```bash
PAYMENT_PROVIDER=payme
PAYME_MERCHANT_ID=...
PAYME_SECRET_KEY=...
```

Webhook imzosi tekshiriladi — soxta "to'lov bajarildi" so'rovi qabul qilinmaydi.

---

### LTI 1.3 (tashqi platformalar)

**Alohida line item'lar.** Kurs jamlanmasi launch'da kelgan `lineitem` ga foiz
sifatida boradi. Har bir test/topshiriq bahosi esa platformada avtomatik
yaratiladigan alohida line item'ga (Moodle jurnalida alohida ustun, nomi —
test/topshiriq nomi, maksimal ball — o'sha faoliyatniki) xom ball bilan
yuboriladi. Buning uchun platforma `lineitem` (yozish) scope'ini bergan
bo'lishi kerak; aks holda faqat jamlanma yuboriladi. Yaratilgan line item'lar
kurs sahifasidagi LTI panelida ko'rinadi.

**Sozlamalar → LTI platformalari** (faqat Super administrator; Muassasa
administratori ro'yxatni ko'radi). Bizning LMS **Tool** rejimida ishlaydi:
Moodle, Canvas yoki boshqa LMS foydalanuvchini bizga uzatadi, biz esa uni
avtomatik tanib, kerak bo'lsa hisob ochib, kursga kiritamiz.

Ikki tomonlama ro'yxatga olish:

1. **Platformada** (Moodle: _Site administration → Plugins → External tool →
   Manage tools → Configure a tool manually_) sahifadagi **tool manzillari**
   kiritiladi: Initiate login URL, Redirect/Launch URL, JWKS URL. Custom
   parametr sifatida `course_id=<kurs UUID>` berilsa, foydalanuvchi to'g'ridan-to'g'ri
   o'sha kursga tushadi (talaba avtomatik yoziladi; o'qituvchiga kursga huquq
   **avtomatik berilmaydi** — bu kurs egasining qarori).
2. **Bizda** platforma yozuvi: nom, `issuer`, `client_id`, `deployment_id`,
   auth (OIDC) va token manzillari, hamda kalit manbasi — **JWKS URL** yoki
   qo'lda kiritilgan **JWKS JSON** (URL ga ulanish bo'lmagan yopiq tarmoqlar uchun).

Foydalanuvchi qanday aniqlanadi: avval platforma `sub` bo'yicha oldingi
bog'lanish, keyin `email` bo'yicha mavjud hisob (bog'lanadi), aks holda yangi
hisob — o'qituvchi rollari (`Instructor`, `TeachingAssistant`) bo'lsa TEACHER,
qolgan hollarda STUDENT. Har bir launch va yaratilgan hisob audit jurnaliga tushadi.

> **Ishlab chiqarishda** `LTI_TOOL_PRIVATE_KEY` (PKCS#8 PEM) ni `.env` da bering.
> U bo'lmasa har ishga tushishda vaqtinchalik kalit yaratiladi va platformada
> saqlangan JWKS eskiradi — loglarda ogohlantirish chiqadi.
>
> **LTI Advantage:** Deep Linking (platformadan kurs tanlash), AGS (baholarni
> platformaga qaytarish — baho o'zgarganda avtomatik, kursda qo'lda ham) va
> NRPS (a'zolarni olish/yozish) ishlaydi. Buning uchun platformada tool'ga
> tegishli xizmatlar yoqilgan bo'lishi kerak (Moodle: _Supports Deep Linking_,
> _IMS LTI Assignment and Grade Services_, _IMS LTI Names and Role Provisioning_)
> va `authTokenUrl` to'g'ri bo'lishi shart — tool shu manzildan
> `client_credentials` tokeni oladi.

## 7. Tizim salomatligi

| Endpoint                | Vazifasi                             |
| ----------------------- | ------------------------------------ |
| `/api/v1/health/live`   | Jarayon tirikmi (Docker healthcheck) |
| `/api/v1/health`        | Baza va Redis holati                 |
| `/api/v1/health/queues` | Navbatlar statistikasi               |
| `/metrics`              | Prometheus metrikalari               |

**Sozlamalar → Tizim statistikasi** da foydalanuvchilar, kurslar, fayllar hajmi
va audit yozuvlari soni ko'rinadi.

### Navbatlar

Og'ir vazifalar (video transkodlash, hisobot, ommaviy email) navbatda bajariladi.
`/health/queues` da `waiting` soni doimiy o'sib borsa — worker konteynerlarini
ko'paytiring:

```bash
docker compose up -d --scale worker=3
```

---

## 8. Rejali vazifalar

Tizim quyidagilarni avtomatik bajaradi:

| Vaqt           | Vazifa                                         |
| -------------- | ---------------------------------------------- |
| Har 5 daqiqada | Muddati o'tgan test urinishlarini yakunlash    |
| Har kuni 03:00 | HEMIS sinxronizatsiyasi                        |
| Har kuni 03:30 | Tashlandiq fayllar va eski kalitlarni tozalash |
| Har kuni 04:00 | Nishonlarni tekshirish va berish               |
| Dushanba 00:05 | Haftalik XP ni nolga tushirish                 |

---

## 9. Zaxira nusxa

Batafsil: [`deploy.md`](./deploy.md) §5.

Qisqacha:

```bash
# Baza
docker exec lms-postgres pg_dump -U lms -Fc lms > backup-$(date +%F).dump

# Fayllar (MinIO)
docker exec lms-minio mc mirror --overwrite local/lms-media /backup/media
```

**RPO ≤ 1 soat, RTO ≤ 4 soat** — buning uchun WAL arxivlash yoqilishi kerak.

---

## 10. Muammolarni bartaraf etish

| Alomat                       | Sabab va yechim                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Foydalanuvchi kira olmayapti | Hisob bloklangan yoki `PENDING`. Foydalanuvchilar bo'limida holatni tekshiring   |
| "Ruxsat yetarli emas"        | Rol yoki scope noto'g'ri. Audit jurnalida qaysi ruxsat talab qilingani ko'rinadi |
| Video ochilmayapti           | Transkodlash tugamagan. `/health/queues` da `media` navbatini tekshiring         |
| Hujjat yaratilmayapti        | `report` navbati. Worker ishlab turganini tekshiring                             |
| Email kelmayapti             | Dev muhitida MailHog (`:8025`). Prod'da SMTP sozlamalarini tekshiring            |
| Bildirishnoma kelmayapti     | Foydalanuvchining kanal sozlamalari yoki "sokin soatlar"                         |
| Sekin ishlayapti             | `/metrics` da so'rov vaqtlarini ko'ring; PostgreSQL `pg_stat_statements`         |

### Loglar

Barcha loglar **JSON** formatida va `traceId` bilan. Foydalanuvchi xatolik
haqida xabar bersa, undan `traceId` ni so'rang — u xatolik oynasida ko'rsatiladi:

```bash
docker compose logs api | grep "<traceId>"
```

---

## 11. Nima qilib bo'lmaydi (ataylab)

Bu cheklovlar xavfsizlik uchun qo'yilgan va ularni aylanib o'tish tavsiya etilmaydi:

- **Audit jurnalini tahrirlash yoki o'chirish** — baza triggeri bloklaydi;
- **Baho tarixini o'zgartirish** — append-only;
- **Yopilgan jurnaldagi bahoni oddiy o'qituvchi o'zgartirishi** — dekanat ruxsati
  va sabab talab qilinadi;
- **Fizik o'chirish** — barcha o'chirishlar mantiqiy;
- **Sirlarni interfeys orqali ko'rish** — ular faqat muhit o'zgaruvchilarida.
