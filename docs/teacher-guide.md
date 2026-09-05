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

### 2.2. Tuzilma qo'shish

Kurs ichida iyerarxiya: **Modul → Mavzu → Dars → Resurs**

1. Kurs sahifasida **Modullar** tabini oching.
2. **Modul qo'shish** — masalan "1-modul: Kirish".
3. Modul ichida **Mavzu qo'shish**, mavzu ichida **Dars qo'shish**.
4. Darsga matn kiriting va **Resurs qo'shish** orqali fayl/video/havola biriktiring.

Elementlarni **sudrab (drag-and-drop)** joyini o'zgartirish mumkin — tartib
avtomatik saqlanadi.

### 2.3. Nashr etish

Kurs va uning modullari `Qoralama` holatida bo'lsa, talabalar ularni ko'rmaydi.

- **Modul** darajasida: modul yonidagi "Qoralama" belgisini bosib nashr eting.
- **Kurs** darajasida: **Nashr etish** tugmasi.

> Kursni nashr etish uchun kamida bitta nashr etilgan dars bo'lishi shart —
> bo'sh kurs talabaga ko'rinmasligi kerak.

### 2.4. Kursni nusxalash

Keyingi semestr uchun bir xil kursni qayta yaratish shart emas:
**Kurs sahifasi → Nusxalash**.

Nusxalanadi: modullar, mavzular, darslar, resurslar, topshiriqlar, testlar.
**Nusxalanmaydi:** talabalar, yozilishlar, baholar, topshirilgan ishlar.

---

## 3. Kontent joylash

### 3.1. Fayl yuklash

Fayl **to'g'ridan-to'g'ri saqlash serveriga** yuklanadi, shuning uchun katta
videolar ham tez ketadi.

Ruxsat etilgan formatlar: PDF, DOCX, XLSX, PPTX, MP4, WebM, MP3, rasm fayllari.
Maksimal hajm: kurs kontenti uchun **512 MB**.

> Fayl yuklangandan keyin tizim uning **haqiqiy turini** tekshiradi. Agar fayl
> kengaytmasi mazmuniga mos kelmasa, u karantinga olinadi va ishlatilmaydi.

### 3.2. Video

Yuklangan video avtomatik ravishda **HLS** formatiga o'giriladi (360p / 720p / 1080p).
Bu talabaning internet tezligiga qarab sifat avtomatik moslashishini ta'minlaydi —
viloyatdagi talabalar uchun muhim.

O'girish fon rejimida bajariladi; tayyor bo'lgach video pleyerda ochiladi.

### 3.3. SCORM paketlari

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

### 4.2. Rubrika bilan baholash

Rubrika — mezonlar va ular bo'yicha darajalar to'plami. U baholashni
**shaffof va takrorlanadigan** qiladi.

1. **Rubrikalar → Rubrika yaratish**.
2. Har bir mezon uchun nom, maksimal ball va kamida 2 ta daraja belgilang.
3. Topshiriq yaratishda shu rubrikani tanlang.

Baholashda har bir mezon bo'yicha ball qo'yasiz — umumiy ball avtomatik
hisoblanadi va topshiriqning maksimal balliga moslashtiriladi.

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

**Topshiriqlar** bo'limida **"Faqat baholanmaganlar"** filtrini yoqing —
navbatdagi ishlar ro'yxati chiqadi.

Kechikish jarimasi **avtomatik** qo'llanadi: siz faqat mazmun uchun ball qo'yasiz.

---

## 5. Testlar va imtihonlar

### 5.1. Savollar banki

Avval savollar bankini to'ldiring: **Savollar banki → Savol qo'shish**.

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

**Variant generatsiyasi:** savollarni `poolTag` bilan guruhlab, har bir guruhdan
nechta savol olinishini belgilang — har bir talaba turli variant oladi.

> Variant **takrorlanadigan** tarzda generatsiya qilinadi: apellyatsiya paytida
> talaba aynan qaysi savollarni olgani qayta tiklanadi.

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
