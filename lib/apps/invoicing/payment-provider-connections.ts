import 'server-only';

import crypto from 'node:crypto';

import {
  INVOICE_PAYMENT_PROVIDERS,
  getInvoicePaymentProviderDefinition,
  type InvoicePaymentEnvironment,
  type InvoicePaymentProviderKey,
} from '@/lib/apps/invoicing/payment-provider-catalog';
import {
  connectInvoicePaymentProviderRemote,
  disconnectInvoicePaymentProviderRemote,
  testInvoicePaymentProviderRemote,
  verifyAndNormalizeInvoicePaymentWebhook,
  type InvoicePaymentProviderSecrets,
} from '@/lib/apps/invoicing/payment-provider-adapters';
import {
  recordVerifiedExternalInvoiceSettlement,
} from '@/lib/apps/invoicing/external-settlement';
import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';
import {
  generateIntegrationToken,
  hashIntegrationToken,
  openIntegrationSecret,
  sealIntegrationSecret,
} from '@/lib/integrations/crypto';
import {
  resolveWorkspaceIntegrationContext,
  WorkspaceIntegrationError,
} from '@/lib/services/workspace-integrations';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const ENDPOINT_KEY_RE = /^pay_[A-Za-z0-9_-]{20,90}$/;
const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_DELIVERIES_PER_MINUTE = 120;

function providerStorageKey(provider: InvoicePaymentProviderKey) {
  return 'invoicing_payment_' + provider;
}

function providerFromStorageKey(value: string) {
  const key = value.trim().toLowerCase();
  if (!key.startsWith('invoicing_payment_')) return null;
  const provider = key.slice('invoicing_payment_'.length);
  return getInvoicePaymentProviderDefinition(provider)?.key || null;
}

function safeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, max = 1_000) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
    : '';
}

function requireProviderPermission(
  context: Awaited<ReturnType<typeof resolveWorkspaceIntegrationContext>>,
) {
  if (!context.runtime.accessibleModuleKeys.includes('invoicing')) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'Invoicing is not available in the current workspace.',
    );
  }
  if (
    !context.runtime.isOwner &&
    !context.runtime.permissionSet.has('invoicing.payment.record')
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATIONS_MANAGE_REQUIRED',
      'Invoice payment permission is required to manage payment providers.',
    );
  }
}

function normalizeOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'SaMi could not determine a valid application URL.',
    );
  }
  const local =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'Payment provider callbacks require HTTPS outside local development.',
    );
  }
  return url.origin;
}

async function audit(
  context: Awaited<ReturnType<typeof resolveWorkspaceIntegrationContext>>['runtime'],
  input: {
    action: string;
    resourceId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
    actorType?: 'human' | 'system';
  },
) {
  await recordWorkspaceAuditEvent({
    tenantId: context.tenantId,
    companyId: context.companyId,
    userId: context.userId,
    actorType: input.actorType || 'human',
    action: input.action,
    eventType: input.action,
    category: 'activity',
    severity: 'info',
    result: 'success',
    resourceType: 'invoice_payment_provider',
    resourceId: input.resourceId || undefined,
    entityType: 'invoice_payment_provider',
    entityId: input.resourceId || undefined,
    module: 'invoicing',
    summary: input.summary,
    metadata: input.metadata || {},
  }).catch(error => {
    console.error('[SaMi Invoicing] Payment provider audit failed:', error);
  });
}

