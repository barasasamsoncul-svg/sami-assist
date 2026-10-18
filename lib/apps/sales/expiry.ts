import 'server-only';

import type { Pool, PoolClient } from 'pg';

import { recordSalesActivity } from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';

const SALES_QUOTE_EXPIRY_BATCH_SIZE = 500;

type ExpiringSalesQuote = {
  id: string;
  company_id: string;
  quote_number: string;
  status: 'sent' | 'viewed';
};

async function expireOverdueSalesQuotesForPool(pool: Pool): Promise<number> {
  let expired = 0;

  while (true) {
    const client: PoolClient = await pool.connect();
    let batchExpired = 0;

    try {
      await client.query('BEGIN');

      const overdue = await client.query<ExpiringSalesQuote>(
        `
          SELECT
            id::text AS id,
            company_id::text AS company_id,
            quote_number,
            status
          FROM sales_quotes
          WHERE status IN ('sent', 'viewed')
            AND valid_until < CURRENT_DATE
            AND deleted_at IS NULL
          ORDER BY valid_until ASC, id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [SALES_QUOTE_EXPIRY_BATCH_SIZE],
      );

      if (overdue.rows.length === 0) {
        await client.query('COMMIT');
        break;
      }

      for (const quote of overdue.rows) {
        const quoteId = String(quote.id);
        const companyId = String(quote.company_id);
        const quoteNumber = String(quote.quote_number);

        const updated = await client.query(
          `
            UPDATE sales_quotes
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
            RETURNING id
          `,
          [quoteId, companyId, quote.status],
        );

        // Keep history and activity aligned with an actual persisted transition.
        if (updated.rows.length !== 1) {
          continue;
        }

        await client.query(
          `
            INSERT INTO sales_quote_status_history (
              quote_id,
              company_id,
              from_status,
              to_status,
              reason,
              changed_by
            )
            VALUES ($1, $2, $3, 'expired', $4, NULL)
          `,
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
      expired += batchExpired;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database/audit error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return expired;
}

/**
 * Expire overdue quotes across all active tenant databases.
 *
 * Missing Sales tables are skipped for tenants that have not installed Sales.
 * A tenant failure is surfaced after attempting the remaining tenants, allowing
 * successful tenants to finish while making the scheduled job report failure.
 */
export async function expireOverdueSalesQuotes(): Promise<{ expired: number }> {
  const tenantResult = await queryControl(
    `
      SELECT td.tenant_id::text AS tenant_id
      FROM tenant_databases td
      INNER JOIN tenants t
        ON t.id = td.tenant_id
      WHERE LOWER(COALESCE(td.status, '')) = 'active'
        AND LOWER(COALESCE(t.status, '')) = 'active'
        AND t.deleted_at IS NULL
      ORDER BY td.tenant_id
    `,
  );

  let expired = 0;
  const failures: string[] = [];

  for (const row of tenantResult.rows) {
    const tenantId = String(row.tenant_id || '').trim();
    if (!tenantId) continue;

    try {
      const pool = await getTenantPoolByTenantId(tenantId);
      const salesTable = await pool.query(
        `SELECT to_regclass('public.sales_quotes') IS NOT NULL AS ready`,
      );

      if (salesTable.rows[0]?.ready !== true) {
        continue;
      }

      expired += await expireOverdueSalesQuotesForPool(pool);
    } catch (error) {
      failures.push(tenantId);
      console.error(
        '[SaMi Sales] Quote expiry failed for tenant:',
        tenantId,
        error instanceof Error ? error.message : 'Unknown database error',
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      'Sales quote expiry failed for ' + failures.length + ' tenant database(s).',
    );
  }

  return { expired };
}
