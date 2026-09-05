# Yuk sinovi natijalari

NF-01 (API p95 < 300 ms) va NF-02 (500 RPS) bo'yicha o'lchov. Sana: **2026-09-05**.

---

## 1. Metodika

**Vosita:** `scripts/load-test.mjs` (loyihaning o'z skripti, tashqi bog'liqliksiz).

**Nima uchun o'z skripti:** yuk **ko'p foydalanuvchi** ustiga taqsimlanishi shart
edi. Bitta hisob bilan urish noto'g'ri natija beradi, chunki:

- rolga qarab rate limit qo'yilgan (§8): talaba uchun 300 so'rov/daqiqa = 5 RPS;
- ABAC boshqa talabaning kursiga murojaatni **arzon** rad etadi — bunday
  so'rovlar p95 ni sun'iy yaxshilab ko'rsatardi.

Shu sababli har bir virtual foydalanuvchi (VU) o'z hisobi bilan kiradi va
**faqat o'zi yozilgan kurs** bilan ishlaydi. Skript ishga tushishdan oldin
barcha ssenariylarni tekshiradi: birortasi 200 dan boshqa status qaytarsa,
o'lchov umuman boshlanmaydi.

**Ssenariylar** — talabaning odatiy sessiyasiga taqlid qiladi:

| Endpoint                             | Og'irlik |
| ------------------------------------ | -------- |
| `GET /courses`                       | 18%      |
| `GET /courses/:id`                   | 14%      |
| `GET /content/progress/course/:id`   | 14%      |
| `GET /courses/:id/assignments`       | 14%      |
| `GET /grading/courses/:id/my-result` | 14%      |
| `GET /notifications`                 | 10%      |
| `GET /courses/:id/quizzes`           | 8%       |
| `GET /analytics/student-overview`    | 8%       |

**Sinov muhiti** (natijalarni o'qiyotganda hisobga oling):

- Windows 11, 8 mantiqiy yadro, Docker Desktop ga 3.7 GB RAM;
- API, PostgreSQL, Redis, MinIO, worker — **bitta mashinada**, konteynerlarda;
- yuk generatori ham **shu mashinada** ishlaydi va CPU ni bo'lishadi;
- `BUILD_TARGET=production` (kompilyatsiya qilingan build, watcher'siz).

---

## 2. Bitta API instansiyasining sig'imi

Har bir o'lchov: 20 s, 5 s isitishdan keyin.

| Bir vaqtdagi VU | Tezlik (RPS) | p50 (ms) | p95 (ms) | NF-01 |
| --------------- | ------------ | -------- | -------- | ----- |
| 20              | 236          | 82       | **121**  | ✅    |
| 40              | 240          | 160      | **244**  | ✅    |
| 60              | 319          | 182      | **258**  | ✅    |
| 80              | 276          | 281      | 409      | ❌    |
| 100             | 257          | 380      | 546      | ❌    |

**Xulosa:** bitta API instansiyasi ushbu mashinada **~300 RPS** ni p95 < 300 ms
bilan uzluksiz xizmat qiladi. 60 VU dan keyin tizim to'yinadi: tezlik o'smaydi,
kechikish esa navbat hisobiga o'sadi — klassik saturatsiya belgisi.

Yuk paytida `docker stats`: **`lms-api` ~300% CPU**, PostgreSQL ~3%, Redis ~1%.
Ya'ni to'siq — ilova instansiyasining o'zi (Node + Prisma), ma'lumotlar bazasi
emas. Bu to'g'ri natija: baza indekslari va so'rovlar optimallashtirilgan.

---

## 3. Gorizontal masshtablanish (§5, §6)

Ikkinchi API instansiyasi bir xil image va bir xil muhit bilan 4001-portda
ishga tushirildi.

**Stateless tekshiruvi:** 4000-portda olingan token 4001-portda **200** bilan
qabul qilindi. Ya'ni sessiya instansiyaga bog'lanmagan (ADR-005: JWT + Redis),
sticky session kerak emas — istalgan balanslovchi ishlaydi.

| Konfiguratsiya | Tezlik (RPS) | p95 (ms) |
| -------------- | ------------ | -------- |
| 1 instansiya   | 258          | 689      |
| 2 instansiya   | **344**      | 516      |

120 VU da tezlik **+33%** oshdi. Ikki barobar bo'lmaganining sababi — sinov
mashinasi: ikkita instansiya birgalikda ~6 yadroni egallaydi, qolganini
PostgreSQL va yuk generatorining o'zi bo'lishadi. **Alohida serverda o'sish
chiziqli bo'lishi kutiladi**, chunki ilova qatlamida umumiy holat yo'q.

---

## 4. NF-02 (500 RPS) haqida

Ushbu sinov mashinasida 500 RPS ga erishilmadi (eng yuqori natija — 2 instansiya
bilan 344 RPS). Sabab **arxitektura emas, apparat**:

- yuk generatori va butun infratuzilma bitta 8 yadroli mashinada;
- Docker Desktop ga atigi 3.7 GB RAM ajratilgan.

`docs/deploy.md` §1 dagi minimal konfiguratsiya (ilova serveri: 8 yadro, 16 GB)
va o'lchangan sig'im asosida **500 RPS uchun 2 ta API instansiyasi yetarli**,
zaxira bilan **3 ta** tavsiya etiladi. Instansiyalar Nginx `upstream` orqali
balanslanadi (`infra/nginx/conf.d/lms.conf`).

> **Bajarilishi kerak:** yakuniy tasdiqlash ishlab chiqarish apparatida
> takrorlanishi shart. Bu sinov arxitektura to'siqlari yo'qligini ko'rsatadi,
> lekin ishlab chiqarish ko'rsatkichlarini almashtira olmaydi.

---

## 5. Rate limit sinov davomida

Yuk sinovi rolga qarab qo'yilgan limitni ham tasdiqladi: 80 VU bilan
`TARGET_RPS=500` berilganda so'rovlarning **28%** i 429 bilan rad etildi —
chunki har bir talaba uchun chegara 300 so'rov/daqiqa. Bu **kutilgan** xatti-
harakat: NF-02 dagi 500 RPS 2 000 foydalanuvchiga taqsimlanadi (foydalanuvchi
boshiga 0.25 RPS), ya'ni real foydalanishda chegaraga yaqinlashilmaydi.

---

## 6. Takrorlash

```bash
# Bitta instansiya, standart yuk
npm run load-test

# Yukni oshirish
VUS=60 DURATION=30 node scripts/load-test.mjs

# Ikki instansiya bo'yicha taqsimlash
API_URLS=http://localhost:4000/api/v1,http://localhost:4001/api/v1 \
  VUS=120 node scripts/load-test.mjs
```

Brute-force himoyasi (15 daqiqada 10 urinish) tufayli tokenlar diskda
keshlanadi. Limitga urilsangiz, **sinov muhitida** hisoblagichni tozalash mumkin:

```bash
docker exec lms-redis sh -c \
  "redis-cli --scan --pattern 'rl:auth:*' | xargs -r redis-cli DEL"
```