export async function getInvoicePaymentProviderState() {
  const context = await resolveWorkspaceIntegrationContext('view');
  const pool = await getTenantPoolByTenantId(context.runtime.tenantId);
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.provider_key,
        c.name,
        c.status,
        c.health_status,
        c.external_account_id,
        c.external_account_name,
        c.settings,
        c.last_health_check_at,
        c.connected_at,
        c.updated_at,
        e.id AS endpoint_id,
        e.endpoint_key,
        e.status AS endpoint_status,
        e.last_received_at
      FROM integration_connections c
      LEFT JOIN LATERAL (
        SELECT
          id,
          endpoint_key,
          status,
          last_received_at
        FROM integration_webhook_endpoints
        WHERE connection_id = c.id
          AND company_id = c.company_id
          AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) e ON TRUE
      WHERE c.company_id = $1
        AND c.provider_key LIKE 'invoicing_payment_%'
        AND c.archived_at IS NULL
      ORDER BY c.updated_at DESC, c.id DESC
    `,
    [context.runtime.companyId],
  );

  const byProvider = new Map<string, Record<string, unknown>>();
  for (const row of result.rows) {
    const provider = providerFromStorageKey(String(row.provider_key || ''));
    if (!provider || byProvider.has(provider)) continue;
    const settings = safeObject(row.settings);
    byProvider.set(provider, {
      id: String(row.id),
      provider,
      name: String(row.name),
      status: String(row.status),
      healthStatus: String(row.health_status || 'unknown'),
      environment:
        settings.environment === 'sandbox' ? 'sandbox' : 'live',
      externalAccountId: row.external_account_id
        ? String(row.external_account_id)
        : null,
      externalAccountName: row.external_account_name
        ? String(row.external_account_name)
        : null,
      callbackConfigured: settings.callbackConfigured === true,
      manualSetupRequired: settings.manualSetupRequired === true,
      autoReconcile: settings.autoReconcile !== false,
      endpointStatus: row.endpoint_status
        ? String(row.endpoint_status)
        : null,
      lastReceivedAt: row.last_received_at || null,
      lastHealthCheckAt: row.last_health_check_at || null,
      connectedAt: row.connected_at || null,
      updatedAt: row.updated_at,
    });
  }

  return {
    canManage: context.canManage,
    providers: INVOICE_PAYMENT_PROVIDERS,
    connections: Array.from(byProvider.values()),
  };
}

async function loadExistingProviderSecrets(input: {
  tenantId: string;
  companyId: string;
  providerKey: string;
}) {
  const pool = await getTenantPoolByTenantId(input.tenantId);
  const result = await pool.query(
    `
      SELECT
        c.id,
        cr.sealed_payload
      FROM integration_connections c
      LEFT JOIN integration_credentials cr
        ON cr.connection_id = c.id
      WHERE c.company_id = $1
        AND c.provider_key = $2
        AND c.archived_at IS NULL
      ORDER BY c.updated_at DESC
      LIMIT 1
    `,
    [input.companyId, input.providerKey],
  );
  if (!result.rows[0]) return null;
  let secrets: InvoicePaymentProviderSecrets | null = null;
  if (result.rows[0].sealed_payload) {
    const payload = openIntegrationSecret<{
      providerData?: InvoicePaymentProviderSecrets;
    }>(String(result.rows[0].sealed_payload));
    if (payload.providerData) secrets = payload.providerData;
  }
  return {
    connectionId: String(result.rows[0].id),
    secrets,
  };
}

export async function connectInvoicePaymentProvider(input: {
  provider?: unknown;
  environment?: unknown;
  credentials?: unknown;
  origin: string;
}) {
  const context = await resolveWorkspaceIntegrationContext('manage');
  requireProviderPermission(context);

  const providerKey = cleanText(input.provider, 80).toLowerCase();
  const provider = getInvoicePaymentProviderDefinition(providerKey);
  if (!provider) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'Choose a supported invoice payment provider.',
    );
  }

  const environment: InvoicePaymentEnvironment =
    input.environment === 'live' ? 'live' : 'sandbox';
  if (!provider.environments.includes(environment)) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'This environment is not available for the selected provider.',
    );
  }

  const origin = normalizeOrigin(input.origin);
  const endpointKey = 'pay_' + generateIntegrationToken(24);
  const callbackUrl =
    origin +
    '/api/apps/invoicing/payment-providers/webhooks/' +
    context.runtime.tenantId +
    '/' +
    endpointKey;

  const credentials = safeObject(input.credentials);
  let remote;
  try {
    remote = await connectInvoicePaymentProviderRemote({
      provider: provider.key,
      environment,
      credentials,
      callbackUrl,
    });
  } catch (error) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      error instanceof Error
        ? error.message
        : 'The payment provider could not be connected.',
    );
  }

  const storageKey = providerStorageKey(provider.key);
  const existing = await loadExistingProviderSecrets({
    tenantId: context.runtime.tenantId,
    companyId: context.runtime.companyId,
    providerKey: storageKey,
  });

  const sealed = sealIntegrationSecret({
    providerData: remote.secrets,
  });
  const internalSecret = generateIntegrationToken(32);
  const pool = await getTenantPoolByTenantId(context.runtime.tenantId);
  const client = await pool.connect();

  let connectionId = '';
  let endpointId = '';

  try {
    await client.query('BEGIN');

    const previous = await client.query(
      `
        SELECT id
        FROM integration_connections
        WHERE company_id = $1
          AND provider_key = $2
          AND archived_at IS NULL
        FOR UPDATE
      `,
      [context.runtime.companyId, storageKey],
    );

    for (const row of previous.rows) {
      await client.query(
        `
          UPDATE integration_webhook_endpoints
          SET status = 'revoked',
              archived_at = COALESCE(archived_at, NOW()),
              updated_at = NOW()
          WHERE connection_id = $1
            AND company_id = $2
        `,
        [row.id, context.runtime.companyId],
      );
      await client.query(
        'DELETE FROM integration_credentials WHERE connection_id = $1',
        [row.id],
      );
      await client.query(
        `
          UPDATE integration_connections
          SET status = 'revoked',
              health_status = 'revoked',
              disconnected_at = NOW(),
              archived_at = COALESCE(archived_at, NOW()),
              updated_by = $3,
              updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [row.id, context.runtime.companyId, context.runtime.userId],
      );
    }

    const connection = await client.query(
      `
        INSERT INTO integration_connections (
          company_id,
          provider_key,
          connection_type,
          name,
          status,
          owner_user_id,
          external_account_id,
          external_account_name,
          scopes,
          capabilities,
          settings,
          health_status,
          last_health_check_at,
          connected_at,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,'webhook',$3,'connected',$4,$5,$6,
          '[]'::jsonb,$7::jsonb,$8::jsonb,'healthy',NOW(),NOW(),$4,$4
        )
        RETURNING id
      `,
      [
        context.runtime.companyId,
        storageKey,
        provider.name + ' invoice payments',
        context.runtime.userId,
        remote.externalAccountId,
        remote.externalAccountName,
        JSON.stringify([
          'inbound_webhook',
          'automation_triggers',
        ]),
        JSON.stringify({
          paymentProvider: provider.key,
          environment,
          callbackConfigured: remote.manualSetup === null,
          manualSetupRequired: remote.manualSetup !== null,
          autoReconcile: true,
          providerWebhookId: remote.secrets.providerWebhookId || null,
          pesapalIpnId: remote.secrets.pesapalIpnId || null,
        }),
      ],
    );
    connectionId = String(connection.rows[0].id);

    await client.query(
      `
        INSERT INTO integration_credentials (
          connection_id,
          credential_type,
          sealed_payload,
          key_version
        )
        VALUES ($1,'api_key',$2,$3)
      `,
      [connectionId, sealed.sealed, sealed.version],
    );

    const endpoint = await client.query(
      `
        INSERT INTO integration_webhook_endpoints (
          company_id,
          connection_id,
          provider_key,
          endpoint_key,
          name,
          status,
          secret_hash,
          event_keys,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5,'active',$6,$7::jsonb,$8
        )
        RETURNING id
      `,
      [
        context.runtime.companyId,
        connectionId,
        storageKey,
        endpointKey,
        provider.name + ' invoice payment notifications',
        hashIntegrationToken(internalSecret),
        JSON.stringify(['invoicing.payment.succeeded']),
        context.runtime.userId,
      ],
    );
    endpointId = String(endpoint.rows[0].id);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await disconnectInvoicePaymentProviderRemote(remote.secrets);
    throw error;
  } finally {
    client.release();
  }

  if (existing?.secrets) {
    await disconnectInvoicePaymentProviderRemote(existing.secrets);
  }

  await audit(context.runtime, {
    action: 'invoicing.payment_provider.connected',
    resourceId: connectionId,
    summary: provider.name + ' was connected for automatic invoice payments.',
    metadata: {
      provider: provider.key,
      environment,
      endpointId,
      callbackConfigured: remote.manualSetup === null,
    },
  });

  return {
    connectionId,
    endpointId,
    provider: provider.key,
    providerName: provider.name,
    environment,
    status: 'connected',
    healthStatus: 'healthy',
    callbackConfigured: remote.manualSetup === null,
    manualSetup: remote.manualSetup,
  };
}

