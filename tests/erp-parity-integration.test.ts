import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  Pool,
} from 'pg';

import {
  postSalesFulfillmentToInventory,
  reserveSalesOrderInventory,
} from '../lib/apps/sales/inventory';

import {
  markSalesOpportunityWonFromAcceptedQuote,
} from '../lib/apps/sales/opportunity-conversion';

import {
  postInvoiceConfirmationToAccounting,
  postInvoicePaymentToAccounting,
  reverseInvoicingAccountingEvent,
} from '../lib/apps/invoicing/accounting';


import {
  specialistBreadthDepthSql,
} from '../lib/apps/enterprise/specialist-breadth-depth';

import {
  specialistDepthSql,
} from '../lib/apps/enterprise/specialist-depth';


const DATABASE_URL =
  process.env
    .TEST_DATABASE_URL ||
  '';

const integration =
  DATABASE_URL
    ? test
    : test.skip;


integration(
  'ERP parity: Sales inventory and Invoicing accounting execute transactionally in PostgreSQL',
  async () => {
    const pool =
      new Pool({
        connectionString:
          DATABASE_URL,
      });

    const companyId =
      '11111111-1111-4111-8111-111111111111';

    const userId =
      '22222222-2222-4222-8222-222222222222';

    const productId =
      '33333333-3333-4333-8333-333333333333';

    const warehouseId =
      '44444444-4444-4444-8444-444444444444';

    const orderId =
      '55555555-5555-4555-8555-555555555555';

    const lineId =
      '66666666-6666-4666-8666-666666666666';

    const invoiceId =
      '77777777-7777-4777-8777-777777777777';

    const paymentId =
      '88888888-8888-4888-8888-888888888888';

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      await client.query(
        `
          CREATE EXTENSION IF NOT EXISTS pgcrypto;

          CREATE TABLE companies (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            deleted_at TIMESTAMPTZ
          );

          -- Accounting 2.34 document extraction references the Core Files contract.
          -- This focused ERP fixture does not install the full tenant core, so keep
          -- the dependency explicit with the minimum FK target required here.
          CREATE TABLE files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID REFERENCES companies(id) ON DELETE CASCADE
          );

          CREATE TABLE products (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            product_type TEXT NOT NULL,
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE warehouses (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE stock_levels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
            reorder_level NUMERIC(18,4) NOT NULL DEFAULT 0,
            created_by UUID,
            updated_by UUID,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE stock_movements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            movement_type TEXT NOT NULL,
            quantity NUMERIC(18,4) NOT NULL,
            reference TEXT,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE stock_reservations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            quantity NUMERIC(18,4) NOT NULL,
            source_type TEXT NOT NULL,
            source_reference TEXT NOT NULL,
            status TEXT NOT NULL,
            created_by UUID,
            updated_by UUID,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE sales_order_items_v2 (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            sales_order_id UUID NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            quantity NUMERIC(18,4) NOT NULL,
            delivered_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
            external_product_id UUID,
            stock_reservation_id UUID
          );

          CREATE TABLE departments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            parent_id UUID,
            name VARCHAR(200) NOT NULL,
            code VARCHAR(50),
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            parent_account_id UUID,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE journals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            journal_number VARCHAR(100) NOT NULL,
            journal_date DATE NOT NULL,
            reference TEXT,
            description TEXT,
            status TEXT NOT NULL,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE journal_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            journal_id UUID NOT NULL,
            account_id UUID NOT NULL,
            description TEXT,
            debit NUMERIC(18,2) NOT NULL DEFAULT 0,
            credit NUMERIC(18,2) NOT NULL DEFAULT 0,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE invoicing_accounting_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            event_key VARCHAR(220) NOT NULL,
            source_type VARCHAR(60) NOT NULL,
            source_id UUID NOT NULL,
            journal_id UUID NOT NULL,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, event_key)
          );

          CREATE TABLE invoicing_invoices (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            invoice_number TEXT NOT NULL,
            invoice_date DATE NOT NULL,
            total_amount NUMERIC(18,2) NOT NULL,
            tax_total NUMERIC(18,2) NOT NULL,
            exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
            deleted_at TIMESTAMPTZ
          );
        `,
      );

      await client.query(
        specialistDepthSql(
          'accounting',
        ),
      );

      await client.query(
        `
          INSERT INTO companies (
            id,
            name
          )
          VALUES (
            $1,
            'ERP Integration Co'
          )
        `,
        [
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO accounting_fiscal_periods (
            company_id,
            name,
            starts_on,
            ends_on,
            status
          )
          VALUES (
            $1,
            'FY 2026',
            '2026-01-01',
            '2026-12-31',
            'open'
          )
        `,
        [
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO products (
            id,
            company_id,
            product_type
          )
          VALUES (
            $1,$2,'stockable'
          )
        `,
        [
          productId,
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO warehouses (
            id,
            company_id
          )
          VALUES (
            $1,$2
          )
        `,
        [
          warehouseId,
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO stock_levels (
            company_id,
            product_id,
            warehouse_id,
            quantity,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,10,$4,$4
          )
        `,
        [
          companyId,
          productId,
          warehouseId,
          userId,
        ],
      );

      await client.query(
        `
          INSERT INTO sales_order_items_v2 (
            id,
            company_id,
            sales_order_id,
            quantity,
            external_product_id
          )
          VALUES (
            $1,$2,$3,5,$4
          )
        `,
        [
          lineId,
          companyId,
          orderId,
          productId,
        ],
      );

      await client.query(
        `
          INSERT INTO invoicing_invoices (
            id,
            company_id,
            invoice_number,
            invoice_date,
            total_amount,
            tax_total,
            exchange_rate
          )
          VALUES (
            $1,$2,
            'INV-TEST-1',
            CURRENT_DATE,
            116,
            16,
            1
          )
        `,
        [
          invoiceId,
          companyId,
        ],
      );

      const reserved =
        await reserveSalesOrderInventory(
          client,
          {
            companyId,
            userId,
            orderId,
          },
        );

      assert.equal(
        reserved.integrated,
        true,
      );

      const line =
        await client.query(
          `
            SELECT
              stock_reservation_id
            FROM sales_order_items_v2
            WHERE id = $1
          `,
          [
            lineId,
          ],
        );

      assert.ok(
        line.rows[0]
          .stock_reservation_id,
      );

      await postSalesFulfillmentToInventory(
        client,
        {
          companyId,
          userId,
          orderId,
          lineId,
          orderedQuantity:
            5,
          quantityDelta:
            3,
          nextFulfilledQuantity:
            3,
          externalProductId:
            productId,
          reservationId:
            String(
              line.rows[0]
                .stock_reservation_id,
            ),
        },
      );

      const stock =
        await client.query(
          `
            SELECT quantity
            FROM stock_levels
            WHERE company_id = $1
              AND product_id = $2
              AND warehouse_id = $3
          `,
          [
            companyId,
            productId,
            warehouseId,
          ],
        );

      assert.equal(
        Number(
          stock.rows[0]
            .quantity,
        ),
        7,
      );

      const movement =
        await client.query(
          `
            SELECT
              movement_type,
              quantity
            FROM stock_movements
            WHERE company_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [
            companyId,
          ],
        );

      assert.equal(
        movement.rows[0]
          .movement_type,
        'sales_delivery',
      );

      assert.equal(
        Number(
          movement.rows[0]
            .quantity,
        ),
        3,
      );

      const confirmation =
        await postInvoiceConfirmationToAccounting(
          client,
          {
            companyId,
            userId,
            invoiceId,
          },
        );

      assert.equal(
        confirmation.integrated,
        true,
      );

      const confirmationTotals =
        await client.query(
          `
            SELECT
              SUM(debit)::numeric
                AS debit,
              SUM(credit)::numeric
                AS credit
            FROM journal_lines
            WHERE journal_id = $1
          `,
          [
            confirmation.journalId,
          ],
        );

      assert.equal(
        Number(
          confirmationTotals.rows[0]
            .debit,
        ),
        116,
      );

      assert.equal(
        Number(
          confirmationTotals.rows[0]
            .credit,
        ),
        116,
      );

      const payment =
        await postInvoicePaymentToAccounting(
          client,
          {
            companyId,
            userId,
            invoiceId,
            paymentId,
            paymentNumber:
              'PAY-TEST-1',
            paymentDate:
              '2026-09-27',
            amount:
              50,
            exchangeRate:
              1,
          },
        );

      assert.equal(
        payment.integrated,
        true,
      );

      const reversal =
        await reverseInvoicingAccountingEvent(
          client,
          {
            companyId,
            userId,
            originalEventKey:
              'invoice-payment:' +
              paymentId,
            reversalEventKey:
              'invoice-payment-reversal:' +
              paymentId,
            sourceType:
              'payment_reversal',
            sourceId:
              paymentId,
            description:
              'Payment reversal integration test',
          },
        );

      assert.equal(
        reversal.integrated,
        true,
      );

      const reversalTotals =
        await client.query(
          `
            SELECT
              SUM(debit)::numeric
                AS debit,
              SUM(credit)::numeric
                AS credit
            FROM journal_lines
            WHERE journal_id = $1
          `,
          [
            reversal.journalId,
          ],
        );

      assert.equal(
        Number(
          reversalTotals.rows[0]
            .debit,
        ),
        50,
      );

      assert.equal(
        Number(
          reversalTotals.rows[0]
            .credit,
        ),
        50,
      );

      await client.query(
        'ROLLBACK',
      );
    } finally {
      client.release();
      await pool.end();
    }
  },
);

integration(
  'ERP parity: Sales quote-to-order reconciles the linked CRM opportunity to Won once in PostgreSQL',
  async () => {
    const pool = new Pool({
      connectionString: DATABASE_URL,
    });
    const client = await pool.connect();

    const companyId = '11111111-1111-4111-8111-111111111111';
    const otherCompanyId = '12121212-1212-4121-8121-121212121212';
    const userId = '22222222-2222-4222-8222-222222222222';
    const pipelineId = '33333333-3333-4333-8333-333333333333';
    const openStageId = '44444444-4444-4444-8444-444444444444';
    const wonStageId = '55555555-5555-4555-8555-555555555555';
    const opportunityId = '66666666-6666-4666-8666-666666666666';
    const quoteId = '77777777-7777-4777-8777-777777777777';
    const orderId = '88888888-8888-4888-8888-888888888888';

    const validateOpportunityUuid = (value: unknown, label: string): string => {
      if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ) {
        throw new Error(label + ' must be a UUID.');
      }
      return value;
    };

    const conversionInput = {
      companyId,
      userId,
      opportunityId,
      quoteId,
      quoteNumber: 'Q-2026-0042',
      orderId,
      orderNumber: 'SO-2026-0017',
    };

    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE sales_pipeline_stages (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          pipeline_id UUID NOT NULL,
          stage_type VARCHAR(20) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          name VARCHAR(100) NOT NULL,
          sequence INTEGER NOT NULL
        ) ON COMMIT DROP;

        CREATE TEMP TABLE sales_opportunities (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          stage_id UUID NOT NULL,
          deleted_at TIMESTAMPTZ,
          probability NUMERIC(5,2) NOT NULL DEFAULT 0,
          won_at TIMESTAMPTZ,
          lost_at TIMESTAMPTZ,
          lost_reason TEXT,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        ) ON COMMIT DROP;

        CREATE TEMP TABLE sales_opportunity_stage_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          opportunity_id UUID NOT NULL,
          from_stage_id UUID,
          to_stage_id UUID NOT NULL,
          probability NUMERIC(5,2) NOT NULL,
          reason TEXT,
          changed_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        ) ON COMMIT DROP;

        CREATE TEMP TABLE activities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          user_id UUID,
          model VARCHAR(80) NOT NULL,
          record_id UUID NOT NULL,
          type VARCHAR(120) NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        ) ON COMMIT DROP;
      `);

      await client.query(
        `INSERT INTO sales_pipeline_stages
          (id, company_id, pipeline_id, stage_type, is_active, name, sequence)
         VALUES
          ($1, $2, $3, 'open', TRUE, 'Qualified', 10),
          ($4, $2, $3, 'won', TRUE, 'Won', 100)`,
        [openStageId, companyId, pipelineId, wonStageId],
      );

      await client.query(
        `INSERT INTO sales_opportunities
          (id, company_id, stage_id, probability, lost_at, lost_reason, updated_by)
         VALUES ($1, $2, $3, 40, NOW(), 'stale loss metadata', $4)`,
        [opportunityId, companyId, openStageId, userId],
      );

      // First order-conversion pass: stage, canonical probability, won/lost
      // timestamps, immutable stage history and CRM activity must all persist.
      await markSalesOpportunityWonFromAcceptedQuote(
        client,
        conversionInput,
        validateOpportunityUuid,
      );

      const firstOpportunity = await client.query(
        `SELECT stage_id, probability, won_at, lost_at, lost_reason, updated_by
         FROM sales_opportunities
         WHERE id = $1 AND company_id = $2`,
        [opportunityId, companyId],
      );
      assert.equal(firstOpportunity.rows.length, 1);
      assert.equal(firstOpportunity.rows[0].stage_id, wonStageId);
      assert.equal(Number(firstOpportunity.rows[0].probability), 100);
      assert.ok(firstOpportunity.rows[0].won_at instanceof Date);
      assert.equal(firstOpportunity.rows[0].lost_at, null);
      assert.equal(firstOpportunity.rows[0].lost_reason, null);
      assert.equal(firstOpportunity.rows[0].updated_by, userId);
      const firstWonAt = (firstOpportunity.rows[0].won_at as Date).toISOString();

      const firstHistory = await client.query(
        `SELECT from_stage_id, to_stage_id, probability, reason, changed_by
         FROM sales_opportunity_stage_history
         WHERE company_id = $1 AND opportunity_id = $2`,
        [companyId, opportunityId],
      );
      assert.equal(firstHistory.rows.length, 1);
      assert.equal(firstHistory.rows[0].from_stage_id, openStageId);
      assert.equal(firstHistory.rows[0].to_stage_id, wonStageId);
      assert.equal(Number(firstHistory.rows[0].probability), 100);
      assert.equal(
        firstHistory.rows[0].reason,
        'Accepted quotation Q-2026-0042 converted to sales order SO-2026-0017.',
      );
      assert.equal(firstHistory.rows[0].changed_by, userId);

      const firstActivity = await client.query(
        `SELECT model, record_id, type, content, metadata
         FROM activities
         WHERE company_id = $1 AND record_id = $2`,
        [companyId, opportunityId],
      );
      assert.equal(firstActivity.rows.length, 1);
      assert.equal(firstActivity.rows[0].model, 'sales.opportunity');
      assert.equal(firstActivity.rows[0].record_id, opportunityId);
      assert.equal(firstActivity.rows[0].type, 'sales.opportunity.won_from_order');
      assert.equal(
        firstActivity.rows[0].content,
        'Accepted quotation Q-2026-0042 converted to sales order SO-2026-0017.',
      );
      assert.deepEqual(firstActivity.rows[0].metadata, {
        quoteId,
        quoteNumber: 'Q-2026-0042',
        orderId,
        orderNumber: 'SO-2026-0017',
      });

      // An idempotent order-conversion retry preserves Won values without
      // duplicating transition history or the conversion activity.
      await markSalesOpportunityWonFromAcceptedQuote(
        client,
        conversionInput,
        validateOpportunityUuid,
      );
      const retriedOpportunity = await client.query(
        `SELECT stage_id, probability, won_at, lost_at, lost_reason
         FROM sales_opportunities
         WHERE id = $1 AND company_id = $2`,
        [opportunityId, companyId],
      );
      assert.equal(retriedOpportunity.rows[0].stage_id, wonStageId);
      assert.equal(Number(retriedOpportunity.rows[0].probability), 100);
      assert.equal((retriedOpportunity.rows[0].won_at as Date).toISOString(), firstWonAt);
      assert.equal(retriedOpportunity.rows[0].lost_at, null);
      assert.equal(retriedOpportunity.rows[0].lost_reason, null);

      const retryCounts = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM sales_opportunity_stage_history
             WHERE company_id = $1 AND opportunity_id = $2) AS history_count,
           (SELECT COUNT(*)::int FROM activities
             WHERE company_id = $1 AND record_id = $2
               AND type = 'sales.opportunity.won_from_order') AS activity_count`,
        [companyId, opportunityId],
      );
      assert.equal(retryCounts.rows[0].history_count, 1);
      assert.equal(retryCounts.rows[0].activity_count, 1);

      // A same-ID lookup under another company must not mutate the active
      // opportunity, append history, or emit activity.
      await markSalesOpportunityWonFromAcceptedQuote(
        client,
        { ...conversionInput, companyId: otherCompanyId },
        validateOpportunityUuid,
      );
      const crossCompanyGuard = await client.query(
        'SELECT stage_id FROM sales_opportunities WHERE id = $1 AND company_id = $2',
        [opportunityId, companyId],
      );
      assert.equal(crossCompanyGuard.rows[0].stage_id, wonStageId);

      // A deleted CRM record must also be ignored, allowing the Sales order
      // transaction to continue without mutating soft-deleted opportunity data.
      await client.query(
        'UPDATE sales_opportunities SET deleted_at = NOW() WHERE id = $1',
        [opportunityId],
      );
      await markSalesOpportunityWonFromAcceptedQuote(
        client,
        conversionInput,
        validateOpportunityUuid,
      );
      const finalCounts = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM sales_opportunity_stage_history
             WHERE company_id = $1 AND opportunity_id = $2) AS history_count,
           (SELECT COUNT(*)::int FROM activities
             WHERE company_id = $1 AND record_id = $2) AS activity_count`,
        [companyId, opportunityId],
      );
      assert.equal(finalCounts.rows[0].history_count, 1);
      assert.equal(finalCounts.rows[0].activity_count, 1);
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {}
      client.release();
      await pool.end();
    }
  },
);

