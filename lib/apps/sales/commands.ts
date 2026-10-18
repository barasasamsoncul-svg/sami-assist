import 'server-only';

import { assertSalesQuoteApprovalSatisfied, cancelPendingSalesQuoteApproval, requestAdvancedSalesQuoteApproval, reviewAdvancedSalesQuoteApproval } from '@/lib/apps/sales/approvals';
import { resolveActiveSalesperson } from '@/lib/apps/sales/pipeline';
import { salesQuoteRequiresLegacyApproval } from '@/lib/apps/sales/approval-policy';
import { markSalesOpportunityWonFromAcceptedQuote } from '@/lib/apps/sales/opportunity-conversion';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  createInvoice,
  createInvoicingCatalogItem,
  createInvoicingCustomer,
  updateInvoicingCatalogItem,
  updateInvoicingCustomer,
} from '@/lib/apps/invoicing/commands';

import {
  hasAnyInvoicingPermission,
  INVOICING_PERMISSIONS,
  InvoicingError,
  requireInvoicingContext,
} from '@/lib/apps/invoicing/context';

function translateCustomerMasterError(
  error:
    unknown,
): never {
  const source =
    error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

  const code =
    typeof source?.code ===
      'string'
      ? source.code
      : '';

  if (
    code ===
      'INVOICING_PERMISSION_REQUIRED'
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Customer-management access is required for this Sales action.',
    );
  }

  throw new SalesError(
    'INVALID_INPUT',
    typeof source?.message ===
      'string'
      ? source.message
      : 'SaMi could not save this customer.',
    source?.details &&
    typeof source.details ===
      'object'
      ? source.details as
          Record<string, unknown>
      : undefined,
  );
}


export async function createSalesCustomer(
  input:
    Record<string, unknown>,
) {
  await requireSalesContext(
    SALES_PERMISSIONS
      .QUOTE_CREATE,
  );

  try {
    return await createInvoicingCustomer(
      input,
    );
  } catch (
    error
  ) {
    return translateCustomerMasterError(
      error,
    );
  }
}


export async function updateSalesCustomer(
  input:
    Record<string, unknown>,
) {
  await requireSalesContext(
    SALES_PERMISSIONS
      .QUOTE_EDIT,
  );

  try {
    return await updateInvoicingCustomer(
      input,
    );
  } catch (
    error
  ) {
    return translateCustomerMasterError(
      error,
    );
  }
}


function translateCatalogMasterError(
  error:
    unknown,
): never {
  const source =
    error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

  const code =
    typeof source?.code ===
      'string'
      ? source.code
      : '';

  if (
    code ===
      'INVOICING_PERMISSION_REQUIRED'
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Product-catalogue management access is required for this Sales action.',
    );
  }

  throw new SalesError(
    'INVALID_INPUT',
    typeof source?.message ===
      'string'
      ? source.message
      : 'SaMi could not save this catalogue item.',
    source?.details &&
    typeof source.details ===
      'object'
      ? source.details as
          Record<string, unknown>
      : undefined,
  );
}


export async function createSalesCatalogItem(
  input:
    Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS
      .QUOTE_CREATE,
  );

  try {
    const rawCost = input.unitCost;
    let standardCost: number | undefined;
    if (rawCost !== undefined && rawCost !== null && String(rawCost).trim() !== '') {
      if (!crossPermission(context, SALES_PERMISSIONS.MARGIN_MANAGE)) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Margin-management permission is required to set catalogue cost.',
        );
      }
      standardCost = numberInput(rawCost, 'Unit cost', { min: 0 });
    }

    const catalogInput = { ...input };
    delete catalogInput.unitCost;
    return await createInvoicingCatalogItem(
      catalogInput,
      standardCost === undefined ? undefined : { standardCost },
    );
  } catch (
    error
  ) {
    if (error instanceof SalesError) {
      throw error;
    }
    return translateCatalogMasterError(
      error,
    );
  }
}


export async function updateSalesCatalogItem(
  input:
    Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS
      .QUOTE_EDIT,
  );

  try {
    const rawCost = input.unitCost;
    let standardCost: number | undefined;
    if (rawCost !== undefined && rawCost !== null && String(rawCost).trim() !== '') {
      if (!crossPermission(context, SALES_PERMISSIONS.MARGIN_MANAGE)) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Margin-management permission is required to set catalogue cost.',
        );
      }
      standardCost = numberInput(rawCost, 'Unit cost', { min: 0 });
    }

    const catalogInput = { ...input };
    delete catalogInput.unitCost;
    return await updateInvoicingCatalogItem(
      catalogInput,
      standardCost === undefined ? undefined : { standardCost },
    );
  } catch (
    error
  ) {
    if (error instanceof SalesError) {
      throw error;
    }
    return translateCatalogMasterError(
      error,
    );
  }
}


import {
  deliverSalesQuote,
  normalizeSalesQuoteDeliveryChannels,
} from '@/lib/apps/sales/delivery';

import {
  resolveSalesPricelistUnitPrice,
} from '@/lib/apps/sales/commercial';

import {
  queryControl,
} from '@/lib/db/control';

import {
  resolveSalesExchangeRate,
  salesBaseAmount,
} from '@/lib/apps/sales/currencies';

import {
  recordSalesOrderCommissionEntries,
  resolveSalesAssignmentForUser,
  reverseSalesOrderCommissions,
} from '@/lib/apps/sales/organization';

import {
  salesDateOnly,
  shouldExpireSalesQuoteBeforeAcceptance,
} from '@/lib/apps/sales/date-utils';

import {
  postSalesFulfillmentToInventory,
  releaseSalesOrderReservations,
  reserveSalesOrderInventory,
} from '@/lib/apps/sales/inventory';

import {
  dispatchBusinessAutomationEventSafely,
} from '@/lib/automation/business-events';

import {
  cleanText,
  datePlusDays,
  ensureSalesDefaults,
  isoDate,
  money,
  nextSalesNumber,
  nullableText,
  numberInput,
  optionalUuid,
  recordSalesActivity,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import type {
  CreateSalesQuoteInput,
} from '@/lib/apps/sales/types';


type NormalizedOptionalQuoteItem = {
  catalogItemId: string | null;
  externalProductId: string | null;
  sortOrder: number;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  taxName: string | null;
  taxRate: number;
};


type NormalizedQuoteLine = {
  catalogItemId:
    string | null;
  externalProductId:
    string | null;
  sortOrder:
    number;
  description:
    string;
  sku:
    string | null;
  unit:
    string;
  quantity:
    number;
  unitPrice:
    number;
  unitCost:
    number;
  costTotal:
    number;
  marginAmount:
    number;
  marginPercent:
    number;
  discountType:
    'percent' |
    'fixed';
  discountValue:
    number;
  discountAmount:
    number;
  taxName:
    string | null;
  taxRate:
    number;
  taxAmount:
    number;
  subtotal:
    number;
  lineTotal:
    number;
};


function salesAutomationRuntime(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
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
        'sales',
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


async function emitSalesAutomationEvent(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
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
      salesAutomationRuntime(
        context,
      ),
    moduleKey:
      'sales',
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


function crossPermission(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  ...permissions:
    string[]
) {
  return (
    context.permissions
      .isOwner ||
    permissions.some(
      permission =>
        context.permissions
          .permissionSet
          .has(
            permission,
          ),
    )
  );
}


async function resolveCustomerSnapshot(
  client:
    PoolClient,
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  input:
    CreateSalesQuoteInput,
) {
  const billingCustomerId =
    optionalUuid(
      input.billingCustomerId,
    );
  const suppliedCustomerEmail = nullableText(input.customerEmail, 255);

  if (
    suppliedCustomerEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedCustomerEmail)
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Enter a valid customer email.',
    );
  }

  if (
    billingCustomerId
  ) {
    if (
      !crossPermission(
        context,
        'invoicing.customer.view',
        'invoicing.customer.manage',
      )
    ) {
      throw new SalesError(
        'SALES_PERMISSION_REQUIRED',
        'Billing customer access is required to use an Invoicing customer on a quote.',
      );
    }

    const table =
      await client.query(
        `
          SELECT
            to_regclass(
              'public.invoicing_customers'
            ) IS NOT NULL
              AS ready
        `,
      );

    if (
      table.rows[0]
        ?.ready !==
        true
    ) {
      throw new SalesError(
        'INVOICING_REQUIRED',
        'Install Invoicing before linking billing customers.',
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            name,
            email,
            phone,
            tax_id,
            billing_address,
            shipping_address,
            currency
          FROM invoicing_customers
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          billingCustomerId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Choose a valid active billing customer.',
      );
    }

    const row =
      result.rows[0];

    return {
      billingCustomerId,
      customerName:
        String(
          row.name,
        ),
      customerEmail:
        row.email
          ? String(
              row.email,
            )
          : null,
      customerPhone:
        row.phone
          ? String(
              row.phone,
            )
          : null,
      customerTaxId:
        row.tax_id
          ? String(
              row.tax_id,
            )
          : null,
      billingAddress:
        row.billing_address
          ? String(
              row.billing_address,
            )
          : null,
      shippingAddress:
        row.shipping_address
          ? String(
              row.shipping_address,
            )
          : null,
      currency:
        String(
          row.currency ||
          '',
        ),
    };
  }

  const customerName =
    cleanText(
      input.customerName,
      255,
    );

  if (
    !customerName
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Customer name is required.',
    );
  }

  return {
    billingCustomerId:
      null,
    customerName,
    customerEmail: suppliedCustomerEmail,
    customerPhone:
      nullableText(
        input.customerPhone,
        80,
      ),
    customerTaxId:
      nullableText(
        input.customerTaxId,
        120,
      ),
    billingAddress:
      nullableText(
        input.billingAddress,
        4000,
      ),
    shippingAddress:
      nullableText(
        input.shippingAddress,
        4000,
      ),
    currency:
      '',
  };
}



/**
 * Enforce customer credit ceilings against open invoice exposure in company
 * base currency. A bypass needs explicit override input and quote-approval
 * permission; a NULL credit limit means no configured ceiling.
 */

/**
 * Gets or creates a company-scoped system billing identity for walk-in invoices.
 * Creation is permission-gated to invoice creation; Invoicing's createInvoice
 * command still validates the customer record and snapshots its name on the invoice.
 */
async function getOrCreateSalesWalkInCustomer(
  client: PoolClient,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
) {
  if (!crossPermission(context, 'invoicing.invoice.create')) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Invoicing invoice-creation access is required for walk-in invoicing.',
    );
  }

  const table = await client.query(
    `SELECT to_regclass('public.invoicing_customers') IS NOT NULL AS ready`,
  );
  if (table.rows[0]?.ready !== true) {
    throw new SalesError(
      'INVOICING_REQUIRED',
      'Install Invoicing before generating a walk-in invoice.',
    );
  }

  const lockKey = 'sales-walk-in-customer:' + context.companyId;
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
  try {
    const existing = await client.query(
      `
        SELECT id
        FROM invoicing_customers
        WHERE company_id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND metadata->>'samiSyntheticCustomer' = 'sales_walk_in'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [context.companyId],
    );
    if (existing.rows.length === 1) {
      return { id: String(existing.rows[0].id) };
    }

    const created = await client.query(
      `
        INSERT INTO invoicing_customers (
          company_id, customer_type, name, currency, status, notes,
          created_by, updated_by, metadata
        )
        VALUES (
          $1, 'individual', 'Walk-in / unnamed customer', $2, 'active',
          'System-managed placeholder for Sales invoices without a required billing customer.',
          $3, $3,
          jsonb_build_object('samiSyntheticCustomer', 'sales_walk_in', 'sourceModule', 'sales')
        )
        RETURNING id
      `,
      [
        context.companyId,
        context.company.currentCompany.currency || 'KES',
        context.userId,
      ],
    );
    return { id: String(created.rows[0].id) };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    } catch {}
  }
}

async function enforceSalesCustomerCreditLimit(
  client: PoolClient,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  input: {
    billingCustomerId: string | null;
    totalBaseAmount: number;
    creditLimitEnforced: unknown;
    overrideCreditLimit: unknown;
  },
) {
  if (input.creditLimitEnforced !== true || !input.billingCustomerId) return;
  const agingView = await client.query(
    `SELECT to_regclass('public.invoicing_aging_base') IS NOT NULL AS ready`,
  );
  if (agingView.rows[0]?.ready !== true) {
    throw new SalesError('INVOICING_REQUIRED', 'Install or update Invoicing before enforcing customer credit limits.');
  }
  const result = await client.query(
    `
      SELECT customer.credit_limit,
             COALESCE(SUM(aging.base_balance_due), 0)::numeric(19,4) AS outstanding_base
      FROM invoicing_customers customer
      LEFT JOIN invoicing_aging_base aging
        ON aging.company_id = customer.company_id
       AND aging.customer_id = customer.id
      WHERE customer.id = $1
        AND customer.company_id = $2
        AND customer.deleted_at IS NULL
      GROUP BY customer.credit_limit
      LIMIT 1
    `,
    [input.billingCustomerId, context.companyId],
  );
  if (result.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The billing customer could not be found for credit-limit verification.');
  }
  const row = result.rows[0];
  if (row.credit_limit === null || row.credit_limit === undefined) return;

  const creditLimit = money(row.credit_limit);
  const outstanding = money(row.outstanding_base || 0);
  const proposedAmount = money(input.totalBaseAmount);
  const projectedExposure = money(outstanding + proposedAmount);
  if (projectedExposure <= creditLimit) return;
  if (input.overrideCreditLimit === true && crossPermission(context, SALES_PERMISSIONS.QUOTE_APPROVE)) return;

  throw new SalesError(
    'CREDIT_LIMIT_EXCEEDED',
    'The customer\'s outstanding balance plus this transaction would exceed their configured credit limit.',
    { creditLimit, outstandingBalance: outstanding, proposedBaseAmount: proposedAmount, projectedExposure },
  );
}

async function resolveTemplate(
  client:
    PoolClient,
  companyId:
    string,
  templateIdInput:
    unknown,
) {
  const requested =
    optionalUuid(
      templateIdInput,
    );

  const result =
    requested
      ? await client.query(
          `
            SELECT
              id,
              notes,
              terms
            FROM sales_quote_templates
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
        )
      : await client.query(
          `
            SELECT
              id,
              notes,
              terms
            FROM sales_quote_templates
            WHERE company_id = $1
              AND is_active = TRUE
              AND deleted_at IS NULL
            ORDER BY
              is_default DESC,
              created_at
            LIMIT 1
          `,
          [
            companyId,
          ],
        );

  if (
    requested &&
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid quote template.',
    );
  }

  return result.rows[0] ||
    null;
}


