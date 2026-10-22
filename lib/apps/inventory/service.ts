import 'server-only';

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  EnterpriseModuleError,
  createEnterpriseModuleRecord,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INBOUND = new Set(['in','inbound','receipt','purchase_receipt','opening_balance','return_in','adjustment_in']);
const OUTBOUND = new Set(['out','outbound','issue','sale','return_out','adjustment_out']);
const MOVEMENT_TYPES = new Set([...INBOUND, ...OUTBOUND]);

export class InventoryInputError extends Error {
  constructor(message: string) { super(message); this.name = 'InventoryInputError'; }
}

function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InventoryInputError('Enter a valid inventory movement.');
  return input as Record<string, unknown>;
}
function requiredText(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string') throw new InventoryInputError(label + ' is required.');
  const result = value.trim();
  if (!result) throw new InventoryInputError(label + ' is required.');
  if (result.length > max) throw new InventoryInputError(label + ' is too long.');
  return result;
}
function requiredUuid(value: unknown, label: string): string {
  const result = requiredText(value, label, 64);
  if (!UUID_RE.test(result)) throw new InventoryInputError(label + ' is invalid.');
  return result;
}
function requiredQuantity(value: unknown): string {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) throw new InventoryInputError('Enter a quantity with up to four decimal places.');
  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) {
    throw new InventoryInputError('Quantity must be greater than zero and within the supported range.');
  }
  return quantity.toFixed(4);
}

export type InventoryStockOverview = {
  summary: { productCount: number; warehouseCount: number; stockBalanceCount: number; onHandQuantity: string; lowStockCount: number };
  products: Array<{ id: string; name: string; sku: string | null; unitOfMeasure: string }>;
  warehouses: Array<{ id: string; name: string; code: string; isDefault: boolean }>;
  balances: Array<{ productId: string; productName: string; sku: string | null; warehouseId: string; warehouseName: string; quantity: string; reservedQuantity: string; availableQuantity: string; reorderLevel: string; lowStock: boolean }>;
  recentMovements: Array<{ id: string; productName: string; warehouseName: string; movementType: string; quantity: string; reference: string | null; createdAt: string }>;
};

