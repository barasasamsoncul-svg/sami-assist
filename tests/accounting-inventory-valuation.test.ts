import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

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
