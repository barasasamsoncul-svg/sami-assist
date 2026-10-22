import 'server-only';

import type { PoolClient } from 'pg';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';

export class BarcodeInputError extends Error {
  constructor(message: string) { super(message); this.name = 'BarcodeInputError'; }
}
type ScanIntent = 'lookup' | 'receive' | 'pick' | 'count' | 'pack' | 'dispatch' | 'return';
const SCAN_INTENTS = new Set<ScanIntent>(['lookup','receive','pick','count','pack','dispatch','return']);

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BarcodeInputError('Enter a valid Barcode scan.');
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string') throw new BarcodeInputError(label + ' is required.');
  const result = value.trim();
  if (!result) throw new BarcodeInputError(label + ' is required.');
  if (result.length > max) throw new BarcodeInputError(label + ' is too long.');
  return result;
}
function optionalText(value: unknown, label: string, max = 255): string | null {
  if (value == null || value === '') return null;
  return requiredText(value, label, max);
}
async function contextForScan(operation: 'view' | 'create') {
  const contexts = await Promise.all([
    requireEnterpriseModuleTableContext('barcode', 'barcode_scan_events', operation),
    requireEnterpriseModuleTableContext('barcode', 'barcode_identifiers', 'view'),
    requireEnterpriseModuleTableContext('inventory', 'products', 'view'),
  ]);
  const first = contexts[0];
  if (contexts.some((item) =>
    item.companyId !== first.companyId || item.tenantId !== first.tenantId || item.userId !== first.userId
  )) {
    throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Your selected company changed. Reload Barcode and try again.');
  }
  return first;
}
async function transaction<T>(
  context: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
export type BarcodeScanEvent = {
  id: string; barcode: string; operation: string;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
  productName: string | null; sku: string | null; deviceReference: string | null; scannedAt: string;
};
export type BarcodeWorkspaceOverview = {
  summary: { totalScans: number; scansToday: number; matchedScans: number; unmatchedScans: number; ambiguousScans: number; productsWithBarcode: number };
  recentScans: BarcodeScanEvent[];
};
export async function getBarcodeWorkspaceOverview(): Promise<BarcodeWorkspaceOverview> {
  const context = await contextForScan('view');
  const [counts, products, recent] = await Promise.all([
    context.pool.query([
      'SELECT COUNT(*)::int AS total_scans,',
      " COUNT(*) FILTER (WHERE scanned_at >= date_trunc('day', NOW()))::int AS scans_today,",
      " COUNT(*) FILTER (WHERE payload->>'matchStatus' = 'matched')::int AS matched_scans,",
      " COUNT(*) FILTER (WHERE payload->>'matchStatus' = 'unmatched')::int AS unmatched_scans,",
      " COUNT(*) FILTER (WHERE payload->>'matchStatus' = 'ambiguous')::int AS ambiguous_scans",
      'FROM public.barcode_scan_events WHERE company_id = $1 AND deleted_at IS NULL',
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT COUNT(DISTINCT product.id)::int AS product_count FROM public.products product',
      'WHERE product.company_id = $1 AND product.is_active = TRUE AND product.deleted_at IS NULL',
      "AND (NULLIF(BTRIM(product.barcode), '') IS NOT NULL OR EXISTS (",
      ' SELECT 1 FROM public.barcode_identifiers identifier',
      " WHERE identifier.company_id = product.company_id AND identifier.entity_type = 'product'",
      " AND identifier.entity_id = product.id AND identifier.status = 'active' AND identifier.deleted_at IS NULL))",
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT event.id::text, event.barcode, COALESCE(event.operation,\'lookup\') AS operation,',
      " COALESCE(event.payload->>'matchStatus','unmatched') AS match_status,",
      " event.payload->>'productName' AS product_name, event.payload->>'sku' AS sku,",
      ' event.device_reference, event.scanned_at::text',
      'FROM public.barcode_scan_events event WHERE event.company_id = $1 AND event.deleted_at IS NULL',
      'ORDER BY event.scanned_at DESC, event.id DESC LIMIT 50',
    ].join('\n'), [context.companyId]),
  ]);
  const c = counts.rows[0] || {};
  return {
    summary: {
      totalScans: Number(c.total_scans || 0),
      scansToday: Number(c.scans_today || 0),
      matchedScans: Number(c.matched_scans || 0),
      unmatchedScans: Number(c.unmatched_scans || 0),
      ambiguousScans: Number(c.ambiguous_scans || 0),
      productsWithBarcode: Number(products.rows[0]?.product_count || 0),
    },
    recentScans: recent.rows.map((row) => ({
      id: String(row.id), barcode: String(row.barcode), operation: String(row.operation || 'lookup'),
      matchStatus: row.match_status === 'matched' || row.match_status === 'ambiguous' ? row.match_status : 'unmatched',
      productName: row.product_name == null ? null : String(row.product_name),
      sku: row.sku == null ? null : String(row.sku),
      deviceReference: row.device_reference == null ? null : String(row.device_reference),
      scannedAt: String(row.scanned_at),
    })),
  };
}

export async function recordBarcodeScan(input: unknown) {
  const body = objectInput(input);
  const barcode = requiredText(body.barcode, 'Barcode');
  const intentValue = body.operation == null ? 'lookup' : requiredText(body.operation, 'Scan intent', 32);
  if (!SCAN_INTENTS.has(intentValue as ScanIntent)) throw new BarcodeInputError('Choose a supported scan operation.');
  const intent = intentValue as ScanIntent;
  const deviceReference = optionalText(body.deviceReference, 'Device reference');
  const context = await contextForScan('create');
  return transaction(context, async (client) => {
    const result = await client.query([
      'SELECT product.id::text AS id, product.name, product.sku, product.barcode,',
      ' MIN(CASE WHEN lower(BTRIM(COALESCE(product.barcode,\'\'))) = lower($2) THEN 0',
      ' WHEN lower(BTRIM(COALESCE(identifier.barcode,\'\'))) = lower($2) THEN 1 ELSE 2 END) AS priority',
      'FROM public.products product LEFT JOIN public.barcode_identifiers identifier',
      ' ON identifier.company_id = product.company_id AND identifier.entity_type = \'product\'',
      ' AND identifier.entity_id = product.id AND identifier.status = \'active\' AND identifier.deleted_at IS NULL',
      'WHERE product.company_id = $1 AND product.is_active = TRUE AND product.deleted_at IS NULL',
      ' AND (lower(BTRIM(COALESCE(product.barcode,\'\'))) = lower($2)',
      ' OR lower(BTRIM(COALESCE(product.sku,\'\'))) = lower($2)',
      ' OR lower(BTRIM(COALESCE(identifier.barcode,\'\'))) = lower($2))',
      'GROUP BY product.id ORDER BY MIN(CASE',
      ' WHEN lower(BTRIM(COALESCE(product.barcode,\'\'))) = lower($2) THEN 0',
      ' WHEN lower(BTRIM(COALESCE(identifier.barcode,\'\'))) = lower($2) THEN 1 ELSE 2 END), product.name LIMIT 2',
    ].join('\n'), [context.companyId, barcode]);
    const matchStatus = result.rows.length === 1 ? 'matched' : result.rows.length > 1 ? 'ambiguous' : 'unmatched';
    const product = result.rows.length === 1 ? {
      id: String(result.rows[0].id), name: String(result.rows[0].name),
      sku: result.rows[0].sku == null ? null : String(result.rows[0].sku),
      barcode: result.rows[0].barcode == null ? null : String(result.rows[0].barcode),
    } : null;
    const payload = {
      source: 'barcode-workspace', matchStatus, matchCount: result.rows.length,
      productId: product?.id || null, productName: product?.name || null, sku: product?.sku || null,
      operationIntent: intent, effect: 'scan-only',
    };
    const saved = await client.query([
      'INSERT INTO public.barcode_scan_events (company_id, barcode, operation, scanned_by, device_reference, payload, status, created_by, updated_by)',
      "VALUES ($1,$2,$3,$4,$5,$6::jsonb,'active',$4,$4) RETURNING id::text, scanned_at::text",
    ].join('\n'), [
      context.companyId, barcode, intent, context.userId, deviceReference, JSON.stringify(payload),
    ]);
    const scan: BarcodeScanEvent = {
      id: String(saved.rows[0].id), barcode, operation: intent, matchStatus,
      productName: product?.name || null, sku: product?.sku || null,
      deviceReference, scannedAt: String(saved.rows[0].scanned_at),
    };
    const message = matchStatus === 'matched'
      ? 'Product matched. The scan was recorded in the company audit trail.'
      : matchStatus === 'ambiguous'
        ? 'More than one product matches this value. Resolve duplicate identifiers before using it operationally.'
        : 'No active product matched this value. The unmatched scan was retained for review.';
    return { scan, product, message };
  });
}
