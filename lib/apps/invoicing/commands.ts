import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  deliverInvoice,
  normalizeInvoiceDeliveryChannels,
} from '@/lib/apps/invoicing/delivery';

import type {
  CreateInvoiceInput,
  CreateInvoiceLineInput,
} from '@/lib/apps/invoicing/types';

import {
  createPrimaryInvoiceDocumentSnapshot,
} from '@/lib/apps/invoicing/document-snapshots';

import {
  postInvoiceConfirmationToAccounting,
  postInvoiceCreditToAccounting,
  postInvoicePaymentAllocationToAccounting,
  postInvoicePaymentRefundToAccounting,
  postInvoicePaymentToAccounting,
  postInvoiceWriteOffToAccounting,
  reverseInvoicingAccountingEvent,
} from '@/lib/apps/invoicing/accounting';

import {
  dispatchBusinessAutomationEventSafely,
} from '@/lib/automation/business-events';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';


import {
  cleanText,
  datePlusDays,
  ensureCompanyDefaults,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  nextDocumentNumber,
  nullableText,
  numberInput,
  optionalUuid,
  recordInvoicingActivity,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';

import {
  resolveInvoicingExchangeRate,
} from '@/lib/apps/invoicing/currencies';

import {
  resolveInvoicingTaxTreatment,
} from '@/lib/apps/invoicing/tax-engine';

import {
  queueInvoiceForEtimsIfEnabled,
} from '@/lib/apps/invoicing/etims';


function plainObject(
  value:
    unknown,
):
  Record<string, unknown> {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<string, unknown>
    : {};
}


function invoicingAutomationRuntime(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
) {
  return {
    userId:
      context.userId,
    sessionId:
      context.permissions
        .sessionId,
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    accessibleModuleKeys: [
      ...new Set([
        'invoicing',
        ...context.permissions
          .permissions
          .map(
            permission =>
              permission.moduleKey
                ?.trim()
                .toLowerCase() ||
              '',
          )
          .filter(
            Boolean,
          ),
      ]),
    ],
    permissionSet:
      context.permissions
        .permissionSet,
    isOwner:
      context.permissions
        .isOwner,
  };
}


async function emitInvoicingAutomationEvent(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input: {
    triggerKey:
      string;
    recordType:
      string;
    recordId:
      string;
    idempotencySeed:
      string;
    payload?:
      Record<
        string,
        unknown
      >;
  },
) {
  await dispatchBusinessAutomationEventSafely({
    runtime:
      invoicingAutomationRuntime(
        context,
      ),
    moduleKey:
      'invoicing',
    triggerKey:
      input.triggerKey,
    recordType:
      input.recordType,
    recordId:
      input.recordId,
    payload:
      input.payload ||
      {},
    idempotencySeed:
      input.idempotencySeed,
  });
}


function assertInvoiceCompositionAccess(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  lines:
    unknown,
) {
  const customerAccess =
    context.permissions
      .isOwner ||
    permissionContextHas(
      context.permissions,
      INVOICING_PERMISSIONS
        .CUSTOMER_VIEW,
    ) ||
    permissionContextHas(
      context.permissions,
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  if (
    !customerAccess
  ) {
    throw new InvoicingError(
      'INVOICING_PERMISSION_REQUIRED',
      'Customer access is required to create or edit an invoice.',
      {
        permission:
          INVOICING_PERMISSIONS
            .CUSTOMER_VIEW,
      },
    );
  }

  const usesCatalog =
    Array.isArray(
      lines,
    ) &&
    lines.some(
      line =>
        Boolean(
          line &&
          typeof line ===
            'object' &&
          !Array.isArray(
            line,
          ) &&
          (
            line as
              Record<
                string,
                unknown
              >
          ).catalogItemId,
        ),
    );

  if (
    !usesCatalog
  ) {
    return;
  }

  const catalogAccess =
    context.permissions
      .isOwner ||
    permissionContextHas(
      context.permissions,
      INVOICING_PERMISSIONS
        .CATALOG_VIEW,
    ) ||
    permissionContextHas(
      context.permissions,
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  if (
    !catalogAccess
  ) {
    throw new InvoicingError(
      'INVOICING_PERMISSION_REQUIRED',
      'Catalog access is required to use saved products or services on an invoice.',
      {
        permission:
          INVOICING_PERMISSIONS
            .CATALOG_VIEW,
      },
    );
  }
}


function normalizedName(
  value:
    unknown,
  maxLength =
    255,
) {
  return cleanText(
    value,
    maxLength,
  )
    .replace(
      /\s+/g,
      ' ',
    )
    .toLowerCase();
}


function normalizedEmail(
  value:
    unknown,
) {
  const email =
    cleanText(
      value,
      255,
    )
      .toLowerCase();

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Enter a valid customer email address.',
    );
  }

  return email;
}


function normalizedPhone(
  value:
    unknown,
) {
  return cleanText(
    value,
    60,
  )
    .replace(
      /[^0-9+]/g,
      '',
    );
}


function normalizedTaxId(
  value:
    unknown,
) {
  return cleanText(
    value,
    120,
  )
    .toUpperCase();
}


async function lockMasterIdentity(
  client:
    PoolClient,
  key:
    string,
) {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext(
            $1
          )
        )
    `,
    [
      key,
    ],
  );
}


async function recordMasterDataActivity(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    model: string;
    recordId: string;
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
        $1,$2,$3,$4,$5,$6,$7::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.model,
      input.recordId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}


async function resolvePaymentTermId(
  client:
    PoolClient,
  companyId:
    string,
  value:
    unknown,
  allowInactive =
    false,
) {
  const requested =
    optionalUuid(
      value,
    );

  if (!requested) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_payment_terms
        WHERE id = $1
          AND company_id = $2
          AND (
            is_active = TRUE
            OR $3 = TRUE
          )
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        requested,
        companyId,
        allowInactive,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active payment term for this company.',
    );
  }

  return requested;
}


async function resolveTaxRateId(
  client:
    PoolClient,
  companyId:
    string,
  value:
    unknown,
  allowInactive =
    false,
) {
  const requested =
    optionalUuid(
      value,
    );

  if (!requested) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_tax_rates
        WHERE id = $1
          AND company_id = $2
          AND (
            is_active = TRUE
            OR $3 = TRUE
          )
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        requested,
        companyId,
        allowInactive,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active tax rate for this company.',
    );
  }

  return requested;
}


async function resolveTaxGroupId(
  client:
    PoolClient,
  companyId:
    string,
  value:
    unknown,
  allowInactive =
    false,
) {
  const requested =
    optionalUuid(
      value,
    );

  if (!requested) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_tax_groups
        WHERE id = $1
          AND company_id = $2
          AND (
            is_active = TRUE
            OR $3 = TRUE
          )
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        requested,
        companyId,
        allowInactive,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active tax group for this company.',
    );
  }

  return requested;
}


async function resolveFiscalPositionId(
  client:
    PoolClient,
  companyId:
    string,
  value:
    unknown,
) {
  const requested =
    optionalUuid(
      value,
    );

  if (!requested) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_fiscal_positions
        WHERE id = $1
          AND company_id = $2
          AND is_active = TRUE
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        requested,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active fiscal position.',
    );
  }

  return requested;
}


export async function createInvoicingCustomer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Customer name is required.',
    );
  }

  const email =
    normalizedEmail(
      input.email,
    );

  const phone =
    normalizedPhone(
      input.phone,
    );

  const taxId =
    normalizedTaxId(
      input.taxId,
    );

  const currency =
    cleanText(
      input.currency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Currency must be a three-letter code.',
    );
  }

  const customerTypeRaw =
    cleanText(
      input.customerType,
      30,
    );

  const customerType =
    [
      'individual',
      'company',
      'government',
      'non_profit',
    ].includes(
      customerTypeRaw,
    )
      ? customerTypeRaw
      : 'company';

  const countryCodeRaw =
    cleanText(
      input.countryCode,
      2,
    )
      .toUpperCase();

  if (
    countryCodeRaw &&
    !/^[A-Z]{2}$/.test(
      countryCodeRaw,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Country code must use two letters.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentTermsId =
      await resolvePaymentTermId(
        client,
        context.companyId,
        input.paymentTermsId,
      );

    const fiscalPositionId =
      await resolveFiscalPositionId(
        client,
        context.companyId,
        input.fiscalPositionId,
      );

    const identityKey =
      taxId
        ? [
            'invoicing-customer-tax',
            context.companyId,
            taxId,
          ].join(
            ':',
          )
        : [
            'invoicing-customer',
            context.companyId,
            normalizedName(
              name,
            ),
            email,
            phone,
          ].join(
            ':',
          );

    await lockMasterIdentity(
      client,
      identityKey,
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            name
          FROM invoicing_customers
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND (
              (
                $5 <> ''
                AND UPPER(
                  BTRIM(
                    COALESCE(
                      tax_id,
                      ''
                    )
                  )
                ) = $5
              )
              OR (
                LOWER(
                  REGEXP_REPLACE(
                    BTRIM(name),
                    '\\s+',
                    ' ',
                    'g'
                  )
                ) = $2
                AND LOWER(
                  BTRIM(
                    COALESCE(
                      email,
                      ''
                    )
                  )
                ) = $3
                AND REGEXP_REPLACE(
                  COALESCE(
                    phone,
                    ''
                  ),
                  '[^0-9+]',
                  '',
                  'g'
                ) = $4
                AND UPPER(
                  BTRIM(
                    COALESCE(
                      tax_id,
                      ''
                    )
                  )
                ) = $5
              )
            )
          LIMIT 1
        `,
        [
          context.companyId,
          normalizedName(
            name,
          ),
          email,
          phone,
          taxId,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_CUSTOMER',
        'This customer already exists. Open the existing customer instead of creating another copy.',
        {
          existingCustomerId:
            String(
              duplicate.rows[0].id,
            ),
          existingCustomerName:
            String(
              duplicate.rows[0].name,
            ),
        },
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO invoicing_customers (
            company_id,
            customer_type,
            name,
            legal_name,
            contact_name,
            email,
            phone,
            billing_address,
            shipping_address,
            city,
            state,
            postal_code,
            country,
            country_code,
            tax_id,
            registration_number,
            fiscal_position_id,
            currency,
            payment_terms_id,
            credit_limit,
            notes,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22
          )
          RETURNING
            id,
            name
        `,
        [
          context.companyId,
          customerType,
          name,
          nullableText(
            input.legalName,
            255,
          ),
          nullableText(
            input.contactName,
            255,
          ),
          email ||
            null,
          phone ||
            null,
          nullableText(
            input.billingAddress,
            4000,
          ),
          nullableText(
            input.shippingAddress,
            4000,
          ),
          nullableText(
            input.city,
            120,
          ),
          nullableText(
            input.state,
            120,
          ),
          nullableText(
            input.postalCode,
            40,
          ),
          nullableText(
            input.country,
            120,
          ),
          countryCodeRaw ||
            null,
          taxId ||
            null,
          nullableText(
            input.registrationNumber,
            120,
          ),
          fiscalPositionId,
          currency,
          paymentTermsId,
          input.creditLimit ===
            null ||
          input.creditLimit ===
            undefined ||
          input.creditLimit ===
            ''
            ? null
            : numberInput(
                input.creditLimit,
                'Credit limit',
              ),
          nullableText(
            input.notes,
            4000,
          ),
          context.userId,
        ],
      );

    const id =
      String(
        result.rows[0].id,
      );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.customer',
        recordId:
          id,
        type:
          'customer.created',
        content:
          'Billing customer ' +
          name +
          ' created.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id,
      name:
        String(
          result.rows[0].name,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateInvoicingCustomer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Customer name is required.',
    );
  }

  const email =
    normalizedEmail(
      input.email,
    );

  const phone =
    normalizedPhone(
      input.phone,
    );

  const taxId =
    normalizedTaxId(
      input.taxId,
    );

  const currency =
    cleanText(
      input.currency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Currency must be a three-letter code.',
    );
  }

  const customerTypeRaw =
    cleanText(
      input.customerType,
      30,
    );

  const customerType =
    [
      'individual',
      'company',
      'government',
      'non_profit',
    ].includes(
      customerTypeRaw,
    )
      ? customerTypeRaw
      : 'company';

  const countryCodeRaw =
    cleanText(
      input.countryCode,
      2,
    )
      .toUpperCase();

  if (
    countryCodeRaw &&
    !/^[A-Z]{2}$/.test(
      countryCodeRaw,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Country code must use two letters.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentTermsId =
      await resolvePaymentTermId(
        client,
        context.companyId,
        input.paymentTermsId,
        true,
      );

    const identityKey =
      taxId
        ? [
            'invoicing-customer-tax',
            context.companyId,
            taxId,
          ].join(
            ':',
          )
        : [
            'invoicing-customer',
            context.companyId,
            normalizedName(
              name,
            ),
            email,
            phone,
          ].join(
            ':',
          );

    const fiscalPositionId =
      await resolveFiscalPositionId(
        client,
        context.companyId,
        input.fiscalPositionId,
      );

    await lockMasterIdentity(
      client,
      identityKey,
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            name
          FROM invoicing_customers
          WHERE company_id = $1
            AND id <> $2
            AND deleted_at IS NULL
            AND (
              (
                $6 <> ''
                AND UPPER(
                  BTRIM(
                    COALESCE(
                      tax_id,
                      ''
                    )
                  )
                ) = $6
              )
              OR (
                LOWER(
                  REGEXP_REPLACE(
                    BTRIM(name),
                    '\\s+',
                    ' ',
                    'g'
                  )
                ) = $3
                AND LOWER(
                  BTRIM(
                    COALESCE(
                      email,
                      ''
                    )
                  )
                ) = $4
                AND REGEXP_REPLACE(
                  COALESCE(
                    phone,
                    ''
                  ),
                  '[^0-9+]',
                  '',
                  'g'
                ) = $5
                AND UPPER(
                  BTRIM(
                    COALESCE(
                      tax_id,
                      ''
                    )
                  )
                ) = $6
              )
            )
          LIMIT 1
        `,
        [
          context.companyId,
          customerId,
          normalizedName(
            name,
          ),
          email,
          phone,
          taxId,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_CUSTOMER',
        'Another customer already uses these billing identity details.',
        {
          existingCustomerId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    const result =
      await client.query(
        `
          UPDATE invoicing_customers
          SET
            customer_type = $3,
            name = $4,
            legal_name = $5,
            contact_name = $6,
            email = $7,
            phone = $8,
            billing_address = $9,
            shipping_address = $10,
            city = $11,
            state = $12,
            postal_code = $13,
            country = $14,
            country_code = $15,
            tax_id = $16,
            registration_number = $17,
            fiscal_position_id = $18,
            currency = $19,
            payment_terms_id = $20,
            credit_limit = $21,
            notes = $22,
            updated_by = $23,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          RETURNING id, name, status
        `,
        [
          customerId,
          context.companyId,
          customerType,
          name,
          nullableText(
            input.legalName,
            255,
          ),
          nullableText(
            input.contactName,
            255,
          ),
          email ||
            null,
          phone ||
            null,
          nullableText(
            input.billingAddress,
            4000,
          ),
          nullableText(
            input.shippingAddress,
            4000,
          ),
          nullableText(
            input.city,
            120,
          ),
          nullableText(
            input.state,
            120,
          ),
          nullableText(
            input.postalCode,
            40,
          ),
          nullableText(
            input.country,
            120,
          ),
          countryCodeRaw ||
            null,
          taxId ||
            null,
          nullableText(
            input.registrationNumber,
            120,
          ),
          fiscalPositionId,
          currency,
          paymentTermsId,
          input.creditLimit ===
            null ||
          input.creditLimit ===
            undefined ||
          input.creditLimit ===
            ''
            ? null
            : numberInput(
                input.creditLimit,
                'Credit limit',
              ),
          nullableText(
            input.notes,
            4000,
          ),
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CUSTOMER_NOT_FOUND',
        'Customer was not found.',
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.customer',
        recordId:
          customerId,
        type:
          'customer.updated',
        content:
          'Billing customer ' +
          name +
          ' updated.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        customerId,
      name:
        String(
          result.rows[0].name,
        ),
      status:
        String(
          result.rows[0].status,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function setInvoicingCustomerStatus(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const status =
    cleanText(
      input.status,
      30,
    );

  if (
    ![
      'active',
      'inactive',
      'blocked',
    ].includes(
      status,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid customer status.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          UPDATE invoicing_customers
          SET
            status = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          RETURNING id, name
        `,
        [
          customerId,
          context.companyId,
          status,
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CUSTOMER_NOT_FOUND',
        'Customer was not found.',
      );
    }

    if (
      status !==
        'active'
    ) {
      await client.query(
        `
          UPDATE invoicing_recurring_templates
          SET
            status = 'paused',
            updated_by = $3,
            updated_at = NOW()
          WHERE company_id = $1
            AND customer_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          customerId,
          context.userId,
        ],
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.customer',
        recordId:
          customerId,
        type:
          'customer.status_changed',
        content:
          'Billing customer ' +
          String(
            result.rows[0].name,
          ) +
          ' changed to ' +
          status +
          '.',
        metadata: {
          status,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        customerId,
      status,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function createInvoicingCatalogItem(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Item name is required.',
    );
  }

  const itemType =
    cleanText(
      input.itemType,
      30,
    ) ===
      'product'
      ? 'product'
      : 'service';

  const sku =
    cleanText(
      input.sku,
      120,
    );

  const unit =
    cleanText(
      input.unit,
      40,
    ) ||
    'unit';

  const unitPrice =
    numberInput(
      input.unitPrice,
      'Unit price',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const taxRateId =
      await resolveTaxRateId(
        client,
        context.companyId,
        input.taxRateId,
      );

    const taxGroupId =
      await resolveTaxGroupId(
        client,
        context.companyId,
        input.taxGroupId,
      );

    const taxCategory =
      cleanText(
        input.taxCategory,
        80,
      ) ||
      null;

    const effectiveTaxRateId =
      taxGroupId
        ? null
        : taxRateId;

    const identityKey =
      sku
        ? [
            'invoicing-item-sku',
            context.companyId,
            sku.toLowerCase(),
          ].join(
            ':',
          )
        : [
            'invoicing-item',
            context.companyId,
            itemType,
            normalizedName(
              name,
            ),
            unit.toLowerCase(),
            unitPrice,
          ].join(
            ':',
          );

    await lockMasterIdentity(
      client,
      identityKey,
    );

    const duplicate =
      await client.query(
        `
          SELECT id, name
          FROM invoicing_catalog_items
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND (
              (
                $4 <> ''
                AND LOWER(
                  BTRIM(
                    COALESCE(
                      sku,
                      ''
                    )
                  )
                ) = $4
              )
              OR (
                item_type = $2
                AND LOWER(
                  REGEXP_REPLACE(
                    BTRIM(name),
                    '\\s+',
                    ' ',
                    'g'
                  )
                ) = $3
                AND LOWER(
                  BTRIM(unit)
                ) = $5
                AND unit_price = $6
              )
            )
          LIMIT 1
        `,
        [
          context.companyId,
          itemType,
          normalizedName(
            name,
          ),
          sku.toLowerCase(),
          unit.toLowerCase(),
          unitPrice,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_CATALOG_ITEM',
        'This invoice item already exists. Edit the existing item instead of creating another copy.',
        {
          existingItemId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO invoicing_catalog_items (
            company_id,
            item_type,
            name,
            sku,
            description,
            unit,
            unit_price,
            tax_category,
            default_tax_rate_id,
            default_tax_group_id,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
          )
          RETURNING
            id,
            name
        `,
        [
          context.companyId,
          itemType,
          name,
          sku ||
            null,
          nullableText(
            input.description,
            4000,
          ),
          unit,
          unitPrice,
          taxCategory,
          effectiveTaxRateId,
          taxGroupId,
          context.userId,
        ],
      );

    const id =
      String(
        result.rows[0].id,
      );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.catalog_item',
        recordId:
          id,
        type:
          'catalog_item.created',
        content:
          'Invoice item ' +
          name +
          ' created.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id,
      name:
        String(
          result.rows[0].name,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateInvoicingCatalogItem(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  const itemId =
    requireUuid(
      input.itemId,
      'Item',
    );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Item name is required.',
    );
  }

  const itemType =
    cleanText(
      input.itemType,
      30,
    ) ===
      'product'
      ? 'product'
      : 'service';

  const sku =
    cleanText(
      input.sku,
      120,
    );

  const unit =
    cleanText(
      input.unit,
      40,
    ) ||
    'unit';

  const unitPrice =
    numberInput(
      input.unitPrice,
      'Unit price',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const taxRateId =
      await resolveTaxRateId(
        client,
        context.companyId,
        input.taxRateId,
        true,
      );

    const taxGroupId =
      await resolveTaxGroupId(
        client,
        context.companyId,
        input.taxGroupId,
        true,
      );

    const taxCategory =
      cleanText(
        input.taxCategory,
        80,
      ) ||
      null;

    const effectiveTaxRateId =
      taxGroupId
        ? null
        : taxRateId;

    await lockMasterIdentity(
      client,
      sku
        ? [
            'invoicing-item-sku',
            context.companyId,
            sku.toLowerCase(),
          ].join(
            ':',
          )
        : [
            'invoicing-item',
            context.companyId,
            itemType,
            normalizedName(
              name,
            ),
            unit.toLowerCase(),
            unitPrice,
          ].join(
            ':',
          ),
    );

    const duplicate =
      await client.query(
        `
          SELECT id
          FROM invoicing_catalog_items
          WHERE company_id = $1
            AND id <> $2
            AND deleted_at IS NULL
            AND (
              (
                $5 <> ''
                AND LOWER(
                  BTRIM(
                    COALESCE(
                      sku,
                      ''
                    )
                  )
                ) = $5
              )
              OR (
                item_type = $3
                AND LOWER(
                  REGEXP_REPLACE(
                    BTRIM(name),
                    '\\s+',
                    ' ',
                    'g'
                  )
                ) = $4
                AND LOWER(
                  BTRIM(unit)
                ) = $6
                AND unit_price = $7
              )
            )
          LIMIT 1
        `,
        [
          context.companyId,
          itemId,
          itemType,
          normalizedName(
            name,
          ),
          sku.toLowerCase(),
          unit.toLowerCase(),
          unitPrice,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_CATALOG_ITEM',
        'Another invoice item already uses these details.',
        {
          existingItemId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    const result =
      await client.query(
        `
          UPDATE invoicing_catalog_items
          SET
            item_type = $3,
            name = $4,
            sku = $5,
            description = $6,
            unit = $7,
            unit_price = $8,
            tax_category = $9,
            default_tax_rate_id = $10,
            default_tax_group_id = $11,
            updated_by = $12,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          RETURNING id, name, is_active
        `,
        [
          itemId,
          context.companyId,
          itemType,
          name,
          sku ||
            null,
          nullableText(
            input.description,
            4000,
          ),
          unit,
          unitPrice,
          taxCategory,
          effectiveTaxRateId,
          taxGroupId,
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice item was not found.',
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.catalog_item',
        recordId:
          itemId,
        type:
          'catalog_item.updated',
        content:
          'Invoice item ' +
          name +
          ' updated.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        itemId,
      name:
        String(
          result.rows[0].name,
        ),
      isActive:
        result.rows[0]
          .is_active !==
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function setInvoicingCatalogItemActive(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  const itemId =
    requireUuid(
      input.itemId,
      'Item',
    );

  const isActive =
    input.isActive ===
      true;

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_catalog_items
        SET
          is_active = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        RETURNING id, name
      `,
      [
        itemId,
        context.companyId,
        isActive,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Invoice item was not found.',
    );
  }

  return {
    id:
      itemId,
    isActive,
  };
}


export async function normalizeInvoicingLines(
  client:
    PoolClient,
  companyId:
    string,
  customerId:
    string,
  invoiceDate:
    string,
  linesInput:
    unknown,
  taxCalculation:
    'exclusive' |
    'inclusive',
) {
  if (
    !Array.isArray(
      linesInput,
    ) ||
    linesInput.length <
      1 ||
    linesInput.length >
      100
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'An invoice needs between 1 and 100 line items.',
    );
  }

  const normalized:
    Array<{
      catalogItemId: string | null;
      description: string;
      sku: string | null;
      unit: string;
      quantity: number;
      unitPrice: number;
      discountType:
        'percent' |
        'fixed';
      discountValue: number;
      discountAmount: number;
      taxRateId: string | null;
      taxGroupId: string | null;
      taxName: string | null;
      taxRate: number;
      taxAmount: number;
      taxComponents:
        unknown[];
      fiscalPositionId:
        string |
        null;
      localizationId:
        string |
        null;
      exemptionId:
        string |
        null;
      taxSource:
        string;
      subtotal: number;
      lineTotal: number;
      sortOrder: number;
    }> =
      [];

  for (
    let index =
      0;
    index <
      linesInput.length;
    index +=
      1
  ) {
    const raw =
      (
        linesInput[index] &&
        typeof linesInput[index] ===
          'object' &&
        !Array.isArray(
          linesInput[index],
        )
      )
        ? linesInput[index] as
            CreateInvoiceLineInput
        : {};

    const catalogItemId =
      optionalUuid(
        raw.catalogItemId,
      );

    let catalog:
      Record<
        string,
        unknown
      > |
      null =
        null;

    if (
      catalogItemId
    ) {
      const result =
        await client.query(
          `
            SELECT
              id,
              name,
              sku,
              description,
              unit,
              unit_price
            FROM invoicing_catalog_items
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND is_active =
                  TRUE
              AND deleted_at
                  IS NULL
            LIMIT 1
          `,
          [
            catalogItemId,
            companyId,
          ],
        );

      if (
        result.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Choose a valid active invoice item.',
          {
            line:
              index +
              1,
          },
        );
      }

      catalog =
        result.rows[0];
    }

    const description =
      cleanText(
        raw.description ||
        catalog
          ?.description ||
        catalog
          ?.name,
        2000,
      );

    if (
      !description
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Every invoice line needs a description.',
      );
    }

    const quantity =
      numberInput(
        raw.quantity ??
        1,
        'Quantity',
        {
          min:
            0.0001,
          max:
            1_000_000,
        },
      );

    const unitPrice =
      numberInput(
        raw.unitPrice ??
        catalog
          ?.unit_price ??
        0,
        'Unit price',
      );

    const discountType:
      'percent' |
      'fixed' =
        raw.discountType ===
          'fixed'
          ? 'fixed'
          : 'percent';

    const discountValue =
      numberInput(
        raw.discountValue ??
        0,
        'Discount',
        {
          max:
            discountType ===
              'percent'
              ? 100
              : 1_000_000_000_000,
        },
      );

    const gross =
      quantity *
      unitPrice;

    const discountAmount =
      discountType ===
        'percent'
        ? gross *
          discountValue /
          100
        : Math.min(
            gross,
            discountValue,
          );

    const discountedAmount =
      Math.max(
        0,
        gross -
        discountAmount,
      );

    const taxTreatment =
      await resolveInvoicingTaxTreatment(
        client,
        {
          companyId,
          customerId,
          catalogItemId,
          explicitTaxRateId:
            optionalUuid(
              raw.taxRateId,
            ),
          explicitTaxGroupId:
            optionalUuid(
              raw.taxGroupId,
            ),
          explicitTaxRate:
            raw.taxRate ===
              undefined ||
            raw.taxRate ===
              null ||
            raw.taxRate ===
              ''
              ? null
              : numberInput(
                  raw.taxRate,
                  'Tax rate',
                  {
                    min:
                      0,
                    max:
                      100,
                  },
                ),
          invoiceDate,
          taxCalculation,
          taxableAmount:
            discountedAmount,
        },
      );

    normalized.push({
      catalogItemId,
      description,
      sku:
        nullableText(
          raw.sku ||
          catalog?.sku,
          120,
        ),
      unit:
        cleanText(
          raw.unit ||
          catalog?.unit ||
          'unit',
          40,
        ) ||
        'unit',
      quantity,
      unitPrice,
      discountType,
      discountValue,
      discountAmount:
        money(
          discountAmount,
        ),
      taxRateId:
        taxTreatment
          .taxRateId,
      taxGroupId:
        taxTreatment
          .taxGroupId,
      taxName:
        taxTreatment
          .taxName,
      taxRate:
        taxTreatment
          .taxRate,
      taxAmount:
        taxTreatment
          .taxAmount,
      taxComponents:
        taxTreatment
          .components,
      fiscalPositionId:
        taxTreatment
          .fiscalPositionId,
      localizationId:
        taxTreatment
          .localizationId,
      exemptionId:
        taxTreatment
          .exemptionId,
      taxSource:
        taxTreatment
          .source,
      subtotal:
        money(
          gross,
        ),
      lineTotal:
        taxTreatment
          .lineTotal,
      sortOrder:
        index,
    });
  }

  return normalized;
}


async function resolveInvoiceTemplateId(
  client:
    PoolClient,
  companyId:
    string,
  requested:
    unknown,
  fallback:
    unknown,
) {
  const candidate =
    optionalUuid(
      requested,
    ) ||
    optionalUuid(
      fallback,
    );

  if (
    !candidate
  ) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM invoicing_templates
        WHERE id =
              $1
          AND company_id =
              $2
          AND is_active =
              TRUE
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        candidate,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active invoice template.',
    );
  }

  return String(
    result.rows[0].id,
  );
}


async function invoiceExchangeRate(
  client:
    PoolClient,
  companyId:
    string,
  currency:
    string,
  baseCurrency:
    string,
  effectiveDate:
    string,
  input:
    unknown,
) {
  return resolveInvoicingExchangeRate(
    client,
    {
      companyId,
      currency,
      baseCurrency,
      effectiveDate,
      manualRate:
        input,
    },
  );
}


export async function createInvoice(
  input:
    CreateInvoiceInput,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_CREATE,
    );

  assertInvoiceCompositionAccess(
    context,
    input.lines,
  );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const customerId =
      requireUuid(
        input.customerId,
        'Customer',
      );

    const customerResult =
      await client.query(
        `
          SELECT
            c.id,
            c.name,
            c.email,
            c.phone,
            c.billing_address,
            c.shipping_address,
            c.tax_id,
            c.currency,
            c.payment_terms_id,
            pt.name
              AS payment_terms_name,
            pt.due_days
          FROM invoicing_customers c
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               c.company_id
           AND pt.deleted_at
               IS NULL
          WHERE c.id =
                $1
            AND c.company_id =
                $2
            AND c.status =
                'active'
            AND c.deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          customerId,
          context.companyId,
        ],
      );

    if (
      customerResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CUSTOMER_NOT_FOUND',
        'Choose an active customer.',
      );
    }

    const settingsResult =
      await client.query(
        `
          SELECT *
          FROM invoicing_settings
          WHERE company_id =
                $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0] ||
      {};

    const templateId =
      await resolveInvoiceTemplateId(
        client,
        context.companyId,
        input.templateId,
        settings.default_template_id,
      );

    const invoiceDate =
      isoDate(
        input.invoiceDate,
        new Date(),
      );

    const taxCalculation:
      'exclusive' |
      'inclusive' =
        settings.tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive';

    let dueDays =
      Number(
        settings.default_due_days ||
        30,
      );

    if (
      customerResult.rows[0]
        .payment_terms_id
    ) {
      dueDays =
        Number(
          customerResult.rows[0]
            .due_days ||
          dueDays,
        );
    }

    const dueDate =
      input.dueDate
        ? isoDate(
            input.dueDate,
          )
        : datePlusDays(
            invoiceDate,
            dueDays,
          );

    if (
      dueDate <
      invoiceDate
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Due date cannot be before invoice date.',
      );
    }

    const serviceDate =
      input.serviceDate
        ? isoDate(
            input.serviceDate,
          )
        : null;

    const shipToAddress =
      typeof input.shippingAddress ===
        'string'
        ? nullableText(
            input.shippingAddress,
            4000,
          )
        : nullableText(
            customerResult.rows[0]
              .shipping_address,
            4000,
          );

    const lines =
      await normalizeInvoicingLines(
        client,
        context.companyId,
        customerId,
        invoiceDate,
        input.lines,
        taxCalculation,
      );

    const fiscalPositionId =
      lines.find(
        line =>
          Boolean(
            line.fiscalPositionId,
          ),
      )
        ?.fiscalPositionId ||
      null;

    const taxLocalizationId =
      lines.find(
        line =>
          Boolean(
            line.localizationId,
          ),
      )
        ?.localizationId ||
      null;

    const taxContext =
      JSON.stringify({
        engineVersion:
          '2.16.0',
        fiscalPositionId,
        taxLocalizationId,
        exemptionIds: [
          ...new Set(
            lines
              .map(
                line =>
                  line.exemptionId,
              )
              .filter(
                Boolean,
              ),
          ),
        ],
        sources: [
          ...new Set(
            lines.map(
              line =>
                line.taxSource,
            ),
          ),
        ],
      });

    const subtotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.subtotal,
          0,
        ),
      );

    const discountTotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.discountAmount,
          0,
        ),
      );

    const taxTotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.taxAmount,
          0,
        ),
      );

    const shippingTotal =
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const rounding =
      Number(
        input.roundingAdjustment ??
        0,
      );

    if (
      !Number.isFinite(
        rounding,
      ) ||
      Math.abs(
        rounding,
      ) >
        1_000_000
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Rounding adjustment is invalid.',
      );
    }

    const roundingAdjustment =
      money(
        rounding,
      );

    const totalAmount =
      money(
        subtotal -
        discountTotal +
        (
          taxCalculation ===
            'exclusive'
            ? taxTotal
            : 0
        ) +
        shippingTotal +
        roundingAdjustment,
      );

    if (
      totalAmount <
      0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice total cannot be negative.',
      );
    }

    const invoiceNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'invoice',
      );

    const currency =
      cleanText(
        input.currency ||
        customerResult.rows[0].currency ||
        settings.default_currency ||
        context.company
          .currentCompany.currency ||
        'KES',
        3,
      ).toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const baseCurrency =
      cleanText(
        settings.base_currency ||
        context.company
          .currentCompany.currency ||
        settings.default_currency ||
        'KES',
        3,
      ).toUpperCase();

    const exchangeRateResolution =
      await invoiceExchangeRate(
        client,
        context.companyId,
        currency,
        baseCurrency,
        invoiceDate,
        input.exchangeRate,
      );

    const exchangeRate =
      exchangeRateResolution
        .rate;

    const confirmAllowed =
      context.permissions.isOwner ||
      permissionContextHas(
        context.permissions,
        INVOICING_PERMISSIONS
          .INVOICE_CONFIRM,
      );

    const requiresApproval =
      settings.require_approval ===
        true;

    const wantsPosting =
      input.confirm ===
        true;

    const status =
      wantsPosting &&
      requiresApproval
        ? 'pending_approval'
        : wantsPosting &&
            confirmAllowed
          ? 'confirmed'
          : 'draft';

    const invoiceResult =
      await client.query(
        `
          INSERT INTO invoicing_invoices (
            company_id,
            customer_id,
            bill_to_name,
            bill_to_email,
            bill_to_phone,
            bill_to_address,
            bill_to_tax_id,
            payment_terms_name_snapshot,
            tax_calculation,
            template_id,
            invoice_number,
            status,
            invoice_date,
            due_date,
            currency,
            reference,
            purchase_order_number,
            service_date,
            ship_to_address,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            rounding_adjustment,
            total_amount,
            notes,
            terms,
            payment_instructions,
            confirmed_at,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12::varchar(30),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
            $23,$24,$25,$26,$27,$28,
            CASE
              WHEN $12::varchar(30) =
                   'confirmed'
              THEN NOW()
              ELSE NULL
            END,
            $29,$29
          )
          RETURNING
            id,
            invoice_number,
            status
        `,
        [
          context.companyId,
          customerId,
          nullableText(
            customerResult.rows[0].name,
            255,
          ),
          nullableText(
            customerResult.rows[0].email,
            255,
          ),
          nullableText(
            customerResult.rows[0].phone,
            60,
          ),
          nullableText(
            customerResult.rows[0].billing_address,
            4000,
          ),
          nullableText(
            customerResult.rows[0].tax_id,
            120,
          ),
          nullableText(
            customerResult.rows[0].payment_terms_name,
            140,
          ),
          taxCalculation,
          templateId,
          invoiceNumber,
          status,
          invoiceDate,
          dueDate,
          currency,
          nullableText(
            input.reference,
            255,
          ),
          nullableText(
            input.purchaseOrderNumber,
            180,
          ),
          serviceDate,
          shipToAddress,
          subtotal,
          discountTotal,
          taxTotal,
          shippingTotal,
          roundingAdjustment,
          totalAmount,
          nullableText(
            input.notes,
            5000,
          ),
          nullableText(
            input.terms ||
            settings.terms_and_conditions,
            10000,
          ),
          nullableText(
            settings.payment_instructions,
            10000,
          ),
          context.userId,
        ],
      );

    const invoiceId =
      String(
        invoiceResult.rows[0].id,
      );

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          exchange_rate = $3,
          base_currency = $6,
          exchange_rate_date = $7,
          exchange_rate_source = $8,
          fiscal_position_id = $9,
          tax_localization_id = $10,
          tax_context = $11::jsonb,
          submitted_at =
            CASE
              WHEN $4::varchar(30) =
                   'pending_approval'
              THEN COALESCE(
                submitted_at,
                NOW()
              )
              ELSE submitted_at
            END,
          submitted_by =
            CASE
              WHEN $4::varchar(30) =
                   'pending_approval'
              THEN COALESCE(
                submitted_by,
                $5::uuid
              )
              ELSE submitted_by
            END
        WHERE id = $1
          AND company_id = $2
      `,
      [
        invoiceId,
        context.companyId,
        exchangeRate,
        status,
        context.userId,
        baseCurrency,
        exchangeRateResolution
          .effectiveDate,
        exchangeRateResolution
          .sourceName ||
        exchangeRateResolution
          .source,
        fiscalPositionId,
        taxLocalizationId,
        taxContext,
      ],
    );

    for (
      const line
      of lines
    ) {
      await client.query(
        `
          INSERT INTO invoicing_invoice_items (
            invoice_id,
            company_id,
            catalog_item_id,
            sort_order,
            description,
            sku_snapshot,
            unit,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            discount_amount,
            tax_rate_id,
            tax_group_id,
            tax_name_snapshot,
            tax_rate,
            tax_amount,
            tax_components,
            subtotal,
            line_total
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20
          )
        `,
        [
          invoiceId,
          context.companyId,
          line.catalogItemId,
          line.sortOrder,
          line.description,
          line.sku,
          line.unit,
          line.quantity,
          line.unitPrice,
          line.discountType,
          line.discountValue,
          line.discountAmount,
          line.taxRateId,
          line.taxGroupId,
          line.taxName,
          line.taxRate,
          line.taxAmount,
          JSON.stringify(
            line.taxComponents,
          ),
          line.subtotal,
          line.lineTotal,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO invoicing_status_history (
          invoice_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,$3,$4,$5
        )
      `,
      [
        invoiceId,
        context.companyId,
        status,
        status ===
          'pending_approval'
          ? 'Invoice created and submitted for approval'
          : status ===
              'confirmed'
            ? 'Invoice created and confirmed'
            : 'Invoice created',
        context.userId,
      ],
    );

    if (
      status ===
        'confirmed'
    ) {
      await postInvoiceConfirmationToAccounting(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );

      await queueInvoiceForEtimsIfEnabled(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );

      await createPrimaryInvoiceDocumentSnapshot(
        client,
        {
          companyId:
            context.companyId,
          invoiceId,
          userId:
            context.userId,
          reason:
            'confirmed',
        },
      );
    }

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.created',
        content:
          'Invoice ' +
          invoiceNumber +
          ' created.',
        metadata: {
          status,
          totalAmount,
          currency,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.invoice.created',
        recordType:
          'invoice',
        recordId:
          invoiceId,
        idempotencySeed:
          'created:' +
          invoiceId,
        payload: {
          invoiceNumber,
          status,
          totalAmount,
          currency,
          exchangeRate,
        },
      },
    );

    if (
      status ===
        'confirmed'
    ) {
      await emitInvoicingAutomationEvent(
        context,
        {
          triggerKey:
            'invoicing.invoice.confirmed',
          recordType:
            'invoice',
          recordId:
            invoiceId,
          idempotencySeed:
            'confirmed:' +
            invoiceId,
          payload: {
            invoiceNumber,
            totalAmount,
            currency,
          },
        },
      );
    }

    if (
      status ===
        'pending_approval'
    ) {
      await emitInvoicingAutomationEvent(
        context,
        {
          triggerKey:
            'invoicing.invoice.approval_submitted',
          recordType:
            'invoice',
          recordId:
            invoiceId,
          idempotencySeed:
            'approval-submitted:' +
            invoiceId,
          payload: {
            invoiceNumber,
            totalAmount,
            currency,
          },
        },
      );
    }

    return {
      id:
        invoiceId,
      invoiceNumber,
      status,
      totalAmount,
      currency,
      exchangeRate,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function duplicateInvoice(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_CREATE,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const source =
    await context.pool.query(
      `
        SELECT
          i.customer_id,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.service_date,
          i.ship_to_address,
          i.shipping_total,
          i.rounding_adjustment,
          i.notes,
          i.terms,
          i.template_id,
          c.status
            AS customer_status
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
        WHERE i.id = $1
          AND i.company_id = $2
          AND i.deleted_at IS NULL
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      [
        invoiceId,
        context.companyId,
      ],
    );

  if (
    source.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  if (
    source.rows[0]
      .customer_status !==
      'active'
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Activate the customer before duplicating this invoice.',
    );
  }

  const lines =
    await context.pool.query(
      `
        SELECT
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          tax_rate_id,
          tax_group_id,
          tax_rate
        FROM invoicing_invoice_items
        WHERE invoice_id = $1
          AND company_id = $2
        ORDER BY sort_order, id
      `,
      [
        invoiceId,
        context.companyId,
      ],
    );

  if (
    lines.rows.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The source invoice has no line items to duplicate.',
    );
  }

  return createInvoice({
    customerId:
      source.rows[0]
        .customer_id,
    currency:
      source.rows[0]
        .currency,
    templateId:
      source.rows[0]
        .template_id,
    reference:
      source.rows[0]
        .reference,
    purchaseOrderNumber:
      source.rows[0]
        .purchase_order_number,
    serviceDate:
      source.rows[0]
        .service_date,
    shippingAddress:
      source.rows[0]
        .ship_to_address,
    shippingTotal:
      source.rows[0]
        .shipping_total,
    roundingAdjustment:
      source.rows[0]
        .rounding_adjustment,
    notes:
      source.rows[0]
        .notes,
    terms:
      source.rows[0]
        .terms,
    confirm:
      false,
    lines:
      lines.rows.map(
        line => ({
          catalogItemId:
            line.catalog_item_id ||
            undefined,
          description:
            String(
              line.description,
            ),
          sku:
            line.sku_snapshot ||
            undefined,
          unit:
            String(
              line.unit ||
              'unit',
            ),
          quantity:
            money(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          discountType:
            line.discount_type ===
              'fixed'
              ? 'fixed'
              : 'percent',
          discountValue:
            money(
              line.discount_value,
            ),
          taxRateId:
            line.tax_rate_id ||
            undefined,
          taxGroupId:
            line.tax_group_id ||
            undefined,
          taxRate:
            money(
              line.tax_rate,
            ),
        }),
      ),
  });
}


export async function updateInvoiceDraft(
  input:
    CreateInvoiceInput &
    {
      invoiceId?: unknown;
    },
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_EDIT,
    );

  assertInvoiceCompositionAccess(
    context,
    input.lines,
  );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const existing =
      await client.query(
        `
          SELECT
            id,
            invoice_number,
            status
          FROM invoicing_invoices
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          FOR UPDATE
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    if (
      String(
        existing.rows[0].status,
      ) !==
      'draft'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only draft invoices can be edited. Use payments, credit notes or cancellation after confirmation.',
      );
    }

    const customerId =
      requireUuid(
        input.customerId,
        'Customer',
      );

    const customerResult =
      await client.query(
        `
          SELECT
            c.id,
            c.name,
            c.email,
            c.phone,
            c.billing_address,
            c.shipping_address,
            c.tax_id,
            c.currency,
            c.payment_terms_id,
            pt.name
              AS payment_terms_name,
            pt.due_days
          FROM invoicing_customers c
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               c.company_id
           AND pt.deleted_at
               IS NULL
          WHERE c.id =
                $1
            AND c.company_id =
                $2
            AND c.status =
                'active'
            AND c.deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          customerId,
          context.companyId,
        ],
      );

    if (
      customerResult.rows.length !==
      1
    ) {
      throw new InvoicingError(
        'CUSTOMER_NOT_FOUND',
        'Choose an active customer.',
      );
    }

    const settingsResult =
      await client.query(
        `
          SELECT *
          FROM invoicing_settings
          WHERE company_id =
                $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0] ||
      {};

    const templateId =
      await resolveInvoiceTemplateId(
        client,
        context.companyId,
        input.templateId,
        settings.default_template_id,
      );

    const taxCalculation:
      'exclusive' |
      'inclusive' =
        settings.tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive';

    const invoiceDate =
      isoDate(
        input.invoiceDate,
        new Date(),
      );

    const dueDays =
      Number(
        customerResult.rows[0]
          .due_days ||
        settings.default_due_days ||
        30,
      );

    const dueDate =
      input.dueDate
        ? isoDate(
            input.dueDate,
          )
        : datePlusDays(
            invoiceDate,
            dueDays,
          );

    if (
      dueDate <
      invoiceDate
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Due date cannot be before invoice date.',
      );
    }

    const serviceDate =
      input.serviceDate
        ? isoDate(
            input.serviceDate,
          )
        : null;

    const shipToAddress =
      typeof input.shippingAddress ===
        'string'
        ? nullableText(
            input.shippingAddress,
            4000,
          )
        : nullableText(
            customerResult.rows[0]
              .shipping_address,
            4000,
          );

    const lines =
      await normalizeInvoicingLines(
        client,
        context.companyId,
        customerId,
        invoiceDate,
        input.lines,
        taxCalculation,
      );

    const fiscalPositionId =
      lines.find(
        line =>
          Boolean(
            line.fiscalPositionId,
          ),
      )
        ?.fiscalPositionId ||
      null;

    const taxLocalizationId =
      lines.find(
        line =>
          Boolean(
            line.localizationId,
          ),
      )
        ?.localizationId ||
      null;

    const taxContext =
      JSON.stringify({
        engineVersion:
          '2.16.0',
        fiscalPositionId,
        taxLocalizationId,
        exemptionIds: [
          ...new Set(
            lines
              .map(
                line =>
                  line.exemptionId,
              )
              .filter(
                Boolean,
              ),
          ),
        ],
        sources: [
          ...new Set(
            lines.map(
              line =>
                line.taxSource,
            ),
          ),
        ],
      });

    const subtotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.subtotal,
          0,
        ),
      );

    const discountTotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.discountAmount,
          0,
        ),
      );

    const taxTotal =
      money(
        lines.reduce(
          (
            sum,
            line,
          ) =>
            sum +
            line.taxAmount,
          0,
        ),
      );

    const shippingTotal =
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const rawRounding =
      Number(
        input.roundingAdjustment ??
        0,
      );

    if (
      !Number.isFinite(
        rawRounding,
      ) ||
      Math.abs(
        rawRounding,
      ) >
        1_000_000
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Rounding adjustment is invalid.',
      );
    }

    const roundingAdjustment =
      money(
        rawRounding,
      );

    const totalAmount =
      money(
        subtotal -
        discountTotal +
        (
          taxCalculation ===
            'exclusive'
            ? taxTotal
            : 0
        ) +
        shippingTotal +
        roundingAdjustment,
      );

    if (
      totalAmount <
      0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice total cannot be negative.',
      );
    }

    const currency =
      cleanText(
        input.currency ||
        customerResult.rows[0]
          .currency ||
        settings.default_currency ||
        context.company
          .currentCompany
          .currency ||
        'KES',
        3,
      ).toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const baseCurrency =
      cleanText(
        settings.base_currency ||
        context.company
          .currentCompany.currency ||
        settings.default_currency ||
        'KES',
        3,
      ).toUpperCase();

    const exchangeRateResolution =
      await invoiceExchangeRate(
        client,
        context.companyId,
        currency,
        baseCurrency,
        invoiceDate,
        input.exchangeRate,
      );

    const exchangeRate =
      exchangeRateResolution
        .rate;

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          customer_id =
            $3,
          bill_to_name =
            $4,
          bill_to_email =
            $5,
          bill_to_phone =
            $6,
          bill_to_address =
            $7,
          bill_to_tax_id =
            $8,
          payment_terms_name_snapshot =
            $9,
          tax_calculation =
            $10,
          template_id =
            $11,
          invoice_date =
            $12,
          due_date =
            $13,
          currency =
            $14,
          reference =
            $15,
          purchase_order_number =
            $16,
          service_date =
            $17,
          ship_to_address =
            $18,
          subtotal =
            $19,
          discount_total =
            $20,
          tax_total =
            $21,
          shipping_total =
            $22,
          rounding_adjustment =
            $23,
          total_amount =
            $24,
          notes =
            $25,
          terms =
            $26,
          payment_instructions =
            $27,
          updated_by =
            $28,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        customerId,
        nullableText(
          customerResult.rows[0].name,
          255,
        ),
        nullableText(
          customerResult.rows[0].email,
          255,
        ),
        nullableText(
          customerResult.rows[0].phone,
          60,
        ),
        nullableText(
          customerResult.rows[0]
            .billing_address,
          4000,
        ),
        nullableText(
          customerResult.rows[0].tax_id,
          120,
        ),
        nullableText(
          customerResult.rows[0]
            .payment_terms_name,
          140,
        ),
        taxCalculation,
        templateId,
        invoiceDate,
        dueDate,
        currency,
        nullableText(
          input.reference,
          255,
        ),
        nullableText(
          input.purchaseOrderNumber,
          180,
        ),
        serviceDate,
        shipToAddress,
        subtotal,
        discountTotal,
        taxTotal,
        shippingTotal,
        roundingAdjustment,
        totalAmount,
        nullableText(
          input.notes,
          5000,
        ),
        nullableText(
          input.terms ||
          settings.terms_and_conditions,
          10000,
        ),
        nullableText(
          settings.payment_instructions,
          10000,
        ),
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          exchange_rate = $3,
          base_currency = $4,
          exchange_rate_date = $5,
          exchange_rate_source = $6,
          fiscal_position_id = $7,
          tax_localization_id = $8,
          tax_context = $9::jsonb
        WHERE id = $1
          AND company_id = $2
      `,
      [
        invoiceId,
        context.companyId,
        exchangeRate,
        baseCurrency,
        exchangeRateResolution
          .effectiveDate,
        exchangeRateResolution
          .sourceName ||
        exchangeRateResolution
          .source,
        fiscalPositionId,
        taxLocalizationId,
        taxContext,
      ],
    );

    await client.query(
      `
        DELETE FROM invoicing_invoice_items
        WHERE invoice_id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
      ],
    );

    for (
      const line
      of lines
    ) {
      await client.query(
        `
          INSERT INTO invoicing_invoice_items (
            invoice_id,
            company_id,
            catalog_item_id,
            sort_order,
            description,
            sku_snapshot,
            unit,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            discount_amount,
            tax_rate_id,
            tax_group_id,
            tax_name_snapshot,
            tax_rate,
            tax_amount,
            tax_components,
            subtotal,
            line_total
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20
          )
        `,
        [
          invoiceId,
          context.companyId,
          line.catalogItemId,
          line.sortOrder,
          line.description,
          line.sku,
          line.unit,
          line.quantity,
          line.unitPrice,
          line.discountType,
          line.discountValue,
          line.discountAmount,
          line.taxRateId,
          line.taxGroupId,
          line.taxName,
          line.taxRate,
          line.taxAmount,
          JSON.stringify(
            line.taxComponents,
          ),
          line.subtotal,
          line.lineTotal,
        ],
      );
    }

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.draft_updated',
        content:
          'Invoice ' +
          String(
            existing.rows[0]
              .invoice_number,
          ) +
          ' draft updated.',
        metadata: {
          totalAmount,
          currency,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        invoiceId,
      invoiceNumber:
        String(
          existing.rows[0]
            .invoice_number,
        ),
      status:
        'draft',
      totalAmount,
      currency,
      exchangeRate,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}



