import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export class ShippingInputError extends Error {
  constructor(message: string) { super(message); this.name = 'ShippingInputError'; }
}
export class ShippingConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'ShippingConflictError'; }
}

export type ShippingStatus = 'draft' | 'ready' | 'in_transit' | 'delivered' | 'exception' | 'cancelled';
const SHIPMENT_STATUSES = new Set<ShippingStatus>(['draft','ready','in_transit','delivered','exception','cancelled']);
const ALLOWED_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  draft: ['ready','cancelled'],
  ready: ['in_transit','exception','cancelled'],
  in_transit: ['delivered','exception'],
  delivered: [],
  exception: ['in_transit','delivered','cancelled'],
  cancelled: [],
};
const MILESTONE_TYPES = new Set([
  'label_registered','carrier_handoff','carrier_scan','out_for_delivery',
  'delivery_attempt','delay','customer_contacted',
]);

function objectInput(value: unknown, label = 'Shipping input'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShippingInputError(label + ' must be an object.');
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string') throw new ShippingInputError(label + ' is required.');
  const result = value.trim();
  if (!result) throw new ShippingInputError(label + ' is required.');
  if (result.length > max) throw new ShippingInputError(label + ' is too long.');
  return result;
}
function optionalText(value: unknown, label: string, max = 255): string | null {
  if (value == null || value === '') return null;
  return requiredText(value, label, max);
}
function numberValue(value: unknown, label: string, max = 10000000): number | null {
  if (value == null || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result) || result < 0 || result > max) throw new ShippingInputError(label + ' must be a non-negative valid number.');
  return result;
}
function optionalId(value: unknown, label: string): string | null {
  if (value == null || value === '') return null;
  const result = requiredText(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new ShippingInputError(label + ' must be a valid record identifier.');
  }
  return result;
}
function addressInput(value: unknown) {
  const item = objectInput(value, 'Recipient address');
  const address = {
    line1: optionalText(item.line1, 'Address line 1', 255),
    line2: optionalText(item.line2, 'Address line 2', 255),
    city: optionalText(item.city, 'City', 120),
    region: optionalText(item.region, 'Region / county', 120),
    postalCode: optionalText(item.postalCode, 'Postal code', 32),
    country: optionalText(item.country, 'Country', 120),
  };
  if (!address.line1 || !address.city || !address.country) {
    throw new ShippingInputError('Recipient address needs line 1, city and country.');
  }
  return address;
}
async function getContext(
  tables: Array<{ table: string; operation: 'view' | 'create' | 'edit' }>,
) {
  const contexts = await Promise.all(tables.map(({ table, operation }) =>
    requireEnterpriseModuleTableContext('shipping', table, operation),
  ));
  const first = contexts[0];
  if (!first || contexts.some((item) =>
    item.companyId !== first.companyId || item.tenantId !== first.tenantId || item.userId !== first.userId
  )) {
    throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Your selected company changed. Reload Shipping and try again.');
  }
  return first;
}
async function withTransaction<T>(
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
function trackingUrl(template: unknown, trackingNumber: string | null): string | null {
  if (typeof template !== 'string' || !trackingNumber || !template.includes('{tracking_number}')) return null;
  const rendered = template.replaceAll('{tracking_number}', encodeURIComponent(trackingNumber));
  try {
    const parsed = new URL(rendered);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
function shipmentNumber(value: unknown): string {
  if (value != null && value !== '') return requiredText(value, 'Shipment number', 100).toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return 'SHP-' + date + '-' + randomUUID().slice(0, 8).toUpperCase();
}
function validStatus(value: unknown): ShippingStatus {
  const status = requiredText(value, 'Shipment status', 32) as ShippingStatus;
  if (!SHIPMENT_STATUSES.has(status)) throw new ShippingInputError('Choose a supported shipment status.');
  return status;
}

export type ShippingCarrier = { id: string; name: string; providerKey: string | null; trackingUrlTemplate: string | null };
export type ShippingShipment = {
  id: string; shipmentNumber: string; recipientName: string | null; city: string | null; country: string | null;
  trackingNumber: string | null; carrierId: string | null; carrierName: string | null; trackingUrl: string | null;
  status: ShippingStatus; packageCount: number; sourceReference: string | null; createdAt: string;
  shippedAt: string | null; deliveredAt: string | null;
};
export type ShippingEvent = {
  id: string; shipmentId: string; shipmentNumber: string; eventType: string; location: string | null;
  message: string | null; occurredAt: string;
};
export type ShippingOverview = {
  summary: {
    totalShipments: number; draftShipments: number; readyShipments: number; inTransitShipments: number;
    deliveredShipments: number; exceptions: number; activeCarriers: number; activeLabels: number;
  };
  carriers: ShippingCarrier[];
  shipments: ShippingShipment[];
  recentEvents: ShippingEvent[];
};

const overviewTables = [
  { table: 'shipments', operation: 'view' as const },
  { table: 'shipment_packages', operation: 'view' as const },
  { table: 'shipment_events', operation: 'view' as const },
  { table: 'shipping_carriers', operation: 'view' as const },
  { table: 'shipping_labels', operation: 'view' as const },
];

export async function getShippingOverview(): Promise<ShippingOverview> {
  const context = await getContext(overviewTables);
  const [summary, carriers, shipments, events, labels] = await Promise.all([
    context.pool.query([
      'SELECT COUNT(*)::int AS total,',
      " COUNT(*) FILTER (WHERE status IN ('draft','active'))::int AS draft,",
      " COUNT(*) FILTER (WHERE status='ready')::int AS ready,",
      " COUNT(*) FILTER (WHERE status='in_transit')::int AS in_transit,",
      " COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,",
      " COUNT(*) FILTER (WHERE status='exception')::int AS exceptions,",
      " (SELECT COUNT(*)::int FROM public.shipping_carriers WHERE company_id=$1 AND status='active' AND deleted_at IS NULL) AS active_carriers",
      'FROM public.shipments WHERE company_id=$1 AND deleted_at IS NULL',
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT id::text, name, provider_key, tracking_url_template',
      'FROM public.shipping_carriers',
      "WHERE company_id=$1 AND status='active' AND deleted_at IS NULL",
      'ORDER BY lower(name), id LIMIT 100',
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT shipment.id::text, shipment.shipment_number, shipment.recipient_name,',
      " shipment.recipient_address->>'city' AS city, shipment.recipient_address->>'country' AS country,",
      ' shipment.tracking_number, shipment.carrier_id::text, carrier.name AS carrier_name,',
      ' carrier.tracking_url_template, shipment.status,',
      ' COUNT(parcel.id)::int AS package_count, shipment.metadata->>\'sourceReference\' AS source_reference,',
      ' shipment.created_at::text, shipment.shipped_at::text, shipment.delivered_at::text',
      'FROM public.shipments shipment',
      'LEFT JOIN public.shipping_carriers carrier ON carrier.id=shipment.carrier_id AND carrier.company_id=shipment.company_id AND carrier.deleted_at IS NULL',
      'LEFT JOIN public.shipment_packages parcel ON parcel.shipment_id=shipment.id AND parcel.company_id=shipment.company_id AND parcel.deleted_at IS NULL',
      'WHERE shipment.company_id=$1 AND shipment.deleted_at IS NULL',
      'GROUP BY shipment.id, carrier.id ORDER BY shipment.created_at DESC, shipment.id DESC LIMIT 50',
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT event.id::text, event.shipment_id::text, shipment.shipment_number,',
      ' event.event_type, event.location, event.message, event.occurred_at::text',
      'FROM public.shipment_events event',
      'JOIN public.shipments shipment ON shipment.id=event.shipment_id AND shipment.company_id=event.company_id',
      'WHERE event.company_id=$1 AND event.deleted_at IS NULL AND shipment.deleted_at IS NULL',
      'ORDER BY event.occurred_at DESC, event.id DESC LIMIT 40',
    ].join('\n'), [context.companyId]),
    context.pool.query("SELECT COUNT(*)::int AS total FROM public.shipping_labels WHERE company_id=$1 AND status <> 'cancelled' AND deleted_at IS NULL", [context.companyId]),
  ]);
  const s = summary.rows[0] || {};
  return {
    summary: {
      totalShipments: Number(s.total || 0), draftShipments: Number(s.draft || 0), readyShipments: Number(s.ready || 0),
      inTransitShipments: Number(s.in_transit || 0), deliveredShipments: Number(s.delivered || 0),
      exceptions: Number(s.exceptions || 0), activeCarriers: Number(s.active_carriers || 0),
      activeLabels: Number(labels.rows[0]?.total || 0),
    },
    carriers: carriers.rows.map((row) => ({
      id: String(row.id), name: String(row.name), providerKey: row.provider_key == null ? null : String(row.provider_key),
      trackingUrlTemplate: row.tracking_url_template == null ? null : String(row.tracking_url_template),
    })),
    shipments: shipments.rows.map((row) => ({
      id: String(row.id), shipmentNumber: String(row.shipment_number),
      recipientName: row.recipient_name == null ? null : String(row.recipient_name),
      city: row.city == null ? null : String(row.city), country: row.country == null ? null : String(row.country),
      trackingNumber: row.tracking_number == null ? null : String(row.tracking_number),
      carrierId: row.carrier_id == null ? null : String(row.carrier_id),
      carrierName: row.carrier_name == null ? null : String(row.carrier_name),
      trackingUrl: trackingUrl(row.tracking_url_template, row.tracking_number == null ? null : String(row.tracking_number)),
      status: SHIPMENT_STATUSES.has(row.status as ShippingStatus) ? row.status as ShippingStatus : 'draft',
      packageCount: Number(row.package_count || 0),
      sourceReference: row.source_reference == null ? null : String(row.source_reference),
      createdAt: String(row.created_at),
      shippedAt: row.shipped_at == null ? null : String(row.shipped_at),
      deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
    })),
    recentEvents: events.rows.map((row) => ({
      id: String(row.id), shipmentId: String(row.shipment_id), shipmentNumber: String(row.shipment_number),
      eventType: String(row.event_type), location: row.location == null ? null : String(row.location),
      message: row.message == null ? null : String(row.message), occurredAt: String(row.occurred_at),
    })),
  };
}

export async function createShippingShipment(input: unknown) {
  const body = objectInput(input);
  const number = shipmentNumber(body.shipmentNumber);
  const recipientName = requiredText(body.recipientName, 'Recipient name');
  const recipientAddress = addressInput(body.recipientAddress);
  const carrierId = optionalId(body.carrierId, 'Carrier');
  const trackingNumber = optionalText(body.trackingNumber, 'Tracking number');
  const sourceReference = optionalText(body.sourceReference, 'Order / source reference', 128);
  const trackingIntent = optionalText(body.trackingIntent, 'Tracking intent', 80);
  if (trackingIntent && !new Set<string>(['sales','warehouse','ecommerce','manual']).has(trackingIntent)) {
    throw new ShippingInputError('Choose a supported shipment origin.');
  }
  const sourceSystem = trackingIntent || 'manual';
  if (sourceSystem === 'warehouse' && !sourceReference) {
    throw new ShippingInputError('Enter the packed Warehouse package number when creating a shipment from Warehouse.');
  }
  const packageInput = body.packages == null ? [] : body.packages;
  if (!Array.isArray(packageInput) || packageInput.length > 50) throw new ShippingInputError('Add no more than 50 parcels to one shipment.');
  const parcels = packageInput.map((raw, index) => {
    const parcel = objectInput(raw, 'Parcel ' + (index + 1));
    return {
      weight: numberValue(parcel.weight, 'Parcel weight'),
      length: numberValue(parcel.length, 'Parcel length'),
      width: numberValue(parcel.width, 'Parcel width'),
      height: numberValue(parcel.height, 'Parcel height'),
      contents: optionalText(parcel.contents, 'Parcel contents', 500),
    };
  });
  const context = await getContext([
    { table: 'shipments', operation: 'create' },
    { table: 'shipment_packages', operation: 'create' },
    { table: 'shipment_events', operation: 'create' },
    { table: 'shipping_carriers', operation: 'view' },
  ]);
  let warehouseContext: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>> | null = null;
  if (sourceSystem === 'warehouse') {
    try {
      warehouseContext = await requireEnterpriseModuleTableContext('warehouse', 'warehouse_packages', 'view');
    } catch (error) {
      if (error instanceof EnterpriseModuleError) {
        throw new ShippingInputError('Install Warehouse and confirm you can view its packages before linking one to a shipment.');
      }
      throw error;
    }
    if (warehouseContext.companyId !== context.companyId || warehouseContext.tenantId !== context.tenantId || warehouseContext.userId !== context.userId) {
      throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Shipping and Warehouse must use the same selected company.');
    }
  }
  return withTransaction(context, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text || \':\' || lower($2), 0))', [context.companyId, number]);
    const duplicate = await client.query(
      'SELECT 1 FROM public.shipments WHERE company_id=$1 AND lower(shipment_number)=lower($2) AND deleted_at IS NULL LIMIT 1',
      [context.companyId, number],
    );
    if (duplicate.rows.length) throw new ShippingConflictError('That shipment number already exists in this company.');

    if (carrierId) {
      const carrier = await client.query(
        "SELECT 1 FROM public.shipping_carriers WHERE id=$1 AND company_id=$2 AND status='active' AND deleted_at IS NULL",
        [carrierId, context.companyId],
      );
      if (!carrier.rows.length) throw new ShippingInputError('Choose an active carrier in this company.');
    }

    let sourceWarehousePackageId: string | null = null;
    let sourceWarehousePackageNumber: string | null = null;
    if (warehouseContext && sourceReference) {
      const packageResult = await client.query(
        'SELECT id::text, package_number, status FROM public.warehouse_packages WHERE company_id=$1 AND (id::text=$2 OR lower(package_number)=lower($2)) AND deleted_at IS NULL LIMIT 1 FOR UPDATE',
        [context.companyId, sourceReference],
      );
      if (!packageResult.rows.length) throw new ShippingInputError('The Warehouse package reference was not found in this company.');
      if (packageResult.rows[0].status !== 'packed') {
        throw new ShippingConflictError('Only a packed Warehouse package can be linked to a new shipment.');
      }
      sourceWarehousePackageId = String(packageResult.rows[0].id);
      sourceWarehousePackageNumber = String(packageResult.rows[0].package_number);
    }
    const inserted = await client.query([
      'INSERT INTO public.shipments',
      '(company_id, carrier_id, shipment_number, recipient_name, recipient_address, tracking_number, status, created_by, updated_by, metadata)',
      "VALUES ($1,$2,$3,$4,$5::jsonb,$6,'draft',$7,$7,$8::jsonb)",
      'RETURNING id::text, shipment_number, created_at::text',
    ].join('\n'), [
      context.companyId, carrierId, number, recipientName, JSON.stringify(recipientAddress),
      trackingNumber, context.userId, JSON.stringify({ sourceReference, sourceSystem, sourceWarehousePackageId, sourceWarehousePackageNumber, trackingIntent: trackingIntent || null }),
    ]);
    const row = inserted.rows[0];
    for (const parcel of parcels) {
      await client.query([
        'INSERT INTO public.shipment_packages',
        '(company_id, shipment_id, weight, length, width, height, contents, status, created_by, updated_by)',
        "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'prepared',$8,$8)",
      ].join('\n'), [
        context.companyId, row.id, parcel.weight, parcel.length, parcel.width, parcel.height,
        JSON.stringify(parcel.contents ? [parcel.contents] : []), context.userId,
      ]);
    }
    await client.query([
      'INSERT INTO public.shipment_events (company_id, shipment_id, event_type, location, message, created_by, updated_by)',
      "VALUES ($1,$2,'shipment_created',NULL,$3,$4,$4)",
    ].join('\n'), [
      context.companyId, row.id,
      'Shipment created in SaMi. Carrier booking and label purchase are not performed automatically.',
      context.userId,
    ]);
    return { id: String(row.id), shipmentNumber: String(row.shipment_number), packageCount: parcels.length, createdAt: String(row.created_at) };
  });
}

export async function transitionShippingShipment(input: unknown) {
  const body = objectInput(input);
  const id = optionalId(body.shipmentId, 'Shipment');
  if (!id) throw new ShippingInputError('Choose a shipment to update.');
  const target = validStatus(body.status);
  const location = optionalText(body.location, 'Milestone location', 255);
  const message = optionalText(body.message, 'Milestone note', 1000);
  const context = await getContext([
    { table: 'shipments', operation: 'edit' },
    { table: 'shipment_events', operation: 'create' },
  ]);
  return withTransaction(context, async (client) => {
    const found = await client.query(
      'SELECT status, metadata FROM public.shipments WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',
      [context.companyId, id],
    );
    if (!found.rows.length) throw new ShippingConflictError('Shipment not found in the selected company.');
    const storedStatus = String(found.rows[0].status || 'draft');
    const current = (storedStatus === 'active' ? 'draft' : storedStatus) as ShippingStatus;
    if (!SHIPMENT_STATUSES.has(current) || !ALLOWED_TRANSITIONS[current].includes(target)) {
      throw new ShippingConflictError('That shipment status transition is not allowed. Refresh and choose an available next step.');
    }
    const metadata = found.rows[0].metadata && typeof found.rows[0].metadata === 'object'
      ? found.rows[0].metadata as Record<string, unknown> : {};
    const linkedWarehousePackageId = typeof metadata.sourceWarehousePackageId === 'string'
      ? metadata.sourceWarehousePackageId : null;
    if (linkedWarehousePackageId && (target === 'in_transit' || target === 'delivered')) {
      let warehouseContext: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;
      try {
        warehouseContext = await requireEnterpriseModuleTableContext('warehouse', 'warehouse_packages', 'edit');
      } catch (error) {
        if (error instanceof EnterpriseModuleError) {
          throw new ShippingInputError('Your role needs Warehouse package edit access to advance a shipment linked to a Warehouse package.');
        }
        throw error;
      }
      if (warehouseContext.companyId !== context.companyId || warehouseContext.tenantId !== context.tenantId || warehouseContext.userId !== context.userId) {
        throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Shipping and Warehouse must use the same selected company.');
      }
      const expectedWarehouseStatus = target === 'in_transit' ? 'packed' : 'in_transit';
      const linkedUpdate = await client.query(
        'UPDATE public.warehouse_packages SET status=$3, updated_by=$4, updated_at=NOW() WHERE company_id=$1 AND id=$2 AND status=$5 AND deleted_at IS NULL RETURNING id',
        [context.companyId, linkedWarehousePackageId, target, context.userId, expectedWarehouseStatus],
      );
      if (!linkedUpdate.rows.length) {
        throw new ShippingConflictError('The linked Warehouse package is not in the expected ' + expectedWarehouseStatus + ' state. Refresh the package before advancing this shipment.');
      }
    }
    const updated = await client.query([
      'UPDATE public.shipments SET status=$3,',
      " shipped_at=CASE WHEN $3='in_transit' THEN COALESCE(shipped_at,NOW()) ELSE shipped_at END,",
      " delivered_at=CASE WHEN $3='delivered' THEN COALESCE(delivered_at,NOW()) ELSE delivered_at END,",
      ' updated_by=$4, updated_at=NOW()',
      'WHERE company_id=$1 AND id=$2',
      'RETURNING id::text, shipment_number, status',
    ].join('\n'), [context.companyId, id, target, context.userId]);
    await client.query([
      'INSERT INTO public.shipment_events (company_id, shipment_id, event_type, location, message, created_by, updated_by)',
      'VALUES ($1,$2,$3,$4,$5,$6,$6)',
    ].join('\n'), [
      context.companyId, id, 'status_' + target, location,
      message || ('Shipment status changed from ' + current + ' to ' + target + '.'), context.userId,
    ]);
    return { id: String(updated.rows[0].id), shipmentNumber: String(updated.rows[0].shipment_number), status: target };
  });
}

export async function recordShippingMilestone(input: unknown) {
  const body = objectInput(input);
  const shipmentId = optionalId(body.shipmentId, 'Shipment');
  if (!shipmentId) throw new ShippingInputError('Choose a shipment.');
  const eventType = requiredText(body.eventType, 'Milestone type', 80);
  if (!MILESTONE_TYPES.has(eventType)) throw new ShippingInputError('Choose a supported tracking milestone.');
  const location = optionalText(body.location, 'Milestone location', 255);
  const message = optionalText(body.message, 'Milestone note', 1000);
  if (!message && eventType !== 'carrier_scan') throw new ShippingInputError('Add a short note describing the carrier milestone.');
  const context = await getContext([{ table: 'shipments', operation: 'view' }, { table: 'shipment_events', operation: 'create' }]);
  return withTransaction(context, async (client) => {
    const found = await client.query(
      'SELECT 1 FROM public.shipments WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL',
      [context.companyId, shipmentId],
    );
    if (!found.rows.length) throw new ShippingConflictError('Shipment not found in the selected company.');
    const inserted = await client.query([
      'INSERT INTO public.shipment_events (company_id, shipment_id, event_type, location, message, created_by, updated_by)',
      'VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id::text, occurred_at::text',
    ].join('\n'), [context.companyId, shipmentId, eventType, location, message, context.userId]);
    return { id: String(inserted.rows[0].id), occurredAt: String(inserted.rows[0].occurred_at) };
  });
}
