-- Moodle uslubi: forum va onlayn dars ham mavzu (topic) ichida turadi.
ALTER TABLE "forum_threads" ADD COLUMN "topicId" UUID;
ALTER TABLE "meetings" ADD COLUMN "topicId" UUID;

CREATE INDEX "forum_threads_topicId_idx" ON "forum_threads"("topicId");
CREATE INDEX "meetings_topicId_idx" ON "meetings"("topicId");

ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
