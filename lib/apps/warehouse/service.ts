import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export class WarehouseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarehouseInputError';
  }
}

export class WarehouseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarehouseConflictError';
  }
}

type Operation = 'view' | 'create' | 'edit';
type ContextCheck = { moduleKey?: 'warehouse' | 'inventory'; table: string; operation: Operation };

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WarehouseInputError('Enter a valid Warehouse request.');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max = 180): string {
  if (typeof value !== 'string') throw new WarehouseInputError(label + ' is required.');
  const normalized = value.trim();
  if (!normalized) throw new WarehouseInputError(label + ' is required.');
  if (normalized.length > max) throw new WarehouseInputError(label + ' is too long.');
  return normalized;
}

function optionalText(value: unknown, label: string, max = 180): string | null {
  if (value == null || value === '') return null;
  return requiredText(value, label, max);
}

function uuid(value: unknown, label: string, optional = false): string | null {
  if ((value == null || value === '') && optional) return null;
  const text = requiredText(value, label, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new WarehouseInputError(label + ' is invalid.');
  }
  return text;
}

function quantity(value: unknown): string {
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) {
    throw new WarehouseInputError('Enter a quantity with up to four decimal places.');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    throw new WarehouseInputError('Quantity must be positive and within the supported range.');
  }
  return parsed.toFixed(4);
}

function integer(value: unknown, label: string, fallback: number): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    throw new WarehouseInputError(label + ' must be a non-negative whole number.');
  }
  return parsed;
}

function warehouseNumber(prefix: string): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return prefix + '-' + day + '-' + randomUUID().slice(0, 8).toUpperCase();
}

async function getContext(checks: ContextCheck[]) {
  const contexts = await Promise.all(checks.map(({ moduleKey = 'warehouse', table, operation }) =>
    requireEnterpriseModuleTableContext(moduleKey, table, operation),
  ));
  const first = contexts[0];
  if (!first || contexts.some((item) =>
    item.companyId !== first.companyId ||
    item.tenantId !== first.tenantId ||
    item.userId !== first.userId
  )) {
    throw new EnterpriseModuleError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your workspace or company changed. Reload Warehouse and try again.',
    );
  }
  return first;
}

