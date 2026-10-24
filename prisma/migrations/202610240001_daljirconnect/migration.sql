-- DaljirConnect (WhatsApp ordering): orders taken in chat, linked to their DaljirConnect id.
ALTER TABLE "Order" ADD COLUMN "channel" TEXT;
ALTER TABLE "Order" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Order_externalRef_key" ON "Order"("externalRef");

-- Pushes to DaljirConnect go through the outbox; the last failure is kept for the settings page.
ALTER TABLE "OutboxEvent" ADD COLUMN "lastError" TEXT;
CREATE INDEX "OutboxEvent_topic_status_idx" ON "OutboxEvent"("topic", "status");
