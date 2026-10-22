import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

import { ACCOUNTING_INVENTORY_VALUATION_SQL } from '../lib/apps/accounting/inventory-valuation-schema';

import { postPurchaseReceiptToInventory } from '../lib/apps/enterprise/specialist-finance-transitions';

import {
  classifyInventoryEvent,
  inventoryMoneyCents,
  inventoryQuantityUnits,
  moneyDecimal,
  quantityDecimal,
  standardCostValue,
} from '../lib/apps/accounting/inventory-valuation-rules';

test('inventory valuation decimal helpers preserve accounting precision', () => {
  assert.equal(inventoryQuantityUnits('12.3456'), BigInt(123456));
  assert.equal(inventoryQuantityUnits('-0.0001'), BigInt(-1));
  assert.equal(inventoryMoneyCents('19.99'), BigInt(1999));
  assert.equal(inventoryMoneyCents('-0.01'), BigInt(-1));
  assert.equal(quantityDecimal(BigInt(-12345)), '-1.2345');
  assert.equal(moneyDecimal(BigInt(-12345)), '-123.45');

  assert.throws(
    () => inventoryQuantityUnits('1.23456'),
    /Inventory quantity is invalid/,
  );
  assert.throws(
    () => inventoryMoneyCents('1.001'),
    /Inventory amount is invalid/,
  );
});

test('standard-cost valuation rounds to ledger cents and ignores quantity sign', () => {
  assert.equal(standardCostValue('2.5000', '4.0000'), '10.00');
  assert.equal(standardCostValue('-2.5000', '4.0000'), '10.00');
  assert.equal(standardCostValue('2.0000', '4.1250'), '8.25');
  assert.equal(standardCostValue('3.0000', '0.3333'), '1.00');
});

test('inventory event classification maps authoritative movement direction to accounting treatment', () => {
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_delivery',
      quantityEffect: '-2.0000',
    }),
    'cogs_issue',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_return',
      quantityEffect: '2.0000',
    }),
    'cogs_return',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'purchase_receipt',
      quantityEffect: '2.0000',
    }),
    'receive_inventory',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'inventory_adjustment_gain',
      quantityEffect: '1.0000',
    }),
    'adjustment_gain',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'inventory_adjustment_loss',
      quantityEffect: '-1.0000',
    }),
    'adjustment_loss',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'sales_delivery',
      quantityEffect: '2.0000',
    }),
    'review',
  );
  assert.equal(
    classifyInventoryEvent({
      movementType: 'manual_transfer',
      quantityEffect: '-1.0000',
    }),
    'review',
  );
});


test('posted Purchase receipts feed standard-cost valuation with GRNI and purchase-price variance', async () => {
  const source = await readFile(
    new URL('../lib/apps/accounting/inventory-valuation.ts', import.meta.url),
    'utf8',
  );
  const schema = await readFile(
    new URL('../lib/apps/accounting/inventory-valuation-schema.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async function backfillSourceEvents');
  const end = source.indexOf('function builtInTreatment', start);
  const backfill = source.slice(start, end);

  assert.match(backfill, /sync_purchase_receipts/);
  assert.match(backfill, /receipt\.status = 'posted'/);
  assert.match(backfill, /purchase_receipt_lines/);
  assert.match(backfill, /purchase_order_items/);
  assert.match(backfill, /purchase_item\.unit_cost/);
  assert.match(backfill, /'backfill_current_standard_cost'/);
  assert.match(backfill, /movement\.reference/);
  assert.match(backfill, /ON CONFLICT \(company_id, source_event_key\)/);
  assert.match(backfill, /supersededByPurchaseReceiptEvent/);

  assert.match(source, /metadata\.costProvenance !== 'confirmed_purchase_order_line'/);
  assert.match(source, /treatment ===\s*'receive_inventory'[\s\S]*?debitAccount = accounts\.asset/);
  assert.match(source, /creditAccount = accounts\.grni/);
  assert.match(source, /actualPurchaseValue/);
  assert.match(source, /varianceCents =\s*actualPurchaseCents - valueCents/);
  assert.match(source, /accountId: accounts\.priceVariance/);
  assert.match(source, /goods_received_not_invoiced_account_id/);
  assert.match(source, /source_type <> 'purchase_receipt'[\s\S]*?\$2::boolean = TRUE/);

  assert.match(schema, /goods_received_not_invoiced_account_id/);
  assert.match(schema, /sync_purchase_receipts BOOLEAN/);
  assert.match(schema, /source_type IN \('stock_movement','inventory_adjustment','purchase_receipt'\)/);
  assert.match(schema, /purchase_order_cost/);
  assert.match(schema, /receive_inventory/);
});

test(
  'inventory valuation migration executes twice on PostgreSQL and exposes the complete 2.20 contract',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.journals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.accounting_settings (
          company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE
        );
      `);

      await client.query(ACCOUNTING_INVENTORY_VALUATION_SQL);
      await client.query(ACCOUNTING_INVENTORY_VALUATION_SQL);

      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'accounting_inventory_settings',
            'accounting_inventory_product_mappings',
            'accounting_inventory_movement_rules',
            'accounting_inventory_source_events',
            'accounting_inventory_sync_runs',
            'accounting_inventory_reconciliation_runs',
            'accounting_inventory_reconciliation_lines'
          )
        ORDER BY table_name
      `);

      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        [
          'accounting_inventory_movement_rules',
          'accounting_inventory_product_mappings',
          'accounting_inventory_reconciliation_lines',
          'accounting_inventory_reconciliation_runs',
          'accounting_inventory_settings',
          'accounting_inventory_source_events',
          'accounting_inventory_sync_runs',
        ],
      );

      const settingsColumns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'accounting_settings'
          AND column_name IN (
            'inventory_asset_account_id',
            'cogs_account_id',
            'inventory_gain_account_id',
            'inventory_loss_account_id'
          )
        ORDER BY column_name
      `);

      assert.deepEqual(
        settingsColumns.rows.map((row) => row.column_name),
        [
          'cogs_account_id',
          'inventory_asset_account_id',
          'inventory_gain_account_id',
          'inventory_loss_account_id',
        ],
      );

      const constraints = await client.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.accounting_inventory_source_events'::regclass
      `);

      const definitions = constraints.rows
        .map((row) => String(row.definition))
        .join('\n');

      assert.match(definitions, /source_type/);
      assert.match(definitions, /cost_source/);
      assert.match(definitions, /status/);
      assert.match(definitions, /source_quantity >=/);
      assert.match(definitions, /unit_cost >=/);
      assert.match(definitions, /value_amount >=/);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);