integration(
  'ERP parity: accepted Sales quote converts to one confirmed order and reconciles CRM in PostgreSQL',
  async () => {
    const { createSalesOrderFromQuoteTransaction } = await import('../lib/apps/sales/commands');
    const { getPublicSalesQuote, respondToPublicSalesQuote } = await import('../lib/apps/sales/public');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      max: 1,
    });
    const setupClient = await pool.connect();

    const companyId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const salesTeamId = '23232323-2323-4232-8232-232323232323';
    const territoryId = '24242424-2424-4242-8242-242424242424';
    const pipelineId = '33333333-3333-4333-8333-333333333333';
    const openStageId = '44444444-4444-4444-8444-444444444444';
    const wonStageId = '55555555-5555-4555-8555-555555555555';
    const opportunityId = '66666666-6666-4666-8666-666666666666';
    const quoteId = '77777777-7777-4777-8777-777777777777';
    const catalogItemId = '88888888-8888-4888-8888-888888888888';
    const publicToken = 'sami-sales-integration-customer-acceptance-token-2026-10-15';
    const tokenHash = createHash('sha256').update(publicToken).digest('hex');

    const orderNumber = 'SO-2026-0017';
    let reserveCalls = 0;
    let commissionCalls = 0;
    let automationCalls = 0;
    let sequenceCalls = 0;

    try {
      await setupClient.query(`
        CREATE TEMP TABLE sales_pipeline_stages (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          pipeline_id UUID NOT NULL,
          stage_type VARCHAR(20) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          name VARCHAR(100) NOT NULL,
          sequence INTEGER NOT NULL
        );

        CREATE TEMP TABLE sales_opportunities (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          stage_id UUID NOT NULL,
          deleted_at TIMESTAMPTZ,
          probability NUMERIC(5,2) NOT NULL DEFAULT 0,
          won_at TIMESTAMPTZ,
          lost_at TIMESTAMPTZ,
          lost_reason TEXT,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_opportunity_stage_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          opportunity_id UUID NOT NULL,
          from_stage_id UUID,
          to_stage_id UUID NOT NULL,
          probability NUMERIC(5,2) NOT NULL,
          reason TEXT,
          changed_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_quotes (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          deleted_at TIMESTAMPTZ,
          template_id UUID,
          sales_order_id UUID,
          latest_invoice_id UUID,
          opportunity_id UUID,
          quote_number VARCHAR(80) NOT NULL,
          status VARCHAR(30) NOT NULL,
          approval_status VARCHAR(30) NOT NULL DEFAULT 'not_required',
          currency VARCHAR(3) NOT NULL,
          reference TEXT,
          customer_name TEXT NOT NULL,
          customer_email TEXT,
          customer_phone TEXT,
          customer_tax_id TEXT,
          billing_address TEXT,
          shipping_address TEXT,
          subtotal NUMERIC(14,2) NOT NULL,
          discount_total NUMERIC(14,2) NOT NULL,
          tax_total NUMERIC(14,2) NOT NULL,
          shipping_total NUMERIC(14,2) NOT NULL,
          total_amount NUMERIC(14,2) NOT NULL,
          pricelist_id UUID,
          cost_total NUMERIC(14,2) NOT NULL,
          margin_amount NUMERIC(14,2) NOT NULL,
          margin_percent NUMERIC(8,4) NOT NULL,
          salesperson_user_id UUID,
          sales_team_id UUID,
          territory_id UUID,
          notes TEXT,
          terms TEXT,
          quote_date DATE NOT NULL,
          base_currency VARCHAR(3) NOT NULL,
          exchange_rate NUMERIC(18,8) NOT NULL,
          exchange_rate_date DATE NOT NULL,
          exchange_rate_source VARCHAR(40) NOT NULL,
          base_total_amount NUMERIC(14,2) NOT NULL,
          deposit_type VARCHAR(20) NOT NULL DEFAULT 'none',
          deposit_value NUMERIC(14,2) NOT NULL DEFAULT 0,
          converted_at TIMESTAMPTZ,
          viewed_at TIMESTAMPTZ,
          public_token_hash CHAR(64),
          valid_until DATE NOT NULL,
          accepted_at TIMESTAMPTZ,
          rejected_at TIMESTAMPTZ,
          accepted_by_name TEXT,
          accepted_by_email TEXT,
          acceptance_note TEXT,
          acceptance_signature_consent_text TEXT,
          public_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE companies (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT,
          tax_id TEXT,
          registration_number TEXT,
          deleted_at TIMESTAMPTZ
        );

        CREATE TEMP TABLE sales_quote_templates (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          deleted_at TIMESTAMPTZ,
          primary_color TEXT,
          secondary_color TEXT,
          footer_text TEXT
        );

        CREATE TEMP TABLE sales_settings (
          company_id UUID PRIMARY KEY,
          allow_online_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
          allow_online_rejection BOOLEAN NOT NULL DEFAULT TRUE,
          primary_color TEXT,
          secondary_color TEXT,
          footer_text TEXT
        );

        CREATE TEMP TABLE sales_quote_optional_items (
          id UUID PRIMARY KEY,
          quote_id UUID NOT NULL,
          company_id UUID NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          catalog_item_id UUID,
          description TEXT NOT NULL DEFAULT 'Optional item',
          sku_snapshot TEXT,
          unit VARCHAR(40) NOT NULL DEFAULT 'unit',
          quantity NUMERIC(14,4) NOT NULL DEFAULT 1,
          unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
          tax_name_snapshot TEXT,
          tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
          is_selected BOOLEAN NOT NULL DEFAULT FALSE,
          selected_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_quote_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          quote_id UUID NOT NULL,
          company_id UUID NOT NULL,
          catalog_item_id UUID,
          external_product_id UUID,
          sort_order INTEGER NOT NULL,
          description TEXT NOT NULL,
          sku_snapshot TEXT,
          unit VARCHAR(40) NOT NULL,
          quantity NUMERIC(14,4) NOT NULL,
          unit_price NUMERIC(14,2) NOT NULL,
          unit_cost NUMERIC(14,2) NOT NULL,
          cost_total NUMERIC(14,2) NOT NULL,
          margin_amount NUMERIC(14,2) NOT NULL,
          margin_percent NUMERIC(8,4) NOT NULL,
          discount_type VARCHAR(20) NOT NULL,
          discount_value NUMERIC(14,2) NOT NULL,
          discount_amount NUMERIC(14,2) NOT NULL,
          tax_name_snapshot TEXT,
          tax_rate NUMERIC(8,4) NOT NULL,
          tax_amount NUMERIC(14,2) NOT NULL,
          subtotal NUMERIC(14,2) NOT NULL,
          line_total NUMERIC(14,2) NOT NULL
        );

        CREATE TEMP TABLE sales_orders_v2 (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          quote_id UUID NOT NULL,
          order_number VARCHAR(80) NOT NULL,
          status VARCHAR(30) NOT NULL,
          order_date DATE NOT NULL,
          currency VARCHAR(3) NOT NULL,
          reference TEXT,
          customer_name TEXT NOT NULL,
          customer_email TEXT,
          customer_phone TEXT,
          customer_tax_id TEXT,
          billing_address TEXT,
          shipping_address TEXT,
          subtotal NUMERIC(14,2) NOT NULL,
          discount_total NUMERIC(14,2) NOT NULL,
          tax_total NUMERIC(14,2) NOT NULL,
          shipping_total NUMERIC(14,2) NOT NULL,
          total_amount NUMERIC(14,2) NOT NULL,
          pricelist_id UUID,
          cost_total NUMERIC(14,2) NOT NULL,
          margin_amount NUMERIC(14,2) NOT NULL,
          margin_percent NUMERIC(8,4) NOT NULL,
          salesperson_user_id UUID,
          sales_team_id UUID,
          territory_id UUID,
          notes TEXT,
          terms TEXT,
          created_by UUID,
          updated_by UUID,
          base_currency VARCHAR(3),
          exchange_rate NUMERIC(18,8),
          exchange_rate_date DATE,
          exchange_rate_source VARCHAR(40),
          base_total_amount NUMERIC(14,2),
          deposit_type VARCHAR(20),
          deposit_value NUMERIC(14,2),
          deposit_required_amount NUMERIC(14,2),
          deposit_status VARCHAR(30),
          latest_invoice_id UUID,
          deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_order_items_v2 (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sales_order_id UUID NOT NULL,
          company_id UUID NOT NULL,
          catalog_item_id UUID,
          external_product_id UUID,
          sort_order INTEGER NOT NULL,
          description TEXT NOT NULL,
          sku_snapshot TEXT,
          unit VARCHAR(40) NOT NULL,
          quantity NUMERIC(14,4) NOT NULL,
          unit_price NUMERIC(14,2) NOT NULL,
          unit_cost NUMERIC(14,2) NOT NULL,
          cost_total NUMERIC(14,2) NOT NULL,
          margin_amount NUMERIC(14,2) NOT NULL,
          margin_percent NUMERIC(8,4) NOT NULL,
          discount_type VARCHAR(20) NOT NULL,
          discount_value NUMERIC(14,2) NOT NULL,
          discount_amount NUMERIC(14,2) NOT NULL,
          tax_name_snapshot TEXT,
          tax_rate NUMERIC(8,4) NOT NULL,
          tax_amount NUMERIC(14,2) NOT NULL,
          subtotal NUMERIC(14,2) NOT NULL,
          line_total NUMERIC(14,2) NOT NULL
        );

        CREATE TEMP TABLE sales_order_status_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sales_order_id UUID NOT NULL,
          company_id UUID NOT NULL,
          from_status VARCHAR(30),
          to_status VARCHAR(30) NOT NULL,
          reason TEXT,
          changed_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_quote_status_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          quote_id UUID NOT NULL,
          company_id UUID NOT NULL,
          from_status VARCHAR(30),
          to_status VARCHAR(30) NOT NULL,
          reason TEXT,
          changed_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE activities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          user_id UUID,
          model VARCHAR(80) NOT NULL,
          record_id UUID NOT NULL,
          type VARCHAR(120) NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await setupClient.query(
        `INSERT INTO sales_pipeline_stages
          (id, company_id, pipeline_id, stage_type, is_active, name, sequence)
         VALUES
          ($1, $2, $3, 'open', TRUE, 'Qualified', 10),
          ($4, $2, $3, 'won', TRUE, 'Won', 100)`,
        [openStageId, companyId, pipelineId, wonStageId],
      );

      await setupClient.query(
        `INSERT INTO sales_opportunities
          (id, company_id, stage_id, probability, lost_at, lost_reason, updated_by)
         VALUES ($1, $2, $3, 40, NOW(), 'old loss metadata', $4)`,
        [opportunityId, companyId, openStageId, userId],
      );

      await setupClient.query(
        `INSERT INTO companies (id, name, email, phone, address, tax_id, registration_number)
         VALUES ($1, 'Acme Supplier', 'sales@acme.test', '+254700000000', 'Nairobi', 'P000000000Z', 'REG-ACME-1')`,
        [companyId],
      );

      await setupClient.query(
        `INSERT INTO sales_quotes (
           id, company_id, opportunity_id, quote_number, status, approval_status,
           currency, customer_name, subtotal, discount_total, tax_total, shipping_total,
           total_amount, cost_total, margin_amount, margin_percent,
           salesperson_user_id, sales_team_id, territory_id, quote_date,
           base_currency, exchange_rate, exchange_rate_date, exchange_rate_source,
           base_total_amount, deposit_type, deposit_value, public_token_hash, valid_until
         ) VALUES (
           $1,$2,$3,'Q-2026-0042','sent','not_required',
           'KES','Acme Ltd',100,0,16,0,116,0,100,100,
           $4,$5,$6,CURRENT_DATE,'KES',1,CURRENT_DATE,'base',116,'none',0,$7,CURRENT_DATE + 14
         )`,
        [quoteId, companyId, opportunityId, userId, salesTeamId, territoryId, tokenHash],
      );

      await setupClient.query(
        `INSERT INTO sales_settings (company_id, allow_online_acceptance, allow_online_rejection)
         VALUES ($1, TRUE, TRUE)`,
        [companyId],
      );

      await setupClient.query(
        `INSERT INTO sales_quote_items (
           quote_id, company_id, catalog_item_id, external_product_id,
           sort_order, description, sku_snapshot, unit, quantity, unit_price,
           unit_cost, cost_total, margin_amount, margin_percent, discount_type,
           discount_value, discount_amount, tax_name_snapshot, tax_rate, tax_amount,
           subtotal, line_total
         ) VALUES (
           $1,$2,$3,NULL,1,'Consulting','CONS-1','unit',1,100,
           0,0,100,100,'percent',0,0,'VAT',16,16,100,116
         )`,
        [quoteId, companyId, catalogItemId],
      );
    } finally {
      setupClient.release();
    }

    const context = {
      companyId,
      userId,
      tenantId: 'integration-test-tenant',
      company: {
        currentCompany: {
          currency: 'KES',
        },
      },
      pool,
    } as unknown as Parameters<typeof createSalesOrderFromQuoteTransaction>[1];

    const dependencies: Parameters<typeof createSalesOrderFromQuoteTransaction>[2] = {
      ensureSalesDefaults: async () => {},
      assertSalesQuoteApprovalSatisfied: async () => {},
      nextSalesNumber: async () => {
        sequenceCalls += 1;
        return orderNumber;
      },
      reserveSalesOrderInventory: async () => {
        reserveCalls += 1;
        return {
          integrated: true,
          reserved: 1,
        };
      },
      recordSalesOrderCommissionEntries: async () => {
        commissionCalls += 1;
        return 1;
      },
      emitSalesAutomationEvent: async () => {
        automationCalls += 1;
      },
    };

    try {
      const publicView = await getPublicSalesQuote(
        'integration-test-tenant',
        publicToken,
        {},
        {
          getTenantPoolByTenantId: async () => pool,
        },
      );
      assert.equal(publicView.id, quoteId);
      assert.equal(publicView.status, 'viewed');
      assert.equal(publicView.quoteNumber, 'Q-2026-0042');
      assert.equal(publicView.customer.name, 'Acme Ltd');
      assert.equal(publicView.lines.length, 1);
      assert.equal(publicView.lines[0].description, 'Consulting');
      assert.equal(publicView.portal.allowAcceptance, true);

      const viewHistory = await pool.query(
        `SELECT from_status, to_status
         FROM sales_quote_status_history
         WHERE company_id = $1 AND quote_id = $2
         ORDER BY created_at ASC`,
        [companyId, quoteId],
      );
      assert.equal(viewHistory.rows.length, 1);
      assert.equal(viewHistory.rows[0].from_status, 'sent');
      assert.equal(viewHistory.rows[0].to_status, 'viewed');

      const acceptance = await respondToPublicSalesQuote(
        'integration-test-tenant',
        publicToken,
        {
          action: 'accept',
          signerName: 'Acme Authorized Buyer',
          signerEmail: 'buyer@acme.test',
          signatureConsent: true,
          acceptanceNote: 'Approved for order processing.',
        },
        {
          getTenantPoolByTenantId: async () => pool,
          assertSalesQuoteApprovalSatisfied: async () => {},
        },
      );
      assert.equal(acceptance.id, quoteId);
      assert.equal(acceptance.status, 'accepted');

      const acceptanceEvidence = await pool.query(
        `SELECT
           status,
           accepted_by_name,
           accepted_by_email,
           acceptance_note,
           acceptance_signature_consent_text,
           public_enabled
         FROM sales_quotes
         WHERE id = $1 AND company_id = $2`,
        [quoteId, companyId],
      );
      assert.equal(acceptanceEvidence.rows.length, 1);
      assert.equal(acceptanceEvidence.rows[0].status, 'accepted');
      assert.equal(acceptanceEvidence.rows[0].accepted_by_name, 'Acme Authorized Buyer');
      assert.equal(acceptanceEvidence.rows[0].accepted_by_email, 'buyer@acme.test');
      assert.equal(acceptanceEvidence.rows[0].acceptance_note, 'Approved for order processing.');
      assert.match(acceptanceEvidence.rows[0].acceptance_signature_consent_text, /electronic signature/i);
      assert.equal(acceptanceEvidence.rows[0].public_enabled, false);

      const acceptedHistory = await pool.query(
        `SELECT from_status, to_status, reason
         FROM sales_quote_status_history
         WHERE company_id = $1 AND quote_id = $2`,
        [companyId, quoteId],
      );
      assert.equal(acceptedHistory.rows.length, 2);
      assert.equal(acceptedHistory.rows[0].from_status, 'sent');
      assert.equal(acceptedHistory.rows[0].to_status, 'viewed');
      assert.equal(acceptedHistory.rows[1].from_status, 'viewed');
      assert.equal(acceptedHistory.rows[1].to_status, 'accepted');

      const first = await createSalesOrderFromQuoteTransaction(
        { quoteId },
        context,
        dependencies,
      );
      assert.equal(first.orderNumber, orderNumber);
      assert.equal(first.status, 'confirmed');
      assert.equal(first.invoiceId, null);
      assert.equal(sequenceCalls, 1);
      assert.equal(reserveCalls, 1);
      assert.equal(commissionCalls, 1);
      assert.equal(automationCalls, 1);

      const firstCheck = await pool.query(
        `SELECT
           q.status AS quote_status,
           q.sales_order_id,
           o.id AS order_id,
           o.order_number,
           o.status AS order_status,
           o.currency,
           o.base_currency,
           o.exchange_rate,
           o.base_total_amount,
           line.description,
           line.sku_snapshot,
           line.quantity,
           line.unit_price,
           line.tax_amount,
           line.line_total
         FROM sales_quotes q
         INNER JOIN sales_orders_v2 o
           ON o.id = q.sales_order_id
          AND o.company_id = q.company_id
         INNER JOIN sales_order_items_v2 line
           ON line.sales_order_id = o.id
          AND line.company_id = o.company_id
         WHERE q.id = $1 AND q.company_id = $2`,
        [quoteId, companyId],
      );
      assert.equal(firstCheck.rows.length, 1);
      assert.equal(firstCheck.rows[0].quote_status, 'converted');
      assert.equal(firstCheck.rows[0].sales_order_id, first.id);
      assert.equal(firstCheck.rows[0].order_id, first.id);
      assert.equal(firstCheck.rows[0].order_number, orderNumber);
      assert.equal(firstCheck.rows[0].order_status, 'confirmed');
      assert.equal(firstCheck.rows[0].currency, 'KES');
      assert.equal(firstCheck.rows[0].base_currency, 'KES');
      assert.equal(Number(firstCheck.rows[0].exchange_rate), 1);
      assert.equal(Number(firstCheck.rows[0].base_total_amount), 116);
      assert.equal(firstCheck.rows[0].description, 'Consulting');
      assert.equal(firstCheck.rows[0].sku_snapshot, 'CONS-1');
      assert.equal(Number(firstCheck.rows[0].quantity), 1);
      assert.equal(Number(firstCheck.rows[0].unit_price), 100);
      assert.equal(Number(firstCheck.rows[0].tax_amount), 16);
      assert.equal(Number(firstCheck.rows[0].line_total), 116);

      const second = await createSalesOrderFromQuoteTransaction(
        { quoteId },
        context,
        dependencies,
      );
      assert.equal(second.id, first.id);
      assert.equal(second.orderNumber, first.orderNumber);
      assert.equal(second.status, first.status);
      assert.equal(sequenceCalls, 1, 'a conversion retry must reuse the original order number');
      assert.equal(reserveCalls, 1, 'a conversion retry must not reserve stock again');
      assert.equal(commissionCalls, 1, 'a conversion retry must not accrue commission again');
      assert.equal(automationCalls, 1, 'a conversion retry must not re-emit order-created automation');

      const [counts, opportunity, quoteHistory, orderHistory] = await Promise.all([
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM sales_orders_v2 WHERE company_id = $1 AND quote_id = $2) AS orders,
             (SELECT COUNT(*)::int FROM sales_order_items_v2 WHERE company_id = $1 AND sales_order_id = $3) AS order_lines`,
          [companyId, quoteId, first.id],
        ),
        pool.query(
          `SELECT stage_id, probability, won_at, lost_at, lost_reason
           FROM sales_opportunities
           WHERE id = $1 AND company_id = $2`,
          [opportunityId, companyId],
        ),
        pool.query(
          `SELECT from_status, to_status, reason
           FROM sales_quote_status_history
           WHERE company_id = $1 AND quote_id = $2
           ORDER BY created_at ASC`,
          [companyId, quoteId],
        ),
        pool.query(
          `SELECT from_status, to_status, reason
           FROM sales_order_status_history
           WHERE company_id = $1 AND sales_order_id = $2`,
          [companyId, first.id],
        ),
      ]);

      assert.equal(counts.rows[0].orders, 1);
      assert.equal(counts.rows[0].order_lines, 1);
      assert.equal(opportunity.rows.length, 1);
      assert.equal(opportunity.rows[0].stage_id, wonStageId);
      assert.equal(Number(opportunity.rows[0].probability), 100);
      assert.ok(opportunity.rows[0].won_at instanceof Date);
      assert.equal(opportunity.rows[0].lost_at, null);
      assert.equal(opportunity.rows[0].lost_reason, null);
      assert.equal(quoteHistory.rows.length, 3);
      assert.equal(quoteHistory.rows[0].from_status, 'sent');
      assert.equal(quoteHistory.rows[0].to_status, 'viewed');
      assert.equal(quoteHistory.rows[1].from_status, 'viewed');
      assert.equal(quoteHistory.rows[1].to_status, 'accepted');
      assert.equal(quoteHistory.rows[2].from_status, 'accepted');
      assert.equal(quoteHistory.rows[2].to_status, 'converted');
      assert.equal(orderHistory.rows.length, 1);
      assert.equal(orderHistory.rows[0].from_status, null);
      assert.equal(orderHistory.rows[0].to_status, 'confirmed');

      const audit = await pool.query(
        `SELECT model, record_id, type, metadata
         FROM activities
         WHERE company_id = $1
           AND record_id IN ($2, $3)
         ORDER BY type`,
        [companyId, opportunityId, quoteId],
      );
      assert.equal(audit.rows.length, 5);
      assert.deepEqual(
        audit.rows.map((row: Record<string, unknown>) => row.type).sort(),
        [
          'sales.opportunity.won_from_order',
          'sales.quote.converted',
          'sales.quote.customer_accepted',
          'sales.quote.optional_products_selected',
          'sales.quote.viewed',
        ],
      );
      const opportunityAudit = audit.rows.find(
        (row: Record<string, unknown>) => row.type === 'sales.opportunity.won_from_order',
      );
      assert.equal(opportunityAudit?.model, 'sales.opportunity');
      assert.equal(opportunityAudit?.record_id, opportunityId);
      assert.deepEqual(opportunityAudit?.metadata, {
        quoteId,
        quoteNumber: 'Q-2026-0042',
        orderId: first.id,
        orderNumber,
      });
    } finally {
      await pool.end();
    }
  },
);

