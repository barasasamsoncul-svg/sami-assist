import 'server-only';

import crypto from 'node:crypto';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';
import {
  getPublicInvoice,
} from '@/lib/apps/invoicing/public';
import {
  getCustomerPortalInvoice,
} from '@/lib/apps/invoicing/portal';
import {
  getInvoicePaymentProviderDefinition,
  type InvoicePaymentProviderKey,
} from '@/lib/apps/invoicing/payment-provider-catalog';
import type {
  InvoicePaymentProviderSecrets,
} from '@/lib/apps/invoicing/payment-provider-adapters';
import {
  canProviderCreateHostedCheckout,
  checkoutCustomerRequirement,
  createInvoicePaymentCheckoutRemote,
  HOSTED_INVOICE_PAYMENT_PROVIDERS,
  type HostedInvoicePaymentProviderKey,
  verifyInvoicePaymentCheckoutReturn,
} from '@/lib/apps/invoicing/payment-checkout-providers';
import {
  recordVerifiedExternalInvoiceSettlement,
} from '@/lib/apps/invoicing/external-settlement';
import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';
import {
  openIntegrationSecret,
} from '@/lib/integrations/crypto';

export type InvoiceCheckoutAccess =
  | 'public'
  | 'portal';

export type InvoiceCheckoutOption = {
  provider: HostedInvoicePaymentProviderKey;
  name: string;
  environment: 'sandbox' | 'live';
};

type LoadedConnection = {
  id: string;
  provider: HostedInvoicePaymentProviderKey;
  providerKey: string;
  ownerUserId: string;
  environment: 'sandbox' | 'live';
  secrets: InvoicePaymentProviderSecrets;
};

type AccessibleInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  balanceDue: number;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
  };
  company: {
    name: string;
  };
};

function cleanText(
  value: unknown,
  max = 500,
) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function requireUuid(
  value: unknown,
  label: string,
) {
  const text = cleanText(value, 80);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      label + ' is invalid.',
    );
  }
  return text;
}

function normalizeOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvoicingError(
      'INVALID_INPUT',
      'SaMi could not determine a valid checkout URL.',
    );
  }
  const local =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(
      url.hostname,
    );
  if (url.protocol !== 'https:' && !local) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Online invoice payments require HTTPS.',
    );
  }
  return url.origin;
}

function providerFromStorageKey(
  value: string,
) {
  const prefix =
    'invoicing_payment_';
  if (!value.startsWith(prefix)) {
    return null;
  }
  const provider =
    value.slice(prefix.length);
  return canProviderCreateHostedCheckout(
    provider as InvoicePaymentProviderKey,
  )
    ? provider as HostedInvoicePaymentProviderKey
    : null;
}

function providerStorageKey(
  provider: HostedInvoicePaymentProviderKey,
) {
  return 'invoicing_payment_' + provider;
}

function checkoutBackPath(input: {
  access: InvoiceCheckoutAccess;
  tenantId: string;
  token: string;
  invoiceId: string;
}) {
  if (input.access === 'public') {
    return (
      '/i/' +
      encodeURIComponent(input.tenantId) +
      '/' +
      encodeURIComponent(input.token)
    );
  }
  return (
    '/p/' +
    encodeURIComponent(input.tenantId) +
    '/' +
    encodeURIComponent(input.token) +
    '/invoices/' +
    encodeURIComponent(input.invoiceId)
  );
}

function checkoutReturnPath(input: {
  access: InvoiceCheckoutAccess;
  tenantId: string;
  token: string;
  invoiceId: string;
  provider: HostedInvoicePaymentProviderKey;
}) {
  return (
    '/api/public/invoicing/payment-return/' +
    encodeURIComponent(input.access) +
    '/' +
    encodeURIComponent(input.tenantId) +
    '/' +
    encodeURIComponent(input.token) +
    '/' +
    encodeURIComponent(input.invoiceId) +
    '/' +
    encodeURIComponent(input.provider)
  );
}