export async function getInventoryStockOverview(): Promise<InventoryStockOverview> {
  const contexts = await Promise.all([
    requireEnterpriseModuleTableContext('inventory', 'stock_levels', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'stock_movements', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'products', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'warehouses', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'stock_reservations', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'inventory_reorder_rules', 'view'),
  ]);
  const stockContext = contexts[0];
  if (contexts.some((context) =>
    context.companyId !== stockContext.companyId ||
    context.tenantId !== stockContext.tenantId
  )) {
    throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Your workspace or company changed. Reload Inventory and try again.');
  }

  const { pool, companyId } = stockContext;
  const [products, warehouses, summaryResult, balances, movements] = await Promise.all([
    pool.query(
      `SELECT id::text, name, sku, unit_of_measure
       FROM public.products
       WHERE company_id = $1 AND deleted_at IS NULL
         AND is_active = TRUE AND track_inventory = TRUE AND product_type = 'stockable'
       ORDER BY name, id LIMIT 500`,
      [companyId],
    ),
    pool.query(
      `SELECT id::text, name, code, is_default FROM public.warehouses
       WHERE company_id = $1 AND deleted_at IS NULL AND is_active = TRUE
       ORDER BY is_default DESC, name, id LIMIT 200`,
      [companyId],
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.products p WHERE p.company_id = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE AND p.track_inventory = TRUE AND p.product_type = 'stockable') AS product_count,
         (SELECT COUNT(*)::int FROM public.warehouses w WHERE w.company_id = $1 AND w.deleted_at IS NULL AND w.is_active = TRUE) AS warehouse_count,
         COUNT(*)::int AS stock_balance_count,
         COALESCE(SUM(sl.quantity), 0)::text AS on_hand_quantity,
         COUNT(*) FILTER (WHERE GREATEST(sl.quantity - COALESCE(reserved.reserved_quantity, 0), 0) <= COALESCE(rule.min_quantity, sl.reorder_level))::int AS low_stock_count
       FROM public.stock_levels sl
       INNER JOIN public.products p ON p.id = sl.product_id AND p.company_id = sl.company_id AND p.deleted_at IS NULL
       INNER JOIN public.warehouses w ON w.id = sl.warehouse_id AND w.company_id = sl.company_id AND w.deleted_at IS NULL
       LEFT JOIN public.inventory_reorder_rules rule
         ON rule.company_id = sl.company_id AND rule.product_id = sl.product_id AND rule.warehouse_id = sl.warehouse_id
        AND rule.deleted_at IS NULL AND rule.status = 'active'
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(r.quantity), 0) AS reserved_quantity
         FROM public.stock_reservations r
         WHERE r.company_id = sl.company_id AND r.product_id = sl.product_id AND r.warehouse_id = sl.warehouse_id
           AND r.deleted_at IS NULL AND r.status IN ('active', 'allocated')
       ) reserved ON TRUE
       WHERE sl.company_id = $1 AND sl.deleted_at IS NULL`,
      [companyId],
    ),
    pool.query(
      `SELECT p.id::text AS product_id, p.name AS product_name, p.sku, w.id::text AS warehouse_id, w.name AS warehouse_name,
         sl.quantity::text AS quantity, COALESCE(reserved.reserved_quantity, 0)::text AS reserved_quantity,
         GREATEST(sl.quantity - COALESCE(reserved.reserved_quantity, 0), 0)::text AS available_quantity,
         COALESCE(rule.min_quantity, sl.reorder_level)::text AS reorder_level,
         GREATEST(sl.quantity - COALESCE(reserved.reserved_quantity, 0), 0) <= COALESCE(rule.min_quantity, sl.reorder_level) AS low_stock
       FROM public.stock_levels sl
       INNER JOIN public.products p ON p.id = sl.product_id AND p.company_id = sl.company_id AND p.deleted_at IS NULL
       INNER JOIN public.warehouses w ON w.id = sl.warehouse_id AND w.company_id = sl.company_id AND w.deleted_at IS NULL
       LEFT JOIN public.inventory_reorder_rules rule
         ON rule.company_id = sl.company_id AND rule.product_id = sl.product_id AND rule.warehouse_id = sl.warehouse_id
        AND rule.deleted_at IS NULL AND rule.status = 'active'
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(r.quantity), 0) AS reserved_quantity
         FROM public.stock_reservations r
         WHERE r.company_id = sl.company_id AND r.product_id = sl.product_id AND r.warehouse_id = sl.warehouse_id
           AND r.deleted_at IS NULL AND r.status IN ('active', 'allocated')
       ) reserved ON TRUE
       WHERE sl.company_id = $1 AND sl.deleted_at IS NULL
       ORDER BY low_stock DESC, p.name, w.name LIMIT 200`,
      [companyId],
    ),
    pool.query(
      `SELECT movement.id::text, product.name AS product_name, warehouse.name AS warehouse_name,
         movement.movement_type, movement.quantity::text, movement.reference, movement.created_at::text AS created_at
       FROM public.stock_movements movement
       INNER JOIN public.products product ON product.id = movement.product_id AND product.company_id = movement.company_id
       INNER JOIN public.warehouses warehouse ON warehouse.id = movement.warehouse_id AND warehouse.company_id = movement.company_id
       WHERE movement.company_id = $1 AND movement.deleted_at IS NULL
       ORDER BY movement.created_at DESC, movement.id DESC LIMIT 25`,
      [companyId],
    ),
  ]);
  const s = summaryResult.rows[0] || {};
  return {
    summary: {
      productCount: Number(s.product_count || 0),
      warehouseCount: Number(s.warehouse_count || 0),
      stockBalanceCount: Number(s.stock_balance_count || 0),
      onHandQuantity: String(s.on_hand_quantity || '0'),
      lowStockCount: Number(s.low_stock_count || 0),
    },
    products: products.rows.map((r) => ({ id: String(r.id), name: String(r.name), sku: r.sku == null ? null : String(r.sku), unitOfMeasure: String(r.unit_of_measure || 'unit') })),
    warehouses: warehouses.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: String(r.code), isDefault: r.is_default === true })),
    balances: balances.rows.map((r) => ({
      productId: String(r.product_id), productName: String(r.product_name), sku: r.sku == null ? null : String(r.sku),
      warehouseId: String(r.warehouse_id), warehouseName: String(r.warehouse_name), quantity: String(r.quantity),
      reservedQuantity: String(r.reserved_quantity), availableQuantity: String(r.available_quantity),
      reorderLevel: String(r.reorder_level), lowStock: r.low_stock === true,
    })),
    recentMovements: movements.rows.map((r) => ({
      id: String(r.id), productName: String(r.product_name), warehouseName: String(r.warehouse_name),
      movementType: String(r.movement_type), quantity: String(r.quantity),
      reference: r.reference == null ? null : String(r.reference), createdAt: String(r.created_at),
    })),
  };
}

export async function recordInventoryStockMovement(input: unknown) {
  const body = inputObject(input);
  if (body.action !== 'record-movement') throw new InventoryInputError('Choose a supported Inventory action.');
  const productId = requiredUuid(body.productId, 'Product');
  const warehouseId = requiredUuid(body.warehouseId, 'Warehouse');
  const movementType = requiredText(body.movementType, 'Movement type', 40).toLowerCase();
  if (!MOVEMENT_TYPES.has(movementType)) throw new InventoryInputError('Choose a supported stock movement type.');
  const quantity = requiredQuantity(body.quantity);
  const reference = body.reference == null || body.reference === '' ? null : requiredText(body.reference, 'Reference', 255);
  const idempotencyKey = requiredUuid(body.idempotencyKey, 'Request key');

  return createEnterpriseModuleRecord('inventory', {
    table: 'stock_movements',
    idempotencyKey,
    values: { product_id: productId, warehouse_id: warehouseId, movement_type: movementType, quantity, reference },
  });
}


export class InventoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryConflictError';
  }
}

type InventoryOperation = 'view' | 'create' | 'edit';

async function requireConsistentInventoryContext(
  checks: Array<{ table: string; operation: InventoryOperation }>,
) {
  const contexts = await Promise.all(
    checks.map(({ table, operation }) =>
      requireEnterpriseModuleTableContext('inventory', table, operation),
    ),
  );
  const first = contexts[0];
  if (!first || contexts.some((context) =>
    context.companyId !== first.companyId ||
    context.tenantId !== first.tenantId
  )) {
    throw new EnterpriseModuleError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your workspace or company changed. Reload Inventory and try again.',
    );
  }
  return first;
}

async function inventoryTransaction<T>(
  context: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function requiredDate(value: unknown, label: string): string {
  const result = requiredText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new InventoryInputError(label + ' must be a valid date.');
  }
  const date = new Date(result + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) {
    throw new InventoryInputError(label + ' must be a valid date.');
  }
  return result;
}

function requiredNonnegativeQuantity(value: unknown): string {
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : '';
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) {
    throw new InventoryInputError('Enter a count with up to four decimal places.');
  }
  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000_000) {
    throw new InventoryInputError('Count must be nonnegative and within the supported range.');
  }
  return quantity.toFixed(4);
}

function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function makeInventoryNumber(prefix: string) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return prefix + '-' + day + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

async function requireActiveProductAndWarehouse(
  client: PoolClient,
  companyId: string,
  productId: string,
  warehouseId: string,
) {
  const refs = await client.query(
    `SELECT product.id
       FROM public.products product
       INNER JOIN public.warehouses warehouse
         ON warehouse.id = $3
        AND warehouse.company_id = $1
        AND warehouse.deleted_at IS NULL
        AND warehouse.is_active = TRUE
       WHERE product.id = $2
         AND product.company_id = $1
         AND product.deleted_at IS NULL
         AND product.is_active = TRUE
         AND product.track_inventory = TRUE
         AND product.product_type = 'stockable'
       FOR SHARE OF product, warehouse`,
    [companyId, productId, warehouseId],
  );
  if (refs.rows.length !== 1) {
    throw new InventoryConflictError(
      'Choose an active stock-tracked product and warehouse in the current company.',
    );
  }
}

async function postInventoryMovementInTransaction(
  client: PoolClient,
  input: {
    companyId: string;
    productId: string;
    warehouseId: string;
    movementType: string;
    quantity: string;
    reference: string;
  },
) {
  await requireActiveProductAndWarehouse(
    client,
    input.companyId,
    input.productId,
    input.warehouseId,
  );

  const inbound = new Set([
    'in', 'inbound', 'receipt', 'purchase_receipt', 'opening_balance',
    'return_in', 'adjustment_in', 'transfer_in',
  ]).has(input.movementType);

  if (inbound) {
    const balance = await client.query(
      `INSERT INTO public.stock_levels
         (product_id, warehouse_id, quantity, reorder_level, company_id, updated_at)
       VALUES ($1, $2, $3, 0, $4, NOW())
       ON CONFLICT (product_id, warehouse_id)
       DO UPDATE SET
         quantity = stock_levels.quantity + EXCLUDED.quantity,
         updated_at = NOW()
       WHERE stock_levels.company_id = EXCLUDED.company_id
         AND stock_levels.deleted_at IS NULL
       RETURNING id`,
      [input.productId, input.warehouseId, input.quantity, input.companyId],
    );
    if (balance.rows.length !== 1) {
      throw new InventoryConflictError(
        'The stock balance is unavailable in this company or requires administrator review.',
      );
    }
  } else {
    const changed = await client.query(
      `UPDATE public.stock_levels
       SET quantity = quantity - $3, updated_at = NOW()
       WHERE product_id = $1
         AND warehouse_id = $2
         AND company_id = $4
         AND deleted_at IS NULL
         AND quantity - COALESCE((
           SELECT SUM(reservation.quantity)
           FROM public.stock_reservations reservation
           WHERE reservation.company_id = stock_levels.company_id
             AND reservation.product_id = stock_levels.product_id
             AND reservation.warehouse_id = stock_levels.warehouse_id
             AND reservation.deleted_at IS NULL
             AND reservation.status IN ('active', 'allocated')
         ), 0) >= $3
       RETURNING id`,
      [input.productId, input.warehouseId, input.quantity, input.companyId],
    );
    if (changed.rows.length !== 1) {
      throw new InventoryConflictError(
        'Insufficient unreserved stock for this movement, or the stock balance is unavailable.',
      );
    }
  }

  const movement = await client.query(
    `INSERT INTO public.stock_movements
       (company_id, product_id, warehouse_id, movement_type, quantity, reference)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text`,
    [
      input.companyId,
      input.productId,
      input.warehouseId,
      input.movementType,
      input.quantity,
      input.reference,
    ],
  );
  return String(movement.rows[0]?.id || '');
}

export async function getInventoryWorkflowOverview() {
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_transfer_orders', operation: 'view' },
    { table: 'inventory_transfer_order_lines', operation: 'view' },
    { table: 'inventory_cycle_counts', operation: 'view' },
    { table: 'products', operation: 'view' },
    { table: 'warehouses', operation: 'view' },
  ]);
  const [transferRows, countRows] = await Promise.all([
    context.pool.query(
      `SELECT
         transfer.id::text,
         transfer.transfer_number,
         transfer.status,
         transfer.source_warehouse_id::text,
         source.name AS source_warehouse_name,
         transfer.destination_warehouse_id::text,
         destination.name AS destination_warehouse_name,
         transfer.requested_at::text,
         transfer.shipped_at::text,
         transfer.received_at::text,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', line.id::text,
               'productId', line.product_id::text,
               'productName', product.name,
               'requestedQuantity', line.requested_quantity::text,
               'shippedQuantity', line.shipped_quantity::text,
               'receivedQuantity', line.received_quantity::text
             )
             ORDER BY line.created_at, line.id
           ) FILTER (WHERE line.id IS NOT NULL),
           '[]'::jsonb
         ) AS lines
       FROM public.inventory_transfer_orders transfer
       INNER JOIN public.warehouses source
         ON source.id = transfer.source_warehouse_id
        AND source.company_id = transfer.company_id
       INNER JOIN public.warehouses destination
         ON destination.id = transfer.destination_warehouse_id
        AND destination.company_id = transfer.company_id
       LEFT JOIN public.inventory_transfer_order_lines line
         ON line.transfer_id = transfer.id
        AND line.company_id = transfer.company_id
        AND line.deleted_at IS NULL
       LEFT JOIN public.products product
         ON product.id = line.product_id
        AND product.company_id = line.company_id
       WHERE transfer.company_id = $1
         AND transfer.deleted_at IS NULL
       GROUP BY transfer.id, source.id, destination.id
       ORDER BY transfer.requested_at DESC, transfer.id DESC
       LIMIT 50`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT
         count_row.id::text,
         count_row.warehouse_id::text,
         warehouse.name AS warehouse_name,
         count_row.product_id::text,
         product.name AS product_name,
         count_row.due_on::text,
         count_row.status,
         count_row.system_quantity::text,
         count_row.counted_quantity::text,
         count_row.counted_at::text
       FROM public.inventory_cycle_counts count_row
       INNER JOIN public.warehouses warehouse
         ON warehouse.id = count_row.warehouse_id
        AND warehouse.company_id = count_row.company_id
       INNER JOIN public.products product
         ON product.id = count_row.product_id
        AND product.company_id = count_row.company_id
       WHERE count_row.company_id = $1
         AND count_row.deleted_at IS NULL
       ORDER BY
         CASE count_row.status
           WHEN 'counted' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'pending' THEN 2
           ELSE 3
         END,
         count_row.due_on,
         count_row.created_at DESC
       LIMIT 100`,
      [context.companyId],
    ),
  ]);

  return {
    transferOrders: transferRows.rows.map((row) => ({
      id: String(row.id),
      transferNumber: String(row.transfer_number),
      status: String(row.status),
      sourceWarehouseId: String(row.source_warehouse_id),
      sourceWarehouseName: String(row.source_warehouse_name),
      destinationWarehouseId: String(row.destination_warehouse_id),
      destinationWarehouseName: String(row.destination_warehouse_name),
      requestedAt: String(row.requested_at),
      shippedAt: row.shipped_at == null ? null : String(row.shipped_at),
      receivedAt: row.received_at == null ? null : String(row.received_at),
      lines: Array.isArray(row.lines) ? row.lines : [],
    })),
    cycleCounts: countRows.rows.map((row) => ({
      id: String(row.id),
      warehouseId: String(row.warehouse_id),
      warehouseName: String(row.warehouse_name),
      productId: String(row.product_id),
      productName: String(row.product_name),
      dueOn: String(row.due_on),
      status: String(row.status),
      systemQuantity: row.system_quantity == null ? null : String(row.system_quantity),
      countedQuantity: row.counted_quantity == null ? null : String(row.counted_quantity),
      countedAt: row.counted_at == null ? null : String(row.counted_at),
    })),
  };
}

