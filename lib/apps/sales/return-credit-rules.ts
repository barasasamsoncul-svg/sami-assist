import { createHash } from 'node:crypto';

/**
 * Build a bounded Invoicing idempotency key from the complete caller key.
 * Invoicing prefixes this with "credit-refund:", so 106 characters keeps
 * the persisted key at or below 120 characters.
 *
 * Format: `srcr:<uuid>:<sha256-hex>` — deterministic, caller-key-dependent,
 * collision-resistant, and 4 + 36 + 1 + 64 = 105 characters.
 */
export function salesReturnRefundIdempotencyKey(
  returnCreditId: string,
  callerKey: string,
): string {
  const digest = createHash('sha256').update(callerKey).digest('hex');
  return 'srcr:' + returnCreditId + ':' + digest;
}

/**
 * Previous releases built a readable key and truncated it at 120 characters.
 * Look it up during recovery, but never use it for newly-created refunds.
 */
export function legacySalesReturnRefundIdempotencyKey(
  returnCreditId: string,
  callerKey: string,
): string {
  return (
    'sales-return-credit:' + returnCreditId + ':refund:' + callerKey
  ).slice(0, 120);
}