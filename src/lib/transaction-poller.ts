import { getDb } from "@/lib/db";
import { verifyAndProcess } from "@/lib/payments";
import { requirePaystackSecretForTransaction } from "@/lib/paystack-routing";

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const POLL_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

type PendingTx = {
  tenant_id: string;
  reference: string;
  amount_ngn: number;
  platform_billing_model: "percent" | "fixed_subscription" | null;
  platform_fee_ngn: number | null;
  paystack_subaccount_code: string | null;
};

async function pollOnce() {
  const db = getDb();
  const now = Date.now();
  const windowStart = new Date(now - POLL_WINDOW_MS).toISOString();

  // Reset transactions stuck in "processing" back to "pending".
  // Processing should only last a few seconds; if it's still there after a full
  // 60s poll cycle the worker that set it almost certainly crashed mid-flight.
  const reset = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'pending'
      WHERE payment_status = 'processing'
        AND created_at > ?
    `,
    )
    .run(windowStart);

  if (reset.changes > 0) {
    console.log(`[poller] Reset ${reset.changes} stuck processing transaction(s) to pending`);
  }

  // Expire transactions that have been pending for more than 3 hours.
  const expired = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'paystack_timeout'
      WHERE payment_status = 'pending'
        AND created_at <= ?
    `,
    )
    .run(windowStart);

  if (expired.changes > 0) {
    console.log(`[poller] Expired ${expired.changes} transaction(s) after 3h`);
  }

  // Fetch all still-pending transactions within the 3-hour window.
  const pending = await db
    .prepare(
      `
      SELECT tenant_id, reference, amount_ngn, platform_billing_model, platform_fee_ngn, paystack_subaccount_code
      FROM transactions
      WHERE payment_status = 'pending'
        AND created_at > ?
    `,
    )
    .all<PendingTx>(windowStart);

  if (pending.length === 0) return;

  console.log(`[poller] Checking ${pending.length} pending transaction(s)`);

  for (const tx of pending) {
    try {
      const secretKey = await requirePaystackSecretForTransaction({
        tenantId: tx.tenant_id,
        transaction: tx,
      });
      await verifyAndProcess({
        tenantId: tx.tenant_id,
        reference: tx.reference,
        expectedAmountNgn: tx.amount_ngn,
        paystackSecretKey: secretKey,
      });
    } catch (err) {
      console.error(`[poller] Error verifying ${tx.reference}:`, err);
    }
  }
}

let handle: ReturnType<typeof setInterval> | null = null;

export function startTransactionPoller() {
  if (handle) return;
  console.log("[poller] Started (interval: 60s, window: 3h)");
  // Run once immediately, then on the interval.
  pollOnce().catch((err) => console.error("[poller] Poll error:", err));
  handle = setInterval(() => {
    pollOnce().catch((err) => console.error("[poller] Poll error:", err));
  }, POLL_INTERVAL_MS);
}

export function stopTransactionPoller() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
