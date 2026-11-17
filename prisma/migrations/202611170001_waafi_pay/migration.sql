-- WaafiPay: every Somali mobile-money wallet, and the state of a payment request sent to the
-- customer's phone.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'JEEB';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'KAASH_PLUS';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'KAYD';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EDAHAB';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EMAAL';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MYCASH';
-- How many times the request was sent; while "processingAt" is set (for up to 3 minutes) no second
-- request can be sent, so a customer is never asked to pay twice.
ALTER TABLE "Payment" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "processingAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "lastError" TEXT;
