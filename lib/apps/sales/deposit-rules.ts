/**
 * There is one deposit record per Sales order, so retry identity must be
 * stable per order rather than supplied by an individual HTTP request.
 */
export function salesOrderDepositIdempotencyKey(orderId: string): string {
  return 'sales-order-' + orderId.trim().toLowerCase() + '-deposit';
}
