import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { postPurchaseReceiptToInventory } from '../lib/apps/enterprise/specialist-finance-transitions';

test(
  'Purchase receipt posting is transactional, idempotent, company-scoped, and quantity-safe in PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();

    const companyId = randomUUID();
    const userId = randomUUID();
    const supplierId = randomUUID();
    const warehouseId = randomUUID();
    const orderId = randomUUID();
    const orderItemId = randomUUID();
    const productId = randomUUID();
    const otherProductId = randomUUID();
    const firstReceiptId = randomUUID();
    const firstLineId = randomUUID();
    const badProductReceiptId = randomUUID();
    const badProductLineId = randomUUID();
    const overReceiptId = randomUUID();
    const overLineId = randomUUID();
    const finalReceiptId = randomUUID();
    const finalLineId = randomUUID();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.products (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          name TEXT NOT NULL,
          sku TEXT,
          product_type TEXT NOT NULL DEFAULT 'stockable',
          track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
          cost_price NUMERIC(19,4) NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.warehouses (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          name TEXT NOT NULL,
          code TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.purchase_orders (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          supplier_id UUID NOT NULL,
          order_number TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.purchase_order_items (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          purchase_order_id UUID NOT NULL,
          product_reference UUID,
          description TEXT NOT NULL,
          quantity NUMERIC(19,4) NOT NULL,
          unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.purchase_receipts (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          receipt_number TEXT NOT NULL,
          purchase_order_id UUID NOT NULL,
          warehouse_reference UUID,
          status TEXT NOT NULL,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          receipt_id UUID NOT NULL,
          purchase_order_item_id UUID,
          product_reference UUID,
          quantity_received NUMERIC(19,4) NOT NULL,
          quantity_rejected NUMERIC(19,4) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.stock_movements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          product_id UUID NOT NULL,
          warehouse_id UUID NOT NULL,
          movement_type TEXT NOT NULL,
          quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
          reference TEXT,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.stock_levels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          product_id UUID NOT NULL,
          warehouse_id UUID NOT NULL,
          quantity NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
          reorder_level NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
          created_by UUID,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          UNIQUE(product_id, warehouse_id)
        );
      `);

      await client.query(
        'INSERT INTO public.companies (id, name) VALUES ($1, $2)',
        [companyId, 'Receipt integration test company'],
      );
      await client.query(
        `INSERT INTO public.products
          (id, company_id, name, sku, product_type, track_inventory, cost_price, is_active)
         VALUES
          ($1, $3, 'Test stock item', 'RCPT-TEST-1', 'stockable', TRUE, 2.5, TRUE),
          ($2, $3, 'Other stock item', 'RCPT-TEST-2', 'stockable', TRUE, 7.0, TRUE)`,
        [productId, otherProductId, companyId],
      );
      await client.query(
        'INSERT INTO public.warehouses (id, company_id, name, code, is_active) VALUES ($1, $2, $3, $4, TRUE)',
        [warehouseId, companyId, 'Main receipt warehouse', 'RCPT-WH-1'],
      );
      await client.query(
        `INSERT INTO public.purchase_orders
          (id, company_id, supplier_id, order_number, status)
         VALUES ($1, $2, $3, 'PO-RECEIPT-INTEGRATION', 'confirmed')`,
        [orderId, companyId, supplierId],
      );
      await client.query(
        `INSERT INTO public.purchase_order_items
          (id, company_id, purchase_order_id, product_reference, description, quantity, unit_cost)
         VALUES ($1, $2, $3, $4, 'Five units', 5, 10)`,
        [orderItemId, companyId, orderId, productId],
      );

      const insertReceipt = async (
        receiptId: string,
        receiptNumber: string,
        receiptStatus: string,
        lineId: string,
        lineProductId: string,
        quantityReceived: string,
        quantityRejected = '0',
      ) => {
        await client.query(
          `INSERT INTO public.purchase_receipts
            (id, company_id, receipt_number, purchase_order_id, warehouse_reference, status, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
          [receiptId, companyId, receiptNumber, orderId, warehouseId, receiptStatus, userId],
        );
        await client.query(
          `INSERT INTO public.purchase_receipt_lines
            (id, company_id, receipt_id, purchase_order_item_id, product_reference, quantity_received, quantity_rejected)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [lineId, companyId, receiptId, orderItemId, lineProductId, quantityReceived, quantityRejected],
        );
      };

      await insertReceipt(firstReceiptId, 'RCPT-001', 'received', firstLineId, productId, '3');
      await postPurchaseReceiptToInventory(client, companyId, userId, firstReceiptId);

      let stock = await client.query(
        'SELECT quantity::text, created_by::text, updated_by::text FROM public.stock_levels WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3',
        [companyId, productId, warehouseId],
      );
      let movements = await client.query(
        'SELECT id::text, movement_type, quantity::text, reference, created_by::text, updated_by::text FROM public.stock_movements WHERE company_id=$1',
        [companyId],
      );
      assert.equal(stock.rows.length, 1);
      assert.equal(Number(stock.rows[0].quantity), 3);
      assert.equal(stock.rows[0].created_by, userId);
      assert.equal(stock.rows[0].updated_by, userId);
      assert.equal(movements.rows.length, 1);
      assert.equal(movements.rows[0].movement_type, 'purchase_receipt');
      assert.equal(Number(movements.rows[0].quantity), 3);
      assert.equal(movements.rows[0].created_by, userId);
      assert.equal(movements.rows[0].updated_by, userId);
      assert.match(movements.rows[0].reference, new RegExp(firstReceiptId));

      // A retry while the receipt transition is being retried must not double post.
      await postPurchaseReceiptToInventory(client, companyId, userId, firstReceiptId);
      stock = await client.query(
        'SELECT quantity::text FROM public.stock_levels WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3',
        [companyId, productId, warehouseId],
      );
      movements = await client.query(
        'SELECT id FROM public.stock_movements WHERE company_id=$1',
        [companyId],
      );
      assert.equal(Number(stock.rows[0].quantity), 3);
      assert.equal(movements.rows.length, 1);

      await client.query(
        "UPDATE public.purchase_receipts SET status='posted' WHERE id=$1 AND company_id=$2",
        [firstReceiptId, companyId],
      );

      await insertReceipt(badProductReceiptId, 'RCPT-BAD-PRODUCT', 'received', badProductLineId, otherProductId, '1');
      await assert.rejects(
        postPurchaseReceiptToInventory(client, companyId, userId, badProductReceiptId),
        /same Inventory product/,
      );

      await insertReceipt(overReceiptId, 'RCPT-OVER', 'received', overLineId, productId, '3');
      await assert.rejects(
        postPurchaseReceiptToInventory(client, companyId, userId, overReceiptId),
        /exceed the remaining quantity/,
      );

      stock = await client.query(
        'SELECT quantity::text FROM public.stock_levels WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3',
        [companyId, productId, warehouseId],
      );
      movements = await client.query(
        'SELECT id FROM public.stock_movements WHERE company_id=$1',
        [companyId],
      );
      assert.equal(Number(stock.rows[0].quantity), 3);
      assert.equal(movements.rows.length, 1);

      await insertReceipt(finalReceiptId, 'RCPT-002', 'received', finalLineId, productId, '2');
      await postPurchaseReceiptToInventory(client, companyId, userId, finalReceiptId);

      const finalOrder = await client.query(
        'SELECT status, updated_by::text FROM public.purchase_orders WHERE id=$1 AND company_id=$2',
        [orderId, companyId],
      );
      stock = await client.query(
        'SELECT quantity::text FROM public.stock_levels WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3',
        [companyId, productId, warehouseId],
      );
      movements = await client.query(
        'SELECT id, quantity::text FROM public.stock_movements WHERE company_id=$1',
        [companyId],
      );

      assert.equal(Number(stock.rows[0].quantity), 5);
      assert.equal(movements.rows.length, 2);
      assert.equal(Number(movements.rows.reduce((sum, row) => sum + Number(row.quantity), 0)), 5);
      assert.equal(finalOrder.rows[0].status, 'received');
      assert.equal(finalOrder.rows[0].updated_by, userId);
      await client.query(
        "UPDATE public.purchase_receipts SET status='posted' WHERE id=$1 AND company_id=$2",
        [finalReceiptId, companyId],
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);
