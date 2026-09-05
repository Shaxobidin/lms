# Deploy va ekspluatatsiya qo'llanmasi

QDU LMS ni ishlab chiqarish muhitiga joylashtirish, zaxira nusxa olish va
monitoring qilish.

---

## 1. Talablar

### Minimal server konfiguratsiyasi

2 000 bir vaqtdagi foydalanuvchi va 500 RPS uchun (NF-02):

| Komponent                 | CPU     | RAM   | Disk              |
| ------------------------- | ------- | ----- | ----------------- |
| Ilova serveri (API + web) | 8 yadro | 16 GB | 100 GB SSD        |
| PostgreSQL                | 8 yadro | 32 GB | 500 GB SSD (NVMe) |
| Redis                     | 2 yadro | 4 GB  | 20 GB             |
| Obyekt saqlash (MinIO)    | 4 yadro | 8 GB  | **5 TB+**         |

> **Ma'lumotlar joylashuvi:** shaxsga doir ma'lumotlar O'zbekiston Respublikasi
> hududidagi serverlarda saqlanishi shart (`promt.md` §11). Bulut xizmatini
> tanlashda buni hisobga oling.

### Dasturiy talablar

- Docker Engine 24+ va Docker Compose v2
- Node.js 20 LTS (agar Docker'siz ishga tushirilsa)
- TLS sertifikati (Let's Encrypt yoki tashkilot sertifikati)

### Docker rejimlari va xotira

| Rejim                         | Buyruq                                         | Ilova konteynerlari xotirasi |
| ----------------------------- | ---------------------------------------------- | ---------------------------- |
| Ishlab chiqarish (production) | `BUILD_TARGET=production docker compose up -d` | ~300 MB                      |
| Ishlab chiqish (development)  | `docker compose up -d`                         | ~2.5 GB                      |

> Development target da `api`, `worker` va `web` ning har biri alohida
> kuzatuvchi (watcher) jarayonini yuritadi. Docker Desktop ga 4 GB dan kam
> ajratilgan bo'lsa `web` `ENOMEM: not enough memory, scandir` xatosi bilan
> yiqiladi. Serverda **har doim** `BUILD_TARGET=production` ishlatilsin.

> **Konteyner ichidagi portlar.** `.env` dagi `REDIS_PORT`, `POSTGRES_PORT`
> kabi o'zgaruvchilar faqat **host** portlarini belgilaydi. Konteynerlar
> bir-biriga har doim ichki portlar (6379, 5432, 9000) orqali murojaat qiladi —
> bu `docker-compose.yml` da qat'iy qadalgan.

---

## 2. Muhitni tayyorlash

### 2.1. Sirlarni generatsiya qilish

```bash
cp .env.example .env

# JWT sirlari (har biri kamida 32 belgi)
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET

# Shifrlash kaliti (aynan 64 ta hex belgi)
openssl rand -hex 32      # -> CRYPTO_SECRET_KEY

# Baza va MinIO parollari
openssl rand -base64 24
```

### 2.2. Majburiy prod sozlamalari

```bash
NODE_ENV=production
COOKIE_SECURE=true                    # HTTPS majburiy
COOKIE_DOMAIN=lms.qdu.uz
CORS_ORIGINS=https://lms.qdu.uz
API_PUBLIC_URL=https://lms.qdu.uz
WEB_PUBLIC_URL=https://lms.qdu.uz
MEDIA_PUBLIC_URL=https://media.lms.qdu.uz
LOG_PRETTY=false                      # JSON loglar (NF-07)
```

> Ilova ishga tushishda konfiguratsiyani **tekshiradi**: standart yoki zaif
> qiymatlar (`replace_with...`, `COOKIE_SECURE=false`) bilan prod rejimda
> **ishga tushmaydi**. Bu ataylab qilingan.

---

## 3. Ishga tushirish

### 3.1. Docker Compose bilan

```bash
# Image larni qurish
BUILD_TARGET=production docker compose build

# Ma'lumot xizmatlarini ko'tarish
docker compose up -d postgres redis minio minio-init

# Migratsiyalarni qo'llash
docker compose run --rm api npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

# Rollar va boshlang'ich ma'lumotlar (faqat birinchi marta)
docker compose run --rm api npm run db:seed --workspace=@lms/api

# Ilovani va Nginx ni ishga tushirish
BUILD_TARGET=production docker compose --profile prod up -d
```

### 3.2. Tekshirish

```bash
curl -f https://lms.qdu.uz/api/v1/health
node scripts/smoke.mjs https://lms.qdu.uz/api/v1
```

Smoke test §15 dagi barcha qabul mezonlarini tekshiradi.

---

## 4. Nginx va TLS

Konfiguratsiya: `infra/nginx/nginx.conf` va `infra/nginx/conf.d/lms.conf`.

### 4.1. Sertifikat

```bash
# Let's Encrypt (certbot)
docker run --rm -v ./infra/nginx/certs:/etc/letsencrypt \
  -v ./infra/nginx/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d lms.qdu.uz -d media.lms.qdu.uz --email admin@qdu.uz --agree-tos
```

Sertifikat `infra/nginx/certs/fullchain.pem` va `privkey.pem` sifatida ulanadi.

### 4.2. Nginx da nima sozlangan

| Sozlama                  | Qiymat                                                      |
| ------------------------ | ----------------------------------------------------------- |
| TLS                      | 1.2 va 1.3, OCSP stapling                                   |
| HSTS                     | 2 yil, `includeSubDomains; preload`                         |
| CSP                      | Faqat o'z domeni + media domeni; SCORM uchun sandbox iframe |
| Rate limit (auth)        | 10 so'rov / daqiqa                                          |
| Rate limit (API)         | 300 so'rov / daqiqa                                         |
| Fayl hajmi               | 512 MB                                                      |
| SSE (`/api/v1/stream`)   | Buferlash o'chirilgan, 1 soat timeout                       |
| Statik (`/_next/static`) | 1 yil kesh, `immutable`                                     |

> **Media alohida domendan** (`media.lms.qdu.uz`) uzatiladi — bu yuklangan
> fayl orqali asosiy domenga hujum qilish imkoniyatini yo'q qiladi (§11).

---

## 5. Zaxira nusxa

### 5.1. Ma'lumotlar bazasi

**RPO ≤ 1 soat** talabi uchun ikki qatlam:

**a) To'liq nusxa (kunlik):**

```bash
#!/bin/bash
# /opt/lms/backup-db.sh
set -euo pipefail

BACKUP_DIR=/backup/postgres
DATE=$(date +%F-%H%M)

docker exec lms-postgres pg_dump -U lms -Fc -Z6 lms \
  > "$BACKUP_DIR/lms-$DATE.dump"

# 30 kundan eski nusxalarni o'chirish
find "$BACKUP_DIR" -name "lms-*.dump" -mtime +30 -delete

echo "Zaxira nusxa tayyor: lms-$DATE.dump"
```

**b) WAL arxivlash (uzluksiz):**

