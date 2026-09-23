import 'server-only';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  requireCompanyContext,
} from '@/lib/auth/company-context';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';


const MODULE_KEY =
  'invoicing';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export const INVOICING_PERMISSIONS = {
  INVOICE_VIEW:
    'invoicing.invoice.view',
  INVOICE_CREATE:
    'invoicing.invoice.create',
  INVOICE_EDIT:
    'invoicing.invoice.edit',
  INVOICE_CONFIRM:
    'invoicing.invoice.confirm',
  INVOICE_SEND:
    'invoicing.invoice.send',
  INVOICE_CANCEL:
    'invoicing.invoice.cancel',
  PAYMENT_VIEW:
    'invoicing.payment.view',
  PAYMENT_RECORD:
    'invoicing.payment.record',
  CREDIT_NOTE_MANAGE:
    'invoicing.credit_note.manage',
  CUSTOMER_VIEW:
    'invoicing.customer.view',
  CUSTOMER_MANAGE:
    'invoicing.customer.manage',
  CATALOG_VIEW:
    'invoicing.catalog.view',
  CATALOG_MANAGE:
    'invoicing.catalog.manage',
  RECURRING_MANAGE:
    'invoicing.recurring.manage',
  REPORT_VIEW:
    'invoicing.report.view',
  SETTINGS_MANAGE:
    'invoicing.settings.manage',
} as const;


export type InvoicingErrorCode =
  | 'INVOICING_NOT_INSTALLED'
  | 'INVOICING_PERMISSION_REQUIRED'
  | 'INVOICING_WORKSPACE_SUSPENDED'
  | 'INVALID_INPUT'
  | 'CUSTOMER_NOT_FOUND'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_STATE_INVALID'
  | 'PAYMENT_EXCEEDS_BALANCE'
  | 'DELIVERY_FAILED';


export class InvoicingError
  extends Error {
  readonly code:
    InvoicingErrorCode;

  readonly details:
    Record<string, unknown>;

  constructor(
    code:
      InvoicingErrorCode,
    message:
      string,
    details:
      Record<string, unknown> = {},
  ) {
    super(
      message,
    );

    this.name =
      'InvoicingError';

    this.code =
      code;

    this.details =
      details;
  }
}


export function cleanText(
  value:
    unknown,
  maxLength =
    1000,
): string {
  return typeof value ===
    'string'
    ? value
        .replace(
          /\u0000/g,
          '',
        )
        .trim()
        .slice(
          0,
          maxLength,
        )
    : '';
}


export function nullableText(
  value:
    unknown,
  maxLength =
    1000,
): string | null {
  const normalized =
    cleanText(
      value,
      maxLength,
    );

  return normalized ||
    null;
}


export function requireUuid(
  value:
    unknown,
  field:
    string,
): string {
  if (
    typeof value !==
      'string' ||
    !UUID_RE.test(
      value,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      field +
      ' is invalid.',
    );
  }

  return value;
}


export function optionalUuid(
  value:
    unknown,
): string | null {
  return (
    typeof value ===
      'string' &&
    UUID_RE.test(
      value,
    )
  )
    ? value
    : null;
}


export function numberInput(
  value:
    unknown,
  field:
    string,
  input: {
    min?: number;
    max?: number;
  } = {},
): number {
  const numeric =
    Number(
      value,
    );

  const min =
    input.min ??
    0;

  const max =
    input.max ??
    1_000_000_000_000;

  if (
    !Number.isFinite(
      numeric,
    ) ||
    numeric <
      min ||
    numeric >
      max
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      field +
      ' is invalid.',
    );
  }

  return Math.round(
    numeric *
    10_000,
  ) /
  10_000;
}


export function money(
  value:
    unknown,
): number {
  const numeric =
    Number(
      value ||
      0,
    );

  return Number.isFinite(
    numeric,
  )
    ? Math.round(
        numeric *
        10_000,
      ) /
      10_000
    : 0;
}


export function isoDate(
  value:
    unknown,
  fallback?:
    Date,
): string {
  const raw =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  const candidate =
    /^\d{4}-\d{2}-\d{2}$/
      .test(
        raw,
      )
      ? raw
      : fallback
        ? fallback
            .toISOString()
            .slice(
              0,
              10,
            )
        : '';

  if (
    !candidate ||
    Number.isNaN(
      new Date(
        candidate +
        'T00:00:00Z',
      ).getTime(),
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid date.',
    );
  }

  return candidate;
}