async function transaction<T>(
  context: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertLocations(
  client: PoolClient,
  companyId: string,
  locationIds: string[],
) {
  const unique = [...new Set(locationIds)];
  if (!unique.length) return;
  const result = await client.query(
    `SELECT id::text FROM public.warehouse_locations
     WHERE company_id = $1 AND id = ANY($2::uuid[])
       AND status = 'active' AND deleted_at IS NULL
     FOR SHARE`,
    [companyId, unique],
  );
  if (result.rows.length !== unique.length) {
    throw new WarehouseConflictError('Every selected location must be active and belong to the current company.');
  }
}

async function assertProducts(
  client: PoolClient,
  companyId: string,
  productIds: string[],
) {
  const unique = [...new Set(productIds)];
  if (!unique.length) return;
  const result = await client.query(
    `SELECT id::text FROM public.products
     WHERE company_id = $1 AND id = ANY($2::uuid[])
       AND is_active = TRUE AND deleted_at IS NULL
     FOR SHARE`,
    [companyId, unique],
  );
  if (result.rows.length !== unique.length) {
    throw new WarehouseConflictError('Every operation line must use an active product in the current company.');
  }
}

export type WarehouseWorkspaceOverview = {
  summary: {
    activeLocations: number;
    openOperations: number;
    activePickingBatches: number;
    openPackages: number;
    activePutawayRules: number;
  };
  locations: Array<{
    id: string; name: string; code: string; locationType: string; status: string;
    parentLocationId: string | null; parentName: string | null;
  }>;
  operations: Array<{
    id: string; operationNumber: string; operationType: string; status: string;
    reference: string | null; sourceLocationId: string | null; sourceName: string | null;
    destinationLocationId: string | null; destinationName: string | null;
    lineCount: number; createdAt: string;
  }>;
  pickingBatches: Array<{
    id: string; batchNumber: string; status: string; assignedUserId: string | null;
    scheduledAt: string | null; operationCount: number; completedOperationCount: number;
  }>;
  packages: Array<{
    id: string; packageNumber: string; status: string; weight: string;
    currentLocationId: string | null; currentLocationName: string | null;
  }>;
  putawayRules: Array<{
    id: string; priority: number; status: string; productReference: string | null;
    productName: string | null; sourceLocationId: string | null; sourceName: string | null;
    destinationLocationId: string; destinationName: string;
  }>;
  products: Array<{ id: string; name: string; sku: string | null }>;
};

export async function getWarehouseWorkspaceOverview(): Promise<WarehouseWorkspaceOverview> {
  const context = await getContext([
    { table: 'warehouse_locations', operation: 'view' },
    { table: 'warehouse_operations', operation: 'view' },
    { table: 'warehouse_operation_lines', operation: 'view' },
    { table: 'warehouse_picking_batches', operation: 'view' },
    { table: 'warehouse_picking_batch_operations', operation: 'view' },
    { table: 'warehouse_packages', operation: 'view' },
    { table: 'warehouse_putaway_rules', operation: 'view' },
    { moduleKey: 'inventory', table: 'products', operation: 'view' },
  ]);

  const [
    locationRows,
    operationRows,
    batchRows,
    packageRows,
    ruleRows,
    productRows,
    summaryRows,
  ] = await Promise.all([
    context.pool.query(
      `SELECT location.id::text, location.name, location.code, location.location_type,
              location.status, location.parent_location_id::text, parent.name AS parent_name
       FROM public.warehouse_locations location
       LEFT JOIN public.warehouse_locations parent
         ON parent.id = location.parent_location_id AND parent.company_id = location.company_id
        AND parent.deleted_at IS NULL
       WHERE location.company_id = $1 AND location.deleted_at IS NULL
       ORDER BY location.name, location.code LIMIT 200`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT operation.id::text, 'WH-' || upper(substr(replace(operation.id::text, '-', ''), 1, 8)) AS operation_number,
              operation.operation_type, operation.status, operation.reference,
              operation.source_location_id::text, source.name AS source_name,
              operation.destination_location_id::text, destination.name AS destination_name,
              COUNT(line.id)::int AS line_count, operation.created_at::text
       FROM public.warehouse_operations operation
       LEFT JOIN public.warehouse_locations source
         ON source.id = operation.source_location_id AND source.company_id = operation.company_id
        AND source.deleted_at IS NULL
       LEFT JOIN public.warehouse_locations destination
         ON destination.id = operation.destination_location_id AND destination.company_id = operation.company_id
        AND destination.deleted_at IS NULL
       LEFT JOIN public.warehouse_operation_lines line
         ON line.operation_id = operation.id AND line.company_id = operation.company_id AND line.deleted_at IS NULL
       WHERE operation.company_id = $1 AND operation.deleted_at IS NULL
       GROUP BY operation.id, source.name, destination.name
       ORDER BY operation.created_at DESC, operation.id DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT batch.id::text, batch.batch_number, batch.status, batch.assigned_user_id::text,
              batch.scheduled_at::text,
              COUNT(link.id)::int AS operation_count,
              COUNT(link.id) FILTER (WHERE linked.status = 'completed')::int AS completed_operation_count
       FROM public.warehouse_picking_batches batch
       LEFT JOIN public.warehouse_picking_batch_operations link
         ON link.batch_id = batch.id AND link.company_id = batch.company_id AND link.deleted_at IS NULL
       LEFT JOIN public.warehouse_operations linked
         ON linked.id = link.operation_id AND linked.company_id = batch.company_id AND linked.deleted_at IS NULL
       WHERE batch.company_id = $1 AND batch.deleted_at IS NULL
       GROUP BY batch.id
       ORDER BY batch.created_at DESC, batch.id DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT package.id::text, package.package_number, package.status, package.weight::text,
              package.current_location_id::text, location.name AS current_location_name
       FROM public.warehouse_packages package
       LEFT JOIN public.warehouse_locations location
         ON location.id = package.current_location_id AND location.company_id = package.company_id
        AND location.deleted_at IS NULL
       WHERE package.company_id = $1 AND package.deleted_at IS NULL
       ORDER BY package.created_at DESC, package.id DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT rule.id::text, rule.priority, rule.status, rule.product_reference::text,
              product.name AS product_name, rule.source_location_id::text, source.name AS source_name,
              rule.destination_location_id::text, destination.name AS destination_name
       FROM public.warehouse_putaway_rules rule
       INNER JOIN public.warehouse_locations destination
         ON destination.id = rule.destination_location_id AND destination.company_id = rule.company_id
        AND destination.deleted_at IS NULL
       LEFT JOIN public.warehouse_locations source
         ON source.id = rule.source_location_id AND source.company_id = rule.company_id
        AND source.deleted_at IS NULL
       LEFT JOIN public.products product
         ON product.id = rule.product_reference AND product.company_id = rule.company_id
        AND product.deleted_at IS NULL
       WHERE rule.company_id = $1 AND rule.deleted_at IS NULL
       ORDER BY rule.priority, rule.created_at DESC LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT id::text, name, sku
       FROM public.products
       WHERE company_id = $1 AND is_active = TRUE AND deleted_at IS NULL
       ORDER BY name, id LIMIT 200`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.warehouse_locations WHERE company_id=$1 AND status='active' AND deleted_at IS NULL) AS active_locations,
         (SELECT COUNT(*)::int FROM public.warehouse_operations WHERE company_id=$1 AND status IN ('active','in_progress') AND deleted_at IS NULL) AS open_operations,
         (SELECT COUNT(*)::int FROM public.warehouse_picking_batches WHERE company_id=$1 AND status IN ('ready','in_progress') AND deleted_at IS NULL) AS active_batches,
         (SELECT COUNT(*)::int FROM public.warehouse_packages WHERE company_id=$1 AND status IN ('open','packed','in_transit') AND deleted_at IS NULL) AS open_packages,
         (SELECT COUNT(*)::int FROM public.warehouse_putaway_rules WHERE company_id=$1 AND status='active' AND deleted_at IS NULL) AS active_putaway_rules`,
      [context.companyId],
    ),
  ]);

  const summary = summaryRows.rows[0] || {};
  return {
    summary: {
      activeLocations: Number(summary.active_locations || 0),
      openOperations: Number(summary.open_operations || 0),
      activePickingBatches: Number(summary.active_batches || 0),
      openPackages: Number(summary.open_packages || 0),
      activePutawayRules: Number(summary.active_putaway_rules || 0),
    },
    locations: locationRows.rows.map((row) => ({
      id: String(row.id), name: String(row.name), code: String(row.code),
      locationType: String(row.location_type), status: String(row.status),
      parentLocationId: row.parent_location_id == null ? null : String(row.parent_location_id),
      parentName: row.parent_name == null ? null : String(row.parent_name),
    })),
    operations: operationRows.rows.map((row) => ({
      id: String(row.id), operationNumber: String(row.operation_number),
      operationType: String(row.operation_type), status: String(row.status),
      reference: row.reference == null ? null : String(row.reference),
      sourceLocationId: row.source_location_id == null ? null : String(row.source_location_id),
      sourceName: row.source_name == null ? null : String(row.source_name),
      destinationLocationId: row.destination_location_id == null ? null : String(row.destination_location_id),
      destinationName: row.destination_name == null ? null : String(row.destination_name),
      lineCount: Number(row.line_count || 0), createdAt: String(row.created_at),
    })),
    pickingBatches: batchRows.rows.map((row) => ({
      id: String(row.id), batchNumber: String(row.batch_number), status: String(row.status),
      assignedUserId: row.assigned_user_id == null ? null : String(row.assigned_user_id),
      scheduledAt: row.scheduled_at == null ? null : String(row.scheduled_at),
      operationCount: Number(row.operation_count || 0),
      completedOperationCount: Number(row.completed_operation_count || 0),
    })),
    packages: packageRows.rows.map((row) => ({
      id: String(row.id), packageNumber: String(row.package_number), status: String(row.status),
      weight: String(row.weight), currentLocationId: row.current_location_id == null ? null : String(row.current_location_id),
      currentLocationName: row.current_location_name == null ? null : String(row.current_location_name),
    })),
    putawayRules: ruleRows.rows.map((row) => ({
      id: String(row.id), priority: Number(row.priority), status: String(row.status),
      productReference: row.product_reference == null ? null : String(row.product_reference),
      productName: row.product_name == null ? null : String(row.product_name),
      sourceLocationId: row.source_location_id == null ? null : String(row.source_location_id),
      sourceName: row.source_name == null ? null : String(row.source_name),
      destinationLocationId: String(row.destination_location_id), destinationName: String(row.destination_name),
    })),
    products: productRows.rows.map((row) => ({
      id: String(row.id), name: String(row.name), sku: row.sku == null ? null : String(row.sku),
    })),
  };
}

async function createLocation(body: Record<string, unknown>) {
  const name = requiredText(body.name, 'Location name', 200);
  const code = requiredText(body.code, 'Location code', 80).toUpperCase();
  const locationType = requiredText(body.locationType || 'internal', 'Location type', 50).toLowerCase();
  const allowedTypes = new Set(['internal', 'receiving', 'quality', 'storage', 'picking', 'packing', 'output', 'virtual']);
  if (!allowedTypes.has(locationType)) throw new WarehouseInputError('Choose a supported location type.');
  const parentId = uuid(body.parentLocationId, 'Parent location', true);
  const context = await getContext([
    { table: 'warehouse_locations', operation: 'create' },
    { table: 'warehouse_locations', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    if (parentId) await assertLocations(client, context.companyId, [parentId]);
    // Serialize code creation by company and case-folded code, even when a
    // legacy duplicate prevents the unique index from being created safely.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [context.companyId + ':' + code.toLowerCase()],
    );
    const duplicate = await client.query(
      `SELECT id FROM public.warehouse_locations
       WHERE company_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [context.companyId, code],
    );
    if (duplicate.rows.length) throw new WarehouseConflictError('A location with this code already exists.');
    const result = await client.query(
      `INSERT INTO public.warehouse_locations
       (company_id, name, code, parent_location_id, location_type, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$6) RETURNING id::text`,
      [context.companyId, name, code, parentId, locationType, context.userId],
    );
    return { locationId: String(result.rows[0].id), status: 'active' };
  });
}

async function createOperation(body: Record<string, unknown>) {
  const operationType = requiredText(body.operationType, 'Operation type', 50).toLowerCase();
  if (!new Set(['putaway', 'relocate', 'pick', 'pack', 'replenish', 'receive', 'count']).has(operationType)) {
    throw new WarehouseInputError('Choose a supported warehouse operation type.');
  }
  const sourceId = uuid(body.sourceLocationId, 'Source location', true);
  const destinationId = uuid(body.destinationLocationId, 'Destination location', true);
  if (!sourceId && !destinationId) throw new WarehouseInputError('Choose a source or destination location.');
  if (sourceId && destinationId && sourceId === destinationId) throw new WarehouseInputError('Source and destination locations must differ.');
  const reference = optionalText(body.reference, 'Reference', 255);
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) {
    throw new WarehouseInputError('Add between 1 and 100 product lines.');
  }
  const lines = body.lines.map((item, index) => {
    const line = objectInput(item);
    return {
      productReference: uuid(line.productReference, 'Product on line ' + (index + 1)) as string,
      quantity: quantity(line.quantity),
      lotReference: optionalText(line.lotReference, 'Lot reference', 120),
    };
  });
  const productIds = lines.map((line) => line.productReference);
  const context = await getContext([
    { table: 'warehouse_operations', operation: 'create' },
    { table: 'warehouse_operation_lines', operation: 'create' },
    { table: 'warehouse_locations', operation: 'view' },
    { moduleKey: 'inventory', table: 'products', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    await assertLocations(client, context.companyId, [sourceId, destinationId].filter(Boolean) as string[]);
    await assertProducts(client, context.companyId, productIds);
    const operationId = randomUUID();
    const result = await client.query(
      `INSERT INTO public.warehouse_operations
       (id, company_id, operation_type, source_location_id, destination_location_id, reference,
        status, created_by, updated_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$7,'{}'::jsonb)
       RETURNING id::text`,
      [operationId, context.companyId, operationType, sourceId, destinationId, reference, context.userId],
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO public.warehouse_operation_lines
         (company_id, operation_id, product_reference, quantity, lot_reference, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$6)`,
        [context.companyId, operationId, line.productReference, line.quantity, line.lotReference, context.userId],
      );
    }
    return { operationId: String(result.rows[0].id), status: 'active', lineCount: lines.length };
  });
}

