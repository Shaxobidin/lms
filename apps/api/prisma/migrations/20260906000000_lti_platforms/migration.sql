-- LTI 1.3 Tool Provider (§10): tashqi platformalar ro'yxati va foydalanuvchi bog'lanishlari.
--
-- lti_platforms  — administrator ro'yxatga olgan platformalar (issuer + clientId noyob);
-- lti_user_links — platformadagi `sub` ↔ bizning foydalanuvchi (bir marta bog'lanadi,
--                  keyingi launch'larda email o'zgarsa ham shu bog'lanish ishlatiladi).
CREATE TABLE "lti_platforms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "authLoginUrl" TEXT NOT NULL,
    "authTokenUrl" TEXT NOT NULL,
    "jwksUrl" TEXT,
    "publicJwks" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "lti_platforms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lti_user_links" (
    "id" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "lastLaunchAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lti_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lti_platforms_issuer_clientId_key" ON "lti_platforms"("issuer", "clientId");
CREATE UNIQUE INDEX "lti_user_links_platformId_subject_key" ON "lti_user_links"("platformId", "subject");
CREATE INDEX "lti_user_links_userId_idx" ON "lti_user_links"("userId");

ALTER TABLE "lti_user_links" ADD CONSTRAINT "lti_user_links_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "lti_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lti_user_links" ADD CONSTRAINT "lti_user_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
