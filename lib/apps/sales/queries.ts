import 'server-only';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  ensureSalesDefaults,
  hasSalesPermission,
  money,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

import type {
  SalesOrderDetail,
  SalesQuoteDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


const INVOICING_CUSTOMER_VIEW =
  'invoicing.customer.view';

const INVOICING_CUSTOMER_MANAGE =
  'invoicing.customer.manage';

const INVOICING_CATALOG_VIEW =
  'invoicing.catalog.view';

const INVOICING_CATALOG_MANAGE =
  'invoicing.catalog.manage';


function salesCapabilities(
  isOwner:
    boolean,
  permissionSet:
    ReadonlySet<string>,
) {
  const can =
    (
      permission:
        string,
    ) =>
      hasSalesPermission(
        isOwner,
        permissionSet,
        permission,
      );

  const crossCan =
    (
      ...permissions:
        string[]
    ) =>
      isOwner ||
      permissions.some(
        permission =>
          permissionSet.has(
            permission,
          ),
      );

  return {
    canView:
      can(
        SALES_PERMISSIONS
          .QUOTE_VIEW,
      ),
    canCreate:
      can(
        SALES_PERMISSIONS
          .QUOTE_CREATE,
      ),
    canEdit:
      can(
        SALES_PERMISSIONS
          .QUOTE_EDIT,
      ),
    canSend:
      can(
        SALES_PERMISSIONS
          .QUOTE_SEND,
      ),
    canApprove:
      can(
        SALES_PERMISSIONS
          .QUOTE_APPROVE,
      ),
    canApproveInternally:
      can(
        SALES_PERMISSIONS
          .QUOTE_INTERNAL_APPROVE,
      ),
    canConvert:
      can(
        SALES_PERMISSIONS
          .QUOTE_CONVERT,
      ),
    canCancel:
      can(
        SALES_PERMISSIONS
          .QUOTE_CANCEL,
      ),
    canViewOrders:
      can(
        SALES_PERMISSIONS
          .ORDER_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .ORDER_MANAGE,
      ),
    canManageOrders:
      can(
        SALES_PERMISSIONS
          .ORDER_MANAGE,
      ),
    canViewReports:
      can(
        SALES_PERMISSIONS
          .REPORT_VIEW,
      ),
    canManageSettings:
      can(
        SALES_PERMISSIONS
          .SETTINGS_MANAGE,
      ),
    canRevise:
      can(
        SALES_PERMISSIONS
          .QUOTE_REVISE,
      ),
    canManageOptionalProducts:
      can(
        SALES_PERMISSIONS
          .QUOTE_OPTIONAL_MANAGE,
      ),
    canViewPricing:
      can(
        SALES_PERMISSIONS
          .PRICING_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .PRICING_MANAGE,
      ),
    canManagePricing:
      can(
        SALES_PERMISSIONS
          .PRICING_MANAGE,
      ),
    canViewMargin:
      can(
        SALES_PERMISSIONS
          .MARGIN_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .MARGIN_MANAGE,
      ),
    canManageMargin:
      can(
        SALES_PERMISSIONS
          .MARGIN_MANAGE,
      ),
    canViewOrganization:
      can(
        SALES_PERMISSIONS
          .TEAM_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .TEAM_MANAGE,
      ) ||
      can(
        SALES_PERMISSIONS
          .TARGET_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .TARGET_MANAGE,
      ) ||
      can(
        SALES_PERMISSIONS
          .COMMISSION_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .COMMISSION_MANAGE,
      ),
    canManageTeams:
      can(
        SALES_PERMISSIONS
          .TEAM_MANAGE,
      ),
    canManageTargets:
      can(
        SALES_PERMISSIONS
          .TARGET_MANAGE,
      ),
    canViewCommissions:
      can(
        SALES_PERMISSIONS
          .COMMISSION_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .COMMISSION_MANAGE,
      ),
    canManageCommissions:
      can(
        SALES_PERMISSIONS
          .COMMISSION_MANAGE,
      ),
    canViewOperations:
      can(
        SALES_PERMISSIONS
          .SHIPPING_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .SHIPPING_MANAGE,
      ) ||
      can(
        SALES_PERMISSIONS
          .RETURN_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .RETURN_MANAGE,
      ) ||
      can(
        SALES_PERMISSIONS
          .DEPOSIT_MANAGE,
      ) ||
      can(
        SALES_PERMISSIONS
          .FORECAST_VIEW,
      ),
    canViewShipping:
      can(
        SALES_PERMISSIONS
          .SHIPPING_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .SHIPPING_MANAGE,
      ),
    canManageShipping:
      can(
        SALES_PERMISSIONS
          .SHIPPING_MANAGE,
      ),
    canViewReturns:
      can(
        SALES_PERMISSIONS
          .RETURN_VIEW,
      ) ||
      can(
        SALES_PERMISSIONS
          .RETURN_MANAGE,
      ),
    canManageReturns:
      can(
        SALES_PERMISSIONS
          .RETURN_MANAGE,
      ),
    canManageDeposits:
      can(
        SALES_PERMISSIONS
          .DEPOSIT_MANAGE,
      ),
    canViewForecast:
      can(
        SALES_PERMISSIONS
          .FORECAST_VIEW,
      ),
    canUseBillingCustomers:
      crossCan(
        INVOICING_CUSTOMER_VIEW,
        INVOICING_CUSTOMER_MANAGE,
      ),
    canManageBillingCustomers:
      crossCan(
        INVOICING_CUSTOMER_MANAGE,
      ),
    canUseCatalog:
      crossCan(
        INVOICING_CATALOG_VIEW,
        INVOICING_CATALOG_MANAGE,
      ),
    canManageCatalog:
      crossCan(
        INVOICING_CATALOG_MANAGE,
      ),
  };
}


async function invoicingTablesAvailable(
  pool:
    Awaited<
      ReturnType<
        typeof getTenantPoolByTenantId
      >
    >,
) {
  const result =
    await pool.query(
      `
        SELECT
          to_regclass(
            'public.invoicing_customers'
          ) IS NOT NULL
            AS customers_ready,
          to_regclass(
            'public.invoicing_catalog_items'
          ) IS NOT NULL
            AS catalog_ready,
          to_regclass(
            'public.invoicing_tax_rates'
          ) IS NOT NULL
            AS taxes_ready
      `,
    );

  return {
    customers:
      result.rows[0]
        ?.customers_ready ===
        true,
    catalog:
      result.rows[0]
        ?.catalog_ready ===
        true &&
      result.rows[0]
        ?.taxes_ready ===
        true,
  };
}


export async function getSalesWorkspaceData():
  Promise<SalesWorkspaceData> {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_VIEW,
    );

  await ensureSalesDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const access =
    salesCapabilities(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
    );

  const related =
    await invoicingTablesAvailable(
      context.pool,
    );

  const [
    company,
    metrics,
    statusCounts,
    monthly,
    topCustomers,
    quotes,
    orders,
    templates,
    pricelists,
    settings,
    billingCustomers,
    catalogItems,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            id,
            name,
            COALESCE(
              currency,
              'KES'
            ) AS currency
          FROM companies
          WHERE id = $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            COUNT(*)::int
              AS quote_count,
            COUNT(*) FILTER (
              WHERE status = 'draft'
            )::int
              AS draft_count,
            COUNT(*) FILTER (
              WHERE status IN (
                'sent',
                'viewed'
              )
            )::int
              AS sent_count,
            COUNT(*) FILTER (
              WHERE status = 'accepted'
            )::int
              AS accepted_count,
            COUNT(*) FILTER (
              WHERE status = 'converted'
            )::int
              AS converted_count,
            COALESCE(
              SUM(total_amount),
              0
            ) AS quote_value,
            COALESCE(
              SUM(total_amount)
                FILTER (
                  WHERE status IN (
                    'accepted',
                    'converted'
                  )
                ),
              0
            ) AS accepted_value
          FROM sales_quotes
          WHERE company_id = $1
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
        ],
      ),

      access.canViewReports
        ? context.pool.query(
            `
              SELECT
                status,
                COUNT(*)::int
                  AS count,
                COALESCE(
                  SUM(total_amount),
                  0
                )
                  AS amount
              FROM sales_quotes
              WHERE company_id = $1
                AND deleted_at IS NULL
              GROUP BY status
              ORDER BY status
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      access.canViewReports
        ? context.pool.query(
            `
              SELECT
                TO_CHAR(
                  DATE_TRUNC(
                    'month',
                    quote_date
                  ),
                  'YYYY-MM'
                )
                  AS month,
                COUNT(*)::int
                  AS quote_count,
                COALESCE(
                  SUM(total_amount),
                  0
                )
                  AS amount
              FROM sales_quotes
              WHERE company_id = $1
                AND deleted_at IS NULL
                AND quote_date >=
                    CURRENT_DATE -
                    INTERVAL '11 months'
              GROUP BY 1
              ORDER BY 1
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      access.canViewReports
        ? context.pool.query(
            `
              SELECT
                customer_name,
                COUNT(*)::int
                  AS quote_count,
                COALESCE(
                  SUM(total_amount),
                  0
                )
                  AS amount
              FROM sales_quotes
              WHERE company_id = $1
                AND deleted_at IS NULL
              GROUP BY customer_name
              ORDER BY amount DESC
              LIMIT 10
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      context.pool.query(
        `
          SELECT
            id,
            quote_number,
            CASE
              WHEN status IN (
                'sent',
                'viewed'
              )
               AND valid_until IS NOT NULL
               AND valid_until <
                   CURRENT_DATE
              THEN 'expired'
              ELSE status
            END AS effective_status,
            quote_date,
            valid_until,
            currency,
            customer_name,
            customer_email,
            total_amount,
            current_revision,
            template_id,
            pricelist_id,
            margin_amount,
            margin_percent,
            reference,
            approval_status,
            sales_order_id,
            latest_invoice_id,
            created_at
          FROM sales_quotes
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            created_at DESC
          LIMIT 250
        `,
        [
          context.companyId,
        ],
      ),

      access
        .canViewOrders
        ? context.pool.query(
            `
              SELECT
                o.id,
                o.order_number,
                o.quote_id,
                q.quote_number,
                o.latest_invoice_id,
                o.status,
                o.fulfillment_status,
                o.invoice_status,
                o.order_date,
                o.currency,
                o.customer_name,
                o.total_amount,
                COALESCE(
                  SUM(oi.quantity),
                  0
                ) AS ordered_quantity,
                COALESCE(
                  SUM(oi.delivered_quantity),
                  0
                ) AS delivered_quantity,
                COALESCE(
                  SUM(oi.invoiced_quantity),
                  0
                ) AS invoiced_quantity
              FROM sales_orders_v2 o
              LEFT JOIN sales_order_items_v2 oi
                ON oi.sales_order_id =
                   o.id
               AND oi.company_id =
                   o.company_id
              LEFT JOIN sales_quotes q
                ON q.id =
                   o.quote_id
               AND q.company_id =
                   o.company_id
              WHERE o.company_id =
                    $1
                AND o.deleted_at
                    IS NULL
              GROUP BY
                o.id,
                q.quote_number
              ORDER BY
                o.created_at DESC
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

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
          ORDER BY
            is_default DESC,
            name
        `,
        [
          context.companyId,
        ],
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
              ORDER BY
                is_active DESC,
                priority,
                LOWER(name)
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

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
            quote_approval_threshold
          FROM sales_settings
          WHERE company_id = $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      ),

      access
        .canUseBillingCustomers &&
      related.customers
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
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      access
        .canUseCatalog &&
      related.catalog
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
                tax.id
                  AS tax_rate_id,
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
              WHERE item.company_id =
                    $1
                AND item.is_active =
                    TRUE
                AND item.deleted_at
                    IS NULL
              ORDER BY
                LOWER(item.name)
              LIMIT 500
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),
    ]);

  const metric =
    metrics.rows[0] ||
    {};

  const orderValue =
    access.canViewOrders
      ? money(
          orders.rows.reduce(
            (
              sum,
              row,
            ) =>
              sum +
              Number(
                row.total_amount ||
                0,
              ),
            0,
          ),
        )
      : 0;

  const setting =
    settings.rows[0] ||
    {};

  const companyRow =
    company.rows[0] ||
    {};

  return {
    company: {
      id:
        context.companyId,
      name:
        String(
          companyRow.name ||
          context.company
            .currentCompany.name ||
          'Current company',
        ),
      currency:
        String(
          companyRow.currency ||
          'KES',
        ),
    },

    capabilities:
      access,

    metrics: {
      quoteCount:
        Number(
          metric.quote_count ||
          0,
        ),
      draftCount:
        Number(
          metric.draft_count ||
          0,
        ),
      sentCount:
        Number(
          metric.sent_count ||
          0,
        ),
      acceptedCount:
        Number(
          metric.accepted_count ||
          0,
        ),
      convertedCount:
        Number(
          metric.converted_count ||
          0,
        ),
      quoteValue:
        money(
          metric.quote_value,
        ),
      acceptedValue:
        money(
          metric.accepted_value,
        ),
      orderValue,
    },

    statusCounts:
      statusCounts.rows.map(
        row => ({
          status:
            String(
              row.status,
            ),
          count:
            Number(
              row.count ||
              0,
            ),
          amount:
            money(
              row.amount,
            ),
        }),
      ),

    monthly:
      monthly.rows.map(
        row => ({
          month:
            String(
              row.month,
            ),
          quoteCount:
            Number(
              row.quote_count ||
              0,
            ),
          amount:
            money(
              row.amount,
            ),
        }),
      ),

    topCustomers:
      topCustomers.rows.map(
        row => ({
          customerName:
            String(
              row.customer_name,
            ),
          quoteCount:
            Number(
              row.quote_count ||
              0,
            ),
          amount:
            money(
              row.amount,
            ),
        }),
      ),

    quotes:
      quotes.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          quoteNumber:
            String(
              row.quote_number,
            ),
          status:
            String(
              row.effective_status,
            ),
          quoteDate:
            String(
              row.quote_date,
            ),
          validUntil:
            row.valid_until
              ? String(
                  row.valid_until,
                )
              : null,
          currency:
            String(
              row.currency,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          customerEmail:
            row.customer_email
              ? String(
                  row.customer_email,
                )
              : null,
          totalAmount:
            money(
              row.total_amount,
            ),
          currentRevision:
            Math.max(
              1,
              Number(
                row.current_revision ||
                1,
              ),
            ),
          templateId:
            row.template_id
              ? String(
                  row.template_id,
                )
              : null,
          pricelistId:
            row.pricelist_id
              ? String(
                  row.pricelist_id,
                )
              : null,
          marginAmount:
            access.canViewMargin
              ? money(
                  row.margin_amount,
                )
              : null,
          marginPercent:
            access.canViewMargin
              ? money(
                  row.margin_percent,
                )
              : null,
          reference:
            row.reference
              ? String(
                  row.reference,
                )
              : null,
          approvalStatus:
            String(
              row.approval_status ||
              'not_required',
            ),
          salesOrderId:
            row.sales_order_id
              ? String(
                  row.sales_order_id,
                )
              : null,
          latestInvoiceId:
            row.latest_invoice_id
              ? String(
                  row.latest_invoice_id,
                )
              : null,
          createdAt:
            row.created_at
              ? new Date(
                  row.created_at,
                ).toISOString()
              : null,
        }),
      ),

    orders:
      orders.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          orderNumber:
            String(
              row.order_number,
            ),
          quoteId:
            row.quote_id
              ? String(
                  row.quote_id,
                )
              : null,
          quoteNumber:
            row.quote_number
              ? String(
                  row.quote_number,
                )
              : null,
          latestInvoiceId:
            row.latest_invoice_id
              ? String(
                  row.latest_invoice_id,
                )
              : null,
          status:
            String(
              row.status,
            ),
          fulfillmentStatus:
            String(
              row.fulfillment_status ||
              'not_started',
            ),
          invoiceStatus:
            String(
              row.invoice_status ||
              'not_invoiced',
            ),
          orderDate:
            String(
              row.order_date,
            ),
          currency:
            String(
              row.currency,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          totalAmount:
            money(
              row.total_amount,
            ),
          deliveredPercent:
            Number(
              row.ordered_quantity ||
              0,
            ) >
              0
              ? Math.min(
                  100,
                  Math.round(
                    Number(
                      row.delivered_quantity ||
                      0,
                    ) /
                    Number(
                      row.ordered_quantity,
                    ) *
                    100,
                  ),
                )
              : 0,
          invoicedPercent:
            Number(
              row.ordered_quantity ||
              0,
            ) >
              0
              ? Math.min(
                  100,
                  Math.round(
                    Number(
                      row.invoiced_quantity ||
                      0,
                    ) /
                    Number(
                      row.ordered_quantity,
                    ) *
                    100,
                  ),
                )
              : 0,
        }),
      ),

    billingCustomers:
      billingCustomers.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          customerType:
            String(
              row.customer_type ||
              'company',
            ),
          name:
            String(
              row.name,
            ),
          legalName:
            row.legal_name
              ? String(
                  row.legal_name,
                )
              : null,
          contactName:
            row.contact_name
              ? String(
                  row.contact_name,
                )
              : null,
          email:
            row.email
              ? String(
                  row.email,
                )
              : null,
          phone:
            row.phone
              ? String(
                  row.phone,
                )
              : null,
          taxId:
            row.tax_id
              ? String(
                  row.tax_id,
                )
              : null,
          registrationNumber:
            row.registration_number
              ? String(
                  row.registration_number,
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
          city:
            row.city
              ? String(
                  row.city,
                )
              : null,
          state:
            row.state
              ? String(
                  row.state,
                )
              : null,
          postalCode:
            row.postal_code
              ? String(
                  row.postal_code,
                )
              : null,
          country:
            row.country
              ? String(
                  row.country,
                )
              : null,
          countryCode:
            row.country_code
              ? String(
                  row.country_code,
                )
              : null,
          currency:
            String(
              row.currency ||
              companyRow.currency ||
              'KES',
            ),
          creditLimit:
            row.credit_limit ===
              null ||
            row.credit_limit ===
              undefined
              ? null
              : Number(
                  row.credit_limit,
                ),
          notes:
            row.notes
              ? String(
                  row.notes,
                )
              : null,
          status:
            String(
              row.status ||
              'active',
            ),
        }),
      ),

    catalogItems:
      catalogItems.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          itemType:
            String(
              row.item_type ||
              'service',
            ),
          name:
            String(
              row.name,
            ),
          sku:
            row.sku
              ? String(
                  row.sku,
                )
              : null,
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          unit:
            String(
              row.unit ||
              'unit',
            ),
          unitPrice:
            money(
              row.unit_price,
            ),
          taxRateId:
            row.tax_rate_id
              ? String(
                  row.tax_rate_id,
                )
              : null,
          taxName:
            row.tax_name
              ? String(
                  row.tax_name,
                )
              : null,
          taxRate:
            money(
              row.tax_rate,
            ),
          unitCost:
            access.canViewMargin
              ? money(
                  row.metadata
                    ?.standardCost ??
                  row.metadata
                    ?.unitCost ??
                  0,
                )
              : null,
        }),
      ),

    pricelists:
      pricelists.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          code:
            row.code
              ? String(
                  row.code,
                )
              : null,
          currency:
            String(
              row.currency,
            ),
          billingCustomerId:
            row.billing_customer_id
              ? String(
                  row.billing_customer_id,
                )
              : null,
          validFrom:
            row.valid_from
              ? String(
                  row.valid_from,
                )
              : null,
          validUntil:
            row.valid_until
              ? String(
                  row.valid_until,
                )
              : null,
          priority:
            Number(
              row.priority ||
              100,
            ),
          isActive:
            row.is_active ===
              true,
        }),
      ),

    templates:
      templates.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          isDefault:
            row.is_default ===
              true,
          notes:
            row.notes
              ? String(
                  row.notes,
                )
              : null,
          terms:
            row.terms
              ? String(
                  row.terms,
                )
              : null,
          footerText:
            row.footer_text
              ? String(
                  row.footer_text,
                )
              : null,
          primaryColor:
            String(
              row.primary_color ||
              '#164a9f',
            ),
          secondaryColor:
            String(
              row.secondary_color ||
              '#0f172a',
            ),
        }),
      ),

    settings: {
      defaultCurrency:
        String(
          setting.default_currency ||
          companyRow.currency ||
          'KES',
        ),
      defaultValidityDays:
        Number(
          setting.default_validity_days ||
          14,
        ),
      termsAndConditions:
        setting.terms_and_conditions
          ? String(
              setting.terms_and_conditions,
            )
          : null,
      defaultNotes:
        setting.default_notes
          ? String(
              setting.default_notes,
            )
          : null,
      emailMessage:
        setting.email_message
          ? String(
              setting.email_message,
            )
          : null,
      primaryColor:
        String(
          setting.primary_color ||
          '#164a9f',
        ),
      secondaryColor:
        String(
          setting.secondary_color ||
          '#0f172a',
        ),
      footerText:
        setting.footer_text
          ? String(
              setting.footer_text,
            )
          : null,
      allowOnlineAcceptance:
        setting.allow_online_acceptance !==
        false,
      allowOnlineRejection:
        setting.allow_online_rejection !==
        false,
      allowPartialInvoicing:
        setting.allow_partial_invoicing !==
        false,
      requireBillingCustomerForInvoice:
        setting.require_billing_customer_for_invoice !==
        false,
      invoicePolicy:
        setting.invoice_policy ===
          'delivered'
          ? 'delivered'
          : 'ordered',
      lockConfirmedOrders:
        setting.lock_confirmed_orders !==
        false,
      requireQuoteApproval:
        setting.require_quote_approval ===
        true,
      quoteApprovalThreshold:
        money(
          setting.quote_approval_threshold,
        ),
    },
  };
}


export async function getSalesQuoteDetail(
  quoteId:
    string,
): Promise<
  SalesQuoteDetail |
  null
> {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_VIEW,
    );

  const [
    quote,
    lines,
    history,
    deliveries,
    revisions,
    optionalItems,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            id,
            billing_customer_id,
            quote_number,
            CASE
              WHEN status IN (
                'sent',
                'viewed'
              )
               AND valid_until IS NOT NULL
               AND valid_until <
                   CURRENT_DATE
              THEN 'expired'
              ELSE status
            END AS effective_status,
            quote_date,
            valid_until,
            currency,
            reference,
            approval_status,
            approval_requested_at,
            approved_at,
            approval_rejected_at,
            approval_rejection_reason,
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
            current_revision,
            template_id,
            pricelist_id,
            margin_amount,
            margin_percent,
            notes,
            terms,
            internal_notes,
            sales_order_id,
            latest_invoice_id,
            sent_at,
            viewed_at,
            accepted_at,
            accepted_by_name,
            accepted_by_email,
            acceptance_note,
            rejected_at,
            converted_at,
            created_at
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
          ORDER BY
            sort_order,
            id
        `,
        [
          quoteId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            from_status,
            to_status,
            reason,
            created_at
          FROM sales_quote_status_history
          WHERE quote_id = $1
            AND company_id = $2
          ORDER BY
            created_at DESC
          LIMIT 200
        `,
        [
          quoteId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            channel,
            provider,
            status,
            error_code,
            created_at
          FROM sales_delivery_log
          WHERE quote_id = $1
            AND company_id = $2
          ORDER BY
            created_at DESC
          LIMIT 100
        `,
        [
          quoteId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            revision_number,
            reason,
            created_at
          FROM sales_quote_revisions
          WHERE quote_id = $1
            AND company_id = $2
          ORDER BY
            revision_number DESC
          LIMIT 100
        `,
        [
          quoteId,
          context.companyId,
        ],
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
          ORDER BY
            sort_order,
            id
        `,
        [
          quoteId,
          context.companyId,
        ],
      ),
    ]);

  if (
    quote.rows.length !==
      1
  ) {
    return null;
  }

  const row =
    quote.rows[0];

  return {
    id:
      String(
        row.id,
      ),
    quoteNumber:
      String(
        row.quote_number,
      ),
    status:
      String(
        row.effective_status,
      ),
    quoteDate:
      String(
        row.quote_date,
      ),
    validUntil:
      row.valid_until
        ? String(
            row.valid_until,
          )
        : null,
    currency:
      String(
        row.currency,
      ),
    customerName:
      String(
        row.customer_name,
      ),
    customerEmail:
      row.customer_email
        ? String(
            row.customer_email,
          )
        : null,
    totalAmount:
      money(
        row.total_amount,
      ),
    currentRevision:
      Math.max(
        1,
        Number(
          row.current_revision ||
          1,
        ),
      ),
    templateId:
      row.template_id
        ? String(
            row.template_id,
          )
        : null,
    pricelistId:
      row.pricelist_id
        ? String(
            row.pricelist_id,
          )
        : null,
    marginAmount:
      salesCapabilities(
        context.permissions.isOwner,
        context.permissions.permissionSet,
      ).canViewMargin
        ? money(
            row.margin_amount,
          )
        : null,
    marginPercent:
      salesCapabilities(
        context.permissions.isOwner,
        context.permissions.permissionSet,
      ).canViewMargin
        ? money(
            row.margin_percent,
          )
        : null,
    reference:
      row.reference
        ? String(
            row.reference,
          )
        : null,
    approvalStatus:
      String(
        row.approval_status ||
        'not_required',
      ),
    salesOrderId:
      row.sales_order_id
        ? String(
            row.sales_order_id,
          )
        : null,
    latestInvoiceId:
      row.latest_invoice_id
        ? String(
            row.latest_invoice_id,
          )
        : null,
    createdAt:
      row.created_at
        ? new Date(
            row.created_at,
          ).toISOString()
        : null,
    billingCustomerId:
      row.billing_customer_id
        ? String(
            row.billing_customer_id,
          )
        : null,
    customerPhone:
      row.customer_phone
        ? String(
            row.customer_phone,
          )
        : null,
    customerTaxId:
      row.customer_tax_id
        ? String(
            row.customer_tax_id,
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
    subtotal:
      money(
        row.subtotal,
      ),
    discountTotal:
      money(
        row.discount_total,
      ),
    taxTotal:
      money(
        row.tax_total,
      ),
    shippingTotal:
      money(
        row.shipping_total,
      ),
    notes:
      row.notes
        ? String(
            row.notes,
          )
        : null,
    terms:
      row.terms
        ? String(
            row.terms,
          )
        : null,
    internalNotes:
      row.internal_notes
        ? String(
            row.internal_notes,
          )
        : null,
    approvalRequestedAt:
      row.approval_requested_at
        ? new Date(
            row.approval_requested_at,
          ).toISOString()
        : null,
    approvedAt:
      row.approved_at
        ? new Date(
            row.approved_at,
          ).toISOString()
        : null,
    approvalRejectedAt:
      row.approval_rejected_at
        ? new Date(
            row.approval_rejected_at,
          ).toISOString()
        : null,
    approvalRejectionReason:
      row.approval_rejection_reason
        ? String(
            row.approval_rejection_reason,
          )
        : null,
    sentAt:
      row.sent_at
        ? new Date(
            row.sent_at,
          ).toISOString()
        : null,
    viewedAt:
      row.viewed_at
        ? new Date(
            row.viewed_at,
          ).toISOString()
        : null,
    acceptedAt:
      row.accepted_at
        ? new Date(
            row.accepted_at,
          ).toISOString()
        : null,
    acceptedByName:
      row.accepted_by_name
        ? String(
            row.accepted_by_name,
          )
        : null,
    acceptedByEmail:
      row.accepted_by_email
        ? String(
            row.accepted_by_email,
          )
        : null,
    acceptanceNote:
      row.acceptance_note
        ? String(
            row.acceptance_note,
          )
        : null,
    rejectedAt:
      row.rejected_at
        ? new Date(
            row.rejected_at,
          ).toISOString()
        : null,
    convertedAt:
      row.converted_at
        ? new Date(
            row.converted_at,
          ).toISOString()
        : null,
    lines:
      lines.rows.map(
        line => ({
          id:
            String(
              line.id,
            ),
          catalogItemId:
            line.catalog_item_id
              ? String(
                  line.catalog_item_id,
                )
              : null,
          description:
            String(
              line.description,
            ),
          sku:
            line.sku_snapshot
              ? String(
                  line.sku_snapshot,
                )
              : null,
          unit:
            String(
              line.unit ||
              'unit',
            ),
          quantity:
            Number(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          unitCost:
            salesCapabilities(
              context.permissions.isOwner,
              context.permissions.permissionSet,
            ).canViewMargin
              ? money(
                  line.unit_cost,
                )
              : null,
          costTotal:
            salesCapabilities(
              context.permissions.isOwner,
              context.permissions.permissionSet,
            ).canViewMargin
              ? money(
                  line.cost_total,
                )
              : null,
          marginAmount:
            salesCapabilities(
              context.permissions.isOwner,
              context.permissions.permissionSet,
            ).canViewMargin
              ? money(
                  line.margin_amount,
                )
              : null,
          marginPercent:
            salesCapabilities(
              context.permissions.isOwner,
              context.permissions.permissionSet,
            ).canViewMargin
              ? money(
                  line.margin_percent,
                )
              : null,
          discountType:
            line.discount_type ===
              'fixed'
              ? 'fixed'
              : 'percent',
          discountValue:
            money(
              line.discount_value,
            ),
          discountAmount:
            money(
              line.discount_amount,
            ),
          taxName:
            line.tax_name_snapshot
              ? String(
                  line.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              line.tax_rate,
            ),
          taxAmount:
            money(
              line.tax_amount,
            ),
          subtotal:
            money(
              line.subtotal,
            ),
          lineTotal:
            money(
              line.line_total,
            ),
        }),
      ),
    optionalItems:
      optionalItems.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          catalogItemId:
            item.catalog_item_id
              ? String(
                  item.catalog_item_id,
                )
              : null,
          description:
            String(
              item.description,
            ),
          sku:
            item.sku_snapshot
              ? String(
                  item.sku_snapshot,
                )
              : null,
          unit:
            String(
              item.unit ||
              'unit',
            ),
          quantity:
            Number(
              item.quantity,
            ),
          unitPrice:
            money(
              item.unit_price,
            ),
          unitCost:
            salesCapabilities(
              context.permissions.isOwner,
              context.permissions.permissionSet,
            ).canViewMargin
              ? money(
                  item.unit_cost,
                )
              : null,
          taxName:
            item.tax_name_snapshot
              ? String(
                  item.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              item.tax_rate ||
              0,
            ),
          isSelected:
            item.is_selected ===
              true,
        }),
      ),
    revisions:
      revisions.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          revisionNumber:
            Number(
              item.revision_number,
            ),
          reason:
            item.reason
              ? String(
                  item.reason,
                )
              : null,
          createdAt:
            new Date(
              item.created_at,
            ).toISOString(),
        }),
      ),
    history:
      history.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          fromStatus:
            item.from_status
              ? String(
                  item.from_status,
                )
              : null,
          toStatus:
            String(
              item.to_status,
            ),
          reason:
            item.reason
              ? String(
                  item.reason,
                )
              : null,
          createdAt:
            new Date(
              item.created_at,
            ).toISOString(),
        }),
      ),
    deliveries:
      deliveries.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          channel:
            String(
              item.channel,
            ),
          provider:
            item.provider
              ? String(
                  item.provider,
                )
              : null,
          status:
            String(
              item.status,
            ),
          errorCode:
            item.error_code
              ? String(
                  item.error_code,
                )
              : null,
          createdAt:
            new Date(
              item.created_at,
            ).toISOString(),
        }),
      ),
  };
}