async function transitionOperation(body: Record<string, unknown>) {
  const operationId = uuid(body.operationId, 'Operation') as string;
  const action = requiredText(body.action, 'Action', 40);
  if (!new Set(['start-operation', 'complete-operation', 'cancel-operation']).has(action)) {
    throw new WarehouseInputError('Choose a supported operation action.');
  }
  const context = await getContext([
    { table: 'warehouse_operations', operation: 'edit' },
    { table: 'warehouse_operation_lines', operation: 'edit' },
  ]);
  return transaction(context, async (client) => {
    const found = await client.query(
      `SELECT id::text, status FROM public.warehouse_operations
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [operationId, context.companyId],
    );
    if (!found.rows.length) throw new WarehouseConflictError('Operation not found in this company.');
    const status = String(found.rows[0].status);
    if (action === 'start-operation') {
      if (status === 'in_progress') return { operationId, status, duplicate: true };
      if (status !== 'active') throw new WarehouseConflictError('Only planned operations can be started.');
      await client.query(
        `UPDATE public.warehouse_operations SET status='in_progress', updated_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='active'`,
        [operationId, context.companyId, context.userId],
      );
      return { operationId, status: 'in_progress', duplicate: false };
    }
    if (action === 'complete-operation') {
      if (status === 'completed') return { operationId, status, duplicate: true };
      if (status !== 'in_progress') throw new WarehouseConflictError('Start an operation before completing it.');
      await client.query(
        `UPDATE public.warehouse_operation_lines SET status='completed', updated_by=$3, updated_at=NOW()
         WHERE operation_id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='active'`,
        [operationId, context.companyId, context.userId],
      );
      await client.query(
        `UPDATE public.warehouse_operations SET status='completed', completed_at=NOW(), updated_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='in_progress'`,
        [operationId, context.companyId, context.userId],
      );
      return { operationId, status: 'completed', duplicate: false };
    }
    if (status === 'cancelled') return { operationId, status, duplicate: true };
    if (!['active', 'in_progress'].includes(status)) throw new WarehouseConflictError('Only unfinished operations can be cancelled.');
    await client.query(
      `UPDATE public.warehouse_operation_lines SET status='cancelled', updated_by=$3, updated_at=NOW()
       WHERE operation_id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='active'`,
      [operationId, context.companyId, context.userId],
    );
    await client.query(
      `UPDATE public.warehouse_operations SET status='cancelled', updated_by=$3, updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [operationId, context.companyId, context.userId],
    );
    return { operationId, status: 'cancelled', duplicate: false };
  });
}

