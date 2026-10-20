import 'server-only';

import {
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';
import { sendSalesQuote } from '@/lib/apps/sales/commands';

const MAX_BULK_QUOTE_SEND = 50;

export type BulkSendOutcome = {
  quoteId: string;
  success: boolean;
  code?: string;
  error?: string;
};

export type BulkSendResult = {
  total: number;
  sentCount: number;
  failedCount: number;
  results: BulkSendOutcome[];
};

export async function bulkSendSalesQuotes(
  input: Record<string, unknown>,
): Promise<BulkSendResult> {
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
      `Send no more than ${MAX_BULK_QUOTE_SEND} quotations at a time.`,
    );
  }

  const quoteIds = Array.from(
    new Set(input.quoteIds.map((value) => requireUuid(value, 'Quotation'))),
  );

  const results: BulkSendOutcome[] = [];

  // Sequential delivery keeps provider throttling predictable and gives each
  // quotation an independent, auditable delivery result.
  for (const quoteId of quoteIds) {
    try {
      await sendSalesQuote({
        quoteId,
        channels: input.channels,
        requireDraft: true,
      });
      results.push({ quoteId, success: true });
    } catch (error) {
      if (error instanceof SalesError) {
        results.push({
          quoteId,
          success: false,
          code: error.code,
          error: error.message,
        });
      } else {
        results.push({
          quoteId,
          success: false,
          code: 'DELIVERY_FAILED',
          error: 'Unexpected delivery error.',
        });
      }
    }
  }

  const sentCount = results.filter((result) => result.success).length;

  return {
    total: results.length,
    sentCount,
    failedCount: results.length - sentCount,
    results,
  };
}