export async function getSalesOrderDetail(
  orderId:
    string,
): Promise<
  SalesOrderDetail |
  null
> {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .ORDER_VIEW,
    );

  const settings =
    (
      await context.pool.query(
        `
          SELECT
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

  const invoicePolicy =
    settings.invoice_policy ===
      'delivered'
      ? 'delivered'
      : 'ordered';

  const [
    order,
    lines,
    invoices,
    history,
    shipments,
    returns,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            o.*,
            q.quote_number,
            q.billing_customer_id,
            COALESCE(
              SUM(oi.quantity),
              0
            ) AS ordered_quantity,
            COALESCE(
              SUM(oi.delivered_quantity),
              0
            ) AS delivered_quantity,
            COALESCE(
              SUM(oi.invoiced_quantity),
              0
            ) AS invoiced_quantity
          FROM sales_orders_v2 o
          LEFT JOIN sales_quotes q
            ON q.id =
               o.quote_id
           AND q.company_id =
               o.company_id
          LEFT JOIN sales_order_items_v2 oi
            ON oi.sales_order_id =
               o.id
           AND oi.company_id =
               o.company_id
          WHERE o.id = $1
            AND o.company_id = $2
            AND o.deleted_at IS NULL
          GROUP BY
            o.id,
            q.quote_number,
            q.billing_customer_id
          LIMIT 1
        `,
        [
          orderId,
          context.companyId,
        ],
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
            delivered_quantity,
            invoiced_quantity,
            returned_quantity,
            credited_quantity,
            unit_price,
            discount_type,
            discount_value,
            tax_name_snapshot,
            tax_rate,
            line_total
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
      ),

      context.pool.query(
        `
          SELECT
            id,
            invoice_id,
            source_reference,
            status,
            created_at
          FROM sales_order_invoice_batches
          WHERE sales_order_id = $1
            AND company_id = $2
          ORDER BY
            created_at DESC
        `,
        [
          orderId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            from_status,
            to_status,
            reason,
            created_at
          FROM sales_order_status_history
          WHERE sales_order_id = $1
            AND company_id = $2
          ORDER BY
            created_at DESC
          LIMIT 200
        `,
        [
          orderId,
          context.companyId,
        ],
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
                  'id',
                  item.id,
                  'salesOrderLineId',
                  item.sales_order_line_id,
                  'quantity',
                  item.quantity
                )
                ORDER BY item.id
              )
              FILTER (
                WHERE item.id IS NOT NULL
              ),
              '[]'::jsonb
            ) AS items
          FROM sales_shipments shipment
          LEFT JOIN sales_shipment_items item
            ON item.shipment_id =
               shipment.id
           AND item.company_id =
               shipment.company_id
          WHERE shipment.sales_order_id = $1
            AND shipment.company_id = $2
          GROUP BY
            shipment.id
          ORDER BY
            shipment.created_at DESC
        `,
        [
          orderId,
          context.companyId,
        ],
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
            COALESCE(
              (
                SELECT
                  jsonb_agg(
                    jsonb_build_object(
                      'id',
                      item.id,
                      'salesOrderLineId',
                      item.sales_order_line_id,
                      'quantity',
                      item.quantity
                    )
                    ORDER BY item.id
                  )
                FROM sales_return_items item
                WHERE item.return_id =
                      return_row.id
                  AND item.company_id =
                      return_row.company_id
              ),
              '[]'::jsonb
            ) AS items,
            COALESCE(
              (
                SELECT
                  jsonb_agg(
                    jsonb_build_object(
                      'id',
                      credit.id,
                      'invoiceId',
                      credit.invoice_id,
                      'creditNoteId',
                      credit.credit_note_id,
                      'creditNoteNumber',
                      credit.credit_note_number,
                      'amount',
                      credit.amount,
                      'availableCredit',
                      credit.available_credit,
                      'refundedAmount',
                      credit.refunded_amount
                    )
                    ORDER BY
                      credit.created_at
                  )
                FROM sales_return_credits credit
                WHERE credit.return_id =
                      return_row.id
                  AND credit.company_id =
                      return_row.company_id
              ),
              '[]'::jsonb
            ) AS credits
          FROM sales_returns return_row
          WHERE return_row.sales_order_id = $1
            AND return_row.company_id = $2
          ORDER BY
            return_row.created_at DESC
        `,
        [
          orderId,
          context.companyId,
        ],
      ),
    ]);

  if (
    order.rows.length !==
      1
  ) {
    return null;
  }

  const row =
    order.rows[0];

  const orderedQuantity =
    Number(
      row.ordered_quantity ||
      0,
    );

  const deliveredQuantity =
    Number(
      row.delivered_quantity ||
      0,
    );

  const invoicedQuantity =
    Number(
      row.invoiced_quantity ||
      0,
    );

  return {
    id:
      String(
        row.id,
      ),
    orderNumber:
      String(
        row.order_number,
      ),
    quoteId:
      row.quote_id
        ? String(
            row.quote_id,
          )
        : null,
    quoteNumber:
      row.quote_number
        ? String(
            row.quote_number,
          )
        : null,
    latestInvoiceId:
      row.latest_invoice_id
        ? String(
            row.latest_invoice_id,
          )
        : null,
    status:
      String(
        row.status,
      ),
    fulfillmentStatus:
      String(
        row.fulfillment_status ||
        'not_started',
      ),
    invoiceStatus:
      String(
        row.invoice_status ||
        'not_invoiced',
      ),
    orderDate:
      String(
        row.order_date,
      ),
    currency:
      String(
        row.currency,
      ),
    customerName:
      String(
        row.customer_name,
      ),
    totalAmount:
      money(
        row.total_amount,
      ),
    deliveredPercent:
      orderedQuantity >
        0
        ? Math.min(
            100,
            Math.round(
              deliveredQuantity /
              orderedQuantity *
              100,
            ),
          )
        : 0,
    invoicedPercent:
      orderedQuantity >
        0
        ? Math.min(
            100,
            Math.round(
              invoicedQuantity /
              orderedQuantity *
              100,
            ),
          )
        : 0,
    billingCustomerId:
      row.billing_customer_id
        ? String(
            row.billing_customer_id,
          )
        : null,
    customerEmail:
      row.customer_email
        ? String(
            row.customer_email,
          )
        : null,
    customerPhone:
      row.customer_phone
        ? String(
            row.customer_phone,
          )
        : null,
    customerTaxId:
      row.customer_tax_id
        ? String(
            row.customer_tax_id,
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
    reference:
      row.reference
        ? String(
            row.reference,
          )
        : null,
    subtotal:
      money(
        row.subtotal,
      ),
    discountTotal:
      money(
        row.discount_total,
      ),
    taxTotal:
      money(
        row.tax_total,
      ),
    shippingTotal:
      money(
        row.shipping_total,
      ),
    depositType:
      row.deposit_type ===
        'percent'
        ? 'percent'
        : row.deposit_type ===
            'fixed'
          ? 'fixed'
          : 'none',
    depositValue:
      money(
        row.deposit_value,
      ),
    depositRequiredAmount:
      money(
        row.deposit_required_amount,
      ),
    depositReceivedAmount:
      money(
        row.deposit_received_amount,
      ),
    depositStatus:
      String(
        row.deposit_status ||
        'none',
      ),
    depositRetainerId:
      row.deposit_retainer_id
        ? String(
            row.deposit_retainer_id,
          )
        : null,
    depositPaymentId:
      row.deposit_payment_id
        ? String(
            row.deposit_payment_id,
          )
        : null,
    notes:
      row.notes
        ? String(
            row.notes,
          )
        : null,
    terms:
      row.terms
        ? String(
            row.terms,
          )
        : null,
    lines:
      lines.rows.map(
        line => {
          const quantity =
            Number(
              line.quantity,
            );

          const delivered =
            Number(
              line.delivered_quantity ||
              0,
            );

          const invoiced =
            Number(
              line.invoiced_quantity ||
              0,
            );

          const eligible =
            invoicePolicy ===
              'delivered'
              ? delivered
              : quantity;

          return {
            id:
              String(
                line.id,
              ),
            catalogItemId:
              line.catalog_item_id
                ? String(
                    line.catalog_item_id,
                  )
                : null,
            description:
              String(
                line.description,
              ),
            sku:
              line.sku_snapshot
                ? String(
                    line.sku_snapshot,
                  )
                : null,
            unit:
              String(
                line.unit ||
                'unit',
              ),
            quantity,
            deliveredQuantity:
              delivered,
            invoicedQuantity:
              invoiced,
            returnedQuantity:
              Number(
                line.returned_quantity ||
                0,
              ),
            creditedQuantity:
              Number(
                line.credited_quantity ||
                0,
              ),
            invoiceableQuantity:
              Math.max(
                0,
                eligible -
                invoiced,
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
            taxName:
              line.tax_name_snapshot
                ? String(
                    line.tax_name_snapshot,
                  )
                : null,
            taxRate:
              Number(
                line.tax_rate,
              ),
            lineTotal:
              money(
                line.line_total,
              ),
          };
        },
      ),
    shipments:
      shipments.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          shipmentNumber:
            String(
              item.shipment_number,
            ),
          status:
            String(
              item.status,
            ),
          carrier:
            item.carrier
              ? String(
                  item.carrier,
                )
              : null,
          serviceLevel:
            item.service_level
              ? String(
                  item.service_level,
                )
              : null,
          trackingNumber:
            item.tracking_number
              ? String(
                  item.tracking_number,
                )
              : null,
          trackingUrl:
            item.tracking_url
              ? String(
                  item.tracking_url,
                )
              : null,
          recipientName:
            item.recipient_name
              ? String(
                  item.recipient_name,
                )
              : null,
          proofNote:
            item.proof_note
              ? String(
                  item.proof_note,
                )
              : null,
          shippedAt:
            item.shipped_at
              ? new Date(
                  item.shipped_at,
                ).toISOString()
              : null,
          deliveredAt:
            item.delivered_at
              ? new Date(
                  item.delivered_at,
                ).toISOString()
              : null,
          inventoryPostedAt:
            item.inventory_posted_at
              ? new Date(
                  item.inventory_posted_at,
                ).toISOString()
              : null,
          items:
            Array.isArray(
              item.items,
            )
              ? item.items.map(
                  (
                    line:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        line.id,
                      ),
                    salesOrderLineId:
                      String(
                        line.salesOrderLineId,
                      ),
                    quantity:
                      Number(
                        line.quantity ||
                        0,
                      ),
                  }),
                )
              : [],
        }),
      ),
    returns:
      returns.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          returnNumber:
            String(
              item.return_number,
            ),
          status:
            String(
              item.status,
            ),
          reason:
            String(
              item.reason,
            ),
          requestedAt:
            new Date(
              item.requested_at,
            ).toISOString(),
          approvedAt:
            item.approved_at
              ? new Date(
                  item.approved_at,
                ).toISOString()
              : null,
          receivedAt:
            item.received_at
              ? new Date(
                  item.received_at,
                ).toISOString()
              : null,
          creditedAt:
            item.credited_at
              ? new Date(
                  item.credited_at,
                ).toISOString()
              : null,
          refundedAt:
            item.refunded_at
              ? new Date(
                  item.refunded_at,
                ).toISOString()
              : null,
          items:
            Array.isArray(
              item.items,
            )
              ? item.items.map(
                  (
                    line:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        line.id,
                      ),
                    salesOrderLineId:
                      String(
                        line.salesOrderLineId,
                      ),
                    quantity:
                      Number(
                        line.quantity ||
                        0,
                      ),
                  }),
                )
              : [],
          credits:
            Array.isArray(
              item.credits,
            )
              ? item.credits.map(
                  (
                    credit:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        credit.id,
                      ),
                    invoiceId:
                      String(
                        credit.invoiceId,
                      ),
                    creditNoteId:
                      String(
                        credit.creditNoteId,
                      ),
                    creditNoteNumber:
                      String(
                        credit.creditNoteNumber,
                      ),
                    amount:
                      money(
                        credit.amount,
                      ),
                    availableCredit:
                      money(
                        credit.availableCredit,
                      ),
                    refundedAmount:
                      money(
                        credit.refundedAmount,
                      ),
                  }),
                )
              : [],
        }),
      ),
    invoices:
      invoices.rows.map(
        item => ({
          batchId:
            String(
              item.id,
            ),
          invoiceId:
            item.invoice_id
              ? String(
                  item.invoice_id,
                )
              : null,
          sourceReference:
            String(
              item.source_reference,
            ),
          status:
            String(
              item.status,
            ),
          createdAt:
            new Date(
              item.created_at,
            ).toISOString(),
        }),
      ),
    history:
      history.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          fromStatus:
            item.from_status
              ? String(
                  item.from_status,
                )
              : null,
          toStatus:
            String(
              item.to_status,
            ),
          reason:
            item.reason
              ? String(
                  item.reason,
                )
              : null,
          createdAt:
            new Date(
              item.created_at,
            ).toISOString(),
        }),
      ),
  };
}


export async function searchSalesRecords(
  tenantId:
    string,
  companyId:
    string,
  query:
    string,
  limit =
    15,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const safeLimit =
    Math.max(
      1,
      Math.min(
        50,
        Math.floor(
          Number(
            limit,
          ) ||
          15,
        ),
      ),
    );

  const q =
    '%' +
    query
      .trim()
      .slice(
        0,
        120,
      ) +
    '%';

  const result =
    await pool.query(
      `
        SELECT *
        FROM (
          SELECT
            'quote'
              AS kind,
            q.id,
            q.quote_number
              AS number,
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
              OR COALESCE(
                   q.customer_email,
                   ''
                 ) ILIKE $2
              OR COALESCE(
                   q.reference,
                   ''
                 ) ILIKE $2
            )

          UNION ALL

          SELECT
            'order'
              AS kind,
            o.id,
            o.order_number
              AS number,
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
              OR COALESCE(
                   o.reference,
                   ''
                 ) ILIKE $2
            )
        ) records
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [
        companyId,
        q,
        safeLimit,
      ],
    );

  return result.rows.map(
    row => ({
      kind:
        String(
          row.kind,
        ),
      id:
        String(
          row.id,
        ),
      number:
        String(
          row.number,
        ),
      customerName:
        String(
          row.customer_name,
        ),
      status:
        String(
          row.status,
        ),
      totalAmount:
        money(
          row.total_amount,
        ),
      currency:
        String(
          row.currency,
        ),
    }),
  );
}
