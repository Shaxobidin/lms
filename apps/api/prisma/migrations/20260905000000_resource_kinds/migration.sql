-- Moodle dagi "Papka" va "Ko'milgan kontent" turlariga mos yangi resurs turlari.
--
-- FOLDER  — bir nechta faylni bitta yig'iladigan element sifatida ko'rsatish;
-- EMBED   — tashqi interaktiv kontent (H5P, GeoGebra, YouTube pleer) iframe da.
--
-- Mavjud yozuvlarga ta'sir qilmaydi: bu faqat enum ni kengaytiradi.
ALTER TYPE "ResourceKind" ADD VALUE IF NOT EXISTS 'FOLDER';
ALTER TYPE "ResourceKind" ADD VALUE IF NOT EXISTS 'EMBED';