async function createInventoryTransfer(body: Record<string, unknown>) {
  const sourceWarehouseId = requiredUuid(body.sourceWarehouseId, 'Source warehouse');
  const destinationWarehouseId = requiredUuid(body.destinationWarehouseId, 'Destination warehouse');
  if (sourceWarehouseId === destinationWarehouseId) {
    throw new InventoryInputError('Choose two different warehouses for a transfer.');
  }
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) {
    throw new InventoryInputError('A transfer must include between 1 and 100 product lines.');
  }
  const lines = body.lines.map((item, index) => {
    const row = inputObject(item);
    return {
      productId: requiredUuid(row.productId, 'Product on line ' + (index + 1)),
      quantity: requiredQuantity(row.quantity),
    };
  });
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
    throw new InventoryInputError('Each product can appear only once per transfer.');
  }
  const idempotencyKey = requiredUuid(body.idempotencyKey, 'Request key');
  const canonical = {
    sourceWarehouseId,
    destinationWarehouseId,
    lines: [...lines].sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  const hash = requestHash(canonical);
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_transfer_orders', operation: 'create' },
    { table: 'inventory_transfer_order_lines', operation: 'create' },
    { table: 'warehouses', operation: 'view' },
    { table: 'products', operation: 'view' },
  ]);

  return inventoryTransaction(context, async (client) => {
    const existing = await client.query(
      `SELECT id::text, request_hash
       FROM public.inventory_transfer_orders
       WHERE company_id = $1 AND request_key = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, idempotencyKey],
    );
    if (existing.rows.length) {
      if (String(existing.rows[0].request_hash) !== hash) {
        throw new InventoryConflictError('This request key was already used for a different transfer.');
      }
      return { transferId: String(existing.rows[0].id), duplicate: true };
    }

    const warehouses = await client.query(
      `SELECT id::text FROM public.warehouses
       WHERE company_id = $1 AND id = ANY($2::uuid[])
         AND is_active = TRUE AND deleted_at IS NULL
       FOR SHARE`,
      [context.companyId, [sourceWarehouseId, destinationWarehouseId]],
    );
    if (warehouses.rows.length !== 2) {
      throw new InventoryConflictError('Both transfer warehouses must be active and belong to the current company.');
    }
    const products = await client.query(
      `SELECT id::text FROM public.products
       WHERE company_id = $1 AND id = ANY($2::uuid[])
         AND is_active = TRUE AND deleted_at IS NULL
         AND track_inventory = TRUE AND product_type = 'stockable'
       FOR SHARE`,
      [context.companyId, lines.map((line) => line.productId)],
    );
    if (products.rows.length !== lines.length) {
      throw new InventoryConflictError('Every transfer line must use an active stock-tracked product in the current company.');
    }

    const transferNumber = makeInventoryNumber('TRF');
    const created = await client.query(
      `INSERT INTO public.inventory_transfer_orders
       (company_id, transfer_number, source_warehouse_id, destination_warehouse_id,
        status, request_key, request_hash, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$7)
       ON CONFLICT (company_id, request_key) WHERE request_key IS NOT NULL
       DO NOTHING
       RETURNING id::text`,
      [context.companyId, transferNumber, sourceWarehouseId, destinationWarehouseId, idempotencyKey, hash, context.userId],
    );
    if (created.rows.length !== 1) {
      const raced = await client.query(
        `SELECT id::text, request_hash FROM public.inventory_transfer_orders
         WHERE company_id = $1 AND request_key = $2 AND deleted_at IS NULL`,
        [context.companyId, idempotencyKey],
      );
      if (!raced.rows.length || String(raced.rows[0].request_hash) !== hash) {
        throw new InventoryConflictError('The transfer request key conflicts with another request.');
      }
      return { transferId: String(raced.rows[0].id), duplicate: true };
    }

    const transferId = String(created.rows[0].id);
    for (const line of lines) {
      await client.query(
        `INSERT INTO public.inventory_transfer_order_lines
         (company_id, transfer_id, product_id, requested_quantity, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)`,
        [context.companyId, transferId, line.productId, line.quantity, context.userId],
      );
    }
    return { transferId, transferNumber, status: 'draft', duplicate: false };
  });
}

async function transitionInventoryTransfer(body: Record<string, unknown>, action: 'approve-transfer' | 'ship-transfer' | 'receive-transfer' | 'cancel-transfer') {
  const transferId = requiredUuid(body.transferId, 'Transfer');
  const operation = action === 'approve-transfer' || action === 'cancel-transfer' ? 'edit' : 'edit';
  const checks: Array<{ table: string; operation: InventoryOperation }> = [
    { table: 'inventory_transfer_orders', operation },
    { table: 'inventory_transfer_order_lines', operation: action === 'approve-transfer' || action === 'cancel-transfer' ? 'view' : 'edit' },
  ];
  if (action === 'ship-transfer' || action === 'receive-transfer') {
    checks.push(
      { table: 'stock_movements', operation: 'create' },
      { table: 'stock_levels', operation: 'edit' },
      { table: 'stock_reservations', operation: 'view' },
      { table: 'products', operation: 'view' },
      { table: 'warehouses', operation: 'view' },
    );
  }
  const context = await requireConsistentInventoryContext(checks);

  return inventoryTransaction(context, async (client) => {
    const orderResult = await client.query(
      `SELECT id::text, transfer_number, source_warehouse_id::text, destination_warehouse_id::text, status
       FROM public.inventory_transfer_orders
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [transferId, context.companyId],
    );
    if (!orderResult.rows.length) throw new InventoryConflictError('Transfer not found in this company.');
    const order = orderResult.rows[0];
    const status = String(order.status);
    if (action === 'approve-transfer') {
      if (status === 'approved') return { transferId, status, duplicate: true };
      if (status !== 'draft') throw new InventoryConflictError('Only draft transfers can be approved.');
      const lineCount = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.inventory_transfer_order_lines
         WHERE company_id = $1 AND transfer_id = $2 AND deleted_at IS NULL`,
        [context.companyId, transferId],
      );
      if (Number(lineCount.rows[0]?.count || 0) < 1) throw new InventoryConflictError('Add at least one product line before approving this transfer.');
      await client.query(
        `UPDATE public.inventory_transfer_orders SET status = 'approved', updated_by = $3, updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND status = 'draft'`,
        [transferId, context.companyId, context.userId],
      );
      return { transferId, status: 'approved', duplicate: false };
    }

    if (action === 'cancel-transfer') {
      if (status === 'cancelled') return { transferId, status, duplicate: true };
      if (status !== 'draft' && status !== 'approved') {
        throw new InventoryConflictError('A transfer can be cancelled only before shipment.');
      }
      await client.query(
        `UPDATE public.inventory_transfer_orders SET status = 'cancelled', updated_by = $3, updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND status = $4`,
        [transferId, context.companyId, context.userId, status],
      );
      return { transferId, status: 'cancelled', duplicate: false };
    }

    if (action === 'ship-transfer') {
      if (status === 'in_transit' || status === 'received') return { transferId, status, duplicate: true };
      if (status !== 'approved') throw new InventoryConflictError('Only approved transfers can be shipped.');
      const lines = await client.query(
        `SELECT line.id::text, line.product_id::text, line.requested_quantity::text
         FROM public.inventory_transfer_order_lines line
         WHERE line.company_id = $1 AND line.transfer_id = $2 AND line.deleted_at IS NULL
         ORDER BY line.id FOR UPDATE`,
        [context.companyId, transferId],
      );
      if (!lines.rows.length) throw new InventoryConflictError('This transfer has no product lines.');
      for (const line of lines.rows) {
        const quantity = String(line.requested_quantity);
        await postInventoryMovementInTransaction(client, {
          companyId: context.companyId,
          productId: String(line.product_id),
          warehouseId: String(order.source_warehouse_id),
          movementType: 'transfer_out',
          quantity,
          reference: String(order.transfer_number) + ' shipment',
        });
        await client.query(
          `UPDATE public.inventory_transfer_order_lines
           SET shipped_quantity = requested_quantity, updated_by = $3, updated_at = NOW()
           WHERE id = $1 AND company_id = $2`,
          [line.id, context.companyId, context.userId],
        );
      }
      await client.query(
        `UPDATE public.inventory_transfer_orders
         SET status = 'in_transit', shipped_at = NOW(), updated_by = $3, updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND status = 'approved'`,
        [transferId, context.companyId, context.userId],
      );
      return { transferId, status: 'in_transit', duplicate: false };
    }

    if (status === 'received') return { transferId, status, duplicate: true };
    if (status !== 'in_transit') throw new InventoryConflictError('Only in-transit transfers can be received.');
    const lines = await client.query(
      `SELECT line.id::text, line.product_id::text, line.shipped_quantity::text
       FROM public.inventory_transfer_order_lines line
       WHERE line.company_id = $1 AND line.transfer_id = $2 AND line.deleted_at IS NULL
       ORDER BY line.id FOR UPDATE`,
      [context.companyId, transferId],
    );
    if (!lines.rows.length) throw new InventoryConflictError('This transfer has no shipped product lines.');
    for (const line of lines.rows) {
      const quantity = String(line.shipped_quantity);
      if (Number(quantity) <= 0) throw new InventoryConflictError('A transfer line has no shipped quantity.');
      await postInventoryMovementInTransaction(client, {
        companyId: context.companyId,
        productId: String(line.product_id),
        warehouseId: String(order.destination_warehouse_id),
        movementType: 'transfer_in',
        quantity,
        reference: String(order.transfer_number) + ' receipt',
      });
      await client.query(
        `UPDATE public.inventory_transfer_order_lines
         SET received_quantity = shipped_quantity, updated_by = $3, updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [line.id, context.companyId, context.userId],
      );
    }
    await client.query(
      `UPDATE public.inventory_transfer_orders
       SET status = 'received', received_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'in_transit'`,
      [transferId, context.companyId, context.userId],
    );
    return { transferId, status: 'received', duplicate: false };
  });
}

