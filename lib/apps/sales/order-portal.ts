import 'server-only';

import crypto from 'node:crypto';

import {
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

const PORTAL_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const PORTAL_LINK_TTL_DAYS = 90;

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Issues a one-time, read-only customer tracking link.
 * Only a SHA-256 token hash is stored; rotating a link invalidates the prior one.
 */
export async function createSalesOrderPortalLink(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.ORDER_MANAGE);
  const orderId = requireUuid(input.orderId, 'Sales order');
  const token = crypto.randomBytes(32).toString('hex');
  const hash = tokenHash(token);
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['sales-order-portal:' + context.companyId, orderId],
    );

    const order = await client.query(
      `SELECT id, order_number
       FROM sales_orders_v2
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [orderId, context.companyId],
    );
    if (!order.rows[0]) {
      throw new SalesError('ORDER_NOT_FOUND', 'Sales order was not found.');
    }

    const updated = await client.query(
      `UPDATE sales_orders_v2
       SET public_portal_token_hash = $3,
           public_portal_token_created_at = NOW(),
           public_portal_token_expires_at = NOW() + ($4::int * INTERVAL '1 day'),
           public_portal_token_revoked_at = NULL,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING public_portal_token_expires_at`,
      [orderId, context.companyId, hash, PORTAL_LINK_TTL_DAYS, context.userId],
    );

    await client.query(
      `INSERT INTO activities
        (company_id, user_id, model, record_id, type, content, metadata)
       VALUES ($1, $2, 'sales.order', $3, 'sales.order.portal_link_created',
         $4, $5::jsonb)`,
      [
        context.companyId,
        context.userId,
        orderId,
        'Issued a customer tracking link for sales order ' + String(order.rows[0].order_number) + '.',
        JSON.stringify({ expiresAt: iso(updated.rows[0]?.public_portal_token_expires_at), ttlDays: PORTAL_LINK_TTL_DAYS }),
      ],
    );

    await client.query('COMMIT');
    return {
      orderId,
      orderNumber: String(order.rows[0].order_number),
      tenantId: context.tenantId,
      token,
      expiresAt: iso(updated.rows[0]?.public_portal_token_expires_at),
      expiresInDays: PORTAL_LINK_TTL_DAYS,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Revokes a previously issued link. Repeating a revocation is safe. */
export async function revokeSalesOrderPortalLink(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.ORDER_MANAGE);
  const orderId = requireUuid(input.orderId, 'Sales order');
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['sales-order-portal:' + context.companyId, orderId],
    );

    const result = await client.query(
      `UPDATE sales_orders_v2
       SET public_portal_token_hash = NULL,
           public_portal_token_revoked_at = CASE
             WHEN public_portal_token_hash IS NOT NULL THEN NOW()
             ELSE public_portal_token_revoked_at
           END,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING order_number`,
      [orderId, context.companyId, context.userId],
    );
    if (!result.rows[0]) {
      throw new SalesError('ORDER_NOT_FOUND', 'Sales order was not found.');
    }

    await client.query(
      `INSERT INTO activities
        (company_id, user_id, model, record_id, type, content, metadata)
       VALUES ($1, $2, 'sales.order', $3, 'sales.order.portal_link_revoked',
         $4, '{}'::jsonb)`,
      [
        context.companyId,
        context.userId,
        orderId,
        'Revoked the customer tracking link for sales order ' + String(result.rows[0].order_number) + '.',
      ],
    );

    await client.query('COMMIT');
    return { orderId, revoked: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Public order data intentionally excludes contact details, internal notes,
 * invoice IDs, margin/cost values and user identifiers.
 */
export async function getPublicSalesOrderPortal(tenantId: string, token: string) {
  if (typeof token !== 'string' || !PORTAL_TOKEN_PATTERN.test(token)) {
    throw new SalesError('ORDER_NOT_FOUND', 'Sales order was not found.');
  }

  const pool = await getTenantPoolByTenantId(tenantId);
  const result = await pool.query(
    `SELECT
       o.id, o.company_id, o.order_number, o.status, o.fulfillment_status,
       o.invoice_status, o.order_date, o.currency, o.customer_name,
       o.total_amount, o.created_at, o.public_portal_token_expires_at
     FROM sales_orders_v2 o
     WHERE o.public_portal_token_hash = $1
       AND o.public_portal_token_revoked_at IS NULL
       AND o.public_portal_token_expires_at > NOW()
       AND o.deleted_at IS NULL
     LIMIT 1`,
    [tokenHash(token)],
  );
  const order = result.rows[0];
  if (!order) {
    throw new SalesError('ORDER_NOT_FOUND', 'Sales order was not found.');
  }

  const [lineResult, shipmentResult] = await Promise.all([
    pool.query(
      `SELECT description, sku_snapshot, unit, quantity,
              shipped_quantity, delivered_quantity, unit_price,
              discount_amount, tax_name_snapshot, tax_amount, subtotal, line_total
       FROM sales_order_items_v2
       WHERE sales_order_id = $1 AND company_id = $2
       ORDER BY sort_order ASC, id ASC`,
      [order.id, order.company_id],
    ),
    pool.query(
      `SELECT shipment_number, status, carrier, service_level,
              tracking_number, tracking_url, shipped_at, delivered_at, created_at
       FROM sales_shipments
       WHERE sales_order_id = $1 AND company_id = $2 AND status <> 'cancelled'
       ORDER BY created_at DESC`,
      [order.id, order.company_id],
    ),
  ]);

  const shipments = shipmentResult.rows.map((row: Record<string, unknown>) => {
    let trackingUrl: string | null = null;
    const rawTrackingUrl = typeof row.tracking_url === 'string' ? row.tracking_url : '';
    if (rawTrackingUrl) {
      try {
        const parsed = new URL(rawTrackingUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') trackingUrl = parsed.toString();
      } catch {
        trackingUrl = null;
      }
    }
    return {
      shipmentNumber: String(row.shipment_number || ''),
      status: String(row.status || ''),
      carrier: row.carrier ? String(row.carrier) : null,
      serviceLevel: row.service_level ? String(row.service_level) : null,
      trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
      trackingUrl,
      shippedAt: iso(row.shipped_at),
      deliveredAt: iso(row.delivered_at),
      createdAt: iso(row.created_at),
    };
  });

  return {
    order: {
      orderNumber: String(order.order_number),
      status: String(order.status),
      fulfillmentStatus: String(order.fulfillment_status),
      invoiceStatus: String(order.invoice_status),
      orderDate: iso(order.order_date),
      currency: String(order.currency),
      customerName: String(order.customer_name),
      totalAmount: Number(order.total_amount || 0),
      createdAt: iso(order.created_at),
      portalExpiresAt: iso(order.public_portal_token_expires_at),
    },
    lines: lineResult.rows.map((row: Record<string, unknown>) => ({
      description: String(row.description || ''),
      sku: row.sku_snapshot ? String(row.sku_snapshot) : null,
      unit: String(row.unit || 'unit'),
      quantity: Number(row.quantity || 0),
      shippedQuantity: Number(row.shipped_quantity || 0),
      deliveredQuantity: Number(row.delivered_quantity || 0),
      unitPrice: Number(row.unit_price || 0),
      discountAmount: Number(row.discount_amount || 0),
      taxName: row.tax_name_snapshot ? String(row.tax_name_snapshot) : null,
      taxAmount: Number(row.tax_amount || 0),
      subtotal: Number(row.subtotal || 0),
      lineTotal: Number(row.line_total || 0),
    })),
    shipments,
  };
}