`postgresql.conf` da:

```
archive_mode = on
archive_command = 'test ! -f /wal-archive/%f && cp %p /wal-archive/%f'
wal_level = replica
```

Bu istalgan nuqtaga tiklash (PITR) imkonini beradi.

### 5.2. Fayllar

```bash
#!/bin/bash
# /opt/lms/backup-files.sh
docker exec lms-minio mc mirror --overwrite --remove \
  local/lms-media /backup/media
```

### 5.3. Cron jadvali

```cron
# Baza — har kuni 02:00
0 2 * * * /opt/lms/backup-db.sh >> /var/log/lms-backup.log 2>&1

# Fayllar — har kuni 03:00
0 3 * * * /opt/lms/backup-files.sh >> /var/log/lms-backup.log 2>&1

# Zaxira nusxani tekshirish — haftada bir marta
0 4 * * 0 /opt/lms/verify-backup.sh
```

> **Tekshirilmagan zaxira nusxa — zaxira nusxa emas.** Har hafta tiklashni
> sinov muhitida sinab ko'ring.

---

## 6. Tiklash (RTO ≤ 4 soat)

### 6.1. Ma'lumotlar bazasini tiklash

```bash
# 1. Ilovani to'xtatish (baza o'zgarmasligi uchun)
docker compose stop api worker web

# 2. Bazani tiklash
docker exec -i lms-postgres pg_restore -U lms -d lms --clean --if-exists \
  < /backup/postgres/lms-2026-09-04-0200.dump

# 3. Migratsiya holatini tekshirish
docker compose run --rm api npx prisma migrate status --schema=apps/api/prisma/schema.prisma

# 4. Ilovani qayta ishga tushirish
docker compose --profile prod up -d
```

### 6.2. Migratsiyani qaytarish

Prisma faqat oldinga ishlaydi, shuning uchun har bir migratsiya uchun qo'lda
`down.sql` yozilgan:

```bash
docker exec -i lms-postgres psql -U lms -d lms \
  < apps/api/prisma/migrations/20260904000100_search_and_constraints/down.sql
```

Keyin `_prisma_migrations` jadvalidan tegishli yozuvni olib tashlang.

---

## 7. Yangilash (zero-downtime)

```bash
# 1. Yangi kodni olish va image larni qurish
git pull origin main
BUILD_TARGET=production docker compose build api web

# 2. Migratsiyalar (orqaga mos bo'lishi shart!)
docker compose run --rm api npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

# 3. API ni ketma-ket almashtirish
docker compose up -d --no-deps --scale api=2 api
sleep 30                                   # yangi instans sog'lom bo'lishini kutish
docker compose up -d --no-deps --scale api=1 api

# 4. Web
docker compose up -d --no-deps web

# 5. Tekshirish
node scripts/smoke.mjs https://lms.qdu.uz/api/v1
```

### Migratsiya qoidalari (zero-downtime uchun)

Eski va yangi kod bir vaqtda ishlashi mumkin, shuning uchun:

1. **Ustun qo'shish** — har doim `NULL` ruxsat bilan yoki standart qiymat bilan;
2. **Ustun o'chirish** — ikki bosqichda: avval koddan olib tashlang, keyingi
   relizda bazadan;
