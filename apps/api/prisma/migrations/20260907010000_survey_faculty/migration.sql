-- So'rovnoma fakultet doirasi (own_faculty) uchun.
ALTER TABLE "surveys" ADD COLUMN "facultyId" UUID;
CREATE INDEX "surveys_facultyId_idx" ON "surveys"("facultyId");