async function createInventoryCycleCount(body: Record<string, unknown>) {
  const warehouseId = requiredUuid(body.warehouseId, 'Warehouse');
  const productId = requiredUuid(body.productId, 'Product');
  const dueOn = requiredDate(body.dueOn, 'Due date');
  const idempotencyKey = requiredUuid(body.idempotencyKey, 'Request key');
  const canonical = { warehouseId, productId, dueOn };
  const hash = requestHash(canonical);
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_cycle_counts', operation: 'create' },
    { table: 'stock_levels', operation: 'view' },
    { table: 'warehouses', operation: 'view' },
    { table: 'products', operation: 'view' },
  ]);

  return inventoryTransaction(context, async (client) => {
    const existing = await client.query(
      `SELECT id::text, request_hash FROM public.inventory_cycle_counts
       WHERE company_id = $1 AND request_key = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, idempotencyKey],
    );
    if (existing.rows.length) {
      if (String(existing.rows[0].request_hash) !== hash) throw new InventoryConflictError('This request key was already used for a different cycle count.');
      return { cycleCountId: String(existing.rows[0].id), duplicate: true };
    }

    await requireActiveProductAndWarehouse(client, context.companyId, productId, warehouseId);
    const balance = await client.query(
      `SELECT quantity::text FROM public.stock_levels
       WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, productId, warehouseId],
    );
    const systemQuantity = balance.rows.length ? String(balance.rows[0].quantity) : '0.0000';
    const created = await client.query(
      `INSERT INTO public.inventory_cycle_counts
       (company_id, warehouse_id, product_id, due_on, system_quantity, status, request_key, request_hash, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$8)
       ON CONFLICT (company_id, request_key) WHERE request_key IS NOT NULL DO NOTHING
       RETURNING id::text`,
      [context.companyId, warehouseId, productId, dueOn, systemQuantity, idempotencyKey, hash, context.userId],
    );
    if (created.rows.length !== 1) {
      const raced = await client.query(
        `SELECT id::text, request_hash FROM public.inventory_cycle_counts
         WHERE company_id = $1 AND request_key = $2 AND deleted_at IS NULL`,
        [context.companyId, idempotencyKey],
      );
      if (!raced.rows.length || String(raced.rows[0].request_hash) !== hash) throw new InventoryConflictError('The cycle-count request key conflicts with another request.');
      return { cycleCountId: String(raced.rows[0].id), duplicate: true };
    }
    return { cycleCountId: String(created.rows[0].id), status: 'pending', duplicate: false };
  });
}

