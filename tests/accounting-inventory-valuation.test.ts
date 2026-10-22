import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

import { ACCOUNTING_INVENTORY_VALUATION_SQL } from '../lib/apps/accounting/inventory-valuation-schema';

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


test('posted Purchase receipts feed standard-cost valuation with the purchase-order unit cost', async () => {
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
  assert.match(backfill, /'purchase_order_cost'/);
  assert.match(backfill, /movement\.reference/);
  assert.match(backfill, /ON CONFLICT \(company_id, source_event_key\)/);
  assert.match(backfill, /supersededByPurchaseReceiptEvent/);

  assert.match(source, /event\.cost_source \|\| ''\) !== 'purchase_order_cost'/);
  assert.match(source, /debitAccount = accounts\.asset;\s*creditAccount = accounts\.grni/);
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