async function normalizeQuoteLines(
  client:
    PoolClient,
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  input:
    unknown,
  options: {
    pricelistId:
      string | null;
    billingCustomerId:
      string | null;
    quoteDate:
      string;
    currency:
      string;
  },
): Promise<
  NormalizedQuoteLine[]
> {
  if (
    !Array.isArray(
      input,
    ) ||
    input.length ===
      0 ||
    input.length >
      100
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Add between 1 and 100 quote lines.',
    );
  }

  const canUseCatalog =
    crossPermission(
      context,
      'invoicing.catalog.view',
      'invoicing.catalog.manage',
    );

  const lines:
    NormalizedQuoteLine[] =
      [];

  for (
    let index =
      0;
    index <
      input.length;
    index +=
      1
  ) {
    const raw =
      input[index];

    if (
      !raw ||
      typeof raw !==
        'object' ||
      Array.isArray(
        raw,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote line ' +
        (
          index +
          1
        ) +
        ' is invalid.',
      );
    }

    const item =
      raw as
        Record<
          string,
          unknown
        >;

    const catalogItemId =
      optionalUuid(
        item.catalogItemId,
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
      if (
        !canUseCatalog
      ) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Catalog access is required to use saved products or services on a quote.',
        );
      }

      const table =
        await client.query(
          `
            SELECT
              to_regclass(
                'public.invoicing_catalog_items'
              ) IS NOT NULL
                AS ready
          `,
        );

      if (
        table.rows[0]
          ?.ready !==
          true
      ) {
        throw new SalesError(
          'INVOICING_REQUIRED',
          'Install Invoicing before using its product catalog.',
        );
      }

      const result =
        await client.query(
          `
            SELECT
              item.id,
              item.name,
              item.sku,
              item.description,
              item.unit,
              item.unit_price,
              item.external_product_id,
              item.metadata,
              tax.name
                AS tax_name,
              COALESCE(
                tax.rate,
                0
              )
                AS tax_rate
            FROM invoicing_catalog_items item
            LEFT JOIN invoicing_tax_rates tax
              ON tax.id =
                 item.default_tax_rate_id
             AND tax.company_id =
                 item.company_id
             AND tax.deleted_at
                 IS NULL
            WHERE item.id = $1
              AND item.company_id = $2
              AND item.is_active = TRUE
              AND item.deleted_at IS NULL
            LIMIT 1
          `,
          [
            catalogItemId,
            context.companyId,
          ],
        );

      if (
        result.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Choose a valid active quote item.',
        );
      }

      catalog =
        result.rows[0];
    }

    const description =
      cleanText(
        item.description ||
        catalog
          ?.description ||
        catalog
          ?.name,
        4000,
      );

    if (
      !description
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote line ' +
        (
          index +
          1
        ) +
        ' needs a description.',
      );
    }

    const quantity =
      numberInput(
        item.quantity ??
        1,
        'Quantity',
        {
          min:
            0.0001,
          max:
            1_000_000,
        },
      );

    const baseUnitPrice =
      numberInput(
        item.unitPrice ??
        catalog
          ?.unit_price ??
        0,
        'Unit price',
      );

    const pricing =
      await resolveSalesPricelistUnitPrice(
        client,
        {
          companyId:
            context.companyId,
          pricelistId:
            options.pricelistId,
          catalogItemId,
          billingCustomerId:
            options.billingCustomerId,
          quantity,
          baseUnitPrice,
          quoteDate:
            options.quoteDate,
        },
      );

    if (
      pricing.currency &&
      pricing.currency !==
        options.currency
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'The selected pricelist currency must match the quotation currency.',
      );
    }

    const unitPrice =
      pricing.unitPrice;

    const metadata =
      catalog?.metadata &&
      typeof catalog.metadata ===
        'object' &&
      !Array.isArray(
        catalog.metadata,
      )
        ? catalog.metadata as
            Record<string, unknown>
        : {};

    const requestedUnitCost =
      item.unitCost;

    if (
      requestedUnitCost !==
        undefined &&
      !crossPermission(
        context,
        SALES_PERMISSIONS
          .MARGIN_MANAGE,
      )
    ) {
      throw new SalesError(
        'SALES_PERMISSION_REQUIRED',
        'Margin-management permission is required to override item cost.',
      );
    }

    const unitCost =
      numberInput(
        requestedUnitCost ??
        metadata.standardCost ??
        metadata.unitCost ??
        0,
        'Unit cost',
      );

    const discountType =
      cleanText(
        item.discountType,
        20,
      ) ===
        'fixed'
        ? 'fixed' as const
        : 'percent' as const;

    const discountValue =
      numberInput(
        item.discountValue ??
        0,
        'Discount',
        {
          min:
            0,
          max:
            discountType ===
              'percent'
              ? 100
              : 1_000_000_000,
        },
      );

    const taxRate =
      numberInput(
        catalog
          ? catalog.tax_rate ?? 0
          : item.taxRate ?? 0,
        'Tax rate',
        {
          min:
            0,
          max:
            100,
        },
      );

    const subtotal =
      money(
        quantity *
        unitPrice,
      );

    const discountAmount =
      money(
        discountType ===
          'percent'
          ? subtotal *
            (
              discountValue /
              100
            )
          : Math.min(
              subtotal,
              discountValue,
            ),
      );

    const taxable =
      money(
        subtotal -
        discountAmount,
      );

    const taxAmount =
      money(
        taxable *
        (
          taxRate /
          100
        ),
      );

    const lineTotal =
      money(
        taxable +
        taxAmount,
      );

    const costTotal =
      money(
        quantity *
        unitCost,
      );

    const marginAmount =
      money(
        taxable -
        costTotal,
      );

    const marginPercent =
      taxable >
        0
        ? money(
            marginAmount /
            taxable *
            100,
          )
        : 0;

    lines.push({
      catalogItemId,
      externalProductId:
        catalog?.external_product_id
          ? String(
              catalog.external_product_id,
            )
          : null,
      sortOrder:
        index,
      description,
      sku:
        nullableText(
          catalog
            ? catalog.sku
            : item.sku,
          180,
        ),
      unit:
        cleanText(
          catalog
            ? catalog.unit
            : item.unit || 'unit',
          60,
        ) ||
        'unit',
      quantity,
      unitPrice,
      unitCost,
      costTotal,
      marginAmount,
      marginPercent,
      discountType,
      discountValue,
      discountAmount,
      taxName:
        nullableText(
          catalog
            ? catalog.tax_name
            : item.taxName,
          180,
        ),
      taxRate,
      taxAmount,
      subtotal,
      lineTotal,
    });
  }

  return lines;
}


async function insertOptionalItems(
  client: PoolClient,
  companyId: string,
  quoteId: string,
  items: NormalizedOptionalQuoteItem[],
  userId?: string,
) {
  for (const item of items) {
    await client.query(
      `
        INSERT INTO sales_quote_optional_items (
          quote_id, company_id, catalog_item_id, external_product_id,
          sort_order, description, sku_snapshot, unit, quantity, unit_price,
          unit_cost, tax_name_snapshot, tax_rate, is_selected, selected_at,
          created_by, updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,FALSE,NULL,$14,$14
        )
      `,
      [
        quoteId, companyId, item.catalogItemId, item.externalProductId,
        item.sortOrder, item.description, item.sku, item.unit, item.quantity,
        item.unitPrice, item.unitCost, item.taxName, item.taxRate, userId || null,
      ],
    );
  }
}


function normalizeOptionalQuoteItems(
  value: unknown,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
): NormalizedOptionalQuoteItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new SalesError('INVALID_INPUT', 'Optional products must be an array with no more than 100 items.');
  }
  const canUseCatalog = crossPermission(context, 'invoicing.catalog.view', 'invoicing.catalog.manage');
  const canManageMargin = crossPermission(context, SALES_PERMISSIONS.MARGIN_MANAGE);
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SalesError('INVALID_INPUT', 'Optional product ' + (index + 1) + ' is invalid.');
    }
    const item = raw as Record<string, unknown>;
    const catalogItemId = optionalUuid(item.catalogItemId);
    const externalProductId = optionalUuid(item.externalProductId);
    if ((catalogItemId || externalProductId) && !canUseCatalog) {
      throw new SalesError('SALES_PERMISSION_REQUIRED', 'Catalog access is required to use saved optional products.');
    }
    const description = cleanText(item.description, 4000);
    if (!description) throw new SalesError('INVALID_INPUT', 'Every optional product needs a description.');
    if (item.unitCost !== undefined && item.unitCost !== null && item.unitCost !== '' && !canManageMargin) {
      throw new SalesError('SALES_PERMISSION_REQUIRED', 'Sales margin-management permission is required to override optional-product cost.');
    }
    const sortValue = Number(item.sortOrder);
    return {
      catalogItemId,
      externalProductId,
      sortOrder: Number.isInteger(sortValue) && sortValue >= 0 ? sortValue : index,
      description,
      sku: nullableText(item.sku, 180),
      unit: cleanText(item.unit || 'unit', 60) || 'unit',
      quantity: numberInput(item.quantity ?? 1, 'Optional product quantity', { min: 0.0001, max: 1_000_000 }),
      unitPrice: numberInput(item.unitPrice ?? 0, 'Optional product unit price', { min: 0, max: 1_000_000_000 }),
      unitCost: item.unitCost === undefined || item.unitCost === null || item.unitCost === ''
        ? 0
        : numberInput(item.unitCost, 'Optional product unit cost', { min: 0, max: 1_000_000_000 }),
      taxName: nullableText(item.taxName, 180),
      taxRate: numberInput(item.taxRate ?? 0, 'Optional product tax rate', { min: 0, max: 100 }),
    };
  });
}


async function insertQuoteLines(
  client:
    PoolClient,
  companyId:
    string,
  quoteId:
    string,
  lines:
    NormalizedQuoteLine[],
  optionalItems: NormalizedOptionalQuoteItem[] = [],
  userId?: string,
) {
  for (
    const line
    of lines
  ) {
    await client.query(
      `
        INSERT INTO sales_quote_items (
          quote_id,
          company_id,
          catalog_item_id,
          external_product_id,
          sort_order,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          unit_cost,
          cost_total,
          margin_amount,
          margin_percent,
          discount_type,
          discount_value,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        )
      `,
      [
        quoteId,
        companyId,
        line.catalogItemId,
        line.externalProductId,
        line.sortOrder,
        line.description,
        line.sku,
        line.unit,
        line.quantity,
        line.unitPrice,
        line.unitCost,
        line.costTotal,
        line.marginAmount,
        line.marginPercent,
        line.discountType,
        line.discountValue,
        line.discountAmount,
        line.taxName,
        line.taxRate,
        line.taxAmount,
        line.subtotal,
        line.lineTotal,
      ],
    );
  }
  await insertOptionalItems(client, companyId, quoteId, optionalItems, userId);
}


function totals(
  lines:
    NormalizedQuoteLine[],
  shipping:
    number,
) {
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

  const totalAmount =
    money(
      subtotal -
      discountTotal +
      taxTotal +
      shipping,
    );

  const costTotal =
    money(
      lines.reduce(
        (
          sum,
          line,
        ) =>
          sum +
          line.costTotal,
        0,
      ),
    );

  const netRevenue =
    money(
      subtotal -
      discountTotal,
    );

  const marginAmount =
    money(
      netRevenue -
      costTotal,
    );

  const marginPercent =
    netRevenue >
      0
      ? money(
          marginAmount /
          netRevenue *
          100,
        )
      : 0;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    totalAmount,
    costTotal,
    marginAmount,
    marginPercent,
  };
}


type SalesQuoteDepositType = 'none' | 'percent' | 'fixed';

function normalizeSalesQuoteDeposit(
  input: {
    depositType?: unknown;
    depositValue?: unknown;
  },
  totalAmount: number,
) {
  const depositTypeRaw =
    input.depositType === undefined ||
    input.depositType === null ||
    input.depositType === ''
      ? 'none'
      : cleanText(input.depositType, 20).toLowerCase();

  if (
    depositTypeRaw !== 'none' &&
    depositTypeRaw !== 'percent' &&
    depositTypeRaw !== 'fixed'
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Deposit type must be none, percent, or fixed.',
    );
  }

  const depositType = depositTypeRaw as SalesQuoteDepositType;
  const depositValue =
    depositType === 'none'
      ? 0
      : numberInput(
          input.depositValue,
          'Deposit value',
          {
            min: 0.0001,
            max: depositType === 'percent' ? 100 : 1_000_000_000,
          },
        );

  const requiredAmount =
    depositType === 'percent'
      ? money(totalAmount * depositValue / 100)
      : depositType === 'fixed'
        ? Math.min(totalAmount, money(depositValue))
        : 0;

  return {
    depositType,
    depositValue,
    requiredAmount,
  };
}


