import 'server-only';

import {
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import {
  createSalesOrderInvoice,
} from '@/lib/apps/sales/commands';

const MAX_BULK_ORDER_INVOICES = 25;

type BulkInvoiceRequest = {
  orderId: string;
  idempotencyKey: string;
};

type BulkInvoiceOutcome = {
  orderId: string;
  success: boolean;
  invoiceId?: string;
  reused?: boolean;
  code?: string;
  error?: string;
};

/**
 * Create invoices for a bounded list of orders using the exact same
 * Invoicing-owned command and per-order idempotency contract as single-order
 * invoicing. Each order is independent: a bad order does not hide successful
 * outcomes for the rest of the requested batch.
 */
export async function bulkInvoiceSalesOrders(
  input: Record<string, unknown>,
) {
  // Authorize the batch before validating identifiers or causing any side effect.
  await requireSalesContext(SALES_PERMISSIONS.ORDER_MANAGE);

  if (!Array.isArray(input.orders) || input.orders.length === 0) {
    throw new SalesError(
      'INVALID_INPUT',
      'Select at least one sales order to invoice.',
    );
  }

  if (input.orders.length > MAX_BULK_ORDER_INVOICES) {
    throw new SalesError(
      'INVALID_INPUT',
      'Create invoices for no more than 25 sales orders at a time.',
    );
  }

  // Validate the complete batch before processing the first order so malformed
  // requests cannot partially invoice orders before failing validation.
  const requests: BulkInvoiceRequest[] = input.orders.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SalesError('INVALID_INPUT', 'A sales order invoice request is invalid.');
    }

    const row = value as Record<string, unknown>;
    const orderId = requireUuid(row.orderId, 'Sales order').toLowerCase();
    const idempotencyKey =
      typeof row.idempotencyKey === 'string'
        ? row.idempotencyKey.trim()
        : '';

    if (
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 120 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Each selected order needs a valid invoice retry key.',
      );
    }

    return { orderId, idempotencyKey };
  });

  const orderIds = new Set<string>();
  const idempotencyKeys = new Set<string>();

  for (const request of requests) {
    if (orderIds.has(request.orderId)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A sales order can only be selected once.',
      );
    }

    if (idempotencyKeys.has(request.idempotencyKey)) {
      throw new SalesError(
        'INVALID_INPUT',
        'Each selected order needs its own invoice retry key.',
      );
    }

    orderIds.add(request.orderId);
    idempotencyKeys.add(request.idempotencyKey);
  }

  const results: BulkInvoiceOutcome[] = [];

  // Sequential processing protects the Invoicing provider and preserves a
  // distinct audit/idempotency outcome per order.
  for (const request of requests) {
    try {
      const result = await createSalesOrderInvoice({
        orderId: request.orderId,
        idempotencyKey: request.idempotencyKey,
      });

      results.push({
        orderId: request.orderId,
        success: true,
        invoiceId: String(result.invoiceId),
        reused: result.reused === true,
      });
    } catch (error) {
      results.push({
        orderId: request.orderId,
        success: false,
        code: error instanceof SalesError ? error.code : 'INVOICE_FAILED',
        error: error instanceof SalesError
          ? error.message
          : 'The invoice request failed unexpectedly.',
      });
    }
  }

  const successCount = results.filter((result) => result.success).length;

  return {
    total: results.length,
    successCount,
    failedCount: results.length - successCount,
    results,
  };
}