async function recordInventoryCycleCount(body: Record<string, unknown>) {
  const cycleCountId = requiredUuid(body.cycleCountId, 'Cycle count');
  const countedQuantity = requiredNonnegativeQuantity(body.countedQuantity);
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_cycle_counts', operation: 'edit' },
    { table: 'stock_levels', operation: 'view' },
    { table: 'products', operation: 'view' },
    { table: 'warehouses', operation: 'view' },
  ]);
  return inventoryTransaction(context, async (client) => {
    const found = await client.query(
      `SELECT id::text, warehouse_id::text, product_id::text, status
       FROM public.inventory_cycle_counts
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [cycleCountId, context.companyId],
    );
    if (!found.rows.length) throw new InventoryConflictError('Cycle count not found in this company.');
    const row = found.rows[0];
    const status = String(row.status);
    if (status === 'counted') return { cycleCountId, status, duplicate: true };
    if (status !== 'pending' && status !== 'in_progress') throw new InventoryConflictError('Only pending or in-progress counts can be recorded.');
    await requireActiveProductAndWarehouse(client, context.companyId, String(row.product_id), String(row.warehouse_id));
    const balance = await client.query(
      `SELECT quantity::text FROM public.stock_levels
       WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, row.product_id, row.warehouse_id],
    );
    const systemQuantity = balance.rows.length ? String(balance.rows[0].quantity) : '0.0000';
    await client.query(
      `UPDATE public.inventory_cycle_counts
       SET status = 'counted', system_quantity = $3, counted_quantity = $4,
           counted_at = NOW(), updated_by = $5, updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [cycleCountId, context.companyId, systemQuantity, countedQuantity, context.userId],
    );
    return { cycleCountId, status: 'counted', systemQuantity, countedQuantity, duplicate: false };
  });
}

async function postInventoryCycleCount(body: Record<string, unknown>) {
  const cycleCountId = requiredUuid(body.cycleCountId, 'Cycle count');
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_cycle_counts', operation: 'edit' },
    { table: 'inventory_adjustments', operation: 'create' },
    { table: 'stock_movements', operation: 'create' },
    { table: 'stock_levels', operation: 'edit' },
    { table: 'stock_reservations', operation: 'view' },
    { table: 'products', operation: 'view' },
    { table: 'warehouses', operation: 'view' },
  ]);

  return inventoryTransaction(context, async (client) => {
    const found = await client.query(
      `SELECT id::text, warehouse_id::text, product_id::text, status,
              system_quantity::text, counted_quantity::text
       FROM public.inventory_cycle_counts
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [cycleCountId, context.companyId],
    );
    if (!found.rows.length) throw new InventoryConflictError('Cycle count not found in this company.');
    const count = found.rows[0];
    if (String(count.status) === 'posted') return { cycleCountId, status: 'posted', duplicate: true };
    if (String(count.status) !== 'counted' || count.system_quantity == null || count.counted_quantity == null) {
      throw new InventoryConflictError('Record a physical count before posting its variance.');
    }
    const productId = String(count.product_id);
    const warehouseId = String(count.warehouse_id);
    await requireActiveProductAndWarehouse(client, context.companyId, productId, warehouseId);

    const current = await client.query(
      `SELECT quantity::text FROM public.stock_levels
       WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND deleted_at IS NULL
       FOR UPDATE`,
      [context.companyId, productId, warehouseId],
    );
    const currentQuantity = current.rows.length ? String(current.rows[0].quantity) : '0.0000';
    if (Number(currentQuantity) !== Number(count.system_quantity)) {
      throw new InventoryConflictError('Stock changed after the count was recorded. Re-record the physical count before posting.');
    }

    const systemQuantity = Number(count.system_quantity);
    const countedQuantity = Number(count.counted_quantity);
    const difference = Number((countedQuantity - systemQuantity).toFixed(4));
    const adjustmentNumber = makeInventoryNumber('ADJ');
    if (difference !== 0) {
      await postInventoryMovementInTransaction(client, {
        companyId: context.companyId,
        productId,
        warehouseId,
        movementType: difference > 0 ? 'adjustment_in' : 'adjustment_out',
        quantity: Math.abs(difference).toFixed(4),
        reference: adjustmentNumber + ' · cycle count ' + cycleCountId,
      });
    }
    const adjustment = await client.query(
      `INSERT INTO public.inventory_adjustments
       (company_id, adjustment_number, warehouse_id, product_id, cycle_count_id,
        counted_quantity, system_quantity, difference_quantity, reason, approved_by,
        approved_at, posted_at, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),'posted',$10,$10)
       ON CONFLICT (company_id, cycle_count_id) WHERE cycle_count_id IS NOT NULL
       DO NOTHING
       RETURNING id::text`,
      [context.companyId, adjustmentNumber, warehouseId, productId, cycleCountId,
        count.counted_quantity, count.system_quantity, difference,
        'Posted through approved Inventory cycle-count workflow', context.userId],
    );
    if (!adjustment.rows.length) {
      // The uniqueness constraint ensures a retry cannot create a second adjustment.
      const existingAdjustment = await client.query(
        `SELECT id::text FROM public.inventory_adjustments
         WHERE company_id = $1 AND cycle_count_id = $2`,
        [context.companyId, cycleCountId],
      );
      if (!existingAdjustment.rows.length) throw new InventoryConflictError('Cycle-count adjustment could not be verified.');
    }
    await client.query(
      `UPDATE public.inventory_cycle_counts
       SET status = 'posted', updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'counted'`,
      [cycleCountId, context.companyId, context.userId],
    );
    return { cycleCountId, status: 'posted', differenceQuantity: difference.toFixed(4), duplicate: false };
  });
}

