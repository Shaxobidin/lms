# O'qituvchi qo'llanmasi

QDU LMS da kurs yaratishdan baho qo'yishgacha bo'lgan to'liq ish oqimi.

> **Demo hisob:** `oqituvchi@qdu.uz` · parol `Demo!2026`

---

## 1. Tizimga kirish

1. Brauzerda `https://lms.qdu.uz` (yoki dev muhitida `http://localhost:3000`) ni oching.
2. Elektron pochta yoki telefon raqamingiz va parolingizni kiriting.
3. Agar ikki bosqichli tasdiqlash (2FA) yoqilgan bo'lsa — autentifikator
   ilovasidagi 6 xonali kodni kiriting.

**Interfeys tilini** yuqori o'ng burchakdagi `UZ` tugmasi orqali istalgan vaqtda
o'zgartirishingiz mumkin (o'zbekcha lotin, kirill, rus, ingliz).

**Qorong'i rejim** — oy/quyosh belgisi orqali.

---

## 2. Kurs yaratish

### 2.1. Yangi kurs

**Kurslar → Kurs yaratish**

Majburiy maydonlar:

| Maydon        | Izoh                                                            |
| ------------- | --------------------------------------------------------------- |
| Kurs kodi     | Noyob bo'lishi kerak, masalan `INF201-2026-1`                   |
| Kurs nomi     | Kamida bitta tilda to'ldiriladi; qolgan tillar keyin qo'shiladi |
| Kafedra       | Kurs qaysi kafedraga tegishli                                   |
| Ta'lim shakli | Masofaviy / Aralash / An'anaviy                                 |

> **Baholash siyosati** avtomatik ravishda fanning **tasdiqlangan sillabusidan**
> olinadi (JN/ON/YN og'irliklari). Sillabus bo'lmasa standart 30/30/40 qo'llanadi.

### 2.2. Tahrirlash rejimi

Kurs sahifasida **Tahrirlash rejimi** kaliti bor. U **o'chirilgan** holatda siz
kursni talaba ko'radigan ko'rinishda ko'rasiz — materialni nashr qilishdan
oldin tekshirish uchun qulay. Kalitni yoqsangiz har bir element yonida amallar
paydo bo'ladi: tahrirlash, nashr etish, siljitish, o'chirish.

### 2.3. Tuzilma qo'shish

Kurs ichida iyerarxiya: **Modul → Mavzu → Dars → Material**

1. Kurs sahifasida **Modullar** tabini oching va **Tahrirlash rejimi** ni yoqing.
2. **Modul qo'shish** — masalan "1-modul: Kirish".
3. Modul ichida **Mavzu qo'shish**, mavzu ichida **Dars qo'shish**.
4. Dars nomini bosing — dars muharriri ochiladi: matn va materiallar shu yerda.

**Nomlar 4 tilda.** Oynada o'zbekcha (lotin) majburiy; "Boshqa tillar" ni ochib
kirill, rus va ingliz variantlarini kiritasiz. Bo'sh qoldirilgan til uchun
o'zbekcha matn ko'rsatiladi.

### 2.4. Element yoki resurs qo'shish

Mavzu ostidagi **"Faoliyat yoki resurs qo'shish"** tugmasi Moodle dagi kabi
tanlash oynasini ochadi. Oynada qidiruv va uch toifa bor: **Hammasi**,
**Faoliyatlar**, **Resurslar**. Har bir element yonida Moodle dagi mos nomi
yozilgan — Moodle bilan ishlagan o'qituvchi darrov topadi.

**Faoliyatlar** — talaba biror ish bajaradi:

| Element      | Moodle dagi nomi | Nima bo'ladi                                     |
| ------------ | ---------------- | ------------------------------------------------ |
| Topshiriq    | Assignment       | Talaba ish yuboradi, rubrika bo'yicha baholanadi |
| Test         | Quiz             | 10 turdagi savol, taymer, avtomatik baholash     |
| Forum        | Forum            | Muhokama yoki savol-javob mavzusi                |
| Onlayn dars  | BigBlueButton    | Virtual sinf, davomat avtomatik                  |
| SCORM paketi | SCORM package    | SCORM 1.2 / 2004; natija jurnalga tushadi        |
| H5P          | H5P              | Interaktiv kontent manzili orqali                |

**Resurslar** — talaba o'qiydi yoki ko'radi:

| Element             | Moodle dagi nomi | Nima bo'ladi                              |
| ------------------- | ---------------- | ----------------------------------------- |
| Sahifa (dars)       | Page             | Matnli dars sahifasi                      |
| Fayl                | File             | Bitta fayl                                |
| Papka               | Folder           | Bir nechta fayl bitta yig'iladigan blokda |
| Havola              | URL              | Tashqi manba manzili                      |
| Matn bloki          | Label            | Darsda joyida ko'rinadigan izoh           |
| Ko'milgan kontent   | Embedded content | GeoGebra, video pleer — iframe da         |
| Video / Audio / PDF | File             | Tur avtomatik aniqlanadi                  |

> **Hozircha yo'q:** wiki, lug'at (glossary), so'rovnoma (feedback), tanlov
> (choice), ma'lumotlar bazasi va tashqi vosita (LTI). Ular alohida modul
> sifatida qo'shiladi — oynada ko'rsatilmaydi, chunki ishlamaydigan elementni
> ko'rsatish o'qituvchini chalg'itadi.

### 2.5. Tartibni o'zgartirish

Har bir element yonidagi **↑ / ↓** tugmalari bilan. Tartib darhol saqlanadi.

> Sichqonchasiz ishlash uchun ataylab tugmalar tanlangan: sudrab tashlash
> klaviatura foydalanuvchilari uchun ishlamaydi (WCAG 2.1 AA).

### 2.6. Nashr etish

Kurs va uning modullari `Qoralama` holatida bo'lsa, talabalar ularni ko'rmaydi.

- **Modul yoki dars** darajasida: qator yonidagi **ko'z** belgisi. Nashr
  etilmagan element talabaga umuman ko'rinmaydi.
- **Kurs** darajasida: **Nashr etish** tugmasi.

> Kursni nashr etish uchun kamida bitta nashr etilgan dars bo'lishi shart —
> bo'sh kurs talabaga ko'rinmasligi kerak.

### 2.7. Kursni nusxalash

Keyingi semestr uchun bir xil kursni qayta yaratish shart emas:
**Kurs sahifasi → Nusxalash**.

Nusxalanadi: modullar, mavzular, darslar, resurslar, topshiriqlar, testlar.
**Nusxalanmaydi:** talabalar, yozilishlar, baholar, topshirilgan ishlar.

### 2.7a. IMS Common Cartridge paketidan import

Boshqa tizimdan (Moodle, Canvas, Blackboard, Sakai) eksport qilingan `.imscc`
paketni kursga qo'shish: tahrirlash rejimida **IMS CC paketidan import**.

1. Faylni tanlang va **Yuklash va rejani ko'rish** — oynada nechta modul, mavzu,
   dars, fayl, havola, muhokama va test topilgani, hamda **o'tkazib yuboriladigan**
   elementlar (sababi bilan) ko'rsatiladi. Bu bosqichda hech narsa yozilmaydi.
2. **N ta modulni import qilish** — tuzilma mavjud modullardan KEYIN qo'shiladi;
   hech narsa o'chirilmaydi yoki almashtirilmaydi.

Nima nimaga aylanadi:

| Paketda                           | Kursda                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| 1-daraja bo'lim → 2-daraja → 3+   | Modul → Mavzu → Dars (sayoz daraxt to'ldiriladi)                |
| HTML sahifa (`webcontent`)        | Dars matni (xavfsiz teglar qoladi)                              |
| PDF, video, audio, boshqa fayllar | Darsdagi resurslar                                              |
| Web link, Basic LTI havola        | "Havola" resursi                                                |
| Muhokama (discussion topic)       | Kurs forumida mavzu                                             |
| Test (QTI 1.2)                    | Savollar banki + mavzuga biriktirilgan **nashr etilmagan** test |

