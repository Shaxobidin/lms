-- PostgreSQL enum qiymatini olib tashlashni qo'llab-quvvatlamaydi, shuning uchun
-- tur qaytadan yaratiladi. Avval yangi turlardagi yozuvlar `FILE` ga o'tkaziladi.
UPDATE "resources" SET "kind" = 'FILE' WHERE "kind" IN ('FOLDER', 'EMBED');

ALTER TYPE "ResourceKind" RENAME TO "ResourceKind_old";

CREATE TYPE "ResourceKind" AS ENUM (
  'VIDEO', 'PDF', 'AUDIO', 'LINK', 'H5P', 'SCORM', 'XAPI', 'TEXT', 'FILE'
);

ALTER TABLE "resources"
  ALTER COLUMN "kind" TYPE "ResourceKind" USING ("kind"::text::"ResourceKind");

DROP TYPE "ResourceKind_old";
