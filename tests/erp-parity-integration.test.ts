import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