async function createPutawayRule(body: Record<string, unknown>) {
  const destinationLocationId = uuid(body.destinationLocationId, 'Destination location') as string;
  const sourceLocationId = uuid(body.sourceLocationId, 'Source location', true);
  const productReference = uuid(body.productReference, 'Product', true);
  const priority = integer(body.priority, 'Priority', 100);
  const context = await getContext([
    { table: 'warehouse_putaway_rules', operation: 'create' },
    { table: 'warehouse_locations', operation: 'view' },
    { moduleKey: 'inventory', table: 'products', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    await assertLocations(client, context.companyId, [destinationLocationId, sourceLocationId].filter(Boolean) as string[]);
    if (productReference) await assertProducts(client, context.companyId, [productReference]);
    const result = await client.query(
      `INSERT INTO public.warehouse_putaway_rules
       (company_id, product_reference, source_location_id, destination_location_id, priority, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$6) RETURNING id::text`,
      [context.companyId, productReference, sourceLocationId, destinationLocationId, priority, context.userId],
    );
    return { ruleId: String(result.rows[0].id), status: 'active' };
  });
}

async function createPickingBatch(body: Record<string, unknown>) {
  const requestedAssignee = uuid(body.assignedUserId, 'Assigned user', true);
  const scheduledAt = optionalText(body.scheduledAt, 'Scheduled time', 40);
  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) throw new WarehouseInputError('Scheduled time is invalid.');
  const context = await getContext([{ table: 'warehouse_picking_batches', operation: 'create' }]);
  if (requestedAssignee && requestedAssignee !== context.userId) {
    throw new WarehouseInputError('You can only assign a picking batch to your own account in this workflow.');
  }
  const assignedUserId = requestedAssignee || context.userId;
  const batchNumber = warehouseNumber('PICK');
  const result = await context.pool.query(
    `INSERT INTO public.warehouse_picking_batches
     (company_id, batch_number, assigned_user_id, scheduled_at, status, created_by, updated_by)
     VALUES ($1,$2,$3,$4,'draft',$5,$5) RETURNING id::text`,
    [context.companyId, batchNumber, assignedUserId, scheduledAt, context.userId],
  );
  return { batchId: String(result.rows[0].id), batchNumber, status: 'draft' };
}