type SalesQuoteAuthoringDependencies = {
  ensureSalesDefaults: typeof ensureSalesDefaults;
  crossPermission: typeof crossPermission;
  resolveTemplate: typeof resolveTemplate;
  resolveCustomerSnapshot: typeof resolveCustomerSnapshot;
  resolveSalesExchangeRate: typeof resolveSalesExchangeRate;
  normalizeQuoteLines: typeof normalizeQuoteLines;
  totals: typeof totals;
  normalizeSalesQuoteDeposit: typeof normalizeSalesQuoteDeposit;
  salesBaseAmount: typeof salesBaseAmount;
  salesQuoteRequiresLegacyApproval: typeof salesQuoteRequiresLegacyApproval;
  nextSalesNumber: typeof nextSalesNumber;
  resolveSalesAssignmentForUser: typeof resolveSalesAssignmentForUser;
  resolveSalesperson: (ctx: Awaited<ReturnType<typeof requireSalesContext>>, value: unknown) => Promise<string | null>;
  insertQuoteLines: typeof insertQuoteLines;
  recordSalesActivity: typeof recordSalesActivity;
  emitSalesAutomationEvent: typeof emitSalesAutomationEvent;
  requireUuid: typeof requireUuid;
  optionalUuid: typeof optionalUuid;
  cleanText: typeof cleanText;
  isoDate: typeof isoDate;
  datePlusDays: typeof datePlusDays;
  nullableText: typeof nullableText;
  numberInput: typeof numberInput;
};

const defaultSalesQuoteAuthoringDependencies: SalesQuoteAuthoringDependencies = {
  ensureSalesDefaults,
  crossPermission,
  resolveTemplate,
  resolveCustomerSnapshot,
  resolveSalesExchangeRate,
  normalizeQuoteLines,
  totals,
  normalizeSalesQuoteDeposit,
  salesBaseAmount,
  salesQuoteRequiresLegacyApproval,
  nextSalesNumber,
  resolveSalesAssignmentForUser,
  resolveSalesperson: resolveActiveSalesperson,
  insertQuoteLines,
  recordSalesActivity,
  emitSalesAutomationEvent,
  requireUuid,
  optionalUuid,
  cleanText,
  isoDate,
  datePlusDays,
  nullableText,
  numberInput,
};

/**
 * Transaction-level quotation creation primitive. The public production entry
 * point authorizes the caller before invoking this function. Dependencies can
 * be replaced by integration tests while quote and quote-line persistence stays
 * on PostgreSQL.
 */