integration(
  'ERP parity: remaining specialist depth schemas execute in PostgreSQL',
  async () => {
    const pool =
      new Pool({
        connectionString:
          DATABASE_URL,
      });

    const client =
      await pool.connect();

    const baseTables =
      [
        'appointment_services',
        'appointments',
        'documents',
        'email_campaigns',
        'email_recipients',
        'events',
        'event_registrations',
        'service_orders',
        'service_visits',
        'vehicles',
        'equipment',
        'planning_resources',
        'engineering_changes',
        'shop_orders',
        'quality_issues',
        'referrals',
        'rental_items',
        'rental_contracts',
        'signature_requests',
        'signers',
        'sms_campaigns',
        'sms_recipients',
        'social_posts',
      ];

    const specialistModules =
      [
        'appointments',
        'documents',
        'email_marketing',
        'events',
        'field_services',
        'fleet',
        'maintenance',
        'marketing_automation',
        'planning',
        'plm',
        'pos_shop',
        'quality',
        'referrals',
        'rentals',
        'sign',
        'sms_marketing',
        'social_marketing',
      ];

    const expectedTables =
      [
        'appointment_availability_blocks',
        'appointment_reminders',
        'document_versions',
        'document_approvals',
        'email_templates',
        'email_campaign_events',
        'event_sessions',
        'event_tickets',
        'service_checklists',
        'vehicle_fuel_logs',
        'preventive_maintenance_plans',
        'automation_segments',
        'planning_capacity',
        'engineering_change_approvals',
        'shop_returns',
        'quality_corrective_actions',
        'referral_conversions',
        'referral_rewards',
        'rental_reservations',
        'rental_charges',
        'signature_templates',
        'signature_audit_events',
        'sms_templates',
        'sms_delivery_events',
        'social_campaigns',
        'social_post_metrics',
      ];

    try {
      await client.query(
        'BEGIN',
      );

      await client.query(
        'CREATE EXTENSION IF NOT EXISTS pgcrypto',
      );

      await client.query(
        `
          CREATE TABLE companies (
            id UUID PRIMARY KEY
          )
        `,
      );

      for (
        const table
        of baseTables
      ) {
        await client.query(
          'CREATE TABLE ' +
          table +
          ' (id UUID PRIMARY KEY)',
        );
      }

      for (
        const moduleKey
        of specialistModules
      ) {
        const sql =
          specialistBreadthDepthSql(
            moduleKey,
          );

        assert.ok(
          sql.trim(),
          moduleKey +
          ' should expose additive specialist depth SQL',
        );

        await client.query(
          sql,
        );
      }

      for (
        const table
        of expectedTables
      ) {
        const exists =
          await client.query(
            'SELECT to_regclass($1) AS relation',
            [
              'public.' +
              table,
            ],
          );

        assert.equal(
          exists.rows[0]
            ?.relation,
          table,
          table +
          ' should be created by the specialist parity migration',
        );
      }

      await client.query(
        'ROLLBACK',
      );
    } finally {
      client.release();
      await pool.end();
    }
  },
);