async function linkPickingOperation(body: Record<string, unknown>) {
  const batchId = uuid(body.batchId, 'Picking batch') as string;
  const operationId = uuid(body.operationId, 'Operation') as string;
  const context = await getContext([
    { table: 'warehouse_picking_batches', operation: 'edit' },
    { table: 'warehouse_picking_batch_operations', operation: 'create' },
    { table: 'warehouse_operations', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    const [batch, operation] = await Promise.all([
      client.query(
        `SELECT status FROM public.warehouse_picking_batches
         WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [batchId, context.companyId],
      ),
      client.query(
        `SELECT operation_type, status FROM public.warehouse_operations
         WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR SHARE`,
        [operationId, context.companyId],
      ),
    ]);
    if (!batch.rows.length || !operation.rows.length) throw new WarehouseConflictError('Choose a picking batch and operation in this company.');
    if (!['draft','ready'].includes(String(batch.rows[0].status))) throw new WarehouseConflictError('Only draft or ready batches can be changed.');
    if (String(operation.rows[0].operation_type) !== 'pick') throw new WarehouseInputError('Only pick operations can join a picking batch.');
    const result = await client.query(
      `INSERT INTO public.warehouse_picking_batch_operations
       (company_id, batch_id, operation_id, sequence, status, created_by, updated_by)
       VALUES ($1,$2,$3,1,'active',$4,$4)
       ON CONFLICT (company_id, batch_id, operation_id) WHERE deleted_at IS NULL
       DO NOTHING RETURNING id::text`,
      [context.companyId, batchId, operationId, context.userId],
    );
    return { batchId, operationId, duplicate: result.rows.length === 0 };
  });
}

async function transitionPickingBatch(body: Record<string, unknown>) {
  const batchId = uuid(body.batchId, 'Picking batch') as string;
  const action = requiredText(body.action, 'Action', 30);
  if (!new Set(['ready-batch', 'start-batch', 'complete-batch', 'cancel-batch']).has(action)) {
    throw new WarehouseInputError('Choose a supported picking batch action.');
  }
  const context = await getContext([
    { table: 'warehouse_picking_batches', operation: 'edit' },
    { table: 'warehouse_picking_batch_operations', operation: 'edit' },
    { table: 'warehouse_operations', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    const found = await client.query(
      `SELECT id::text, status FROM public.warehouse_picking_batches
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [batchId, context.companyId],
    );
    if (!found.rows.length) throw new WarehouseConflictError('Picking batch not found in this company.');
    const status = String(found.rows[0].status);
    if (action === 'ready-batch') {
      if (status === 'ready') return { batchId, status, duplicate: true };
      if (status !== 'draft') throw new WarehouseConflictError('Only draft batches can be marked ready.');
      const count = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.warehouse_picking_batch_operations
         WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL AND status='active'`,
        [context.companyId, batchId],
      );
      if (Number(count.rows[0]?.count || 0) < 1) throw new WarehouseConflictError('Add at least one pick operation before releasing the batch.');
      await client.query(
        `UPDATE public.warehouse_picking_batches SET status='ready', updated_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='draft'`,
        [batchId, context.companyId, context.userId],
      );
      return { batchId, status: 'ready', duplicate: false };
    }
    if (action === 'start-batch') {
      if (status === 'in_progress') return { batchId, status, duplicate: true };
      if (status !== 'ready') throw new WarehouseConflictError('Release the batch before starting work.');
      await client.query(
        `UPDATE public.warehouse_picking_batches SET status='in_progress', started_at=NOW(), updated_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='ready'`,
        [batchId, context.companyId, context.userId],
      );
      return { batchId, status: 'in_progress', duplicate: false };
    }
    if (action === 'complete-batch') {
      if (status === 'completed') return { batchId, status, duplicate: true };
      if (status !== 'in_progress') throw new WarehouseConflictError('Start a picking batch before completing it.');
      const incomplete = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM public.warehouse_picking_batch_operations link
         INNER JOIN public.warehouse_operations operation
           ON operation.id=link.operation_id AND operation.company_id=link.company_id
         WHERE link.company_id=$1 AND link.batch_id=$2 AND link.deleted_at IS NULL
           AND link.status='active' AND operation.status <> 'completed'`,
        [context.companyId, batchId],
      );
      if (Number(incomplete.rows[0]?.count || 0) > 0) throw new WarehouseConflictError('Complete every linked pick operation before closing the batch.');
      await client.query(
        `UPDATE public.warehouse_picking_batch_operations SET status='completed', updated_by=$3, updated_at=NOW()
         WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL AND status='active'`,
        [context.companyId, batchId, context.userId],
      );
      await client.query(
        `UPDATE public.warehouse_picking_batches SET status='completed', completed_at=NOW(), updated_by=$3, updated_at=NOW()
         WHERE id=$1 AND company_id=$2`,
        [batchId, context.companyId, context.userId],
      );
      return { batchId, status: 'completed', duplicate: false };
    }
    if (status === 'cancelled') return { batchId, status, duplicate: true };
    if (!['draft','ready'].includes(status)) throw new WarehouseConflictError('Only draft or ready batches can be cancelled.');
    await client.query(
      `UPDATE public.warehouse_picking_batch_operations SET status='cancelled', updated_by=$3, updated_at=NOW()
       WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL AND status='active'`,
      [context.companyId, batchId, context.userId],
    );
    await client.query(
      `UPDATE public.warehouse_picking_batches SET status='cancelled', updated_by=$3, updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [batchId, context.companyId, context.userId],
    );
    return { batchId, status: 'cancelled', duplicate: false };
  });
}

async function createPackage(body: Record<string, unknown>) {
  const packageNumber = requiredText(body.packageNumber || warehouseNumber('PKG'), 'Package number', 120).toUpperCase();
  const currentLocationId = uuid(body.currentLocationId, 'Current location', true);
  const weight = body.weight == null || body.weight === '' ? '0.0000' : (() => {
    const raw = typeof body.weight === 'number' && Number.isFinite(body.weight) ? String(body.weight) : String(body.weight).trim();
    if (!/^\d+(?:\.\d{1,4})?$/.test(raw) || Number(raw) < 0 || Number(raw) > 1_000_000_000) {
      throw new WarehouseInputError('Weight must be non-negative and have up to four decimal places.');
    }
    return Number(raw).toFixed(4);
  })();
  const context = await getContext([
    { table: 'warehouse_packages', operation: 'create' },
    { table: 'warehouse_locations', operation: 'view' },
  ]);
  if (currentLocationId) {
    const result = await context.pool.query(
      `SELECT id FROM public.warehouse_locations
       WHERE id=$1 AND company_id=$2 AND status='active' AND deleted_at IS NULL`,
      [currentLocationId, context.companyId],
    );
    if (!result.rows.length) throw new WarehouseConflictError('Choose an active package location in this company.');
  }
  const result = await context.pool.query(
    `INSERT INTO public.warehouse_packages
     (company_id, package_number, current_location_id, weight, status, created_by, updated_by)
     VALUES ($1,$2,$3,$4,'open',$5,$5) RETURNING id::text`,
    [context.companyId, packageNumber, currentLocationId, weight, context.userId],
  );
  return { packageId: String(result.rows[0].id), packageNumber, status: 'open' };
}

async function transitionPackage(body: Record<string, unknown>) {
  const packageId = uuid(body.packageId, 'Package') as string;
  const targetStatus = requiredText(body.status, 'Package status', 30);
  const transitions: Record<string, string[]> = {
    open: ['packed', 'cancelled'],
    packed: ['in_transit', 'cancelled'],
    in_transit: ['delivered'],
  };
  const context = await getContext([{ table: 'warehouse_packages', operation: 'edit' }]);
  return transaction(context, async (client) => {
    const found = await client.query(
      `SELECT status FROM public.warehouse_packages
       WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [packageId, context.companyId],
    );
    if (!found.rows.length) throw new WarehouseConflictError('Package not found in this company.');
    const status = String(found.rows[0].status);
    if (status === targetStatus) return { packageId, status, duplicate: true };
    if (!transitions[status]?.includes(targetStatus)) {
      throw new WarehouseConflictError('That package status transition is not allowed.');
    }
    await client.query(
      `UPDATE public.warehouse_packages SET status=$3, updated_by=$4, updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [packageId, context.companyId, targetStatus, context.userId],
    );
    return { packageId, status: targetStatus, duplicate: false };
  });
}

export async function runWarehouseAction(input: unknown) {
  const body = objectInput(input);
  const action = requiredText(body.action, 'Action', 40);
  switch (action) {
    case 'create-location': return createLocation(body);
    case 'create-operation': return createOperation(body);
    case 'start-operation':
    case 'complete-operation':
    case 'cancel-operation': return transitionOperation(body);
    case 'create-putaway-rule': return createPutawayRule(body);
    case 'create-picking-batch': return createPickingBatch(body);
    case 'link-picking-operation': return linkPickingOperation(body);
    case 'ready-batch':
    case 'start-batch':
    case 'complete-batch':
    case 'cancel-batch': return transitionPickingBatch(body);
    case 'create-package': return createPackage(body);
    case 'transition-package': return transitionPackage(body);
    default: throw new WarehouseInputError('Choose a supported Warehouse action.');
  }
}
