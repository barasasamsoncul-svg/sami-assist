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
    canUseBillingCustomers:
      crossCan(
        INVOICING_CUSTOMER_VIEW,
        INVOICING_CUSTOMER_MANAGE,
      ),
    canUseCatalog:
      crossCan(
        INVOICING_CATALOG_VIEW,
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
                name,
                email,
                phone,
                tax_id,
                billing_address,
                shipping_address,
                currency
              FROM invoicing_customers
              WHERE company_id = $1
                AND status = 'active'
                AND deleted_at IS NULL
              ORDER BY
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
                item.name,
                item.sku,
                item.description,
                item.unit,
                item.unit_price,
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
          name:
            String(
              row.name,
            ),
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
              companyRow.currency ||
              'KES',
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
            notes,
            terms,
            internal_notes,
            sales_order_id,
            latest_invoice_id,
            sent_at,
            viewed_at,
            accepted_at,
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
