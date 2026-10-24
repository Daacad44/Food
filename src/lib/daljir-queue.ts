import type { Prisma } from '@prisma/client';

// Pushes to DaljirConnect (WhatsApp ordering) are written to the outbox inside the same serializable transaction as
// the change itself, then sent by drainDaljir(). Kept free of other app imports so orders/operations/resources can
// all use it without import cycles.

export const DALJIR_ORDER = 'daljir.order';
export const DALJIR_MENU = 'daljir.menu';

export function daljirConfig() {
  const url = process.env.DALJIRCONNECT_URL?.trim().replace(/\/+$/, '') || '';
  const apiKey = process.env.DALJIRCONNECT_API_KEY?.trim() || '';
  const webhookSecret = process.env.DALJIRCONNECT_WEBHOOK_SECRET?.trim() || '';
  return { url, apiKey, webhookSecret, enabled: Boolean(url && apiKey) };
}

type Tx = Prisma.TransactionClient;

/**
 * Bring the DaljirConnect order in line with this one (status, payment, POS number). The payload only names the
 * order: the drain always sends the current state, so retries and out-of-order events can't move it backwards.
 */
export async function queueOrderSync(
  tx: Tx,
  restaurantId: string,
  dcOrderId: string,
  extra: { cancelReason?: string } = {},
) {
  if (!daljirConfig().enabled) return;
  await tx.outboxEvent.create({
    data: { restaurantId, topic: DALJIR_ORDER, payload: { dcOrderId, ...extra } },
  });
}

/** One pending menu sync is enough: the drain sends the whole menu as it is at that moment. */
export async function queueMenuSync(tx: Tx, restaurantId: string) {
  if (!daljirConfig().enabled) return;
  const pending = await tx.outboxEvent.findFirst({
    where: { restaurantId, topic: DALJIR_MENU, status: 'PENDING' },
    select: { id: true },
  });
  if (!pending)
    await tx.outboxEvent.create({ data: { restaurantId, topic: DALJIR_MENU, payload: {} } });
}