> Testlar QTI 1.2 profillari bilan keladi: bitta/ko'p tanlov, to'g'ri/noto'g'ri,
> qisqa javob va insho o'qiladi; javobsiz yoki boshqa turdagi savollar rejada
> "o'qilmadi" deb ko'rsatiladi. Import qilingan testni nashr etishdan oldin
> ko'rib chiqing. HTML ichidagi rasm havolalari paketga nisbatan bo'lgani uchun
> ko'rinmaydi — rasmlar alohida fayl-resurs sifatida biriktiriladi.

### 2.7b. Kursni IMS CC ga eksport qilish

Tahrirlash rejimida **IMS CC eksport** — kurs tuzilmasi (modul/mavzu/dars),
dars matnlari va fayllari (matndagi rasmlar ham), havolalar, mavzuga
biriktirilgan testlar (QTI 1.2) va **forum mavzulari** (har biri discussion
topic sifatida, birinchi xabar matni bilan, alohida "Forum" moduli ostida)
`.imscc` paketiga yoziladi. Paketni Moodle,
Canvas yoki bizning importga yuklash mumkin. Hotspot, moslashtirish kabi QTI 1.2
da yo'q savol turlari paketga kirmaydi — ular javobda `skippedQuestions` deb
qaytadi.

### 2.7c. Tashqi platforma (LTI) bilan ishlash

Kursga Moodle/Canvas dan LTI orqali kirilgan bo'lsa, tahrirlash rejimida
**Tashqi platformalar (LTI)** paneli chiqadi:

- **Baholarni yuborish** (AGS) — kurs jurnalidagi jamlanma foiz platformaga
  yuboriladi. Baho o'zgarganda bu avtomatik ham bo'ladi (navbat orqali);
  tugma qo'lda takrorlash uchun.
- **A'zolarni ko'rish / Talabalarni kursga yozish** (NRPS) — platformadagi
  ro'yxat olinadi; talabalar uchun hisob ochilib kursga yoziladi, o'qituvchilar
  yozilmaydi.