function isPayableInvoice(
  invoice: AccessibleInvoice,
) {
  if (
    !Number.isFinite(invoice.balanceDue) ||
    invoice.balanceDue <= 0
  ) {
    return false;
  }
  return ![
    'draft',
    'pending_approval',
    'rejected',
    'cancelled',
    'void',
    'written_off',
    'paid',
  ].includes(
    invoice.status.toLowerCase(),
  );
}

async function requireInvoiceAccess(input: {
  access: InvoiceCheckoutAccess;
  tenantId: string;
  token: string;
  invoiceId: string;
}): Promise<AccessibleInvoice> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'Workspace',
    );
  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );
  const token =
    cleanText(
      input.token,
      220,
    );
  if (token.length < 32) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice payment link is invalid or expired.',
    );
  }

  if (input.access === 'public') {
    const invoice =
      await getPublicInvoice(
        tenantId,
        token,
        {
          markViewed: false,
        },
      );
    if (invoice.id !== invoiceId) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice payment link does not match this invoice.',
      );
    }
    return invoice;
  }

  return getCustomerPortalInvoice(
    tenantId,
    token,
    invoiceId,
    {
      markViewed: false,
    },
  );
}

async function companyIdForInvoice(
  tenantId: string,
  invoiceId: string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );
  const result =
    await pool.query(
      `
        SELECT company_id::text
        FROM invoicing_invoices
        WHERE id=$1::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [invoiceId],
    );
  if (!result.rows[0]) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice could not be found.',
    );
  }
  return String(
    result.rows[0].company_id,
  );
}

async function loadCheckoutConnections(input: {
  tenantId: string;
  companyId: string;
}) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  const result =
    await pool.query(
      `
        SELECT
          c.id::text,
          c.provider_key,
          c.owner_user_id::text,
          c.settings,
          cr.sealed_payload
        FROM integration_connections c
        INNER JOIN integration_credentials cr
          ON cr.connection_id=c.id
        WHERE c.company_id=$1::uuid
          AND c.status='connected'
          AND c.health_status IN ('healthy','unknown')
          AND c.archived_at IS NULL
          AND c.provider_key = ANY($2::text[])
        ORDER BY c.updated_at DESC
      `,
      [
        input.companyId,
        HOSTED_INVOICE_PAYMENT_PROVIDERS.map(
          providerStorageKey,
        ),
      ],
    );

  const connections: LoadedConnection[] = [];
  const seen =
    new Set<HostedInvoicePaymentProviderKey>();

  for (const row of result.rows) {
    const provider =
      providerFromStorageKey(
        String(
          row.provider_key ||
          '',
        ),
      );
    if (!provider || seen.has(provider)) {
      continue;
    }
    const settings =
      row.settings &&
      typeof row.settings === 'object'
        ? row.settings as Record<string, unknown>
        : {};
    if (
      settings.autoReconcile === false ||
      settings.callbackConfigured !== true
    ) {
      continue;
    }

    const payload =
      openIntegrationSecret<{
        providerData?: InvoicePaymentProviderSecrets;
      }>(
        String(row.sealed_payload),
      );

    if (
      !payload.providerData ||
      payload.providerData.provider !== provider
    ) {
      continue;
    }

    const environment =
      payload.providerData.environment === 'sandbox'
        ? 'sandbox'
        : 'live';

    connections.push({
      id: String(row.id),
      provider,
      providerKey:
        String(row.provider_key),
      ownerUserId:
        String(row.owner_user_id),
      environment,
      secrets:
        payload.providerData,
    });
    seen.add(provider);
  }

  return connections;
}

export async function getInvoiceCheckoutOptions(input: {
  tenantId: string;
  invoiceId: string;
  customer: AccessibleInvoice['customer'];
  balanceDue: number;
  status: string;
}) {
  const tenantId =
    requireUuid(
      input.tenantId,
      'Workspace',
    );
  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const invoice:
    AccessibleInvoice = {
      id: invoiceId,
      invoiceNumber: '',
      status: input.status,
      currency: '',
      balanceDue: input.balanceDue,
      customer: input.customer,
      company: {
        name: '',
      },
    };

  if (!isPayableInvoice(invoice)) {
    return [] as InvoiceCheckoutOption[];
  }

  const companyId =
    await companyIdForInvoice(
      tenantId,
      invoiceId,
    );
  const connections =
    await loadCheckoutConnections({
      tenantId,
      companyId,
    });

  return connections
    .filter(
      connection =>
        !checkoutCustomerRequirement(
          connection.provider,
          input.customer,
        ),
    )
    .map(
      connection => ({
        provider:
          connection.provider,
        name:
          getInvoicePaymentProviderDefinition(
            connection.provider,
          )?.name ||
          connection.provider,
        environment:
          connection.environment,
      }),
    );
}

async function requireCheckoutConnection(input: {
  tenantId: string;
  companyId: string;
  provider: HostedInvoicePaymentProviderKey;
}) {
  const connections =
    await loadCheckoutConnections({
      tenantId: input.tenantId,
      companyId: input.companyId,
    });
  const connection =
    connections.find(
      item =>
        item.provider === input.provider,
    );
  if (!connection) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'This payment provider is not connected and ready for online invoice payments.',
    );
  }
  return connection;
}

async function enforceCheckoutRateLimit(input: {
  tenantId: string;
  connectionId: string;
  invoiceId: string;
}) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  const result =
    await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM integration_events
        WHERE connection_id=$1::uuid
          AND event_key='invoicing.checkout.created'
          AND payload->>'invoiceId'=$2
          AND created_at >= NOW() - INTERVAL '15 minutes'
      `,
      [
        input.connectionId,
        input.invoiceId,
      ],
    );
  if (
    Number(
      result.rows[0]?.count ||
      0,
    ) >= 10
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Too many payment attempts were started for this invoice. Please try again shortly.',
    );
  }
}