export function datePlusDays(
  date:
    string,
  days:
    number,
): string {
  const parsed =
    new Date(
      date +
      'T00:00:00Z',
    );

  parsed.setUTCDate(
    parsed.getUTCDate() +
    days,
  );

  return parsed
    .toISOString()
    .slice(
      0,
      10,
    );
}


export function hasInvoicingPermission(
  isOwner:
    boolean,
  permissionSet:
    ReadonlySet<string>,
  permission:
    string,
) {
  return (
    isOwner ||
    permissionSet.has(
      permission,
    )
  );
}


export async function requireInvoicingContext(
  requiredPermission?:
    string,
) {
  const [
    permissions,
    company,
  ] =
    await Promise.all([
      getPermissionContext(),
      requireCompanyContext(),
    ]);

  if (
    permissions.tenantId !==
      company.tenantId ||
    permissions.userId !==
      company.userId
  ) {
    throw new InvoicingError(
      'INVOICING_PERMISSION_REQUIRED',
      'Your workspace context changed. Please try again.',
    );
  }

  const access =
    await getWorkspaceSubscriptionAccessState(
      permissions.tenantId,
    );

  if (
    access.suspended ||
    !access.entitled
  ) {
    throw new InvoicingError(
      'INVOICING_WORKSPACE_SUSPENDED',
      'Invoicing is unavailable until workspace access is restored.',
    );
  }

  const installed =
    await queryControl(
      `
        SELECT 1
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE tm.tenant_id = $1
          AND LOWER(
                COALESCE(
                  m.key,
                  ''
                )
              ) = $2
          AND m.deleted_at
              IS NULL
          AND tm.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  m.status,
                  ''
                )
              ) = 'active'
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
        LIMIT 1
      `,
      [
        permissions.tenantId,
        MODULE_KEY,
      ],
    );

  if (
    installed.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICING_NOT_INSTALLED',
      'Install Invoicing before using this feature.',
    );
  }

  if (
    requiredPermission &&
    !hasInvoicingPermission(
      permissions.isOwner,
      permissions.permissionSet,
      requiredPermission,
    )
  ) {
    throw new InvoicingError(
      'INVOICING_PERMISSION_REQUIRED',
      'You do not have permission to perform this Invoicing action.',
      {
        permission:
          requiredPermission,
      },
    );
  }

  return {
    permissions,
    company,
    tenantId:
      permissions.tenantId,
    userId:
      permissions.userId,
    companyId:
      company.currentCompanyId,
    pool:
      await getTenantPoolByTenantId(
        permissions.tenantId,
      ),
  };
}