async function cancelInventoryCycleCount(body: Record<string, unknown>) {
  const cycleCountId = requiredUuid(body.cycleCountId, 'Cycle count');
  const context = await requireConsistentInventoryContext([
    { table: 'inventory_cycle_counts', operation: 'edit' },
  ]);
  return inventoryTransaction(context, async (client) => {
    const found = await client.query(
      `SELECT id::text, status FROM public.inventory_cycle_counts
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [cycleCountId, context.companyId],
    );
    if (!found.rows.length) throw new InventoryConflictError('Cycle count not found in this company.');
    const status = String(found.rows[0].status);
    if (status === 'cancelled') return { cycleCountId, status, duplicate: true };
    if (!['pending', 'in_progress', 'counted'].includes(status)) {
      throw new InventoryConflictError('Only unposted cycle counts can be cancelled.');
    }
    await client.query(
      `UPDATE public.inventory_cycle_counts SET status = 'cancelled', updated_by = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [cycleCountId, context.companyId, context.userId],
    );
    return { cycleCountId, status: 'cancelled', duplicate: false };
  });
}

export async function runInventoryWorkflow(input: unknown) {
  const body = inputObject(input);
  switch (body.action) {
    case 'record-movement':
      return recordInventoryStockMovement(body);
    case 'create-transfer':
      return createInventoryTransfer(body);
    case 'approve-transfer':
    case 'ship-transfer':
    case 'receive-transfer':
    case 'cancel-transfer':
      return transitionInventoryTransfer(body, body.action);
    case 'create-cycle-count':
      return createInventoryCycleCount(body);
    case 'record-cycle-count':
      return recordInventoryCycleCount(body);
    case 'post-cycle-count':
      return postInventoryCycleCount(body);
    case 'cancel-cycle-count':
      return cancelInventoryCycleCount(body);
    default:
      throw new InventoryInputError('Choose a supported Inventory action.');
  }
}