async function recordCheckoutCreated(input: {
  tenantId: string;
  companyId: string;
  connection: LoadedConnection;
  invoice: AccessibleInvoice;
  externalCheckoutId: string;
  externalReference: string;
}) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  await pool.query(
    `
      INSERT INTO integration_events (
        id,
        company_id,
        connection_id,
        provider_key,
        event_key,
        external_event_id,
        payload,
        status,
        occurred_at,
        processed_at,
        created_at
      )
      VALUES (
        $1,
        $2::uuid,
        $3::uuid,
        $4,
        'invoicing.checkout.created',
        $5,
        $6::jsonb,
        'processed',
        NOW(),
        NOW(),
        NOW()
      )
    `,
    [
      crypto.randomUUID(),
      input.companyId,
      input.connection.id,
      input.connection.providerKey,
      input.externalCheckoutId,
      JSON.stringify({
        invoiceId:
          input.invoice.id,
        invoiceNumber:
          input.invoice.invoiceNumber,
        amount:
          input.invoice.balanceDue,
        currency:
          input.invoice.currency,
        provider:
          input.connection.provider,
        providerReference:
          input.externalReference,
      }),
    ],
  );
}

export async function createInvoiceCheckout(input: {
  access: InvoiceCheckoutAccess;
  tenantId: string;
  token: string;
  invoiceId: string;
  provider: unknown;
  origin: string;
}) {
  const invoice =
    await requireInvoiceAccess({
      access: input.access,
      tenantId: input.tenantId,
      token: input.token,
      invoiceId: input.invoiceId,
    });

  if (!isPayableInvoice(invoice)) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'This invoice does not have an open balance that can be paid online.',
    );
  }

  const providerText =
    cleanText(
      input.provider,
      80,
    ).toLowerCase();

  if (
    !canProviderCreateHostedCheckout(
      providerText as InvoicePaymentProviderKey,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a supported online payment provider.',
    );
  }

  const provider =
    providerText as HostedInvoicePaymentProviderKey;

  const requirement =
    checkoutCustomerRequirement(
      provider,
      invoice.customer,
    );
  if (requirement) {
    throw new InvoicingError(
      'INVALID_INPUT',
      requirement,
    );
  }

  const tenantId =
    requireUuid(
      input.tenantId,
      'Workspace',
    );
  const companyId =
    await companyIdForInvoice(
      tenantId,
      invoice.id,
    );
  const connection =
    await requireCheckoutConnection({
      tenantId,
      companyId,
      provider,
    });

  await enforceCheckoutRateLimit({
    tenantId,
    connectionId:
      connection.id,
    invoiceId:
      invoice.id,
  });

  const origin =
    normalizeOrigin(
      input.origin,
    );
  const backPath =
    checkoutBackPath({
      access: input.access,
      tenantId,
      token: input.token,
      invoiceId:
        invoice.id,
    });

  const returnUrl =
    origin +
    checkoutReturnPath({
      access: input.access,
      tenantId,
      token: input.token,
      invoiceId:
        invoice.id,
      provider,
    });

  const cancelUrl =
    origin +
    backPath +
    '?payment=cancelled&provider=' +
    encodeURIComponent(provider);

  const result =
    await createInvoicePaymentCheckoutRemote({
      provider,
      secrets:
        connection.secrets,
      invoiceId:
        invoice.id,
      invoiceNumber:
        invoice.invoiceNumber,
      amount:
        invoice.balanceDue,
      currency:
        invoice.currency,
      companyName:
        invoice.company.name,
      customer:
        invoice.customer,
      returnUrl,
      cancelUrl,
    });

  await recordCheckoutCreated({
    tenantId,
    companyId,
    connection,
    invoice,
    externalCheckoutId:
      result.externalCheckoutId,
    externalReference:
      result.externalReference,
  });

  return {
    provider,
    providerName:
      getInvoicePaymentProviderDefinition(
        provider,
      )?.name ||
      provider,
    checkoutUrl:
      result.checkoutUrl,
    environment:
      connection.environment,
  };
}