export async function createSalesQuoteTransaction(
  input: CreateSalesQuoteInput,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesQuoteAuthoringDependencies> = {},
) {
  const deps: SalesQuoteAuthoringDependencies = {
    ...defaultSalesQuoteAuthoringDependencies,
    ...overrides,
  };

  await deps.ensureSalesDefaults(
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

    const settingsResult =
      await client.query(
        `
          SELECT *
          FROM sales_settings
          WHERE company_id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0] ||
      {};

    const rawOpportunityId = input.opportunityId;
    const opportunityId =
      rawOpportunityId === undefined ||
      rawOpportunityId === null ||
      rawOpportunityId === ''
        ? null
        : deps.requireUuid(rawOpportunityId, 'Opportunity');

    let linkedOpportunity:
      Record<string, unknown> |
      null = null;

    if (opportunityId) {
      if (
        !deps.crossPermission(
          context,
          SALES_PERMISSIONS.PIPELINE_VIEW,
          SALES_PERMISSIONS.PIPELINE_MANAGE,
        )
      ) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Pipeline access is required to create a quotation from an opportunity.',
        );
      }

      const opportunityResult = await client.query(
        `
          SELECT
            opportunity.id,
            opportunity.opportunity_number,
            opportunity.billing_customer_id,
            opportunity.name,
            opportunity.customer_name,
            opportunity.contact_name,
            opportunity.email,
            opportunity.phone,
            opportunity.currency,
            opportunity.salesperson_user_id,
            opportunity.sales_team_id,
            opportunity.territory_id,
            stage.stage_type
          FROM sales_opportunities opportunity
          INNER JOIN sales_pipeline_stages stage
            ON stage.id = opportunity.stage_id
           AND stage.company_id = opportunity.company_id
          WHERE opportunity.id = $1
            AND opportunity.company_id = $2
            AND opportunity.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF opportunity
        `,
        [opportunityId, context.companyId],
      );

      linkedOpportunity = opportunityResult.rows[0] || null;

      if (!linkedOpportunity) {
        throw new SalesError(
          'OPPORTUNITY_NOT_FOUND',
          'The linked opportunity was not found in this company.',
        );
      }

      if (linkedOpportunity.stage_type === 'lost') {
        throw new SalesError(
          'INVALID_OPPORTUNITY_STAGE',
          'A lost opportunity cannot be converted into a new quotation.',
        );
      }
    }

    const quoteInput: CreateSalesQuoteInput = linkedOpportunity
      ? {
          ...input,
          billingCustomerId:
            input.billingCustomerId ??
            (deps.crossPermission(
              context,
              'invoicing.customer.view',
              'invoicing.customer.manage',
            )
              ? linkedOpportunity.billing_customer_id
              : undefined),
          currency:
            input.currency ||
            linkedOpportunity.currency,
          reference:
            input.reference ||
            linkedOpportunity.opportunity_number,
          customerName:
            input.customerName ||
            linkedOpportunity.customer_name ||
            linkedOpportunity.name,
          customerEmail:
            input.customerEmail ||
            linkedOpportunity.email,
          customerPhone:
            input.customerPhone ||
            linkedOpportunity.phone,
        }
      : input;

    const salespersonUserId = input.salespersonUserId
      ? (await deps.resolveSalesperson(context, input.salespersonUserId)) || context.userId
      : context.userId;

    const template =
      await deps.resolveTemplate(
        client,
        context.companyId,
        quoteInput.templateId,
      );

    const customer =
      await deps.resolveCustomerSnapshot(
        client,
        context,
        quoteInput,
      );

    const quoteDate =
      deps.isoDate(
        input.quoteDate,
      );

    const validUntil =
      input.validUntil
        ? deps.isoDate(
            input.validUntil,
          )
        : deps.datePlusDays(
            quoteDate,
            Number(
              settings.default_validity_days ||
              14,
            ),
          );

    if (
      validUntil <
      quoteDate
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote expiry date cannot be before the quote date.',
      );
    }

    const currency =
      deps.cleanText(
        quoteInput.currency ||
        customer.currency ||
        settings.default_currency ||
        context.company
          .currentCompany.currency ||
        'KES',
        3,
      )
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const baseCurrency =
      deps.cleanText(
        context.company
          .currentCompany
          .currency ||
        settings.default_currency ||
        'KES',
        3,
      )
        .toUpperCase();

    const exchangeRate =
      await deps.resolveSalesExchangeRate(
        client,
        {
          companyId:
            context.companyId,
          currency,
          baseCurrency,
          effectiveDate:
            quoteDate,
          manualRate:
            input.exchangeRate,
        },
      );

    const pricelistId =
      deps.optionalUuid(
        input.pricelistId,
      );

    const lines =
      await deps.normalizeQuoteLines(
        client,
        context,
        input.lines,
        {
          pricelistId,
          billingCustomerId:
            customer.billingCustomerId,
          quoteDate,
          currency,
        },
      );

    const optionalItems = normalizeOptionalQuoteItems(input.optionalItems, context);

    const shippingTotal =
      deps.numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const calculated =
      deps.totals(
        lines,
        shippingTotal,
      );

    const deposit =
      deps.normalizeSalesQuoteDeposit(
        quoteInput,
        calculated.totalAmount,
      );

    const baseTotalAmount =
      deps.salesBaseAmount(
        calculated.totalAmount,
        exchangeRate.rate,
      );

    await enforceSalesCustomerCreditLimit(client, context, {
      billingCustomerId: customer.billingCustomerId,
      totalBaseAmount: baseTotalAmount,
      creditLimitEnforced: settings.credit_limit_enforced,
      overrideCreditLimit: input.overrideCreditLimit,
    });

    const approvalRequired =
      deps.salesQuoteRequiresLegacyApproval(
        settings.require_quote_approval,
        settings.quote_approval_threshold,
        baseTotalAmount,
      );

    const approvalStatus =
      approvalRequired
        ? 'draft'
        : 'not_required';

    const quoteNumber =
      await deps.nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'quote',
      );

    const salesAssignment =
      await deps.resolveSalesAssignmentForUser(
        client,
        {
          companyId:
            context.companyId,
          userId:
            salespersonUserId,
        },
      );

    const result =
      await client.query(
        `
          INSERT INTO sales_quotes (
            company_id,
            billing_customer_id,
            template_id,
            quote_number,
            status,
            quote_date,
            valid_until,
            currency,
            reference,
            approval_status,
            customer_name,
            customer_email,
            customer_phone,
            customer_tax_id,
            billing_address,
            shipping_address,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            total_amount,
            pricelist_id,
            cost_total,
            margin_amount,
            margin_percent,
            notes,
            terms,
            internal_notes,
            salesperson_user_id,
            sales_team_id,
            territory_id,
            created_by,
            updated_by,
            deposit_type,
            deposit_value
          )
          VALUES (
            $1,$2,$3,$4,
            'draft',
            $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
            $25,$26,$27,$28,$29,$30,$31,$31,$32,$33
          )
          RETURNING
            id,
            quote_number,
            status
        `,
        [
          context.companyId,
          customer.billingCustomerId,
          template
            ?.id ||
          null,
          quoteNumber,
          quoteDate,
          validUntil,
          currency,
          deps.nullableText(
            quoteInput.reference,
            255,
          ),
          approvalStatus,
          customer.customerName,
          customer.customerEmail,
          customer.customerPhone,
          customer.customerTaxId,
          customer.billingAddress,
          customer.shippingAddress,
          calculated.subtotal,
          calculated.discountTotal,
          calculated.taxTotal,
          shippingTotal,
          calculated.totalAmount,
          pricelistId,
          calculated.costTotal,
          calculated.marginAmount,
          calculated.marginPercent,
          deps.nullableText(
            input.notes ||
            template
              ?.notes ||
            settings.default_notes,
            6000,
          ),
          deps.nullableText(
            input.terms ||
            template
              ?.terms ||
            settings.terms_and_conditions,
            12000,
          ),
          deps.nullableText(
            input.internalNotes,
            6000,
          ),
          salespersonUserId,
          salesAssignment
            .salesTeamId,
          salesAssignment
            .territoryId,
          context.userId,
          deposit.depositType,
          deposit.depositValue,
        ],
      );

    const quoteId =
      String(
        result.rows[0].id,
      );

    await client.query(
      `
        UPDATE sales_quotes
        SET
          base_currency = $3,
          exchange_rate = $4,
          exchange_rate_date = $5,
          exchange_rate_source = $6,
          base_total_amount = $7
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        exchangeRate.baseCurrency,
        exchangeRate.rate,
        exchangeRate.effectiveDate,
        exchangeRate.sourceName ||
          exchangeRate.source,
        baseTotalAmount,
      ],
    );

    if (linkedOpportunity && opportunityId) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            opportunity_id = $3
          WHERE id = $1
            AND company_id = $2
        `,
        [
          quoteId,
          context.companyId,
          opportunityId,
        ],
      );

      await client.query(
        `
          UPDATE sales_opportunities
          SET
            latest_quote_id = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          opportunityId,
          context.companyId,
          quoteId,
          context.userId,
        ],
      );
    }

    await deps.insertQuoteLines(
      client,
      context.companyId,
      quoteId,
      lines,
      optionalItems,
      context.userId,
    );

    await client.query(
      `
        INSERT INTO sales_quote_status_history (
          quote_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,
          'draft',
          'Quote created',
          $3
        )
      `,
      [
        quoteId,
        context.companyId,
        context.userId,
      ],
    );

    await deps.recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.created',
        content:
          'Quote ' +
          quoteNumber +
          ' created.',
        metadata: {
          totalAmount:
            calculated.totalAmount,
          currency,
          opportunityId: opportunityId || null,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await deps.emitSalesAutomationEvent(
      context,
      {
        triggerKey:
          'sales.quote.created',
        recordType:
          'sales_quote',
        recordId:
          quoteId,
        idempotencySeed:
          'created:' +
          quoteId,
        payload: {
          quoteNumber,
          totalAmount:
            calculated.totalAmount,
          currency,
          opportunityId: opportunityId || null,
        },
      },
    );

    return {
      id:
        quoteId,
      quoteNumber,
      status:
        'draft',
      totalAmount:
        calculated.totalAmount,
      currency,
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




export async function createSalesQuote(
  input: CreateSalesQuoteInput,
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_CREATE);
  return createSalesQuoteTransaction(input, context);
}
export async function updateSalesQuoteDraftTransaction(
  input: CreateSalesQuoteInput & { quoteId?: unknown },
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesQuoteAuthoringDependencies> = {},
) {
  const deps: SalesQuoteAuthoringDependencies = {
    ...defaultSalesQuoteAuthoringDependencies,
    ...overrides,
  };

  const quoteId =
    deps.requireUuid(input.quoteId, 'Quote');

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
            quote_number,
            status,
            approval_status,
            quote_date,
            currency,
            base_currency,
            exchange_rate,
            exchange_rate_date,
            exchange_rate_source
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    if (
      String(
        existing.rows[0].status,
      ) !==
      'draft'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Only draft quotes can be edited. Duplicate the quote when renegotiation is required after sending.',
      );
    }

    if (
      [
        'pending',
        'approved',
      ].includes(
        String(
          existing.rows[0]
            .approval_status ||
          'not_required',
        ),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote is in approval. Withdraw or reject approval before editing the commercial terms.',
      );
    }

    const salespersonUserId = input.salespersonUserId
      ? (await deps.resolveSalesperson(context, input.salespersonUserId)) || context.userId
      : context.userId;
    const salespersonAssignment = await deps.resolveSalesAssignmentForUser(client, {
      companyId: context.companyId,
      userId: salespersonUserId,
    });

    const settings =
      (
        await client.query(
          `
            SELECT *
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const template =
      await deps.resolveTemplate(
        client,
        context.companyId,
        input.templateId,
      );

    const customer =
      await deps.resolveCustomerSnapshot(
        client,
        context,
        input,
      );

    const quoteDate =
      deps.isoDate(
        input.quoteDate,
      );

    const validUntil =
      input.validUntil
        ? deps.isoDate(
            input.validUntil,
          )
        : deps.datePlusDays(
            quoteDate,
            Number(
              settings.default_validity_days ||
              14,
            ),
          );

    if (
      validUntil <
      quoteDate
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote expiry date cannot be before the quote date.',
      );
    }

    const currency =
      deps.cleanText(
        input.currency ||
        customer.currency ||
        settings.default_currency ||
        'KES',
        3,
      )
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const baseCurrency =
      deps.cleanText(
        context.company
          .currentCompany
          .currency ||
        settings.default_currency ||
        'KES',
        3,
      )
        .toUpperCase();

    const existingQuote =
      existing.rows[0];

    const canKeepLockedRate =
      (
        input.exchangeRate ===
          undefined ||
        input.exchangeRate ===
          null ||
        input.exchangeRate ===
          ''
      ) &&
      String(
        existingQuote.currency ||
        '',
      ).toUpperCase() ===
        currency &&
      String(
        existingQuote
          .base_currency ||
        '',
      ).toUpperCase() ===
        baseCurrency &&
      String(
        existingQuote
          .quote_date ||
        '',
      ).slice(
        0,
        10,
      ) ===
        quoteDate &&
      Number(
        existingQuote
          .exchange_rate ||
        0,
      ) >
        0;

    const exchangeRate =
      canKeepLockedRate
        ? {
            currency,
            baseCurrency,
            rate:
              Number(
                existingQuote
                  .exchange_rate,
              ),
            effectiveDate:
              String(
                existingQuote
                  .exchange_rate_date ||
                quoteDate,
              ).slice(
                0,
                10,
              ),
            source:
              String(
                existingQuote
                  .exchange_rate_source ||
                'locked',
              ),
            sourceName:
              null,
            manualOverride:
              false,
          }
        : await deps.resolveSalesExchangeRate(
            client,
            {
              companyId:
                context.companyId,
              currency,
              baseCurrency,
              effectiveDate:
                quoteDate,
              manualRate:
                input.exchangeRate,
            },
          );

    const pricelistId =
      deps.optionalUuid(
        input.pricelistId,
      );

    const lines =
      await deps.normalizeQuoteLines(
        client,
        context,
        input.lines,
        {
          pricelistId,
          billingCustomerId:
            customer.billingCustomerId,
          quoteDate,
          currency,
        },
      );

    const shippingTotal =
      deps.numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const calculated =
      deps.totals(
        lines,
        shippingTotal,
      );

    const deposit =
      deps.normalizeSalesQuoteDeposit(
        input,
        calculated.totalAmount,
      );

    const baseTotalAmount =
      deps.salesBaseAmount(
        calculated.totalAmount,
        exchangeRate.rate,
      );

    const approvalRequired =
      deps.salesQuoteRequiresLegacyApproval(
        settings.require_quote_approval,
        settings.quote_approval_threshold,
        baseTotalAmount,
      );

    const approvalStatus =
      approvalRequired
        ? 'draft'
        : 'not_required';

    await client.query(
      `
        UPDATE sales_quotes
        SET
          billing_customer_id = $3,
          template_id = $4,
          quote_date = $5,
          valid_until = $6,
          currency = $7,
          reference = $8,
          approval_status = $9,
          approval_requested_at = NULL,
          approval_requested_by = NULL,
          approved_at = NULL,
          approved_by = NULL,
          approval_rejected_at = NULL,
          approval_rejected_by = NULL,
          approval_rejection_reason = NULL,
          customer_name = $10,
          customer_email = $11,
          customer_phone = $12,
          customer_tax_id = $13,
          billing_address = $14,
          shipping_address = $15,
          subtotal = $16,
          discount_total = $17,
          tax_total = $18,
          shipping_total = $19,
          total_amount = $20,
          pricelist_id = $21,
          cost_total = $22,
          margin_amount = $23,
          margin_percent = $24,
          notes = $25,
          terms = $26,
          internal_notes = $27,
          updated_by = $28,
          deposit_type = $29,
          deposit_value = $30,
          salesperson_user_id = $31,
          sales_team_id = $32,
          territory_id = $33,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        customer.billingCustomerId,
        template
          ?.id ||
        null,
        quoteDate,
        validUntil,
        currency,
        deps.nullableText(
          input.reference,
          255,
        ),
        approvalStatus,
        customer.customerName,
        customer.customerEmail,
        customer.customerPhone,
        customer.customerTaxId,
        customer.billingAddress,
        customer.shippingAddress,
        calculated.subtotal,
        calculated.discountTotal,
        calculated.taxTotal,
        shippingTotal,
        calculated.totalAmount,
        pricelistId,
        calculated.costTotal,
        calculated.marginAmount,
        calculated.marginPercent,
        deps.nullableText(
          input.notes ||
          template
            ?.notes ||
          settings.default_notes,
          6000,
        ),
        deps.nullableText(
          input.terms ||
          template
            ?.terms ||
          settings.terms_and_conditions,
          12000,
        ),
        deps.nullableText(
          input.internalNotes,
          6000,
        ),
        context.userId,
        deposit.depositType,
        deposit.depositValue,
        salespersonUserId,
        salespersonAssignment.salesTeamId,
        salespersonAssignment.territoryId,
      ],
    );

    await client.query(
      `
        UPDATE sales_quotes
        SET
          base_currency = $3,
          exchange_rate = $4,
          exchange_rate_date = $5,
          exchange_rate_source = $6,
          base_total_amount = $7
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        exchangeRate.baseCurrency,
        exchangeRate.rate,
        exchangeRate.effectiveDate,
        exchangeRate.sourceName ||
          exchangeRate.source,
        baseTotalAmount,
      ],
    );

    await client.query(
      `
        DELETE FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

    await deps.insertQuoteLines(
      client,
      context.companyId,
      quoteId,
      lines,
    );

    await deps.recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.updated',
        content:
          'Quote ' +
          String(
            existing.rows[0]
              .quote_number,
          ) +
          ' updated.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      quoteNumber:
        String(
          existing.rows[0]
            .quote_number,
        ),
      status:
        'draft',
      totalAmount:
        calculated.totalAmount,
      currency,
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




export async function updateSalesQuoteDraft(
  input: CreateSalesQuoteInput & { quoteId?: unknown },
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_EDIT);
  return updateSalesQuoteDraftTransaction(input, context);
}


export async function duplicateSalesQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_CREATE,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const quote =
    await context.pool.query(
      `
        SELECT *
        FROM sales_quotes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

  if (
    quote.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
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
          unit_cost,
          discount_type,
          discount_value,
          tax_name_snapshot,
          tax_rate
        FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

  const optionalItems =
    await context.pool.query(
      `
        SELECT
          catalog_item_id,
          external_product_id,
          sort_order,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          unit_cost,
          tax_name_snapshot,
          tax_rate
        FROM sales_quote_optional_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY sort_order, id
      `,
      [quoteId, context.companyId],
    );

  const row =
    quote.rows[0];

  return createSalesQuote({
    opportunityId:
      crossPermission(
        context,
        SALES_PERMISSIONS.PIPELINE_VIEW,
        SALES_PERMISSIONS.PIPELINE_MANAGE,
      )
        ? row.opportunity_id || undefined
        : undefined,
    salespersonUserId:
      crossPermission(
        context,
        SALES_PERMISSIONS.PIPELINE_VIEW,
        SALES_PERMISSIONS.PIPELINE_MANAGE,
      )
        ? row.salesperson_user_id || undefined
        : undefined,
    billingCustomerId:
      row.billing_customer_id,
    templateId:
      row.template_id,
    pricelistId:
      row.pricelist_id,
    quoteDate:
      isoDate(
        null,
      ),
    validUntil:
      undefined,
    currency:
      row.currency,
    reference:
      row.reference,
    customerName:
      row.customer_name,
    customerEmail:
      row.customer_email,
    customerPhone:
      row.customer_phone,
    customerTaxId:
      row.customer_tax_id,
    billingAddress:
      row.billing_address,
    shippingAddress:
      row.shipping_address,
    shippingTotal:
      row.shipping_total,
    depositType:
      row.deposit_type || 'none',
    depositValue:
      row.deposit_value || 0,
    notes:
      row.notes,
    terms:
      row.terms,
    internalNotes:
      row.internal_notes,
    optionalItems:
      optionalItems.rows.map(item => ({
        catalogItemId: item.catalog_item_id || undefined,
        externalProductId: item.external_product_id || undefined,
        sortOrder: Number(item.sort_order || 0),
        description: item.description,
        sku: item.sku_snapshot,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: money(item.unit_price),
        unitCost: crossPermission(context, SALES_PERMISSIONS.MARGIN_MANAGE)
          ? money(item.unit_cost)
          : undefined,
        taxName: item.tax_name_snapshot,
        taxRate: Number(item.tax_rate),
      })),
    lines:
      lines.rows.map(
        line => ({
          catalogItemId:
            line.catalog_item_id ||
            undefined,
          description:
            line.description,
          sku:
            line.sku_snapshot,
          unit:
            line.unit,
          quantity:
            Number(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          unitCost:
            crossPermission(
              context,
              SALES_PERMISSIONS
                .MARGIN_MANAGE,
            )
              ? money(
                  line.unit_cost,
                )
              : undefined,
          discountType:
            line.discount_type,
          discountValue:
            money(
              line.discount_value,
            ),
          taxName:
            line.tax_name_snapshot,
          taxRate:
            Number(
              line.tax_rate,
            ),
        }),
      ),
  });
}


export async function changeSalesQuoteStatus(
  input:
    Record<string, unknown>,
) {
  const nextStatus =
    cleanText(
      input.status,
      30,
    );

  const permission =
    [
      'accepted',
      'rejected',
    ].includes(
      nextStatus,
    )
      ? SALES_PERMISSIONS
          .QUOTE_APPROVE
      : SALES_PERMISSIONS
          .QUOTE_CANCEL;

  const context =
    await requireSalesContext(
      permission,
    );

  if (
    ![
      'accepted',
      'rejected',
      'cancelled',
    ].includes(
      nextStatus,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid quote status action.',
    );
  }

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    (
      nextStatus ===
        'rejected' ||
      nextStatus ===
        'cancelled'
    ) &&
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A reason is required for rejection or cancellation.',
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
            quote_number,
            status,
            approval_status,
            valid_until,
            sales_order_id
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const current =
      String(
        existing.rows[0].status,
      );

    const approvalStatus =
      String(
        existing.rows[0].approval_status ||
        'not_required',
      );

    if (nextStatus === 'accepted') {
      await assertSalesQuoteApprovalSatisfied(client, context.companyId, quoteId);
    }

    if (
      nextStatus === 'accepted' &&
      ![
        'approved',
        'not_required',
      ].includes(approvalStatus)
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Complete internal quotation approval before accepting this quote.',
      );
    }

    if (
      shouldExpireSalesQuoteBeforeAcceptance(
        existing.rows[0].valid_until,
        current,
        nextStatus,
      )
    ) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            status = 'expired',
            expired_at = COALESCE(expired_at, NOW()),
            public_enabled = FALSE,
            updated_by = $3::uuid,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          quoteId,
          context.companyId,
          context.userId,
        ],
      );

      await client.query(
        `
          INSERT INTO sales_quote_status_history (
            quote_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1, $2, $3, 'expired', $4, $5
          )
        `,
        [
          quoteId,
          context.companyId,
          current,
          'Quotation expired before acceptance.',
          context.userId,
        ],
      );

      await recordSalesActivity(
        client,
        {
          companyId: context.companyId,
          userId: context.userId,
          quoteId,
          type: 'sales.quote.expired',
          content:
            'Quote ' +
            String(existing.rows[0].quote_number) +
            ' expired before acceptance.',
          metadata: {
            attemptedAction: nextStatus,
            reason: 'validity_expired',
          },
        },
      );

      await client.query('COMMIT');

      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote has expired. Duplicate it to issue a new offer.',
      );
    }

    const allowed =
      nextStatus ===
        'accepted'
        ? [
            'draft',
            'sent',
            'viewed',
          ]
        : nextStatus ===
            'rejected'
          ? [
              'sent',
              'viewed',
            ]
          : [
              'draft',
              'sent',
              'viewed',
              'accepted',
            ];

    if (
      !allowed.includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote cannot be changed from ' +
        current +
        ' to ' +
        nextStatus +
        '.',
      );
    }

    if (
      existing.rows[0]
        .sales_order_id
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote is already linked to a sales order and cannot be closed directly.',
      );
    }

    const cancelledApprovalRequestIds =
      ['cancelled', 'rejected'].includes(nextStatus)
        ? await cancelPendingSalesQuoteApproval(client, context.companyId, quoteId, 'cancelled')
        : [];

    await client.query(
      `
        UPDATE sales_quotes
        SET
          status = $3::varchar(30),
          accepted_at =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN NOW()
              ELSE accepted_at
            END,
          rejected_at =
            CASE
              WHEN $3::varchar(30) =
                   'rejected'
              THEN NOW()
              ELSE rejected_at
            END,
          public_enabled =
            CASE
              WHEN $3::varchar(30) IN (
                'rejected',
                'cancelled'
              )
              THEN FALSE
              ELSE public_enabled
            END,
          updated_by = $4::uuid,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        nextStatus,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_quote_status_history (
          quote_id,
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
        quoteId,
        context.companyId,
        current,
        nextStatus,
        reason,
        context.userId,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.' +
          nextStatus,
        content:
          'Quote ' +
          String(
            existing.rows[0]
              .quote_number,
          ) +
          ' changed to ' +
          nextStatus +
          '.',
        metadata: {
          reason,
          cancelledApprovalRequestIds,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    if (
      nextStatus ===
        'accepted'
    ) {
      await emitSalesAutomationEvent(
        context,
        {
          triggerKey:
            'sales.quote.accepted',
          recordType:
            'sales_quote',
          recordId:
            quoteId,
          idempotencySeed:
            'accepted:' +
            quoteId,
          payload: {
            status:
              nextStatus,
          },
        },
      );
    }

    return {
      id:
        quoteId,
      status:
        nextStatus,
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


export async function requestSalesQuoteApproval(input: Record<string, unknown>) {
  return requestAdvancedSalesQuoteApproval(input);
}

export async function reviewSalesQuoteApproval(input: Record<string, unknown>) {
  return reviewAdvancedSalesQuoteApproval(input);
}


export async function sendSalesQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_SEND,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const channels =
    normalizeSalesQuoteDeliveryChannels(
      input.channels,
    );

  const result =
    await deliverSalesQuote({
      pool:
        context.pool,
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      companyName:
        context.company
          .currentCompany.name,
      userId:
        context.userId,
      quoteId,
      channels,
      requireDraft: input.requireDraft === true,
    });

  await emitSalesAutomationEvent(
    context,
    {
      triggerKey:
        'sales.quote.sent',
      recordType:
        'sales_quote',
      recordId:
        quoteId,
      idempotencySeed:
        'sent:' +
        quoteId +
        ':' +
        Date.now(),
      payload: {
        channels,
      },
    },
  );

  return result;
}


type SalesOrderConversionDependencies = {
  ensureSalesDefaults: typeof ensureSalesDefaults;
  normalizeSalesQuoteDeposit: typeof normalizeSalesQuoteDeposit;
  money: typeof money;
  assertSalesQuoteApprovalSatisfied: typeof assertSalesQuoteApprovalSatisfied;
  nextSalesNumber: typeof nextSalesNumber;
  resolveSalesAssignmentForUser: typeof resolveSalesAssignmentForUser;
  reserveSalesOrderInventory: typeof reserveSalesOrderInventory;
  recordSalesOrderCommissionEntries: typeof recordSalesOrderCommissionEntries;
  markSalesOpportunityWonFromAcceptedQuote: typeof markSalesOpportunityWonFromAcceptedQuote;
  requireUuid: typeof requireUuid;
  recordSalesActivity: typeof recordSalesActivity;
  emitSalesAutomationEvent: typeof emitSalesAutomationEvent;
};

const defaultSalesOrderConversionDependencies: SalesOrderConversionDependencies = {
  ensureSalesDefaults,
  normalizeSalesQuoteDeposit,
  money,
  assertSalesQuoteApprovalSatisfied,
  nextSalesNumber,
  resolveSalesAssignmentForUser,
  reserveSalesOrderInventory,
  recordSalesOrderCommissionEntries,
  markSalesOpportunityWonFromAcceptedQuote,
  requireUuid,
  recordSalesActivity,
  emitSalesAutomationEvent,
};

/**
 * Transaction-level quote conversion primitive. Production entry points must
 * authorize the caller before invoking this function. Dependencies are
 * overrideable for PostgreSQL integration tests of the Sales transaction
 * without faking the persistence layer or unrelated module adapters.
 */
export async function createSalesOrderFromQuoteTransaction(
  input: { quoteId: string; overrideCreditLimit?: unknown },
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesOrderConversionDependencies> = {},
) {
  const deps: SalesOrderConversionDependencies = {
    ...defaultSalesOrderConversionDependencies,
    ...overrides,
  };
  const quoteId = input.quoteId;

  await deps.ensureSalesDefaults(
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

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-from-quote:' +
        quoteId,
      ],
    );

    const quote =
      await client.query(
        `
          SELECT *
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      quote.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const row =
      quote.rows[0];

    if (
      row.sales_order_id
    ) {
      const existing =
        await client.query(
          `
            SELECT
              id,
              order_number,
              status,
              latest_invoice_id
            FROM sales_orders_v2
            WHERE id = $1
              AND company_id = $2
              AND quote_id = $3
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            row.sales_order_id,
            context.companyId,
            quoteId,
          ],
        );

      if (
        existing.rows.length ===
          1
      ) {
        if (String(existing.rows[0].status) !== 'cancelled') {
          await deps.markSalesOpportunityWonFromAcceptedQuote(
            client,
            {
              companyId: context.companyId,
              userId: context.userId,
              opportunityId: row.opportunity_id,
              quoteId,
              quoteNumber: String(row.quote_number || ''),
              orderId: String(existing.rows[0].id),
              orderNumber: String(existing.rows[0].order_number),
            },
            deps.requireUuid,
          );
        }

        await client.query(
          'COMMIT',
        );

        return {
          id:
            String(
              existing.rows[0].id,
            ),
          orderNumber:
            String(
              existing.rows[0]
                .order_number,
            ),
          status:
            String(
              existing.rows[0].status,
            ),
          invoiceId:
            existing.rows[0]
              .latest_invoice_id
              ? String(
                  existing.rows[0]
                    .latest_invoice_id,
                )
              : null,
        };
      }

      // Do not silently create a second order when a quote still points to a
      // missing or soft-deleted order. Preserve the link for diagnosis/recovery.
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote references a missing, deleted, or mismatched sales order. Resolve the existing order link before retrying conversion.',
      );
    } else {
      const existingByQuote = await client.query(
        `
          SELECT id
          FROM sales_orders_v2
          WHERE quote_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [quoteId, context.companyId],
      );

      if (existingByQuote.rows.length > 0) {
        throw new SalesError(
          'QUOTE_STATE_INVALID',
          'A sales order already references this quotation but the quotation link is missing. Resolve the existing order link before retrying conversion.',
        );
      }
    }

    const currentStatus =
      String(
        row.status,
      );

    const orderDeposit =
      deps.normalizeSalesQuoteDeposit(
        {
          depositType: row.deposit_type,
          depositValue: row.deposit_value,
        },
        deps.money(row.total_amount),
      );

    if (currentStatus === 'converted' && !row.sales_order_id) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quotation is marked converted but has no linked sales order. Resolve the record before retrying conversion.',
      );
    }

    if (
      ![
        'accepted',
        'converted',
      ].includes(
        currentStatus,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Accept the quote before creating a sales order.',
      );
    }

    await deps.assertSalesQuoteApprovalSatisfied(client, context.companyId, quoteId);

    const approvalStatus =
      String(
        row.approval_status ||
        'not_required',
      );

    if (
      ![
        'approved',
        'not_required',
      ].includes(approvalStatus)
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Complete internal quotation approval before creating a sales order.',
      );
    }

    const creditSettings = (
      await client.query(
        `SELECT credit_limit_enforced FROM sales_settings WHERE company_id = $1 LIMIT 1`,
        [context.companyId],
      )
    ).rows[0] || {};
    await enforceSalesCustomerCreditLimit(client, context, {
      billingCustomerId: row.billing_customer_id ? String(row.billing_customer_id) : null,
      totalBaseAmount: money(row.base_total_amount ?? salesBaseAmount(row.total_amount, Number(row.exchange_rate || 1))),
      creditLimitEnforced: creditSettings.credit_limit_enforced,
      overrideCreditLimit: input.overrideCreditLimit,
    });

    const orderNumber =
      await deps.nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'order',
      );

    const salespersonUserId =
      row.salesperson_user_id
        ? String(
            row.salesperson_user_id,
          )
        : context.userId;

    let salesTeamId =
      row.sales_team_id
        ? String(
            row.sales_team_id,
          )
        : null;

    let territoryId =
      row.territory_id
        ? String(
            row.territory_id,
          )
        : null;

    if (
      !salesTeamId
    ) {
      const assignment =
        await deps.resolveSalesAssignmentForUser(
          client,
          {
            companyId:
              context.companyId,
            userId:
              salespersonUserId,
          },
        );

      salesTeamId =
        assignment.salesTeamId;

      territoryId =
        territoryId ||
        assignment.territoryId;
    }

    const order =
      await client.query(
        `
          INSERT INTO sales_orders_v2 (
            company_id,
            quote_id,
            order_number,
            status,
            order_date,
            currency,
            reference,
            customer_name,
            customer_email,
            customer_phone,
            customer_tax_id,
            billing_address,
            shipping_address,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            total_amount,
            pricelist_id,
            cost_total,
            margin_amount,
            margin_percent,
            salesperson_user_id,
            sales_team_id,
            territory_id,
            notes,
            terms,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,
            'confirmed',
            CURRENT_DATE,
            $4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$26
          )
          RETURNING
            id,
            order_number,
            status
        `,
        [
          context.companyId,
          quoteId,
          orderNumber,
          row.currency,
          row.reference,
          row.customer_name,
          row.customer_email,
          row.customer_phone,
          row.customer_tax_id,
          row.billing_address,
          row.shipping_address,
          row.subtotal,
          row.discount_total,
          row.tax_total,
          row.shipping_total,
          row.total_amount,
          row.pricelist_id,
          row.cost_total,
          row.margin_amount,
          row.margin_percent,
          salespersonUserId,
          salesTeamId,
          territoryId,
          row.notes,
          row.terms,
          context.userId,
        ],
      );

    const orderId =
      String(
        order.rows[0].id,
      );

    // PostgreSQL DATE columns may be materialized by node-postgres as Date
    // objects. Normalize them before passing a DATE parameter back to SQL.
    const exchangeRateDate =
      salesDateOnly(row.exchange_rate_date) ||
      salesDateOnly(row.quote_date);

    if (!exchangeRateDate) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quotation has an invalid exchange-rate date. Correct the date before converting it to an order.',
      );
    }

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          base_currency = $3,
          exchange_rate = $4,
          exchange_rate_date = $5,
          exchange_rate_source = $6,
          base_total_amount = $7
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        String(
          row.base_currency ||
          context.company
            .currentCompany
            .currency ||
          row.currency,
        ),
        Number(
          row.exchange_rate ||
          1,
        ),
        exchangeRateDate,
        String(
          row.exchange_rate_source ||
          'base',
        ),
        Number(
          row.base_total_amount ||
          row.total_amount ||
          0,
        ),
      ],
    );

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          deposit_type = $3,
          deposit_value = $4,
          deposit_required_amount = $5,
          deposit_status = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        orderDeposit.depositType,
        orderDeposit.depositValue,
        orderDeposit.requiredAmount,
        orderDeposit.requiredAmount > 0 ? 'pending' : 'none',
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,
          'confirmed',
          'Created from accepted quote',
          $3
        )
      `,
      [
        orderId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_order_items_v2 (
          sales_order_id,
          company_id,
          catalog_item_id,
          external_product_id,
          sort_order,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          unit_cost,
          cost_total,
          margin_amount,
          margin_percent,
          discount_type,
          discount_value,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        )
        SELECT
          $3,
          company_id,
          catalog_item_id,
          external_product_id,
          sort_order,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          unit_cost,
          cost_total,
          margin_amount,
          margin_percent,
          discount_type,
          discount_value,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quoteId,
        context.companyId,
        orderId,
      ],
    );

    await deps.reserveSalesOrderInventory(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId,
      },
    );

    await deps.recordSalesOrderCommissionEntries(
      client,
      {
        companyId:
          context.companyId,
        orderId,
        salespersonUserId,
        salesTeamId,
        orderDate:
          new Date()
            .toISOString()
            .slice(
              0,
              10,
            ),
        currency:
          String(
            row.currency,
          ),
        revenueAmount:
          deps.money(
            row.subtotal,
          ) -
          deps.money(
            row.discount_total,
          ),
        marginAmount:
          deps.money(
            row.margin_amount,
          ),
        userId:
          context.userId,
      },
    );

    await client.query(
      `
        UPDATE sales_quotes
        SET
          sales_order_id = $3,
          status = 'converted',
          salesperson_user_id =
            COALESCE(
              salesperson_user_id,
              $5
            ),
          sales_team_id =
            COALESCE(
              sales_team_id,
              $6
            ),
          territory_id =
            COALESCE(
              territory_id,
              $7
            ),
          converted_at =
            COALESCE(
              converted_at,
              NOW()
            ),
          public_enabled =
            FALSE,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        orderId,
        context.userId,
        salespersonUserId,
        salesTeamId,
        territoryId,
      ],
    );

    if (
      currentStatus !==
        'converted'
    ) {
      await client.query(
        `
          INSERT INTO sales_quote_status_history (
            quote_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1,$2,$3,
            'converted',
            'Converted to sales order',
            $4
          )
        `,
        [
          quoteId,
          context.companyId,
          currentStatus,
          context.userId,
        ],
      );
    }

    await deps.markSalesOpportunityWonFromAcceptedQuote(
      client,
      {
        companyId: context.companyId,
        userId: context.userId,
        opportunityId: row.opportunity_id,
        quoteId,
        quoteNumber: String(row.quote_number || ''),
        orderId,
        orderNumber,
      },
      deps.requireUuid,
    );

    await deps.recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.converted',
        content:
          'Quote ' +
          String(
            row.quote_number,
          ) +
          ' converted to sales order ' +
          orderNumber +
          '.',
        metadata: {
          orderId,
          orderNumber,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    await deps.emitSalesAutomationEvent(
      context,
      {
        triggerKey:
          'sales.order.created',
        recordType:
          'sales_order',
        recordId:
          orderId,
        idempotencySeed:
          'created:' +
          orderId,
        payload: {
          quoteId,
          orderNumber,
        },
      },
    );

    return {
      id:
        orderId,
      orderNumber,
      status:
        'confirmed',
      invoiceId:
        null,
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



export async function createSalesOrderFromQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_CONVERT,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  return createSalesOrderFromQuoteTransaction(
    { quoteId, overrideCreditLimit: input.overrideCreditLimit },
    context,
  );
}


export async function convertSalesQuoteToInvoice(
  input:
    Record<string, unknown>,
) {
  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  // Preflight cross-module permissions before creating the order. Invoice
  // creation checks these again, but discovering a missing permission only
  // after quote conversion would leave a new order without its invoice.
  const salesContext = await requireSalesContext(
    SALES_PERMISSIONS
      .ORDER_MANAGE,
  );

  const invoicingContext = await (async () => {
    try {
      return await requireInvoicingContext(
        INVOICING_PERMISSIONS
          .INVOICE_CREATE,
      );
    } catch (error) {
      if (error instanceof InvoicingError) {
        if (error.code === 'INVOICING_PERMISSION_REQUIRED') {
          throw new SalesError(
            'SALES_PERMISSION_REQUIRED',
            'Invoice-creation permission is required to convert a quotation to an invoice.',
            error.details,
          );
        }

        if (error.code === 'INVOICING_NOT_INSTALLED') {
          throw new SalesError(
            'INVOICING_REQUIRED',
            'Install Invoicing before converting a quotation to an invoice.',
            error.details,
          );
        }

        if (error.code === 'INVOICING_WORKSPACE_SUSPENDED') {
          throw new SalesError(
            'SALES_WORKSPACE_SUSPENDED',
            error.message,
            error.details,
          );
        }
      }

      throw error;
    }
  })();

  const customerPermissions = [
    INVOICING_PERMISSIONS.CUSTOMER_VIEW,
    INVOICING_PERMISSIONS.CUSTOMER_MANAGE,
  ] as const;

  if (
    !hasAnyInvoicingPermission(
      invoicingContext.permissions.isOwner,
      invoicingContext.permissions.permissionSet,
      customerPermissions,
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Customer access is required to create an invoice.',
      {
        permission:
          INVOICING_PERMISSIONS.CUSTOMER_VIEW,
      },
    );
  }

  // If the quotation has no active billing customer, invoice creation will
  // need customer-management permission in order to create/link one.
  const quoteBilling = await salesContext.pool.query(
    `
      SELECT
        sq.billing_customer_id,
        customer.id AS active_billing_customer_id
      FROM sales_quotes sq
      LEFT JOIN invoicing_customers customer
        ON customer.id = sq.billing_customer_id
       AND customer.company_id = sq.company_id
       AND customer.status = 'active'
       AND customer.deleted_at IS NULL
      WHERE sq.id = $1
        AND sq.company_id = $2
        AND sq.deleted_at IS NULL
      LIMIT 1
    `,
    [
      quoteId,
      salesContext.companyId,
    ],
  );

  if (quoteBilling.rows.length !== 1) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quotation was not found.',
    );
  }

  if (
    !quoteBilling.rows[0].active_billing_customer_id &&
    !hasAnyInvoicingPermission(
      invoicingContext.permissions.isOwner,
      invoicingContext.permissions.permissionSet,
      [
        INVOICING_PERMISSIONS.CUSTOMER_MANAGE,
      ],
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Customer-management access is required to create the billing customer for this quotation.',
      {
        permission:
          INVOICING_PERMISSIONS.CUSTOMER_MANAGE,
      },
    );
  }

  const order =
    await createSalesOrderFromQuote({
      quoteId,
    });

  const invoice =
    await createSalesOrderInvoice({
      orderId:
        order.id,
      idempotencyKey:
        cleanText(
          input.idempotencyKey,
          120,
        ) ||
        (
          'quote-' +
          quoteId
        ),
      exchangeRate:
        input.exchangeRate,
    });

  return {
    orderId:
      order.id,
    orderNumber:
      order.orderNumber,
    invoiceId:
      invoice.invoiceId,
    reused:
      invoice.reused,
  };
}


type SalesOrderFulfillmentDependencies = {
  postSalesFulfillmentToInventory: typeof postSalesFulfillmentToInventory;
  emitSalesAutomationEvent: typeof emitSalesAutomationEvent;
};

const defaultSalesOrderFulfillmentDependencies: SalesOrderFulfillmentDependencies = {
  postSalesFulfillmentToInventory,
  emitSalesAutomationEvent,
};

/**
 * Transaction-level order fulfillment primitive. Production entry points must
 * authorize the caller before invoking this helper. Dependencies can be
 * overridden by PostgreSQL integration tests while retaining real persistence.
 */
export async function updateSalesOrderFulfillmentTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesOrderFulfillmentDependencies> = {},
) {
  const deps: SalesOrderFulfillmentDependencies = {
    ...defaultSalesOrderFulfillmentDependencies,
    ...overrides,
  };

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const updates =
    Array.isArray(
      input.lines,
    )
      ? input.lines
      : [];

  if (
    updates.length ===
      0 ||
    updates.length >
      200
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose at least one sales-order line to update.',
    );
  }

  // Reject duplicate line IDs before opening a transaction so one request
  // cannot post inventory fulfillment twice for the same sales-order line.
  const requestedLineIds = new Set<string>();
  for (const raw of updates) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A fulfillment line is invalid.',
      );
    }

    const row = raw as Record<string, unknown>;
    const lineId = requireUuid(row.lineId, 'Sales order line').toLowerCase();
    if (requestedLineIds.has(lineId)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A fulfillment line can only be updated once per request.',
      );
    }
    requestedLineIds.add(lineId);
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-invoice:' + orderId,
      ],
    );

    const order =
      await client.query(
        `
          SELECT
            order_number,
            status,
            fulfillment_status,
            invoice_status
          FROM sales_orders_v2
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const currentStatus =
      String(
        order.rows[0].status,
      );

    const currentFulfillment =
      String(
        order.rows[0]
          .fulfillment_status ||
        'not_started',
      );

    const currentInvoiceStatus =
      String(
        order.rows[0]
          .invoice_status ||
        'not_invoiced',
      );

    if (
      [
        'cancelled',
        'closed',
      ].includes(
        currentStatus,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This sales order can no longer change fulfillment quantities.',
      );
    }

    for (
      const raw
      of updates
    ) {
      if (
        !raw ||
        typeof raw !==
          'object' ||
        Array.isArray(
          raw,
        )
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'A fulfillment line is invalid.',
        );
      }

      const row =
        raw as
          Record<
            string,
            unknown
          >;

      const lineId =
        requireUuid(
          row.lineId,
          'Sales order line',
        );

      const deliveredQuantity =
        numberInput(
          row.deliveredQuantity,
          'Delivered quantity',
          {
            min:
              0,
            max:
              1_000_000,
          },
        );

      const existingLine =
        await client.query(
          `
            SELECT
              quantity,
              shipped_quantity,
              delivered_quantity,
              external_product_id,
              stock_reservation_id
            FROM sales_order_items_v2
            WHERE id = $1
              AND sales_order_id = $2
              AND company_id = $3
            FOR UPDATE
          `,
          [
            lineId,
            orderId,
            context.companyId,
          ],
        );

      if (
        existingLine.rows.length !==
          1 ||
        deliveredQuantity >
          Number(
            existingLine.rows[0]
              .quantity ||
            0,
          )
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Delivered quantity cannot exceed the ordered quantity.',
        );
      }

      if (
        deliveredQuantity <
          Number(
            existingLine.rows[0]
              .delivered_quantity ||
            0,
          ) -
            0.000001
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Delivered quantity cannot be reduced directly. Create a Sales return so stock, credits and refunds remain auditable.',
        );
      }

      const previousShippedQuantity = Number(existingLine.rows[0].shipped_quantity || 0);
      const nextShippedQuantity = Math.max(previousShippedQuantity, deliveredQuantity);
      const shippedDelta = nextShippedQuantity - previousShippedQuantity;
      const inventoryResult = await deps.postSalesFulfillmentToInventory(
        client,
        {
          companyId: context.companyId,
          userId: context.userId,
          orderId,
          lineId,
          orderedQuantity: Number(existingLine.rows[0].quantity || 0),
          quantityDelta: shippedDelta,
          nextFulfilledQuantity: nextShippedQuantity,
          externalProductId: existingLine.rows[0].external_product_id
            ? String(existingLine.rows[0].external_product_id)
            : null,
          reservationId: existingLine.rows[0].stock_reservation_id
            ? String(existingLine.rows[0].stock_reservation_id)
            : null,
        },
      );

      if (!inventoryResult.integrated) {
        throw new SalesError(
          'INVENTORY_INTEGRATION_UNAVAILABLE',
          'Inventory could not record this fulfillment. Check the product mapping, warehouse, reservation and Inventory availability, then retry.',
          inventoryResult,
        );
      }

      await client.query(
        `
          UPDATE sales_order_items_v2
          SET
            shipped_quantity = $4,
            delivered_quantity = $5
          WHERE id = $1
            AND sales_order_id = $2
            AND company_id = $3
        `,
        [lineId, orderId, context.companyId, nextShippedQuantity, deliveredQuantity],
      );
    }

    const totals =
      (
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(quantity),
                0
              ) AS ordered,
              COALESCE(
                SUM(delivered_quantity),
                0
              ) AS delivered
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const ordered =
      Number(
        totals.ordered ||
        0,
      );

    const delivered =
      Number(
        totals.delivered ||
        0,
      );

    const nextFulfillment =
      delivered <=
        0
        ? 'not_started'
        : delivered >=
            ordered
          ? 'fulfilled'
          : 'partial';

    const nextStatus =
      nextFulfillment ===
        'fulfilled' &&
      currentInvoiceStatus ===
        'invoiced'
        ? 'closed'
        : 'confirmed';

    if (
      currentFulfillment !==
        nextFulfillment
    ) {
      await client.query(
        `
          INSERT INTO sales_order_status_history (
            sales_order_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1,$2,$3,$4,
            'Fulfillment quantities updated',
            $5
          )
        `,
        [
          orderId,
          context.companyId,
          'fulfillment:' +
          currentFulfillment,
          'fulfillment:' +
          nextFulfillment,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          status = $3,
          fulfillment_status = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        nextStatus,
        nextFulfillment,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await deps.emitSalesAutomationEvent(
      context,
      {
        triggerKey:
          'sales.order.fulfillment.changed',
        recordType:
          'sales_order',
        recordId:
          orderId,
        idempotencySeed:
          'fulfillment:' +
          orderId +
          ':' +
          nextFulfillment +
          ':' +
          delivered,
        payload: {
          fulfillmentStatus:
            nextFulfillment,
          orderedQuantity:
            ordered,
          deliveredQuantity:
            delivered,
        },
      },
    );

    return {
      id:
        orderId,
      status:
        nextStatus,
      fulfillmentStatus:
        nextFulfillment,
      invoiceStatus:
        currentInvoiceStatus,
      orderedQuantity:
        ordered,
      deliveredQuantity:
        delivered,
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


export async function updateSalesOrderFulfillment(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS
      .ORDER_MANAGE,
  );

  return updateSalesOrderFulfillmentTransaction(
    input,
    context,
  );
}

export async function cancelSalesOrder(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .ORDER_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A reason is required to cancel a sales order.',
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
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-invoice:' + orderId,
      ],
    );

    const order =
      await client.query(
        `
          SELECT
            o.order_number,
            o.status,
            COALESCE(
              (
                SELECT SUM(
                  oi.invoiced_quantity
                )
                FROM sales_order_items_v2 oi
                WHERE oi.sales_order_id =
                      o.id
                  AND oi.company_id =
                      o.company_id
              ),
              0
            ) AS invoiced_quantity,
            COALESCE(
              (
                SELECT SUM(
                  oi.shipped_quantity
                )
                FROM sales_order_items_v2 oi
                WHERE oi.sales_order_id =
                      o.id
                  AND oi.company_id =
                      o.company_id
              ),
              0
            ) AS shipped_quantity,
            COALESCE(
              (
                SELECT SUM(
                  oi.delivered_quantity
                )
                FROM sales_order_items_v2 oi
                WHERE oi.sales_order_id =
                      o.id
                  AND oi.company_id =
                      o.company_id
              ),
              0
            ) AS delivered_quantity
          FROM sales_orders_v2 o
          WHERE o.id = $1
            AND o.company_id = $2
            AND o.deleted_at IS NULL
          FOR UPDATE
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const current =
      String(
        order.rows[0].status,
      );

    if (
      current ===
        'cancelled'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          orderId,
        status:
          'cancelled',
      };
    }

    if (
      Number(
        order.rows[0]
          .invoiced_quantity ||
        0,
      ) >
        0
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This order already has invoiced quantities. Correct the related invoice before cancelling the order.',
      );
    }

    if (
      Number(order.rows[0].shipped_quantity || 0) > 0 ||
      Number(order.rows[0].delivered_quantity || 0) > 0
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This order has shipped or delivered quantities. Process a Sales return to reverse stock and handle related credits before cancelling the order.',
      );
    }

    const pendingShipments =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM sales_shipments
          WHERE company_id = $1
            AND sales_order_id = $2
            AND status NOT IN (
              'cancelled',
              'failed',
              'delivered'
            )
            AND inventory_posted_at IS NULL
        `,
        [
          context.companyId,
          orderId,
        ],
      );

    if (Number(pendingShipments.rows[0]?.count || 0) > 0) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Cancel all unshipped shipment plans before cancelling this order so shipment quantities and stock reservations remain consistent.',
      );
    }

    await releaseSalesOrderReservations(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId,
      },
    );

    await reverseSalesOrderCommissions(
      client,
      {
        companyId:
          context.companyId,
        orderId,
        userId:
          context.userId,
        reason,
      },
    );

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          status = 'cancelled',
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,
          'cancelled',
          $4,$5
        )
      `,
      [
        orderId,
        context.companyId,
        current,
        reason,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        orderId,
      status:
        'cancelled',
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


type SalesOrderInvoiceDependencies = {
  createInvoice: (
    input: Parameters<typeof createInvoice>[0],
  ) => Promise<{ id: string }>;
  createInvoicingCustomer: (
    input: Parameters<typeof createInvoicingCustomer>[0],
  ) => Promise<{ id: string }>;
  emitSalesAutomationEvent: typeof emitSalesAutomationEvent;
};

const defaultSalesOrderInvoiceDependencies: SalesOrderInvoiceDependencies = {
  createInvoice,
  createInvoicingCustomer,
  emitSalesAutomationEvent,
};

/**
 * Transaction-level Sales invoicing coordinator. Production entry points must
 * authorize the request before calling this helper. The PostgreSQL integration
 * suite may replace only the Invoicing/customer/automation adapters while
 * executing the real Sales invoice-batch and quantity-persistence logic.
 */
export async function createSalesOrderInvoiceTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesOrderInvoiceDependencies> = {},
) {
  const deps: SalesOrderInvoiceDependencies = {
    ...defaultSalesOrderInvoiceDependencies,
    ...overrides,
  };

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      120,
    ) ||
    crypto
      .randomUUID();

  const client =
    await context.pool.connect();

  const lockKey =
    'sales-order-invoice:' +
    orderId;

  try {
    await client.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        )
      `,
      [
        lockKey,
      ],
    );

    const existingBatch =
      await client.query(
        `
          SELECT
            id,
            invoice_id,
            source_reference,
            status,
            requested_lines
          FROM sales_order_invoice_batches
          WHERE company_id = $1
            AND sales_order_id = $2
            AND idempotency_key = $3
          LIMIT 1
        `,
        [
          context.companyId,
          orderId,
          idempotencyKey,
        ],
      );

    if (
      existingBatch.rows.length > 0 &&
      existingBatch.rows[0].invoice_id
    ) {
      const storedValue =
        existingBatch.rows[0].requested_lines;
      let storedSelection: unknown = storedValue;

      if (typeof storedValue === 'string') {
        try {
          storedSelection = JSON.parse(storedValue);
        } catch {
          storedSelection = null;
        }
      }

      let storedMode: 'explicit' | 'all_remaining' | null = null;
      let storedLines: unknown = storedSelection;
      const isWrappedSelection =
        Boolean(storedSelection) &&
        typeof storedSelection === 'object' &&
        !Array.isArray(storedSelection);

      if (Array.isArray(storedSelection)) {
        // Legacy rows stored only the selected lines, without the selection mode.
        storedLines = storedSelection;
      } else if (isWrappedSelection) {
        const selectionRecord =
          storedSelection as Record<string, unknown>;
        storedMode =
          selectionRecord.mode === 'explicit' ||
          selectionRecord.mode === 'all_remaining'
            ? selectionRecord.mode
            : null;
        storedLines = selectionRecord.lines;
      }

      if (
        !Array.isArray(storedLines) ||
        (isWrappedSelection && storedMode === null)
      ) {
        throw new SalesError(
          'QUOTE_STATE_INVALID',
          'The existing invoice batch has invalid line-selection evidence. Resolve the batch before retrying.',
        );
      }

      const normalizeIdempotentSelection = (items: unknown[]) => {
        const seen = new Set<string>();
        return items.map(rawLine => {
          if (
            !rawLine ||
            typeof rawLine !== 'object' ||
            Array.isArray(rawLine)
          ) {
            throw new SalesError(
              'INVALID_INPUT',
              'An invoice line selection is invalid.',
            );
          }

          const line = rawLine as Record<string, unknown>;
          const lineId = requireUuid(
            line.lineId,
            'Sales order line',
          ).toLowerCase();

          if (seen.has(lineId)) {
            throw new SalesError(
              'INVALID_INPUT',
              'An invoice line can only be selected once.',
            );
          }
          seen.add(lineId);

          return {
            lineId,
            quantity: numberInput(
              line.quantity,
              'Invoice quantity',
              { min: 0.0001, max: 1_000_000 },
            ),
          };
        }).sort((a, b) => a.lineId.localeCompare(b.lineId));
      };

      const originalSelection =
        normalizeIdempotentSelection(storedLines);

      if (Array.isArray(input.lines)) {
        const retrySelection =
          normalizeIdempotentSelection(input.lines);
        if (
          JSON.stringify(originalSelection) !==
          JSON.stringify(retrySelection)
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'This idempotency key already belongs to an invoice with a different line selection. Reuse the original selection or use a new key for a new invoice.',
          );
        }
      } else if (storedMode === 'explicit') {
        // An omitted selection means "all remaining invoiceable quantities".
        // It cannot replay an invoice originally created for selected lines.
        throw new SalesError(
          'INVALID_INPUT',
          'This idempotency key already belongs to an invoice with a different line selection. Retry with the original selection or use a new key for a new invoice.',
        );
      }
    }

    if (
      existingBatch.rows.length >
        0 &&
      existingBatch.rows[0]
        .invoice_id
    ) {
      return {
        orderId,
        invoiceId:
          String(
            existingBatch.rows[0]
              .invoice_id,
          ),
        reused:
          true,
      };
    }

    const settings =
      (
        await client.query(
          `
            SELECT
              allow_partial_invoicing,
              require_billing_customer_for_invoice,
              invoice_policy
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const order =
      await client.query(
        `
          SELECT
            o.*,
            q.billing_customer_id,
            q.quote_number
          FROM sales_orders_v2 o
          LEFT JOIN sales_quotes q
            ON q.id =
               o.quote_id
           AND q.company_id =
               o.company_id
          WHERE o.id = $1
            AND o.company_id = $2
            AND o.deleted_at IS NULL
          LIMIT 1
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const orderRow =
      order.rows[0];

    if (
      orderRow.status ===
        'cancelled'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A cancelled sales order cannot be invoiced.',
      );
    }

    let billingCustomerId =
      orderRow
        .billing_customer_id
        ? String(
            orderRow
              .billing_customer_id,
          )
        : null;
    let isSyntheticWalkInCustomer = false;

    if (
      !billingCustomerId
    ) {
      try {
        const createdCustomer =
          await deps.createInvoicingCustomer({
            name:
              orderRow.customer_name,
            email:
              orderRow.customer_email,
            phone:
              orderRow.customer_phone,
            taxId:
              orderRow.customer_tax_id,
            billingAddress:
              orderRow.billing_address,
            shippingAddress:
              orderRow.shipping_address,
            currency:
              orderRow.currency,
            notes:
              'Created from SaMi Sales order ' +
              String(
                orderRow.order_number,
              ) +
              '.',
          });

        billingCustomerId =
          createdCustomer.id;
      } catch (
        error
      ) {
        const existingId =
          (
            error &&
            typeof error ===
              'object' &&
            'details' in error &&
            error.details &&
            typeof error.details ===
              'object' &&
            'existingCustomerId' in
              error.details
          )
            ? String(
                (
                  error.details as
                    Record<
                      string,
                      unknown
                    >
                )
                  .existingCustomerId ||
                '',
              )
            : '';

        if (
          existingId
        ) {
          billingCustomerId =
            existingId;
        } else if (settings.require_billing_customer_for_invoice === false) {
          // Invoicing requires a customer foreign key, so only use a system walk-in when policy explicitly allows it.
          billingCustomerId = (await getOrCreateSalesWalkInCustomer(client, context)).id;
          isSyntheticWalkInCustomer = true;
        } else {
          // Missing setting means the secure default: require a real billing customer.
          throw new SalesError(
            'BILLING_CUSTOMER_REQUIRED',
            'This sales order needs a billing customer before it can be invoiced. Create or link the customer in Invoicing, or grant customer-management access.',
          );
        }
      }

      if (
        billingCustomerId &&
        orderRow.quote_id &&
        !isSyntheticWalkInCustomer
      ) {
        await client.query(
          `
            UPDATE sales_quotes
            SET
              billing_customer_id = $3,
              updated_by = $4,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
          `,
          [
            orderRow.quote_id,
            context.companyId,
            billingCustomerId,
            context.userId,
          ],
        );
      }
    }

    const lineRows =
      (
        await client.query(
          `
            SELECT
              id,
              description,
              sku_snapshot,
              unit,
              quantity,
              delivered_quantity,
              invoiced_quantity,
              unit_price,
              discount_type,
              discount_value,
              tax_rate
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
            ORDER BY
              sort_order,
              id
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows;

    const hasExplicitLineSelection =
      Array.isArray(input.lines);

    const requested =
      hasExplicitLineSelection
        ? input.lines as unknown[]
        : [];

    const requestedMap =
      new Map<
        string,
        number
      >();

    for (
      const raw
      of requested
    ) {
      if (
        !raw ||
        typeof raw !==
          'object' ||
        Array.isArray(
          raw,
        )
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'An invoice line selection is invalid.',
        );
      }

      const item =
        raw as
          Record<
            string,
            unknown
          >;

      const lineId =
        requireUuid(
          item.lineId,
          'Sales order line',
        ).toLowerCase();

      if (requestedMap.has(lineId)) {
        throw new SalesError(
          'INVALID_INPUT',
          'An invoice line can only be selected once.',
        );
      }

      requestedMap.set(
        lineId,
        numberInput(
          item.quantity,
          'Invoice quantity',
          {
            min:
              0.0001,
            max:
              1_000_000,
          },
        ),
      );
    }

    const orderLineIds =
      new Set(
        lineRows.map(
          line => String(line.id),
        ),
      );

    for (const requestedLineId of requestedMap.keys()) {
      if (!orderLineIds.has(requestedLineId)) {
        throw new SalesError(
          'INVALID_INPUT',
          'An invoice line does not belong to this sales order.',
        );
      }
    }

    if (
      hasExplicitLineSelection &&
      requestedMap.size === 0
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Choose at least one invoiceable line with a quantity greater than zero.',
      );
    }

    const invoicePolicy =
      settings.invoice_policy ===
        'delivered'
        ? 'delivered'
        : 'ordered';

    const selected =
      lineRows
        .map(
          line => {
            const ordered =
              Number(
                line.quantity,
              );

            const delivered =
              Number(
                line.delivered_quantity ||
                0,
              );

            const already =
              Number(
                line.invoiced_quantity ||
                0,
              );

            const eligible =
              invoicePolicy ===
                'delivered'
                ? delivered
                : ordered;

            const remaining =
              Math.max(
                0,
                eligible -
                already,
              );

            const requestedQuantity =
              requestedMap.size >
                0
                ? (
                    requestedMap.get(
                      String(
                        line.id,
                      ),
                    ) ||
                    0
                  )
                : remaining;

            if (
              requestedQuantity >
              remaining +
                0.000001
            ) {
              throw new SalesError(
                'INVALID_INPUT',
                'Invoice quantity exceeds the remaining invoiceable quantity for ' +
                String(
                  line.description,
                ) +
                '.',
              );
            }

            return {
              line,
              quantity:
                requestedQuantity,
              remaining,
            };
          },
        )
        .filter(
          item =>
            item.quantity >
            0,
        );

    if (
      selected.length ===
        0
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'There are no invoiceable quantities remaining on this sales order.',
      );
    }

    if (
      existingBatch.rows.length > 0 &&
      !existingBatch.rows[0].invoice_id
    ) {
      const storedValue =
        existingBatch.rows[0].requested_lines;
      let storedSelection: unknown =
        storedValue;

      if (typeof storedValue === 'string') {
        try {
          storedSelection = JSON.parse(storedValue);
        } catch {
          storedSelection = null;
        }
      }

      let storedMode: 'explicit' | 'all_remaining' | null = null;
      let storedLines: unknown = storedSelection;
      const isWrappedSelection =
        Boolean(storedSelection) &&
        typeof storedSelection === 'object' &&
        !Array.isArray(storedSelection);

      if (Array.isArray(storedSelection)) {
        storedLines = storedSelection;
      } else if (isWrappedSelection) {
        const selectionRecord =
          storedSelection as Record<string, unknown>;
        storedMode =
          selectionRecord.mode === 'explicit' ||
          selectionRecord.mode === 'all_remaining'
            ? selectionRecord.mode
            : null;
        storedLines = selectionRecord.lines;
      }

      const normalizeSelection = (items: unknown[]) =>
        items.map((rawLine: unknown) => {
          if (
            !rawLine ||
            typeof rawLine !== 'object' ||
            Array.isArray(rawLine)
          ) {
            return null;
          }

          const line = rawLine as Record<string, unknown>;
          const lineId =
            typeof line.lineId === 'string'
              ? line.lineId.toLowerCase()
              : '';
          const quantity = Number(line.quantity);

          if (
            !lineId ||
            !Number.isFinite(quantity) ||
            quantity <= 0
          ) {
            return null;
          }

          return { lineId, quantity };
        }).sort((a, b) => {
          if (a === null) return b === null ? 0 : 1;
          if (b === null) return -1;
          return a.lineId.localeCompare(b.lineId);
        });

      const priorSelection =
        Array.isArray(storedLines)
          ? normalizeSelection(storedLines)
          : null;
      const currentSelection =
        normalizeSelection(
          selected.map(item => ({
            lineId: String(item.line.id),
            quantity: item.quantity,
          })),
        );
      const currentMode =
        hasExplicitLineSelection
          ? 'explicit'
          : 'all_remaining';

      if (
        !priorSelection ||
        (isWrappedSelection && storedMode === null) ||
        priorSelection.some(line => line === null) ||
        priorSelection.length !== currentSelection.length ||
        JSON.stringify(priorSelection) !== JSON.stringify(currentSelection) ||
        (storedMode !== null && storedMode !== currentMode)
      ) {
        throw new SalesError(
          'QUOTE_STATE_INVALID',
          'This invoice batch was started with a different line selection. Retry with the original selection or resolve the existing batch before creating another invoice.',
        );
      }
    }

    const invoiceableLineCount =
      lineRows.filter(line => {
        const ordered = Number(line.quantity || 0);
        const delivered = Number(line.delivered_quantity || 0);
        const already = Number(line.invoiced_quantity || 0);
        const eligible =
          invoicePolicy === 'delivered'
            ? delivered
            : ordered;

        return eligible - already > 0.000001;
      }).length;

    if (
      settings.allow_partial_invoicing ===
        false &&
      (
        selected.length !== invoiceableLineCount ||
        selected.some(
          item =>
            Math.abs(
              item.quantity -
              item.remaining,
            ) >
              0.000001,
        )
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Partial invoicing is disabled in Sales settings.',
      );
    }

    let batchId:
      string;

    let sourceReference:
      string;

    if (
      existingBatch.rows.length >
        0
    ) {
      batchId =
        String(
          existingBatch.rows[0].id,
        );

      sourceReference =
        String(
          existingBatch.rows[0]
            .source_reference,
        );
    } else {
      const batch =
        await client.query(
          `
            INSERT INTO sales_order_invoice_batches (
              company_id,
              sales_order_id,
              idempotency_key,
              source_reference,
              requested_lines,
              created_by
            )
            VALUES (
              $1,$2,$3,
              '',
              $4::jsonb,
              $5
            )
            RETURNING id
          `,
          [
            context.companyId,
            orderId,
            idempotencyKey,
            JSON.stringify({
              mode: hasExplicitLineSelection
                ? 'explicit'
                : 'all_remaining',
              lines: selected.map(
                item => ({
                  lineId:
                    String(
                      item.line.id,
                    ),
                  quantity:
                    item.quantity,
                }),
              ),
            }),
            context.userId,
          ],
        );

      batchId =
        String(
          batch.rows[0].id,
        );

      sourceReference =
        'Sales order ' +
        String(
          orderRow.order_number,
        ) +
        ' / ' +
        batchId;

      await client.query(
        `
          UPDATE sales_order_invoice_batches
          SET
            source_reference = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          batchId,
          sourceReference,
        ],
      );
    }

    const recovered =
      await client.query(
        `
          SELECT id
          FROM invoicing_invoices
          WHERE company_id = $1
            AND reference = $2
            AND deleted_at IS NULL
          ORDER BY
            created_at DESC
          LIMIT 1
        `,
        [
          context.companyId,
          sourceReference,
        ],
      )
        .catch(
          () => ({
            rows: [],
          }),
        );

    const shippingAmount =
      orderRow.shipping_invoiced ===
        true
        ? 0
        : money(
            orderRow.shipping_total,
          );

    let invoiceId:
      string;

    if (
      recovered.rows.length >
        0
    ) {
      invoiceId =
        String(
          recovered.rows[0].id,
        );
    } else {
      const invoice =
        await deps.createInvoice({
          customerId:
            String(
              billingCustomerId,
            ),
          currency:
            orderRow.currency,
          exchangeRate:
            input.exchangeRate ??
            orderRow.exchange_rate,
          reference:
            sourceReference,
          notes:
            orderRow.notes,
          terms:
            orderRow.terms,
          shippingTotal:
            shippingAmount,
          confirm:
            false,
          lines:
            selected.map(
              item => ({
                description:
                  String(
                    item.line.description,
                  ),
                sku:
                  item.line
                    .sku_snapshot ||
                  undefined,
                unit:
                  String(
                    item.line.unit ||
                    'unit',
                  ),
                quantity:
                  item.quantity,
                unitPrice:
                  money(
                    item.line.unit_price,
                  ),
                discountType:
                  item.line
                    .discount_type ===
                    'fixed'
                    ? 'fixed'
                    : 'percent',
                discountValue:
                  item.line
                    .discount_type ===
                    'fixed'
                    ? money(
                        Number(
                          item.line
                            .discount_value ||
                          0,
                        ) *
                        (
                          item.quantity /
                          Number(
                            item.line
                              .quantity,
                          )
                        ),
                      )
                    : money(
                        item.line
                          .discount_value,
                      ),
                taxRate:
                  Number(
                    item.line
                      .tax_rate,
                  ),
                metadata: {
                  sourceModule:
                    'sales',
                  salesOrderId:
                    orderId,
                  salesOrderLineId:
                    String(
                      item.line.id,
                    ),
                  salesInvoiceBatchId:
                    batchId,
                  sourceReference,
                },
              }),
            ),
        });

      invoiceId =
        invoice.id;
    }

    await client.query(
      'BEGIN',
    );

    for (
      const item
      of selected
    ) {
      await client.query(
        `
          UPDATE sales_order_items_v2
          SET
            invoiced_quantity =
              invoiced_quantity +
              $4
          WHERE id = $1
            AND sales_order_id = $2
            AND company_id = $3
            AND invoiced_quantity +
                $4 <=
                quantity
        `,
        [
          item.line.id,
          orderId,
          context.companyId,
          item.quantity,
        ],
      );
    }

    const totals =
      (
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(quantity),
                0
              ) AS ordered,
              COALESCE(
                SUM(invoiced_quantity),
                0
              ) AS invoiced
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const allInvoiced =
      Number(
        totals.invoiced ||
        0,
      ) >=
      Number(
        totals.ordered ||
        0,
      ) -
        0.000001;

    const nextInvoiceStatus =
      allInvoiced
        ? 'invoiced'
        : 'partial';

    const nextStatus =
      nextInvoiceStatus ===
        'invoiced' &&
      String(
        orderRow
          .fulfillment_status ||
        'not_started',
      ) ===
        'fulfilled'
        ? 'closed'
        : 'confirmed';

    await client.query(
      `
        UPDATE sales_order_invoice_batches
        SET
          invoice_id = $2,
          status = 'created',
          error_code = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        batchId,
        invoiceId,
      ],
    );

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          latest_invoice_id = $3,
          status = $4,
          invoice_status = $5,
          shipping_invoiced =
            CASE
              WHEN $7::numeric >
                   0
              THEN TRUE
              ELSE shipping_invoiced
            END,
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        invoiceId,
        nextStatus,
        nextInvoiceStatus,
        context.userId,
        shippingAmount,
      ],
    );

    if (
      orderRow.quote_id
    ) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            latest_invoice_id = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          orderRow.quote_id,
          context.companyId,
          invoiceId,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,$4,
          'Invoice created from sales order',
          $5
        )
      `,
      [
        orderId,
        context.companyId,
        'invoice:' +
        String(
          orderRow.invoice_status ||
          'not_invoiced',
        ),
        'invoice:' +
        nextInvoiceStatus,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await deps.emitSalesAutomationEvent(
      context,
      {
        triggerKey:
          'sales.invoice.created',
        recordType:
          'sales_order',
        recordId:
          orderId,
        idempotencySeed:
          'invoice:' +
          invoiceId,
        payload: {
          invoiceId,
          batchId,
          invoiceStatus:
            nextInvoiceStatus,
        },
      },
    );

    return {
      orderId,
      invoiceId,
      batchId,
      status:
        nextStatus,
      invoiceStatus:
        nextInvoiceStatus,
      reused:
        recovered.rows.length >
        0,
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
    try {
      await client.query(
        `
          SELECT pg_advisory_unlock(
            hashtext($1)
          )
        `,
        [
          lockKey,
        ],
      );
    } catch {}

    client.release();
  }
}

export async function createSalesOrderInvoice(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS.ORDER_MANAGE,
  );

  return createSalesOrderInvoiceTransaction(input, context);
}