3. **Nom o'zgartirish** — yangi ustun qo'shing, ma'lumotni ko'chiring, keyin
   eskisini o'chiring;
4. **Indeks** — katta jadvallarda `CREATE INDEX CONCURRENTLY`.

---

## 8. Monitoring

### 8.1. Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'lms-api'
    metrics_path: /metrics
    static_configs:
      - targets: ['api:4000']
```

### 8.2. Kuzatiladigan ko'rsatkichlar

| Metrika               | Ogohlantirish chegarasi |
| --------------------- | ----------------------- |
| API javob vaqti p95   | > 300 ms (NF-01)        |
| 5xx xatoliklar ulushi | > 1%                    |
| Navbat `waiting` soni | > 500 va o'sib boryapti |
| PostgreSQL ulanishlar | > 80% `max_connections` |
| Redis xotira          | > 80% `maxmemory`       |
| Disk (MinIO)          | > 85%                   |
| Sertifikat muddati    | < 14 kun                |

### 8.3. Loglar

Barcha loglar JSON formatida va `traceId` bilan:

```bash
# Muayyan so'rovni topish
docker compose logs api | grep '"traceId":"<id>"'

# Sekin so'rovlar
docker compose logs api | grep "Sekin so'rov"

# Xatoliklar
docker compose logs api | grep '"level":50'
```

Loglarni markazlashtirish uchun Loki yoki Elasticsearch ga yo'naltiring.

---

## 9. Masshtablash

### API va worker

API **stateless** (NF-08) — bemalol ko'paytiriladi:

```bash
docker compose up -d --scale api=4 --scale worker=3
```

Sessiya holati Redis'da, shuning uchun foydalanuvchi istalgan instansga tushishi mumkin.

### PostgreSQL

O'qish yuklamasini kamaytirish uchun replika:

```bash
DATABASE_URL=postgresql://...@primary:5432/lms
DATABASE_REPLICA_URL=postgresql://...@replica:5432/lms
```

### Redis

Redis siyosati **`noeviction`** bo'lishi shart — BullMQ navbatlari yo'qolmasligi
uchun. Kesh yozuvlari TTL bilan saqlanadi, shuning uchun xotira o'z-o'zidan bo'shaydi.

---

## 10. Xavfsizlik nazorati

### Muntazam tekshiruvlar

| Davriylik  | Vazifa                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Har kuni   | Audit jurnalidagi shubhali amallar (`token_reuse_detected`, ko'p `FORBIDDEN`) |
| Har hafta  | `npm audit`, zaxira nusxani tiklash sinovi                                    |
| Har oy     | Faol sessiyalar va rollar reviziyasi                                          |
| Har chorak | Sirlarni almashtirish (JWT kalitlari, baza parollari)                         |

### Sirlarni almashtirish

JWT kalitini almashtirganda barcha foydalanuvchilar chiqib ketadi — buni
ish vaqtidan tashqarida bajaring va oldindan xabar bering.

### Hodisaga javob

Hisob buzilgani aniqlansa:

```bash
# 1. Hisobni bloklash (interfeys orqali yoki to'g'ridan-to'g'ri)
# 2. Barcha sessiyalarni bekor qilish
docker exec -i lms-postgres psql -U lms -d lms -c \
  "UPDATE sessions SET revoked = true, \"revokedReason\" = 'security_incident' WHERE \"userId\" = '<id>';"

# 3. Audit jurnalidan amallarni tekshirish
docker exec -i lms-postgres psql -U lms -d lms -c \
  "SELECT action, resource, ip, \"createdAt\" FROM audit_logs WHERE \"actorId\" = '<id>' ORDER BY \"createdAt\" DESC LIMIT 100;"
```

---

## 11. Ishga tushirishdan oldingi ro'yxat

- [ ] `.env` dagi barcha sirlar generatsiya qilingan (standart qiymat yo'q)
- [ ] `COOKIE_SECURE=true`, `NODE_ENV=production`
- [ ] TLS sertifikati o'rnatilgan va avtomatik yangilanadi
- [ ] `docker compose --profile prod up -d` muvaffaqiyatli
- [ ] `node scripts/smoke.mjs` — barcha tekshiruvlar yashil
- [ ] Zaxira nusxa cron ishlayapti va **tiklash sinovdan o'tgan**
- [ ] WAL arxivlash yoqilgan (RPO ≤ 1 soat)
- [ ] Prometheus metrikalarni yig'moqda, ogohlantirishlar sozlangan
- [ ] Loglar markazlashtirilgan
- [ ] HEMIS integratsiyasi `live` rejimda sinovdan o'tgan
- [ ] SMTP va SMS provayderlari sinovdan o'tgan
- [ ] Administrator hisobiga 2FA yoqilgan
- [ ] Demo hisoblar (`talaba@qdu.uz` va boshqalar) **o'chirilgan yoki bloklangan**

> **Oxirgi band muhim:** demo hisoblar hammaga ma'lum parol bilan ishlaydi.
> Ishlab chiqarishga o'tishdan oldin ularni albatta bloklang.
