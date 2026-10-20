import type { PoolClient } from 'pg';

export type PublicSalesQuoteExpirySource =
  | 'public_quote_view'
  | 'public_quote_response';

export type PublicSalesQuoteExpiryActivity = {
  companyId: string;
  userId: null;
  quoteId: string;
  type: 'sales.quote.expired';
  content: string;
  metadata: {
    reason: 'validity_expired';
    source: PublicSalesQuoteExpirySource;
    attemptedAction?: string;
  };
};

export type RecordPublicSalesQuoteActivity = (
  client: PoolClient,
  activity: PublicSalesQuoteExpiryActivity,
) => Promise<unknown>;

/**
 * Transition an already-locked, expired public quotation to expired and persist
 * both its status history and activity event on the caller's transaction.
 *
 * The source status is checked again in the UPDATE (compare-and-set) so callers
 * cannot write an expiry history record for a transition that did not happen.
 * This function deliberately does not BEGIN or COMMIT; the caller must wrap the
 * state change and audit records in its existing transaction.
 *
 * Returns `true` when the transition succeeded, `false` when the quote was no
 * longer in the expected source status (caller can then re-read state).
 */
export async function expirePublicSalesQuoteWithAudit(
  client: PoolClient,
  input: {
    quoteId: string;
    companyId: string;
    quoteNumber: string;
    fromStatus: 'sent' | 'viewed';
    source: PublicSalesQuoteExpirySource;
    attemptedAction?: string;
  },
  recordActivity: RecordPublicSalesQuoteActivity,
): Promise<boolean> {
  const changed = await client.query(
    `UPDATE sales_quotes
     SET
       status = 'expired',
       expired_at = COALESCE(expired_at, NOW()),
       public_enabled = FALSE,
       updated_at = NOW()
     WHERE id = $1
       AND company_id = $2
       AND status = $3::varchar(30)
     RETURNING id`,
    [input.quoteId, input.companyId, input.fromStatus],
  );

  if (changed.rows.length !== 1) {
    return false;
  }

  await client.query(
    `INSERT INTO sales_quote_status_history
       (quote_id, company_id, from_status, to_status, reason, changed_by)
     VALUES ($1,$2,$3,'expired',$4,NULL)`,
    [
      input.quoteId,
      input.companyId,
      input.fromStatus,
      'Quotation expired before customer action.',
    ],
  );

  await recordActivity(client, {
    companyId: input.companyId,
    userId: null,
    quoteId: input.quoteId,
    type: 'sales.quote.expired',
    content: 'Quote ' + input.quoteNumber + ' expired before customer action.',
    metadata: {
      reason: 'validity_expired',
      source: input.source,
      ...(input.attemptedAction ? { attemptedAction: input.attemptedAction } : {}),
    },
  });

  return true;
}