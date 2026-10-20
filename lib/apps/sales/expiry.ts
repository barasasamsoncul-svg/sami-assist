import 'server-only';

import type { Pool, PoolClient } from 'pg';

import { recordSalesActivity } from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const QUOTE_EXPIRY_BATCH_SIZE = 500;
const MAX_BATCHES_PER_TENANT = 10_000;

type ExpiringSalesQuote = {
  id: string;
  company_id: string;
  quote_number: string;
  status: 'sent' | 'viewed';
};

type TenantFailure = {
  tenantId: string;
  message: string;
};

type ExpireOverdueResult = {
  expired: number;
  failedTenantIds: string[];
};

/* -------------------------------------------------------------------------- */
/*  Per-tenant expiry loop                                                    */
/* -------------------------------------------------------------------------- */

async function expireOverdueSalesQuotesForPool(pool: Pool): Promise<number> {
  let total = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_TENANT; batch += 1) {
    const client: PoolClient = await pool.connect();
    let batchExpired = 0;

    try {
      await client.query('BEGIN');

      const overdue = await client.query<ExpiringSalesQuote>(
        `SELECT
           id::text AS id,
           company_id::text AS company_id,
           quote_number,
           status
         FROM sales_quotes
         WHERE status IN ('sent','viewed')
           AND valid_until < CURRENT_DATE
           AND deleted_at IS NULL
         ORDER BY valid_until ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [QUOTE_EXPIRY_BATCH_SIZE],
      );

      if (overdue.rows.length === 0) {
        await client.query('COMMIT');
        break;
      }

      for (const quote of overdue.rows) {
        const quoteId = String(quote.id);
        const companyId = String(quote.company_id);
        const quoteNumber = String(quote.quote_number);

        const updated = await client.query<{ id: string }>(
          `UPDATE sales_quotes
           SET
             status = 'expired',
             expired_at = COALESCE(expired_at, NOW()),
             public_enabled = FALSE,
             updated_by = NULL,
             updated_at = NOW()
           WHERE id = $1
             AND company_id = $2
             AND status = $3::varchar(30)
             AND valid_until < CURRENT_DATE
             AND deleted_at IS NULL
           RETURNING id`,
          [quoteId, companyId, quote.status],
        );

        // Only write history/activity when the transition actually persisted.
        if (updated.rows.length !== 1) continue;

        await client.query(
          `INSERT INTO sales_quote_status_history
             (quote_id, company_id, from_status, to_status, reason, changed_by)
           VALUES ($1, $2, $3, 'expired', $4, NULL)`,
          [
            quoteId,
            companyId,
            quote.status,
            'Quotation expired automatically after its validity date.',
          ],
        );

        await recordSalesActivity(client, {
          companyId,
          userId: null,
          quoteId,
          type: 'sales.quote.expired',
          content: 'Quote ' + quoteNumber + ' expired after its validity date.',
          metadata: {
            reason: 'validity_expired',
            source: 'scheduled_expiry',
          },
        });

        batchExpired += 1;
      }

      await client.query('COMMIT');
      total += batchExpired;

      // If we didn't fill a batch, there's nothing left to do.
      if (overdue.rows.length < QUOTE_EXPIRY_BATCH_SIZE) break;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* preserve original error */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return total;
}

/* -------------------------------------------------------------------------- */
/*  Scheduled entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Expire overdue quotes across all active tenant databases.
 *
 * Behaviour
 * - Tenants without a Sales module (or without a `sales_quotes` table) are
 *   silently skipped — this job is not responsible for module provisioning.
 * - A tenant failure does not block other tenants; the whole run fails after
 *   the remaining tenants have been attempted, so operations see the failure
 *   while correctly expiring everything else.
 * - Each batch and each quote transition is guarded by a compare-and-set on
 *   `(id, status, valid_until < CURRENT_DATE)` to remain idempotent under
 *   concurrent runs or customer-side acceptance.
 */
export async function expireOverdueSalesQuotes(): Promise<ExpireOverdueResult> {
  const tenantResult = await queryControl(
    `SELECT td.tenant_id::text AS tenant_id
     FROM tenant_databases td
     INNER JOIN tenants t
       ON t.id = td.tenant_id
     WHERE LOWER(COALESCE(td.status, '')) = 'active'
       AND LOWER(COALESCE(t.status, '')) = 'active'
       AND t.deleted_at IS NULL
     ORDER BY td.tenant_id`,
  );

  let expired = 0;
  const failures: TenantFailure[] = [];

  for (const row of tenantResult.rows) {
    const tenantId = String(row.tenant_id || '').trim();
    if (!tenantId) continue;

    try {
      const pool = await getTenantPoolByTenantId(tenantId);

      const salesTable = await pool.query<{ ready: boolean }>(
        `SELECT to_regclass('public.sales_quotes') IS NOT NULL AS ready`,
      );

      if (salesTable.rows[0]?.ready !== true) continue;

      expired += await expireOverdueSalesQuotesForPool(pool);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';
      failures.push({ tenantId, message });
      console.error(
        '[SaMi Sales] Quote expiry failed for tenant:',
        tenantId,
        message,
      );
    }
  }

  if (failures.length > 0) {
    const summary = failures
      .map((failure) => failure.tenantId + ': ' + failure.message)
      .join('; ');
    throw new Error(
      'Sales quote expiry failed for ' +
        failures.length +
        ' tenant database(s): ' +
        summary,
    );
  }

  return { expired, failedTenantIds: [] };
}