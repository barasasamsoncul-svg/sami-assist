import 'server-only';

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
  const [stockContext, movementContext] = await Promise.all([
    requireEnterpriseModuleTableContext('inventory', 'stock_levels', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'stock_movements', 'view'),
  ]);
  if (stockContext.companyId !== movementContext.companyId || stockContext.tenantId !== movementContext.tenantId) {
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
         COUNT(*) FILTER (WHERE GREATEST(sl.quantity - COALESCE(reserved.reserved_quantity, 0), 0) <= sl.reorder_level)::int AS low_stock_count
       FROM public.stock_levels sl
       INNER JOIN public.products p ON p.id = sl.product_id AND p.company_id = sl.company_id AND p.deleted_at IS NULL
       INNER JOIN public.warehouses w ON w.id = sl.warehouse_id AND w.company_id = sl.company_id AND w.deleted_at IS NULL
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
         sl.reorder_level::text AS reorder_level,
         GREATEST(sl.quantity - COALESCE(reserved.reserved_quantity, 0), 0) <= sl.reorder_level AS low_stock
       FROM public.stock_levels sl
       INNER JOIN public.products p ON p.id = sl.product_id AND p.company_id = sl.company_id AND p.deleted_at IS NULL
       INNER JOIN public.warehouses w ON w.id = sl.warehouse_id AND w.company_id = sl.company_id AND w.deleted_at IS NULL
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