export async function reconcileInvoiceSettlementStatus(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  invoiceId:
    string,
  reason:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          i.status,
          i.total_amount,
          COALESCE(
            (
              SELECT SUM(a.amount)
              FROM invoicing_payment_allocations a
              INNER JOIN invoicing_payments p
                ON p.id = a.payment_id
              WHERE a.invoice_id = i.id
                AND a.company_id = i.company_id
                AND a.status = 'posted'
                AND p.status = 'posted'
                AND p.deleted_at IS NULL
            ),
            0
          ) AS paid_amount,
          COALESCE(
            (
              SELECT SUM(app.amount)
              FROM invoicing_credit_note_applications app
              INNER JOIN invoicing_credit_notes cn
                ON cn.id = app.credit_note_id
               AND cn.company_id = app.company_id
              WHERE app.target_invoice_id = i.id
                AND app.company_id = i.company_id
                AND app.status = 'posted'
                AND cn.status <> 'cancelled'
                AND cn.deleted_at IS NULL
            ),
            0
          ) AS credited_amount,
          (
            SELECT h.from_status
            FROM invoicing_status_history h
            WHERE h.invoice_id = i.id
              AND h.company_id = i.company_id
              AND h.to_status IN (
                'partially_paid',
                'paid'
              )
              AND h.from_status IS NOT NULL
              AND h.from_status NOT IN (
                'partially_paid',
                'paid'
              )
            ORDER BY h.created_at DESC, h.id DESC
            LIMIT 1
          ) AS prior_open_status
        FROM invoicing_invoices i
        WHERE i.id = $1
          AND i.company_id = $2
          AND i.deleted_at IS NULL
        FOR UPDATE
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const row =
    result.rows[0];

  const currentStatus =
    String(
      row.status,
    );

  const totalAmount =
    money(
      row.total_amount,
    );

  const paidAmount =
    money(
      row.paid_amount,
    );

  const creditedAmount =
    money(
      row.credited_amount,
    );

  const balanceDue =
    money(
      Math.max(
        totalAmount -
        paidAmount -
        creditedAmount,
        0,
      ),
    );

  if (
    [
      'cancelled',
      'void',
      'written_off',
    ].includes(
      currentStatus,
    )
  ) {
    return {
      status:
        currentStatus,
      balanceDue,
    };
  }

  const openStatuses = [
    'confirmed',
    'sent',
    'viewed',
    'overdue',
  ];

  const priorOpenStatus =
    row.prior_open_status
      ? String(
          row.prior_open_status,
        )
      : '';

  let nextStatus =
    currentStatus;

  if (
    balanceDue <=
      0.0001
  ) {
    nextStatus =
      'paid';
  } else if (
    paidAmount >
      0.0001
  ) {
    nextStatus =
      'partially_paid';
  } else if (
    openStatuses.includes(
      priorOpenStatus,
    )
  ) {
    nextStatus =
      priorOpenStatus;
  } else if (
    openStatuses.includes(
      currentStatus,
    )
  ) {
    nextStatus =
      currentStatus;
  } else {
    nextStatus =
      'confirmed';
  }

  const paidInFull =
    paidAmount >=
    totalAmount -
      0.0001;

  if (
    nextStatus !==
      currentStatus ||
    (
      currentStatus ===
        'paid' &&
      !paidInFull
    )
  ) {
    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          status = $3::varchar(30),
          paid_at =
            CASE
              WHEN $3::varchar(30) = 'paid'
                AND $5 = TRUE
              THEN COALESCE(
                paid_at,
                NOW()
              )
              ELSE NULL
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        invoiceId,
        companyId,
        nextStatus,
        userId,
        paidInFull,
      ],
    );
  }

  if (
    nextStatus !==
      currentStatus
  ) {
    await client.query(
      `
        INSERT INTO invoicing_status_history (
          invoice_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        invoiceId,
        companyId,
        currentStatus,
        nextStatus,
        reason,
        userId,
      ],
    );
  }

  return {
    status:
      nextStatus,
    balanceDue,
  };
}


const ALLOWED_MANUAL_TRANSITIONS:
  Record<
    string,
    string[]
  > = {
    draft: [
      'pending_approval',
      'confirmed',
      'cancelled',
      'void',
    ],
    pending_approval: [
      'confirmed',
      'rejected',
      'cancelled',
      'void',
    ],
    rejected: [
      'draft',
      'pending_approval',
      'cancelled',
      'void',
    ],
    confirmed: [
      'cancelled',
      'void',
      'written_off',
    ],
    sent: [
      'cancelled',
      'void',
      'written_off',
    ],
    viewed: [
      'cancelled',
      'void',
      'written_off',
    ],
    overdue: [
      'cancelled',
      'void',
      'written_off',
    ],
    partially_paid: [
      'written_off',
    ],
  };


export async function changeInvoiceStatus(
  input:
    Record<string, unknown>,
) {
  const next =
    cleanText(
      input.status,
      30,
    );

  const permission =
    [
      'pending_approval',
      'draft',
    ].includes(
      next,
    )
      ? INVOICING_PERMISSIONS
          .INVOICE_EDIT
      : [
          'confirmed',
          'rejected',
        ].includes(
          next,
        )
        ? INVOICING_PERMISSIONS
            .INVOICE_CONFIRM
        : INVOICING_PERMISSIONS
            .INVOICE_CANCEL;

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    [
      'rejected',
      'cancelled',
      'void',
      'written_off',
    ].includes(
      next,
    ) &&
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      next ===
        'rejected'
        ? 'A rejection reason is required.'
        : 'A reason is required to cancel, void or write off an invoice.',
    );
  }

  const context =
    await requireInvoicingContext(
      permission,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const [
      current,
      settingsResult,
    ] =
      await Promise.all([
        client.query(
          `
            SELECT
              status,
              invoice_number
            FROM invoicing_invoices
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            FOR UPDATE
          `,
          [
            invoiceId,
            context.companyId,
          ],
        ),

        client.query(
          `
            SELECT
              require_approval
            FROM invoicing_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        ),
      ]);

    if (
      current.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    const oldStatus =
      String(
        current.rows[0].status,
      );

    const requiresApproval =
      settingsResult.rows[0]
        ?.require_approval ===
      true;

    if (
      !(
        ALLOWED_MANUAL_TRANSITIONS[
          oldStatus
        ] ||
        []
      ).includes(
        next,
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'That invoice status change is not allowed.',
      );
    }

    if (
      next ===
        'pending_approval' &&
      !requiresApproval
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Invoice approval is not enabled for this company.',
      );
    }

    if (
      next ===
        'confirmed' &&
      requiresApproval &&
      oldStatus !==
        'pending_approval'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Submit this invoice for approval before it can be posted.',
      );
    }

    if (
      next ===
        'rejected' &&
      (
        !requiresApproval ||
        oldStatus !==
          'pending_approval'
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only an invoice waiting for approval can be rejected.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          status =
            $3::varchar(30),
          submitted_at =
            CASE
              WHEN $3::varchar(30) =
                   'pending_approval'
              THEN NOW()
              ELSE submitted_at
            END,
          submitted_by =
            CASE
              WHEN $3::varchar(30) =
                   'pending_approval'
              THEN $4::uuid
              ELSE submitted_by
            END,
          approved_at =
            CASE
              WHEN $3::varchar(30) =
                   'confirmed'
                AND $5::varchar(30) =
                    'pending_approval'
              THEN NOW()
              ELSE approved_at
            END,
          approved_by =
            CASE
              WHEN $3::varchar(30) =
                   'confirmed'
                AND $5::varchar(30) =
                    'pending_approval'
              THEN $4::uuid
              ELSE approved_by
            END,
          rejected_at =
            CASE
              WHEN $3::varchar(30) =
                   'rejected'
              THEN NOW()
              ELSE rejected_at
            END,
          rejected_by =
            CASE
              WHEN $3::varchar(30) =
                   'rejected'
              THEN $4::uuid
              ELSE rejected_by
            END,
          confirmed_at =
            CASE
              WHEN $3::varchar(30) =
                   'confirmed'
              THEN COALESCE(
                confirmed_at,
                NOW()
              )
              ELSE confirmed_at
            END,
          cancelled_at =
            CASE
              WHEN $3::varchar(30) IN (
                'cancelled',
                'void'
              )
              THEN NOW()
              ELSE cancelled_at
            END,
          updated_by =
            $4::uuid,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        next,
        context.userId,
        oldStatus,
      ],
    );

    await client.query(
      `
        INSERT INTO invoicing_status_history (
          invoice_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        invoiceId,
        context.companyId,
        oldStatus,
        next,
        reason ||
          (
            next ===
              'pending_approval'
              ? 'Submitted for approval'
              : next ===
                  'confirmed'
                ? oldStatus ===
                    'pending_approval'
                  ? 'Approved and posted'
                  : 'Confirmed and posted'
                : next ===
                    'draft'
                  ? 'Returned to draft for rework'
                  : null
          ),
        context.userId,
      ],
    );

    if (
      next ===
        'confirmed'
    ) {
      await postInvoiceConfirmationToAccounting(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );

      await queueInvoiceForEtimsIfEnabled(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );

      await createPrimaryInvoiceDocumentSnapshot(
        client,
        {
          companyId:
            context.companyId,
          invoiceId,
          userId:
            context.userId,
          reason:
            'confirmed',
        },
      );
    }

    if (
      [
        'cancelled',
        'void',
      ].includes(
        next,
      )
    ) {
      await reverseInvoicingAccountingEvent(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalEventKey:
            'invoice-confirmed:' +
            invoiceId,
          reversalEventKey:
            'invoice-reversal:' +
            invoiceId +
            ':' +
            next,
          sourceType:
            'invoice_reversal',
          sourceId:
            invoiceId,
          description:
            'Invoice ' +
            String(
              current.rows[0]
                .invoice_number,
            ) +
            ' ' +
            next,
        },
      );
    }

    if (
      next ===
        'written_off'
    ) {
      await postInvoiceWriteOffToAccounting(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );
    }

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          next ===
            'pending_approval'
            ? 'invoice.approval_submitted'
            : next ===
                'rejected'
              ? 'invoice.approval_rejected'
              : next ===
                  'confirmed' &&
                oldStatus ===
                  'pending_approval'
                ? 'invoice.approved'
                : 'invoice.status_changed',
        content:
          'Invoice status changed from ' +
          oldStatus +
          ' to ' +
          next +
          '.',
        metadata: {
          from:
            oldStatus,
          to:
            next,
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    const automationTrigger =
      next ===
        'confirmed'
        ? 'invoicing.invoice.confirmed'
        : next ===
            'pending_approval'
          ? 'invoicing.invoice.approval_submitted'
          : next ===
              'rejected'
            ? 'invoicing.invoice.approval_rejected'
            : [
                'cancelled',
                'void',
                'written_off',
              ].includes(
                next,
              )
              ? 'invoicing.invoice.corrected'
              : null;

    if (
      automationTrigger
    ) {
      await emitInvoicingAutomationEvent(
        context,
        {
          triggerKey:
            automationTrigger,
          recordType:
            'invoice',
          recordId:
            invoiceId,
          idempotencySeed:
            next +
            ':' +
            invoiceId,
          payload: {
            fromStatus:
              oldStatus,
            status:
              next,
            reason,
          },
        },
      );
    }

    return {
      id:
        invoiceId,
      status:
        next,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function recordInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const paymentAmount =
    numberInput(
      input.amount,
      'Payment amount',
      {
        min:
          0.0001,
      },
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const locked =
      await client.query(
        `
          SELECT
            id,
            invoice_number,
            customer_id,
            currency,
            exchange_rate,
            total_amount,
            status
          FROM invoicing_invoices
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          FOR UPDATE
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    if (
      locked.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    const aging =
      await client.query(
        `
          SELECT
            balance_due,
            effective_status
          FROM invoicing_aging
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    const invoice = {
      ...locked.rows[0],
      ...(
        aging.rows[0] ||
        {}
      ),
    };

    const effectiveStatus =
      String(
        invoice.effective_status ||
        invoice.status,
      );

    if (
      [
        'draft',
        'pending_approval',
        'rejected',
        'cancelled',
        'void',
        'written_off',
        'paid',
      ].includes(
        effectiveStatus,
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Payments can only be recorded against an open confirmed or sent invoice.',
      );
    }

    const balance =
      money(
        invoice.balance_due,
      );

    const allocationAmount =
      money(
        Math.min(
          paymentAmount,
          balance,
        ),
      );

    const unappliedAmount =
      money(
        Math.max(
          paymentAmount -
          allocationAmount,
          0,
        ),
      );

    const paymentSettings =
      await client.query(
        `
          SELECT
            allow_partial_payments
          FROM invoicing_settings
          WHERE company_id = $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      );

    const allowPartialPayments =
      paymentSettings.rows[0]
        ?.allow_partial_payments !==
      false;

    if (
      !allowPartialPayments &&
      allocationAmount <
        balance -
          0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Partial payments are disabled for this company. Record the full outstanding balance.',
        {
          balance,
        },
      );
    }

    const paymentMethod =
      cleanText(
        input.method,
        50,
      ) ||
      'other';

    const paymentReference =
      cleanText(
        input.reference,
        255,
      );

    const idempotencyKey =
      cleanText(
        input.idempotencyKey,
        160,
      ) ||
      null;

    if (
      idempotencyKey
    ) {
      await lockMasterIdentity(
        client,
        [
          'invoicing-payment-idempotency',
          context.companyId,
          idempotencyKey,
        ].join(
          ':',
        ),
      );

      const previous =
        await client.query(
          `
            SELECT
              p.id,
              p.payment_number,
              p.status,
              b.allocated_amount,
              b.refunded_amount,
              b.unapplied_amount
            FROM invoicing_payments p
            INNER JOIN invoicing_payment_balances b
              ON b.payment_id = p.id
             AND b.company_id = p.company_id
            WHERE p.company_id = $1
              AND p.idempotency_key = $2
              AND p.deleted_at IS NULL
            LIMIT 1
          `,
          [
            context.companyId,
            idempotencyKey,
          ],
        );

      if (
        previous.rows.length >
          0
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          paymentId:
            String(
              previous.rows[0].id,
            ),
          paymentNumber:
            String(
              previous.rows[0]
                .payment_number,
            ),
          invoiceId,
          status:
            String(
              previous.rows[0].status,
            ),
          allocatedAmount:
            money(
              previous.rows[0]
                .allocated_amount,
            ),
          refundedAmount:
            money(
              previous.rows[0]
                .refunded_amount,
            ),
          unappliedAmount:
            money(
              previous.rows[0]
                .unapplied_amount,
            ),
          reused:
            true,
        };
      }
    }

    if (
      paymentReference
    ) {
      await lockMasterIdentity(
        client,
        [
          'invoicing-payment-reference',
          context.companyId,
          paymentMethod
            .toLowerCase(),
          paymentReference
            .toLowerCase(),
        ].join(
          ':',
        ),
      );

      const duplicatePayment =
        await client.query(
          `
            SELECT
              p.id,
              p.payment_number
            FROM invoicing_payments p
            WHERE p.company_id = $1
              AND p.deleted_at IS NULL
              AND LOWER(
                BTRIM(
                  COALESCE(
                    p.method,
                    ''
                  )
                )
              ) = $2
              AND LOWER(
                BTRIM(
                  COALESCE(
                    p.reference,
                    ''
                  )
                )
              ) = $3
            LIMIT 1
          `,
          [
            context.companyId,
            paymentMethod
              .toLowerCase(),
            paymentReference
              .toLowerCase(),
          ],
        );

      if (
        duplicatePayment.rows.length >
          0
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'This payment reference has already been posted as ' +
          String(
            duplicatePayment
              .rows[0]
              .payment_number,
          ) +
          '.',
          {
            existingPaymentId:
              String(
                duplicatePayment
                  .rows[0]
                  .id,
              ),
          },
        );
      }
    }

    const paymentNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
      );

    const payment =
      await client.query(
        `
          INSERT INTO invoicing_payments (
            company_id,
            payment_number,
            customer_id,
            payment_date,
            amount,
            currency,
            exchange_rate,
            method,
            reference,
            idempotency_key,
            accounting_model,
            status,
            notes,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            'customer_credit',
            'posted',
            $11,$12,$12
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          paymentNumber,
          invoice.customer_id,
          isoDate(
            input.paymentDate,
            new Date(),
          ),
          paymentAmount,
          String(
            invoice.currency,
          ),
          Number(
            invoice.exchange_rate ||
            1,
          ),
          paymentMethod,
          paymentReference ||
            null,
          idempotencyKey,
          nullableText(
            input.notes,
            3000,
          ),
          context.userId,
        ],
      );

    const paymentId =
      String(
        payment.rows[0].id,
      );

    const allocation =
      await client.query(
      `
        INSERT INTO invoicing_payment_allocations (
          company_id,
          payment_id,
          invoice_id,
          amount,
          payment_amount,
          invoice_amount,
          payment_exchange_rate,
          invoice_exchange_rate,
          base_payment_amount,
          base_invoice_amount,
          realized_fx_amount,
          status,
          operation_key,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$4,$4,$5,$5,
          ROUND(($4 * $5)::numeric,4),
          ROUND(($4 * $5)::numeric,4),
          0,
          'posted',
          'initial:' ||
          gen_random_uuid()::text,
          $6
        )
        RETURNING
          id,
          operation_key
      `,
      [
        context.companyId,
        paymentId,
        invoiceId,
        allocationAmount,
        Number(
          invoice.exchange_rate ||
          1,
        ),
        context.userId,
      ],
    );

    const allocationId =
      String(
        allocation.rows[0].id,
      );

    const operationKey =
      String(
        allocation.rows[0]
          .operation_key,
      );

    const remaining =
      money(
        balance -
        allocationAmount,
      );

    const nextStatus =
      remaining <=
        0.0001
        ? 'paid'
        : 'partially_paid';

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          status =
            $3::varchar(30),
          paid_at =
            CASE
              WHEN $3::varchar(30) =
                   'paid'
              THEN NOW()
              ELSE NULL
            END,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        nextStatus,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO invoicing_status_history (
          invoice_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        invoiceId,
        context.companyId,
        String(
          invoice.status,
        ),
        nextStatus,
        'Payment ' +
        paymentNumber +
        ' recorded',
        context.userId,
      ],
    );

    await postInvoicePaymentToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        paymentId,
        paymentNumber,
        paymentDate:
          isoDate(
            input.paymentDate,
            new Date(),
          ),
        amount:
          paymentAmount,
        exchangeRate:
          Number(
            invoice.exchange_rate ||
            1,
          ),
      },
    );

    await postInvoicePaymentAllocationToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        allocationId,
        operationKey,
        paymentId,
        paymentNumber,
        invoiceId,
        invoiceNumber:
          String(
            invoice.invoice_number,
          ),
        allocationDate:
          isoDate(
            input.paymentDate,
            new Date(),
          ),
        paymentAmount:
          allocationAmount,
        invoiceAmount:
          allocationAmount,
        paymentExchangeRate:
          Number(
            invoice.exchange_rate ||
            1,
          ),
        invoiceExchangeRate:
          Number(
            invoice.exchange_rate ||
            1,
          ),
      },
    );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.payment_recorded',
        content:
          'Payment ' +
          paymentNumber +
          ' recorded against invoice ' +
          String(
            invoice.invoice_number,
          ) +
          '.',
        metadata: {
          paymentId,
          paymentNumber,
          amount:
            paymentAmount,
          allocatedAmount:
            allocationAmount,
          unappliedAmount,
          remainingBalance:
            remaining,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.posted',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'posted:' +
          paymentId,
        payload: {
          invoiceId,
          paymentNumber,
          amount:
            paymentAmount,
          allocatedAmount:
            allocationAmount,
          unappliedAmount,
          invoiceStatus:
            nextStatus,
        },
      },
    );

    return {
      paymentId,
      paymentNumber,
      invoiceId,
      status:
        nextStatus,
      remainingBalance:
        remaining,
      allocatedAmount:
        allocationAmount,
      unappliedAmount,
      reused:
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}



export async function recordCustomerPayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const paymentAmount =
    numberInput(
      input.amount,
      'Payment amount',
      {
        min:
          0.0001,
      },
    );

  const paymentMethod =
    cleanText(
      input.method,
      50,
    ) ||
    'other';

  const paymentReference =
    cleanText(
      input.reference,
      255,
    );

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      160,
    ) ||
    null;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const customer =
      await client.query(
        `
          SELECT
            id,
            currency,
            status
          FROM invoicing_customers
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          customerId,
          context.companyId,
        ],
      );

    if (
      customer.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose a valid customer for this company.',
      );
    }

    if (
      String(
        customer.rows[0].status,
      ) !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Payments cannot be recorded for an inactive customer.',
      );
    }

    const currency =
      (
        cleanText(
          input.currency,
          3,
        ) ||
        String(
          customer.rows[0]
            .currency ||
          context.company
            .currentCompany
            .currency ||
          'KES',
        )
      )
        .toUpperCase()
        .slice(
          0,
          3,
        );

    const paymentDate =
      isoDate(
        input.paymentDate,
        new Date(),
      );

    const paymentSettings =
      await client.query(
        `
          SELECT
            COALESCE(
              base_currency,
              default_currency,
              $2
            ) AS base_currency
          FROM invoicing_settings
          WHERE company_id =
                $1
          LIMIT 1
        `,
        [
          context.companyId,
          context.company
            .currentCompany
            .currency ||
            'KES',
        ],
      );

    const baseCurrency =
      cleanText(
        paymentSettings.rows[0]
          ?.base_currency ||
        context.company
          .currentCompany.currency ||
        'KES',
        3,
      ).toUpperCase();

    const exchangeRateResolution =
      await invoiceExchangeRate(
        client,
        context.companyId,
        currency,
        baseCurrency,
        paymentDate,
        input.exchangeRate,
      );

    const exchangeRate =
      exchangeRateResolution
        .rate;

    if (
      idempotencyKey
    ) {
      await lockMasterIdentity(
        client,
        [
          'invoicing-payment-idempotency',
          context.companyId,
          idempotencyKey,
        ].join(
          ':',
        ),
      );

      const prior =
        await client.query(
          `
            SELECT
              p.id,
              p.payment_number,
              p.status
            FROM invoicing_payments p
            WHERE p.company_id = $1
              AND p.idempotency_key = $2
              AND p.deleted_at IS NULL
            LIMIT 1
          `,
          [
            context.companyId,
            idempotencyKey,
          ],
        );

      if (
        prior.rows.length >
          0
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          paymentId:
            String(
              prior.rows[0].id,
            ),
          paymentNumber:
            String(
              prior.rows[0]
                .payment_number,
            ),
          status:
            String(
              prior.rows[0].status,
            ),
          reused:
            true,
        };
      }
    }

    if (
      paymentReference
    ) {
      await lockMasterIdentity(
        client,
        [
          'invoicing-payment-reference',
          context.companyId,
          paymentMethod
            .toLowerCase(),
          paymentReference
            .toLowerCase(),
        ].join(
          ':',
        ),
      );

      const duplicate =
        await client.query(
          `
            SELECT
              id,
              payment_number
            FROM invoicing_payments
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND status <> 'reversed'
              AND LOWER(
                BTRIM(
                  COALESCE(
                    method,
                    ''
                  )
                )
              ) = $2
              AND LOWER(
                BTRIM(
                  COALESCE(
                    reference,
                    ''
                  )
                )
              ) = $3
            LIMIT 1
          `,
          [
            context.companyId,
            paymentMethod
              .toLowerCase(),
            paymentReference
              .toLowerCase(),
          ],
        );

      if (
        duplicate.rows.length >
          0
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'This payment reference has already been posted as ' +
          String(
            duplicate.rows[0]
              .payment_number,
          ) +
          '.',
        );
      }
    }

    const paymentNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
      );

    const created =
      await client.query(
        `
          INSERT INTO invoicing_payments (
            company_id,
            payment_number,
            customer_id,
            payment_date,
            amount,
            currency,
            exchange_rate,
            method,
            reference,
            idempotency_key,
            accounting_model,
            status,
            notes,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            'customer_credit',
            'posted',
            $11,$12,$12
          )
          RETURNING id
        `,
        [
          context.companyId,
          paymentNumber,
          customerId,
          paymentDate,
          paymentAmount,
          currency,
          exchangeRate,
          paymentMethod,
          paymentReference ||
            null,
          idempotencyKey,
          nullableText(
            input.notes,
            3000,
          ),
          context.userId,
        ],
      );

    const paymentId =
      String(
        created.rows[0].id,
      );

    await client.query(
      `
        UPDATE invoicing_payments
        SET
          base_currency = $3,
          exchange_rate_date = $4,
          exchange_rate_source = $5,
          updated_at = NOW(),
          updated_by = $6
        WHERE id = $1
          AND company_id = $2
      `,
      [
        paymentId,
        context.companyId,
        baseCurrency,
        exchangeRateResolution
          .effectiveDate,
        exchangeRateResolution
          .sourceName ||
        exchangeRateResolution
          .source,
        context.userId,
      ],
    );

    await postInvoicePaymentToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        paymentId,
        paymentNumber,
        paymentDate,
        amount:
          paymentAmount,
        exchangeRate,
      },
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment',
        recordId:
          paymentId,
        type:
          'invoicing.payment_received',
        content:
          'Payment ' +
          paymentNumber +
          ' received and left unapplied.',
        metadata: {
          customerId,
          amount:
            paymentAmount,
          currency,
          method:
            paymentMethod,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.posted',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'posted:' +
          paymentId,
        payload: {
          paymentNumber,
          amount:
            paymentAmount,
          allocatedAmount:
            0,
          unappliedAmount:
            paymentAmount,
        },
      },
    );

    return {
      paymentId,
      paymentNumber,
      status:
        'posted',
      amount:
        paymentAmount,
      allocatedAmount:
        0,
      unappliedAmount:
        paymentAmount,
      reused:
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function allocateInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const amount =
    numberInput(
      input.amount,
      'Allocation amount',
      {
        min:
          0.0001,
      },
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        `
          SELECT
            p.id,
            p.payment_number,
            p.customer_id,
            p.payment_date,
            p.currency,
            p.exchange_rate,
            p.status,
            p.reconciled_at,
            b.unapplied_amount
          FROM invoicing_payments p
          INNER JOIN invoicing_payment_balances b
            ON b.payment_id = p.id
           AND b.company_id = p.company_id
          WHERE p.id = $1
            AND p.company_id = $2
            AND p.deleted_at IS NULL
          FOR UPDATE OF p
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be allocated.',
      );
    }

    if (
      payment.reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile this payment before changing its invoice allocations.',
      );
    }

    const unapplied =
      money(
        payment.unapplied_amount,
      );

    if (
      amount >
      unapplied +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Allocation exceeds the unapplied payment balance.',
        {
          unapplied,
        },
      );
    }

    const invoiceResult =
      await client.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.customer_id,
            i.currency,
            i.exchange_rate,
            i.status,
            a.balance_due,
            a.effective_status
          FROM invoicing_invoices i
          INNER JOIN invoicing_aging a
            ON a.invoice_id = i.id
           AND a.company_id = i.company_id
          WHERE i.id = $1
            AND i.company_id = $2
            AND i.deleted_at IS NULL
          FOR UPDATE OF i
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    if (
      invoiceResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    const invoice =
      invoiceResult.rows[0];

    const effectiveStatus =
      String(
        invoice.effective_status ||
        invoice.status,
      );

    if (
      [
        'draft',
        'pending_approval',
        'rejected',
        'paid',
        'cancelled',
        'void',
        'written_off',
      ].includes(
        effectiveStatus,
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Payments can only be allocated to an open posted invoice.',
      );
    }

    if (
      String(
        invoice.customer_id,
      ) !==
      String(
        payment.customer_id,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'This payment belongs to a different customer.',
      );
    }

    const settings =
      await client.query(
        `
          SELECT
            allow_partial_payments,
            allow_cross_currency_payments,
            COALESCE(
              base_currency,
              default_currency,
              $2
            ) AS base_currency
          FROM invoicing_settings
          WHERE company_id = $1
          LIMIT 1
        `,
        [
          context.companyId,
          context.company
            .currentCompany
            .currency ||
            'KES',
        ],
      );

    const sameCurrency =
      String(
        invoice.currency,
      ) ===
      String(
        payment.currency,
      );

    if (
      !sameCurrency &&
      settings.rows[0]
        ?.allow_cross_currency_payments ===
          false
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Cross-currency payment allocation is disabled in Invoicing settings.',
      );
    }

    const paymentExchangeRate =
      Number(
        payment.exchange_rate ||
        1,
      );

    const invoiceExchangeRate =
      Number(
        invoice.exchange_rate ||
        1,
      );

    if (
      !Number.isFinite(
        paymentExchangeRate,
      ) ||
      paymentExchangeRate <=
        0 ||
      !Number.isFinite(
        invoiceExchangeRate,
      ) ||
      invoiceExchangeRate <=
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'The payment or invoice has an invalid locked exchange rate.',
      );
    }

    const paymentAmount =
      money(
        amount,
      );

    const invoiceAmount =
      sameCurrency
        ? paymentAmount
        : money(
            (
              paymentAmount *
              paymentExchangeRate
            ) /
            invoiceExchangeRate,
          );

    const basePaymentAmount =
      money(
        paymentAmount *
        paymentExchangeRate,
      );

    const baseInvoiceAmount =
      money(
        invoiceAmount *
        invoiceExchangeRate,
      );

    const realizedFxAmount =
      money(
        basePaymentAmount -
        baseInvoiceAmount,
      );

    const balance =
      money(
        invoice.balance_due,
      );

    if (
      invoiceAmount >
      balance +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'This allocation converts to more than the remaining invoice balance.',
        {
          paymentAmount,
          paymentCurrency:
            String(
              payment.currency,
            ),
          invoiceAmount,
          invoiceCurrency:
            String(
              invoice.currency,
            ),
          balance,
        },
      );
    }

    if (
      settings.rows[0]
        ?.allow_partial_payments ===
          false &&
      invoiceAmount <
        balance -
          0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Partial payments are disabled for this company. Allocate enough payment currency to settle the full remaining invoice balance.',
      );
    }

    const existing =
      await client.query(
        `
          SELECT
            id,
            status
          FROM invoicing_payment_allocations
          WHERE company_id = $1
            AND payment_id = $2
            AND invoice_id = $3
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          paymentId,
          invoiceId,
        ],
      );

    const operationKey =
      (
        cleanText(
          input.operationKey,
          160,
        ) ||
        (
          'allocate:' +
          crypto.randomUUID()
        )
      ).slice(
        0,
        160,
      );

    let allocationId =
      '';

    if (
      existing.rows.length >
        0
    ) {
      if (
        String(
          existing.rows[0].status,
        ) !==
          'reversed'
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'This payment is already allocated to that invoice.',
        );
      }

      allocationId =
        String(
          existing.rows[0].id,
        );

      await client.query(
        `
          UPDATE invoicing_payment_allocations
          SET
            amount = $4,
            payment_amount = $5,
            invoice_amount = $4,
            payment_exchange_rate = $6,
            invoice_exchange_rate = $7,
            base_payment_amount = $8,
            base_invoice_amount = $9,
            realized_fx_amount = $10,
            status = 'posted',
            operation_key = $11,
            created_by = $12,
            reversed_at = NULL,
            reversed_by = NULL,
            reversal_reason = NULL,
            created_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND payment_id = $3
        `,
        [
          allocationId,
          context.companyId,
          paymentId,
          invoiceAmount,
          paymentAmount,
          paymentExchangeRate,
          invoiceExchangeRate,
          basePaymentAmount,
          baseInvoiceAmount,
          realizedFxAmount,
          operationKey,
          context.userId,
        ],
      );
    } else {
      const created =
        await client.query(
          `
            INSERT INTO invoicing_payment_allocations (
              company_id,
              payment_id,
              invoice_id,
              amount,
              payment_amount,
              invoice_amount,
              payment_exchange_rate,
              invoice_exchange_rate,
              base_payment_amount,
              base_invoice_amount,
              realized_fx_amount,
              status,
              operation_key,
              created_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$4,$6,$7,$8,$9,$10,
              'posted',
              $11,$12
            )
            RETURNING id
          `,
          [
            context.companyId,
            paymentId,
            invoiceId,
            invoiceAmount,
            paymentAmount,
            paymentExchangeRate,
            invoiceExchangeRate,
            basePaymentAmount,
            baseInvoiceAmount,
            realizedFxAmount,
            operationKey,
            context.userId,
          ],
        );

      allocationId =
        String(
          created.rows[0].id,
        );
    }

    await postInvoicePaymentAllocationToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        allocationId,
        operationKey,
        paymentId,
        paymentNumber:
          String(
            payment.payment_number,
          ),
        invoiceId,
        invoiceNumber:
          String(
            invoice.invoice_number,
          ),
        allocationDate:
          String(
            payment.payment_date,
          ),
        paymentAmount,
        invoiceAmount,
        paymentExchangeRate,
        invoiceExchangeRate,
      },
    );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        invoiceId,
        'Payment ' +
        String(
          payment.payment_number,
        ) +
        ' allocated.',
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.payment_allocated',
        content:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' allocated.',
        metadata: {
          paymentId,
          allocationId,
          paymentAmount,
          paymentCurrency:
            String(
              payment.currency,
            ),
          invoiceAmount,
          invoiceCurrency:
            String(
              invoice.currency,
            ),
          realizedFxAmount,
          operationKey,
          remainingBalance:
            settlement.balanceDue,
        },
      },
    );

    const paymentBalance =
      await client.query(
        `
          SELECT
            allocated_amount,
            refunded_amount,
            unapplied_amount
          FROM invoicing_payment_balances
          WHERE payment_id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.allocated',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'allocated:' +
          allocationId +
          ':' +
          operationKey,
        payload: {
          invoiceId,
          allocationId,
          paymentAmount,
          paymentCurrency:
            String(
              payment.currency,
            ),
          invoiceAmount,
          invoiceCurrency:
            String(
              invoice.currency,
            ),
          realizedFxAmount,
          paymentNumber:
            String(
              payment.payment_number,
            ),
          invoiceStatus:
            settlement.status,
          remainingBalance:
            settlement.balanceDue,
        },
      },
    );

    return {
      allocationId,
      paymentId,
      invoiceId,
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
      allocatedAmount:
        money(
          paymentBalance.rows[0]
            ?.allocated_amount,
        ),
      refundedAmount:
        money(
          paymentBalance.rows[0]
            ?.refunded_amount,
        ),
      unappliedAmount:
        money(
          paymentBalance.rows[0]
            ?.unapplied_amount,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function reverseInvoicePaymentAllocation(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const allocationId =
    requireUuid(
      input.allocationId,
      'Payment allocation',
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (!reason) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'An allocation reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            a.id,
            a.payment_id,
            a.invoice_id,
            a.amount,
            a.status,
            a.operation_key,
            p.payment_number,
            p.reconciled_at,
            i.invoice_number
          FROM invoicing_payment_allocations a
          INNER JOIN invoicing_payments p
            ON p.id = a.payment_id
           AND p.company_id = a.company_id
          INNER JOIN invoicing_invoices i
            ON i.id = a.invoice_id
           AND i.company_id = a.company_id
          WHERE a.id = $1
            AND a.company_id = $2
          FOR UPDATE OF a
        `,
        [
          allocationId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment allocation was not found.',
      );
    }

    const allocation =
      result.rows[0];

    if (
      String(
        allocation.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted allocation can be reversed.',
      );
    }

    if (
      allocation.reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile this payment before reversing an allocation.',
      );
    }

    if (
      !allocation.operation_key
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'This legacy payment allocation must be corrected by reversing the original payment.',
      );
    }

    const operationKey =
      String(
        allocation.operation_key,
      );

    await client.query(
      `
        UPDATE invoicing_payment_allocations
        SET
          status = 'reversed',
          reversed_at = NOW(),
          reversed_by = $3,
          reversal_reason = $4
        WHERE id = $1
          AND company_id = $2
      `,
      [
        allocationId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'payment-allocation:' +
          allocationId +
          ':' +
          operationKey,
        reversalEventKey:
          'payment-allocation-reversal:' +
          allocationId +
          ':' +
          operationKey,
        sourceType:
          'payment_allocation_reversal',
        sourceId:
          allocationId,
        description:
          'Payment ' +
          String(
            allocation.payment_number,
          ) +
          ' allocation reversed',
      },
    );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        String(
          allocation.invoice_id,
        ),
        'Payment allocation reversed: ' +
        reason,
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId:
          String(
            allocation.invoice_id,
          ),
        type:
          'invoice.payment_allocation_reversed',
        content:
          'Allocation from payment ' +
          String(
            allocation.payment_number,
          ) +
          ' reversed.',
        metadata: {
          allocationId,
          paymentId:
            String(
              allocation.payment_id,
            ),
          amount:
            money(
              allocation.amount,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.allocation_reversed',
        recordType:
          'payment',
        recordId:
          String(
            allocation.payment_id,
          ),
        idempotencySeed:
          'allocation-reversed:' +
          allocationId +
          ':' +
          operationKey,
        payload: {
          allocationId,
          invoiceId:
            String(
              allocation.invoice_id,
            ),
          amount:
            money(
              allocation.amount,
            ),
          paymentNumber:
            String(
              allocation.payment_number,
            ),
          reason,
          invoiceStatus:
            settlement.status,
        },
      },
    );

    return {
      allocationId,
      paymentId:
        String(
          allocation.payment_id,
        ),
      invoiceId:
        String(
          allocation.invoice_id,
        ),
      status:
        'reversed',
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function reconcileInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const reference =
    cleanText(
      input.reference,
      255,
    );

  const notes =
    nullableText(
      input.notes,
      3000,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            payment_number,
            status,
            reconciled_at
          FROM invoicing_payments
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    if (
      String(
        result.rows[0].status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be reconciled.',
      );
    }

    if (
      result.rows[0]
        .reconciled_at
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        paymentId,
        paymentNumber:
          String(
            result.rows[0]
              .payment_number,
          ),
        reconciled:
          true,
        reused:
          true,
      };
    }

    await client.query(
      `
        UPDATE invoicing_payments
        SET
          reconciled_at = NOW(),
          reconciled_by = $3,
          reconciliation_reference = $4,
          reconciliation_notes = $5,
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        paymentId,
        context.companyId,
        context.userId,
        reference ||
          null,
        notes,
      ],
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment',
        recordId:
          paymentId,
        type:
          'invoicing.payment_reconciled',
        content:
          'Payment ' +
          String(
            result.rows[0]
              .payment_number,
          ) +
          ' reconciled.',
        metadata: {
          reference:
            reference ||
            null,
          notes,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.reconciled',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'reconciled:' +
          paymentId,
        payload: {
          paymentNumber:
            String(
              result.rows[0]
                .payment_number,
            ),
          reference:
            reference ||
            null,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          result.rows[0]
            .payment_number,
        ),
      reconciled:
        true,
      reused:
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function unreconcileInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'An unreconciliation reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            payment_number,
            status,
            reconciled_at,
            reconciliation_reference,
            reconciliation_notes
          FROM invoicing_payments
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      result.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be unreconciled.',
      );
    }

    if (
      !payment.reconciled_at
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        paymentId,
        paymentNumber:
          String(
            payment.payment_number,
          ),
        reconciled:
          false,
        reused:
          true,
      };
    }

    await client.query(
      `
        UPDATE invoicing_payments
        SET
          reconciled_at = NULL,
          reconciled_by = NULL,
          reconciliation_reference = NULL,
          reconciliation_notes = NULL,
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            jsonb_build_object(
              'lastUnreconciledAt',
              NOW(),
              'lastUnreconciledBy',
              ($3::uuid)::text,
              'lastUnreconciliationReason',
              $4::text,
              'previousReconciliationReference',
              $5::text,
              'previousReconciliationNotes',
              $6::text
            ),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        paymentId,
        context.companyId,
        context.userId,
        reason,
        payment.reconciliation_reference ||
          '',
        payment.reconciliation_notes ||
          '',
      ],
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment',
        recordId:
          paymentId,
        type:
          'invoicing.payment_unreconciled',
        content:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' unreconciled.',
        metadata: {
          reason,
          previousReconciledAt:
            payment.reconciled_at
              ? new Date(
                  payment.reconciled_at,
                ).toISOString()
              : null,
          previousReference:
            payment.reconciliation_reference ||
            null,
          previousNotes:
            payment.reconciliation_notes ||
            null,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.unreconciled',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'unreconciled:' +
          paymentId +
          ':' +
          String(
            payment.reconciled_at,
          ),
        payload: {
          paymentNumber:
            String(
              payment.payment_number,
            ),
          reason,
          previousReference:
            payment.reconciliation_reference ||
            null,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          payment.payment_number,
        ),
      reconciled:
        false,
      reused:
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function refundInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const amount =
    numberInput(
      input.amount,
      'Refund amount',
      {
        min:
          0.0001,
      },
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (!reason) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A refund reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        `
          SELECT
            p.id,
            p.payment_number,
            p.status,
            p.currency,
            p.exchange_rate,
            p.method,
            p.reconciled_at,
            b.unapplied_amount
          FROM invoicing_payments p
          INNER JOIN invoicing_payment_balances b
            ON b.payment_id = p.id
           AND b.company_id = p.company_id
          WHERE p.id = $1
            AND p.company_id = $2
            AND p.deleted_at IS NULL
          FOR UPDATE OF p
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be refunded.',
      );
    }

    if (
      payment.reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile this payment before refunding any unapplied amount.',
      );
    }

    const unapplied =
      money(
        payment.unapplied_amount,
      );

    if (
      amount >
      unapplied +
        0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Only the unapplied portion of a payment can be refunded.',
        {
          unapplied,
        },
      );
    }

    const refundNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
      );

    const refundDate =
      isoDate(
        input.refundDate,
        new Date(),
      );

    const created =
      await client.query(
        `
          INSERT INTO invoicing_payment_refunds (
            company_id,
            payment_id,
            refund_number,
            refund_date,
            amount,
            currency,
            method,
            reference,
            reason,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            'posted',
            $10,$10
          )
          RETURNING id
        `,
        [
          context.companyId,
          paymentId,
          refundNumber,
          refundDate,
          amount,
          String(
            payment.currency,
          ),
          cleanText(
            input.method,
            50,
          ) ||
          String(
            payment.method ||
            'other',
          ),
          cleanText(
            input.reference,
            255,
          ) ||
          null,
          reason,
          context.userId,
        ],
      );

    const refundId =
      String(
        created.rows[0].id,
      );

    await postInvoicePaymentRefundToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        refundId,
        refundNumber,
        refundDate,
        amount,
        exchangeRate:
          Number(
            payment.exchange_rate ||
            1,
          ),
      },
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment_refund',
        recordId:
          refundId,
        type:
          'invoicing.payment_refunded',
        content:
          'Refund ' +
          refundNumber +
          ' posted against payment ' +
          String(
            payment.payment_number,
          ) +
          '.',
        metadata: {
          paymentId,
          amount,
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.refunded',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'refunded:' +
          refundId,
        payload: {
          refundId,
          refundNumber,
          paymentNumber:
            String(
              payment.payment_number,
            ),
          amount,
          reason,
        },
      },
    );

    return {
      refundId,
      refundNumber,
      paymentId,
      status:
        'posted',
      amount,
      unappliedAmount:
        money(
          unapplied -
          amount,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function reverseInvoicePaymentRefund(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const refundId =
    requireUuid(
      input.refundId,
      'Payment refund',
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (!reason) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A refund reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            r.id,
            r.payment_id,
            r.refund_number,
            r.status,
            p.payment_number,
            p.reconciled_at
          FROM invoicing_payment_refunds r
          INNER JOIN invoicing_payments p
            ON p.id = r.payment_id
           AND p.company_id = r.company_id
          WHERE r.id = $1
            AND r.company_id = $2
          FOR UPDATE OF r
        `,
        [
          refundId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment refund was not found.',
      );
    }

    const refund =
      result.rows[0];

    if (
      String(
        refund.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted refund can be reversed.',
      );
    }

    if (
      refund.reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile the original payment before reversing its refund.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_payment_refunds
        SET
          status = 'reversed',
          reversed_at = NOW(),
          reversed_by = $3,
          reversal_reason = $4,
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        refundId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'payment-refund:' +
          refundId,
        reversalEventKey:
          'payment-refund-reversal:' +
          refundId,
        sourceType:
          'payment_refund_reversal',
        sourceId:
          refundId,
        description:
          'Refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed',
      },
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment_refund',
        recordId:
          refundId,
        type:
          'invoicing.payment_refund_reversed',
        content:
          'Refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed.',
        metadata: {
          paymentId:
            String(
              refund.payment_id,
            ),
          paymentNumber:
            String(
              refund.payment_number,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.refund_reversed',
        recordType:
          'payment',
        recordId:
          String(
            refund.payment_id,
          ),
        idempotencySeed:
          'refund-reversed:' +
          refundId,
        payload: {
          refundId,
          refundNumber:
            String(
              refund.refund_number,
            ),
          paymentNumber:
            String(
              refund.payment_number,
            ),
          reason,
        },
      },
    );

    return {
      refundId,
      paymentId:
        String(
          refund.payment_id,
        ),
      status:
        'reversed',
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function reverseInvoicePayment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const paymentId =
    requireUuid(
      input.paymentId,
      'Payment',
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A reversal reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const paymentResult =
      await client.query(
        `
          SELECT
            id,
            payment_number,
            amount,
            currency,
            status,
            reconciled_at
          FROM invoicing_payments
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      paymentResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'PAYMENT_NOT_FOUND',
        'Payment was not found.',
      );
    }

    const payment =
      paymentResult.rows[0];

    if (
      String(
        payment.status,
      ) !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted payment can be reversed.',
      );
    }

    if (
      payment.reconciled_at
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Unreconcile this payment before reversing the receipt.',
      );
    }

    const refundCheck =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM invoicing_payment_refunds
          WHERE payment_id = $1
            AND company_id = $2
            AND status = 'posted'
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    if (
      Number(
        refundCheck.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Reverse or settle posted refunds before reversing the original payment.',
      );
    }

    const allocations =
      await client.query(
        `
          SELECT
            a.id,
            a.invoice_id,
            a.amount,
            a.operation_key,
            i.invoice_number
          FROM invoicing_payment_allocations a
          INNER JOIN invoicing_invoices i
            ON i.id = a.invoice_id
           AND i.company_id = a.company_id
          WHERE a.payment_id = $1
            AND a.company_id = $2
            AND a.status = 'posted'
          ORDER BY
            a.created_at,
            a.id
          FOR UPDATE OF a
        `,
        [
          paymentId,
          context.companyId,
        ],
      );

    for (
      const allocation
      of allocations.rows
    ) {
      const allocationId =
        String(
          allocation.id,
        );

      const operationKey =
        String(
          allocation.operation_key ||
          allocationId,
        );

      await client.query(
        `
          UPDATE invoicing_payment_allocations
          SET
            status = 'reversed',
            reversed_at = NOW(),
            reversed_by = $3,
            reversal_reason = $4
          WHERE id = $1
            AND company_id = $2
        `,
        [
          allocationId,
          context.companyId,
          context.userId,
          'Payment reversal: ' +
          reason,
        ],
      );

      await reverseInvoicingAccountingEvent(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalEventKey:
            'payment-allocation:' +
            allocationId +
            ':' +
            operationKey,
          reversalEventKey:
            'payment-allocation-reversal:' +
            allocationId +
            ':' +
            operationKey,
          sourceType:
            'payment_allocation_reversal',
          sourceId:
            allocationId,
          description:
            'Payment ' +
            String(
              payment.payment_number,
            ) +
            ' allocation reversed',
        },
      );
    }

    await client.query(
      `
        UPDATE invoicing_payments
        SET
          status = 'reversed',
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            jsonb_build_object(
              'reversedAt',
              NOW(),
              'reversedBy',
              ($3::uuid)::text,
              'reversalReason',
              $4::text,
              'wasReconciled',
              reconciled_at IS NOT NULL
            ),
          updated_by = $3::uuid,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        paymentId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'invoice-payment:' +
          paymentId,
        reversalEventKey:
          'invoice-payment-reversal:' +
          paymentId,
        sourceType:
          'payment_reversal',
        sourceId:
          paymentId,
        description:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed',
      },
    );

    const invoiceIds =
      [
        ...new Set(
          allocations.rows
            .map(
              row =>
                row.invoice_id
                  ? String(
                      row.invoice_id,
                    )
                  : '',
            )
            .filter(
              Boolean,
            ),
        ),
      ];

    const settlements:
      Array<{
        invoiceId: string;
        status: string;
        balanceDue: number;
      }> =
        [];

    for (
      const invoiceId
      of invoiceIds
    ) {
      const settlement =
        await reconcileInvoiceSettlementStatus(
          client,
          context.companyId,
          context.userId,
          invoiceId,
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed: ' +
          reason,
        );

      settlements.push({
        invoiceId,
        ...settlement,
      });

      await recordInvoicingActivity(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
          type:
            'invoice.payment_reversed',
          content:
            'Payment ' +
            String(
              payment.payment_number,
            ) +
            ' reversed.',
          metadata: {
            paymentId,
            paymentNumber:
              String(
                payment.payment_number,
              ),
            amount:
              money(
                payment.amount,
              ),
            reason,
          },
        },
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment',
        recordId:
          paymentId,
        type:
          'invoicing.payment_reversed',
        content:
          'Payment ' +
          String(
            payment.payment_number,
          ) +
          ' reversed.',
        metadata: {
          amount:
            money(
              payment.amount,
            ),
          reason,
          settlements,
          wasReconciled:
            Boolean(
              payment.reconciled_at,
            ),
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.payment.reversed',
        recordType:
          'payment',
        recordId:
          paymentId,
        idempotencySeed:
          'reversed:' +
          paymentId,
        payload: {
          paymentNumber:
            String(
              payment.payment_number,
            ),
          settlements,
        },
      },
    );

    return {
      paymentId,
      paymentNumber:
        String(
          payment.payment_number,
        ),
      status:
        'reversed',
      settlements,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function issueInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CREDIT_NOTE_MANAGE,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const creditAmount =
    numberInput(
      input.amount,
      'Credit amount',
      {
        min:
          0.0001,
      },
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Credit note reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const creditSettings =
      await client.query(
        `
          SELECT
            allow_credit_notes
          FROM invoicing_settings
          WHERE company_id = $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      );

    if (
      creditSettings.rows[0]
        ?.allow_credit_notes ===
      false
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit notes are disabled for this company.',
      );
    }

    const locked =
      await client.query(
        `
          SELECT
            id,
            customer_id,
            invoice_number,
            currency,
            exchange_rate,
            status
          FROM invoicing_invoices
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          FOR UPDATE
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    if (
      locked.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    if (
      [
        'draft',
        'pending_approval',
        'rejected',
        'cancelled',
        'void',
        'written_off',
      ].includes(
        String(
          locked.rows[0].status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'A credit note cannot be issued for this invoice state.',
      );
    }

    const aging =
      await client.query(
        `
          SELECT
            balance_due
          FROM invoicing_aging
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    const balance =
      money(
        aging.rows[0]
          ?.balance_due,
      );

    if (
      creditAmount >
      balance +
      0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit note cannot exceed the remaining invoice balance.',
        {
          balance,
        },
      );
    }

    const creditNoteNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'credit_note',
      );

    const result =
      await client.query(
        `
          INSERT INTO invoicing_credit_notes (
            company_id,
            invoice_id,
            customer_id,
            credit_note_number,
            status,
            issue_date,
            currency,
            reason,
            subtotal,
            total_amount,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,
            'issued',
            CURRENT_DATE,
            $5,$6,$7,$7,$8,$8
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          invoiceId,
          locked.rows[0]
            .customer_id,
          creditNoteNumber,
          locked.rows[0]
            .currency,
          reason,
          creditAmount,
          context.userId,
        ],
      );

    await client.query(
      `
        INSERT INTO invoicing_credit_note_items (
          credit_note_id,
          company_id,
          description,
          quantity,
          unit_price,
          line_total
        )
        VALUES (
          $1,$2,$3,1,$4,$4
        )
      `,
      [
        result.rows[0].id,
        context.companyId,
        reason,
        creditAmount,
      ],
    );

    await postInvoiceCreditToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        creditNoteId:
          String(
            result.rows[0].id,
          ),
        creditNoteNumber,
        totalAmount:
          creditAmount,
        subtotal:
          creditAmount,
        taxTotal:
          0,
        receivableAmount:
          creditAmount,
        customerCreditAmount:
          0,
        exchangeRate:
          Number(
            locked.rows[0]
              .exchange_rate ||
            1,
          ),
      },
    );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        invoiceId,
        'Credit note ' +
        creditNoteNumber +
        ' issued.',
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.credit_note_issued',
        content:
          'Credit note ' +
          creditNoteNumber +
          ' issued.',
        metadata: {
          creditNoteNumber,
          amount:
            creditAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    const creditNoteId =
      String(
        result.rows[0].id,
      );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.credit_note.issued',
        recordType:
          'credit_note',
        recordId:
          creditNoteId,
        idempotencySeed:
          'issued:' +
          creditNoteId,
        payload: {
          invoiceId,
          creditNoteNumber,
          amount:
            creditAmount,
        },
      },
    );

    return {
      id:
        creditNoteId,
      creditNoteNumber,
      amount:
        creditAmount,
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}



export async function cancelInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CREDIT_NOTE_MANAGE,
    );

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const reason =
    cleanText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A cancellation reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            id,
            invoice_id,
            credit_note_number,
            total_amount,
            status
          FROM invoicing_credit_notes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          creditNoteId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CREDIT_NOTE_NOT_FOUND',
        'Credit note was not found.',
      );
    }

    const credit =
      result.rows[0];

    if (
      ![
        'issued',
        'applied',
      ].includes(
        String(
          credit.status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        String(
          credit.status,
        ) ===
          'refunded'
          ? 'A refunded credit note cannot be cancelled.'
          : 'Only an issued or applied credit note can be cancelled.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_credit_notes
        SET
          status = 'cancelled',
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            jsonb_build_object(
              'cancelledAt',
              NOW(),
              'cancelledBy',
              ($3::uuid)::text,
              'cancellationReason',
              $4::text
            ),
          updated_by = $3::uuid,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        creditNoteId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    const invoiceId =
      String(
        credit.invoice_id,
      );

    await reverseInvoicingAccountingEvent(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        originalEventKey:
          'invoice-credit:' +
          creditNoteId,
        reversalEventKey:
          'invoice-credit-reversal:' +
          creditNoteId,
        sourceType:
          'credit_note_reversal',
        sourceId:
          creditNoteId,
        description:
          'Credit note ' +
          String(
            credit.credit_note_number,
          ) +
          ' cancelled',
      },
    );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        invoiceId,
        'Credit note ' +
        String(
          credit.credit_note_number,
        ) +
        ' cancelled: ' +
        reason,
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.credit_note_cancelled',
        content:
          'Credit note ' +
          String(
            credit.credit_note_number,
          ) +
          ' cancelled.',
        metadata: {
          creditNoteId,
          creditNoteNumber:
            String(
              credit.credit_note_number,
            ),
          amount:
            money(
              credit.total_amount,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await emitInvoicingAutomationEvent(
      context,
      {
        triggerKey:
          'invoicing.invoice.corrected',
        recordType:
          'credit_note',
        recordId:
          creditNoteId,
        idempotencySeed:
          'credit-cancelled:' +
          creditNoteId,
        payload: {
          invoiceId,
          creditNoteNumber:
            String(
              credit.credit_note_number,
            ),
          correction:
            'credit_note_cancelled',
        },
      },
    );

    return {
      creditNoteId,
      creditNoteNumber:
        String(
          credit.credit_note_number,
        ),
      status:
        'cancelled',
      invoiceId,
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function sendInvoiceToCustomer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const channels =
    normalizeInvoiceDeliveryChannels(
      input.channels,
    );

  const result =
    await deliverInvoice({
      pool:
        context.pool,
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      companyName:
        context.company
          .currentCompany
          .name,
      userId:
        context.userId,
      invoiceId,
      channels,
    });

  await emitInvoicingAutomationEvent(
    context,
    {
      triggerKey:
        'invoicing.invoice.sent',
      recordType:
        'invoice',
      recordId:
        invoiceId,
      idempotencySeed:
        'sent:' +
        invoiceId +
        ':' +
        Date.now(),
      payload: {
        channels,
      },
    },
  );

  return result;
}


export async function sendInvoiceReminder(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const channels =
    normalizeInvoiceDeliveryChannels(
      input.channels,
    );

  const result =
    await deliverInvoice({
      pool:
        context.pool,
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      companyName:
        context.company
          .currentCompany
          .name,
      userId:
        context.userId,
      invoiceId,
      channels,
      purpose:
        'reminder',
    });

  const reminderType =
    'manual_' +
    Date.now();

  for (
    const delivery
    of result.deliveries
  ) {
    await context.pool.query(
      `
        INSERT INTO invoicing_reminders (
          company_id,
          invoice_id,
          reminder_type,
          scheduled_for,
          sent_at,
          status,
          channel,
          source,
          attempt_count,
          max_attempts,
          last_attempt_at,
          completed_at,
          sent_by,
          failure_code,
          failure_message,
          metadata
        )
        VALUES (
          $1,$2,$3,NOW(),
          CASE
            WHEN $5
            THEN NOW()
            ELSE NULL
          END,
          CASE
            WHEN $5
            THEN 'sent'
            ELSE 'failed'
          END,
          $4,
          'manual',
          1,
          1,
          NOW(),
          NOW(),
          $6,
          $7,
          CASE
            WHEN $5
            THEN NULL
            ELSE 'Manual reminder delivery failed.'
          END,
          jsonb_build_object(
            'manual',
            TRUE
          )
        )
      `,
      [
        context.companyId,
        invoiceId,
        reminderType,
        delivery.channel,
        delivery.success,
        context.userId,
        delivery.errorCode ||
        null,
      ],
    );
  }

  await emitInvoicingAutomationEvent(
    context,
    {
      triggerKey:
        'invoicing.reminder.sent',
      recordType:
        'invoice',
      recordId:
        invoiceId,
      idempotencySeed:
        reminderType,
      payload: {
        channels,
        deliveries:
          result.deliveries.map(
            delivery => ({
              channel:
                delivery.channel,
              success:
                delivery.success,
            }),
          ),
      },
    },
  );

  return result;
}


function reminderMode(
  value:
    unknown,
) {
  const mode =
    cleanText(
      value,
      20,
    );

  if (
    ![
      'inherit',
      'enabled',
      'paused',
      'disabled',
    ].includes(
      mode,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose inherit, enabled, paused or disabled for payment reminders.',
    );
  }

  return mode;
}


export async function setInvoiceReminderControl(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const mode =
    reminderMode(
      input.mode,
    );

  const pauseUntil =
    mode ===
      'paused' &&
    input.pauseUntil
      ? new Date(
          String(
            input.pauseUntil,
          ),
        )
      : null;

  if (
    pauseUntil &&
    Number.isNaN(
      pauseUntil.getTime(),
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid reminder pause date.',
    );
  }

  const reason =
    nullableText(
      input.reason,
      1000,
    );

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_invoices
        SET
          reminder_mode =
            $3,
          reminder_pause_until =
            CASE
              WHEN $3 =
                   'paused'
              THEN $4
              ELSE NULL
            END,
          reminder_pause_reason =
            CASE
              WHEN $3 IN (
                'paused',
                'disabled'
              )
              THEN $5
              ELSE NULL
            END,
          updated_by =
            $6,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
          AND deleted_at
              IS NULL
        RETURNING
          id
      `,
      [
        invoiceId,
        context.companyId,
        mode,
        pauseUntil,
        reason,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  return {
    invoiceId,
    mode,
    pauseUntil:
      pauseUntil
        ? pauseUntil
            .toISOString()
        : null,
  };
}


export async function setCustomerReminderControl(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const mode =
    reminderMode(
      input.mode,
    );

  const pauseUntil =
    mode ===
      'paused' &&
    input.pauseUntil
      ? new Date(
          String(
            input.pauseUntil,
          ),
        )
      : null;

  if (
    pauseUntil &&
    Number.isNaN(
      pauseUntil.getTime(),
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid reminder pause date.',
    );
  }

  const reason =
    nullableText(
      input.reason,
      1000,
    );

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_customers
        SET
          reminder_mode =
            $3,
          reminder_pause_until =
            CASE
              WHEN $3 =
                   'paused'
              THEN $4
              ELSE NULL
            END,
          reminder_pause_reason =
            CASE
              WHEN $3 IN (
                'paused',
                'disabled'
              )
              THEN $5
              ELSE NULL
            END,
          updated_by =
            $6,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
          AND deleted_at
              IS NULL
        RETURNING
          id
      `,
      [
        customerId,
        context.companyId,
        mode,
        pauseUntil,
        reason,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Customer was not found.',
    );
  }

  return {
    customerId,
    mode,
    pauseUntil:
      pauseUntil
        ? pauseUntil
            .toISOString()
        : null,
  };
}


export async function retryInvoiceReminder(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const reminderId =
    requireUuid(
      input.reminderId,
      'Reminder',
    );

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_reminders
        SET
          status =
            'scheduled',
          source =
            'retry',
          next_attempt_at =
            NOW(),
          completed_at =
            NULL,
          failure_code =
            NULL,
          failure_message =
            NULL,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
          AND status =
              'failed'
          AND attempt_count <
              max_attempts
        RETURNING
          id,
          invoice_id
      `,
      [
        reminderId,
        context.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Failed reminder was not found or has exhausted its retry limit.',
    );
  }

  return {
    reminderId,
    invoiceId:
      String(
        result.rows[0]
          .invoice_id,
      ),
    status:
      'scheduled',
  };
}


export async function saveDunningPolicy(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const policyId =
    input.policyId
      ? requireUuid(
          input.policyId,
          'Dunning policy',
        )
      : null;

  const name =
    cleanText(
      input.name,
      160,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Dunning policy name is required.',
    );
  }

  const rawStages =
    Array.isArray(
      input.stages,
    )
      ? input.stages
      : [];

  if (
    rawStages.length ===
      0 ||
    rawStages.length >
      20
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A dunning policy requires between 1 and 20 stages.',
    );
  }

  const stages =
    rawStages.map(
      (
        raw,
        index,
      ) => {
        const stage =
          plainObject(
            raw,
          );

        const offsetDays =
          Math.floor(
            numberInput(
              stage.offsetDays,
              'Dunning stage offset',
              {
                min:
                  -365,
                max:
                  3650,
              },
            ),
          );

        const severityRaw =
          cleanText(
            stage.severity,
            20,
          );

        const severity =
          [
            'friendly',
            'firm',
            'final',
          ].includes(
            severityRaw,
          )
            ? severityRaw
            : 'friendly';

        const channels =
          normalizeInvoiceDeliveryChannels(
            stage.channels,
          );

        if (
          channels.length ===
            0
        ) {
          throw new InvoicingError(
            'INVALID_INPUT',
            'Each dunning stage needs at least one delivery channel.',
          );
        }

        const stageName =
          cleanText(
            stage.name,
            180,
          ) ||
          (
            offsetDays <
              0
              ? Math.abs(
                  offsetDays,
                ) +
                ' days before due'
              : offsetDays ===
                  0
                ? 'Due today'
                : offsetDays +
                  ' days overdue'
          );

        return {
          stageKey:
            'stage_' +
            (
              index +
              1
            ) +
            '_' +
            offsetDays,
          name:
            stageName,
          sequenceNo:
            index +
            1,
          offsetDays,
          severity,
          channels,
          autoSend:
            stage.autoSend !==
              false,
          retryLimit:
            Math.floor(
              numberInput(
                stage.retryLimit ??
                  3,
                'Reminder retry limit',
                {
                  min:
                    1,
                  max:
                    20,
                },
              ),
            ),
          retryDelayMinutes:
            Math.floor(
              numberInput(
                stage.retryDelayMinutes ??
                  60,
                'Reminder retry delay',
                {
                  min:
                    5,
                  max:
                    10080,
                },
              ),
            ),
          subjectTemplate:
            nullableText(
              stage.subjectTemplate,
              255,
            ),
          messageTemplate:
            nullableText(
              stage.messageTemplate,
              10000,
            ),
        };
      },
    );

  const offsets =
    new Set(
      stages.map(
        stage =>
          stage.offsetDays,
      ),
    );

  if (
    offsets.size !==
      stages.length
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Dunning stages cannot use the same due-date offset twice.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        UPDATE invoicing_dunning_policies
        SET
          is_default =
            FALSE,
          updated_by =
            $2,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
      `,
      [
        context.companyId,
        context.userId,
      ],
    );

    let savedId =
      policyId;

    if (
      savedId
    ) {
      const updated =
        await client.query(
          `
            UPDATE invoicing_dunning_policies
            SET
              name =
                $3,
              is_default =
                TRUE,
              is_active =
                TRUE,
              updated_by =
                $4,
              updated_at =
                NOW()
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND deleted_at
                  IS NULL
            RETURNING
              id
          `,
          [
            savedId,
            context.companyId,
            name,
            context.userId,
          ],
        );

      if (
        updated.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Dunning policy was not found.',
        );
      }
    } else {
      const inserted =
        await client.query(
          `
            INSERT INTO invoicing_dunning_policies (
              company_id,
              name,
              is_default,
              is_active,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,TRUE,TRUE,$3,$3
            )
            RETURNING
              id
          `,
          [
            context.companyId,
            name,
            context.userId,
          ],
        );

      savedId =
        String(
          inserted.rows[0].id,
        );
    }

    await client.query(
      `
        DELETE FROM invoicing_dunning_stages
        WHERE policy_id =
              $1
          AND company_id =
              $2
      `,
      [
        savedId,
        context.companyId,
      ],
    );

    for (
      const stage
      of stages
    ) {
      await client.query(
        `
          INSERT INTO invoicing_dunning_stages (
            company_id,
            policy_id,
            stage_key,
            name,
            sequence_no,
            offset_days,
            severity,
            channels,
            auto_send,
            retry_limit,
            retry_delay_minutes,
            subject_template,
            message_template,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,
            $9,$10,$11,$12,$13,$14,$14
          )
        `,
        [
          context.companyId,
          savedId,
          stage.stageKey,
          stage.name,
          stage.sequenceNo,
          stage.offsetDays,
          stage.severity,
          JSON.stringify(
            stage.channels,
          ),
          stage.autoSend,
          stage.retryLimit,
          stage.retryDelayMinutes,
          stage.subjectTemplate,
          stage.messageTemplate,
          context.userId,
        ],
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.dunning_policy',
        recordId:
          savedId!,
        type:
          'dunning.policy_saved',
        content:
          'Payment reminder policy ' +
          name +
          ' saved.',
        metadata: {
          stages:
            stages.length,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        savedId,
      name,
      stages:
        stages.length,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


function portalTokenHash(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
    )
    .digest(
      'hex',
    );
}


function portalPublicUrl(
  tenantId:
    string,
  token:
    string,
) {
  const raw =
    (
      process.env.APP_URL ||
      process.env
        .NEXT_PUBLIC_APP_URL ||
      ''
    )
      .trim()
      .replace(
        /\/+$/,
        '',
      );

  if (
    !raw
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'APP_URL is required before customer portal access can be issued.',
    );
  }

  try {
    const base =
      new URL(
        raw,
      );

    return (
      base.origin +
      '/p/' +
      encodeURIComponent(
        tenantId,
      ) +
      '/' +
      encodeURIComponent(
        token,
      )
    );
  } catch {
    throw new InvoicingError(
      'INVALID_INPUT',
      'APP_URL must be a valid URL before customer portal access can be issued.',
    );
  }
}


export async function issueCustomerPortalAccess(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const client =
    await context.pool.connect();

  const token =
    crypto
      .randomBytes(
        32,
      )
      .toString(
        'base64url',
      );

  const tokenHash =
    portalTokenHash(
      token,
    );

  let customerName =
    '';

  let customerEmail =
    '';

  let expiresAt =
    new Date();

  let accessId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            c.id,
            c.name,
            c.email,
            c.status,
            s.portal_enabled,
            s.portal_access_days
          FROM invoicing_customers c
          INNER JOIN invoicing_settings s
            ON s.company_id =
               c.company_id
          WHERE c.id =
                $1
            AND c.company_id =
                $2
            AND c.deleted_at
                IS NULL
          FOR UPDATE OF c
        `,
        [
          customerId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CUSTOMER_NOT_FOUND',
        'Customer was not found.',
      );
    }

    const customer =
      result.rows[0];

    if (
      customer.status !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Customer portal access can only be issued to an active customer.',
      );
    }

    if (
      customer.portal_enabled !==
        true
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Customer portal access is disabled in Invoicing settings.',
      );
    }

    customerName =
      String(
        customer.name,
      );

    customerEmail =
      normalizedEmail(
        customer.email,
      ) ||
      '';

    if (
      !customerEmail
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Add a valid customer email before issuing portal access.',
      );
    }

    const configuredDays =
      Math.floor(
        Number(
          customer.portal_access_days ||
          90,
        ),
      );

    const requestedDays =
      input.expiresDays ===
        null ||
      input.expiresDays ===
        undefined ||
      input.expiresDays ===
        ''
        ? configuredDays
        : Math.floor(
            numberInput(
              input.expiresDays,
              'Portal access days',
              {
                min:
                  1,
                max:
                  3650,
              },
            ),
          );

    expiresAt =
      new Date(
        Date.now() +
        requestedDays *
        24 *
        60 *
        60 *
        1000,
      );

    await client.query(
      `
        UPDATE invoicing_portal_access
        SET
          status =
            'revoked',
          revoked_by =
            $3,
          revoked_at =
            NOW(),
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND customer_id =
              $2
          AND status =
              'active'
      `,
      [
        context.companyId,
        customerId,
        context.userId,
      ],
    );

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_portal_access (
            company_id,
            customer_id,
            token_hash,
            status,
            expires_at,
            created_by,
            metadata
          )
          VALUES (
            $1,$2,$3,
            'active',
            $4,
            $5,
            jsonb_build_object(
              'issuedBy',
              ($5::uuid)::text
            )
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          customerId,
          tokenHash,
          expiresAt,
          context.userId,
        ],
      );

    accessId =
      String(
        inserted.rows[0].id,
      );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.customer_portal',
        recordId:
          customerId,
        type:
          'customer.portal_access_issued',
        content:
          'Customer portal access issued for ' +
          customerName +
          '.',
        metadata: {
          accessId,
          expiresAt:
            expiresAt
              .toISOString(),
        },
      },
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }

  const portalUrl =
    portalPublicUrl(
      context.tenantId,
      token,
    );

  let emailDelivered =
    false;

  try {
    const delivery =
      await sendWorkspaceNotificationEmail(
        customerEmail,
        customerName,
        {
          title:
            context.company
              .currentCompany
              .name +
            ' customer portal',
          message:
            'Your secure SaMi customer portal is ready. Review invoices, balances, payments and messages in one place. Access expires ' +
            expiresAt
              .toLocaleDateString(
                'en-KE',
              ) +
            '.',
          actionHref:
            portalUrl,
          actionLabel:
            'Open customer portal',
        },
      );

    emailDelivered =
      delivery.success ===
      true;
  } catch (
    error
  ) {
    console.error(
      '[SaMi Invoicing] Customer portal invitation email failed:',
      {
        customerId,
        error:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      },
    );
  }

  return {
    accessId,
    customerId,
    customerName,
    customerEmail,
    portalUrl,
    expiresAt:
      expiresAt
        .toISOString(),
    emailDelivered,
  };
}


export async function revokeCustomerPortalAccess(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          UPDATE invoicing_portal_access
          SET
            status =
              'revoked',
            revoked_by =
              $3,
            revoked_at =
              NOW(),
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND customer_id =
                $2
            AND status =
                'active'
          RETURNING
            id
        `,
        [
          context.companyId,
          customerId,
          context.userId,
        ],
      );

    if (
      result.rows.length >
        0
    ) {
      await recordMasterDataActivity(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          model:
            'invoicing.customer_portal',
          recordId:
            customerId,
          type:
            'customer.portal_access_revoked',
          content:
            'Customer portal access revoked.',
          metadata: {
            revokedAccessCount:
              result.rows.length,
          },
        },
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      customerId,
      revoked:
        result.rows.length,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function resolveCustomerPortalMessage(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const messageId =
    requireUuid(
      input.messageId,
      'Portal message',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          UPDATE invoicing_portal_messages
          SET
            status =
              'resolved',
            resolved_by =
              $3,
            resolved_at =
              NOW(),
            updated_at =
              NOW()
          WHERE id =
                $1
            AND company_id =
                $2
            AND status =
                'open'
          RETURNING
            id,
            customer_id,
            invoice_id
        `,
        [
          messageId,
          context.companyId,
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Open customer portal message was not found.',
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.customer_portal_message',
        recordId:
          messageId,
        type:
          'customer.portal_message_resolved',
        content:
          'Customer portal message resolved.',
        metadata: {
          customerId:
            String(
              result.rows[0]
                .customer_id,
            ),
          invoiceId:
            result.rows[0]
              .invoice_id
              ? String(
                  result.rows[0]
                    .invoice_id,
                )
              : null,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      messageId,
      status:
        'resolved',
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function replyCustomerPortalMessage(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const messageId =
    requireUuid(
      input.messageId,
      'Portal message',
    );

  const body =
    cleanText(
      input.body,
      5000,
    );

  if (
    !body
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Reply message is required.',
    );
  }

  const client =
    await context.pool.connect();

  let customerEmail =
    '';

  let customerName =
    '';

  let replyId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const original =
      await client.query(
        `
          SELECT
            m.id,
            m.customer_id,
            m.invoice_id,
            m.category,
            m.subject,
            c.name
              AS customer_name,
            c.email
              AS customer_email
          FROM invoicing_portal_messages m
          INNER JOIN invoicing_customers c
            ON c.id =
               m.customer_id
           AND c.company_id =
               m.company_id
          WHERE m.id =
                $1
            AND m.company_id =
                $2
          LIMIT 1
          FOR UPDATE OF m
        `,
        [
          messageId,
          context.companyId,
        ],
      );

    if (
      original.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Customer portal message was not found.',
      );
    }

    const row =
      original.rows[0];

    customerName =
      String(
        row.customer_name,
      );

    customerEmail =
      normalizedEmail(
        row.customer_email,
      ) ||
      '';

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_portal_messages (
            company_id,
            customer_id,
            invoice_id,
            direction,
            category,
            subject,
            body,
            status,
            customer_name_snapshot,
            customer_email_snapshot,
            metadata
          )
          VALUES (
            $1,$2,$3,
            'business_to_customer',
            $4,$5,$6,
            'closed',
            $7,$8,
            jsonb_build_object(
              'replyToMessageId',
              ($9::uuid)::text,
              'repliedBy',
              ($10::uuid)::text
            )
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          row.customer_id,
          row.invoice_id,
          row.category,
          row.subject,
          body,
          customerName,
          customerEmail ||
          null,
          messageId,
          context.userId,
        ],
      );

    replyId =
      String(
        inserted.rows[0].id,
      );

    await client.query(
      `
        UPDATE invoicing_portal_messages
        SET
          status =
            'resolved',
          resolved_by =
            $3,
          resolved_at =
            COALESCE(
              resolved_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        messageId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }

  let emailDelivered =
    false;

  if (
    customerEmail
  ) {
    try {
      const sent =
        await sendWorkspaceNotificationEmail(
          customerEmail,
          customerName,
          {
            title:
              context.company
                .currentCompany
                .name +
              ' replied to your billing message',
            message:
              body,
          },
        );

      emailDelivered =
        sent.success ===
        true;
    } catch (
      error
    ) {
      console.error(
        '[SaMi Invoicing] Portal reply email failed:',
        {
          messageId,
          error:
            error instanceof
              Error
              ? error.message
              : 'unknown_error',
        },
      );
    }
  }

  return {
    messageId,
    replyId,
    emailDelivered,
  };
}


export async function createRecurringInvoiceTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .RECURRING_MANAGE,
    );

  const sourceInvoiceId =
    requireUuid(
      input.sourceInvoiceId,
      'Source invoice',
    );

  const source =
    await context.pool.query(
      `
        SELECT
          i.id,
          i.customer_id,
          i.invoice_number,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.shipping_total,
          i.rounding_adjustment,
          i.notes,
          i.terms,
          i.tax_calculation,
          i.template_id,
          i.status,
          c.status
            AS customer_status
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
        WHERE i.id =
              $1
          AND i.company_id =
              $2
          AND i.deleted_at
              IS NULL
          AND c.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        sourceInvoiceId,
        context.companyId,
      ],
    );

  if (
    source.rows.length !==
      1 ||
    source.rows[0]
      .customer_status !==
      'active'
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Choose an invoice with an active customer.',
    );
  }

  if (
    [
      'cancelled',
      'void',
      'written_off',
    ].includes(
      String(
        source.rows[0].status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Cancelled, void or written-off invoices cannot become recurring templates.',
    );
  }

  const lines =
    await context.pool.query(
      `
        SELECT
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          tax_rate_id,
          tax_group_id,
          tax_rate
        FROM invoicing_invoice_items
        WHERE invoice_id =
              $1
          AND company_id =
              $2
        ORDER BY
          sort_order ASC,
          id ASC
      `,
      [
        sourceInvoiceId,
        context.companyId,
      ],
    );

  if (
    lines.rows.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The source invoice has no line items.',
    );
  }

  const rawInterval =
    cleanText(
      input.intervalUnit,
      20,
    );

  const intervalUnit =
    [
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ].includes(
      rawInterval,
    )
      ? rawInterval
      : 'month';

  const rawIntervalCount =
    Number(
      input.intervalCount ||
      1,
    );

  const intervalCount =
    Number.isFinite(
      rawIntervalCount,
    )
      ? Math.max(
          1,
          Math.min(
            120,
            Math.floor(
              rawIntervalCount,
            ),
          ),
        )
      : 1;

  const name =
    cleanText(
      input.name,
      255,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Recurring invoice name is required.',
    );
  }

  const startDate =
    isoDate(
      input.startDate,
      new Date(),
    );

  const nextRunAt =
    isoDate(
      input.nextRunAt,
      new Date(
        startDate +
        'T00:00:00Z',
      ),
    );

  const endDate =
    input.endDate ===
      null ||
    input.endDate ===
      undefined ||
    input.endDate ===
      ''
      ? null
      : isoDate(
          input.endDate,
        );

  if (
    nextRunAt <
      startDate
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The first recurring run cannot be before the schedule start date.',
    );
  }

  if (
    endDate &&
    endDate <
      nextRunAt
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The recurring end date cannot be before the next run.',
    );
  }

  const maxOccurrences =
    input.maxOccurrences ===
      null ||
    input.maxOccurrences ===
      undefined ||
    input.maxOccurrences ===
      ''
      ? null
      : Math.floor(
          numberInput(
            input.maxOccurrences,
            'Maximum occurrences',
            {
              min:
                1,
              max:
                10_000,
            },
          ),
        );

  const maxRetryAttempts =
    Math.floor(
      numberInput(
        input.maxRetryAttempts ??
          3,
        'Maximum retry attempts',
        {
          min:
            1,
          max:
            20,
        },
      ),
    );

  const requestedDeliveryChannels =
    normalizeInvoiceDeliveryChannels(
      input.deliveryChannels,
    );

  const deliveryChannels =
    requestedDeliveryChannels.length >
      0
      ? requestedDeliveryChannels
      : [
          'email',
        ] as const;

  const payload = {
    sourceInvoiceNumber:
      String(
        source.rows[0]
          .invoice_number,
      ),
    reference:
      source.rows[0]
        .reference ||
      null,
    purchaseOrderNumber:
      source.rows[0]
        .purchase_order_number ||
      null,
    shippingTotal:
      money(
        source.rows[0]
          .shipping_total,
      ),
    roundingAdjustment:
      money(
        source.rows[0]
          .rounding_adjustment,
      ),
    notes:
      source.rows[0]
        .notes ||
      null,
    terms:
      source.rows[0]
        .terms ||
      null,
    taxCalculation:
      source.rows[0]
        .tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive',
    templateId:
      source.rows[0]
        .template_id ||
      null,
    deliveryChannels,
    lines:
      lines.rows.map(
        line => ({
          catalogItemId:
            line.catalog_item_id ||
            undefined,
          description:
            String(
              line.description,
            ),
          sku:
            line.sku_snapshot ||
            undefined,
          unit:
            String(
              line.unit ||
              'unit',
            ),
          quantity:
            money(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          discountType:
            line.discount_type ===
              'fixed'
              ? 'fixed'
              : 'percent',
          discountValue:
            money(
              line.discount_value,
            ),
          taxRateId:
            line.tax_rate_id ||
            undefined,
          taxGroupId:
            line.tax_group_id ||
            undefined,
          taxRate:
            money(
              line.tax_rate,
            ),
        }),
      ),
  };

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await lockMasterIdentity(
      client,
      [
        'invoicing-recurring',
        context.companyId,
        normalizedName(
          name,
        ),
      ].join(
        ':',
      ),
    );

    const duplicate =
      await client.query(
        `
          SELECT id
          FROM invoicing_recurring_templates
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND LOWER(
              REGEXP_REPLACE(
                BTRIM(name),
                '\\s+',
                ' ',
                'g'
              )
            ) = $2
          LIMIT 1
        `,
        [
          context.companyId,
          normalizedName(
            name,
          ),
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'A recurring invoice schedule with this name already exists.',
        {
          existingRecurringId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO invoicing_recurring_templates (
            company_id,
            customer_id,
            source_invoice_id,
            name,
            status,
            interval_unit,
            interval_count,
            start_date,
            end_date,
            next_run_at,
            max_occurrences,
            max_retry_attempts,
            auto_send,
            currency,
            invoice_payload,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,
            'active',
            $5,$6,
            $7::date,$8::date,$9::date,
            $10,$11,$12,$13,$14::jsonb,$15,$15
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          source.rows[0]
            .customer_id,
          sourceInvoiceId,
          name,
          intervalUnit,
          intervalCount,
          startDate,
          endDate,
          nextRunAt,
          maxOccurrences,
          maxRetryAttempts,
          input.autoSend ===
            true,
          String(
            source.rows[0]
              .currency,
          ),
          JSON.stringify(
            payload,
          ),
          context.userId,
        ],
      );

    const id =
      String(
        result.rows[0].id,
      );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.recurring_template',
        recordId:
          id,
        type:
          'recurring.created',
        content:
          'Recurring invoice schedule ' +
          name +
          ' created.',
        metadata: {
          startDate,
          endDate,
          nextRunAt,
          maxOccurrences,
          maxRetryAttempts,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateRecurringInvoiceTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .RECURRING_MANAGE,
    );

  const recurringId =
    requireUuid(
      input.recurringId,
      'Recurring schedule',
    );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Recurring invoice name is required.',
    );
  }

  const rawInterval =
    cleanText(
      input.intervalUnit,
      20,
    );

  if (
    ![
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ].includes(
      rawInterval,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid recurring interval.',
    );
  }

  const intervalCount =
    Math.floor(
      numberInput(
        input.intervalCount,
        'Recurring interval',
        {
          min:
            1,
          max:
            120,
        },
      ),
    );

  const nextRunAt =
    isoDate(
      input.nextRunAt,
      new Date(),
    );

  const endDate =
    input.endDate ===
      null ||
    input.endDate ===
      undefined ||
    input.endDate ===
      ''
      ? null
      : isoDate(
          input.endDate,
        );

  if (
    endDate &&
    endDate <
      nextRunAt
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The recurring end date cannot be before the next run.',
    );
  }

  const maxOccurrences =
    input.maxOccurrences ===
      null ||
    input.maxOccurrences ===
      undefined ||
    input.maxOccurrences ===
      ''
      ? null
      : Math.floor(
          numberInput(
            input.maxOccurrences,
            'Maximum occurrences',
            {
              min:
                1,
              max:
                10_000,
            },
          ),
        );

  const maxRetryAttempts =
    Math.floor(
      numberInput(
        input.maxRetryAttempts ??
          3,
        'Maximum retry attempts',
        {
          min:
            1,
          max:
            20,
        },
      ),
    );

  const deliveryChannels =
    normalizeInvoiceDeliveryChannels(
      input.deliveryChannels,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await lockMasterIdentity(
      client,
      [
        'invoicing-recurring',
        context.companyId,
        normalizedName(
          name,
        ),
      ].join(
        ':',
      ),
    );

    const duplicate =
      await client.query(
        `
          SELECT id
          FROM invoicing_recurring_templates
          WHERE company_id = $1
            AND id <> $2
            AND deleted_at IS NULL
            AND LOWER(
              REGEXP_REPLACE(
                BTRIM(name),
                '\\s+',
                ' ',
                'g'
              )
            ) = $3
          LIMIT 1
        `,
        [
          context.companyId,
          recurringId,
          normalizedName(
            name,
          ),
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Another recurring schedule already uses this name.',
      );
    }

    const current =
      await client.query(
        `
          SELECT
            run_count,
            status
          FROM invoicing_recurring_templates
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          recurringId,
          context.companyId,
        ],
      );

    if (
      current.rows.length !==
        1 ||
      [
        'cancelled',
        'completed',
      ].includes(
        String(
          current.rows[0]
            .status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Recurring schedule was not found or can no longer be edited.',
      );
    }

    if (
      maxOccurrences !==
        null &&
      maxOccurrences <
        Number(
          current.rows[0]
            .run_count ||
          0,
        )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Maximum occurrences cannot be lower than invoices already generated.',
      );
    }

    const result =
      await client.query(
        `
          UPDATE invoicing_recurring_templates
          SET
            name = $3,
            interval_unit = $4,
            interval_count = $5,
            next_run_at = $6::date,
            end_date = $7::date,
            max_occurrences = $8,
            max_retry_attempts = $9,
            auto_send = $10,
            retry_after = NULL,
            invoice_payload =
              jsonb_set(
                COALESCE(
                  invoice_payload,
                  '{}'::jsonb
                ),
                '{deliveryChannels}',
                $11::jsonb,
                TRUE
              ),
            updated_by = $12,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND status NOT IN (
              'cancelled',
              'completed'
            )
            AND deleted_at IS NULL
          RETURNING id, status
        `,
        [
          recurringId,
          context.companyId,
          name,
          rawInterval,
          intervalCount,
          nextRunAt,
          endDate,
          maxOccurrences,
          maxRetryAttempts,
          input.autoSend ===
            true,
          JSON.stringify(
            deliveryChannels.length >
              0
              ? deliveryChannels
              : [
                  'email',
                ],
          ),
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Recurring schedule was not found or can no longer be edited.',
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.recurring_template',
        recordId:
          recurringId,
        type:
          'recurring.updated',
        content:
          'Recurring invoice schedule ' +
          name +
          ' updated.',
        metadata: {
          nextRunAt,
          endDate,
          maxOccurrences,
          maxRetryAttempts,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        recurringId,
      status:
        String(
          result.rows[0].status,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function setRecurringInvoiceTemplateStatus(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .RECURRING_MANAGE,
    );

  const recurringId =
    requireUuid(
      input.recurringId,
      'Recurring schedule',
    );

  const requested =
    cleanText(
      input.status,
      30,
    );

  const status =
    requested ===
      'active'
      ? 'active'
      : requested ===
          'paused'
        ? 'paused'
        : requested ===
            'cancelled'
          ? 'cancelled'
          : '';

  if (!status) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid recurring schedule status.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const existing =
      await client.query(
        `
          SELECT
            r.id,
            r.name,
            r.status,
            r.next_run_at,
            r.end_date,
            r.max_occurrences,
            r.run_count,
            c.status
              AS customer_status
          FROM invoicing_recurring_templates r
          INNER JOIN invoicing_customers c
            ON c.id =
               r.customer_id
          WHERE r.id = $1
            AND r.company_id = $2
            AND r.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF r
        `,
        [
          recurringId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Recurring invoice schedule was not found.',
      );
    }

    const currentStatus =
      String(
        existing.rows[0]
          .status,
      );

    if (
      [
        'cancelled',
        'completed',
      ].includes(
        currentStatus,
      ) &&
      status !==
        currentStatus
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Completed or cancelled recurring schedules are final. Duplicate the source invoice to start a new schedule.',
      );
    }

    if (
      status ===
        'active' &&
      existing.rows[0]
        .customer_status !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Activate the customer before resuming this recurring schedule.',
      );
    }

    if (
      status ===
        'active' &&
      existing.rows[0]
        .end_date &&
      String(
        existing.rows[0]
          .next_run_at,
      )
        .slice(
          0,
          10,
        ) >
      String(
        existing.rows[0]
          .end_date,
      )
        .slice(
          0,
          10,
        )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'This schedule has already passed its end date.',
      );
    }

    if (
      status ===
        'active' &&
      existing.rows[0]
        .max_occurrences !==
          null &&
      Number(
        existing.rows[0]
          .run_count ||
        0,
      ) >=
      Number(
        existing.rows[0]
          .max_occurrences,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'This schedule already reached its maximum number of occurrences.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_recurring_templates
        SET
          status = $3,
          paused_at =
            CASE
              WHEN $3 =
                   'paused'
              THEN NOW()
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE paused_at
            END,
          paused_by =
            CASE
              WHEN $3 =
                   'paused'
              THEN $4::uuid
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE paused_by
            END,
          cancelled_at =
            CASE
              WHEN $3 =
                   'cancelled'
              THEN NOW()
              ELSE cancelled_at
            END,
          cancelled_by =
            CASE
              WHEN $3 =
                   'cancelled'
              THEN $4::uuid
              ELSE cancelled_by
            END,
          retry_after =
            CASE
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE retry_after
            END,
          consecutive_failures =
            CASE
              WHEN $3 =
                   'active'
              THEN 0
              ELSE consecutive_failures
            END,
          completion_reason =
            CASE
              WHEN $3 =
                   'cancelled'
              THEN 'cancelled_by_user'
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE completion_reason
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        recurringId,
        context.companyId,
        status,
        context.userId,
      ],
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.recurring_template',
        recordId:
          recurringId,
        type:
          'recurring.status_changed',
        content:
          'Recurring invoice schedule ' +
          String(
            existing.rows[0].name,
          ) +
          ' changed to ' +
          status +
          '.',
        metadata: {
          from:
            currentStatus,
          to:
            status,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        recurringId,
      status,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function retryRecurringInvoiceTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .RECURRING_MANAGE,
    );

  const recurringId =
    requireUuid(
      input.recurringId,
      'Recurring schedule',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const recurring =
      await client.query(
        `
          SELECT
            r.id,
            r.name,
            r.status,
            r.max_occurrences,
            r.run_count,
            c.status
              AS customer_status
          FROM invoicing_recurring_templates r
          INNER JOIN invoicing_customers c
            ON c.id =
               r.customer_id
          WHERE r.id =
                $1
            AND r.company_id =
                $2
            AND r.deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE OF r
        `,
        [
          recurringId,
          context.companyId,
        ],
      );

    if (
      recurring.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Recurring invoice schedule was not found.',
      );
    }

    if (
      [
        'cancelled',
        'completed',
      ].includes(
        String(
          recurring.rows[0]
            .status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Completed or cancelled recurring schedules cannot be retried.',
      );
    }

    if (
      recurring.rows[0]
        .customer_status !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Activate the customer before retrying this recurring schedule.',
      );
    }

    if (
      recurring.rows[0]
        .max_occurrences !==
          null &&
      Number(
        recurring.rows[0]
          .run_count ||
        0,
      ) >=
      Number(
        recurring.rows[0]
          .max_occurrences,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'This schedule already reached its maximum number of occurrences.',
      );
    }

    const failedRun =
      await client.query(
        `
          SELECT
            id,
            scheduled_for,
            attempt_count
          FROM invoicing_recurring_runs
          WHERE recurring_template_id =
                $1
            AND company_id =
                $2
            AND status =
                'failed'
          ORDER BY
            scheduled_for DESC,
            last_attempt_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [
          recurringId,
          context.companyId,
        ],
      );

    if (
      failedRun.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'There is no failed recurring run to retry.',
      );
    }

    const scheduledFor =
      String(
        failedRun.rows[0]
          .scheduled_for,
      )
        .slice(
          0,
          10,
        );

    await client.query(
      `
        UPDATE invoicing_recurring_templates
        SET
          status =
            'active',
          next_run_at =
            $3::date,
          consecutive_failures =
            0,
          retry_after =
            NULL,
          paused_at =
            NULL,
          paused_by =
            NULL,
          completion_reason =
            NULL,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        recurringId,
        context.companyId,
        scheduledFor,
        context.userId,
      ],
    );

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.recurring_template',
        recordId:
          recurringId,
        type:
          'recurring.retry_requested',
        content:
          'Retry requested for recurring invoice schedule ' +
          String(
            recurring.rows[0]
              .name,
          ) +
          '.',
        metadata: {
          recurringRunId:
            String(
              failedRun.rows[0].id,
            ),
          scheduledFor,
          previousAttempts:
            Number(
              failedRun.rows[0]
                .attempt_count ||
              0,
            ),
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        recurringId,
      scheduledFor,
      status:
        'active',
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


function normalizedHexColor(
  value:
    unknown,
  fallback:
    string,
) {
  const text =
    cleanText(
      value,
      16,
    );

  return /^#[0-9a-f]{6}$/i.test(
    text,
  )
    ? text.toLowerCase()
    : fallback;
}


export async function saveInvoicingTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const templateId =
    optionalUuid(
      input.templateId,
    );

  const name =
    cleanText(
      input.name,
      140,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Template name is required.',
    );
  }

  const layoutRaw =
    cleanText(
      input.layout,
      40,
    );

  const layout =
    [
      'modern',
      'classic',
      'compact',
      'bold',
    ].includes(
      layoutRaw,
    )
      ? layoutRaw
      : 'modern';

  const fontRaw =
    cleanText(
      input.fontFamily,
      100,
    );

  const fontFamily =
    [
      'Inter',
      'Arial',
      'Helvetica',
      'Georgia',
    ].includes(
      fontRaw,
    )
      ? fontRaw
      : 'Inter';

  const makeDefault =
    input.isDefault ===
    true;

  const densityRaw =
    cleanText(
      input.density,
      20,
    );

  const density =
    [
      'compact',
      'comfortable',
      'spacious',
    ].includes(
      densityRaw,
    )
      ? densityRaw
      : 'comfortable';

  const headerStyleRaw =
    cleanText(
      input.headerStyle,
      20,
    );

  const headerStyle =
    [
      'band',
      'minimal',
      'split',
    ].includes(
      headerStyleRaw,
    )
      ? headerStyleRaw
      : 'band';

  const footerAlignmentRaw =
    cleanText(
      input.footerAlignment,
      10,
    );

  const footerAlignment =
    [
      'left',
      'center',
      'right',
    ].includes(
      footerAlignmentRaw,
    )
      ? footerAlignmentRaw
      : 'left';

  const documentTitle =
    cleanText(
      input.documentTitle,
      80,
    ) ||
    'Invoice';

  const fromLabel =
    cleanText(
      input.fromLabel,
      40,
    ) ||
    'From';

  const billToLabel =
    cleanText(
      input.billToLabel,
      40,
    ) ||
    'Bill to';

  const notesLabel =
    cleanText(
      input.notesLabel,
      40,
    ) ||
    'Notes';

  const termsLabel =
    cleanText(
      input.termsLabel,
      40,
    ) ||
    'Terms';

  const paymentLabel =
    cleanText(
      input.paymentLabel,
      60,
    ) ||
    'Payment instructions';

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await lockMasterIdentity(
      client,
      [
        'invoicing-template',
        context.companyId,
        normalizedName(
          name,
          140,
        ),
      ].join(
        ':',
      ),
    );

    const duplicateTemplate =
      await client.query(
        `
          SELECT id
          FROM invoicing_templates
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND LOWER(
              REGEXP_REPLACE(
                BTRIM(name),
                '\\s+',
                ' ',
                'g'
              )
            ) = $2
            AND (
              $3::uuid IS NULL
              OR id <> $3::uuid
            )
          LIMIT 1
        `,
        [
          context.companyId,
          normalizedName(
            name,
            140,
          ),
          templateId,
        ],
      );

    if (
      duplicateTemplate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'An invoice appearance template with this name already exists.',
        {
          existingTemplateId:
            String(
              duplicateTemplate
                .rows[0]
                .id,
            ),
        },
      );
    }

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_templates
          SET
            is_default =
              FALSE,
            updated_by =
              $2,
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    let result;

    if (
      templateId
    ) {
      result =
        await client.query(
          `
            UPDATE invoicing_templates
            SET
              name =
                $3,
              is_default =
                $4,
              primary_color =
                $5,
              secondary_color =
                $6,
              accent_color =
                $7,
              logo_url =
                $8,
              font_family =
                $9,
              layout =
                $10,
              design_version =
                design_version + 1,
              density =
                $11,
              header_style =
                $12,
              document_title =
                $13,
              from_label =
                $14,
              bill_to_label =
                $15,
              notes_label =
                $16,
              terms_label =
                $17,
              payment_label =
                $18,
              footer_alignment =
                $19,
              show_status =
                $20,
              show_page_numbers =
                $21,
              show_sku =
                $22,
              show_unit =
                $23,
              show_quantity =
                $24,
              show_unit_price =
                $25,
              show_line_tax =
                $26,
              show_line_discount =
                $27,
              show_company_logo =
                $28,
              show_company_address =
                $29,
              show_company_contact =
                $30,
              show_tax_id =
                $31,
              show_payment_instructions =
                $32,
              show_tax_breakdown =
                $33,
              show_discount =
                $34,
              footer_text =
                $35,
              terms_text =
                $36,
              updated_by =
                $37,
              updated_at =
                NOW()
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND deleted_at
                  IS NULL
            RETURNING
              id,
              name
          `,
          [
            templateId,
            context.companyId,
            name,
            makeDefault,
            normalizedHexColor(
              input.primaryColor,
              '#164a9f',
            ),
            normalizedHexColor(
              input.secondaryColor,
              '#0f172a',
            ),
            input.accentColor
              ? normalizedHexColor(
                  input.accentColor,
                  '#d4af37',
                )
              : null,
            nullableText(
              input.logoUrl,
              2000,
            ),
            fontFamily,
            layout,
            density,
            headerStyle,
            documentTitle,
            fromLabel,
            billToLabel,
            notesLabel,
            termsLabel,
            paymentLabel,
            footerAlignment,
            input.showStatus !==
              false,
            input.showPageNumbers !==
              false,
            input.showSku !==
              false,
            input.showUnit !==
              false,
            input.showQuantity !==
              false,
            input.showUnitPrice !==
              false,
            input.showLineTax !==
              false,
            input.showLineDiscount !==
              false,
            input.showCompanyLogo !==
              false,
            input.showCompanyAddress !==
              false,
            input.showCompanyContact !==
              false,
            input.showTaxId !==
              false,
            input.showPaymentInstructions !==
              false,
            input.showTaxBreakdown !==
              false,
            input.showDiscount !==
              false,
            nullableText(
              input.footerText,
              4000,
            ),
            nullableText(
              input.termsText,
              10000,
            ),
            context.userId,
          ],
        );

      if (
        result.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Invoice template was not found.',
        );
      }
    } else {
      result =
        await client.query(
          `
            INSERT INTO invoicing_templates (
              company_id,
              name,
              is_default,
              primary_color,
              secondary_color,
              accent_color,
              logo_url,
              font_family,
              layout,
              design_version,
              density,
              header_style,
              document_title,
              from_label,
              bill_to_label,
              notes_label,
              terms_label,
              payment_label,
              footer_alignment,
              show_status,
              show_page_numbers,
              show_sku,
              show_unit,
              show_quantity,
              show_unit_price,
              show_line_tax,
              show_line_discount,
              show_company_logo,
              show_company_address,
              show_company_contact,
              show_tax_id,
              show_payment_instructions,
              show_tax_breakdown,
              show_discount,
              footer_text,
              terms_text,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,1,
              $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
              $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
              $30,$31,$32,$33,$34,$35,$36,$36
            )
            RETURNING
              id,
              name
          `,
          [
            context.companyId,
            name,
            makeDefault,
            normalizedHexColor(
              input.primaryColor,
              '#164a9f',
            ),
            normalizedHexColor(
              input.secondaryColor,
              '#0f172a',
            ),
            input.accentColor
              ? normalizedHexColor(
                  input.accentColor,
                  '#d4af37',
                )
              : null,
            nullableText(
              input.logoUrl,
              2000,
            ),
            fontFamily,
            layout,
            density,
            headerStyle,
            documentTitle,
            fromLabel,
            billToLabel,
            notesLabel,
            termsLabel,
            paymentLabel,
            footerAlignment,
            input.showStatus !==
              false,
            input.showPageNumbers !==
              false,
            input.showSku !==
              false,
            input.showUnit !==
              false,
            input.showQuantity !==
              false,
            input.showUnitPrice !==
              false,
            input.showLineTax !==
              false,
            input.showLineDiscount !==
              false,
            input.showCompanyLogo !==
              false,
            input.showCompanyAddress !==
              false,
            input.showCompanyContact !==
              false,
            input.showTaxId !==
              false,
            input.showPaymentInstructions !==
              false,
            input.showTaxBreakdown !==
              false,
            input.showDiscount !==
              false,
            nullableText(
              input.footerText,
              4000,
            ),
            nullableText(
              input.termsText,
              10000,
            ),
            context.userId,
          ],
        );
    }

    const savedId =
      String(
        result.rows[0].id,
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_template_id =
              $2,
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
          savedId,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        savedId,
      name:
        String(
          result.rows[0].name,
        ),
      isDefault:
        makeDefault,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function createInvoicingPaymentTerm(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  return saveInvoicingPaymentTerm(
    context,
    input,
    null,
  );
}


async function saveInvoicingPaymentTerm(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input:
    Record<string, unknown>,
  termId:
    string |
    null,
) {
  const name =
    cleanText(
      input.name,
      120,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Payment term name is required.',
    );
  }

  const dueDays =
    Math.floor(
      numberInput(
        input.dueDays,
        'Due days',
        {
          min:
            0,
          max:
            3650,
        },
      ),
    );

  const makeDefault =
    input.isDefault ===
    true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await lockMasterIdentity(
      client,
      [
        'invoicing-payment-term',
        context.companyId,
        normalizedName(
          name,
          120,
        ),
      ].join(
        ':',
      ),
    );

    const duplicate =
      await client.query(
        `
          SELECT id
          FROM invoicing_payment_terms
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND LOWER(
              REGEXP_REPLACE(
                BTRIM(name),
                '\\s+',
                ' ',
                'g'
              )
            ) = $2
            AND (
              $3::uuid IS NULL
              OR id <> $3::uuid
            )
          LIMIT 1
        `,
        [
          context.companyId,
          normalizedName(
            name,
            120,
          ),
          termId,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_PAYMENT_TERM',
        'A payment term with this name already exists.',
        {
          existingPaymentTermId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_payment_terms
          SET
            is_default = FALSE,
            updated_by = $2,
            updated_at = NOW()
          WHERE company_id = $1
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    let result;

    if (
      termId
    ) {
      result =
        await client.query(
          `
            UPDATE invoicing_payment_terms
            SET
              name = $3,
              description = $4,
              due_days = $5,
              is_default = $6,
              updated_by = $7,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            RETURNING
              id,
              name,
              due_days,
              is_default,
              is_active
          `,
          [
            termId,
            context.companyId,
            name,
            nullableText(
              input.description,
              1000,
            ),
            dueDays,
            makeDefault,
            context.userId,
          ],
        );
    } else {
      result =
        await client.query(
          `
            INSERT INTO invoicing_payment_terms (
              company_id,
              name,
              description,
              due_days,
              is_default,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$6
            )
            RETURNING
              id,
              name,
              due_days,
              is_default,
              is_active
          `,
          [
            context.companyId,
            name,
            nullableText(
              input.description,
              1000,
            ),
            dueDays,
            makeDefault,
            context.userId,
          ],
        );
    }

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Payment term was not found.',
      );
    }

    const savedId =
      String(
        result.rows[0].id,
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_payment_terms_id = $2,
            default_due_days = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE company_id = $1
        `,
        [
          context.companyId,
          savedId,
          dueDays,
          context.userId,
        ],
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.payment_term',
        recordId:
          savedId,
        type:
          termId
            ? 'payment_term.updated'
            : 'payment_term.created',
        content:
          'Payment term ' +
          name +
          (
            termId
              ? ' updated.'
              : ' created.'
          ),
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        savedId,
      name:
        String(
          result.rows[0].name,
        ),
      dueDays:
        Number(
          result.rows[0].due_days ||
          0,
        ),
      isDefault:
        result.rows[0]
          .is_default ===
        true,
      isActive:
        result.rows[0]
          .is_active !==
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateInvoicingPaymentTerm(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const termId =
    requireUuid(
      input.termId,
      'Payment term',
    );

  return saveInvoicingPaymentTerm(
    context,
    input,
    termId,
  );
}


export async function setInvoicingPaymentTermActive(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const termId =
    requireUuid(
      input.termId,
      'Payment term',
    );

  const isActive =
    input.isActive ===
      true;

  if (!isActive) {
    const current =
      await context.pool.query(
        `
          SELECT is_default
          FROM invoicing_payment_terms
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          termId,
          context.companyId,
        ],
      );

    if (
      current.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Payment term was not found.',
      );
    }

    if (
      current.rows[0]
        .is_default ===
      true
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose another default payment term before deactivating this one.',
      );
    }
  }

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_payment_terms
        SET
          is_active = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        termId,
        context.companyId,
        isActive,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Payment term was not found.',
    );
  }

  return {
    id:
      termId,
    isActive,
  };
}


