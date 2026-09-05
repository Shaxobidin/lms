-- =============================================================================
-- Maqsad: `20260904000000_init` migratsiyasini to'liq qaytarish (promt.md §16, A-27).
-- DIQQAT: bu skript BARCHA ma'lumotni o'chiradi. Faqat dev/rollback stsenariysida.
-- Ishlatish: psql "$DATABASE_URL" -f down.sql
-- =============================================================================

-- Jadvallar (CASCADE — tashqi kalitlar bilan birga)
DROP TABLE IF EXISTS "integration_sync_logs" CASCADE;
DROP TABLE IF EXISTS "idempotency_keys" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "feature_flags" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "user_xp" CASCADE;
DROP TABLE IF EXISTS "user_badges" CASCADE;
DROP TABLE IF EXISTS "badges" CASCADE;
DROP TABLE IF EXISTS "generated_documents" CASCADE;
DROP TABLE IF EXISTS "verification_codes" CASCADE;
DROP TABLE IF EXISTS "certificates" CASCADE;
DROP TABLE IF EXISTS "certificate_templates" CASCADE;
DROP TABLE IF EXISTS "meetings" CASCADE;
DROP TABLE IF EXISTS "telegram_links" CASCADE;
DROP TABLE IF EXISTS "notification_preferences" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "notification_channels" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "forum_posts" CASCADE;
DROP TABLE IF EXISTS "forum_threads" CASCADE;
DROP TABLE IF EXISTS "announcements" CASCADE;
DROP TABLE IF EXISTS "attendance_excuses" CASCADE;
DROP TABLE IF EXISTS "attendance_history" CASCADE;
DROP TABLE IF EXISTS "attendances" CASCADE;
DROP TABLE IF EXISTS "class_sessions" CASCADE;
DROP TABLE IF EXISTS "schedules" CASCADE;
DROP TABLE IF EXISTS "transcripts" CASCADE;
DROP TABLE IF EXISTS "grade_history" CASCADE;
DROP TABLE IF EXISTS "grades" CASCADE;
DROP TABLE IF EXISTS "grade_scales" CASCADE;
DROP TABLE IF EXISTS "control_types" CASCADE;
DROP TABLE IF EXISTS "quiz_answers" CASCADE;
DROP TABLE IF EXISTS "quiz_attempts" CASCADE;
DROP TABLE IF EXISTS "quiz_questions" CASCADE;
DROP TABLE IF EXISTS "quizzes" CASCADE;
DROP TABLE IF EXISTS "questions" CASCADE;
DROP TABLE IF EXISTS "question_banks" CASCADE;
DROP TABLE IF EXISTS "peer_reviews" CASCADE;
DROP TABLE IF EXISTS "rubric_scores" CASCADE;
DROP TABLE IF EXISTS "submissions" CASCADE;
DROP TABLE IF EXISTS "assignments" CASCADE;
DROP TABLE IF EXISTS "rubric_criteria" CASCADE;
DROP TABLE IF EXISTS "rubrics" CASCADE;
DROP TABLE IF EXISTS "xapi_statements" CASCADE;
DROP TABLE IF EXISTS "scorm_trackings" CASCADE;
DROP TABLE IF EXISTS "scorm_packages" CASCADE;
DROP TABLE IF EXISTS "lesson_progress" CASCADE;
DROP TABLE IF EXISTS "enrollments" CASCADE;
DROP TABLE IF EXISTS "file_objects" CASCADE;
DROP TABLE IF EXISTS "resources" CASCADE;
DROP TABLE IF EXISTS "lessons" CASCADE;
DROP TABLE IF EXISTS "topics" CASCADE;
DROP TABLE IF EXISTS "modules" CASCADE;
DROP TABLE IF EXISTS "course_teachers" CASCADE;
DROP TABLE IF EXISTS "courses" CASCADE;
DROP TABLE IF EXISTS "syllabus_versions" CASCADE;
DROP TABLE IF EXISTS "syllabi" CASCADE;
DROP TABLE IF EXISTS "curriculum_subjects" CASCADE;
DROP TABLE IF EXISTS "curricula" CASCADE;
DROP TABLE IF EXISTS "subjects" CASCADE;
DROP TABLE IF EXISTS "semesters" CASCADE;
DROP TABLE IF EXISTS "academic_years" CASCADE;
DROP TABLE IF EXISTS "group_members" CASCADE;
DROP TABLE IF EXISTS "groups" CASCADE;
DROP TABLE IF EXISTS "specialities" CASCADE;
DROP TABLE IF EXISTS "departments" CASCADE;
DROP TABLE IF EXISTS "faculties" CASCADE;
DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
DROP TABLE IF EXISTS "otp_codes" CASCADE;
DROP TABLE IF EXISTS "password_history" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "user_roles" CASCADE;
DROP TABLE IF EXISTS "role_permissions" CASCADE;
DROP TABLE IF EXISTS "permissions" CASCADE;
DROP TABLE IF EXISTS "roles" CASCADE;
DROP TABLE IF EXISTS "user_profiles" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Enum tiplar
DROP TYPE IF EXISTS "SessionStatus";
DROP TYPE IF EXISTS "LessonType";
DROP TYPE IF EXISTS "AttendanceStatus";
DROP TYPE IF EXISTS "GradeOrigin";
DROP TYPE IF EXISTS "AttemptStatus";
DROP TYPE IF EXISTS "Difficulty";
DROP TYPE IF EXISTS "QuestionType";
DROP TYPE IF EXISTS "SubmissionStatus";
DROP TYPE IF EXISTS "FileStatus";
DROP TYPE IF EXISTS "EnrollmentStatus";
DROP TYPE IF EXISTS "ResourceKind";
DROP TYPE IF EXISTS "DeliveryMode";
DROP TYPE IF EXISTS "CourseStatus";
DROP TYPE IF EXISTS "CourseType";
DROP TYPE IF EXISTS "BloomLevel";
DROP TYPE IF EXISTS "ControlForm";
DROP TYPE IF EXISTS "ApprovalStatus";
DROP TYPE IF EXISTS "EducationLevel";
DROP TYPE IF EXISTS "EducationForm";
DROP TYPE IF EXISTS "UserStatus";

-- Kengaytmalar boshqa sxemalarda ham ishlatilishi mumkin — o'chirilmaydi.
