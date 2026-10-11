import 'server-only';

import {
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import {
  sendSalesQuote,
} from '@/lib/apps/sales/commands';

const MAX_BULK_QUOTE_SEND = 50;

type BulkSendOutcome = {
  quoteId: string;
  success: boolean;
  code?: string;
  error?: string;
};

export async function bulkSendSalesQuotes(
  input: Record<string, unknown>,
) {
  await requireSalesContext(SALES_PERMISSIONS.QUOTE_SEND);

  if (!Array.isArray(input.quoteIds) || input.quoteIds.length === 0) {
    throw new SalesError(
      'INVALID_INPUT',
      'Select at least one quotation to send.',
    );
  }

  if (input.quoteIds.length > MAX_BULK_QUOTE_SEND) {
    throw new SalesError(
      'INVALID_INPUT',
      'Send no more than 50 quotations at a time.',
    );
  }

  const quoteIds = Array.from(
    new Set(
      input.quoteIds.map(value => requireUuid(value, 'Quotation')),
    ),
  );

  const results: BulkSendOutcome[] = [];

  // Keep provider calls sequential to avoid flooding delivery services and
  // preserve a separate, auditable delivery result for every quotation.
  for (const quoteId of quoteIds) {
    try {
      await sendSalesQuote({
        quoteId,
        channels: input.channels,
      });

      results.push({
        quoteId,
        success: true,
      });
    } catch (error) {
      results.push({
        quoteId,
        success: false,
        code: error instanceof SalesError
          ? error.code
          : 'DELIVERY_FAILED',
        error: error instanceof SalesError
          ? error.message
          : 'Unexpected delivery error.',
      });
    }
  }

  const sentCount = results.filter(result => result.success).length;
  const failedCount = results.length - sentCount;

  return {
    total: results.length,
    sentCount,
    failedCount,
    results,
  };
}