export async function createInvoicingTaxRate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  return saveInvoicingTaxRate(
    context,
    input,
    null,
  );
}


async function saveInvoicingTaxRate(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  input:
    Record<string, unknown>,
  taxId:
    string |
    null,
) {
  const name =
    cleanText(
      input.name,
      120,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax name is required.',
    );
  }

  const rate =
    numberInput(
      input.rate,
      'Tax rate',
      {
        min:
          0,
        max:
          100,
      },
    );

  const taxType =
    cleanText(
      input.taxType,
      40,
    ) ||
    'vat';

  const countryCode =
    cleanText(
      input.countryCode,
      2,
    )
      .toUpperCase();

  if (
    countryCode &&
    !/^[A-Z]{2}$/.test(
      countryCode,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Country code must use two letters.',
    );
  }

  const code =
    cleanText(
      input.code,
      80,
    ) ||
    null;

  const jurisdictionCode =
    cleanText(
      input.jurisdictionCode,
      80,
    ) ||
    null;

  const priceIncluded =
    input.priceIncluded ===
      true ||
    input.priceIncluded ===
      'true';

  const validFrom =
    input.validFrom
      ? isoDate(
          input.validFrom,
        )
      : null;

  const validTo =
    input.validTo
      ? isoDate(
          input.validTo,
        )
      : null;

  if (
    validFrom &&
    validTo &&
    validTo <
      validFrom
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax valid-to date cannot be before valid-from date.',
    );
  }

  const makeDefault =
    input.isDefault ===
      true ||
    input.isDefault ===
      'true';

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await lockMasterIdentity(
      client,
      [
        'invoicing-tax-rate',
        context.companyId,
        normalizedName(
          name,
          120,
        ),
      ].join(
        ':',
      ),
    );

    const duplicate =
      await client.query(
        `
          SELECT id
          FROM invoicing_tax_rates
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND LOWER(
              REGEXP_REPLACE(
                BTRIM(name),
                '\\s+',
                ' ',
                'g'
              )
            ) = $2
            AND (
              $3::uuid IS NULL
              OR id <> $3::uuid
            )
          LIMIT 1
        `,
        [
          context.companyId,
          normalizedName(
            name,
            120,
          ),
          taxId,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      throw new InvoicingError(
        'DUPLICATE_TAX_RATE',
        'A tax rate with this name already exists.',
        {
          existingTaxRateId:
            String(
              duplicate.rows[0].id,
            ),
        },
      );
    }

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_tax_rates
          SET
            is_default = FALSE,
            updated_by = $2,
            updated_at = NOW()
          WHERE company_id = $1
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    let result;

    if (
      taxId
    ) {
      result =
        await client.query(
          `
            UPDATE invoicing_tax_rates
            SET
              name = $3,
              rate = $4,
              tax_type = $5,
              country_code = $6,
              code = $7,
              jurisdiction_code = $8,
              price_included = $9,
              valid_from = $10,
              valid_to = $11,
              is_default = $12,
              updated_by = $13,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            RETURNING
              id,
              name,
              rate,
              is_default,
              is_active
          `,
          [
            taxId,
            context.companyId,
            name,
            rate,
            taxType,
            countryCode ||
              null,
            code,
            jurisdictionCode,
            priceIncluded,
            validFrom,
            validTo,
            makeDefault,
            context.userId,
          ],
        );
    } else {
      result =
        await client.query(
          `
            INSERT INTO invoicing_tax_rates (
              company_id,
              name,
              rate,
              tax_type,
              country_code,
              code,
              jurisdiction_code,
              price_included,
              valid_from,
              valid_to,
              is_default,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13
            )
            RETURNING
              id,
              name,
              rate,
              is_default,
              is_active
          `,
          [
            context.companyId,
            name,
            rate,
            taxType,
            countryCode ||
              null,
            code,
            jurisdictionCode,
            priceIncluded,
            validFrom,
            validTo,
            makeDefault,
            context.userId,
          ],
        );
    }

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Tax rate was not found.',
      );
    }

    const savedId =
      String(
        result.rows[0].id,
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_tax_rate_id = $2,
            updated_by = $3,
            updated_at = NOW()
          WHERE company_id = $1
        `,
        [
          context.companyId,
          savedId,
          context.userId,
        ],
      );
    }

    await recordMasterDataActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        model:
          'invoicing.tax_rate',
        recordId:
          savedId,
        type:
          taxId
            ? 'tax_rate.updated'
            : 'tax_rate.created',
        content:
          'Tax rate ' +
          name +
          (
            taxId
              ? ' updated.'
              : ' created.'
          ),
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        savedId,
      name:
        String(
          result.rows[0].name,
        ),
      rate:
        money(
          result.rows[0].rate,
        ),
      isDefault:
        result.rows[0]
          .is_default ===
        true,
      isActive:
        result.rows[0]
          .is_active !==
        false,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function updateInvoicingTaxRate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const taxId =
    requireUuid(
      input.taxId,
      'Tax rate',
    );

  return saveInvoicingTaxRate(
    context,
    input,
    taxId,
  );
}


export async function setInvoicingTaxRateActive(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const taxId =
    requireUuid(
      input.taxId,
      'Tax rate',
    );

  const isActive =
    input.isActive ===
      true;

  if (!isActive) {
    const current =
      await context.pool.query(
        `
          SELECT is_default
          FROM invoicing_tax_rates
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          taxId,
          context.companyId,
        ],
      );

    if (
      current.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Tax rate was not found.',
      );
    }

    if (
      current.rows[0]
        .is_default ===
      true
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose another default tax rate before deactivating this one.',
      );
    }
  }

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_tax_rates
        SET
          is_active = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        taxId,
        context.companyId,
        isActive,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax rate was not found.',
    );
  }

  return {
    id:
      taxId,
    isActive,
  };
}


