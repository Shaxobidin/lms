-- HEMIS uslubidagi "Talaba" bo'limi: arizalar (talaba xizmatlari) va so'rovnomalar.
CREATE TYPE "StudentRequestType" AS ENUM ('REFERENCE', 'ACADEMIC_LEAVE', 'RETAKE', 'TRANSFER', 'TRANSCRIPT', 'OTHER');
CREATE TYPE "StudentRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'DONE');

CREATE TABLE "student_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "StudentRequestType" NOT NULL,
    "courseId" UUID,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "StudentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "handledById" UUID,
    "resolution" TEXT,
    "documentId" UUID,
    "handledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "student_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_requests_userId_status_idx" ON "student_requests"("userId", "status");
CREATE INDEX "student_requests_status_createdAt_idx" ON "student_requests"("status", "createdAt");

ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "questions" JSONB NOT NULL,
    "audienceRoles" TEXT[],
    "courseId" UUID,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMPTZ(3),
    "closesAt" TIMESTAMPTZ(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "surveys_isPublished_closesAt_idx" ON "surveys"("isPublished", "closesAt");
CREATE INDEX "surveys_courseId_idx" ON "surveys"("courseId");

ALTER TABLE "surveys" ADD CONSTRAINT "surveys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL,
    "surveyId" UUID NOT NULL,
    "userId" UUID,
    "respondentKey" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_responses_surveyId_respondentKey_key" ON "survey_responses"("surveyId", "respondentKey");
CREATE INDEX "survey_responses_surveyId_createdAt_idx" ON "survey_responses"("surveyId", "createdAt");

ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
