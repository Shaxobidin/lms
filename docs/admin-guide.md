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

## 2. Tashkiliy tuzilma

**Tuzilma** bo'limi iyerarxiyani boshqaradi:

```
Fakultet → Kafedra → Yo'nalish → Guruh → Talaba
```

### Tartib

1. **Fakultet** yarating (kod + nom 4 tilda).
2. Fakultet ichida **kafedralar**.
3. Kafedra ostida **yo'nalishlar** (davlat klassifikatori kodi bilan, masalan `60110100`).
4. Yo'nalish uchun **guruhlar** (`MI-24-01` ko'rinishida).

> **Fakultetni o'chirish** faqat u bo'sh bo'lsa mumkin. Bu tasodifiy ma'lumot
> yo'qotishning oldini oladi — avval kafedralarni ko'chiring.

### O'quv yili va semestr

**Tuzilma → O'quv yillari**

1. O'quv yili yarating: `2026-2027`, sanalar bilan.
2. Semestrlarni qo'shing (1, 2), boshlanish/tugash sanalari va
   **jurnal yopilish sanasi** bilan.
3. Joriy semestrni belgilang — u butun tizimda standart sifatida ishlatiladi.

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
