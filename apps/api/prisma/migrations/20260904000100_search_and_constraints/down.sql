-- =============================================================================
-- Maqsad: `20260904000100_search_and_constraints` migratsiyasini qaytarish.
-- promt.md §16: migratsiyalar qaytariladigan bo'lishi shart. Prisma Migrate
-- faqat oldinga ishlaganligi sababli (A-27), qaytarish skripti qo'lda yoziladi.
-- Ishlatish: psql "$DATABASE_URL" -f down.sql
-- =============================================================================

-- 4. Triggerlar
DROP TRIGGER IF EXISTS "attendance_history_append_only" ON "attendance_history";
DROP TRIGGER IF EXISTS "grade_history_append_only" ON "grade_history";
DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
DROP FUNCTION IF EXISTS lms_prevent_audit_mutation();

-- 3. Cheklovlar
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive";
ALTER TABLE "quiz_attempts" DROP CONSTRAINT IF EXISTS "quiz_attempts_expiry_after_start";
ALTER TABLE "quizzes" DROP CONSTRAINT IF EXISTS "quizzes_window_order";
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_late_after_due";
ALTER TABLE "academic_years" DROP CONSTRAINT IF EXISTS "academic_years_date_order";
ALTER TABLE "semesters" DROP CONSTRAINT IF EXISTS "semesters_date_order";
ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_progress_range";
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_score_non_negative";
ALTER TABLE "quiz_answers" DROP CONSTRAINT IF EXISTS "quiz_answers_score_range";
ALTER TABLE "grades" DROP CONSTRAINT IF EXISTS "grades_score_range";

-- 2. Qidiruv indekslari
DROP INDEX IF EXISTS "subjects_name_jsonb";
DROP INDEX IF EXISTS "courses_title_jsonb";
DROP INDEX IF EXISTS "questions_search_trgm";
DROP INDEX IF EXISTS "subjects_search_trgm";
DROP INDEX IF EXISTS "courses_search_trgm";
DROP INDEX IF EXISTS "users_search_trgm";

-- 1. Qisman unikal indekslar
DROP INDEX IF EXISTS "group_members_active_membership";
DROP INDEX IF EXISTS "semesters_single_current";
DROP INDEX IF EXISTS "academic_years_single_current";
DROP INDEX IF EXISTS "groups_name_active_key";
DROP INDEX IF EXISTS "courses_code_active_key";
DROP INDEX IF EXISTS "users_email_active_key";
DROP INDEX IF EXISTS "syllabi_subject_active_key";