export async function updateInvoicingSettings(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const currency =
    cleanText(
      input.defaultCurrency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Default currency must be a three-letter code.',
    );
  }

  const configuredDefaultCurrency =
    await context.pool.query(
      `
        SELECT code
        FROM invoicing_currencies
        WHERE company_id = $1
          AND code = $2
          AND is_active = TRUE
        LIMIT 1
      `,
      [
        context.companyId,
        currency,
      ],
    );

  if (
    configuredDefaultCurrency
      .rows.length !==
    1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Default currency must be active in Currency Center.',
    );
  }

  const rawDays =
    Number(
      input.defaultDueDays ??
      30,
    );

  const dueDays =
    Number.isFinite(
      rawDays,
    )
      ? Math.max(
          0,
          Math.min(
            3650,
            Math.floor(
              rawDays,
            ),
          ),
        )
      : 30;

  const reminderDaysBeforeRaw =
    Number(
      input.reminderDaysBefore ??
      3,
    );

  const reminderDaysBefore =
    Number.isFinite(
      reminderDaysBeforeRaw,
    )
      ? Math.max(
          0,
          Math.min(
            365,
            Math.floor(
              reminderDaysBeforeRaw,
            ),
          ),
        )
      : 3;

  const reminderDaysAfter =
    cleanText(
      input.reminderDaysAfter,
      120,
    )
      .split(',')
      .map(
        value =>
          Number.parseInt(
            value.trim(),
            10,
          ),
      )
      .filter(
        value =>
          Number.isInteger(
            value,
          ) &&
          value >=
            0 &&
          value <=
            365,
      )
      .slice(
        0,
        12,
      );

  const reminderChannels =
    normalizeInvoiceDeliveryChannels(
      input.reminderChannels,
    );

  const portalAccessDaysRaw =
    Number(
      input.portalAccessDays ??
      90,
    );

  const portalAccessDays =
    Number.isFinite(
      portalAccessDaysRaw,
    )
      ? Math.max(
          1,
          Math.min(
            3650,
            Math.floor(
              portalAccessDaysRaw,
            ),
          ),
        )
      : 90;


  await context.pool.query(
    `
      UPDATE invoicing_settings
      SET
        default_currency =
          $2,
        default_due_days =
          $3,
        tax_calculation =
          $4,
        allow_partial_payments =
          $5,
        allow_credit_notes =
          $6,
        require_approval =
          $7,
        auto_send_recurring =
          $8,
        reminder_enabled =
          $9,
        reminder_channels =
          $10::jsonb,
        reminder_days_before =
          $11,
        reminder_days_after =
          $12,
        portal_enabled =
          $13,
        portal_access_days =
          $14,
        portal_allow_messages =
          $15,
        portal_show_payment_history =
          $16,
        portal_show_credit_notes =
          $17,
        payment_instructions =
          $18,
        bank_details =
          $19,
        terms_and_conditions =
          $20,
        exchange_rate_mode =
          $22,
        allow_cross_currency_payments =
          $23,
        updated_by =
          $21,
        updated_at =
          NOW()
      WHERE company_id =
            $1
    `,
    [
      context.companyId,
      currency,
      dueDays,
      input.taxCalculation ===
        'inclusive'
        ? 'inclusive'
        : 'exclusive',
      input.allowPartialPayments !==
        false,
      input.allowCreditNotes !==
        false,
      input.requireApproval ===
        true,
      input.autoSendRecurring ===
        true,
      input.reminderEnabled !==
        false,
      JSON.stringify(
        reminderChannels.length >
          0
          ? reminderChannels
          : [
              'email',
            ],
      ),
      reminderDaysBefore,
      reminderDaysAfter.length >
        0
        ? reminderDaysAfter
        : [
            1,
            7,
            14,
          ],
      input.portalEnabled !==
        false,
      portalAccessDays,
      input.portalAllowMessages !==
        false,
      input.portalShowPaymentHistory !==
        false,
      input.portalShowCreditNotes !==
        false,
      nullableText(
        input.paymentInstructions,
        10000,
      ),
      nullableText(
        input.bankDetails,
        10000,
      ),
      nullableText(
        input.termsAndConditions,
        10000,
      ),
      context.userId,
      input.exchangeRateMode ===
        'manual'
        ? 'manual'
        : 'table',
      input.allowCrossCurrencyPayments !==
        false,
    ],
  );

  return {
    updated:
      true,
  };
}
