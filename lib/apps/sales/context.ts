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
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


const MODULE_KEY =
  'sales';


export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export const SALES_PERMISSIONS = {
  QUOTE_VIEW:
    'sales.quote.view',
  QUOTE_CREATE:
    'sales.quote.create',
  QUOTE_EDIT:
    'sales.quote.edit',
  QUOTE_SEND:
    'sales.quote.send',
  QUOTE_APPROVE:
    'sales.quote.approve',
  QUOTE_INTERNAL_APPROVE:
    'sales.quote.approve_internal',
  QUOTE_CONVERT:
    'sales.quote.convert',
  QUOTE_CANCEL:
    'sales.quote.cancel',
  ORDER_VIEW:
    'sales.order.view',
  ORDER_MANAGE:
    'sales.order.manage',
  REPORT_VIEW:
    'sales.report.view',
  SETTINGS_MANAGE:
    'sales.settings.manage',
} as const;


export type SalesErrorCode =
  | 'SALES_NOT_INSTALLED'
  | 'SALES_PERMISSION_REQUIRED'
  | 'SALES_WORKSPACE_SUSPENDED'
  | 'INVALID_INPUT'
  | 'QUOTE_NOT_FOUND'
  | 'QUOTE_STATE_INVALID'
  | 'ORDER_NOT_FOUND'
  | 'DELIVERY_FAILED'
  | 'BILLING_CUSTOMER_REQUIRED'
  | 'INVOICING_REQUIRED';


export class SalesError
  extends Error {
  readonly code:
    SalesErrorCode;

  readonly details:
    Record<string, unknown>;

  constructor(
    code:
      SalesErrorCode,
    message:
      string,
    details:
      Record<string, unknown> = {},
  ) {
    super(
      message,
    );

    this.name =
      'SalesError';

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
) {
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
) {
  const valueText =
    cleanText(
      value,
      maxLength,
    );

  return valueText ||
    null;
}


export function requireUuid(
  value:
    unknown,
  field:
    string,
) {
  if (
    typeof value !==
      'string' ||
    !UUID_RE.test(
      value,
    )
  ) {
    throw new SalesError(
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
) {
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
  options: {
    min?: number;
    max?: number;
  } = {},
) {
  const numeric =
    Number(
      value,
    );

  const min =
    options.min ??
    0;

  const max =
    options.max ??
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
    throw new SalesError(
      'INVALID_INPUT',
      field +
      ' is invalid.',
    );
  }

  return numeric;
}


export function money(
  value:
    unknown,
) {
  const numeric =
    Number(
      value ||
      0,
    );

  return Math.round(
    (
      numeric +
      Number.EPSILON
    ) *
    100,
  ) /
    100;
}


export function isoDate(
  value:
    unknown,
  fallback =
    new Date(),
) {
  if (
    typeof value ===
      'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return value;
  }

  return fallback
    .toISOString()
    .slice(
      0,
      10,
    );
}


export function datePlusDays(
  date:
    string,
  days:
    number,
) {
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


export function hasSalesPermission(
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


export async function requireSalesContext(
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
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
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
    throw new SalesError(
      'SALES_WORKSPACE_SUSPENDED',
      'Sales is unavailable until workspace access is restored.',
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
          AND m.deleted_at IS NULL
          AND tm.deleted_at IS NULL
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
    throw new SalesError(
      'SALES_NOT_INSTALLED',
      'Install Sales before using this feature.',
    );
  }

  if (
    requiredPermission &&
    !hasSalesPermission(
      permissions.isOwner,
      permissions.permissionSet,
      requiredPermission,
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to perform this Sales action.',
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


export async function ensureSalesDefaults(
  pool:
    Pool,
  companyId:
    string,
  userId:
    string,
) {
  await pool.query(
    `
      INSERT INTO sales_quote_templates (
        company_id,
        name,
        is_default,
        terms,
        footer_text,
        created_by,
        updated_by
      )
      VALUES (
        $1,
        'Modern',
        TRUE,
        'Prices are valid until the quotation expiry date.',
        'Thank you for considering our proposal.',
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
        'quote',
        'QTE-',
      ],
      [
        'order',
        'SO-',
      ],
    ] as const
  ) {
    await pool.query(
      `
        INSERT INTO sales_sequences (
          company_id,
          document_type,
          prefix,
          next_number,
          padding,
          format,
          updated_by
        )
        VALUES (
          $1,$2,$3,1,6,
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
      INSERT INTO sales_settings (
        company_id,
        default_currency,
        updated_by
      )
      SELECT
        c.id,
        COALESCE(
          c.currency,
          'KES'
        ),
        $2
      FROM companies c
      WHERE c.id = $1
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


export async function nextSalesNumber(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  documentType:
    'quote' |
    'order',
) {
  const result =
    await client.query(
      `
        SELECT
          prefix,
          next_number,
          padding,
          format
        FROM sales_sequences
        WHERE company_id = $1
          AND document_type = $2
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
    throw new SalesError(
      'INVALID_INPUT',
      'Sales document numbering is not configured.',
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
      UPDATE sales_sequences
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


export async function recordSalesActivity(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string | null;
    quoteId: string;
    type: string;
    content: string;
    metadata?:
      Record<string, unknown>;
  },
) {
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
        $1,$2,
        'sales.quote',
        $3,$4,$5,
        $6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.quoteId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}
