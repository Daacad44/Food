-- User management: sign-in history, password changes and devices.
ALTER TABLE "StaffUser" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "StaffUser" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
-- Set when an owner/manager gives someone a temporary password: they must choose their own at next sign-in.
ALTER TABLE "StaffUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
-- The browser/device a session was opened from, shown so staff can recognise and sign out devices.
ALTER TABLE "AuthSession" ADD COLUMN "userAgent" TEXT;
CREATE INDEX "AuthSession_subjectId_idx" ON "AuthSession"("subjectId");