- Platforma "kontent tanlang" (Deep Linking) deb yuborsa, siz bizning kurslar
  ro'yxatidan birini tanlaysiz — u platformada havola sifatida joylashadi.

### 2.8. Sillabus (metodist va kafedra mudiri uchun)

Kurs baholash siyosatini fanning **tasdiqlangan sillabusidan** oladi, shuning
uchun sillabus kursdan oldin tayyorlanadi.

**O'quv reja → Fanlar → Sillabusni ochish** (yoki **Sillabus yaratish**).

Konstruktor bitta oynada sillabusning barcha bo'limlarini yig'adi:

| Bo'lim            | Nima kiritiladi                                                |
| ----------------- | -------------------------------------------------------------- |
| Maqsad            | Fanning maqsadi (4 tilda)                                      |
| Vazifalar         | Ro'yxat                                                        |
| O'quv natijalari  | Har biri **Bloom darajasi** va kompetensiya kodi bilan         |
| Mavzular rejasi   | Ma'ruza / amaliy / laboratoriya / mustaqil soatlar, hafta      |
| Adabiyotlar       | Asosiy / qo'shimcha / elektron, havola bilan                   |
| Baholash siyosati | JN/ON/YN og'irliklari, o'tish balli, YN ga qo'yilish chegarasi |

Soatlar jami va og'irliklar yig'indisi kiritayotganda hisoblanadi; og'irliklar
**100%** bo'lmaguncha saqlab bo'lmaydi.

**Versiyalash.** Tasdiqlangan sillabus hech qachon o'zgartirilmaydi — har bir
tahrir **Yangi versiya** sifatida saqlanadi (oldingi mazmun bilan ochiladi,
o'zgarish izohi versiyalar tarixida ko'rinadi). Yangi versiya sillabusni
qoralamaga qaytaradi.

**Tasdiqlash oqimi.** Qoralama → _Tasdiqlashga yuborish_ → Ko'rib chiqilmoqda →
_Tasdiqlash_ yoki _Qaytarish_ (sabab majburiy, u muallifga bildirishnoma bilan
boradi va versiya tarixida saqlanadi). Qaytarilgan sillabus tuzatib qayta
yuboriladi.

> **Vazifalar ajratilishi:** metodist sillabusni **yozadi va yuboradi**,
> tasdiqlash yoki qaytarish esa faqat **kafedra mudiri** yoki **dekanat**
> vakolati — tizim muallifning o'z sillabusini o'zi tasdiqlashiga yo'l qo'ymaydi.

---

## 3. Kontent joylash

### 3.1. Dars muharriri

Dars nomini bosganingizda muharrir ochiladi. Unda uch bo'lim bor:

| Bo'lim             | Nimani boshqaradi                         |
| ------------------ | ----------------------------------------- |
| Dars sozlamalari   | Nomi (4 tilda), davomiyligi, nashr holati |
| Dars matni         | HTML matn — har bir til uchun alohida     |
| O'quv materiallari | Fayllar va tashqi havolalar               |

**Saqlash** tugmasi faqat o'zgarish bo'lganda faollashadi. Saqlamasdan
chiqmoqchi bo'lsangiz brauzer ogohlantiradi.

### 3.1a. Matn muharriri (Moodle uslubi)

