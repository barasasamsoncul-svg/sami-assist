import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  Pool,
  type PoolClient,
} from 'pg';

import {
  postSalesFulfillmentToInventory,
  reserveSalesOrderInventory,
} from '../lib/apps/sales/inventory';

import {
  markSalesOpportunityWonFromAcceptedQuote,
} from '../lib/apps/sales/opportunity-conversion';

import { moveSalesOpportunityTransaction } from '../lib/apps/sales/pipeline';

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
    const {
      createSalesQuoteTransaction,
      updateSalesQuoteDraftTransaction,
      createSalesOrderFromQuoteTransaction,
      createSalesOrderInvoiceTransaction,
      updateSalesOrderFulfillmentTransaction,
    } = await import('../lib/apps/sales/commands');
    const { deliverSalesQuote } = await import('../lib/apps/sales/delivery');
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
    const warehouseId = '99999999-9999-4999-8999-999999999999';
    const billingCustomerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const firstInvoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const secondInvoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const publicToken = 'sami-sales-integration-customer-acceptance-token-2026-10-15';
    const tokenHash = createHash('sha256').update(publicToken).digest('hex');

    const orderNumber = 'SO-2026-0017';
    let reserveCalls = 0;
    let commissionCalls = 0;
    let automationCalls = 0;
    let fulfillmentAutomationCalls = 0;
    const fulfillmentAutomationSeeds: string[] = [];
    let sequenceCalls = 0;
    let invoiceCreateCalls = 0;
    let billingCustomerCreateCalls = 0;
    let invoiceAutomationCalls = 0;
    const invoiceAutomationSeeds: string[] = [];
    const invoicePayloads: unknown[] = [];
    const returnSessionHolder: { client: PoolClient | null } = { client: null };

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
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          deleted_at TIMESTAMPTZ,
          template_id UUID,
          sales_order_id UUID,
          latest_invoice_id UUID,
          billing_customer_id UUID,
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
          base_currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
          exchange_rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
          exchange_rate_source VARCHAR(40) NOT NULL DEFAULT 'base',
          base_total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
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
          sent_at TIMESTAMPTZ,
          internal_notes TEXT,
          created_by UUID,
          approval_requested_at TIMESTAMPTZ,
          approval_requested_by UUID,
          approved_at TIMESTAMPTZ,
          approved_by UUID,
          approval_rejected_at TIMESTAMPTZ,
          approval_rejected_by UUID,
          approval_rejection_reason TEXT,
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
          allow_partial_invoicing BOOLEAN NOT NULL DEFAULT TRUE,
          require_billing_customer_for_invoice BOOLEAN NOT NULL DEFAULT TRUE,
          invoice_policy VARCHAR(30) NOT NULL DEFAULT 'ordered',
          default_validity_days INTEGER NOT NULL DEFAULT 14,
          default_currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          require_quote_approval BOOLEAN NOT NULL DEFAULT FALSE,
          credit_limit_enforced BOOLEAN NOT NULL DEFAULT FALSE,
          quote_approval_threshold NUMERIC(14,2),
          terms_and_conditions TEXT,
          default_notes TEXT,
          primary_color TEXT,
          secondary_color TEXT,
          footer_text TEXT
        );

        CREATE TEMP TABLE products (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          product_type TEXT NOT NULL DEFAULT 'stockable',
          deleted_at TIMESTAMPTZ
        );

        CREATE TEMP TABLE warehouses (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TEMP TABLE stock_levels (
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

        CREATE TEMP TABLE stock_movements (
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

        CREATE TEMP TABLE stock_reservations (
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
          stock_reservation_id UUID,
          shipped_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
          delivered_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
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
          fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
          invoice_status VARCHAR(30) NOT NULL DEFAULT 'not_invoiced',
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
          shipping_invoiced BOOLEAN NOT NULL DEFAULT FALSE,
          deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_order_items_v2 (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sales_order_id UUID NOT NULL,
          company_id UUID NOT NULL,
          catalog_item_id UUID,
          external_product_id UUID,
          stock_reservation_id UUID,
          shipped_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
          delivered_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
          invoiced_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
          returned_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
          credited_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
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

        -- Public acceptance now supersedes stale requests after selected-item totals are recalculated.
        CREATE TEMP TABLE sales_quote_approval_requests (
          company_id UUID NOT NULL,
          quote_id UUID NOT NULL,
          status VARCHAR(30) NOT NULL,
          completed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TEMP TABLE sales_delivery_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          quote_id UUID NOT NULL,
          channel VARCHAR(30) NOT NULL,
          destination_fingerprint VARCHAR(64),
          provider VARCHAR(80),
          provider_message_id VARCHAR(255),
          status VARCHAR(30) NOT NULL,
          error_code VARCHAR(120),
          created_by UUID,
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

        CREATE TEMP TABLE sales_order_invoice_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          sales_order_id UUID NOT NULL,
          idempotency_key VARCHAR(120) NOT NULL,
          source_reference TEXT NOT NULL DEFAULT '',
          requested_lines JSONB,
          created_by UUID,
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          invoice_id UUID,
          error_code VARCHAR(120),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(company_id, sales_order_id, idempotency_key)
        );

        CREATE TEMP TABLE invoicing_invoices (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          reference TEXT,
          currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
          status VARCHAR(30) NOT NULL DEFAULT 'posted',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TEMP TABLE invoicing_invoice_items (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          invoice_id UUID NOT NULL,
          quantity NUMERIC(18,4) NOT NULL,
          line_total NUMERIC(18,2) NOT NULL DEFAULT 0,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          sort_order INTEGER NOT NULL DEFAULT 1
        );

        CREATE TEMP TABLE sales_commission_plans (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL
        );

        CREATE TEMP TABLE sales_commission_assignments (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          plan_id UUID NOT NULL
        );

        CREATE TEMP TABLE sales_commission_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          order_id UUID NOT NULL,
          plan_id UUID NOT NULL,
          assignment_id UUID NOT NULL,
          user_id UUID,
          team_id UUID,
          basis VARCHAR(20) NOT NULL,
          basis_amount NUMERIC(18,2) NOT NULL,
          commission_amount NUMERIC(18,2) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          status VARCHAR(20) NOT NULL,
          source_event_key VARCHAR(255) NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          reversed_at TIMESTAMPTZ,
          created_by UUID,
          updated_by UUID,
          UNIQUE(company_id, source_event_key)
        );

        CREATE TEMP TABLE sales_returns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          sales_order_id UUID NOT NULL,
          return_number VARCHAR(120) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'requested',
          reason TEXT NOT NULL,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          approved_at TIMESTAMPTZ,
          received_at TIMESTAMPTZ,
          credited_at TIMESTAMPTZ,
          refunded_at TIMESTAMPTZ,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(company_id, return_number)
        );

        CREATE TEMP TABLE sales_return_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
          sales_order_line_id UUID NOT NULL,
          quantity NUMERIC(18,4) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(return_id, sales_order_line_id)
        );

        CREATE TEMP TABLE sales_return_credits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
          invoice_id UUID NOT NULL,
          credit_note_id UUID NOT NULL,
          credit_note_number VARCHAR(140) NOT NULL,
          amount NUMERIC(18,2) NOT NULL DEFAULT 0,
          available_credit NUMERIC(18,2) NOT NULL DEFAULT 0,
          refunded_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(return_id, invoice_id),
          UNIQUE(company_id, credit_note_id)
        );

        CREATE TEMP TABLE sales_return_credit_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          return_credit_id UUID NOT NULL REFERENCES sales_return_credits(id) ON DELETE CASCADE,
          return_item_id UUID NOT NULL REFERENCES sales_return_items(id) ON DELETE RESTRICT,
          invoice_item_id UUID NOT NULL,
          quantity NUMERIC(18,4) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(return_credit_id, return_item_id, invoice_item_id)
        );

        CREATE TEMP TABLE invoicing_credit_notes (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'issued',
          idempotency_key VARCHAR(160),
          deleted_at TIMESTAMPTZ,
          UNIQUE(company_id, idempotency_key)
        );

        CREATE TEMP TABLE invoicing_credit_note_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          credit_note_id UUID NOT NULL,
          invoice_item_id UUID NOT NULL,
          quantity NUMERIC(18,4) NOT NULL,
          UNIQUE(credit_note_id, invoice_item_id)
        );

        CREATE TEMP TABLE invoicing_credit_note_balances (
          company_id UUID NOT NULL,
          credit_note_id UUID NOT NULL,
          available_amount NUMERIC(18,2) NOT NULL,
          PRIMARY KEY(company_id, credit_note_id)
        );

        CREATE TEMP TABLE invoicing_credit_note_refunds (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          credit_note_id UUID NOT NULL,
          idempotency_key VARCHAR(180) NOT NULL,
          amount NUMERIC(18,2) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'posted',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(company_id, credit_note_id, idempotency_key)
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
        `INSERT INTO products (id, company_id, product_type)
         VALUES ($1, $2, 'stockable')`,
        [catalogItemId, companyId],
      );

      await setupClient.query(
        `INSERT INTO warehouses (id, company_id)
         VALUES ($1, $2)`,
        [warehouseId, companyId],
      );

      await setupClient.query(
        `INSERT INTO stock_levels (
           company_id, product_id, warehouse_id, quantity, created_by, updated_by
         ) VALUES ($1, $2, $3, 10, $4, $4)`,
        [companyId, catalogItemId, warehouseId, userId],
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
        `INSERT INTO sales_settings (
           company_id, allow_online_acceptance, allow_online_rejection,
           allow_partial_invoicing, require_billing_customer_for_invoice, invoice_policy
         ) VALUES ($1, TRUE, TRUE, TRUE, TRUE, 'ordered')`,
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
           $1,$2,$3,$3,1,'Consulting','CONS-1','unit',1,100,
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
      reserveSalesOrderInventory: async (client, input) => {
        reserveCalls += 1;
        return reserveSalesOrderInventory(client, input);
      },
      recordSalesOrderCommissionEntries: async () => {
        commissionCalls += 1;
        return 1;
      },
      emitSalesAutomationEvent: async () => {
        automationCalls += 1;
      },
    };


    const invoiceDependencies: Parameters<typeof createSalesOrderInvoiceTransaction>[2] = {
      createInvoicingCustomer: async () => {
        billingCustomerCreateCalls += 1;
        return { id: billingCustomerId };
      },
      createInvoice: async input => {
        invoicePayloads.push(input);
        const id = invoiceCreateCalls === 0 ? firstInvoiceId : secondInvoiceId;
        invoiceCreateCalls += 1;
        return { id };
      },
      emitSalesAutomationEvent: async (_context, event) => {
        invoiceAutomationCalls += 1;
        invoiceAutomationSeeds.push(event.idempotencySeed);
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
           o.fulfillment_status,
           o.invoice_status,
           line.id AS order_line_id,
           line.external_product_id,
           line.stock_reservation_id,
           line.shipped_quantity,
           line.delivered_quantity,
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
      assert.equal(firstCheck.rows[0].fulfillment_status, 'not_started');
      assert.equal(firstCheck.rows[0].invoice_status, 'not_invoiced');
      assert.equal(firstCheck.rows[0].external_product_id, catalogItemId);
      assert.ok(firstCheck.rows[0].stock_reservation_id);

      const reservation = await pool.query(
        `SELECT product_id, warehouse_id, quantity, status, source_type, source_reference
         FROM stock_reservations
         WHERE id = $1 AND company_id = $2`,
        [firstCheck.rows[0].stock_reservation_id, companyId],
      );
      assert.equal(reservation.rows.length, 1);
      assert.equal(reservation.rows[0].product_id, catalogItemId);
      assert.equal(reservation.rows[0].warehouse_id, warehouseId);
      assert.equal(Number(reservation.rows[0].quantity), 1);
      assert.equal(reservation.rows[0].status, 'active');
      assert.equal(reservation.rows[0].source_type, 'sales_order_line');
      assert.equal(reservation.rows[0].source_reference, firstCheck.rows[0].order_line_id);

      const fulfillmentDependencies: Parameters<typeof updateSalesOrderFulfillmentTransaction>[2] = {
        postSalesFulfillmentToInventory,
        emitSalesAutomationEvent: async (_ctx, event) => {
          fulfillmentAutomationCalls += 1;
          fulfillmentAutomationSeeds.push(event.idempotencySeed);
        },
      };
      const fulfillmentInput = {
        orderId: first.id,
        lines: [{ lineId: String(firstCheck.rows[0].order_line_id), deliveredQuantity: 0.5 }],
      };
      const fulfillment = await updateSalesOrderFulfillmentTransaction(
        fulfillmentInput,
        context,
        fulfillmentDependencies,
      );
      assert.equal(fulfillment.status, 'confirmed');
      assert.equal(fulfillment.fulfillmentStatus, 'partial');
      assert.equal(fulfillment.invoiceStatus, 'not_invoiced');
      assert.equal(fulfillment.orderedQuantity, 1);
      assert.equal(fulfillment.deliveredQuantity, 0.5);

      const fulfillmentState = await pool.query(
        `SELECT
           line.quantity,
           line.shipped_quantity,
           line.delivered_quantity,
           line.stock_reservation_id,
           order_row.status,
           order_row.fulfillment_status,
           order_row.invoice_status
         FROM sales_order_items_v2 line
         INNER JOIN sales_orders_v2 order_row
           ON order_row.id = line.sales_order_id
          AND order_row.company_id = line.company_id
         WHERE line.sales_order_id = $1 AND line.company_id = $2`,
        [first.id, companyId],
      );
      assert.equal(fulfillmentState.rows.length, 1);
      assert.equal(Number(fulfillmentState.rows[0].shipped_quantity), 0.5);
      assert.equal(Number(fulfillmentState.rows[0].delivered_quantity), 0.5);
      assert.equal(fulfillmentState.rows[0].status, 'confirmed');
      assert.equal(fulfillmentState.rows[0].fulfillment_status, 'partial');
      assert.equal(fulfillmentState.rows[0].invoice_status, 'not_invoiced');

      const stockAfterPartialDelivery = await pool.query(
        `SELECT quantity FROM stock_levels
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, catalogItemId, warehouseId],
      );
      assert.equal(Number(stockAfterPartialDelivery.rows[0].quantity), 9.5);
      const deliveryMovements = await pool.query(
        `SELECT movement_type, quantity FROM stock_movements
         WHERE company_id = $1 AND product_id = $2 ORDER BY created_at ASC`,
        [companyId, catalogItemId],
      );
      assert.equal(deliveryMovements.rows.length, 1);
      assert.equal(deliveryMovements.rows[0].movement_type, 'sales_delivery');
      assert.equal(Number(deliveryMovements.rows[0].quantity), 0.5);

      const fulfillmentRetry = await updateSalesOrderFulfillmentTransaction(
        fulfillmentInput,
        context,
        fulfillmentDependencies,
      );
      assert.equal(fulfillmentRetry.fulfillmentStatus, 'partial');
      const stockAfterFulfillmentRetry = await pool.query(
        `SELECT quantity FROM stock_levels
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, catalogItemId, warehouseId],
      );
      assert.equal(Number(stockAfterFulfillmentRetry.rows[0].quantity), 9.5);

      const orderLineId = String(firstCheck.rows[0].order_line_id);
      const partialInvoiceInput = {
        orderId: first.id,
        idempotencyKey: 'erp-sales-partial-invoice-001',
        lines: [{ lineId: orderLineId, quantity: 0.4 }],
      };
      const partialInvoice = await createSalesOrderInvoiceTransaction(
        partialInvoiceInput,
        context,
        invoiceDependencies,
      );
      assert.equal(partialInvoice.invoiceId, firstInvoiceId);
      assert.equal(partialInvoice.invoiceStatus, 'partial');
      assert.equal(partialInvoice.status, 'confirmed');
      assert.equal(partialInvoice.reused, false);
      assert.equal(invoiceCreateCalls, 1);
      assert.equal(billingCustomerCreateCalls, 1);
      const firstInvoicePayload = invoicePayloads[0] as { lines: Array<{ quantity: number }>; reference: string };
      assert.equal(firstInvoicePayload.lines.length, 1);
      assert.equal(firstInvoicePayload.lines[0].quantity, 0.4);
      assert.ok(firstInvoicePayload.reference.includes('Sales order ' + first.orderNumber));

      const partialInvoiceRetry = await createSalesOrderInvoiceTransaction(
        partialInvoiceInput,
        context,
        invoiceDependencies,
      );
      assert.equal(partialInvoiceRetry.invoiceId, firstInvoiceId);
      assert.equal(partialInvoiceRetry.reused, true);
      assert.equal(invoiceCreateCalls, 1,
        'retrying the completed partial invoice batch must not call Invoicing again');

      const remainingInvoice = await createSalesOrderInvoiceTransaction(
        {
          orderId: first.id,
          idempotencyKey: 'erp-sales-invoice-remaining-002',
        },
        context,
        invoiceDependencies,
      );
      assert.equal(remainingInvoice.invoiceId, secondInvoiceId);
      assert.equal(remainingInvoice.invoiceStatus, 'invoiced');
      assert.equal(remainingInvoice.status, 'confirmed',
        'fully invoiced orders remain confirmed until fulfillment is complete');
      assert.equal(invoiceCreateCalls, 2);
      assert.equal(billingCustomerCreateCalls, 1,
        'the billing customer linked by the first batch should be reused');
      const secondInvoicePayload = invoicePayloads[1] as { lines: Array<{ quantity: number }> };
      assert.equal(secondInvoicePayload.lines.length, 1);
      assert.equal(secondInvoicePayload.lines[0].quantity, 0.6,
        'all_remaining should invoice only the quantity left after the earlier partial batch');
      assert.equal(invoiceAutomationCalls, 2,
        'each new invoice emits one automation event while the retry emits none');
      assert.deepEqual(invoiceAutomationSeeds, [
        'invoice:' + firstInvoiceId,
        'invoice:' + secondInvoiceId,
      ]);

      const invoicedLine = await pool.query(
        `SELECT quantity, delivered_quantity, invoiced_quantity
         FROM sales_order_items_v2
         WHERE sales_order_id = $1 AND company_id = $2`,
        [first.id, companyId],
      );
      assert.equal(invoicedLine.rows.length, 1);
      assert.equal(Number(invoicedLine.rows[0].quantity), 1);
      assert.equal(Number(invoicedLine.rows[0].delivered_quantity), 0.5);
      assert.equal(Number(invoicedLine.rows[0].invoiced_quantity), 1);

      const invoiceLinks = await pool.query(
        `SELECT order_row.invoice_status,
                order_row.latest_invoice_id AS order_latest_invoice_id,
                quote.latest_invoice_id AS quote_latest_invoice_id,
                order_row.shipping_invoiced
         FROM sales_orders_v2 order_row
         INNER JOIN sales_quotes quote
           ON quote.id = order_row.quote_id
          AND quote.company_id = order_row.company_id
         WHERE order_row.id = $1 AND order_row.company_id = $2`,
        [first.id, companyId],
      );
      assert.equal(invoiceLinks.rows.length, 1);
      assert.equal(invoiceLinks.rows[0].invoice_status, 'invoiced');
      assert.equal(invoiceLinks.rows[0].order_latest_invoice_id, secondInvoiceId);
      assert.equal(invoiceLinks.rows[0].quote_latest_invoice_id, secondInvoiceId);
      assert.equal(invoiceLinks.rows[0].shipping_invoiced, false);

      const invoiceBatches = await pool.query(
        `SELECT idempotency_key, status, invoice_id, requested_lines->>'mode' AS selection_mode,
                requested_lines->'lines' AS requested_lines
         FROM sales_order_invoice_batches
         WHERE company_id = $1 AND sales_order_id = $2
         ORDER BY idempotency_key ASC`,
        [companyId, first.id],
      );
      assert.equal(invoiceBatches.rows.length, 2);
      const explicitBatch = invoiceBatches.rows.find((row: Record<string, unknown>) => row.idempotency_key === 'erp-sales-partial-invoice-001');
      const remainingBatch = invoiceBatches.rows.find((row: Record<string, unknown>) => row.idempotency_key === 'erp-sales-invoice-remaining-002');
      assert.ok(explicitBatch);
      assert.ok(remainingBatch);
      assert.equal(explicitBatch.status, 'created');
      assert.equal(explicitBatch.invoice_id, firstInvoiceId);
      assert.equal(explicitBatch.selection_mode, 'explicit');
      assert.equal(remainingBatch.status, 'created');
      assert.equal(remainingBatch.invoice_id, secondInvoiceId);
      assert.equal(remainingBatch.selection_mode, 'all_remaining');
      assert.equal(remainingBatch.requested_lines[0].lineId, orderLineId);
      assert.equal(Number(remainingBatch.requested_lines[0].quantity), 0.6);
      const movementCountAfterRetry = await pool.query(
        `SELECT COUNT(*)::int AS count FROM stock_movements
         WHERE company_id = $1 AND product_id = $2 AND movement_type = 'sales_delivery'`,
        [companyId, catalogItemId],
      );
      assert.equal(movementCountAfterRetry.rows[0].count, 1);
      assert.equal(fulfillmentAutomationCalls, 2);
      assert.equal(fulfillmentAutomationSeeds[0], fulfillmentAutomationSeeds[1],
        'same fulfillment retry must reuse the same automation idempotency seed');

      await assert.rejects(
        updateSalesOrderFulfillmentTransaction(
          {
            orderId: first.id,
            lines: [{ lineId: String(firstCheck.rows[0].order_line_id), deliveredQuantity: 1.1 }],
          },
          context,
          fulfillmentDependencies,
        ),
        /Delivered quantity cannot exceed the ordered quantity/,
      );
      const stockAfterRejectedOverDelivery = await pool.query(
        `SELECT quantity FROM stock_levels
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, catalogItemId, warehouseId],
      );
      assert.equal(Number(stockAfterRejectedOverDelivery.rows[0].quantity), 9.5);

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
           WHERE company_id = $1 AND sales_order_id = $2
           ORDER BY created_at ASC`,
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
      assert.equal(orderHistory.rows.length, 4);
      assert.equal(orderHistory.rows[0].from_status, null);
      assert.equal(orderHistory.rows[0].to_status, 'confirmed');
      assert.equal(orderHistory.rows[1].from_status, 'fulfillment:not_started');
      assert.equal(orderHistory.rows[1].to_status, 'fulfillment:partial');
      assert.equal(orderHistory.rows[2].from_status, 'invoice:not_invoiced');
      assert.equal(orderHistory.rows[2].to_status, 'invoice:partial');
      assert.equal(orderHistory.rows[3].from_status, 'invoice:partial');
      assert.equal(orderHistory.rows[3].to_status, 'invoice:invoiced');

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

      // Carry the same PostgreSQL lifecycle through return receipt, invoice-credit
      // allocation, partial refund and idempotent refund recovery. The adapters
      // stand in only for Invoicing's cross-module commands; Sales persistence and
      // Inventory stock movements execute against PostgreSQL.
      const {
        createSalesReturnTransaction,
        approveSalesReturnTransaction,
        receiveSalesReturnTransaction,
        issueSalesReturnCreditTransaction,
        refundSalesReturnCreditTransaction,
      } = await import('../lib/apps/sales/operations');

      const getReturnSession = async (): Promise<PoolClient> => {
        if (!returnSessionHolder.client) {
          returnSessionHolder.client = await pool.connect();
        }
        return returnSessionHolder.client;
      };
      const returnPool = {
        query: async (queryText: string, values?: readonly unknown[]) => {
          const client = await getReturnSession();
          return client.query(queryText, values as never[]);
        },
        connect: async () => {
          const sharedClient = await getReturnSession();
          return {
            query: (queryText: string, values?: readonly unknown[]) =>
              sharedClient.query(queryText, values as never[]),
            // Keep the serialized test connection alive until the final assertions.
            release: () => {},
          };
        },
      } as unknown as typeof pool;

      const returnContext = {
        ...context,
        pool: returnPool,
      } as unknown as Parameters<typeof createSalesReturnTransaction>[1];

      const firstCreditNoteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const secondCreditNoteId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const firstInvoiceItemId = 'f1111111-1111-4111-8111-111111111111';
      const secondInvoiceItemId = 'f2222222-2222-4222-8222-222222222222';
      const returnNumber = 'SR-2026-0003';
      let returnNumberCalls = 0;
      let invoiceCreditCalls = 0;
      let refundAdapterCalls = 0;
      const creditRequests: Array<{
        invoiceId: string;
        lineQuantities: number[];
      }> = [];

      await returnPool.query(
        `INSERT INTO invoicing_invoices (id, company_id, reference, invoice_date, status)
         VALUES
           ($1, $3, 'INV-SALES-001', '2026-10-15', 'posted'),
           ($2, $3, 'INV-SALES-002', '2026-10-16', 'posted')`,
        [firstInvoiceId, secondInvoiceId, companyId],
      );

      const invoiceLineMetadata = JSON.stringify({
        sourceModule: 'sales',
        salesOrderId: first.id,
        salesOrderLineId: orderLineId,
      });
      await returnPool.query(
        `INSERT INTO invoicing_invoice_items
           (id, company_id, invoice_id, quantity, line_total, metadata, sort_order)
         VALUES
           ($1, $2, $3, 0.4, 46.4, $5::jsonb, 1),
           ($4, $2, $6, 0.6, 69.6, $5::jsonb, 1)`,
        [
          firstInvoiceItemId,
          companyId,
          firstInvoiceId,
          secondInvoiceItemId,
          invoiceLineMetadata,
          secondInvoiceId,
        ],
      );

      const createdReturn = await createSalesReturnTransaction(
        {
          orderId: first.id,
          reason: 'Customer returned part of the delivered order.',
          lines: [{ lineId: orderLineId, quantity: 0.5 }],
        },
        returnContext,
        {
          nextSalesNumber: async () => {
            returnNumberCalls += 1;
            return returnNumber;
          },
        },
      );
      assert.equal(createdReturn.returnNumber, returnNumber);
      assert.equal(createdReturn.status, 'requested');
      assert.equal(returnNumberCalls, 1);

      await assert.rejects(
        createSalesReturnTransaction(
          {
            orderId: first.id,
            reason: 'Try to return an already reserved quantity.',
            lines: [{ lineId: orderLineId, quantity: 0.1 }],
          },
          returnContext,
          {
            nextSalesNumber: async () => {
              returnNumberCalls += 1;
              return 'SR-2026-0004';
            },
          },
        ),
        /Return quantity exceeds the delivered quantity still available to return/,
        'pending return quantities must reserve the delivered amount against duplicate requests',
      );
      assert.equal(returnNumberCalls, 1, 'rejected return requests must not consume a return sequence');

      const approvedReturn = await approveSalesReturnTransaction(
        { returnId: createdReturn.returnId },
        returnContext,
      );
      assert.equal(approvedReturn.status, 'approved');

      const receivedReturn = await receiveSalesReturnTransaction(
        { returnId: createdReturn.returnId },
        returnContext,
      );
      assert.equal(receivedReturn.status, 'received');

      const returnLineAfterReceipt = await returnPool.query(
        `SELECT delivered_quantity, returned_quantity, credited_quantity
         FROM sales_order_items_v2 WHERE id = $1 AND company_id = $2`,
        [orderLineId, companyId],
      );
      const stockAfterReturn = await returnPool.query(
        `SELECT quantity FROM stock_levels
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, catalogItemId, warehouseId],
      );
      const returnMovements = await returnPool.query(
        `SELECT movement_type, quantity FROM stock_movements
         WHERE company_id = $1 AND product_id = $2
         ORDER BY movement_type, created_at, id`,
        [companyId, catalogItemId],
      );
      assert.equal(Number(returnLineAfterReceipt.rows[0].delivered_quantity), 0);
      assert.equal(Number(returnLineAfterReceipt.rows[0].returned_quantity), 0.5);
      assert.equal(Number(returnLineAfterReceipt.rows[0].credited_quantity), 0);
      assert.equal(Number(stockAfterReturn.rows[0].quantity), 10);
      assert.equal(returnMovements.rows.length, 2);
      assert.deepEqual(
        returnMovements.rows.map((row: Record<string, unknown>) => String(row.movement_type)).sort(),
        ['sales_delivery', 'sales_return'],
      );
      assert.equal(
        Number(returnMovements.rows.find((row: Record<string, unknown>) => row.movement_type === 'sales_return')?.quantity),
        0.5,
      );

      const commissionPlanId = '11111111-1111-4111-8111-111111111111';
      const commissionAssignmentId = '22222222-2222-4222-8222-222222222222';
      const accruedCommissionEntryId = '33333333-3333-4333-8333-333333333333';
      await returnPool.query(
        'INSERT INTO sales_commission_plans (id, company_id) VALUES ($1, $2)',
        [commissionPlanId, companyId],
      );
      await returnPool.query(
        'INSERT INTO sales_commission_assignments (id, company_id, plan_id) VALUES ($1, $2, $3)',
        [commissionAssignmentId, companyId, commissionPlanId],
      );
      await returnPool.query(
        `INSERT INTO sales_commission_entries (
           id, company_id, order_id, plan_id, assignment_id, basis, basis_amount,
           commission_amount, currency, status, source_event_key
         ) VALUES ($1, $2, $3, $4, $5, 'revenue', 116, 11.6, 'KES', 'accrued', 'original-order-commission-001')`,
        [accruedCommissionEntryId, companyId, first.id, commissionPlanId, commissionAssignmentId],
      );

      const creditNoteByInvoice = new Map([
        [firstInvoiceId, { id: firstCreditNoteId, number: 'CN-SALES-001', amount: 46.4 }],
        [secondInvoiceId, { id: secondCreditNoteId, number: 'CN-SALES-002', amount: 11.6 }],
      ]);
      const creditDependencies: Parameters<typeof issueSalesReturnCreditTransaction>[2] = {
        issueInvoiceCreditNote: (async (input: {
          invoiceId: string;
          idempotencyKey: string;
          items: Array<{ invoiceItemId: string; quantity: number }>;
        }) => {
          invoiceCreditCalls += 1;
          const invoiceId = String(input.invoiceId);
          const note = creditNoteByInvoice.get(invoiceId);
          assert.ok(note, 'a return credit must map to one of the source Sales invoices');
          creditRequests.push({
            invoiceId,
            lineQuantities: input.items.map(item => Number(item.quantity)),
          });

          await returnPool.query(
            `INSERT INTO invoicing_credit_notes (id, company_id, status, idempotency_key)
             VALUES ($1, $2, 'issued', $3)
             ON CONFLICT (company_id, idempotency_key) DO NOTHING`,
            [note.id, companyId, String(input.idempotencyKey)],
          );
          for (const item of input.items) {
            await returnPool.query(
              `INSERT INTO invoicing_credit_note_items
                 (company_id, credit_note_id, invoice_item_id, quantity)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (credit_note_id, invoice_item_id) DO NOTHING`,
              [companyId, note.id, String(item.invoiceItemId), Number(item.quantity)],
            );
          }
          await returnPool.query(
            `INSERT INTO invoicing_credit_note_balances
               (company_id, credit_note_id, available_amount)
             VALUES ($1, $2, $3)
             ON CONFLICT (company_id, credit_note_id) DO NOTHING`,
            [companyId, note.id, note.amount],
          );
          const balance = await returnPool.query(
            `SELECT available_amount FROM invoicing_credit_note_balances
             WHERE company_id = $1 AND credit_note_id = $2`,
            [companyId, note.id],
          );
          return {
            id: note.id,
            creditNoteNumber: note.number,
            amount: note.amount,
            status: 'issued',
            availableCredit: Number(balance.rows[0].available_amount),
            duplicate: invoiceCreditCalls > 2,
          };
        }) as unknown as NonNullable<Parameters<typeof issueSalesReturnCreditTransaction>[2]>['issueInvoiceCreditNote'],
      };

      const issuedReturnCredits = await issueSalesReturnCreditTransaction(
        { returnId: createdReturn.returnId },
        returnContext as Parameters<typeof issueSalesReturnCreditTransaction>[1],
        creditDependencies,
      );
      assert.equal(issuedReturnCredits.status, 'credited');
      assert.equal(issuedReturnCredits.credits.length, 2);
      assert.deepEqual(issuedReturnCredits.commissionReversals, [
        { currency: 'KES', reversedCount: 1, reversedAmount: 5.8 },
      ], 'crediting 58.00 of a 116.00 revenue basis reverses half of the 11.60 commission');
      const commissionReversalRows = await returnPool.query(
        `SELECT basis_amount, commission_amount, currency, status, source_event_key
         FROM sales_commission_entries
         WHERE company_id = $1 AND source_event_key LIKE $2`,
        [companyId, 'sales-return:' + createdReturn.returnId + ':commission:%'],
      );
      assert.equal(commissionReversalRows.rows.length, 1);
      assert.equal(Number(commissionReversalRows.rows[0].basis_amount), -58);
      assert.equal(Number(commissionReversalRows.rows[0].commission_amount), -5.8);
      assert.equal(commissionReversalRows.rows[0].currency, 'KES');
      assert.equal(commissionReversalRows.rows[0].status, 'reversed');
      assert.equal(invoiceCreditCalls, 2);
      assert.deepEqual(
        creditRequests.map(request => [request.invoiceId, ...request.lineQuantities.map(quantity => Number(quantity.toFixed(4)))]),
        [
          [firstInvoiceId, 0.4],
          [secondInvoiceId, 0.1],
        ],
        'the returned quantity must be allocated across its two source invoices without exceeding either line',
      );

      const savedReturnCredits = await returnPool.query(
        `SELECT invoice_id, credit_note_id, amount, available_credit, refunded_amount
         FROM sales_return_credits
         WHERE company_id = $1 AND return_id = $2
         ORDER BY invoice_id`,
        [companyId, createdReturn.returnId],
      );
      const savedAllocations = await returnPool.query(
        `SELECT credit.invoice_id, item.invoice_item_id, item.quantity
         FROM sales_return_credit_items item
         INNER JOIN sales_return_credits credit
           ON credit.id = item.return_credit_id
          AND credit.company_id = item.company_id
         WHERE item.company_id = $1 AND credit.return_id = $2
         ORDER BY credit.invoice_id`,
        [companyId, createdReturn.returnId],
      );
      const creditedLine = await returnPool.query(
        `SELECT credited_quantity, returned_quantity
         FROM sales_order_items_v2 WHERE id = $1 AND company_id = $2`,
        [orderLineId, companyId],
      );
      assert.equal(savedReturnCredits.rows.length, 2);
      assert.equal(Number(savedReturnCredits.rows[0].amount), 46.4);
      assert.equal(Number(savedReturnCredits.rows[1].amount), 11.6);
      assert.equal(savedAllocations.rows.length, 2);
      assert.equal(savedAllocations.rows[0].invoice_item_id, firstInvoiceItemId);
      assert.equal(Number(savedAllocations.rows[0].quantity), 0.4);
      assert.equal(savedAllocations.rows[1].invoice_item_id, secondInvoiceItemId);
      assert.equal(Number(savedAllocations.rows[1].quantity), 0.1);
      assert.equal(Number(creditedLine.rows[0].credited_quantity), 0.5);
      assert.equal(Number(creditedLine.rows[0].returned_quantity), 0.5);

      const retriedReturnCredits = await issueSalesReturnCreditTransaction(
        { returnId: createdReturn.returnId },
        returnContext as Parameters<typeof issueSalesReturnCreditTransaction>[1],
        creditDependencies,
      );
      assert.equal(retriedReturnCredits.status, 'credited');
      assert.equal(invoiceCreditCalls, 4, 'a credit request should be idempotent at the Invoicing boundary');
      const retryAllocationCount = await returnPool.query(
        `SELECT COUNT(*)::int AS count
         FROM sales_return_credit_items item
         INNER JOIN sales_return_credits credit
           ON credit.id = item.return_credit_id
          AND credit.company_id = item.company_id
         WHERE item.company_id = $1 AND credit.return_id = $2`,
        [companyId, createdReturn.returnId],
      );
      const retryCreditedLine = await returnPool.query(
        `SELECT credited_quantity FROM sales_order_items_v2 WHERE id = $1 AND company_id = $2`,
        [orderLineId, companyId],
      );
      assert.equal(retryAllocationCount.rows[0].count, 2);
      assert.equal(Number(retryCreditedLine.rows[0].credited_quantity), 0.5,
        'replayed credit allocation must not increase the credited quantity twice');

      const creditBalances = await returnPool.query(
        `SELECT id, invoice_id, credit_note_id, available_credit, refunded_amount
         FROM sales_return_credits WHERE company_id = $1 AND return_id = $2 ORDER BY invoice_id`,
        [companyId, createdReturn.returnId],
      );
      const firstReturnCreditId = String(creditBalances.rows[0].id);
      const secondReturnCreditId = String(creditBalances.rows[1].id);

      const refundDependencies: Parameters<typeof refundSalesReturnCreditTransaction>[2] = {
        refundInvoiceCreditNote: (async (input: {
          creditNoteId: string;
          idempotencyKey: string;
          amount: number;
        }) => {
          refundAdapterCalls += 1;
          const creditNoteId = String(input.creditNoteId);
          const invoicingKey = 'credit-refund:' + String(input.idempotencyKey);
          const prior = await returnPool.query(
            `SELECT id, amount FROM invoicing_credit_note_refunds
             WHERE company_id = $1 AND credit_note_id = $2 AND idempotency_key = $3`,
            [companyId, creditNoteId, invoicingKey],
          );
          const currentBalance = await returnPool.query(
            `SELECT available_amount FROM invoicing_credit_note_balances
             WHERE company_id = $1 AND credit_note_id = $2`,
            [companyId, creditNoteId],
          );
          if (prior.rows.length > 0) {
            return {
              refundId: String(prior.rows[0].id),
              refundNumber: 'RF-SALES-IDEMPOTENT',
              amount: Number(prior.rows[0].amount),
              availableCredit: Number(currentBalance.rows[0].available_amount),
              duplicate: true,
            };
          }

          const current = Number(currentBalance.rows[0].available_amount);
          const amount = Number(input.amount);
          assert.ok(amount > 0 && amount <= current + 0.0001, 'Invoicing must reject an over-refund');
          const nextAvailable = Math.round((current - amount) * 100) / 100;
          const inserted = await returnPool.query(
            `INSERT INTO invoicing_credit_note_refunds
               (company_id, credit_note_id, idempotency_key, amount, status)
             VALUES ($1, $2, $3, $4, 'posted')
             RETURNING id`,
            [companyId, creditNoteId, invoicingKey, amount],
          );
          await returnPool.query(
            `UPDATE invoicing_credit_note_balances
             SET available_amount = $3
             WHERE company_id = $1 AND credit_note_id = $2`,
            [companyId, creditNoteId, nextAvailable],
          );
          return {
            refundId: String(inserted.rows[0].id),
            refundNumber: 'RF-SALES-' + refundAdapterCalls,
            amount,
            availableCredit: nextAvailable,
            duplicate: false,
          };
        }) as unknown as NonNullable<Parameters<typeof refundSalesReturnCreditTransaction>[2]>['refundInvoiceCreditNote'],
      };

      const partialRefund = await refundSalesReturnCreditTransaction(
        {
          returnCreditId: firstReturnCreditId,
          amount: 20,
          idempotencyKey: 'return-first-refund-partial',
        },
        returnContext as Parameters<typeof refundSalesReturnCreditTransaction>[1],
        refundDependencies,
      );
      assert.equal(partialRefund.status, 'partially_refunded');
      assert.equal(partialRefund.amount, 20);
      assert.equal(partialRefund.availableCredit, 26.4);

      const retriedPartialRefund = await refundSalesReturnCreditTransaction(
        {
          returnCreditId: firstReturnCreditId,
          amount: 20,
          idempotencyKey: 'return-first-refund-partial',
        },
        returnContext as Parameters<typeof refundSalesReturnCreditTransaction>[1],
        refundDependencies,
      );
      assert.equal(retriedPartialRefund.status, 'partially_refunded');
      assert.equal(retriedPartialRefund.amount, 20);
      assert.equal(retriedPartialRefund.availableCredit, 26.4);
      const refundCountAfterRetry = await returnPool.query(
        `SELECT COUNT(*)::int AS count FROM invoicing_credit_note_refunds
         WHERE company_id = $1 AND credit_note_id = $2`,
        [companyId, creditBalances.rows[0].credit_note_id],
      );
      assert.equal(refundCountAfterRetry.rows[0].count, 1);
      assert.equal(refundAdapterCalls, 2, 'refund retry reuses the Invoicing idempotency key without posting twice');

      const creditRetryAfterRefund = await issueSalesReturnCreditTransaction(
        { returnId: createdReturn.returnId },
        returnContext as Parameters<typeof issueSalesReturnCreditTransaction>[1],
        creditDependencies,
      );
      assert.equal(creditRetryAfterRefund.status, 'partially_refunded',
        'credit retry must preserve a return that has already entered the refund lifecycle');
      assert.equal(invoiceCreditCalls, 6);
      const statusAfterCreditRetry = await returnPool.query(
        `SELECT status FROM sales_returns WHERE id = $1 AND company_id = $2`,
        [createdReturn.returnId, companyId],
      );
      assert.equal(statusAfterCreditRetry.rows[0].status, 'partially_refunded');

      const finalRefund = await refundSalesReturnCreditTransaction(
        {
          returnCreditId: firstReturnCreditId,
          amount: 26.4,
          idempotencyKey: 'return-first-refund-final',
        },
        returnContext as Parameters<typeof refundSalesReturnCreditTransaction>[1],
        refundDependencies,
      );
      assert.equal(finalRefund.status, 'partially_refunded',
        'a return remains partially refunded while another credit note has an unused balance');
      assert.equal(finalRefund.availableCredit, 0);

      const secondCreditRefund = await refundSalesReturnCreditTransaction(
        {
          returnCreditId: secondReturnCreditId,
          amount: 11.6,
          idempotencyKey: 'return-second-credit-refund',
        },
        returnContext as Parameters<typeof refundSalesReturnCreditTransaction>[1],
        refundDependencies,
      );
      assert.equal(secondCreditRefund.status, 'refunded');
      assert.equal(secondCreditRefund.availableCredit, 0);

      await assert.rejects(
        refundSalesReturnCreditTransaction(
          {
            returnCreditId: firstReturnCreditId,
            amount: 0.01,
            idempotencyKey: 'return-over-refund',
          },
          returnContext as Parameters<typeof refundSalesReturnCreditTransaction>[1],
          refundDependencies,
        ),
        /Refund amount exceeds the customer credit available from this return/,
        'Sales must reject a refund greater than the remaining credit balance before calling Invoicing',
      );

      const finalReturn = await returnPool.query(
        `SELECT status, received_at, credited_at, refunded_at
         FROM sales_returns WHERE id = $1 AND company_id = $2`,
        [createdReturn.returnId, companyId],
      );
      const finalReturnCredits = await returnPool.query(
        `SELECT COUNT(*)::int AS count, SUM(amount) AS total_credit,
                SUM(available_credit) AS remaining_credit,
                SUM(refunded_amount) AS refunded_amount
         FROM sales_return_credits WHERE company_id = $1 AND return_id = $2`,
        [companyId, createdReturn.returnId],
      );
      const finalRefunds = await returnPool.query(
        `SELECT COUNT(*)::int AS count, SUM(amount) AS refunded_amount
         FROM invoicing_credit_note_refunds WHERE company_id = $1`,
        [companyId],
      );
      const finalLine = await returnPool.query(
        `SELECT delivered_quantity, returned_quantity, credited_quantity, invoiced_quantity
         FROM sales_order_items_v2 WHERE id = $1 AND company_id = $2`,
        [orderLineId, companyId],
      );
      const finalStock = await returnPool.query(
        `SELECT quantity FROM stock_levels
         WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3`,
        [companyId, catalogItemId, warehouseId],
      );
      const finalMovements = await returnPool.query(
        `SELECT movement_type, quantity FROM stock_movements
         WHERE company_id = $1 AND product_id = $2
         ORDER BY movement_type, created_at, id`,
        [companyId, catalogItemId],
      );
      assert.equal(finalReturn.rows[0].status, 'refunded');
      assert.ok(finalReturn.rows[0].received_at instanceof Date);
      assert.ok(finalReturn.rows[0].credited_at instanceof Date);
      assert.ok(finalReturn.rows[0].refunded_at instanceof Date);
      assert.equal(finalReturnCredits.rows[0].count, 2);
      assert.equal(Number(finalReturnCredits.rows[0].total_credit), 58);
      assert.equal(Number(finalReturnCredits.rows[0].remaining_credit), 0);
      assert.equal(Number(finalReturnCredits.rows[0].refunded_amount), 58);
      assert.equal(finalRefunds.rows[0].count, 3,
        'one duplicate retry must not add an extra posted refund');
      assert.equal(Number(finalRefunds.rows[0].refunded_amount), 58);
      assert.equal(Number(finalLine.rows[0].delivered_quantity), 0);
      assert.equal(Number(finalLine.rows[0].returned_quantity), 0.5);
      assert.equal(Number(finalLine.rows[0].credited_quantity), 0.5);
      assert.equal(Number(finalLine.rows[0].invoiced_quantity), 1);
      assert.equal(Number(finalStock.rows[0].quantity), 10);
      assert.equal(finalMovements.rows.length, 2);


      // Finish the quote authoring path against the same PostgreSQL-backed tenant:
      // create a commercial draft, revise its lines/totals, deliver it, and ensure
      // the terminal sent state prevents further draft edits.
      let authoringQuoteSequence = 0;
      const makeAuthoringLine = (raw: unknown) => {
        const item = Array.isArray(raw) && raw[0] && typeof raw[0] === 'object'
          ? raw[0] as Record<string, unknown>
          : {};
        const quantity = Math.max(0.0001, Number(item.quantity ?? 1));
        const unitPrice = Math.max(0, Number(item.unitPrice ?? 100));
        const unitCost = Math.max(0, Number(item.unitCost ?? 30));
        const subtotal = Math.round(quantity * unitPrice * 100) / 100;
        const costTotal = Math.round(quantity * unitCost * 100) / 100;
        const taxRate = 16;
        const taxAmount = Math.round(subtotal * taxRate) / 100;
        const discountAmount = 0;
        return [{
          catalogItemId: null,
          externalProductId: null,
          sortOrder: 1,
          description: String(item.description ?? 'Authoring test line'),
          sku: String(item.sku ?? 'AUTHORING-1'),
          unit: 'unit',
          quantity,
          unitPrice,
          unitCost,
          costTotal,
          marginAmount: Math.round((subtotal - costTotal) * 100) / 100,
          marginPercent: subtotal > 0 ? Math.round((subtotal - costTotal) / subtotal * 10000) / 100 : 0,
          discountType: 'percent' as const,
          discountValue: 0,
          discountAmount,
          taxName: 'VAT',
          taxRate,
          taxAmount,
          subtotal,
          lineTotal: subtotal + taxAmount,
        }];
      };

      const quoteAuthoringDependencies: Parameters<typeof createSalesQuoteTransaction>[2] = {
        ensureSalesDefaults: async () => {},
        resolveTemplate: async () => null,
        resolveCustomerSnapshot: async (_client, _ctx, input) => ({
          billingCustomerId: null,
          customerName: String(input.customerName ?? 'Authoring Customer'),
          customerEmail: input.customerEmail ? String(input.customerEmail) : null,
          customerPhone: input.customerPhone ? String(input.customerPhone) : null,
          customerTaxId: input.customerTaxId ? String(input.customerTaxId) : null,
          billingAddress: input.billingAddress ? String(input.billingAddress) : null,
          shippingAddress: input.shippingAddress ? String(input.shippingAddress) : null,
          currency: 'KES',
        }),
        resolveSalesExchangeRate: async (_client, input) => ({
          currency: String(input.currency).toUpperCase(),
          baseCurrency: String(input.baseCurrency).toUpperCase(),
          rate: 1,
          effectiveDate: String(input.effectiveDate),
          source: 'base' as const,
          sourceName: 'Company base currency',
          manualOverride: false,
        }),
        normalizeQuoteLines: async (_client, _ctx, raw) => makeAuthoringLine(raw),
        nextSalesNumber: async () => {
          authoringQuoteSequence += 1;
          return 'Q-2026-AUTH-' + String(authoringQuoteSequence).padStart(3, '0');
        },
        resolveSalesAssignmentForUser: async () => ({
          salesTeamId: null,
          territoryId: null,
        }),
        emitSalesAutomationEvent: async () => {},
      };

      const authoringInput = {
        quoteDate: '2026-10-15',
        validUntil: '2026-10-29',
        currency: 'KES',
        customerName: 'Authoring Customer Ltd',
        customerEmail: 'buyer@authoring.test',
        reference: 'AUTHORING-REF-1',
        notes: 'Initial notes',
        lines: [{ description: 'Consulting support', sku: 'AUTH-1', quantity: 1, unitPrice: 100, unitCost: 30 }],
      };
      const authoringContext = returnContext as Parameters<typeof createSalesQuoteTransaction>[1];
      const createdAuthoringQuote = await createSalesQuoteTransaction(
        authoringInput,
        authoringContext,
        quoteAuthoringDependencies,
      );
      assert.equal(createdAuthoringQuote.status, 'draft');
      assert.equal(createdAuthoringQuote.quoteNumber, 'Q-2026-AUTH-001');
      assert.equal(createdAuthoringQuote.totalAmount, 116);
      assert.equal(createdAuthoringQuote.currency, 'KES');

      const createdAuthoringState = await returnPool.query(
        `SELECT status, subtotal, tax_total, total_amount, base_total_amount, internal_notes
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(createdAuthoringState.rows.length, 1);
      assert.equal(createdAuthoringState.rows[0].status, 'draft');
      assert.equal(Number(createdAuthoringState.rows[0].subtotal), 100);
      assert.equal(Number(createdAuthoringState.rows[0].tax_total), 16);
      assert.equal(Number(createdAuthoringState.rows[0].total_amount), 116);
      assert.equal(Number(createdAuthoringState.rows[0].base_total_amount), 116);
      assert.equal(createdAuthoringState.rows[0].internal_notes, null);

      const createdAuthoringLine = await returnPool.query(
        `SELECT description, sku_snapshot, quantity, unit_price, tax_amount, line_total
         FROM sales_quote_items WHERE quote_id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(createdAuthoringLine.rows.length, 1);
      assert.equal(createdAuthoringLine.rows[0].description, 'Consulting support');
      assert.equal(createdAuthoringLine.rows[0].sku_snapshot, 'AUTH-1');
      assert.equal(Number(createdAuthoringLine.rows[0].quantity), 1);
      assert.equal(Number(createdAuthoringLine.rows[0].line_total), 116);

      const revisedAuthoringQuote = await updateSalesQuoteDraftTransaction(
        {
          ...authoringInput,
          quoteId: createdAuthoringQuote.id,
          shippingTotal: 5,
          notes: 'Revised commercial terms',
          lines: [{ description: 'Consulting support - expanded', sku: 'AUTH-1', quantity: 2, unitPrice: 100, unitCost: 30 }],
        },
        authoringContext as Parameters<typeof updateSalesQuoteDraftTransaction>[1],
        quoteAuthoringDependencies,
      );
      assert.equal(revisedAuthoringQuote.status, 'draft');
      assert.equal(revisedAuthoringQuote.totalAmount, 237);
      const revisedAuthoringState = await returnPool.query(
        `SELECT status, subtotal, tax_total, shipping_total, total_amount, notes
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(revisedAuthoringState.rows.length, 1);
      assert.equal(revisedAuthoringState.rows[0].status, 'draft');
      assert.equal(Number(revisedAuthoringState.rows[0].subtotal), 200);
      assert.equal(Number(revisedAuthoringState.rows[0].tax_total), 32);
      assert.equal(Number(revisedAuthoringState.rows[0].shipping_total), 5);
      assert.equal(Number(revisedAuthoringState.rows[0].total_amount), 237);
      assert.equal(revisedAuthoringState.rows[0].notes, 'Revised commercial terms');
      const revisedAuthoringLines = await returnPool.query(
        `SELECT description, quantity, unit_price, line_total
         FROM sales_quote_items WHERE quote_id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(revisedAuthoringLines.rows.length, 1, 'editing a quote must replace its existing line set atomically');
      assert.equal(revisedAuthoringLines.rows[0].description, 'Consulting support - expanded');
      assert.equal(Number(revisedAuthoringLines.rows[0].quantity), 2);
      assert.equal(Number(revisedAuthoringLines.rows[0].line_total), 232);

      const authoringDeliveryDeps: Parameters<typeof deliverSalesQuote>[1] = {
        assertSalesQuoteApprovalSatisfied: async () => {},
        getPublicSalesQuote: async (tenantId, token, options) => getPublicSalesQuote(
          tenantId,
          token,
          options,
          { getTenantPoolByTenantId: async () => returnPool as unknown as Pool },
        ),
        renderSalesQuotePdf: () => Buffer.from('%PDF-1.4 SaMi integration test'),
        sendWorkspaceNotificationEmail: async () => ({
          success: true,
          messageId: 'authoring-delivery-email-001',
        }),
      };
      const sentAuthoringQuote = await deliverSalesQuote(
        {
          pool: returnPool as unknown as Pool,
          tenantId: 'integration-test-tenant',
          companyId,
          companyName: 'SaMi Integration',
          userId,
          quoteId: createdAuthoringQuote.id,
          channels: ['email'],
        },
        authoringDeliveryDeps,
      );
      assert.ok(sentAuthoringQuote.publicPath.includes('/q/integration-test-tenant/'));
      assert.equal(sentAuthoringQuote.deliveries.length, 1);
      assert.equal(sentAuthoringQuote.deliveries[0].success, true);
      assert.equal(sentAuthoringQuote.deliveries[0].messageId, 'authoring-delivery-email-001');

      const sentAuthoringState = await returnPool.query(
        `SELECT status, public_enabled, public_token_hash, sent_at
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(sentAuthoringState.rows[0].status, 'sent');
      assert.equal(sentAuthoringState.rows[0].public_enabled, true);
      assert.ok(sentAuthoringState.rows[0].public_token_hash);
      assert.ok(sentAuthoringState.rows[0].sent_at instanceof Date);

      const sentDeliveryLog = await returnPool.query(
        `SELECT channel, status, provider_message_id
         FROM sales_delivery_log WHERE quote_id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(sentDeliveryLog.rows.length, 1);
      assert.equal(sentDeliveryLog.rows[0].channel, 'email');
      assert.equal(sentDeliveryLog.rows[0].status, 'sent');
      assert.equal(sentDeliveryLog.rows[0].provider_message_id, 'authoring-delivery-email-001');

      const sentAuthoringHistory = await returnPool.query(
        `SELECT from_status, to_status FROM sales_quote_status_history
         WHERE quote_id = $1 AND company_id = $2 ORDER BY created_at`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(sentAuthoringHistory.rows.length, 2);
      assert.equal(sentAuthoringHistory.rows[0].from_status, null);
      assert.equal(sentAuthoringHistory.rows[0].to_status, 'draft');
      assert.equal(sentAuthoringHistory.rows[1].from_status, 'draft');
      assert.equal(sentAuthoringHistory.rows[1].to_status, 'sent');

      await assert.rejects(
        updateSalesQuoteDraftTransaction(
          {
            ...authoringInput,
            quoteId: createdAuthoringQuote.id,
            lines: [{ description: 'Must not overwrite a sent quote', quantity: 3, unitPrice: 1, unitCost: 0 }],
          },
          authoringContext as Parameters<typeof updateSalesQuoteDraftTransaction>[1],
          quoteAuthoringDependencies,
        ),
        /Only draft quotes can be edited/,
        'a delivered quotation must be revised by duplication, never edited in place',
      );
      const noEditAfterSend = await returnPool.query(
        `SELECT status, total_amount FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(noEditAfterSend.rows[0].status, 'sent');
      assert.equal(Number(noEditAfterSend.rows[0].total_amount), 237);

      const quoteAuthoringAudit = await returnPool.query(
        `SELECT type FROM activities
         WHERE company_id = $1 AND record_id = $2
         ORDER BY created_at`,
        [companyId, createdAuthoringQuote.id],
      );
      assert.deepEqual(
        quoteAuthoringAudit.rows.map((row: Record<string, unknown>) => row.type),
        ['sales.quote.created', 'sales.quote.updated', 'sales.quote.sent'],
      );

      // A fully failed send records a failed delivery, closes the generated
      // public link, and leaves the quote draft so the owner can retry.
      const undeliverableQuote = await createSalesQuoteTransaction(
        {
          ...authoringInput,
          customerName: 'No Email Customer',
          customerEmail: '',
          reference: 'AUTHORING-REF-2',
          lines: [{ description: 'No-contact test', sku: 'AUTH-2', quantity: 1, unitPrice: 50, unitCost: 10 }],
        },
        authoringContext,
        quoteAuthoringDependencies,
      );
      await assert.rejects(
        deliverSalesQuote(
          {
            pool: returnPool as unknown as Pool,
            tenantId: 'integration-test-tenant',
            companyId,
            companyName: 'SaMi Integration',
            userId,
            quoteId: undeliverableQuote.id,
            channels: ['email'],
          },
          authoringDeliveryDeps,
        ),
        (error: unknown) => error instanceof Error && /Quotation delivery failed/.test(error.message),
      );
      const failedDeliveryState = await returnPool.query(
        `SELECT status, public_enabled, public_token_hash
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [undeliverableQuote.id, companyId],
      );
      assert.equal(failedDeliveryState.rows[0].status, 'draft');
      assert.equal(failedDeliveryState.rows[0].public_enabled, false);
      assert.equal(failedDeliveryState.rows[0].public_token_hash, null);
      const failedDeliveryLog = await returnPool.query(
        `SELECT status, error_code FROM sales_delivery_log
         WHERE quote_id = $1 AND company_id = $2`,
        [undeliverableQuote.id, companyId],
      );
      assert.equal(failedDeliveryLog.rows.length, 1);
      assert.equal(failedDeliveryLog.rows[0].status, 'failed');
      assert.equal(failedDeliveryLog.rows[0].error_code, 'EMAIL_MISSING');

      // Prove that a valid quote ID is not authority to read or mutate another
      // company's quotation. Both the database write path and delivery adapter
      // boundary must stop before side effects for a mismatched company scope.
      const otherCompanyId = '99999999-9999-4999-8999-999999999999';
      const beforeIsolationProbe = await returnPool.query(
        `SELECT status, total_amount, public_enabled, public_token_hash
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.equal(beforeIsolationProbe.rows.length, 1);

      await assert.rejects(
        updateSalesQuoteDraftTransaction(
          {
            ...authoringInput,
            quoteId: createdAuthoringQuote.id,
            notes: 'Cross-company edit attempt',
            lines: [{ description: 'Unauthorized overwrite', quantity: 999, unitPrice: 0.01, unitCost: 0 }],
          },
          {
            ...authoringContext,
            companyId: otherCompanyId,
          } as Parameters<typeof updateSalesQuoteDraftTransaction>[1],
          quoteAuthoringDependencies,
        ),
        (error: unknown) => error instanceof Error && /Quote was not found/.test(error.message),
        'the quote editor must not disclose or mutate a quotation in another company',
      );

      let forbiddenDeliveryAdapterCalls = 0;
      const forbiddenDeliveryAdapters: Parameters<typeof deliverSalesQuote>[1] = {
        assertSalesQuoteApprovalSatisfied: async () => { forbiddenDeliveryAdapterCalls += 1; },
        createPublicToken: () => {
          forbiddenDeliveryAdapterCalls += 1;
          return 'must-not-be-created';
        },
      };
      await assert.rejects(
        deliverSalesQuote(
          {
            pool: returnPool as unknown as Pool,
            tenantId: 'integration-test-tenant',
            companyId: otherCompanyId,
            companyName: 'Unauthorized Company',
            userId,
            quoteId: createdAuthoringQuote.id,
            channels: ['email'],
          },
          forbiddenDeliveryAdapters,
        ),
        (error: unknown) => error instanceof Error && /Quotation was not found/.test(error.message),
        'delivery must not resolve a quotation outside the active company',
      );
      assert.equal(forbiddenDeliveryAdapterCalls, 0,
        'approval and public-token adapters must not run for a cross-company quote');
      const afterIsolationProbe = await returnPool.query(
        `SELECT status, total_amount, public_enabled, public_token_hash
         FROM sales_quotes WHERE id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, companyId],
      );
      assert.deepEqual(afterIsolationProbe.rows, beforeIsolationProbe.rows,
        'failed cross-company operations must leave the source quote unchanged');
      const crossCompanyDeliveryRows = await returnPool.query(
        `SELECT COUNT(*)::int AS count FROM sales_delivery_log
         WHERE quote_id = $1 AND company_id = $2`,
        [createdAuthoringQuote.id, otherCompanyId],
      );
      assert.equal(crossCompanyDeliveryRows.rows[0].count, 0);

    } finally {
      returnSessionHolder.client?.release();
      await pool.end();
    }
  },
);


integration(
  'ERP parity: fresh Sales schema and every registered upgrade execute in PostgreSQL',
  async () => {
    const pool = new Pool({
      connectionString: DATABASE_URL,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await client.query(`
        CREATE TABLE public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL DEFAULT 'Sales Migration Test',
          currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          deleted_at TIMESTAMPTZ
        )
      `);

      const { SALES_RUNTIME_MIGRATIONS } = await import('../lib/apps/runtime-migrations');
      const { getSamiModuleMigrationPlan } = await import('../lib/modules/migrations');
      const plan = getSamiModuleMigrationPlan('sales', '1.0.0', '3.4.22');

      assert.equal(plan.length, SALES_RUNTIME_MIGRATIONS.length,
        'the migration planner must include every registered Sales transition');
      assert.equal(plan[0].fromVersion, '1.0.0');
      assert.equal(plan[plan.length - 1].toVersion, '3.4.22');

      for (let index = 0; index < plan.length; index += 1) {
        const migration = plan[index];
        assert.equal(migration.moduleKey, 'sales');
        assert.equal(migration.namespace, 'sales');
        if (index > 0) {
          assert.equal(plan[index - 1].toVersion, migration.fromVersion,
            'Sales migration chain must be continuous with no missing/overlapping version step');
        }
        await migration.run(client, {
          moduleKey: 'sales',
          namespace: 'sales',
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
        });
      }

      const requiredTables = [
        'sales_settings',
        'sales_quotes',
        'sales_quote_items',
        'sales_quote_status_history',
        'sales_quote_approval_policies',
        'sales_order_invoice_batches',
        'sales_orders_v2',
        'sales_order_items_v2',
        'sales_delivery_log',
        'sales_product_variants',
        'sales_returns',
        'sales_return_credits',
        'sales_pipeline_stages',
      ];
      const tableCheck = await client.query(
        `SELECT required.table_name
         FROM unnest($1::text[]) AS required(table_name)
         LEFT JOIN information_schema.tables actual
           ON actual.table_schema = 'public'
          AND actual.table_name = required.table_name
         WHERE actual.table_name IS NULL
         ORDER BY required.table_name`,
        [requiredTables],
      );
      assert.deepEqual(tableCheck.rows, [],
        'fresh install + registered Sales migration chain must materialize all supported Sales domains');

      const requiredQuoteColumns = [
        'approval_status',
        'base_total_amount',
        'public_token_hash',
        'sales_order_id',
        'internal_notes',
      ];
      const quoteColumnCheck = await client.query(
        `SELECT required.column_name
         FROM unnest($1::text[]) AS required(column_name)
         LEFT JOIN information_schema.columns actual
           ON actual.table_schema = 'public'
          AND actual.table_name = 'sales_quotes'
          AND actual.column_name = required.column_name
         WHERE actual.column_name IS NULL
         ORDER BY required.column_name`,
        [requiredQuoteColumns],
      );
      assert.deepEqual(quoteColumnCheck.rows, [],
        'fresh and upgraded quotation schema must retain critical lifecycle/commercial fields');

      const requiredStageColumns = [
        'pipeline_id',
        'code',
        'is_won',
        'is_lost',
        'fold_in_kanban',
        'description',
        'color',
        'deleted_at',
      ];
      const stageColumnCheck = await client.query(
        `SELECT required.column_name
         FROM unnest($1::text[]) AS required(column_name)
         LEFT JOIN information_schema.columns actual
           ON actual.table_schema = 'public'
          AND actual.table_name = 'sales_pipeline_stages'
          AND actual.column_name = required.column_name
         WHERE actual.column_name IS NULL
         ORDER BY required.column_name`,
        [requiredStageColumns],
      );
      assert.deepEqual(stageColumnCheck.rows, [],
        'fresh and upgraded Sales pipeline stages must contain all fields referenced by runtime indexes and UI');

      await client.query('ROLLBACK');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  },
);



integration(
  'ERP parity: Sales sequential quotation approval persists decisions and stale-request recovery in PostgreSQL',
  async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    let outerTransaction = false;

    try {
      await client.query('BEGIN');
      outerTransaction = true;
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await client.query(`
        CREATE TABLE public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL DEFAULT 'Approval Test Company',
          currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          deleted_at TIMESTAMPTZ
        )
      `);

      const { SALES_RUNTIME_MIGRATIONS } = await import('../lib/apps/runtime-migrations');
      const { getSamiModuleMigrationPlan } = await import('../lib/modules/migrations');
      const {
        requestAdvancedSalesQuoteApprovalTransaction,
        reviewAdvancedSalesQuoteApprovalTransaction,
        assertSalesQuoteApprovalSatisfied,
      } = await import('../lib/apps/sales/approvals');

      const plan = getSamiModuleMigrationPlan('sales', '1.0.0', '3.4.20');
      for (let index = 0; index < plan.length; index += 1) {
        const migration = plan[index];
        assert.equal(migration.moduleKey, 'sales');
        if (index > 0) {
          assert.equal(plan[index - 1].toVersion, migration.fromVersion);
        }
        await migration.run(client, {
          moduleKey: 'sales',
          namespace: 'sales',
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
        });
      }

      const companyId = 'a1111111-1111-4111-8111-111111111111';
      const requesterId = 'a2222222-2222-4222-8222-222222222222';
      const reviewerOneId = 'a3333333-3333-4333-8333-333333333333';
      const reviewerTwoId = 'a4444444-4444-4444-8444-444444444444';
      await client.query(
        'INSERT INTO public.companies (id, name, currency) VALUES ($1, $2, $3)',
        [companyId, 'Approval Test Company', 'KES'],
      );

      // In production this table is provisioned by Core. The integration test
      // installs Sales in isolation, so provide the exact activity write contract.
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.activities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          user_id UUID,
          model VARCHAR(120) NOT NULL,
          record_id UUID NOT NULL,
          type VARCHAR(160) NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(
        `INSERT INTO public.sales_settings
          (company_id, default_currency, require_quote_approval, quote_approval_threshold)
         VALUES ($1, 'KES', FALSE, 0)`,
        [companyId],
      );

      const policyResult = await client.query(
        `INSERT INTO public.sales_quote_approval_policies
          (company_id, name, is_active, priority, min_quote_total, currency_code, created_by, updated_by)
         VALUES ($1, 'High-value two-step approval', TRUE, 1, 500, 'KES', $2, $2)
         RETURNING id`,
        [companyId, requesterId],
      );
      const policyId = String(policyResult.rows[0].id);

      await client.query(
        `INSERT INTO public.sales_quote_approval_policy_steps
          (company_id, policy_id, step_order, approver_user_id, approver_role_key, required_approvals)
         VALUES
          ($1, $2, 1, $3, NULL, 1),
          ($1, $2, 2, $4, NULL, 1)`,
        [companyId, policyId, reviewerOneId, reviewerTwoId],
      );

      async function insertQuote(quoteNumber: string) {
        const inserted = await client.query(
          `INSERT INTO public.sales_quotes
            (company_id, quote_number, status, quote_date, valid_until, currency,
             base_currency, base_total_amount, total_amount, subtotal, discount_total,
             tax_total, shipping_total, approval_status, customer_name, created_by, updated_by)
           VALUES ($1, $2, 'draft', CURRENT_DATE, CURRENT_DATE + 14, 'KES',
             'KES', 900, 900, 900, 0, 0, 0, 'not_required', 'Approval Buyer', $3, $3)
           RETURNING id`,
          [companyId, quoteNumber, requesterId],
        );
        const quoteId = String(inserted.rows[0].id);
        await client.query(
          `INSERT INTO public.sales_quote_items
            (quote_id, company_id, sort_order, description, quantity, unit_price,
             discount_type, discount_value, discount_amount, tax_rate, tax_amount, subtotal, line_total)
           VALUES ($1, $2, 1, 'Approval test line', 1, 900, 'percent', 0, 0, 0, 0, 900, 900)`,
          [quoteId, companyId],
        );
        return quoteId;
      }

      let savepointNumber = 0;
      const approvalPool = {
        query: (sql: string, values?: unknown[]) =>
          client.query(sql, values as never),
        connect: async () => {
          const savepoint = 'sales_approval_sp_' + String(++savepointNumber);
          let active = false;
          return {
            query: async (sql: string, values?: unknown[]) => {
              const command = sql.trim().toUpperCase();
              if (command === 'BEGIN') {
                active = true;
                return client.query('SAVEPOINT ' + savepoint);
              }
              if (command === 'COMMIT') {
                const result = await client.query('RELEASE SAVEPOINT ' + savepoint);
                active = false;
                return result;
              }
              if (command === 'ROLLBACK') {
                if (!active) return { rows: [], rowCount: 0 };
                await client.query('ROLLBACK TO SAVEPOINT ' + savepoint);
                const result = await client.query('RELEASE SAVEPOINT ' + savepoint);
                active = false;
                return result;
              }
              return client.query(sql, values as never);
            },
            release: () => {},
          };
        },
      };

      type ApprovalContext = Parameters<typeof requestAdvancedSalesQuoteApprovalTransaction>[1];
      const asContext = (userId: string) => ({
        permissions: { isOwner: false, permissionSet: new Set<string>() },
        company: {
          tenantId: 'approval-test-tenant',
          userId,
          currentCompanyId: companyId,
          currentCompany: { id: companyId, name: 'Approval Test Company', currency: 'KES' },
        },
        tenantId: 'approval-test-tenant',
        userId,
        companyId,
        pool: approvalPool,
      } as unknown as ApprovalContext);

      const quoteId = await insertQuote('Q-APPROVAL-001');

      await assert.rejects(
        () => assertSalesQuoteApprovalSatisfied(client, companyId, quoteId),
        /cannot proceed until all internal approval steps are complete/,
        'matching active approval policy must block acceptance before approval',
      );

      const requesterContext = asContext(requesterId);
      const request = await requestAdvancedSalesQuoteApprovalTransaction(
        { quoteId },
        requesterContext,
      );
      assert.equal(request.approvalStatus, 'pending');
      assert.equal(request.currentStepOrder, 1);
      assert.ok(request.requestId);

      const retryRequest = await requestAdvancedSalesQuoteApprovalTransaction(
        { quoteId },
        requesterContext,
      );
      assert.equal(retryRequest.requestId, request.requestId,
        'retrying submission while pending must recover the existing request, not duplicate it');

      await assert.rejects(
        () => reviewAdvancedSalesQuoteApprovalTransaction(
          { quoteId, decision: 'approve' },
          requesterContext,
        ),
        /cannot approve or reject their own request/,
      );

      const reviewerOneContext = asContext(reviewerOneId);
      const firstDecision = await reviewAdvancedSalesQuoteApprovalTransaction(
        { quoteId, decision: 'approve' },
        reviewerOneContext,
      );
      assert.equal(firstDecision.approvalStatus, 'pending');
      assert.equal(firstDecision.currentStepOrder, 2,
        'first approval must advance the request to the next configured step');

      const unauthorizedDecision = await reviewAdvancedSalesQuoteApprovalTransaction(
        { quoteId, decision: 'approve' },
        reviewerOneContext,
      ).then(
        () => ({ rejected: false, error: '' }),
        (error: unknown) => ({
          rejected: true,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      assert.equal(unauthorizedDecision.rejected, true,
        'a reviewer assigned only to the completed step must not approve the next step');
      assert.match(unauthorizedDecision.error, /not an assigned approver/);

      const reviewerTwoContext = asContext(reviewerTwoId);
      const finalDecision = await reviewAdvancedSalesQuoteApprovalTransaction(
        { quoteId, decision: 'approve' },
        reviewerTwoContext,
      );
      assert.equal(finalDecision.approvalStatus, 'approved');

      const persisted = await client.query(
        `SELECT q.approval_status, r.status AS request_status, r.current_step_order,
                COUNT(d.id)::int AS decision_count
         FROM public.sales_quotes q
         JOIN public.sales_quote_approval_requests r
           ON r.quote_id = q.id AND r.company_id = q.company_id
         LEFT JOIN public.sales_quote_approval_decisions d
           ON d.request_id = r.id AND d.company_id = r.company_id
         WHERE q.id = $1 AND q.company_id = $2
         GROUP BY q.approval_status, r.status, r.current_step_order`,
        [quoteId, companyId],
      );
      assert.equal(persisted.rows.length, 1);
      assert.equal(persisted.rows[0].approval_status, 'approved');
      assert.equal(persisted.rows[0].request_status, 'approved');
      assert.equal(Number(persisted.rows[0].decision_count), 2,
        'only the two assigned reviewers must have durable decisions');

      const approvalsHistory = await client.query(
        `SELECT from_status, to_status, reason
         FROM public.sales_quote_approval_history
         WHERE quote_id = $1 AND company_id = $2`,
        [quoteId, companyId],
      );
      assert.equal(approvalsHistory.rows.length, 3);
      assert.ok(approvalsHistory.rows.some(row =>
        row.from_status === 'not_required' && row.to_status === 'pending'));
      assert.ok(approvalsHistory.rows.some(row =>
        row.from_status === 'pending' &&
        row.to_status === 'pending' &&
        String(row.reason).includes('step 1 completed')));
      assert.ok(approvalsHistory.rows.some(row =>
        row.from_status === 'pending' && row.to_status === 'approved'));

      await assert.doesNotReject(
        () => assertSalesQuoteApprovalSatisfied(client, companyId, quoteId),
        'completed approval must unblock the authoritative approval gate',
      );

      // A quote changed after submission invalidates the approval fingerprint.
      const staleQuoteId = await insertQuote('Q-APPROVAL-002');
      const staleRequest = await requestAdvancedSalesQuoteApprovalTransaction(
        { quoteId: staleQuoteId },
        requesterContext,
      );
      await client.query(
        'UPDATE public.sales_quotes SET notes = $3 WHERE id = $1 AND company_id = $2',
        [staleQuoteId, companyId, 'Changed after approval submission'],
      );
      await assert.rejects(
        () => reviewAdvancedSalesQuoteApprovalTransaction(
          { quoteId: staleQuoteId, decision: 'approve' },
          reviewerOneContext,
        ),
        /Quotation terms changed after submission/,
      );
      const staleState = await client.query(
        `SELECT q.approval_status, r.status AS request_status
         FROM public.sales_quotes q
         JOIN public.sales_quote_approval_requests r
           ON r.quote_id = q.id AND r.company_id = q.company_id
         WHERE q.id = $1 AND q.company_id = $2 AND r.id = $3`,
        [staleQuoteId, companyId, staleRequest.requestId],
      );
      assert.equal(staleState.rows[0].approval_status, 'draft');
      assert.equal(staleState.rows[0].request_status, 'superseded');

      const decisionCount = await client.query(
        'SELECT COUNT(*)::int AS count FROM public.sales_quote_approval_decisions WHERE request_id = $1',
        [staleRequest.requestId],
      );
      assert.equal(decisionCount.rows[0].count, 0,
        'stale requests must be superseded without a reviewer decision');

    } finally {
      if (outerTransaction) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      client.release();
      await pool.end();
    }
  },
);



integration(
  'ERP parity: Sales opportunity stage transitions persist Won/Lost lifecycle and loss reasons in PostgreSQL',
  async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
      await client.query(`
        CREATE TABLE public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL DEFAULT 'Sales Opportunity Test',
          currency VARCHAR(3) NOT NULL DEFAULT 'KES',
          deleted_at TIMESTAMPTZ
        )
      `);

      const { getSamiModuleMigrationPlan } = await import('../lib/modules/migrations');
      const plan = getSamiModuleMigrationPlan('sales', '1.0.0', '3.4.20');
      for (let index = 0; index < plan.length; index += 1) {
        const migration = plan[index];
        assert.equal(migration.moduleKey, 'sales');
        if (index > 0) assert.equal(plan[index - 1].toVersion, migration.fromVersion);
        await migration.run(client, {
          moduleKey: 'sales',
          namespace: 'sales',
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
        });
      }

      const companyId = 'b1111111-1111-4111-8111-111111111111';
      const otherCompanyId = 'b2222222-2222-4222-8222-222222222222';
      const userId = 'b3333333-3333-4333-8333-333333333333';
      await client.query(
        'INSERT INTO public.companies (id, name, currency) VALUES ($1, $2, $3), ($4, $5, $3)',
        [companyId, 'Pipeline A Company', 'KES', otherCompanyId, 'Pipeline B Company'],
      );

      async function createPipeline(ownerCompanyId: string, name: string, isDefault: boolean) {
        const result = await client.query(
          `INSERT INTO public.sales_pipelines
            (company_id, name, sequence, is_default, is_active, created_by, updated_by)
           VALUES ($1,$2,10,$3,TRUE,$4,$4) RETURNING id`,
          [ownerCompanyId, name, isDefault, userId],
        );
        return String(result.rows[0].id);
      }

      async function createStage(ownerCompanyId: string, pipelineId: string, name: string, sequence: number, probability: number, stageType: 'open' | 'won' | 'lost') {
        const result = await client.query(
          `INSERT INTO public.sales_pipeline_stages
            (company_id, pipeline_id, name, sequence, probability, stage_type, is_active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$7) RETURNING id`,
          [ownerCompanyId, pipelineId, name, sequence, probability, stageType, userId],
        );
        return String(result.rows[0].id);
      }

      const pipelineId = await createPipeline(companyId, 'Core Sales', true);
      const otherPipelineId = await createPipeline(companyId, 'Enterprise Sales', false);
      const otherCompanyPipelineId = await createPipeline(otherCompanyId, 'Other Company Sales', true);
      const qualificationId = await createStage(companyId, pipelineId, 'Qualification', 10, 20, 'open');
      const negotiationId = await createStage(companyId, pipelineId, 'Negotiation', 20, 65, 'open');
      const wonId = await createStage(companyId, pipelineId, 'Won', 90, 100, 'won');
      const lostId = await createStage(companyId, pipelineId, 'Lost', 100, 0, 'lost');
      const otherPipelineStageId = await createStage(companyId, otherPipelineId, 'Qualification', 10, 30, 'open');
      const otherCompanyStageId = await createStage(otherCompanyId, otherCompanyPipelineId, 'Qualification', 10, 30, 'open');

      const opportunityResult = await client.query(
        `INSERT INTO public.sales_opportunities
          (company_id, opportunity_number, stage_id, name, currency, expected_value, probability, created_by, updated_by)
         VALUES ($1, 'OPP-STAGE-001', $2, 'Pipeline test deal', 'KES', 125000, 20, $3, $3)
         RETURNING id`,
        [companyId, qualificationId, userId],
      );
      const opportunityId = String(opportunityResult.rows[0].id);
      const move = (stageId: string, reason?: string, probability?: number, selectedCompanyId = companyId) =>
        moveSalesOpportunityTransaction(client, {
          companyId: selectedCompanyId,
          userId,
          opportunityId,
          stageId,
          reason,
          probability,
        });

      await assert.rejects(
        () => move(lostId),
        /A reason is required to mark an opportunity as lost/,
        'marking a deal lost must require a recorded reason',
      );
      await assert.rejects(
        () => move(otherPipelineStageId, 'wrong pipeline'),
        /different sales pipeline/,
        'the transition must not cross between pipelines within the same company',
      );
      await assert.rejects(
        () => move(otherCompanyStageId, 'cross company', undefined, otherCompanyId),
        /Opportunity or pipeline stage was not found/,
        'a foreign company context must not read or mutate another company opportunity',
      );

      const untouched = await client.query(
        `SELECT stage_id, probability FROM public.sales_opportunities WHERE id=$1 AND company_id=$2`,
        [opportunityId, companyId],
      );
      assert.equal(String(untouched.rows[0].stage_id), qualificationId);
      assert.equal(Number(untouched.rows[0].probability), 20);
      const emptyHistory = await client.query(
        'SELECT COUNT(*)::int AS count FROM public.sales_opportunity_stage_history WHERE opportunity_id=$1',
        [opportunityId],
      );
      assert.equal(emptyHistory.rows[0].count, 0,
        'rejected moves must not write stage-history side effects');

      const lost = await move(lostId, 'Budget deferred', 87);
      assert.equal(lost.stageType, 'lost');
      assert.equal(lost.probability, 0, 'lost stage probability is canonical even if the caller sends 87');
      const lostState = await client.query(
        `SELECT stage_id, probability, won_at, lost_at, lost_reason
         FROM public.sales_opportunities WHERE id=$1 AND company_id=$2`,
        [opportunityId, companyId],
      );
      assert.equal(String(lostState.rows[0].stage_id), lostId);
      assert.equal(Number(lostState.rows[0].probability), 0);
      assert.equal(lostState.rows[0].won_at, null);
      assert.ok(lostState.rows[0].lost_at);
      assert.equal(lostState.rows[0].lost_reason, 'Budget deferred');

      await assert.rejects(
        () => move(wonId, 'cannot skip reopening'),
        /Reopen a won or lost opportunity before recording a different terminal outcome/,
      );
      const terminalHistory = await client.query(
        'SELECT COUNT(*)::int AS count FROM public.sales_opportunity_stage_history WHERE opportunity_id=$1',
        [opportunityId],
      );
      assert.equal(terminalHistory.rows[0].count, 1,
        'a rejected terminal-to-terminal move must not create history');

      const reopened = await move(negotiationId, 'Reopened for follow-up', 83);
      assert.equal(reopened.stageType, 'open');
      assert.equal(reopened.probability, 83);
      const reopenedState = await client.query(
        `SELECT stage_id, probability, won_at, lost_at, lost_reason
         FROM public.sales_opportunities WHERE id=$1 AND company_id=$2`,
        [opportunityId, companyId],
      );
      assert.equal(String(reopenedState.rows[0].stage_id), negotiationId);
      assert.equal(Number(reopenedState.rows[0].probability), 83);
      assert.equal(reopenedState.rows[0].won_at, null);
      assert.equal(reopenedState.rows[0].lost_at, null);
      assert.equal(reopenedState.rows[0].lost_reason, null,
        'reopening must clear the previous Lost outcome and reason');

      const won = await move(wonId, 'Deal closed', 12);
      assert.equal(won.stageType, 'won');
      assert.equal(won.probability, 100, 'won stage probability is canonical even if the caller sends 12');
      const wonState = await client.query(
        `SELECT stage_id, probability, won_at, lost_at, lost_reason
         FROM public.sales_opportunities WHERE id=$1 AND company_id=$2`,
        [opportunityId, companyId],
      );
      assert.equal(String(wonState.rows[0].stage_id), wonId);
      assert.equal(Number(wonState.rows[0].probability), 100);
      assert.ok(wonState.rows[0].won_at);
      assert.equal(wonState.rows[0].lost_at, null);
      assert.equal(wonState.rows[0].lost_reason, null);

      const history = await client.query(
        `SELECT from_stage_id, to_stage_id, probability, reason
         FROM public.sales_opportunity_stage_history
         WHERE opportunity_id=$1 AND company_id=$2`,
        [opportunityId, companyId],
      );
      assert.equal(history.rows.length, 3);
      // All rows are created in one transaction, so NOW() can be identical;
      // assert by target stage instead of assuming timestamp order.
      const historyByTarget = new Map(history.rows.map(row => [String(row.to_stage_id), row]));
      const lostHistory = historyByTarget.get(lostId);
      assert.ok(lostHistory);
      assert.equal(String(lostHistory.from_stage_id), qualificationId);
      assert.equal(Number(lostHistory.probability), 0);
      assert.equal(lostHistory.reason, 'Budget deferred');
      const reopenedHistory = historyByTarget.get(negotiationId);
      assert.ok(reopenedHistory);
      assert.equal(String(reopenedHistory.from_stage_id), lostId);
      assert.equal(Number(reopenedHistory.probability), 83);
      const wonHistory = historyByTarget.get(wonId);
      assert.ok(wonHistory);
      assert.equal(String(wonHistory.from_stage_id), negotiationId);
      assert.equal(Number(wonHistory.probability), 100);
    } finally {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      client.release();
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
  'Tenant provisioning: core, Documents, and Sales schemas execute from an empty PostgreSQL database',
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

      const salesSql = await readFile(
        path.join(
          process.cwd(),
          'lib',
          'apps',
          'sales',
          'schema.sql',
        ),
        'utf8',
      );

      await client.query(salesSql);

      const stageTable = await client.query(
        "SELECT to_regclass('public.sales_pipeline_stages') AS relation",
      );
      assert.equal(
        stageTable.rows[0]?.relation,
        'sales_pipeline_stages',
        'Sales schema must create pipeline stages on a fresh install.',
      );

      const stageIndexes = await client.query(
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sales_pipeline_stages'",
      );
      const pipelineScopedNameIndex = stageIndexes.rows.find(
        (row) => row.indexname === 'uq_sales_pipeline_stages_company_pipeline_name',
      );
      assert.ok(
        pipelineScopedNameIndex,
        'fresh Sales installs must have the pipeline-scoped stage-name index.',
      );
      assert.match(
        pipelineScopedNameIndex.indexdef,
        /company_id, pipeline_id, lower\(btrim\(name\)\)/i,
      );
      assert.ok(
        !stageIndexes.rows.some((row) => row.indexname === 'sales_pipeline_stages_company_id_name_key'),
        'fresh Sales installs must not have the obsolete company-wide stage-name uniqueness constraint.',
      );

      const salesColumns = await client.query(
        "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'sales_quotes' AND column_name IN ('salesperson_user_id', 'pipeline_id', 'stage_id', 'sales_pipeline_stage_id')) OR (table_name = 'sales_settings' AND column_name = 'credit_limit_enforced'))",
      );
      const salesperson = salesColumns.rows.find(
        (row) => row.table_name === 'sales_quotes' && row.column_name === 'salesperson_user_id',
      );
      assert.ok(salesperson, 'sales_quotes.salesperson_user_id must be preserved.');
      assert.ok(
        !salesColumns.rows.some(
          (row) => row.table_name === 'sales_quotes' && ['pipeline_id', 'stage_id', 'sales_pipeline_stage_id'].includes(row.column_name),
        ),
        'fresh Sales installs must not create quote-level pipeline columns.',
      );
      const creditLimit = salesColumns.rows.find(
        (row) => row.table_name === 'sales_settings' && row.column_name === 'credit_limit_enforced',
      );
      assert.ok(creditLimit, 'sales_settings.credit_limit_enforced must exist.');
      assert.equal(creditLimit.data_type, 'boolean');
      assert.equal(creditLimit.is_nullable, 'NO');
      assert.match(String(creditLimit.column_default), /false/i);

      const obsoleteQuoteStageHistory = await client.query(
        "SELECT to_regclass('public.sales_quote_stage_history') AS relation",
      );
      assert.equal(
        obsoleteQuoteStageHistory.rows[0]?.relation,
        null,
        'fresh Sales installs must not create obsolete quote-stage history.',
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

