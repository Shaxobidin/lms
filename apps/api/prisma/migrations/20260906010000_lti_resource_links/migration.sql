-- LTI Advantage (§10): launch konteksti — resurs havolasi, AGS va NRPS manzillari.
CREATE TABLE "lti_resource_links" (
    "id" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "resourceLinkId" TEXT NOT NULL,
    "courseId" UUID,
    "title" TEXT,
    "contextId" TEXT,
    "contextTitle" TEXT,
    "lineItemUrl" TEXT,
    "lineItemsUrl" TEXT,
    "membershipsUrl" TEXT,
    "scopes" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lti_resource_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lti_resource_links_platformId_resourceLinkId_key" ON "lti_resource_links"("platformId", "resourceLinkId");
CREATE INDEX "lti_resource_links_courseId_idx" ON "lti_resource_links"("courseId");

ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "lti_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lti_resource_links" ADD CONSTRAINT "lti_resource_links_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