export async function ensureCompanyDefaults(
  pool:
    Pool,
  companyId:
    string,
  userId:
    string,
) {
  await pool.query(
    `
      INSERT INTO invoicing_payment_terms (
        company_id,
        name,
        description,
        due_days,
        is_default,
        sort_order,
        created_by,
        updated_by
      )
      VALUES
        (
          $1,
          'Net 30',
          'Payment due within 30 days.',
          30,
          TRUE,
          30,
          $2,
          $2
        ),
        (
          $1,
          'Due on receipt',
          'Payment due immediately.',
          0,
          FALSE,
          0,
          $2,
          $2
        )
      ON CONFLICT DO NOTHING
    `,
    [
      companyId,
      userId,
    ],
  );

  await pool.query(
    `
      INSERT INTO invoicing_tax_rates (
        company_id,
        name,
        rate,
        tax_type,
        country_code,
        is_default,
        created_by,
        updated_by
      )
      SELECT
        c.id,
        'VAT 16%',
        16,
        'vat',
        COALESCE(
          c.country_code,
          'KE'
        ),
        TRUE,
        $2,
        $2
      FROM companies c
      WHERE c.id =
            $1
        AND UPPER(
              COALESCE(
                c.country_code,
                'KE'
              )
            ) =
            'KE'
      ON CONFLICT DO NOTHING
    `,
    [
      companyId,
      userId,
    ],
  );

  await pool.query(
    `
      INSERT INTO invoicing_templates (
        company_id,
        name,
        is_default,
        layout,
        created_by,
        updated_by
      )
      VALUES (
        $1,
        'Modern',
        TRUE,
        'modern',
        $2,
        $2
      )
      ON CONFLICT DO NOTHING
    `,
    [
      companyId,
      userId,
    ],
  );

  for (
    const [
      documentType,
      prefix,
    ]
    of [
      [
        'invoice',
        'INV-',
      ],
      [
        'payment',
        'PAY-',
      ],
      [
        'credit_note',
        'CN-',
      ],
    ] as const
  ) {
    await pool.query(
      `
        INSERT INTO invoicing_sequences (
          company_id,
          document_type,
          prefix,
          next_number,
          padding,
          format,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          1,
          6,
          '{prefix}{number}',
          $4
        )
        ON CONFLICT (
          company_id,
          document_type
        )
        DO NOTHING
      `,
      [
        companyId,
        documentType,
        prefix,
        userId,
      ],
    );
  }

  await pool.query(
    `
      INSERT INTO invoicing_settings (
        company_id,
        default_currency,
        default_payment_terms_id,
        default_tax_rate_id,
        default_template_id,
        updated_by
      )
      SELECT
        c.id,
        COALESCE(
          c.currency,
          'KES'
        ),
        (
          SELECT pt.id
          FROM invoicing_payment_terms pt
          WHERE pt.company_id =
                c.id
            AND pt.is_default =
                TRUE
            AND pt.deleted_at
                IS NULL
          ORDER BY
            pt.created_at
          LIMIT 1
        ),
        (
          SELECT tr.id
          FROM invoicing_tax_rates tr
          WHERE tr.company_id =
                c.id
            AND tr.is_default =
                TRUE
            AND tr.deleted_at
                IS NULL
          ORDER BY
            tr.created_at
          LIMIT 1
        ),
        (
          SELECT it.id
          FROM invoicing_templates it
          WHERE it.company_id =
                c.id
            AND it.is_default =
                TRUE
            AND it.deleted_at
                IS NULL
          ORDER BY
            it.created_at
          LIMIT 1
        ),
        $2
      FROM companies c
      WHERE c.id =
            $1
      ON CONFLICT (
        company_id
      )
      DO NOTHING
    `,
    [
      companyId,
      userId,
    ],
  );
}


export async function nextDocumentNumber(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  documentType:
    'invoice' |
    'payment' |
    'credit_note',
) {
  const result =
    await client.query(
      `
        SELECT
          prefix,
          next_number,
          padding,
          format
        FROM invoicing_sequences
        WHERE company_id =
              $1
          AND document_type =
              $2
        FOR UPDATE
      `,
      [
        companyId,
        documentType,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Document numbering is not configured.',
    );
  }

  const row =
    result.rows[0];

  const current =
    Number(
      row.next_number,
    );

  const prefix =
    String(
      row.prefix ||
      '',
    );

  const padding =
    Math.max(
      1,
      Math.min(
        12,
        Number(
          row.padding ||
          6,
        ),
      ),
    );

  const format =
    String(
      row.format ||
      '{prefix}{number}',
    );

  const number =
    format
      .replace(
        '{prefix}',
        prefix,
      )
      .replace(
        '{number}',
        String(
          current,
        ).padStart(
          padding,
          '0',
        ),
      );

  await client.query(
    `
      UPDATE invoicing_sequences
      SET
        next_number =
          next_number + 1,
        updated_by =
          $3,
        updated_at =
          NOW()
      WHERE company_id =
            $1
        AND document_type =
            $2
    `,
    [
      companyId,
      documentType,
      userId,
    ],
  );

  return number;
}


export async function recordInvoicingActivity(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string | null;
    invoiceId: string;
    type: string;
    content: string;
    metadata?:
      Record<string, unknown>;
  },
) {
  const metadata =
    JSON.stringify(
      input.metadata ||
      {},
    );

  await client.query(
    `
      INSERT INTO activities (
        company_id,
        user_id,
        model,
        record_id,
        type,
        content,
        metadata
      )
      VALUES (
        $1,
        $2,
        'invoicing.invoice',
        $3,
        $4,
        $5,
        $6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.invoiceId,
      input.type,
      input.content,
      metadata,
    ],
  );

  await client.query(
    `
      INSERT INTO invoicing_events (
        company_id,
        invoice_id,
        event_key,
        actor_user_id,
        payload
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb
      )
    `,
    [
      input.companyId,
      input.invoiceId,
      input.type,
      input.userId,
      metadata,
    ],
  );
}
