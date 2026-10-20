/**
 * There is one deposit record per Sales order, so retry identity must be
 * stable per order rather than supplied by an individual HTTP request.
 *
 * The returned key is deterministic for a given order ID, which lets callers
 * safely retry a deposit operation after a partial cross-module failure
 * without risking a duplicate retainer in Invoicing.
 */
export function salesOrderDepositIdempotencyKey(orderId: string): string {
  return 'sales-order-' + orderId.trim().toLowerCase() + '-deposit';
}