Dars matni, element tavsifi, savol matni va forum xabari **WYSIWYG muharrirda**
yoziladi — HTML teglarini bilish shart emas. Asboblar paneli (Moodle Atto/TinyMCE
kabi): bekor qilish/qaytarish, oddiy matn / Sarlavha 2 / Sarlavha 3, qalin,
kursiv, tagiga va ustiga chizish, belgili va raqamli ro'yxat, iqtibos, kod bloki,
tekislash (chap/markaz/o'ng), havola, rasm, jadval, **HTML manba**.

- **Rasm** — fayl tanlanadi va darhol yuklanadi (S3), matnda `/lms-file/<id>`
  ko'rinishida saqlanadi; talabaga imzolangan havola bilan ko'rsatiladi.
- **Jadval** — 3×3 bosh qatorli jadval qo'yiladi; jadval ichida turib tugma
  qator qo'shadi, "Jadvalni o'chirish" tugmasi ham chiqadi.
- **Havola** — tugma bosilganda manzil maydoni ochiladi; faqat `https://`,
  `mailto:`, `tel:` yoki ichki `/...` manzillar qabul qilinadi.
- **HTML manba** — tajribali foydalanuvchi uchun: teglar bilan to'g'ridan-to'g'ri
  ishlash, qaytganda muharrir yangilanadi. Server baribir DOMPurify bilan tozalaydi.
- **Tillar** — muharrir ustidagi UZ / ЎЗ / RU / EN yorliqlari; to'ldirilgan til
  qalin ko'rinadi. Bo'sh qolgan tilda tizim zaxira tilga tushadi.

**Resursni tahrirlash.** Dars sahifasidagi materiallar ro'yxatida har bir
resurs yonida qalam tugmasi bor. Oyna Moodle uslubida bo'limlarga ajratilgan:
**Umumiy** (nom, 4 tilda), **Tarkib** (TEXT — WYSIWYG muharrirda har bir til
uchun; LINK/EMBED — manzil va balandlik; fayl resursida fayl ma'lumoti),
**Bajarilish** (majburiylik). Fayl almashtirilmaydi — yangi fayl uchun yangi
resurs qo'shiladi, eskisi o'chiriladi.

### 3.2. Fayl yuklash

**O'quv materiallari → Fayl yuklash**. Fayl turi (video, PDF, audio, SCORM)
avtomatik aniqlanadi — ro'yxatdan tanlash shart emas. Yuklash jarayoni foiz
bilan ko'rsatiladi.

Fayl **to'g'ridan-to'g'ri saqlash serveriga** yuklanadi, shuning uchun katta
videolar ham tez ketadi.

Ruxsat etilgan formatlar: PDF, DOCX, XLSX, PPTX, MP4, WebM, MP3, rasm fayllari.
Maksimal hajm: kurs kontenti uchun **512 MB**.

> Fayl yuklangandan keyin tizim uning **haqiqiy turini** tekshiradi. Agar fayl
> kengaytmasi mazmuniga mos kelmasa, u karantinga olinadi va ishlatilmaydi.

### 3.3. Video

Yuklangan video avtomatik ravishda **HLS** formatiga o'giriladi (360p / 720p / 1080p).
Bu talabaning internet tezligiga qarab sifat avtomatik moslashishini ta'minlaydi —
viloyatdagi talabalar uchun muhim.

### 3.4. Tashqi havola

**O'quv materiallari → Havola qo'shish** — YouTube videosi, veb-sahifa yoki
onlayn kutubxona manzili. Havolani **majburiy** deb belgilasangiz, u talabaning
progressiga kiradi.

O'girish fon rejimida bajariladi; tayyor bo'lgach video pleyerda ochiladi.

### 3.5. SCORM paketlari

**Kontent → SCORM import** orqali SCORM 1.2 yoki 2004 paketini (ZIP) yuklang.

Tizim `imsmanifest.xml` ni tekshiradi va paketni kurs ichida ochadi.
Talabaning natijasi (`cmi.*` holati) avtomatik saqlanadi va bahoga o'tkaziladi.

Paket buzuq bo'lsa — aniq xatolik xabari beriladi (qaysi qism yetishmayotgani).

---

## 4. Topshiriqlar

### 4.1. Yaratish

**Kurs → Topshiriqlar → Topshiriq yaratish**

| Sozlama               | Izoh                                          |
| --------------------- | --------------------------------------------- |
| Nazorat turi          | JN / ON / YN — bahoning qaysi qismiga kirishi |
| Maksimal ball         | Topshiriq uchun to'liq ball                   |
| Topshirish muddati    | Shu vaqtdan keyin ish "kechikkan" hisoblanadi |
| Kechikish bilan qabul | Shu muddatgacha qabul qilinadi, jarima bilan  |
| Kechikish jarimasi    | Foizda, masalan 10%                           |
| Urinishlar soni       | Talaba necha marta qayta yuborishi mumkin     |
| Fayl turlari          | Ruxsat etilgan formatlar (bo'sh — barchasi)   |

### 4.1a. Topshiriq sozlamalari (Moodle uslubi)

Topshiriq yaratish oynasi va **Sozlamalar** sahifasi (topshiriq sahifasidagi
tugma) bo'limlarga ajratilgan: **Umumiy** (nom, shart — muharrirda, tur, nazorat
turi), **Mavjudlik** (muddat, kechikish bilan qabul qilish oxiri, jarima %),
**Topshirish turlari** (urinishlar, fayllar soni va hajmi, qabul qilinadigan fayl
turlari guruhlari), **Baho** (maksimal ball, rubrika), **O'zaro baholash**,
**Qo'shimcha** (plagiat tekshiruvi), **Nashr**. "Hammasini ochish/yig'ish" bilan
barcha bo'limlar bir vaqtda ochiladi. Tur va nazorat turi yaratilgandan keyin
o'zgartirilmaydi — ular jurnal ustuniga bog'langan.

### 4.2. Rubrika bilan baholash

Rubrika — mezonlar va ular bo'yicha darajalar to'plami. U baholashni
**shaffof va takrorlanadigan** qiladi.

1. **Kurs → Topshiriqlar → Rubrikalar** bo'limini oching.
2. **Rubrika yaratish** ni bosing.
3. Har bir mezon uchun nom, maksimal ball va kamida 2 ta daraja belgilang.
   Jami ball siz kiritayotganda darhol hisoblanadi.
4. Topshiriq yaratishda **Rubrika** ro'yxatidan shu rubrikani tanlang.
   Tanlanmasa, topshiriq umumiy ball bilan baholanadi.

Baholashda har bir mezon bo'yicha ball qo'yasiz — umumiy ball avtomatik
hisoblanadi va topshiriqning maksimal balliga moslashtiriladi. Darajalar
baholash oynasida tugmaga aylanadi: bir bosishda ball qo'yiladi.

**Tahrirlash va o'chirish.** Rubrikalar ro'yxatida har bir rubrika yonida
uning nechta topshiriqda ishlatilayotgani ko'rsatiladi.

> **Qulflash qoidasi:** rubrika mezonlari bo'yicha kamida bitta ball
> qo'yilgan bo'lsa, rubrika **qulflanadi** — mezonlarni qo'shish, o'chirish
> yoki ballarini o'zgartirib bo'lmaydi, chunki bu qo'yilgan baholarni
> yaroqsiz qiladi. Faqat nom va tavsif tahrirlanadi. Topshiriqqa
> biriktirilgan rubrikani o'chirib ham bo'lmaydi — avval uni topshiriqdan
> uzing.

### 4.3. O'zaro baholash (peer-review)

1. Topshiriqda **O'zaro baholash** ni yoqing va nechta ish tekshirilishini belgilang.
2. Muddat tugagach **Peer-review taqsimlash** tugmasini bosing.
3. Tizim har bir talabaga boshqa talabalarning ishini beradi (o'z ishini emas).

### 4.4. O'xshashlikni tekshirish

Topshiriqda **Plagiat tekshiruvi** ni yoqsangiz, yuborilgan ishlar
avtomatik solishtiriladi va o'xshashlik foizi ko'rsatiladi.

> **Muhim cheklov:** tekshiruv faqat **shu tizimdagi** boshqa ishlar bilan
> solishtiradi — internetdagi manbalar bilan emas. Bu hisobotda ham ko'rsatiladi.

### 4.5. Baholash

**Topshiriqlar** bo'limida **"Faqat baholanmaganlar"** filtrini yoqing, so'ng
kerakli topshiriqdagi **Baholash** tugmasini bosing — topshiriqning baholash
ish o'rni ochiladi.

Ish o'rnida:

- yuqorida rubrika mezonlari va nechta ish baholangani ko'rinadi;
- jadvalda har bir talabaning holati, urinishi, sanasi va bahosi turadi;
- **Hammasini baholash** navbatni birinchi ishdan boshlaydi.

**Baholash oynasi** talabaning matnini va biriktirgan fayllarini ko'rsatadi.
Ball ikki yo'ldan biri bilan qo'yiladi:

- **rubrika bo'lsa** — har bir mezon uchun daraja tugmasini bosasiz yoki aniq
  ball kiritasiz; jami ball topshiriq shkalasiga avtomatik o'giriladi va oyna
  yuqorisida darhol ko'rinadi;
- **rubrika bo'lmasa** — umumiy ball maydoni chiqadi.

Mezon maksimumidan oshiq ball kiritilsa **Saqlash** tugmasi o'chadi.

**Qayta ishlashga qaytarish** kalitini yoqsangiz, ish `RETURNED` holatiga
o'tadi va talaba uni tuzatib qayta yubora oladi.

Kechikish jarimasi **avtomatik** qo'llanadi: siz faqat mazmun uchun ball qo'yasiz.

**Klaviatura yorliqlari** (bir necha o'nlab ishni tez baholash uchun):

| Yorliq                | Amal                            |
| --------------------- | ------------------------------- |
| `Ctrl + Enter`        | Saqlash va keyingi ishga o'tish |
| `Alt + ←` / `Alt + →` | Navbat bo'ylab harakat          |

---

## 5. Testlar va imtihonlar

### 5.1. Savollar banki

Avval savollar bankini to'ldiring: yon paneldagi **Savollar banki** bo'limi.

1. **Bank yaratish** — nom bering va bank qaysi kursga tegishli ekanini
   tanlang. **Ulashilgan** kalitini yoqsangiz, bankdan kafedradagi boshqa
   o'qituvchilar ham foydalana oladi.
2. Bankni ochib **Savol qo'shish** ni bosing.
3. Savol turini tanlang — muharrir shu turga mos maydonlarni ko'rsatadi.

> Savol matni 4 tilda kiritiladi, javob variantlari esa siz ishlayotgan
> tilda saqlanadi. Boshqa tildagi foydalanuvchi variantni zaxira til
> zanjiri orqali ko'radi.

Bank ichida savollarni **matn**, **tur** va **qiyinlik** bo'yicha filtrlash
mumkin. Ishlatilgan savollarda `p` (qiyinlik) va `D` (ajratish) ko'rsatkichlari
ko'rinadi — `D` sariq rangda bo'lsa, savol qayta ko'rib chiqishni talab qiladi.

Qo'llab-quvvatlanadigan **10 tur**:

| Tur                      | Baholash                            |
| ------------------------ | ----------------------------------- |
| Bitta to'g'ri javob      | Avtomatik                           |
| Bir nechta to'g'ri javob | Avtomatik, qisman ball bilan        |
| Moslashtirish            | Avtomatik, qisman ball              |
| Tartiblash               | Avtomatik, pozitsiya bo'yicha       |
| Bo'shliqlarni to'ldirish | Avtomatik, har bir bo'shliq alohida |
| Raqamli javob            | Avtomatik, tolerantlik bilan        |
| Rasmda belgilash         | Avtomatik                           |
| Sudrab tashlash          | Avtomatik                           |
| Esse                     | **Qo'lda**                          |
| Dasturiy kod             | **Qo'lda**                          |

Har bir savolga **Bloom darajasi** va **qiyinlik** belgilang — bu keyinchalik
bank sifatini tahlil qilishda yordam beradi.

### 5.1a. Savollarni fayldan import qilish

Bank sahifasida **Fayldan import** tugmasi. Qo'llab-quvvatlanadigan formatlar:

| Format            | Fayl            | Nima o'giriladi                                                                                                                                                                                                                                                   |
| ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QTI 3.0 / 2.x** | `.xml`, `.zip`  | choice → bitta/ko'p tanlov, textEntry → bo'shliq (yoki sonli), inlineChoice → ro'yxatli bo'shliq, slider → sonli (slayder), extendedText → insho, match → moslashtirish, order → tartiblash, gapMatch → sudrab tashlash, hotspot (rect/circle/poly) → rasmda soha |
| **AIKEN**         | `.txt`          | Savol, `A.` `B.` variantlar, `ANSWER: B` (bir nechta: `ANSWER: A,C`)                                                                                                                                                                                              |
| **GIFT** (Moodle) | `.txt`, `.gift` | tanlov, T/F, qisqa javob, sonli, insho, moslashtirish; `####` — izoh                                                                                                                                                                                              |
| **CSV**           | `.csv`          | `type,text,options,correct,score,tags` sarlavhali jadval                                                                                                                                                                                                          |

Tartib:

1. Formatni tanlang va faylni ko'rsating, **Yuklash va tahlil qilish** ni bosing.
2. Oynada nechta savol topilgani va **muammoli qatorlar** (qator raqami va sabab
   bilan) ko'rsatiladi — bu bosqichda bazaga hech narsa yozilmaydi.
3. **N ta savolni import qilish** — yaroqli savollar bankka tushadi, muammoli
   qatorlar o'tkazib yuboriladi. Faylni tuzatib qayta yuklashingiz mumkin.

> Import fayllari **bir tilli**: matnlar joriy interfeys tili sifatida saqlanadi,
> boshqa tillarni keyin savolni tahrirlab qo'shasiz. Bitta importda ko'pi bilan
> 500 ta savol, fayl 20 MB gacha. QTI ning associate, hottext, drawing, upload
> kabi turlari qo'llab-quvvatlanmaydi — ular ro'yxatda "bu tur qo'llab-quvvatlanmaydi"
> deb chiqadi. Hotspot rasmi `.zip` ichida bo'lishi kerak.

**Bo'shliq va sonli savol variantlari.** Bo'shliqli (CLOZE) savolda har bir
bo'shliq uchun **ochiladigan ro'yxat variantlari** berilsa, talaba yozmaydi,
ro'yxatdan tanlaydi (Moodle "select missing words" kabi; QTI `inlineChoice`).
Sonli savolda **Slayder** yoqilsa, javob min/maks/qadam oralig'ida slayder bilan
tanlanadi (QTI `slider`). Hotspot sohasi endi **ko'pburchak** ham bo'la oladi —
uchlari foizda `x,y; x,y; ...` ko'rinishida kiritiladi.

### 5.1b. Savollarni QTI 3.0 ga eksport qilish

Bank sahifasida **Eksport (QTI 3.0)** — barcha savollar (10 tur, hotspot rasmi
bilan) standart QTI 3.0 paketi (`.zip`: `imsmanifest.xml` + `items/*.xml` +
`media/`) sifatida yuklab olinadi. Paketni boshqa QTI 3.0 tizimiga yoki bizning
importga qayta yuklash mumkin — turlar va to'g'ri javoblar saqlanadi.

### 5.2. Test tuzish

**Kurs → Testlar → Test yaratish**

| Sozlama                    | Tavsiya                                     |
| -------------------------- | ------------------------------------------- |
| Davomiylik                 | Savollar soni × 1.5–2 daqiqa                |
| Urinishlar soni            | Mashq uchun 3+, imtihon uchun 1             |
| Baholash usuli             | Eng yuqori / oxirgi / o'rtacha / birinchi   |
| Savollarni aralashtirish   | Imtihonda **yoqing**                        |
| Variantlarni aralashtirish | Imtihonda **yoqing**                        |
| Urinishdagi savollar soni  | 0 — barchasi; >0 — tasodifiy tanlab olinadi |
| Orqaga qaytish             | Imtihonda **o'chiring**                     |
| Javoblarni ko'rsatish      | Imtihonda "yopilgandan keyin"               |

Test yaratilgandan keyin unga savollarni biriktiring:
**Kurs → Testlar → Savollarni boshqarish**.

Konstruktor ikki panelli: chapda tanlangan bankning savollari, o'ngda testning
tarkibi. O'q tugmasi savolni testga qo'shadi, `↑` `↓` tartibni o'zgartiradi,
har bir savol uchun ball va pool tegi alohida belgilanadi.

> **Muhim:** test bo'yicha kamida bitta urinish boshlangan bo'lsa, savollar
> tarkibi **qulflanadi** — sahifa buni ochiq aytadi va saqlashga yo'l qo'ymaydi.
> Bu topshirilgan ishlarning baholanishini buzilishdan saqlaydi.

**Variant generatsiyasi:** savollarni `poolTag` bilan guruhlab, har bir guruhdan
nechta savol olinishini belgilang — har bir talaba turli variant oladi.

> Variant **takrorlanadigan** tarzda generatsiya qilinadi: apellyatsiya paytida
> talaba aynan qaysi savollarni olgani qayta tiklanadi.

### 5.2a. Test sozlamalari (Moodle uslubi)

Test yaratish oynasi va **Sozlamalar** sahifasi (`Testlar → test → Sozlamalar`,
konstruktor sahifasidagi tugma) bo'limlari: **Umumiy** (nom, tavsif, nazorat
turi), **Vaqt** (ochilish, yopilish, davomiylik), **Baho** (o'tish balli,
urinishlar, baholash usuli: eng yuqori / oxirgi / o'rtacha / birinchi),
**Joylashuv** (bir sahifada savollar soni — konstruktorda sahifa ajratgichlari
shu bo'yicha, orqaga qaytish), **Savol xatti-harakati** (savollar va variantlar
aralashtirish, bir urinishdagi savollar soni), **Ko'rib chiqish** (to'g'ri
javoblarni qachon ko'rsatish), **Qo'shimcha cheklovlar** (proktoring), **Nashr**.
Urinish boshlangan testda savollar qulflanadi, ammo vaqt va nashr sozlamalari
o'zgartiriladi.

### 5.3. Imtihon nazorati (proctoring)

**Proctoring** yoqilganda tizim quyidagi hodisalarni qayd etadi:
tab almashtirish, oynadan chiqish, nusxalash, joylashtirish.

Hodisalar urinish jurnalida saqlanadi — siz ularni natijani ko'rishda tahlil
qilasiz. Tizim avtomatik ravishda talabani bloklamaydi: qaror sizniki.

### 5.4. Savollar sifatini tahlil qilish

**Savollar banki → Sifat hisoboti** ikkita ko'rsatkichni beradi:

- **Qiyinlik indeksi** (0–1): to'g'ri javob bergan talabalar ulushi.
  0.2 dan past — juda qiyin, 0.95 dan yuqori — juda oson.
- **Ajratish indeksi**: kuchli va kuchsiz talabalarni qanchalik yaxshi ajratadi.
  0.2 dan past bo'lsa savol nuqsonli — qayta ko'rib chiqing.

---

## 6. Davomat

### 6.1. Qo'lda belgilash

**Davomat → Dars tanlang → Jurnalni to'ldirish**

Holatlar: Hozir · Kechikdi · Sababli · Yo'q

### 6.2. QR kod orqali

1. Dars boshida **QR kod yaratish** tugmasini bosing.
2. QR kodni proyektorda ko'rsating.
3. Talabalar telefonlaridan skanerlaydilar.

QR kod **5 daqiqa** amal qiladi — ekran suratini boshqalarga yuborish foydasiz.

**Geo-cheklov** yoqilsa, talaba auditoriya radiusida bo'lishi ham tekshiriladi.

### 6.3. Ogohlantirish

Davomat **75%** dan pastga tushgan talabalar hisobotda alohida belgilanadi va
analitika bo'limidagi "xavf ostidagilar" ro'yxatiga tushadi.

---

## 7. Jurnal va baholar

### 7.1. Kurs jurnali

**Kurs → Jurnal** — barcha talabalar JN / ON / YN kesimida ko'rinadi.

Yakuniy ball avtomatik hisoblanadi:

```
Yakuniy = JN×0.3 + ON×0.3 + YN×0.4   (sillabusda boshqacha bo'lishi mumkin)
```

- **O'zlashtirish uchun:** ≥ 60 ball
- **YN ga qo'yilish uchun:** JN + ON ≥ 36 ball

### 7.2. Qo'lda baho

Alohida hollarda (og'zaki javob, laboratoriya) qo'lda ball qo'yish mumkin:
**Jurnal → Baho qo'shish**.

Har bir o'zgarish **tarixga yoziladi**: kim, qachon, qaysi qiymatdan qaysi
qiymatga o'zgartirgani saqlanadi va o'chirilmaydi.

### 7.3. Jurnalni yopish

Semestr yakunida **Jurnalni yopish** tugmasini bosing:

- barcha baholar `yakuniy` deb belgilanadi;
- talabalarning transkripti shakllanadi va GPA hisoblanadi.

> Yopilgandan keyin bahoni faqat **dekanat** o'zgartira oladi va buning uchun
> sabab ko'rsatishi shart.

---

## 8. Hujjatlar

**Hujjatlar → Hujjat yaratish**

| Hujjat           | Format      | Mazmuni                                 |
| ---------------- | ----------- | --------------------------------------- |
| Reyting varaqasi | DOCX / XLSX | Guruh bo'yicha JN/ON/YN va yakuniy ball |
| Davomat jadvali  | XLSX        | Darslar kesimida belgilar jadvali       |
| Transkript       | DOCX        | Talabaning barcha semestrlari           |

DOCX hujjatlar **GOST 7.32** talablariga muvofiq rasmiylashtiriladi:
Times New Roman 14 pt, 1.5 interval, maydonlar 30/10/20/20 mm, sahifa raqami
pastda markazda.

Generatsiya fon rejimida bajariladi — tayyor bo'lgach bildirishnoma keladi.

### 8.1. Sertifikat berish

**Sertifikatlar → Sertifikat berish**

1. **Kurs** va **shablon**ni tanlang (odatda bitta standart shablon bo'ladi,
   u avtomatik tanlanadi).
2. Kimga berilishini belgilang:
   - **Kursni tugatgan barcha talabalarga** — tizim `Tugatgan` holatdagi
     yozilishlarni o'zi topadi;
   - **Tanlangan talabalarga** — yozilganlar ro'yxati chiqadi; tugatganlar
     yashil belgilangan, allaqachon sertifikati borlar esa o'chirilgan
     holda ko'rinadi (bir kursga bitta sertifikat).
3. Kerak bo'lsa **amal qilish muddati**ni kiriting; bo'sh qoldirilsa —
   muddatsiz.
4. **Sertifikat berish** ni bosing.

PDF fon rejimida tayyorlanadi: reestrda yozuv avval "tayyorlanmoqda" holatida
turadi va bir necha soniyada **Yuklab olish** tugmasi paydo bo'ladi — sahifani
yangilash shart emas. Har bir sertifikatda **Tekshirish** havolasi bor: u
QR kod orqali ochiladigan ochiq sahifaga olib boradi.

> Faqat **kursga yozilgan** talabaga sertifikat berish mumkin — tizim
> identifikatorini bilgan begona odamga berishga yo'l qo'ymaydi.

**Bekor qilish** — dekanat va rektorat vakolati. Bekor qilingan sertifikat QR
orqali tekshirilganda yaroqsiz deb ko'rsatiladi; sabab (kamida 5 belgi)
majburiy va amal qaytarilmaydi.

---

## 9. Virtual sinf

**Virtual sinf → Onlayn dars yaratish**

- Yozib olish yoqilsa, dars tugagach yozuv havolasi saqlanadi.
- **Avtomatik davomat** yoqilsa, qo'shilgan talabalar "hozir" deb belgilanadi.

Talabalar darsga **15 daqiqa oldin** kira boshlaydilar.

---

## 10. Kommunikatsiya

| Vosita            | Qachon ishlatiladi                                                      |
| ----------------- | ----------------------------------------------------------------------- |
| **E'lon**         | Butun kursga bir tomonlama xabar (muddat o'zgardi, qo'shimcha material) |
| **Forum**         | Muhokama, savol-javob; eng yaxshi javobni belgilash mumkin              |
| **Shaxsiy xabar** | Bitta talaba bilan yozishma                                             |

E'lon yuborishda kanallarni tanlaysiz: ilova ichida, email, SMS, Telegram.
Talabalar o'z sozlamalarida kanallarni cheklashi mumkin.

---

## 11. Analitika

**Analitika** bo'limida kurs bo'yicha:

- **O'zlashtirish dinamikasi** — haftalar kesimida o'rtacha ball;
- **Faollik issiqlik xaritasi** — talabalar qaysi kunlarda faol
  (material joylash vaqtini tanlashda foydali);
- **Xavf ostidagi talabalar** — davomat, topshirilmagan ishlar, past ball va
  faolsizlik bo'yicha hisoblangan xavf balli va aniq tavsiyalar.

Har bir hisobotni **XLSX** ga eksport qilish mumkin.

---

## 12. Klaviatura yorliqlari

| Yorliq       | Amal            |
| ------------ | --------------- |
| `Ctrl` + `K` | Global qidiruv  |
| `Esc`        | Oynani yopish   |
| `Tab`        | Keyingi element |

Qidiruv **kirill va lotin** yozuvlarida bir xil ishlaydi: "Математика" ham,
"Matematika" ham bir xil natija beradi.

---

## Tez-tez so'raladigan savollar

**Talaba testni topshirayotganda interneti uzildi — javoblari yo'qoldimi?**
Yo'q. Har bir javob darhol saqlanadi. Talaba qayta kirsa, urinish davom etadi.
Vaqt tugasa, urinish avtomatik yakunlanadi va saqlangan javoblar baholanadi.

**Testdagi savolni tahrirlashim mumkinmi?**
Test bo'yicha urinishlar boshlangan bo'lsa — yo'q, chunki bu statistikani buzadi
va allaqachon javob berganlarga nisbatan adolatsiz bo'ladi.

**Kursni o'chirsam ma'lumot yo'qoladimi?**
Yo'q. Tizimda **fizik o'chirish yo'q** — yozuv arxivlanadi va tiklanishi mumkin.

**Sillabusni tasdiqlashga kim javobgar?**
Metodist loyihani tayyorlaydi → kafedra mudiri tasdiqlaydi → kerak bo'lsa dekanat.
Har bir tahrir yangi versiya sifatida saqlanadi, tasdiqlangan versiya o'zgarmaydi.
Konstruktor va oqim: §2.8.
