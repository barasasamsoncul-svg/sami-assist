import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Pool,
} from 'pg';

import {
  postSalesFulfillmentToInventory,
  reserveSalesOrderInventory,
} from '../lib/apps/sales/inventory';

import {
  postInvoiceConfirmationToAccounting,
  postInvoicePaymentToAccounting,
  reverseInvoicingAccountingEvent,
} from '../lib/apps/invoicing/accounting';


import {
  specialistBreadthDepthSql,
} from '../lib/apps/enterprise/specialist-breadth-depth';


import {
  specialistSuiteDepthSql,
} from '../lib/apps/enterprise/specialist-suite-depth';

import {
  applySuiteSpecialistRecordSideEffects,
} from '../lib/apps/enterprise/specialist-suite-execution';


import {
  specialistProductDepthSql,
} from '../lib/apps/enterprise/specialist-product-depth';

import {
  applyProductSpecialistRecordSideEffects,
  applyProductSpecialistTransition,
} from '../lib/apps/enterprise/specialist-product-execution';


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

          CREATE TABLE accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by UUID,
            updated_by UUID,
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
          previousDeliveredQuantity:
            0,
          nextDeliveredQuantity:
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
  'ERP parity: final specialist suite depth schemas execute in PostgreSQL',
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
        'operational_assets',
        'chat_channels',
        'chat_messages',
        'portal_customers',
        'landing_pages',
        'lead_capture_entries',
        'mail_accounts',
        'sales_conversations',
        'social_posts',
        'workbooks',
        'sheets',
        'team_inbox_threads',
        'vendor_portal_accounts',
      ];

    const modules =
      [
        'assets',
        'barcode',
        'chat',
        'customer_portal',
        'email_marketing',
        'landing_pages',
        'lead_capture',
        'mail',
        'sales_inbox',
        'sms_marketing',
        'social_marketing',
        'spreadsheet',
        'team_inbox',
        'vendor_portal',
      ];

    const expectedTables =
      [
        'operational_asset_assignments',
        'barcode_scan_sessions',
        'chat_read_receipts',
        'portal_requests',
        'email_suppressions',
        'landing_page_versions',
        'lead_routing_decisions',
        'mail_rules',
        'sales_conversation_links',
        'sms_suppressions',
        'social_publish_queue',
        'spreadsheet_named_ranges',
        'spreadsheet_data_sources',
        'team_inbox_assignment_events',
        'vendor_portal_acknowledgements',
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
        of modules
      ) {
        const sql =
          specialistSuiteDepthSql(
            moduleKey,
          );

        assert.ok(
          sql.trim(),
          moduleKey +
          ' should expose suite specialist depth SQL',
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
          ' should be created by the suite specialist depth migration',
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
  'ERP parity: Lead Capture posts to CRM and Barcode posts to Inventory transactionally',
  async () => {
    const pool =
      new Pool({
        connectionString:
          DATABASE_URL,
      });

    const client =
      await pool.connect();

    const companyId =
      '11111111-1111-4111-8111-111111111111';

    const userId =
      '22222222-2222-4222-8222-222222222222';

    const entryId =
      '33333333-3333-4333-8333-333333333333';

    const formId =
      '44444444-4444-4444-8444-444444444444';

    const productId =
      '55555555-5555-4555-8555-555555555555';

    const warehouseId =
      '66666666-6666-4666-8666-666666666666';

    const scanId =
      '77777777-7777-4777-8777-777777777777';

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
          );

          CREATE TABLE leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            company_name TEXT,
            source TEXT,
            stage TEXT,
            estimated_value NUMERIC NOT NULL DEFAULT 0,
            notes TEXT,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE lead_capture_forms (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL
          );

          CREATE TABLE lead_capture_entries (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            form_id UUID NOT NULL,
            values JSONB NOT NULL DEFAULT '{}'::jsonb,
            campaign TEXT,
            assigned_user_id UUID,
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE lead_capture_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entry_id UUID NOT NULL,
            event_type TEXT NOT NULL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status TEXT NOT NULL,
            created_by UUID,
            updated_by UUID
          );

          CREATE TABLE barcode_identifiers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id UUID NOT NULL,
            barcode TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE barcode_scan_events (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            barcode TEXT NOT NULL,
            operation TEXT,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE stock_levels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            quantity NUMERIC NOT NULL DEFAULT 0,
            reorder_level NUMERIC NOT NULL DEFAULT 0,
            created_by UUID,
            updated_by UUID,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ,
            UNIQUE(product_id, warehouse_id)
          );

          CREATE TABLE stock_movements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            movement_type TEXT NOT NULL,
            quantity NUMERIC NOT NULL,
            reference TEXT,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `,
      );

      await client.query(
        'INSERT INTO companies (id) VALUES ($1)',
        [
          companyId,
        ],
      );

      await client.query(
        'INSERT INTO lead_capture_forms (id,company_id) VALUES ($1,$2)',
        [
          formId,
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO lead_capture_entries (
            id,
            company_id,
            form_id,
            values,
            campaign,
            assigned_user_id
          )
          VALUES (
            $1,$2,$3,$4::jsonb,'launch',$5
          )
        `,
        [
          entryId,
          companyId,
          formId,
          JSON.stringify({
            name:
              'ERP Parity Lead',
            email:
              'parity@example.com',
            phone:
              '+254700000001',
          }),
          userId,
        ],
      );

      await client.query(
        specialistSuiteDepthSql(
          'lead_capture',
        ),
      );

      await applySuiteSpecialistRecordSideEffects(
        client,
        {
          moduleKey:
            'lead_capture',
          table:
            'lead_capture_entries',
          companyId,
          userId,
          operation:
            'create',
          row: {
            id:
              entryId,
            values: {
              name:
                'ERP Parity Lead',
              email:
                'parity@example.com',
              phone:
                '+254700000001',
            },
            campaign:
              'launch',
            assigned_user_id:
              userId,
          },
        },
      );

      const lead =
        await client.query(
          `
            SELECT id,email,source
            FROM leads
            WHERE company_id = $1
          `,
          [
            companyId,
          ],
        );

      assert.equal(
        lead.rows.length,
        1,
      );

      assert.equal(
        lead.rows[0]
          .email,
        'parity@example.com',
      );

      const routing =
        await client.query(
          `
            SELECT crm_lead_id,status
            FROM lead_routing_decisions
            WHERE company_id = $1
              AND entry_id = $2
          `,
          [
            companyId,
            entryId,
          ],
        );

      assert.equal(
        routing.rows.length,
        1,
      );

      assert.equal(
        String(
          routing.rows[0]
            .crm_lead_id,
        ),
        String(
          lead.rows[0]
            .id,
        ),
      );

      await client.query(
        `
          INSERT INTO barcode_identifiers (
            company_id,
            entity_type,
            entity_id,
            barcode,
            status
          )
          VALUES (
            $1,'product',$2,'SKU-001','active'
          )
        `,
        [
          companyId,
          productId,
        ],
      );

      await client.query(
        `
          INSERT INTO barcode_scan_events (
            id,
            company_id,
            barcode,
            operation,
            payload
          )
          VALUES (
            $1,$2,'SKU-001','receipt',$3::jsonb
          )
        `,
        [
          scanId,
          companyId,
          JSON.stringify({
            quantity:
              4,
            warehouse_id:
              warehouseId,
          }),
        ],
      );

      await applySuiteSpecialistRecordSideEffects(
        client,
        {
          moduleKey:
            'barcode',
          table:
            'barcode_scan_events',
          companyId,
          userId,
          operation:
            'create',
          row: {
            id:
              scanId,
            barcode:
              'SKU-001',
            operation:
              'receipt',
            payload: {
              quantity:
                4,
              warehouse_id:
                warehouseId,
            },
          },
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
        4,
      );

      const movement =
        await client.query(
          `
            SELECT movement_type,quantity
            FROM stock_movements
            WHERE company_id = $1
              AND product_id = $2
          `,
          [
            companyId,
            productId,
          ],
        );

      assert.equal(
        movement.rows[0]
          .movement_type,
        'receipt',
      );

      assert.equal(
        Number(
          movement.rows[0]
            .quantity,
        ),
        4,
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
  'ERP parity: product-grade depth schemas execute in PostgreSQL',
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
        `
          CREATE EXTENSION IF NOT EXISTS pgcrypto;

          CREATE TABLE companies (
            id UUID PRIMARY KEY
          );

          CREATE TABLE shop_products (
            id UUID PRIMARY KEY
          );
          CREATE TABLE shop_orders (
            id UUID PRIMARY KEY
          );

          CREATE TABLE menu_items (
            id UUID PRIMARY KEY
          );
          CREATE TABLE restaurant_tables (
            id UUID PRIMARY KEY
          );
          CREATE TABLE restaurant_orders (
            id UUID PRIMARY KEY
          );

          CREATE TABLE signature_requests (
            id UUID PRIMARY KEY
          );
          CREATE TABLE signers (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE
          );

          CREATE TABLE appointment_services (
            id UUID PRIMARY KEY
          );
          CREATE TABLE appointments (
            id UUID PRIMARY KEY
          );

          CREATE TABLE calendars (
            id UUID PRIMARY KEY
          );
          CREATE TABLE calendar_events (
            id UUID PRIMARY KEY
          );

          CREATE TABLE documents (
            id UUID PRIMARY KEY
          );

          CREATE TABLE surveys (
            id UUID PRIMARY KEY
          );
          CREATE TABLE survey_questions (
            id UUID PRIMARY KEY,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE
          );
          CREATE TABLE survey_responses (
            id UUID PRIMARY KEY,
            survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE
          );

          CREATE TABLE workbooks (
            id UUID PRIMARY KEY
          );
          CREATE TABLE sheets (
            id UUID PRIMARY KEY,
            workbook_id UUID NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE
          );
        `,
      );

      await client.query(
        specialistSuiteDepthSql(
          'spreadsheet',
        ),
      );

      for (
        const moduleKey
        of [
          'pos_shop',
          'pos_restaurant',
          'sign',
          'appointments',
          'calendar',
          'documents',
          'surveys',
          'spreadsheet',
        ]
      ) {
        const sql =
          specialistProductDepthSql(
            moduleKey,
          );

        assert.ok(
          sql.trim(),
          moduleKey +
          ' should expose product-grade depth SQL',
        );

        await client.query(
          sql,
        );
      }

      for (
        const table
        of [
          'shop_sessions',
          'shop_payments',
          'shop_offline_batches',
          'shop_inventory_postings',
          'restaurant_floors',
          'restaurant_payments',
          'restaurant_kitchen_tickets',
          'restaurant_inventory_postings',
          'signature_envelopes',
          'signature_fields',
          'signature_auth_challenges',
          'signature_completion_certificates',
          'appointment_resources',
          'appointment_resource_assignments',
          'appointment_questions',
          'appointment_answers',
          'external_calendar_connections',
          'calendar_sync_mappings',
          'calendar_event_reminders',
          'document_tags',
          'document_share_links',
          'survey_question_logic',
          'survey_invitations',
          'survey_response_scores',
          'spreadsheet_charts',
          'spreadsheet_filters',
          'spreadsheet_snapshots',
          'spreadsheet_refresh_runs',
        ]
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
          ' should be created by product-grade specialist SQL',
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
  'ERP parity: POS payment posts to Payments and completed sale posts Inventory once',
  async () => {
    const pool =
      new Pool({
        connectionString:
          DATABASE_URL,
      });

    const client =
      await pool.connect();

    const companyId =
      '11111111-1111-4111-8111-111111111111';
    const userId =
      '22222222-2222-4222-8222-222222222222';
    const orderId =
      '33333333-3333-4333-8333-333333333333';
    const itemId =
      '44444444-4444-4444-8444-444444444444';
    const shopProductId =
      '55555555-5555-4555-8555-555555555555';
    const inventoryProductId =
      '66666666-6666-4666-8666-666666666666';
    const warehouseId =
      '77777777-7777-4777-8777-777777777777';
    const paymentId =
      '88888888-8888-4888-8888-888888888888';

    try {
      await client.query(
        'BEGIN',
      );

      await client.query(
        `
          CREATE EXTENSION IF NOT EXISTS pgcrypto;

          CREATE TABLE companies (
            id UUID PRIMARY KEY
          );

          CREATE TABLE shop_products (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE shop_orders (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            total_amount NUMERIC NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            deleted_at TIMESTAMPTZ,
            updated_by UUID,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE shop_order_items (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL,
            order_id UUID NOT NULL,
            product_id UUID NOT NULL,
            quantity NUMERIC NOT NULL,
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE stock_levels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            product_id UUID NOT NULL,
            warehouse_id UUID NOT NULL,
            quantity NUMERIC NOT NULL DEFAULT 0,
            reorder_level NUMERIC NOT NULL DEFAULT 0,
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
            quantity NUMERIC NOT NULL,
            reference TEXT,
            created_by UUID,
            updated_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE business_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            direction TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            currency TEXT NOT NULL,
            paid_at TIMESTAMPTZ,
            external_reference TEXT,
            counterparty_name TEXT,
            status TEXT NOT NULL,
            created_by UUID,
            updated_by UUID,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ
          );

          CREATE TABLE payment_allocations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            payment_id UUID NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id UUID NOT NULL,
            amount NUMERIC NOT NULL,
            status TEXT NOT NULL,
            created_by UUID,
            updated_by UUID,
            deleted_at TIMESTAMPTZ
          );
        `,
      );

      await client.query(
        specialistProductDepthSql(
          'pos_shop',
        ),
      );

      await client.query(
        'INSERT INTO companies (id) VALUES ($1)',
        [
          companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO shop_products (
            id,
            company_id,
            inventory_product_id
          )
          VALUES ($1,$2,$3)
        `,
        [
          shopProductId,
          companyId,
          inventoryProductId,
        ],
      );

      await client.query(
        `
          INSERT INTO shop_orders (
            id,
            company_id,
            total_amount,
            inventory_warehouse_id
          )
          VALUES ($1,$2,100,$3)
        `,
        [
          orderId,
          companyId,
          warehouseId,
        ],
      );

      await client.query(
        `
          INSERT INTO shop_order_items (
            id,
            company_id,
            order_id,
            product_id,
            quantity
          )
          VALUES ($1,$2,$3,$4,2)
        `,
        [
          itemId,
          companyId,
          orderId,
          shopProductId,
        ],
      );

      await client.query(
        `
          INSERT INTO stock_levels (
            company_id,
            product_id,
            warehouse_id,
            quantity
          )
          VALUES ($1,$2,$3,5)
        `,
        [
          companyId,
          inventoryProductId,
          warehouseId,
        ],
      );

      await client.query(
        `
          INSERT INTO shop_payments (
            id,
            company_id,
            order_id,
            method,
            amount,
            currency,
            provider_reference,
            paid_at,
            status
          )
          VALUES (
            $1,$2,$3,'mobile_money',100,'KES',
            'POS-PAY-1',NOW(),'captured'
          )
        `,
        [
          paymentId,
          companyId,
          orderId,
        ],
      );

      await applyProductSpecialistRecordSideEffects(
        client,
        {
          moduleKey:
            'pos_shop',
          table:
            'shop_payments',
          companyId,
          userId,
          operation:
            'create',
          row: {
            id:
              paymentId,
            order_id:
              orderId,
            method:
              'mobile_money',
            amount:
              100,
            currency:
              'KES',
            provider_reference:
              'POS-PAY-1',
            paid_at:
              new Date(
                '2026-09-27T12:00:00Z',
              ),
            status:
              'captured',
          },
        },
      );

      await applyProductSpecialistTransition(
        client,
        {
          moduleKey:
            'pos_shop',
          table:
            'shop_orders',
          companyId,
          userId,
          recordId:
            orderId,
          nextStatus:
            'paid',
        },
      );

      await applyProductSpecialistTransition(
        client,
        {
          moduleKey:
            'pos_shop',
          table:
            'shop_orders',
          companyId,
          userId,
          recordId:
            orderId,
          nextStatus:
            'completed',
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
            inventoryProductId,
            warehouseId,
          ],
        );

      assert.equal(
        Number(
          stock.rows[0]
            .quantity,
        ),
        3,
      );

      const movements =
        await client.query(
          `
            SELECT COUNT(*)::int AS count
            FROM stock_movements
            WHERE company_id = $1
              AND reference = $2
          `,
          [
            companyId,
            'pos_shop_sale:' +
              orderId,
          ],
        );

      assert.equal(
        Number(
          movements.rows[0]
            .count,
        ),
        1,
        'inventory posting must be idempotent across paid -> completed',
      );

      const mirrored =
        await client.query(
          `
            SELECT COUNT(*)::int AS count
            FROM business_payments
            WHERE company_id = $1
              AND external_reference = 'POS-PAY-1'
          `,
          [
            companyId,
          ],
        );

      assert.equal(
        Number(
          mirrored.rows[0]
            .count,
        ),
        1,
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

