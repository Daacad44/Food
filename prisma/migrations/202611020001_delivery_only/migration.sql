-- Botan becomes a staff-only, delivery-only ordering system.
-- Removed: DaljirConnect (WhatsApp) integration, the kitchen board and POS (dining tables, cashier
-- shifts), the customer website (reviews, saved addresses) and coupons.

-- DaljirConnect
DELETE FROM "OutboxEvent" WHERE "topic" LIKE 'daljir.%';
DROP INDEX IF EXISTS "OutboxEvent_topic_status_idx";
ALTER TABLE "OutboxEvent" DROP COLUMN IF EXISTS "lastError";
DROP INDEX IF EXISTS "Order_externalRef_key";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "channel";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "externalRef";

-- Dining tables, cashier shifts, reviews, saved addresses and coupons
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_tableId_fkey";
ALTER TABLE "Order" DROP COLUMN "tableId";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_couponId_fkey";
ALTER TABLE "Order" DROP COLUMN "couponId";
ALTER TABLE "Payment" DROP COLUMN "shiftId";
DROP TABLE "DiningTable";
DROP TABLE "CashierShift";
DROP TABLE "Review";
DROP TABLE "CustomerAddress";
DROP TABLE "Coupon";
DROP TYPE "TableStatus";
DROP TYPE "ShiftStatus";
DROP TYPE "DiscountType";

-- Staff roles: the cashier role becomes the order taker (OPERATOR); the kitchen role is removed.
-- Former kitchen accounts are kept for the audit trail but suspended and signed out, so they gain
-- no ordering access until an owner reviews them.
UPDATE "StaffUser" SET "status" = 'SUSPENDED' WHERE "role" = 'CHEF';
DELETE FROM "AuthSession"
  WHERE "kind" = 'staff' AND "subjectId" IN (SELECT "id" FROM "StaffUser" WHERE "role" = 'CHEF');
ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'OPERATOR', 'RIDER', 'ACCOUNTANT');
ALTER TABLE "StaffUser" ALTER COLUMN "role" TYPE "StaffRole" USING (
  CASE "role"::text WHEN 'CASHIER' THEN 'OPERATOR' WHEN 'CHEF' THEN 'OPERATOR' ELSE "role"::text END
)::"StaffRole";
DROP TYPE "StaffRole_old";

-- Order-taking captures the payer's phone for EVC Plus / ZAAD / SAHAL (manual for now).
CREATE INDEX "Order_guestPhone_idx" ON "Order"("guestPhone");
