-- LTI AGS (§10): har bir test/topshiriq uchun platformadagi alohida line item.
CREATE TABLE "lti_line_items" (
    "id" UUID NOT NULL,
    "resourceLinkId" UUID NOT NULL,
    "quizId" UUID,
    "assignmentId" UUID,
    "lineItemUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scoreMaximum" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lti_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lti_line_items_resourceLinkId_quizId_key" ON "lti_line_items"("resourceLinkId", "quizId");
CREATE UNIQUE INDEX "lti_line_items_resourceLinkId_assignmentId_key" ON "lti_line_items"("resourceLinkId", "assignmentId");

ALTER TABLE "lti_line_items" ADD CONSTRAINT "lti_line_items_resourceLinkId_fkey" FOREIGN KEY ("resourceLinkId") REFERENCES "lti_resource_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lti_line_items" ADD CONSTRAINT "lti_line_items_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lti_line_items" ADD CONSTRAINT "lti_line_items_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