integration(
  'Tenant provisioning: core and Documents schemas execute from an empty PostgreSQL database',
  async () => {
    const pool =
      new Pool({
        connectionString:
          DATABASE_URL,
      });

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      await client.query(
        'CREATE EXTENSION IF NOT EXISTS pgcrypto',
      );

      const coreSql =
        (
          await readFile(
            path.join(
              process.cwd(),
              'lib',
              'schema',
              'tenant-core.sql',
            ),
            'utf8',
          )
        ).replace(
          /\{schema\}/g,
          'public',
        );

      await client.query(
        coreSql,
      );

      const coreVersion =
        await client.query(
          `
            SELECT version
            FROM public.core_schema_version
            ORDER BY installed_at DESC
            LIMIT 1
          `,
        );

      assert.ok(
        coreVersion.rows[0]
          ?.version,
        'tenant core schema should install its version marker',
      );

      const documentsSql =
        await readFile(
          path.join(
            process.cwd(),
            'lib',
            'apps',
            'documents',
            'schema.sql',
          ),
          'utf8',
        );

      await client.query(
        documentsSql,
      );

      const documentsTable =
        await client.query(
          "SELECT to_regclass('public.documents') AS relation",
        );

      assert.equal(
        documentsTable.rows[0]
          ?.relation,
        'documents',
      );

      const documentsTrigger =
        await client.query(
          `
            SELECT tgname
            FROM pg_trigger
            WHERE tgrelid =
                  'public.documents'::regclass
              AND tgname =
                  'trg_documents_updated_at'
              AND NOT tgisinternal
          `,
        );

      assert.equal(
        documentsTrigger.rows.length,
        1,
        'Documents app should install its updated_at trigger after creating the table.',
      );

      await client.query(
        'ROLLBACK',
      );
    } finally {
      client.release();
      await pool.end();
    }
  },
);

