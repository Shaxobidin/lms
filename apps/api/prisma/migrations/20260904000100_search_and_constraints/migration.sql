-- =============================================================================
-- Maqsad: Prisma sxemasi ifodalay olmaydigan bazaviy obyektlar:
--   1) qisman (partial) unikal indekslar — soft delete bilan mos ishlashi uchun;
--   2) qidiruv indekslari (trigramma) — global qidiruv (ADR-015);
--   3) yaxlitlik cheklovlari (CHECK) — domen qoidalarini baza darajasida kafolatlash;
--   4) audit jadvalini o'zgartirishdan himoya qiluvchi trigger (ADR-014).
-- Qaytarish: down.sql
-- =============================================================================

-- --- 1. Qisman unikal indekslar ----------------------------------------------
-- Soft delete ishlatilganda oddiy UNIQUE yaramaydi: o'chirilgan yozuv ham
-- kalitni band qilib turadi. Shuning uchun faqat faol yozuvlar uchun indeks.

CREATE UNIQUE INDEX IF NOT EXISTS "syllabi_subject_active_key"
  ON "syllabi" ("subjectId") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_key"
  ON "users" (lower("email")) WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "courses_code_active_key"
  ON "courses" ("code") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "groups_name_active_key"
  ON "groups" ("name") WHERE "deletedAt" IS NULL;

-- Bir vaqtning o'zida faqat bitta joriy o'quv yili va bitta joriy semestr
CREATE UNIQUE INDEX IF NOT EXISTS "academic_years_single_current"
  ON "academic_years" (("isCurrent")) WHERE "isCurrent" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "semesters_single_current"
  ON "semesters" (("isCurrent")) WHERE "isCurrent" = true;

-- Talaba ayni vaqtda faqat bitta guruhda bo'ladi
CREATE UNIQUE INDEX IF NOT EXISTS "group_members_active_membership"
  ON "group_members" ("userId") WHERE "leftAt" IS NULL AND "deletedAt" IS NULL;

-- --- 2. Qidiruv indekslari ---------------------------------------------------
-- `searchText` ustuni ilova tomonida `normalizeForSearch()` bilan to'ldiriladi
-- (kirill -> lotin), shuning uchun trigramma indeksi ikkala yozuvda ham ishlaydi.

CREATE INDEX IF NOT EXISTS "users_search_trgm"
  ON "users" USING gin ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "courses_search_trgm"
  ON "courses" USING gin ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "subjects_search_trgm"
  ON "subjects" USING gin ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "questions_search_trgm"
  ON "questions" USING gin ("searchText" gin_trgm_ops);

-- Ko'p tilli JSONB maydonlar bo'yicha mavjudlik so'rovlari uchun
CREATE INDEX IF NOT EXISTS "courses_title_jsonb"
  ON "courses" USING gin ("title" jsonb_path_ops);

CREATE INDEX IF NOT EXISTS "subjects_name_jsonb"
  ON "subjects" USING gin ("name" jsonb_path_ops);

-- --- 3. Domen cheklovlari (CHECK) --------------------------------------------
-- Ilova qatlamidagi validatsiyaga qo'shimcha himoya: to'g'ridan-to'g'ri SQL
-- orqali ham noto'g'ri ma'lumot kirmasligi kafolatlanadi.

ALTER TABLE "grades"
  ADD CONSTRAINT "grades_score_range" CHECK ("score" >= 0 AND "score" <= "maxScore");

ALTER TABLE "quiz_answers"
  ADD CONSTRAINT "quiz_answers_score_range" CHECK ("score" >= 0 AND "score" <= "maxScore");

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_score_non_negative" CHECK ("score" IS NULL OR "score" >= 0);

ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_progress_range"
  CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100);

ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_date_order" CHECK ("startsAt" < "endsAt");

ALTER TABLE "academic_years"
  ADD CONSTRAINT "academic_years_date_order" CHECK ("startsAt" < "endsAt");

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_late_after_due"
  CHECK ("lateUntil" IS NULL OR "lateUntil" > "dueAt");

ALTER TABLE "quizzes"
  ADD CONSTRAINT "quizzes_window_order"
  CHECK ("opensAt" IS NULL OR "closesAt" IS NULL OR "closesAt" > "opensAt");

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_expiry_after_start" CHECK ("expiresAt" > "startedAt");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amountUzs" >= 0);

-- --- 4. Audit jurnalini himoya qilish ----------------------------------------
-- Audit yozuvlari faqat INSERT qilinadi. UPDATE/DELETE urinishi xato beradi —
-- bu ADR-014 dagi "audit izi o'zgartirilmaydi" talabini baza darajasida ta'minlaydi.

CREATE OR REPLACE FUNCTION lms_prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs jadvali faqat qo''shish uchun (append-only)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION lms_prevent_audit_mutation();

-- Baho va davomat tarixi ham o'zgartirilmaydi (RSK-10)
DROP TRIGGER IF EXISTS "grade_history_append_only" ON "grade_history";
CREATE TRIGGER "grade_history_append_only"
  BEFORE UPDATE OR DELETE ON "grade_history"
  FOR EACH ROW EXECUTE FUNCTION lms_prevent_audit_mutation();

DROP TRIGGER IF EXISTS "attendance_history_append_only" ON "attendance_history";
CREATE TRIGGER "attendance_history_append_only"
  BEFORE UPDATE OR DELETE ON "attendance_history"
  FOR EACH ROW EXECUTE FUNCTION lms_prevent_audit_mutation();