export async function updateSalesSettings(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  await ensureSalesDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const defaultCurrency =
    cleanText(
      input.defaultCurrency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    )
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      defaultCurrency,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Currency must be a three-letter code.',
    );
  }

  const defaultValidityDays =
    numberInput(
      input.defaultValidityDays ??
      14,
      'Default validity days',
      {
        min:
          1,
        max:
          365,
      },
    );

  const result =
    await context.pool.query(
      `
        UPDATE sales_settings
        SET
          default_currency = $2,
          default_validity_days = $3,
          terms_and_conditions = $4,
          default_notes = $5,
          email_message = $6,
          primary_color = $7,
          secondary_color = $8,
          footer_text = $9,
          allow_online_acceptance = $10,
          allow_online_rejection = $11,
          allow_partial_invoicing = $12,
          require_billing_customer_for_invoice = $13,
          invoice_policy = $14,
          lock_confirmed_orders = $15,
          require_quote_approval = $16,
          quote_approval_threshold = $17,
          credit_limit_enforced = $18,
          updated_by = $19,
          updated_at = NOW()
        WHERE company_id = $1
        RETURNING company_id
      `,
      [
        context.companyId,
        defaultCurrency,
        Math.floor(
          defaultValidityDays,
        ),
        nullableText(
          input.termsAndConditions,
          12000,
        ),
        nullableText(
          input.defaultNotes,
          6000,
        ),
        nullableText(
          input.emailMessage,
          6000,
        ),
        cleanText(
          input.primaryColor,
          20,
        ) ||
        '#164a9f',
        cleanText(
          input.secondaryColor,
          20,
        ) ||
        '#0f172a',
        nullableText(
          input.footerText,
          1000,
        ),
        input.allowOnlineAcceptance !==
          false,
        input.allowOnlineRejection !==
          false,
        input.allowPartialInvoicing !==
          false,
        input.requireBillingCustomerForInvoice !==
          false,
        cleanText(
          input.invoicePolicy,
          30,
        ) ===
          'delivered'
          ? 'delivered'
          : 'ordered',
        input.lockConfirmedOrders !==
          false,
        input.requireQuoteApproval ===
          true,
        numberInput(
          input.quoteApprovalThreshold ??
          0,
          'Quote approval threshold',
          {
            min:
              0,
            max:
              1_000_000_000_000,
          },
        ),
        input.creditLimitEnforced === true,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Sales settings could not be updated.',
    );
  }

  return {
    updated:
      true,
  };
}