test(
  'Purchase receipt posting fails closed without the required Inventory dependency',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(
        postPurchaseReceiptToInventory(client, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'),
        /Inventory must be installed and ready before this purchase receipt can be posted/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);

test(
  'Purchase receipt posting updates the shared stock ledger atomically and idempotently',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const companyId = '10000000-0000-4000-8000-000000000001';
    const userId = '10000000-0000-4000-8000-000000000002';
    const warehouseId = '10000000-0000-4000-8000-000000000003';
    const productA = '10000000-0000-4000-8000-000000000004';
    const productB = '10000000-0000-4000-8000-000000000005';
    const orderId = '10000000-0000-4000-8000-000000000006';
    const itemA = '10000000-0000-4000-8000-000000000007';
    const itemB = '10000000-0000-4000-8000-000000000008';
    const receiptA = '10000000-0000-4000-8000-000000000009';
    const receiptLineA = '10000000-0000-4000-8000-000000000010';
    const receiptLineB = '10000000-0000-4000-8000-000000000011';
    const receiptB = '10000000-0000-4000-8000-000000000012';
    const receiptLineC = '10000000-0000-4000-8000-000000000013';

    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE public.products (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          deleted_at TIMESTAMPTZ,
          track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
          product_type VARCHAR(30) NOT NULL DEFAULT 'stockable'
        );
        CREATE TABLE public.warehouses (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE public.purchase_orders (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          status VARCHAR(30) NOT NULL,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE public.purchase_order_items (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          purchase_order_id UUID NOT NULL,
          product_reference UUID NOT NULL,
          quantity NUMERIC(19,4) NOT NULL,
          unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
          deleted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE public.purchase_receipts (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          receipt_number VARCHAR(100) NOT NULL,
          purchase_order_id UUID NOT NULL,
          warehouse_reference UUID,
          status VARCHAR(30) NOT NULL,
          received_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE public.purchase_receipt_lines (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          receipt_id UUID NOT NULL,
          purchase_order_item_id UUID NOT NULL,
          product_reference UUID NOT NULL,
          quantity_received NUMERIC(19,4) NOT NULL,
          quantity_rejected NUMERIC(19,4) NOT NULL DEFAULT 0,
          deleted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE public.stock_movements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          product_id UUID NOT NULL,
          warehouse_id UUID NOT NULL,
          movement_type VARCHAR(50) NOT NULL,
          quantity NUMERIC(19,4) NOT NULL,
          reference VARCHAR(255),
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE public.stock_levels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          product_id UUID NOT NULL,
          warehouse_id UUID NOT NULL,
          quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
          reorder_level NUMERIC(19,4) NOT NULL DEFAULT 0,
          created_by UUID,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          UNIQUE (product_id, warehouse_id)
        );
      `);

      await client.query(
        `INSERT INTO public.products(id,company_id) VALUES ($1,$3),($2,$3)`,
        [productA, productB, companyId],
      );
      await client.query(
        `INSERT INTO public.warehouses(id,company_id) VALUES ($1,$2)`,
        [warehouseId, companyId],
      );
      await client.query(
        `INSERT INTO public.purchase_orders(id,company_id,status) VALUES ($1,$2,'confirmed')`,
        [orderId, companyId],
      );
      await client.query(
        `INSERT INTO public.purchase_order_items(id,company_id,purchase_order_id,product_reference,quantity,unit_cost)
          VALUES ($1,$3,$4,$5,5,12),($2,$3,$4,$6,4,20)`,
        [itemA, itemB, companyId, orderId, productA, productB],
      );
      await client.query(
        `INSERT INTO public.purchase_receipts(id,company_id,receipt_number,purchase_order_id,warehouse_reference,status)
          VALUES ($1,$2,'RCV-1',$3,$4,'inspected'),($5,$2,'RCV-2',$3,$4,'inspected')`,
        [receiptA, companyId, orderId, warehouseId, receiptB],
      );
      await client.query(
        `INSERT INTO public.purchase_receipt_lines(
            id,company_id,receipt_id,purchase_order_item_id,product_reference,quantity_received,quantity_rejected
          ) VALUES
          ($1,$2,$3,$4,$5,5,1),
          ($6,$2,$3,$7,$8,4,0),
          ($9,$2,$10,$4,$5,1,0)`,
        [receiptLineA, companyId, receiptA, itemA, productA, receiptLineB, itemB, productB, receiptLineC, receiptB],
      );

      await postPurchaseReceiptToInventory(client, companyId, userId, receiptA);

      const firstMovements = await client.query(
        `SELECT product_id::text, quantity::text, movement_type, created_by::text, updated_by::text
          FROM public.stock_movements WHERE company_id=$1 ORDER BY product_id`,
        [companyId],
      );
      assert.equal(firstMovements.rows.length, 2);
      assert.deepEqual(firstMovements.rows.map(row => row.quantity), ['4.0000', '4.0000']);
      assert.ok(firstMovements.rows.every(row => row.movement_type === 'purchase_receipt'));
      assert.ok(firstMovements.rows.every(row => row.created_by === userId && row.updated_by === userId));

      const firstBalances = await client.query(
        `SELECT product_id::text, quantity::text, updated_by::text
          FROM public.stock_levels WHERE company_id=$1 ORDER BY product_id`,
        [companyId],
      );
      assert.deepEqual(firstBalances.rows.map(row => row.quantity), ['4.0000', '4.0000']);
      assert.ok(firstBalances.rows.every(row => row.updated_by === userId));

      // Simulate a retry while the receipt remains inspected. Existing ledger
      // references must replay without incrementing stock a second time.
      await postPurchaseReceiptToInventory(client, companyId, userId, receiptA);
      const retry = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.stock_movements WHERE company_id=$1`,
        [companyId],
      );
      assert.equal(Number(retry.rows[0].count), 2);

      const retryBalances = await client.query(
        `SELECT product_id::text, quantity::text FROM public.stock_levels WHERE company_id=$1 ORDER BY product_id`,
        [companyId],
      );
      assert.deepEqual(retryBalances.rows.map(row => row.quantity), ['4.0000', '4.0000']);

      await client.query(
        `UPDATE public.purchase_receipts SET status='posted' WHERE id=$1 AND company_id=$2`,
        [receiptA, companyId],
      );
      await postPurchaseReceiptToInventory(client, companyId, userId, receiptB);

      const finalMovements = await client.query(
        `SELECT quantity::text FROM public.stock_movements WHERE company_id=$1 AND product_id=$2`,
        [companyId, productA],
      );
      assert.deepEqual(finalMovements.rows.map(row => row.quantity), ['4.0000', '1.0000']);

      const finalBalances = await client.query(
        `SELECT quantity::text FROM public.stock_levels WHERE company_id=$1 AND product_id=$2`,
        [companyId, productA],
      );
      assert.equal(finalBalances.rows[0].quantity, '5.0000');

      const order = await client.query(
        `SELECT status, updated_by::text FROM public.purchase_orders WHERE id=$1 AND company_id=$2`,
        [orderId, companyId],
      );
      assert.equal(order.rows[0].status, 'received');
      assert.equal(order.rows[0].updated_by, userId);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);

