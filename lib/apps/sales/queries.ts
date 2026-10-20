import 'server-only';

import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { queryControl } from '@/lib/db/control';

import {
  ensureSalesDefaults,
  hasSalesPermission,
  money,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import type {
  SalesOrderDetail,
  SalesOrderSortBy,
  SalesOrderSummary,
  SalesQuoteDetail,
  SalesQuoteStatusView,
  SalesQuoteSummary,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Cross-module permission constants                                         */
/* -------------------------------------------------------------------------- */

const INVOICING_CUSTOMER_VIEW = 'invoicing.customer.view';
const INVOICING_CUSTOMER_MANAGE = 'invoicing.customer.manage';
const INVOICING_CATALOG_VIEW = 'invoicing.catalog.view';
const INVOICING_CATALOG_MANAGE = 'invoicing.catalog.manage';

/* -------------------------------------------------------------------------- */
/*  Capability derivation                                                     */
/* -------------------------------------------------------------------------- */

type SalesPermissions = {
  isOwner: boolean;
  permissionSet: ReadonlySet<string>;
};

function salesCapabilities(
  isOwner: boolean,
  permissionSet: ReadonlySet<string>,
) {
  const can = (permission: string) =>
    hasSalesPermission(isOwner, permissionSet, permission);

  const crossCan = (...permissions: string[]) =>
    isOwner || permissions.some((permission) => permissionSet.has(permission));

  return {
    canView: can(SALES_PERMISSIONS.QUOTE_VIEW),
    canCreate: can(SALES_PERMISSIONS.QUOTE_CREATE),
    canEdit: can(SALES_PERMISSIONS.QUOTE_EDIT),
    canSend: can(SALES_PERMISSIONS.QUOTE_SEND),
    canApprove: can(SALES_PERMISSIONS.QUOTE_APPROVE),
    canApproveInternally: can(SALES_PERMISSIONS.QUOTE_INTERNAL_APPROVE),
    canConvert: can(SALES_PERMISSIONS.QUOTE_CONVERT),
    canCancel: can(SALES_PERMISSIONS.QUOTE_CANCEL),
    canViewOrders:
      can(SALES_PERMISSIONS.ORDER_VIEW) ||
      can(SALES_PERMISSIONS.ORDER_MANAGE),
    canManageOrders: can(SALES_PERMISSIONS.ORDER_MANAGE),
    canViewReports: can(SALES_PERMISSIONS.REPORT_VIEW),
    canManageSettings: can(SALES_PERMISSIONS.SETTINGS_MANAGE),
    canRevise: can(SALES_PERMISSIONS.QUOTE_REVISE),
    canManageOptionalProducts: can(SALES_PERMISSIONS.QUOTE_OPTIONAL_MANAGE),
    canViewPricing:
      can(SALES_PERMISSIONS.PRICING_VIEW) ||
      can(SALES_PERMISSIONS.PRICING_MANAGE),
    canManagePricing: can(SALES_PERMISSIONS.PRICING_MANAGE),
    canViewMargin:
      can(SALES_PERMISSIONS.MARGIN_VIEW) ||
      can(SALES_PERMISSIONS.MARGIN_MANAGE),
    canManageMargin: can(SALES_PERMISSIONS.MARGIN_MANAGE),
    canViewOrganization:
      can(SALES_PERMISSIONS.TEAM_VIEW) ||
      can(SALES_PERMISSIONS.TEAM_MANAGE) ||
      can(SALES_PERMISSIONS.TARGET_VIEW) ||
      can(SALES_PERMISSIONS.TARGET_MANAGE) ||
      can(SALES_PERMISSIONS.COMMISSION_VIEW) ||
      can(SALES_PERMISSIONS.COMMISSION_MANAGE),
    canManageTeams: can(SALES_PERMISSIONS.TEAM_MANAGE),
    canManageTargets: can(SALES_PERMISSIONS.TARGET_MANAGE),
    canViewCommissions:
      can(SALES_PERMISSIONS.COMMISSION_VIEW) ||
      can(SALES_PERMISSIONS.COMMISSION_MANAGE),
    canManageCommissions: can(SALES_PERMISSIONS.COMMISSION_MANAGE),
    canViewOperations:
      can(SALES_PERMISSIONS.SHIPPING_VIEW) ||
      can(SALES_PERMISSIONS.SHIPPING_MANAGE) ||
      can(SALES_PERMISSIONS.RETURN_VIEW) ||
      can(SALES_PERMISSIONS.RETURN_MANAGE) ||
      can(SALES_PERMISSIONS.DEPOSIT_MANAGE) ||
      can(SALES_PERMISSIONS.FORECAST_VIEW),
    canViewShipping:
      can(SALES_PERMISSIONS.SHIPPING_VIEW) ||
      can(SALES_PERMISSIONS.SHIPPING_MANAGE),
    canManageShipping: can(SALES_PERMISSIONS.SHIPPING_MANAGE),
    canViewReturns:
      can(SALES_PERMISSIONS.RETURN_VIEW) ||
      can(SALES_PERMISSIONS.RETURN_MANAGE),
    canManageReturns: can(SALES_PERMISSIONS.RETURN_MANAGE),
    canManageDeposits: can(SALES_PERMISSIONS.DEPOSIT_MANAGE),
    canViewForecast: can(SALES_PERMISSIONS.FORECAST_VIEW),
    canViewPipeline:
      can(SALES_PERMISSIONS.PIPELINE_VIEW) ||
      can(SALES_PERMISSIONS.PIPELINE_MANAGE),
    canManagePipeline: can(SALES_PERMISSIONS.PIPELINE_MANAGE),
    canMovePipeline: can(SALES_PERMISSIONS.PIPELINE_MANAGE),
    canManagePipelineStages: can(SALES_PERMISSIONS.PIPELINE_MANAGE),
    canUseBillingCustomers: crossCan(
      INVOICING_CUSTOMER_VIEW,
      INVOICING_CUSTOMER_MANAGE,
    ),
    canManageBillingCustomers: crossCan(INVOICING_CUSTOMER_MANAGE),
    canUseCatalog: crossCan(
      INVOICING_CATALOG_VIEW,
      INVOICING_CATALOG_MANAGE,
    ),
    canManageCatalog:
      can(SALES_PERMISSIONS.QUOTE_CREATE) &&
      can(SALES_PERMISSIONS.QUOTE_EDIT) &&
      crossCan(INVOICING_CATALOG_MANAGE),
  };
}

type SalesCapabilities = ReturnType<typeof salesCapabilities>;

/** Cached per call so repeated capability checks don't rebuild the object. */
function capabilitiesOf(permissions: SalesPermissions): SalesCapabilities {
  return salesCapabilities(permissions.isOwner, permissions.permissionSet);
}

/* -------------------------------------------------------------------------- */
/*  Cross-module tables                                                       */
/* -------------------------------------------------------------------------- */

type Pool = Awaited<ReturnType<typeof getTenantPoolByTenantId>>;

async function invoicingTablesAvailable(pool: Pool) {
  const result = await pool.query(
    `
      SELECT
        to_regclass('public.invoicing_customers') IS NOT NULL AS customers_ready,
        to_regclass('public.invoicing_catalog_items') IS NOT NULL AS catalog_ready,
        to_regclass('public.invoicing_tax_rates') IS NOT NULL AS taxes_ready
    `,
  );

  const row = result.rows[0] ?? {};
  return {
    customers: row.customers_ready === true,
    catalog: row.catalog_ready === true && row.taxes_ready === true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Small type-narrowing helpers                                              */
/* -------------------------------------------------------------------------- */

const str = (value: unknown): string => String(value ?? '');
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : num(value);
const iso = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : new Date(value as string | number | Date).toISOString();
const dateOnly = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value).slice(0, 10);
const percentOf = (part: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;

/* -------------------------------------------------------------------------- */
/*  Workspace data                                                            */
/* -------------------------------------------------------------------------- */

export async function getSalesWorkspaceData(): Promise<SalesWorkspaceData> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);

  await ensureSalesDefaults(context.pool, context.companyId, context.userId);

  const access = capabilitiesOf(context.permissions);
  const related = await invoicingTablesAvailable(context.pool);

  const [
    company,
    metrics,
    quoteValues,
    statusCounts,
    monthly,
    topCustomers,
    quotes,
    orders,
    orderValues,
    templates,
    pricelists,
    settings,
    billingCustomers,
    catalogItems,
    taxRates,
    salespeople,
    defaultSalesperson,
  ] = await Promise.all([
    context.pool.query(
      `
        SELECT id, name, COALESCE(currency, 'KES') AS currency
        FROM companies
        WHERE id = $1
        LIMIT 1
      `,
      [context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          COUNT(*)::int AS quote_count,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
          COUNT(*) FILTER (WHERE status IN ('sent', 'viewed'))::int AS sent_count,
          COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted_count,
          COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_count
        FROM sales_quotes
        WHERE company_id = $1
          AND deleted_at IS NULL
      `,
      [context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          UPPER(COALESCE(NULLIF(BTRIM(base_currency), ''), NULLIF(BTRIM($2::text), ''), 'KES')) AS currency,
          COALESCE(SUM(base_total_amount), 0) AS quote_value,
          COALESCE(SUM(base_total_amount) FILTER (WHERE status IN ('accepted', 'converted')), 0) AS accepted_value
        FROM sales_quotes
        WHERE company_id = $1
          AND deleted_at IS NULL
        GROUP BY base_currency
        ORDER BY currency
      `,
      [context.companyId, context.company.currentCompany.currency],
    ),

    access.canViewReports
      ? context.pool.query(
          `
            SELECT
              status,
              base_currency AS currency,
              COUNT(*)::int AS count,
              COALESCE(SUM(base_total_amount), 0) AS amount
            FROM sales_quotes
            WHERE company_id = $1
              AND deleted_at IS NULL
            GROUP BY status, base_currency
            ORDER BY status, base_currency
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canViewReports
      ? context.pool.query(
          `
            SELECT
              TO_CHAR(DATE_TRUNC('month', quote_date), 'YYYY-MM') AS month,
              base_currency AS currency,
              COUNT(*)::int AS quote_count,
              COALESCE(SUM(base_total_amount), 0) AS amount
            FROM sales_quotes
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND quote_date >= CURRENT_DATE - INTERVAL '11 months'
            GROUP BY 1, base_currency
            ORDER BY 1, base_currency
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canViewReports
      ? context.pool.query(
          `
            WITH customer_totals AS (
              SELECT
                customer_name,
                base_currency AS currency,
                COUNT(*)::int AS quote_count,
                COALESCE(SUM(base_total_amount), 0) AS amount
              FROM sales_quotes
              WHERE company_id = $1
                AND deleted_at IS NULL
              GROUP BY customer_name, base_currency
            ),
            ranked_customers AS (
              SELECT customer_totals.*,
                ROW_NUMBER() OVER (
                  PARTITION BY currency
                  ORDER BY amount DESC, customer_name ASC
                ) AS currency_rank
              FROM customer_totals
            )
            SELECT customer_name, currency, quote_count, amount
            FROM ranked_customers
            WHERE currency_rank <= 10
            ORDER BY currency, amount DESC, customer_name
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    context.pool.query(
      `
        SELECT
          quote.id,
          quote.quote_number,
          CASE
            WHEN quote.status IN ('sent', 'viewed')
             AND quote.valid_until IS NOT NULL
             AND quote.valid_until < CURRENT_DATE
            THEN 'expired'
            ELSE quote.status
          END AS effective_status,
          quote.quote_date,
          quote.valid_until,
          quote.currency,
          quote.base_currency,
          quote.exchange_rate,
          quote.exchange_rate_date,
          quote.exchange_rate_source,
          quote.base_total_amount,
          quote.customer_name,
          quote.customer_email,
          quote.total_amount,
          quote.current_revision,
          quote.template_id,
          quote.pricelist_id,
          quote.margin_amount,
          quote.margin_percent,
          quote.reference,
          quote.approval_status,
          quote.sales_order_id,
          quote.latest_invoice_id,
          quote.created_at
        FROM sales_quotes quote
        WHERE quote.company_id = $1
          AND quote.deleted_at IS NULL
        ORDER BY quote.created_at DESC
        LIMIT 250
      `,
      [context.companyId],
    ),

    access.canViewOrders
      ? context.pool.query(
          `
            SELECT
              o.id,
              o.order_number,
              o.quote_id,
              q.quote_number,
              o.latest_invoice_id,
              o.reference,
              o.status,
              o.fulfillment_status,
              o.invoice_status,
              o.order_date,
              o.currency,
              o.base_currency,
              o.exchange_rate,
              o.exchange_rate_date,
              o.exchange_rate_source,
              o.base_total_amount,
              o.customer_name,
              o.total_amount,
              COALESCE(SUM(oi.quantity), 0) AS ordered_quantity,
              COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity,
              COALESCE(SUM(oi.invoiced_quantity), 0) AS invoiced_quantity
            FROM sales_orders_v2 o
            LEFT JOIN sales_order_items_v2 oi
              ON oi.sales_order_id = o.id
             AND oi.company_id = o.company_id
            LEFT JOIN sales_quotes q
              ON q.id = o.quote_id
             AND q.company_id = o.company_id
            WHERE o.company_id = $1
              AND o.deleted_at IS NULL
            GROUP BY o.id, q.quote_number
            ORDER BY o.created_at DESC
            LIMIT 250
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canViewOrders
      ? context.pool.query(
          `
            SELECT
              base_currency AS currency,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(base_total_amount), 0) AS amount
            FROM sales_orders_v2
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND status IN ('confirmed', 'closed')
            GROUP BY base_currency
            ORDER BY base_currency
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    context.pool.query(
      `
        SELECT
          id,
          name,
          is_default,
          notes,
          terms,
          footer_text,
          primary_color,
          secondary_color
        FROM sales_quote_templates
        WHERE company_id = $1
          AND is_active = TRUE
          AND deleted_at IS NULL
        ORDER BY is_default DESC, name
      `,
      [context.companyId],
    ),

    access.canViewPricing
      ? context.pool.query(
          `
            SELECT
              id,
              name,
              code,
              currency,
              billing_customer_id,
              valid_from,
              valid_until,
              priority,
              is_active
            FROM sales_pricelists
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY is_active DESC, priority, LOWER(name)
            LIMIT 250
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    context.pool.query(
      `
        SELECT
          default_currency,
          default_validity_days,
          terms_and_conditions,
          default_notes,
          email_message,
          primary_color,
          secondary_color,
          footer_text,
          allow_online_acceptance,
          allow_online_rejection,
          allow_partial_invoicing,
          require_billing_customer_for_invoice,
          invoice_policy,
          lock_confirmed_orders,
          require_quote_approval,
          credit_limit_enforced,
          quote_approval_threshold
        FROM sales_settings
        WHERE company_id = $1
        LIMIT 1
      `,
      [context.companyId],
    ),

    access.canUseBillingCustomers && related.customers
      ? context.pool.query(
          `
            SELECT
              id,
              customer_type,
              name,
              legal_name,
              contact_name,
              email,
              phone,
              tax_id,
              registration_number,
              billing_address,
              shipping_address,
              city,
              state,
              postal_code,
              country,
              country_code,
              currency,
              credit_limit,
              notes,
              status
            FROM invoicing_customers
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY
              CASE WHEN status = 'active' THEN 0 ELSE 1 END,
              LOWER(name)
            LIMIT 500
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canUseCatalog && related.catalog
      ? context.pool.query(
          `
            SELECT
              item.id,
              item.item_type,
              item.name,
              item.sku,
              item.description,
              item.unit,
              item.unit_price,
              item.metadata,
              tax.id AS tax_rate_id,
              tax.name AS tax_name,
              COALESCE(tax.rate, 0) AS tax_rate,
              variant.id AS variant_id,
              variant.base_catalog_item_id,
              base_item.name AS base_product_name,
              variant.variant_label,
              variant.attributes AS variant_attributes,
              variant.unit_cost AS variant_unit_cost
            FROM invoicing_catalog_items item
            LEFT JOIN invoicing_tax_rates tax
              ON tax.id = item.default_tax_rate_id
             AND tax.company_id = item.company_id
             AND tax.deleted_at IS NULL
            LEFT JOIN sales_product_variants variant
              ON variant.variant_catalog_item_id = item.id
             AND variant.company_id = item.company_id
             AND variant.is_active = TRUE
             AND variant.deleted_at IS NULL
            LEFT JOIN invoicing_catalog_items base_item
              ON base_item.id = variant.base_catalog_item_id
             AND base_item.company_id = variant.company_id
             AND base_item.deleted_at IS NULL
            WHERE item.company_id = $1
              AND item.is_active = TRUE
              AND item.deleted_at IS NULL
            ORDER BY LOWER(COALESCE(base_item.name, item.name)), variant.variant_label NULLS FIRST
            LIMIT 500
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canManageCatalog && related.catalog
      ? context.pool.query(
          `
            SELECT
              id,
              name,
              rate,
              tax_type,
              country_code,
              price_included,
              is_default,
              valid_from,
              valid_to
            FROM invoicing_tax_rates
            WHERE company_id = $1
              AND is_active = TRUE
              AND deleted_at IS NULL
            ORDER BY is_default DESC, LOWER(name)
            LIMIT 250
          `,
          [context.companyId],
        )
      : Promise.resolve({ rows: [] }),

    access.canCreate || access.canEdit
      ? queryControl(
          `
            SELECT
              u.id,
              COALESCE(
                NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
                NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                u.email
              ) AS name,
              u.email
            FROM tenant_users tu
            INNER JOIN users u ON u.id = tu.user_id
            WHERE tu.tenant_id = $1
              AND tu.status = 'active'
              AND tu.member_type = 'internal'
              AND tu.deleted_at IS NULL
              AND u.deleted_at IS NULL
            ORDER BY tu.is_owner DESC, LOWER(COALESCE(NULLIF(BTRIM(u.full_name), ''), u.email)), u.id
            LIMIT 500
          `,
          [context.tenantId],
        )
      : Promise.resolve({ rows: [] }),

    queryControl(
      `
        SELECT
          u.id,
          COALESCE(
            NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
            u.email
          ) AS name,
          u.email
        FROM tenant_users tu
        INNER JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.user_id = $2
          AND tu.status = 'active'
          AND tu.member_type = 'internal'
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [context.tenantId, context.userId],
    ),
  ]);

  const metric = metrics.rows[0] ?? {};
  const setting = settings.rows[0] ?? {};
  const companyRow = company.rows[0] ?? {};
  const baseCurrency = strOrNull(companyRow.currency) ?? strOrNull(context.company.currentCompany.currency) ?? 'KES';

  const currencyFor = (value: unknown): string =>
    (strOrNull(value) ?? baseCurrency).toUpperCase();

  const quoteValueByCurrency = quoteValues.rows.map((row) => ({
    currency: currencyFor(row.currency),
    amount: money(row.quote_value),
  }));
  const acceptedValueByCurrency = quoteValues.rows.map((row) => ({
    currency: currencyFor(row.currency),
    amount: money(row.accepted_value),
  }));
  const orderValueByCurrency = orderValues.rows.map((row) => ({
    currency: currencyFor(row.currency),
    amount: money(row.amount),
  }));
  const orderCount = orderValues.rows.reduce(
    (sum, row) => sum + num(row.order_count),
    0,
  );

  const currentSalespersonRow = defaultSalesperson.rows[0];

  return {
    company: {
      id: context.companyId,
      name: str(companyRow.name ?? context.company.currentCompany.name) || 'Current company',
      currency: baseCurrency,
    },

    salespeople: salespeople.rows.map((row) => ({
      id: str(row.id),
      name: str(row.name ?? row.email),
      email: str(row.email),
    })),
    currentSalespersonId: currentSalespersonRow ? str(currentSalespersonRow.id) : null,
    defaultSalesperson: currentSalespersonRow
      ? {
          id: str(currentSalespersonRow.id),
          name: str(currentSalespersonRow.name ?? currentSalespersonRow.email),
          email: str(currentSalespersonRow.email),
        }
      : null,

    capabilities: access,

    metrics: {
      quoteCount: num(metric.quote_count),
      draftCount: num(metric.draft_count),
      sentCount: num(metric.sent_count),
      acceptedCount: num(metric.accepted_count),
      convertedCount: num(metric.converted_count),
      quoteValueByCurrency,
      acceptedValueByCurrency,
      orderValueByCurrency,
      orderCount,
    },

    statusCounts: statusCounts.rows.map((row) => ({
      status: str(row.status),
      currency: currencyFor(row.currency),
      count: num(row.count),
      amount: money(row.amount),
    })),

    monthly: monthly.rows.map((row) => ({
      month: str(row.month),
      currency: currencyFor(row.currency),
      quoteCount: num(row.quote_count),
      amount: money(row.amount),
    })),

    topCustomers: topCustomers.rows.map((row) => ({
      customerName: str(row.customer_name),
      currency: currencyFor(row.currency),
      quoteCount: num(row.quote_count),
      amount: money(row.amount),
    })),

    quotes: quotes.rows.map((row) => ({
      id: str(row.id),
      quoteNumber: str(row.quote_number),
      status: str(row.effective_status),
      quoteDate: str(row.quote_date),
      validUntil: strOrNull(row.valid_until),
      currency: str(row.currency),
      baseCurrency: strOrNull(row.base_currency) ?? baseCurrency,
      exchangeRate: num(row.exchange_rate, 1) || 1,
      exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.quote_date) ?? str(row.quote_date)).slice(0, 10),
      exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
      baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
      customerName: str(row.customer_name),
      customerEmail: strOrNull(row.customer_email),
      totalAmount: money(row.total_amount),
      currentRevision: Math.max(1, num(row.current_revision, 1)),
      templateId: strOrNull(row.template_id),
      pricelistId: strOrNull(row.pricelist_id),
      marginAmount: access.canViewMargin ? money(row.margin_amount) : null,
      marginPercent: access.canViewMargin ? money(row.margin_percent) : null,
      reference: strOrNull(row.reference),
      approvalStatus: strOrNull(row.approval_status) ?? 'not_required',
      salesOrderId: strOrNull(row.sales_order_id),
      latestInvoiceId: strOrNull(row.latest_invoice_id),
      createdAt: iso(row.created_at),
    })),

    orders: orders.rows.map((row) => {
      const orderedQty = num(row.ordered_quantity);
      const deliveredQty = num(row.delivered_quantity);
      const invoicedQty = num(row.invoiced_quantity);
      return {
        id: str(row.id),
        orderNumber: str(row.order_number),
        quoteId: strOrNull(row.quote_id),
        quoteNumber: strOrNull(row.quote_number),
        reference: strOrNull(row.reference),
        latestInvoiceId: strOrNull(row.latest_invoice_id),
        status: str(row.status),
        fulfillmentStatus: strOrNull(row.fulfillment_status) ?? 'not_started',
        invoiceStatus: strOrNull(row.invoice_status) ?? 'not_invoiced',
        orderDate: str(row.order_date),
        currency: str(row.currency),
        baseCurrency: strOrNull(row.base_currency) ?? baseCurrency,
        exchangeRate: num(row.exchange_rate, 1) || 1,
        exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.order_date) ?? str(row.order_date)).slice(0, 10),
        exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
        baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
        customerName: str(row.customer_name),
        totalAmount: money(row.total_amount),
        deliveredPercent: percentOf(deliveredQty, orderedQty),
        invoicedPercent: percentOf(invoicedQty, orderedQty),
      };
    }),

    billingCustomers: billingCustomers.rows.map((row) => ({
      id: str(row.id),
      customerType: strOrNull(row.customer_type) ?? 'company',
      name: str(row.name),
      legalName: strOrNull(row.legal_name),
      contactName: strOrNull(row.contact_name),
      email: strOrNull(row.email),
      phone: strOrNull(row.phone),
      taxId: strOrNull(row.tax_id),
      registrationNumber: strOrNull(row.registration_number),
      billingAddress: strOrNull(row.billing_address),
      shippingAddress: strOrNull(row.shipping_address),
      city: strOrNull(row.city),
      state: strOrNull(row.state),
      postalCode: strOrNull(row.postal_code),
      country: strOrNull(row.country),
      countryCode: strOrNull(row.country_code),
      currency: strOrNull(row.currency) ?? baseCurrency,
      creditLimit: numOrNull(row.credit_limit),
      notes: strOrNull(row.notes),
      status: strOrNull(row.status) ?? 'active',
    })),

    taxRates: taxRates.rows.map((row) => ({
      id: str(row.id),
      name: str(row.name),
      rate: money(row.rate),
      taxType: strOrNull(row.tax_type) ?? 'vat',
      countryCode: strOrNull(row.country_code),
      priceIncluded: row.price_included === true,
      isDefault: row.is_default === true,
      validFrom: dateOnly(row.valid_from),
      validTo: dateOnly(row.valid_to),
    })),

    catalogItems: catalogItems.rows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: str(row.id),
        itemType: strOrNull(row.item_type) ?? 'service',
        name: str(row.name),
        sku: strOrNull(row.sku),
        description: strOrNull(row.description),
        unit: strOrNull(row.unit) ?? 'unit',
        unitPrice: money(row.unit_price),
        taxRateId: strOrNull(row.tax_rate_id),
        taxName: strOrNull(row.tax_name),
        taxRate: money(row.tax_rate),
        unitCost: access.canViewMargin
          ? money(row.variant_unit_cost ?? meta.standardCost ?? meta.unitCost ?? 0)
          : null,
        isVariant: Boolean(row.variant_id),
        variantId: strOrNull(row.variant_id),
        baseCatalogItemId: strOrNull(row.base_catalog_item_id),
        baseProductName: strOrNull(row.base_product_name),
        variantLabel: strOrNull(row.variant_label),
        variantAttributes: Array.isArray(row.variant_attributes)
          ? (row.variant_attributes as Array<{ name: string; value: string }>)
          : [],
      };
    }),

    pricelists: pricelists.rows.map((row) => ({
      id: str(row.id),
      name: str(row.name),
      code: strOrNull(row.code),
      currency: str(row.currency),
      billingCustomerId: strOrNull(row.billing_customer_id),
      validFrom: strOrNull(row.valid_from),
      validUntil: strOrNull(row.valid_until),
      priority: num(row.priority, 100),
      isActive: row.is_active === true,
    })),

    templates: templates.rows.map((row) => ({
      id: str(row.id),
      name: str(row.name),
      isDefault: row.is_default === true,
      notes: strOrNull(row.notes),
      terms: strOrNull(row.terms),
      footerText: strOrNull(row.footer_text),
      primaryColor: strOrNull(row.primary_color) ?? '#164a9f',
      secondaryColor: strOrNull(row.secondary_color) ?? '#0f172a',
    })),

    settings: {
      defaultCurrency: strOrNull(setting.default_currency) ?? baseCurrency,
      defaultValidityDays: num(setting.default_validity_days, 14),
      termsAndConditions: strOrNull(setting.terms_and_conditions),
      defaultNotes: strOrNull(setting.default_notes),
      emailMessage: strOrNull(setting.email_message),
      primaryColor: strOrNull(setting.primary_color) ?? '#164a9f',
      secondaryColor: strOrNull(setting.secondary_color) ?? '#0f172a',
      footerText: strOrNull(setting.footer_text),
      allowOnlineAcceptance: setting.allow_online_acceptance !== false,
      allowOnlineRejection: setting.allow_online_rejection !== false,
      allowPartialInvoicing: setting.allow_partial_invoicing !== false,
      requireBillingCustomerForInvoice: setting.require_billing_customer_for_invoice !== false,
      creditLimitEnforced: setting.credit_limit_enforced === true,
      invoicePolicy: setting.invoice_policy === 'delivered' ? 'delivered' : 'ordered',
      lockConfirmedOrders: setting.lock_confirmed_orders !== false,
      requireQuoteApproval: setting.require_quote_approval === true,
      quoteApprovalThreshold: money(setting.quote_approval_threshold),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Quote detail                                                              */
/* -------------------------------------------------------------------------- */

export async function getSalesQuoteDetail(quoteId: string): Promise<SalesQuoteDetail | null> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const access = capabilitiesOf(context.permissions);

  const [
    quote,
    lines,
    history,
    deliveries,
    revisions,
    optionalItems,
    customerRevisionRequests,
    activeApprovalRequest,
  ] = await Promise.all([
    context.pool.query(
      `
        SELECT
          quote.id,
          quote.billing_customer_id,
          quote.salesperson_user_id,
          quote.quote_number,
          CASE
            WHEN quote.status IN ('sent', 'viewed')
             AND quote.valid_until IS NOT NULL
             AND quote.valid_until < CURRENT_DATE
            THEN 'expired'
            ELSE quote.status
          END AS effective_status,
          quote.quote_date,
          quote.valid_until,
          quote.currency,
          quote.base_currency,
          quote.exchange_rate,
          quote.exchange_rate_date,
          quote.exchange_rate_source,
          quote.base_total_amount,
          quote.reference,
          quote.approval_status,
          quote.approval_requested_at,
          quote.approved_at,
          quote.approval_rejected_at,
          quote.approval_rejection_reason,
          quote.customer_name,
          quote.customer_email,
          quote.customer_phone,
          quote.customer_tax_id,
          quote.billing_address,
          quote.shipping_address,
          quote.subtotal,
          quote.discount_total,
          quote.tax_total,
          quote.shipping_total,
          quote.total_amount,
          quote.deposit_type,
          quote.deposit_value,
          quote.current_revision,
          quote.template_id,
          quote.pricelist_id,
          quote.margin_amount,
          quote.margin_percent,
          quote.notes,
          quote.terms,
          quote.internal_notes,
          quote.sales_order_id,
          quote.latest_invoice_id,
          quote.sent_at,
          quote.viewed_at,
          quote.accepted_at,
          quote.accepted_by_name,
          quote.accepted_by_email,
          quote.acceptance_note,
          quote.acceptance_signature_consent_text,
          quote.rejected_at,
          quote.converted_at,
          quote.created_at
        FROM sales_quotes quote
        WHERE quote.id = $1
          AND quote.company_id = $2
          AND quote.deleted_at IS NULL
        LIMIT 1
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          id,
          catalog_item_id,
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
        ORDER BY sort_order, id
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT id, from_status, to_status, reason, created_at
        FROM sales_quote_status_history
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY created_at DESC
        LIMIT 200
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT id, channel, provider, status, error_code, created_at
        FROM sales_delivery_log
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT id, revision_number, reason, created_at
        FROM sales_quote_revisions
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY revision_number DESC
        LIMIT 100
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          id,
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          unit_cost,
          tax_name_snapshot,
          tax_rate,
          is_selected
        FROM sales_quote_optional_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY sort_order, id
      `,
      [quoteId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          id,
          metadata->>'requesterName' AS requester_name,
          metadata->>'requesterEmail' AS requester_email,
          metadata->>'reason' AS reason,
          created_at
        FROM activities
        WHERE company_id = $1
          AND model = 'sales.quote'
          AND record_id = $2
          AND type = 'sales.quote.customer_revision_requested'
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [context.companyId, quoteId],
    ),

    context.pool.query(
      `
        SELECT requested_by
        FROM sales_quote_approval_requests
        WHERE company_id = $1
          AND quote_id = $2
          AND status = 'pending'
        ORDER BY requested_at DESC
        LIMIT 1
      `,
      [context.companyId, quoteId],
    ),
  ]);

  if (quote.rows.length !== 1) return null;

  const row = quote.rows[0];
  const requestedBy = activeApprovalRequest.rows[0]?.requested_by;
  const canWithdrawApproval =
    activeApprovalRequest.rows.length === 1 &&
    (hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.QUOTE_EDIT) ||
      str(requestedBy) === context.userId);

  const total = money(row.total_amount);
  const depositType: 'percent' | 'fixed' | 'none' =
    row.deposit_type === 'percent' ? 'percent' : row.deposit_type === 'fixed' ? 'fixed' : 'none';
  const depositValue = money(row.deposit_value);
  const depositRequiredAmount =
    depositType === 'percent' ? money((total * depositValue) / 100)
    : depositType === 'fixed' ? Math.min(total, depositValue)
    : 0;

  return {
    canWithdrawApproval,
    id: str(row.id),
    quoteNumber: str(row.quote_number),
    status: str(row.effective_status),
    quoteDate: str(row.quote_date),
    validUntil: strOrNull(row.valid_until),
    currency: str(row.currency),
    baseCurrency: strOrNull(row.base_currency) ?? context.company.currentCompany.currency ?? str(row.currency),
    exchangeRate: num(row.exchange_rate, 1) || 1,
    exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.quote_date) ?? str(row.quote_date)).slice(0, 10),
    exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
    baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
    customerName: str(row.customer_name),
    customerEmail: strOrNull(row.customer_email),
    totalAmount: total,
    currentRevision: Math.max(1, num(row.current_revision, 1)),
    templateId: strOrNull(row.template_id),
    pricelistId: strOrNull(row.pricelist_id),
    marginAmount: access.canViewMargin ? money(row.margin_amount) : null,
    marginPercent: access.canViewMargin ? money(row.margin_percent) : null,
    reference: strOrNull(row.reference),
    approvalStatus: strOrNull(row.approval_status) ?? 'not_required',
    salesOrderId: strOrNull(row.sales_order_id),
    latestInvoiceId: strOrNull(row.latest_invoice_id),
    createdAt: iso(row.created_at),
    billingCustomerId: strOrNull(row.billing_customer_id),
    salespersonUserId: strOrNull(row.salesperson_user_id),
    customerPhone: strOrNull(row.customer_phone),
    customerTaxId: strOrNull(row.customer_tax_id),
    billingAddress: strOrNull(row.billing_address),
    shippingAddress: strOrNull(row.shipping_address),
    subtotal: money(row.subtotal),
    discountTotal: money(row.discount_total),
    taxTotal: money(row.tax_total),
    shippingTotal: money(row.shipping_total),
    depositType,
    depositValue,
    depositRequiredAmount,
    notes: strOrNull(row.notes),
    terms: strOrNull(row.terms),
    internalNotes: strOrNull(row.internal_notes),
    approvalRequestedAt: iso(row.approval_requested_at),
    approvedAt: iso(row.approved_at),
    approvalRejectedAt: iso(row.approval_rejected_at),
    approvalRejectionReason: strOrNull(row.approval_rejection_reason),
    sentAt: iso(row.sent_at),
    viewedAt: iso(row.viewed_at),
    acceptedAt: iso(row.accepted_at),
    acceptedByName: strOrNull(row.accepted_by_name),
    acceptedByEmail: strOrNull(row.accepted_by_email),
    acceptanceNote: strOrNull(row.acceptance_note),
    acceptedSignatureConsentText: strOrNull(row.acceptance_signature_consent_text),
    rejectedAt: iso(row.rejected_at),
    convertedAt: iso(row.converted_at),
    lines: lines.rows.map((line) => ({
      id: str(line.id),
      catalogItemId: strOrNull(line.catalog_item_id),
      description: str(line.description),
      sku: strOrNull(line.sku_snapshot),
      unit: strOrNull(line.unit) ?? 'unit',
      quantity: num(line.quantity),
      unitPrice: money(line.unit_price),
      unitCost: access.canViewMargin ? money(line.unit_cost) : null,
      costTotal: access.canViewMargin ? money(line.cost_total) : null,
      marginAmount: access.canViewMargin ? money(line.margin_amount) : null,
      marginPercent: access.canViewMargin ? money(line.margin_percent) : null,
      discountType: line.discount_type === 'fixed' ? 'fixed' : 'percent',
      discountValue: money(line.discount_value),
      discountAmount: money(line.discount_amount),
      taxName: strOrNull(line.tax_name_snapshot),
      taxRate: num(line.tax_rate),
      taxAmount: money(line.tax_amount),
      subtotal: money(line.subtotal),
      lineTotal: money(line.line_total),
    })),
    optionalItems: optionalItems.rows.map((item) => ({
      id: str(item.id),
      catalogItemId: strOrNull(item.catalog_item_id),
      description: str(item.description),
      sku: strOrNull(item.sku_snapshot),
      unit: strOrNull(item.unit) ?? 'unit',
      quantity: num(item.quantity),
      unitPrice: money(item.unit_price),
      unitCost: access.canViewMargin ? money(item.unit_cost) : null,
      taxName: strOrNull(item.tax_name_snapshot),
      taxRate: num(item.tax_rate),
      isSelected: item.is_selected === true,
    })),
    revisions: revisions.rows.map((item) => ({
      id: str(item.id),
      revisionNumber: num(item.revision_number),
      reason: strOrNull(item.reason),
      createdAt: iso(item.created_at) as string,
    })),
    customerRevisionRequests: customerRevisionRequests.rows.map((item) => ({
      id: str(item.id),
      requesterName: strOrNull(item.requester_name),
      requesterEmail: strOrNull(item.requester_email),
      reason: strOrNull(item.reason) ?? '',
      createdAt: iso(item.created_at) as string,
    })),
    history: history.rows.map((item) => ({
      id: str(item.id),
      fromStatus: strOrNull(item.from_status),
      toStatus: str(item.to_status),
      reason: strOrNull(item.reason),
      createdAt: iso(item.created_at) as string,
    })),
    deliveries: deliveries.rows.map((item) => ({
      id: str(item.id),
      channel: str(item.channel),
      provider: strOrNull(item.provider),
      status: str(item.status),
      errorCode: strOrNull(item.error_code),
      createdAt: iso(item.created_at) as string,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Quote revision diff                                                       */
/* -------------------------------------------------------------------------- */

type SalesRevisionRecord = Record<string, unknown>;

type SalesRevisionChange = {
  type: 'added' | 'removed' | 'changed';
  section: string;
  label: string;
  field: string;
  before: string | null;
  after: string | null;
};

function salesRevisionRecord(value: unknown): SalesRevisionRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as SalesRevisionRecord;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as SalesRevisionRecord;
      }
    } catch {
      /* fall through */
    }
  }
  return {};
}

function salesRevisionValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function salesRevisionItemLabel(item: SalesRevisionRecord, index: number): string {
  const description = String(item.description ?? '').trim();
  const sku = String(item.sku_snapshot ?? item.sku ?? '').trim();
  return description || (sku ? 'SKU ' + sku : 'Line ' + (index + 1));
}

function compareSalesRevisionCollection(
  changes: SalesRevisionChange[],
  section: string,
  beforeItems: unknown,
  afterItems: unknown,
  fields: Array<[string, string]>,
) {
  const before = Array.isArray(beforeItems) ? beforeItems.map(salesRevisionRecord) : [];
  const after = Array.isArray(afterItems) ? afterItems.map(salesRevisionRecord) : [];

  const keyFor = (item: SalesRevisionRecord, index: number) => {
    const sortOrder = String(item.sort_order ?? index);
    const productId = String(item.catalog_item_id ?? '');
    const sku = String(item.sku_snapshot ?? '');
    return productId
      ? `${sortOrder}:product:${productId}`
      : `${sortOrder}:manual:${sku || String(item.description ?? '')}`;
  };

  const beforeMap = new Map<string, { item: SalesRevisionRecord; index: number }>();
  const afterMap = new Map<string, { item: SalesRevisionRecord; index: number }>();
  before.forEach((item, index) => beforeMap.set(keyFor(item, index), { item, index }));
  after.forEach((item, index) => afterMap.set(keyFor(item, index), { item, index }));

  for (const [key, current] of beforeMap) {
    const next = afterMap.get(key);
    if (!next) {
      changes.push({
        type: 'removed',
        section,
        label: salesRevisionItemLabel(current.item, current.index),
        field: section === 'Line item' ? 'Line item' : 'Optional product',
        before:
          salesRevisionValue(current.item.description) ??
          salesRevisionItemLabel(current.item, current.index),
        after: null,
      });
      continue;
    }
    const label = salesRevisionItemLabel(next.item, next.index);
    for (const [field, fieldLabel] of fields) {
      const oldValue = current.item[field];
      const newValue = next.item[field];
      if (salesRevisionValue(oldValue) !== salesRevisionValue(newValue)) {
        changes.push({
          type: 'changed',
          section,
          label,
          field: fieldLabel,
          before: salesRevisionValue(oldValue),
          after: salesRevisionValue(newValue),
        });
      }
    }
  }

  for (const [key, current] of afterMap) {
    if (beforeMap.has(key)) continue;
    changes.push({
      type: 'added',
      section,
      label: salesRevisionItemLabel(current.item, current.index),
      field: section === 'Line item' ? 'Line item' : 'Optional product',
      before: null,
      after:
        salesRevisionValue(current.item.description) ??
        salesRevisionItemLabel(current.item, current.index),
    });
  }
}

export async function getSalesQuoteRevisionDiff(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const quoteId = requireUuid(input.quoteId, 'Quotation');
  const rawRevisionNumber = Number(input.revisionNumber);
  if (!Number.isSafeInteger(rawRevisionNumber) || rawRevisionNumber < 1 || rawRevisionNumber > 100_000) {
    throw new SalesError('INVALID_INPUT', 'Choose a valid quotation revision.');
  }

  const [currentQuoteResult, currentLinesResult, currentOptionalItemsResult, selectedResult] =
    await Promise.all([
      context.pool.query(
        `SELECT *
         FROM sales_quotes
         WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [quoteId, context.companyId],
      ),
      context.pool.query(
        `SELECT *
         FROM sales_quote_items
         WHERE quote_id = $1 AND company_id = $2
         ORDER BY sort_order, id`,
        [quoteId, context.companyId],
      ),
      context.pool.query(
        `SELECT *
         FROM sales_quote_optional_items
         WHERE quote_id = $1 AND company_id = $2
         ORDER BY sort_order, id`,
        [quoteId, context.companyId],
      ),
      context.pool.query(
        `SELECT revision_number, snapshot
         FROM sales_quote_revisions
         WHERE quote_id = $1 AND company_id = $2 AND revision_number = $3
         LIMIT 1`,
        [quoteId, context.companyId, rawRevisionNumber],
      ),
    ]);

  if (currentQuoteResult.rows.length !== 1) {
    throw new SalesError('QUOTE_NOT_FOUND', 'Quotation was not found.');
  }
  const currentRevision = Math.max(1, Number(currentQuoteResult.rows[0].current_revision || 1));
  if (rawRevisionNumber >= currentRevision) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a saved previous revision to compare with the current quotation.',
    );
  }
  if (selectedResult.rows.length !== 1) {
    throw new SalesError('INVALID_INPUT', 'The selected quotation revision was not found.');
  }

  const selected = salesRevisionRecord(selectedResult.rows[0].snapshot);
  const currentSnapshot = {
    quote: currentQuoteResult.rows[0] as SalesRevisionRecord,
    lines: currentLinesResult.rows as SalesRevisionRecord[],
    optionalItems: currentOptionalItemsResult.rows as SalesRevisionRecord[],
  };
  const changes: SalesRevisionChange[] = [];

  {
    const oldQuote = salesRevisionRecord(selected.quote);
    const newQuote = salesRevisionRecord(currentSnapshot.quote);
    const canViewMargin = capabilitiesOf(context.permissions).canViewMargin;

    const quoteFields: Array<[string, string]> = [
      ['customer_name', 'Customer'],
      ['customer_email', 'Customer email'],
      ['customer_phone', 'Customer phone'],
      ['customer_tax_id', 'Customer tax ID'],
      ['billing_address', 'Billing address'],
      ['shipping_address', 'Shipping address'],
      ['quote_date', 'Quotation date'],
      ['valid_until', 'Valid until'],
      ['currency', 'Currency'],
      ['exchange_rate', 'Exchange rate'],
      ['reference', 'Reference'],
      ['template_id', 'Quotation template'],
      ['pricelist_id', 'Pricelist'],
      ['salesperson_user_id', 'Salesperson'],
      ['sales_team_id', 'Sales team'],
      ['territory_id', 'Territory'],
      ['subtotal', 'Subtotal'],
      ['discount_total', 'Discount total'],
      ['tax_total', 'Tax total'],
      ['shipping_total', 'Shipping total'],
      ['total_amount', 'Total'],
      ['deposit_type', 'Deposit type'],
      ['deposit_value', 'Deposit value'],
      ['notes', 'Customer notes'],
      ['terms', 'Terms and conditions'],
      ['internal_notes', 'Internal notes'],
    ];
    if (canViewMargin) {
      quoteFields.push(
        ['cost_total', 'Cost total'],
        ['margin_amount', 'Margin'],
        ['margin_percent', 'Margin percent'],
      );
    }
    for (const [field, label] of quoteFields) {
      const beforeValue = oldQuote[field];
      const afterValue = newQuote[field];
      if (salesRevisionValue(beforeValue) !== salesRevisionValue(afterValue)) {
        changes.push({
          type: 'changed',
          section: 'Quotation',
          label,
          field: label,
          before: salesRevisionValue(beforeValue),
          after: salesRevisionValue(afterValue),
        });
      }
    }

    const lineFields: Array<[string, string]> = [
      ['description', 'Description'],
      ['sku_snapshot', 'SKU'],
      ['unit', 'Unit'],
      ['quantity', 'Quantity'],
      ['unit_price', 'Unit price'],
      ['discount_type', 'Discount type'],
      ['discount_value', 'Discount value'],
      ['discount_amount', 'Discount amount'],
      ['tax_name_snapshot', 'Tax'],
      ['tax_rate', 'Tax rate'],
      ['tax_amount', 'Tax amount'],
      ['subtotal', 'Subtotal'],
      ['line_total', 'Line total'],
    ];
    if (canViewMargin) {
      lineFields.push(
        ['unit_cost', 'Unit cost'],
        ['cost_total', 'Cost total'],
        ['margin_amount', 'Margin'],
        ['margin_percent', 'Margin percent'],
      );
    }
    compareSalesRevisionCollection(
      changes,
      'Line item',
      selected.lines,
      currentSnapshot.lines,
      lineFields,
    );

    const optionalFields: Array<[string, string]> = [
      ['description', 'Description'],
      ['sku_snapshot', 'SKU'],
      ['unit', 'Unit'],
      ['quantity', 'Quantity'],
      ['unit_price', 'Unit price'],
      ['tax_name_snapshot', 'Tax'],
      ['tax_rate', 'Tax rate'],
      ['is_selected', 'Selected'],
    ];
    if (canViewMargin) optionalFields.push(['unit_cost', 'Unit cost']);
    compareSalesRevisionCollection(
      changes,
      'Optional product',
      selected.optionalItems,
      currentSnapshot.optionalItems,
      optionalFields,
    );
  }

  return {
    quoteId,
    revisionNumber: rawRevisionNumber,
    comparedToRevisionNumber: currentRevision,
    hasComparison: true,
    changes,
    message: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Order detail                                                              */
/* -------------------------------------------------------------------------- */

type ShipmentRow = Record<string, unknown>;
type ShipmentItem = { id: string; salesOrderLineId: string; quantity: number };
type ReturnRow = Record<string, unknown>;
type ReturnItem = { id: string; salesOrderLineId: string; quantity: number };
type ReturnCredit = {
  id: string;
  invoiceId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  amount: number;
  availableCredit: number;
  refundedAmount: number;
};

export async function getSalesOrderDetail(orderId: string): Promise<SalesOrderDetail | null> {
  const context = await requireSalesContext(SALES_PERMISSIONS.ORDER_VIEW);
  const access = capabilitiesOf(context.permissions);

  const settings = (
    await context.pool.query(
      `SELECT invoice_policy FROM sales_settings WHERE company_id = $1 LIMIT 1`,
      [context.companyId],
    )
  ).rows[0] ?? {};
  const invoicePolicy = settings.invoice_policy === 'delivered' ? 'delivered' : 'ordered';

  const [order, lines, invoices, history, shipments, returns] = await Promise.all([
    context.pool.query(
      `
        SELECT
          o.*,
          (
            EXISTS (
              SELECT 1 FROM sales_returns received_return
              WHERE received_return.sales_order_id = o.id
                AND received_return.company_id = o.company_id
                AND received_return.status = 'received'
            )
            AND EXISTS (
              SELECT 1 FROM sales_commission_entries commission_entry
              WHERE commission_entry.order_id = o.id
                AND commission_entry.company_id = o.company_id
                AND commission_entry.status = 'accrued'
            )
          ) AS margin_commission_stale,
          q.quote_number,
          q.billing_customer_id,
          COALESCE(SUM(oi.quantity), 0) AS ordered_quantity,
          COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity,
          COALESCE(SUM(oi.invoiced_quantity), 0) AS invoiced_quantity
        FROM sales_orders_v2 o
        LEFT JOIN sales_quotes q
          ON q.id = o.quote_id AND q.company_id = o.company_id
        LEFT JOIN sales_order_items_v2 oi
          ON oi.sales_order_id = o.id AND oi.company_id = o.company_id
        WHERE o.id = $1
          AND o.company_id = $2
          AND o.deleted_at IS NULL
        GROUP BY o.id, q.quote_number, q.billing_customer_id
        LIMIT 1
      `,
      [orderId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          line.id,
          line.catalog_item_id,
          line.description,
          line.sku_snapshot,
          line.unit,
          line.quantity,
          line.shipped_quantity,
          COALESCE(planned_shipments.planned_quantity, 0) AS planned_quantity,
          line.delivered_quantity,
          line.invoiced_quantity,
          line.returned_quantity,
          line.credited_quantity,
          line.unit_price,
          line.unit_cost,
          line.cost_total,
          line.margin_amount,
          line.margin_percent,
          line.discount_type,
          line.discount_value,
          line.tax_name_snapshot,
          line.tax_rate,
          line.line_total
        FROM sales_order_items_v2 line
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(shipment_item.quantity), 0) AS planned_quantity
          FROM sales_shipment_items shipment_item
          INNER JOIN sales_shipments shipment
            ON shipment.id = shipment_item.shipment_id
           AND shipment.company_id = shipment_item.company_id
          WHERE shipment_item.sales_order_line_id = line.id
            AND shipment_item.company_id = line.company_id
            AND shipment.inventory_posted_at IS NULL
            AND shipment.status NOT IN ('cancelled', 'failed')
        ) planned_shipments ON TRUE
        WHERE line.sales_order_id = $1
          AND line.company_id = $2
        ORDER BY line.sort_order, line.id
      `,
      [orderId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT id, invoice_id, source_reference, status, created_at
        FROM sales_order_invoice_batches
        WHERE sales_order_id = $1
          AND company_id = $2
        ORDER BY created_at DESC
      `,
      [orderId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT id, from_status, to_status, reason, created_at
        FROM sales_order_status_history
        WHERE sales_order_id = $1
          AND company_id = $2
        ORDER BY created_at DESC
        LIMIT 200
      `,
      [orderId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          shipment.id,
          shipment.shipment_number,
          shipment.status,
          shipment.carrier,
          shipment.service_level,
          shipment.tracking_number,
          shipment.tracking_url,
          shipment.recipient_name,
          shipment.proof_note,
          shipment.shipped_at,
          shipment.delivered_at,
          shipment.inventory_posted_at,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'salesOrderLineId', item.sales_order_line_id,
                'quantity', item.quantity
              )
              ORDER BY item.id
            ) FILTER (WHERE item.id IS NOT NULL),
            '[]'::jsonb
          ) AS items
        FROM sales_shipments shipment
        LEFT JOIN sales_shipment_items item
          ON item.shipment_id = shipment.id
         AND item.company_id = shipment.company_id
        WHERE shipment.sales_order_id = $1
          AND shipment.company_id = $2
        GROUP BY shipment.id
        ORDER BY shipment.created_at DESC
      `,
      [orderId, context.companyId],
    ),

    context.pool.query(
      `
        SELECT
          return_row.id,
          return_row.return_number,
          return_row.status,
          return_row.reason,
          return_row.requested_at,
          return_row.approved_at,
          return_row.received_at,
          return_row.credited_at,
          return_row.refunded_at,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'salesOrderLineId', item.sales_order_line_id,
                'quantity', item.quantity
              )
              ORDER BY item.id
            )
            FROM sales_return_items item
            WHERE item.return_id = return_row.id
              AND item.company_id = return_row.company_id
          ), '[]'::jsonb) AS items,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', credit.id,
                'invoiceId', credit.invoice_id,
                'creditNoteId', credit.credit_note_id,
                'creditNoteNumber', credit.credit_note_number,
                'amount', credit.amount,
                'availableCredit', credit.available_credit,
                'refundedAmount', credit.refunded_amount
              )
              ORDER BY credit.created_at
            )
            FROM sales_return_credits credit
            WHERE credit.return_id = return_row.id
              AND credit.company_id = return_row.company_id
          ), '[]'::jsonb) AS credits
        FROM sales_returns return_row
        WHERE return_row.sales_order_id = $1
          AND return_row.company_id = $2
        ORDER BY return_row.created_at DESC
      `,
      [orderId, context.companyId],
    ),
  ]);

  if (order.rows.length !== 1) return null;

  const row = order.rows[0];
  const orderedQuantity = num(row.ordered_quantity);
  const deliveredQuantity = num(row.delivered_quantity);
  const invoicedQuantity = num(row.invoiced_quantity);

  return {
    id: str(row.id),
    orderNumber: str(row.order_number),
    quoteId: strOrNull(row.quote_id),
    quoteNumber: strOrNull(row.quote_number),
    latestInvoiceId: strOrNull(row.latest_invoice_id),
    status: str(row.status),
    fulfillmentStatus: strOrNull(row.fulfillment_status) ?? 'not_started',
    invoiceStatus: strOrNull(row.invoice_status) ?? 'not_invoiced',
    orderDate: str(row.order_date),
    currency: str(row.currency),
    baseCurrency:
      strOrNull(row.base_currency) ??
      context.company.currentCompany.currency ??
      str(row.currency),
    exchangeRate: num(row.exchange_rate, 1) || 1,
    exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.order_date) ?? str(row.order_date)).slice(0, 10),
    exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
    baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
    customerName: str(row.customer_name),
    totalAmount: money(row.total_amount),
    costTotal: access.canViewMargin ? money(row.cost_total) : null,
    marginAmount: access.canViewMargin ? money(row.margin_amount) : null,
    marginPercent: access.canViewMargin ? money(row.margin_percent) : null,
    marginCommissionStale: row.margin_commission_stale === true,
    deliveredPercent: percentOf(deliveredQuantity, orderedQuantity),
    invoicedPercent: percentOf(invoicedQuantity, orderedQuantity),
    billingCustomerId: strOrNull(row.billing_customer_id),
    customerEmail: strOrNull(row.customer_email),
    customerPhone: strOrNull(row.customer_phone),
    customerTaxId: strOrNull(row.customer_tax_id),
    billingAddress: strOrNull(row.billing_address),
    shippingAddress: strOrNull(row.shipping_address),
    reference: strOrNull(row.reference),
    subtotal: money(row.subtotal),
    discountTotal: money(row.discount_total),
    taxTotal: money(row.tax_total),
    shippingTotal: money(row.shipping_total),
    depositType:
      row.deposit_type === 'percent' ? 'percent'
      : row.deposit_type === 'fixed' ? 'fixed'
      : 'none',
    depositValue: money(row.deposit_value),
    depositRequiredAmount: money(row.deposit_required_amount),
    depositReceivedAmount: money(row.deposit_received_amount),
    depositStatus: strOrNull(row.deposit_status) ?? 'none',
    depositRetainerId: strOrNull(row.deposit_retainer_id),
    depositPaymentId: strOrNull(row.deposit_payment_id),
    notes: strOrNull(row.notes),
    terms: strOrNull(row.terms),
    lines: lines.rows.map((line) => {
      const quantity = num(line.quantity);
      const delivered = num(line.delivered_quantity);
      const invoiced = num(line.invoiced_quantity);
      const eligible = invoicePolicy === 'delivered' ? delivered : quantity;
      return {
        id: str(line.id),
        catalogItemId: strOrNull(line.catalog_item_id),
        description: str(line.description),
        sku: strOrNull(line.sku_snapshot),
        unit: strOrNull(line.unit) ?? 'unit',
        quantity,
        shippedQuantity: num(line.shipped_quantity),
        plannedQuantity: num(line.planned_quantity),
        deliveredQuantity: delivered,
        invoicedQuantity: invoiced,
        returnedQuantity: num(line.returned_quantity),
        creditedQuantity: num(line.credited_quantity),
        invoiceableQuantity: Math.max(0, eligible - invoiced),
        unitPrice: money(line.unit_price),
        unitCost: access.canViewMargin ? money(line.unit_cost) : null,
        costTotal: access.canViewMargin ? money(line.cost_total) : null,
        marginAmount: access.canViewMargin ? money(line.margin_amount) : null,
        marginPercent: access.canViewMargin ? money(line.margin_percent) : null,
        discountType: line.discount_type === 'fixed' ? 'fixed' : 'percent',
        discountValue: money(line.discount_value),
        taxName: strOrNull(line.tax_name_snapshot),
        taxRate: num(line.tax_rate),
        lineTotal: money(line.line_total),
      };
    }),
    shipments: shipments.rows.map((item: ShipmentRow) => ({
      id: str(item.id),
      shipmentNumber: str(item.shipment_number),
      status: str(item.status),
      carrier: strOrNull(item.carrier),
      serviceLevel: strOrNull(item.service_level),
      trackingNumber: strOrNull(item.tracking_number),
      trackingUrl: strOrNull(item.tracking_url),
      recipientName: strOrNull(item.recipient_name),
      proofNote: strOrNull(item.proof_note),
      shippedAt: iso(item.shipped_at),
      deliveredAt: iso(item.delivered_at),
      inventoryPostedAt: iso(item.inventory_posted_at),
      items: Array.isArray(item.items)
        ? (item.items as ShipmentItem[]).map((line) => ({
            id: str(line.id),
            salesOrderLineId: str(line.salesOrderLineId),
            quantity: num(line.quantity),
          }))
        : [],
    })),
    returns: returns.rows.map((item: ReturnRow) => ({
      id: str(item.id),
      returnNumber: str(item.return_number),
      status: str(item.status),
      reason: str(item.reason),
      requestedAt: iso(item.requested_at) as string,
      approvedAt: iso(item.approved_at),
      receivedAt: iso(item.received_at),
      creditedAt: iso(item.credited_at),
      refundedAt: iso(item.refunded_at),
      items: Array.isArray(item.items)
        ? (item.items as ReturnItem[]).map((line) => ({
            id: str(line.id),
            salesOrderLineId: str(line.salesOrderLineId),
            quantity: num(line.quantity),
          }))
        : [],
      credits: Array.isArray(item.credits)
        ? (item.credits as ReturnCredit[]).map((credit) => ({
            id: str(credit.id),
            invoiceId: str(credit.invoiceId),
            creditNoteId: str(credit.creditNoteId),
            creditNoteNumber: str(credit.creditNoteNumber),
            amount: money(credit.amount),
            availableCredit: money(credit.availableCredit),
            refundedAmount: money(credit.refundedAmount),
          }))
        : [],
    })),
    invoices: invoices.rows.map((item) => ({
      batchId: str(item.id),
      invoiceId: strOrNull(item.invoice_id),
      sourceReference: str(item.source_reference),
      status: str(item.status),
      createdAt: iso(item.created_at) as string,
    })),
    history: history.rows.map((item) => ({
      id: str(item.id),
      fromStatus: strOrNull(item.from_status),
      toStatus: str(item.to_status),
      reason: strOrNull(item.reason),
      createdAt: iso(item.created_at) as string,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Search — records and pipeline                                             */
/* -------------------------------------------------------------------------- */

export async function searchSalesRecords(
  tenantId: string,
  companyId: string,
  query: string,
  limit = 15,
) {
  const pool = await getTenantPoolByTenantId(tenantId);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 15)));
  const q = '%' + query.trim().slice(0, 120) + '%';

  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          'quote' AS kind,
          q.id,
          q.quote_number AS number,
          q.customer_name,
          q.status,
          q.total_amount,
          q.currency,
          q.created_at
        FROM sales_quotes q
        WHERE q.company_id = $1
          AND q.deleted_at IS NULL
          AND (
            q.quote_number ILIKE $2
            OR q.customer_name ILIKE $2
            OR COALESCE(q.customer_email, '') ILIKE $2
            OR COALESCE(q.reference, '') ILIKE $2
          )

        UNION ALL

        SELECT
          'order' AS kind,
          o.id,
          o.order_number AS number,
          o.customer_name,
          o.status,
          o.total_amount,
          o.currency,
          o.created_at
        FROM sales_orders_v2 o
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          AND (
            o.order_number ILIKE $2
            OR o.customer_name ILIKE $2
            OR COALESCE(o.reference, '') ILIKE $2
          )
      ) records
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [companyId, q, safeLimit],
  );

  return result.rows.map((row) => ({
    kind: str(row.kind),
    id: str(row.id),
    number: str(row.number),
    customerName: str(row.customer_name),
    status: str(row.status),
    totalAmount: money(row.total_amount),
    currency: str(row.currency),
  }));
}

export async function searchSalesPipelineRecords(
  tenantId: string,
  companyId: string,
  query: string,
  limit = 15,
) {
  const pool = await getTenantPoolByTenantId(tenantId);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 15)));
  const q = '%' + query.trim().slice(0, 120) + '%';

  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          'lead' AS kind,
          l.id,
          l.lead_number AS number,
          l.name AS title,
          COALESCE(
            NULLIF(l.company_name, ''),
            NULLIF(l.contact_name, ''),
            NULLIF(l.email, '')
          ) AS subtitle,
          CONCAT_WS(
            ' · ',
            NULLIF(l.lead_number, ''),
            NULLIF(l.contact_name, ''),
            NULLIF(l.email, ''),
            NULLIF(l.phone, '')
          ) AS description,
          l.status AS badge,
          l.created_at
        FROM sales_leads l
        WHERE l.company_id = $1
          AND l.deleted_at IS NULL
          AND (
            l.lead_number ILIKE $2
            OR l.name ILIKE $2
            OR COALESCE(l.company_name, '') ILIKE $2
            OR COALESCE(l.contact_name, '') ILIKE $2
            OR COALESCE(l.email, '') ILIKE $2
            OR COALESCE(l.phone, '') ILIKE $2
          )

        UNION ALL

        SELECT
          'opportunity' AS kind,
          o.id,
          o.opportunity_number AS number,
          o.name AS title,
          COALESCE(
            NULLIF(o.customer_name, ''),
            NULLIF(o.contact_name, '')
          ) AS subtitle,
          o.opportunity_number AS description,
          COALESCE(
            NULLIF(stage.name, ''),
            CASE
              WHEN o.won_at IS NOT NULL THEN 'Won'
              WHEN o.lost_at IS NOT NULL THEN 'Lost'
              ELSE 'Opportunity'
            END
          ) AS badge,
          o.created_at
        FROM sales_opportunities o
        LEFT JOIN sales_pipeline_stages stage
          ON stage.id = o.stage_id
         AND stage.company_id = o.company_id
         AND stage.deleted_at IS NULL
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          AND (
            o.opportunity_number ILIKE $2
            OR o.name ILIKE $2
            OR COALESCE(o.customer_name, '') ILIKE $2
          )
      ) records
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [companyId, q, safeLimit],
  );

  return result.rows.map((row) => ({
    kind: str(row.kind) as 'lead' | 'opportunity',
    id: str(row.id),
    number: str(row.number),
    title: str(row.title),
    subtitle: strOrNull(row.subtitle),
    description: strOrNull(row.description),
    badge: strOrNull(row.badge),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Registers — quotes and orders                                             */
/* -------------------------------------------------------------------------- */

const SALES_REGISTER_PAGE_SIZE = 250;

function normalizeSalesRegisterOffset(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(1_000_000, Math.max(0, Math.floor(parsed))) : 0;
}

function normalizeSalesRegisterLimit(value: unknown) {
  const parsed = Number(value ?? SALES_REGISTER_PAGE_SIZE);
  return Number.isFinite(parsed)
    ? Math.min(SALES_REGISTER_PAGE_SIZE, Math.max(1, Math.floor(parsed)))
    : SALES_REGISTER_PAGE_SIZE;
}

function normalizeQuoteRegisterStatus(value: unknown): SalesQuoteStatusView {
  const allowed: SalesQuoteStatusView[] = [
    'all',
    'draft',
    'needs_approval',
    'awaiting_response',
    'accepted',
    'converted',
    'closed_without_sale',
    'expired',
    'expiring_soon',
  ];
  const status = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(status as SalesQuoteStatusView)
    ? (status as SalesQuoteStatusView)
    : 'all';
}

type OrderRegisterStatus =
  | 'all'
  | 'awaiting_fulfillment'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'not_invoiced'
  | 'partially_invoiced'
  | 'invoiced';

const ORDER_REGISTER_STATUSES: OrderRegisterStatus[] = [
  'all',
  'awaiting_fulfillment',
  'partially_fulfilled',
  'fulfilled',
  'not_invoiced',
  'partially_invoiced',
  'invoiced',
];

function normalizeOrderRegisterStatus(value: unknown): OrderRegisterStatus {
  const status = typeof value === 'string' ? value.trim() : '';
  return ORDER_REGISTER_STATUSES.includes(status as OrderRegisterStatus)
    ? (status as OrderRegisterStatus)
    : 'all';
}

const ORDER_REGISTER_SORTS: SalesOrderSortBy[] = [
  'newest',
  'oldest',
  'value_high',
  'value_low',
  'delivery_first',
  'invoice_first',
  'customer_az',
];

function normalizeOrderRegisterSort(value: unknown): SalesOrderSortBy {
  const sort = typeof value === 'string' ? value.trim() : '';
  return ORDER_REGISTER_SORTS.includes(sort as SalesOrderSortBy)
    ? (sort as SalesOrderSortBy)
    : 'newest';
}

function quoteEffectiveStatusSql(alias = 'quote') {
  return `
    CASE
      WHEN ${alias}.status IN ('sent', 'viewed')
        AND ${alias}.valid_until IS NOT NULL
        AND ${alias}.valid_until < CURRENT_DATE
      THEN 'expired'
      ELSE ${alias}.status
    END
  `;
}

export async function getSalesQuoteRegisterPage(input: Record<string, unknown> = {}) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const access = capabilitiesOf(context.permissions);

  const offset = normalizeSalesRegisterOffset(input.offset);
  const limit = normalizeSalesRegisterLimit(input.limit);
  const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '';
  const statusView = normalizeQuoteRegisterStatus(input.statusView);

  const parameters = [context.companyId, search, statusView];

  const searchSql = `
    AND (
      $2::text = ''
      OR quote.quote_number ILIKE ('%' || $2::text || '%')
      OR quote.customer_name ILIKE ('%' || $2::text || '%')
      OR COALESCE(quote.customer_email, '') ILIKE ('%' || $2::text || '%')
      OR COALESCE(quote.reference, '') ILIKE ('%' || $2::text || '%')
      OR quote.effective_status ILIKE ('%' || $2::text || '%')
      OR COALESCE(quote.approval_status, '') ILIKE ('%' || $2::text || '%')
    )
  `;

  const statusFilterSql = `
    (
      $3::text = 'all'
      OR ($3::text = 'draft' AND quote.effective_status = 'draft')
      OR ($3::text = 'needs_approval' AND quote.approval_status = 'pending')
      OR ($3::text = 'awaiting_response' AND quote.effective_status IN ('sent', 'viewed'))
      OR ($3::text = 'accepted' AND quote.effective_status = 'accepted')
      OR ($3::text = 'converted' AND quote.effective_status = 'converted')
      OR ($3::text = 'expired' AND quote.effective_status = 'expired')
      OR ($3::text = 'expiring_soon'
        AND quote.effective_status IN ('sent', 'viewed')
        AND quote.valid_until >= CURRENT_DATE
        AND quote.valid_until <= CURRENT_DATE + INTERVAL '7 days')
      OR ($3::text = 'closed_without_sale'
        AND quote.effective_status IN ('rejected', 'expired', 'cancelled'))
    )
  `;

  const [page, counts] = await Promise.all([
    context.pool.query(
      `
        WITH quote_rows AS (
          SELECT quote.*, ${quoteEffectiveStatusSql('quote')} AS effective_status
          FROM sales_quotes quote
          WHERE quote.company_id = $1
            AND quote.deleted_at IS NULL
        )
        SELECT
          quote.id,
          quote.quote_number,
          quote.effective_status,
          quote.quote_date,
          quote.valid_until,
          quote.currency,
          quote.base_currency,
          quote.exchange_rate,
          quote.exchange_rate_date,
          quote.exchange_rate_source,
          quote.base_total_amount,
          quote.customer_name,
          quote.customer_email,
          quote.total_amount,
          quote.current_revision,
          quote.template_id,
          quote.pricelist_id,
          quote.margin_amount,
          quote.margin_percent,
          quote.reference,
          quote.approval_status,
          quote.sales_order_id,
          quote.latest_invoice_id,
          quote.created_at
        FROM quote_rows quote
        WHERE TRUE
          ${searchSql}
          AND ${statusFilterSql}
        ORDER BY quote.created_at DESC, quote.id DESC
        LIMIT $4 OFFSET $5
      `,
      [...parameters, limit + 1, offset],
    ),

    context.pool.query(
      `
        WITH quote_rows AS (
          SELECT quote.*, ${quoteEffectiveStatusSql('quote')} AS effective_status
          FROM sales_quotes quote
          WHERE quote.company_id = $1
            AND quote.deleted_at IS NULL
        )
        SELECT
          COUNT(*) FILTER (WHERE ${statusFilterSql})::int AS filtered_total,
          COUNT(*)::int AS all_count,
          COUNT(*) FILTER (WHERE quote.effective_status = 'draft')::int AS draft,
          COUNT(*) FILTER (WHERE quote.approval_status = 'pending')::int AS needs_approval,
          COUNT(*) FILTER (WHERE quote.effective_status IN ('sent', 'viewed'))::int AS awaiting_response,
          COUNT(*) FILTER (WHERE quote.effective_status = 'accepted')::int AS accepted,
          COUNT(*) FILTER (WHERE quote.effective_status = 'converted')::int AS converted,
          COUNT(*) FILTER (WHERE quote.effective_status = 'expired')::int AS expired,
          COUNT(*) FILTER (WHERE
            quote.effective_status IN ('sent', 'viewed')
            AND quote.valid_until >= CURRENT_DATE
            AND quote.valid_until <= CURRENT_DATE + INTERVAL '7 days'
          )::int AS expiring_soon,
          COUNT(*) FILTER (WHERE quote.effective_status IN ('rejected', 'expired', 'cancelled'))::int AS closed_without_sale
        FROM quote_rows quote
        WHERE TRUE
          ${searchSql}
      `,
      parameters,
    ),
  ]);

  const hasMore = page.rows.length > limit;
  const rows = page.rows.slice(0, limit).map((row): SalesQuoteSummary => ({
    id: str(row.id),
    quoteNumber: str(row.quote_number),
    status: str(row.effective_status),
    quoteDate: str(row.quote_date),
    validUntil: dateOnly(row.valid_until),
    currency: str(row.currency),
    baseCurrency:
      strOrNull(row.base_currency) ?? context.company.currentCompany.currency ?? str(row.currency),
    exchangeRate: num(row.exchange_rate, 1) || 1,
    exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.quote_date) ?? str(row.quote_date)).slice(0, 10),
    exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
    baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
    customerName: str(row.customer_name),
    customerEmail: strOrNull(row.customer_email),
    totalAmount: money(row.total_amount),
    currentRevision: Math.max(1, num(row.current_revision, 1)),
    templateId: strOrNull(row.template_id),
    pricelistId: strOrNull(row.pricelist_id),
    marginAmount: access.canViewMargin ? money(row.margin_amount) : null,
    marginPercent: access.canViewMargin ? money(row.margin_percent) : null,
    reference: strOrNull(row.reference),
    approvalStatus: strOrNull(row.approval_status) ?? 'not_required',
    salesOrderId: strOrNull(row.sales_order_id),
    latestInvoiceId: strOrNull(row.latest_invoice_id),
    createdAt: iso(row.created_at),
  }));

  const countRow = counts.rows[0] ?? {};

  return {
    rows,
    offset,
    limit,
    totalCount: num(countRow.all_count),
    filteredTotalCount: num(countRow.filtered_total),
    hasMore,
    nextOffset: offset + rows.length,
    queueCounts: {
      all: num(countRow.all_count),
      draft: num(countRow.draft),
      needs_approval: num(countRow.needs_approval),
      awaiting_response: num(countRow.awaiting_response),
      accepted: num(countRow.accepted),
      converted: num(countRow.converted),
      expired: num(countRow.expired),
      expiring_soon: num(countRow.expiring_soon),
      closed_without_sale: num(countRow.closed_without_sale),
    },
  };
}

export async function getSalesOrderRegisterPage(input: Record<string, unknown> = {}) {
  const context = await requireSalesContext();
  const canViewOrders =
    hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.ORDER_VIEW) ||
    hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.ORDER_MANAGE);
  if (!canViewOrders) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'You do not have permission to view Sales orders.',
    );
  }

  const offset = normalizeSalesRegisterOffset(input.offset);
  const limit = normalizeSalesRegisterLimit(input.limit);
  const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '';
  const statusView = normalizeOrderRegisterStatus(input.statusView);
  const sortBy = normalizeOrderRegisterSort(input.sortBy);

  const sortSql: Record<SalesOrderSortBy, string> = {
    newest: 'o.order_date DESC, o.id DESC',
    oldest: 'o.order_date ASC, o.id ASC',
    value_high: 'COALESCE(o.base_total_amount, o.total_amount) DESC NULLS LAST, o.created_at DESC, o.id DESC',
    value_low: 'COALESCE(o.base_total_amount, o.total_amount) ASC NULLS LAST, o.created_at DESC, o.id DESC',
    delivery_first:
      '(CASE WHEN COALESCE(SUM(oi.quantity), 0) > 0 THEN ROUND(100.0 * COALESCE(SUM(oi.delivered_quantity), 0) / SUM(oi.quantity)) ELSE 0 END) ASC, o.created_at DESC, o.id DESC',
    invoice_first:
      '(CASE WHEN COALESCE(SUM(oi.quantity), 0) > 0 THEN ROUND(100.0 * COALESCE(SUM(oi.invoiced_quantity), 0) / SUM(oi.quantity)) ELSE 0 END) ASC, o.created_at DESC, o.id DESC',
    customer_az: 'LOWER(o.customer_name) ASC, o.created_at DESC, o.id DESC',
  };

  const parameters = [context.companyId, search, statusView];

  const searchSql = `
    AND (
      $2::text = ''
      OR o.order_number ILIKE ('%' || $2::text || '%')
      OR o.customer_name ILIKE ('%' || $2::text || '%')
      OR COALESCE(o.reference, '') ILIKE ('%' || $2::text || '%')
      OR COALESCE(o.status, '') ILIKE ('%' || $2::text || '%')
      OR COALESCE(o.fulfillment_status, 'not_started') ILIKE ('%' || $2::text || '%')
      OR COALESCE(o.invoice_status, 'not_invoiced') ILIKE ('%' || $2::text || '%')
    )
  `;

  const statusFilterSql = `
    (
      $3::text = 'all'
      OR ($3::text = 'awaiting_fulfillment' AND COALESCE(o.fulfillment_status, 'not_started') = 'not_started')
      OR ($3::text = 'partially_fulfilled' AND COALESCE(o.fulfillment_status, 'not_started') = 'partial')
      OR ($3::text = 'fulfilled' AND COALESCE(o.fulfillment_status, 'not_started') = 'fulfilled')
      OR ($3::text = 'not_invoiced' AND COALESCE(o.invoice_status, 'not_invoiced') = 'not_invoiced')
      OR ($3::text = 'partially_invoiced' AND COALESCE(o.invoice_status, 'not_invoiced') = 'partial')
      OR ($3::text = 'invoiced' AND COALESCE(o.invoice_status, 'not_invoiced') = 'invoiced')
    )
  `;

  const [page, counts] = await Promise.all([
    context.pool.query(
      `
        SELECT
          o.id,
          o.order_number,
          o.quote_id,
          q.quote_number,
          o.latest_invoice_id,
          o.reference,
          o.status,
          o.fulfillment_status,
          o.invoice_status,
          o.order_date,
          o.currency,
          o.base_currency,
          o.exchange_rate,
          o.exchange_rate_date,
          o.exchange_rate_source,
          o.base_total_amount,
          o.customer_name,
          o.total_amount,
          COALESCE(SUM(oi.quantity), 0) AS ordered_quantity,
          COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity,
          COALESCE(SUM(oi.invoiced_quantity), 0) AS invoiced_quantity
        FROM sales_orders_v2 o
        LEFT JOIN sales_order_items_v2 oi
          ON oi.sales_order_id = o.id AND oi.company_id = o.company_id
        LEFT JOIN sales_quotes q
          ON q.id = o.quote_id AND q.company_id = o.company_id
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          ${searchSql}
          AND ${statusFilterSql}
        GROUP BY o.id, q.quote_number
        ORDER BY ${sortSql[sortBy]}
        LIMIT $4 OFFSET $5
      `,
      [...parameters, limit + 1, offset],
    ),

    context.pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE ${statusFilterSql})::int AS filtered_total,
          COUNT(*)::int AS all_count,
          COUNT(*) FILTER (WHERE COALESCE(o.fulfillment_status, 'not_started') = 'not_started')::int AS awaiting_fulfillment,
          COUNT(*) FILTER (WHERE COALESCE(o.fulfillment_status, 'not_started') = 'partial')::int AS partially_fulfilled,
          COUNT(*) FILTER (WHERE COALESCE(o.fulfillment_status, 'not_started') = 'fulfilled')::int AS fulfilled,
          COUNT(*) FILTER (WHERE COALESCE(o.invoice_status, 'not_invoiced') = 'not_invoiced')::int AS not_invoiced,
          COUNT(*) FILTER (WHERE COALESCE(o.invoice_status, 'not_invoiced') = 'partial')::int AS partially_invoiced,
          COUNT(*) FILTER (WHERE COALESCE(o.invoice_status, 'not_invoiced') = 'invoiced')::int AS invoiced
        FROM sales_orders_v2 o
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          ${searchSql}
      `,
      parameters,
    ),
  ]);

  const hasMore = page.rows.length > limit;
  const rows = page.rows.slice(0, limit).map((row): SalesOrderSummary => {
    const orderedQty = num(row.ordered_quantity);
    return {
      id: str(row.id),
      orderNumber: str(row.order_number),
      quoteId: strOrNull(row.quote_id),
      quoteNumber: strOrNull(row.quote_number),
      latestInvoiceId: strOrNull(row.latest_invoice_id),
      reference: strOrNull(row.reference),
      status: str(row.status),
      fulfillmentStatus: strOrNull(row.fulfillment_status) ?? 'not_started',
      invoiceStatus: strOrNull(row.invoice_status) ?? 'not_invoiced',
      orderDate: str(row.order_date),
      currency: str(row.currency),
      baseCurrency:
        strOrNull(row.base_currency) ?? context.company.currentCompany.currency ?? str(row.currency),
      exchangeRate: num(row.exchange_rate, 1) || 1,
      exchangeRateDate: (dateOnly(row.exchange_rate_date ?? row.order_date) ?? str(row.order_date)).slice(0, 10),
      exchangeRateSource: strOrNull(row.exchange_rate_source) ?? 'base',
      baseTotalAmount: money(row.base_total_amount ?? row.total_amount),
      customerName: str(row.customer_name),
      totalAmount: money(row.total_amount),
      deliveredPercent: percentOf(num(row.delivered_quantity), orderedQty),
      invoicedPercent: percentOf(num(row.invoiced_quantity), orderedQty),
    };
  });

  const countRow = counts.rows[0] ?? {};

  return {
    rows,
    offset,
    limit,
    totalCount: num(countRow.filtered_total),
    hasMore,
    nextOffset: offset + rows.length,
    queueCounts: {
      all: num(countRow.all_count),
      awaiting_fulfillment: num(countRow.awaiting_fulfillment),
      partially_fulfilled: num(countRow.partially_fulfilled),
      fulfilled: num(countRow.fulfilled),
      not_invoiced: num(countRow.not_invoiced),
      partially_invoiced: num(countRow.partially_invoiced),
      invoiced: num(countRow.invoiced),
    },
  };
}