export async function applySalesQuoteTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_EDIT,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quotation',
    );

  const templateId =
    requireUuid(
      input.templateId,
      'Quotation template',
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
          UPDATE sales_quotes quote
          SET
            template_id =
              template.id,
            notes =
              COALESCE(
                template.notes,
                quote.notes
              ),
            terms =
              COALESCE(
                template.terms,
                quote.terms
              ),
            updated_by = $4,
            updated_at = NOW()
          FROM sales_quote_templates template
          WHERE quote.id = $1
            AND quote.company_id = $2
            AND quote.deleted_at IS NULL
            AND quote.status = 'draft'
            AND template.id = $3
            AND template.company_id = $2
            AND template.deleted_at IS NULL
          RETURNING
            quote.id,
            quote.quote_number,
            template.id AS template_id,
            template.name AS template_name
        `,
        [
          quoteId,
          context.companyId,
          templateId,
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Choose an existing draft quotation and quotation template.',
      );
    }

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'quote.template_applied',
        content:
          'Quotation template ' +
          String(
            result.rows[0]
              .template_name,
          ) +
          ' applied to ' +
          String(
            result.rows[0]
              .quote_number,
          ) +
          '.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      quoteId,
      quoteNumber:
        String(
          result.rows[0]
            .quote_number,
        ),
      templateId:
        String(
          result.rows[0]
            .template_id,
        ),
      templateName:
        String(
          result.rows[0]
            .template_name,
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


export async function saveSalesQuoteTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      180,
    );

  if (
    !name
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Template name is required.',
    );
  }

  const templateId =
    optionalUuid(
      input.templateId,
    );

  const isDefault =
    input.isDefault ===
      true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      isDefault
    ) {
      await client.query(
        `
          UPDATE sales_quote_templates
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

    const result =
      templateId
        ? await client.query(
            `
              UPDATE sales_quote_templates
              SET
                name = $3,
                is_default = $4,
                notes = $5,
                terms = $6,
                footer_text = $7,
                primary_color = $8,
                secondary_color = $9,
                updated_by = $10,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id, name
            `,
            [
              templateId,
              context.companyId,
              name,
              isDefault,
              nullableText(
                input.notes,
                6000,
              ),
              nullableText(
                input.terms,
                12000,
              ),
              nullableText(
                input.footerText,
                1000,
              ),
              cleanText(
                input.primaryColor,
                20,
              ) ||
              '#164a9f',
              cleanText(
                input.secondaryColor,
                20,
              ) ||
              '#0f172a',
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_quote_templates (
                company_id,
                name,
                is_default,
                notes,
                terms,
                footer_text,
                primary_color,
                secondary_color,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
              )
              RETURNING id, name
            `,
            [
              context.companyId,
              name,
              isDefault,
              nullableText(
                input.notes,
                6000,
              ),
              nullableText(
                input.terms,
                12000,
              ),
              nullableText(
                input.footerText,
                1000,
              ),
              cleanText(
                input.primaryColor,
                20,
              ) ||
              '#164a9f',
              cleanText(
                input.secondaryColor,
                20,
              ) ||
              '#0f172a',
              context.userId,
            ],
          );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote template was not found.',
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          result.rows[0].id,
        ),
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


export async function deleteSalesQuoteTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const templateId =
    requireUuid(
      input.templateId,
      'Quotation template',
    );

  const result =
    await context.pool.query(
      `
        UPDATE sales_quote_templates
        SET
          deleted_at = NOW(),
          updated_by = $3,
          updated_at = NOW(),
          is_default = FALSE
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        RETURNING id, name
      `,
      [
        templateId,
        context.companyId,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Quotation template was not found or has already been deleted.',
    );
  }

  return {
    id:
      String(
        result.rows[0].id,
      ),
    name:
      String(
        result.rows[0].name,
      ),
  };
}