function matchesInvoice(
  payment: {
    invoiceId?: string;
    invoiceNumber?: string;
  },
  invoice: AccessibleInvoice,
) {
  if (
    payment.invoiceId &&
    payment.invoiceId === invoice.id
  ) {
    return true;
  }
  if (
    payment.invoiceNumber &&
    payment.invoiceNumber ===
      invoice.invoiceNumber
  ) {
    return true;
  }
  return false;
}

export async function handleInvoiceCheckoutReturn(input: {
  access: InvoiceCheckoutAccess;
  tenantId: string;
  token: string;
  invoiceId: string;
  provider: unknown;
  query: URLSearchParams;
}) {
  const invoice =
    await requireInvoiceAccess({
      access: input.access,
      tenantId: input.tenantId,
      token: input.token,
      invoiceId: input.invoiceId,
    });

  const providerText =
    cleanText(
      input.provider,
      80,
    ).toLowerCase();

  if (
    !canProviderCreateHostedCheckout(
      providerText as InvoicePaymentProviderKey,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Payment provider is invalid.',
    );
  }
  const provider =
    providerText as HostedInvoicePaymentProviderKey;
  const tenantId =
    requireUuid(
      input.tenantId,
      'Workspace',
    );
  const companyId =
    await companyIdForInvoice(
      tenantId,
      invoice.id,
    );
  const connection =
    await requireCheckoutConnection({
      tenantId,
      companyId,
      provider,
    });

  const payment =
    await verifyInvoicePaymentCheckoutReturn({
      provider,
      secrets:
        connection.secrets,
      query:
        input.query,
    });

  const backPath =
    checkoutBackPath({
      access: input.access,
      tenantId,
      token: input.token,
      invoiceId:
        invoice.id,
    });

  if (!payment) {
    return {
      redirectPath:
        backPath +
        '?payment=pending&provider=' +
        encodeURIComponent(provider),
      status: 'pending' as const,
    };
  }

  if (
    !matchesInvoice(
      payment,
      invoice,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Verified provider payment does not match this invoice.',
    );
  }

  if (
    payment.currency.toUpperCase() !==
      invoice.currency.toUpperCase()
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Verified provider payment currency does not match this invoice.',
    );
  }

  const settlement =
    await recordVerifiedExternalInvoiceSettlement({
      tenantId,
      companyId,
      userId:
        connection.ownerUserId,
      providerKey:
        connection.providerKey,
      externalEventId:
        payment.externalEventId,
      payload:
        payment,
    });

  return {
    redirectPath:
      backPath +
      '?payment=paid&provider=' +
      encodeURIComponent(provider),
    status: 'paid' as const,
    settlement,
  };
}
