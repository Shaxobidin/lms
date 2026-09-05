-- Maqsad: LMS ishlashi uchun zarur PostgreSQL kengaytmalarini o'rnatish.
-- Bu skript konteyner birinchi marta ishga tushganda avtomatik bajariladi.

-- UUID generatsiyasi (gen_random_uuid) — pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigramma indekslari: fuzzy qidiruv (ADR-015)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Diakritik belgilarni olib tashlash: "o'zbek" ~ "ozbek"
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- So'rovlar unumdorligini kuzatish (NF-07)
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Lotin va kirill matnlari uchun umumiy qidiruv konfiguratsiyasi.
-- 'simple' asosida, unaccent bilan — o'zbek tilida stemmer mavjud emas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'lms_search') THEN
    CREATE TEXT SEARCH CONFIGURATION lms_search (COPY = simple);
    ALTER TEXT SEARCH CONFIGURATION lms_search
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;
  END IF;
END
$$;