async function loadConnectionSecrets(input: {
  tenantId: string;
  companyId: string;
  connectionId: string;
}) {
  const pool = await getTenantPoolByTenantId(input.tenantId);
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.provider_key,
        c.status,
        c.name,
        cr.sealed_payload
      FROM integration_connections c
      LEFT JOIN integration_credentials cr
        ON cr.connection_id = c.id
      WHERE c.id = $1::uuid
        AND c.company_id = $2
        AND c.archived_at IS NULL
      LIMIT 1
    `,
    [input.connectionId, input.companyId],
  );
  if (!result.rows[0]) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_NOT_FOUND',
      'Payment provider connection could not be found.',
    );
  }
  const provider = providerFromStorageKey(String(result.rows[0].provider_key));
  if (!provider || !result.rows[0].sealed_payload) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'This is not an active invoice payment provider connection.',
    );
  }
  const payload = openIntegrationSecret<{
    providerData?: InvoicePaymentProviderSecrets;
  }>(String(result.rows[0].sealed_payload));
  if (!payload.providerData) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'Payment provider credentials are unavailable.',
    );
  }
  return {
    id: String(result.rows[0].id),
    name: String(result.rows[0].name),
    provider,
    status: String(result.rows[0].status),
    secrets: payload.providerData,
  };
}

export async function testInvoicePaymentProviderConnection(
  connectionId: unknown,
) {
  const context = await resolveWorkspaceIntegrationContext('manage');
  requireProviderPermission(context);
  const id = cleanText(connectionId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'A valid payment provider connection is required.',
    );
  }
  const connection = await loadConnectionSecrets({
    tenantId: context.runtime.tenantId,
    companyId: context.runtime.companyId,
    connectionId: id,
  });
  const pool = await getTenantPoolByTenantId(context.runtime.tenantId);

  try {
    await testInvoicePaymentProviderRemote(connection.secrets);
    await pool.query(
      `
        UPDATE integration_connections
        SET status='connected',
            health_status='healthy',
            last_health_check_at=NOW(),
            updated_by=$3,
            updated_at=NOW()
        WHERE id=$1 AND company_id=$2
      `,
      [id, context.runtime.companyId, context.runtime.userId],
    );
  } catch (error) {
    await pool.query(
      `
        UPDATE integration_connections
        SET health_status='degraded',
            last_health_check_at=NOW(),
            updated_by=$3,
            updated_at=NOW()
        WHERE id=$1 AND company_id=$2
      `,
      [id, context.runtime.companyId, context.runtime.userId],
    ).catch(() => undefined);
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      error instanceof Error
        ? error.message
        : 'Payment provider connection check failed.',
    );
  }

  await audit(context.runtime, {
    action: 'invoicing.payment_provider.health_checked',
    resourceId: id,
    summary: connection.name + ' passed its connection check.',
    metadata: { provider: connection.provider },
  });

  return {
    connectionId: id,
    status: 'connected',
    healthStatus: 'healthy',
  };
}

export async function disconnectInvoicePaymentProvider(
  connectionId: unknown,
) {
  const context = await resolveWorkspaceIntegrationContext('manage');
  requireProviderPermission(context);
  const id = cleanText(connectionId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'A valid payment provider connection is required.',
    );
  }
  const connection = await loadConnectionSecrets({
    tenantId: context.runtime.tenantId,
    companyId: context.runtime.companyId,
    connectionId: id,
  });

  await disconnectInvoicePaymentProviderRemote(connection.secrets);

  const pool = await getTenantPoolByTenantId(context.runtime.tenantId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE integration_webhook_endpoints
        SET status='revoked',
            archived_at=COALESCE(archived_at,NOW()),
            updated_at=NOW()
        WHERE connection_id=$1 AND company_id=$2
      `,
      [id, context.runtime.companyId],
    );
    await client.query(
      'DELETE FROM integration_credentials WHERE connection_id=$1',
      [id],
    );
    await client.query(
      `
        UPDATE integration_connections
        SET status='revoked',
            health_status='revoked',
            disconnected_at=NOW(),
            updated_by=$3,
            updated_at=NOW()
        WHERE id=$1 AND company_id=$2
      `,
      [id, context.runtime.companyId, context.runtime.userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await audit(context.runtime, {
    action: 'invoicing.payment_provider.disconnected',
    resourceId: id,
    summary: connection.name + ' was disconnected.',
    metadata: { provider: connection.provider },
  });

  return {
    connectionId: id,
    status: 'revoked',
  };
}

export async function receiveInvoicePaymentProviderWebhook(input: {
  tenantId: string;
  endpointKey: string;
  rawBody: string;
  headers: Headers;
  query: URLSearchParams;
}) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.tenantId,
    ) ||
    !ENDPOINT_KEY_RE.test(input.endpointKey)
  ) {
    return { status: 404, body: { success: false, code: 'PAYMENT_WEBHOOK_NOT_FOUND' } };
  }

  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return { status: 413, body: { success: false, code: 'PAYMENT_WEBHOOK_TOO_LARGE' } };
  }

  let pool;
  try {
    pool = await getTenantPoolByTenantId(input.tenantId);
  } catch {
    return { status: 404, body: { success: false, code: 'PAYMENT_WEBHOOK_NOT_FOUND' } };
  }

  const endpointResult = await pool.query(
    `
      SELECT
        e.id,
        e.company_id,
        e.connection_id,
        e.provider_key,
        e.status AS endpoint_status,
        c.status AS connection_status,
        c.owner_user_id,
        cr.sealed_payload
      FROM integration_webhook_endpoints e
      INNER JOIN integration_connections c
        ON c.id=e.connection_id
       AND c.company_id=e.company_id
      INNER JOIN integration_credentials cr
        ON cr.connection_id=c.id
      WHERE e.endpoint_key=$1
        AND e.status='active'
        AND e.archived_at IS NULL
        AND c.status='connected'
        AND c.archived_at IS NULL
      LIMIT 1
    `,
    [input.endpointKey],
  );

  if (!endpointResult.rows[0]) {
    return { status: 404, body: { success: false, code: 'PAYMENT_WEBHOOK_NOT_FOUND' } };
  }

  const endpoint = endpointResult.rows[0];
  const provider = providerFromStorageKey(String(endpoint.provider_key || ''));
  if (!provider) {
    return { status: 404, body: { success: false, code: 'PAYMENT_WEBHOOK_NOT_FOUND' } };
  }

  const rate = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM integration_webhook_deliveries
      WHERE endpoint_id=$1
        AND received_at >= NOW() - INTERVAL '1 minute'
    `,
    [endpoint.id],
  );
  if (Number(rate.rows[0]?.count || 0) >= MAX_DELIVERIES_PER_MINUTE) {
    return { status: 429, body: { success: false, code: 'PAYMENT_WEBHOOK_RATE_LIMITED' } };
  }

  const payload = openIntegrationSecret<{
    providerData?: InvoicePaymentProviderSecrets;
  }>(String(endpoint.sealed_payload));
  if (!payload.providerData || payload.providerData.provider !== provider) {
    return { status: 409, body: { success: false, code: 'PAYMENT_PROVIDER_CREDENTIAL_MISMATCH' } };
  }

  let normalized;
  try {
    normalized = await verifyAndNormalizeInvoicePaymentWebhook({
      secrets: payload.providerData,
      rawBody: input.rawBody,
      headers: input.headers,
      query: input.query,
    });
  } catch (error) {
    console.error('[SaMi Invoicing] Payment webhook verification failed:', {
      provider,
      endpointId: String(endpoint.id),
      error,
    });
    return {
      status: 401,
      body: {
        success: false,
        code: 'PAYMENT_WEBHOOK_VERIFICATION_FAILED',
      },
    };
  }

  if (!normalized) {
    return {
      status: 200,
      body: {
        success: true,
        accepted: true,
        ignored: true,
      },
    };
  }

  if (
    !normalized.externalEventId ||
    !Number.isFinite(normalized.amount) ||
    normalized.amount <= 0 ||
    !normalized.currency
  ) {
    return {
      status: 422,
      body: {
        success: false,
        code: 'PAYMENT_WEBHOOK_INVALID_PAYMENT',
      },
    };
  }

  const existing = await pool.query(
    `
      SELECT id,status
      FROM integration_webhook_deliveries
      WHERE endpoint_id=$1
        AND external_event_id=$2
      LIMIT 1
    `,
    [endpoint.id, normalized.externalEventId],
  );
  if (existing.rows[0] && String(existing.rows[0].status) !== 'failed') {
    return {
      status: 200,
      body: {
        success: true,
        accepted: true,
        duplicate: true,
      },
    };
  }

  const deliveryId = existing.rows[0]
    ? String(existing.rows[0].id)
    : crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const payloadDigest = crypto
    .createHash('sha256')
    .update(input.rawBody || input.query.toString(), 'utf8')
    .digest('hex');
  const payloadBytes = Buffer.byteLength(input.rawBody, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (existing.rows[0]) {
      await client.query(
        `
          UPDATE integration_webhook_deliveries
          SET payload_digest=$2,
              payload_bytes=$3,
              signature_valid=TRUE,
              status='received',
              error_code=NULL,
              error_message=NULL,
              correlation_id=$4,
              received_at=NOW(),
              processed_at=NULL
          WHERE id=$1
        `,
        [deliveryId, payloadDigest, payloadBytes, correlationId],
      );
    } else {
      await client.query(
        `
          INSERT INTO integration_webhook_deliveries (
            id,endpoint_id,company_id,direction,external_event_id,
            payload_digest,payload_bytes,signature_valid,status,
            correlation_id,received_at,created_at
          )
          VALUES (
            $1,$2,$3,'inbound',$4,$5,$6,TRUE,'received',$7,NOW(),NOW()
          )
        `,
        [
          deliveryId,
          endpoint.id,
          endpoint.company_id,
          normalized.externalEventId,
          payloadDigest,
          payloadBytes,
          correlationId,
        ],
      );
    }
    await client.query(
      `
        INSERT INTO integration_events (
          id,company_id,connection_id,delivery_id,provider_key,event_key,
          external_event_id,payload,status,occurred_at,created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,'invoicing.payment.succeeded',$6,$7::jsonb,
          'pending',NOW(),NOW()
        )
      `,
      [
        eventId,
        endpoint.company_id,
        endpoint.connection_id,
        deliveryId,
        endpoint.provider_key,
        normalized.externalEventId,
        JSON.stringify(normalized),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    const result = await recordVerifiedExternalInvoiceSettlement({
      tenantId: input.tenantId,
      companyId: String(endpoint.company_id),
      userId: String(endpoint.owner_user_id),
      providerKey: String(endpoint.provider_key),
      externalEventId: normalized.externalEventId,
      payload: normalized,
    });

    await Promise.all([
      pool.query(
        `
          UPDATE integration_webhook_deliveries
          SET status='processed',processed_at=NOW()
          WHERE id=$1
        `,
        [deliveryId],
      ),
      pool.query(
        `
          UPDATE integration_events
          SET status='processed',processed_at=NOW()
          WHERE id=$1
        `,
        [eventId],
      ),
      pool.query(
        `
          UPDATE integration_webhook_endpoints
          SET last_received_at=NOW(),updated_at=NOW()
          WHERE id=$1
        `,
        [endpoint.id],
      ),
      pool.query(
        `
          UPDATE integration_connections
          SET health_status='healthy',
              last_health_check_at=NOW(),
              updated_at=NOW()
          WHERE id=$1
        `,
        [endpoint.connection_id],
      ),
    ]);

    return {
      status: 200,
      body: {
        success: true,
        accepted: true,
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        duplicate: result.reused,
      },
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 700)
      : 'Invoice settlement failed.';

    await Promise.all([
      pool.query(
        `
          UPDATE integration_webhook_deliveries
          SET status='failed',
              error_code='INVOICE_SETTLEMENT_FAILED',
              error_message=$2,
              processed_at=NOW()
          WHERE id=$1
        `,
        [deliveryId, message],
      ),
      pool.query(
        `
          UPDATE integration_events
          SET status='failed',processed_at=NOW()
          WHERE id=$1
        `,
        [eventId],
      ),
      pool.query(
        `
          UPDATE integration_connections
          SET health_status='degraded',
              last_health_check_at=NOW(),
              settings=COALESCE(settings,'{}'::jsonb) ||
                jsonb_build_object(
                  'lastWebhookError',$2::text,
                  'lastWebhookErrorAt',NOW()
                ),
              updated_at=NOW()
          WHERE id=$1
        `,
        [endpoint.connection_id, message],
      ),
    ]);

    console.error('[SaMi Invoicing] Verified payment could not settle invoice:', {
      provider,
      externalEventId: normalized.externalEventId,
      error,
    });

    return {
      status: 500,
      body: {
        success: false,
        code: 'INVOICE_SETTLEMENT_FAILED',
      },
    };
  }
}
