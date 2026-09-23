import 'server-only';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';

import {
  ensureCompanyDefaults,
  hasInvoicingPermission,
  INVOICING_PERMISSIONS,
  money,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


function capabilities(
  isOwner:
    boolean,
  permissionSet:
    ReadonlySet<string>,
): InvoicingWorkspaceData[
  'capabilities'
] {
  const allowed =
    (
      permission:
        string,
    ) =>
      hasInvoicingPermission(
        isOwner,
        permissionSet,
        permission,
      );

  return {
    canView:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_VIEW,
      ),
    canCreate:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_CREATE,
      ),
    canEdit:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_EDIT,
      ),
    canConfirm:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_CONFIRM,
      ),
    canSend:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_SEND,
      ),
    canRecordPayment:
      allowed(
        INVOICING_PERMISSIONS
          .PAYMENT_RECORD,
      ),
    canCredit:
      allowed(
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ),
    canManageCustomers:
      allowed(
        INVOICING_PERMISSIONS
          .CUSTOMER_MANAGE,
      ),
    canManageCatalog:
      allowed(
        INVOICING_PERMISSIONS
          .CATALOG_MANAGE,
      ),
    canManageRecurring:
      allowed(
        INVOICING_PERMISSIONS
          .RECURRING_MANAGE,
      ),
    canViewReports:
      allowed(
        INVOICING_PERMISSIONS
          .REPORT_VIEW,
      ),
    canManageSettings:
      allowed(
        INVOICING_PERMISSIONS
          .SETTINGS_MANAGE,
      ),
  };
}


export async function getInvoicingWorkspaceData():
  Promise<InvoicingWorkspaceData> {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const [
    metrics,
    aging,
    statuses,
    monthly,
    invoices,
    customers,
    payments,
    recurring,
    paymentTerms,
    taxRates,
    catalogItems,
    settings,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            COUNT(*)::int
              AS invoice_count,
            COUNT(*) FILTER (
              WHERE effective_status =
                    'draft'
            )::int
              AS draft_count,
            COUNT(*) FILTER (
              WHERE effective_status
                    IN (
                      'sent',
                      'viewed'
                    )
            )::int
              AS sent_count,
            COUNT(*) FILTER (
              WHERE effective_status =
                    'paid'
            )::int
              AS paid_count,
            COUNT(*) FILTER (
              WHERE effective_status =
                    'overdue'
            )::int
              AS overdue_count,
            COALESCE(
              SUM(total_amount)
                FILTER (
                  WHERE effective_status
                        NOT IN (
                          'cancelled',
                          'void'
                        )
                ),
              0
            )
              AS invoiced_total,
            COALESCE(
              SUM(
                total_amount -
                balance_due
              )
                FILTER (
                  WHERE effective_status
                        NOT IN (
                          'cancelled',
                          'void'
                        )
                ),
              0
            )
              AS paid_total,
            COALESCE(
              SUM(balance_due)
                FILTER (
                  WHERE effective_status
                        NOT IN (
                          'cancelled',
                          'void',
                          'written_off'
                        )
                ),
              0
            )
              AS outstanding_total,
            COALESCE(
              SUM(balance_due)
                FILTER (
                  WHERE effective_status =
                        'overdue'
                ),
              0
            )
              AS overdue_total
          FROM invoicing_aging
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            aging_bucket,
            COUNT(*)::int
              AS count,
            COALESCE(
              SUM(balance_due),
              0
            )
              AS amount
          FROM invoicing_aging
          WHERE company_id =
                $1
            AND balance_due >
                0
            AND effective_status
                NOT IN (
                  'cancelled',
                  'void',
                  'written_off'
                )
          GROUP BY
            aging_bucket
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            effective_status
              AS status,
            COUNT(*)::int
              AS count,
            COALESCE(
              SUM(total_amount),
              0
            )
              AS amount
          FROM invoicing_aging
          WHERE company_id =
                $1
          GROUP BY
            effective_status
          ORDER BY
            count DESC,
            status ASC
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            month,
            invoice_count,
            invoiced_total
          FROM invoicing_monthly_summary
          WHERE company_id =
                $1
          ORDER BY
            month DESC
          LIMIT 12
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            a.invoice_id
              AS id,
            a.invoice_number,
            a.customer_id,
            c.name
              AS customer_name,
            c.email
              AS customer_email,
            a.effective_status
              AS status,
            a.invoice_date,
            a.due_date,
            a.currency,
            a.total_amount,
            (
              a.total_amount -
              a.balance_due
            )
              AS paid_amount,
            COALESCE(
              (
                SELECT
                  SUM(
                    cn.total_amount
                  )
                FROM invoicing_credit_notes cn
                WHERE cn.invoice_id =
                      a.invoice_id
                  AND cn.status IN (
                    'issued',
                    'applied',
                    'refunded'
                  )
                  AND cn.deleted_at
                      IS NULL
              ),
              0
            )
              AS credited_amount,
            a.balance_due,
            a.days_overdue,
            i.created_at
          FROM invoicing_aging a
          INNER JOIN invoicing_invoices i
            ON i.id =
               a.invoice_id
          INNER JOIN invoicing_customers c
            ON c.id =
               a.customer_id
          WHERE a.company_id =
                $1
          ORDER BY
            i.created_at DESC,
            i.id DESC
          LIMIT 200
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            c.id,
            c.name,
            c.contact_name,
            c.email,
            c.phone,
            c.billing_address,
            c.tax_id,
            c.currency,
            c.payment_terms_id,
            pt.name
              AS payment_terms_name,
            pt.due_days,
            c.status,
            COALESCE(
              b.invoice_count,
              0
            )::int
              AS invoice_count,
            COALESCE(
              b.invoiced_total,
              0
            )
              AS invoiced_total,
            COALESCE(
              b.paid_total,
              0
            )
              AS paid_total,
            COALESCE(
              b.outstanding_total,
              0
            )
              AS outstanding_total
          FROM invoicing_customers c
          LEFT JOIN
            invoicing_customer_balances b
            ON b.company_id =
               c.company_id
           AND b.customer_id =
               c.id
          LEFT JOIN
            invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               c.company_id
           AND pt.deleted_at
               IS NULL
          WHERE c.company_id =
                $1
            AND c.deleted_at
                IS NULL
          ORDER BY
            LOWER(
              c.name
            ) ASC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            p.id,
            p.payment_number,
            c.name
              AS customer_name,
            p.payment_date,
            p.amount,
            p.currency,
            p.method,
            p.reference,
            COALESCE(
              ARRAY_AGG(
                i.invoice_number
                ORDER BY
                  i.invoice_number
              )
                FILTER (
                  WHERE i.invoice_number
                        IS NOT NULL
                ),
              ARRAY[]::varchar[]
            )
              AS invoice_numbers
          FROM invoicing_payments p
          LEFT JOIN invoicing_customers c
            ON c.id =
               p.customer_id
          LEFT JOIN
            invoicing_payment_allocations a
            ON a.payment_id =
               p.id
          LEFT JOIN invoicing_invoices i
            ON i.id =
               a.invoice_id
          WHERE p.company_id =
                $1
            AND p.deleted_at
                IS NULL
          GROUP BY
            p.id,
            c.name
          ORDER BY
            p.payment_date DESC,
            p.created_at DESC
          LIMIT 200
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            r.id,
            r.name,
            c.name
              AS customer_name,
            r.status,
            r.interval_unit,
            r.interval_count,
            r.next_run_at,
            r.auto_send,
            r.currency
          FROM
            invoicing_recurring_templates r
          INNER JOIN invoicing_customers c
            ON c.id =
               r.customer_id
          WHERE r.company_id =
                $1
            AND r.deleted_at
                IS NULL
          ORDER BY
            r.next_run_at ASC,
            r.created_at DESC
          LIMIT 200
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            name,
            due_days,
            is_default
          FROM invoicing_payment_terms
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND is_active =
                TRUE
          ORDER BY
            is_default DESC,
            sort_order ASC,
            LOWER(name) ASC
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            name,
            rate,
            is_default
          FROM invoicing_tax_rates
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND is_active =
                TRUE
          ORDER BY
            is_default DESC,
            LOWER(name) ASC
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            item.id,
            item.item_type,
            item.name,
            item.sku,
            item.description,
            item.unit,
            item.unit_price,
            item.default_tax_rate_id,
            tax.name
              AS tax_rate_name,
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
            AND item.deleted_at
                IS NULL
            AND item.is_active =
                TRUE
          ORDER BY
            LOWER(item.name) ASC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            default_currency,
            default_due_days,
            tax_calculation,
            allow_partial_payments,
            allow_credit_notes,
            require_approval,
            auto_send_recurring,
            reminder_enabled,
            payment_instructions,
            bank_details,
            terms_and_conditions
          FROM invoicing_settings
          WHERE company_id =
                $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  const metric =
    metrics.rows[0] ||
    {};

  const setting =
    settings.rows[0] ||
    {};

  return {
    company: {
      id:
        context.company
          .currentCompany.id,
      name:
        context.company
          .currentCompany.name,
      currency:
        context.company
          .currentCompany.currency,
    },

    capabilities:
      capabilities(
        context.permissions
          .isOwner,
        context.permissions
          .permissionSet,
      ),

    metrics: {
      invoiceCount:
        Number(
          metric.invoice_count ||
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
      paidCount:
        Number(
          metric.paid_count ||
          0,
        ),
      overdueCount:
        Number(
          metric.overdue_count ||
          0,
        ),
      invoicedTotal:
        money(
          metric.invoiced_total,
        ),
      paidTotal:
        money(
          metric.paid_total,
        ),
      outstandingTotal:
        money(
          metric.outstanding_total,
        ),
      overdueTotal:
        money(
          metric.overdue_total,
        ),
    },

    aging:
      aging.rows.map(
        row => ({
          bucket:
            String(
              row.aging_bucket,
            ),
          amount:
            money(
              row.amount,
            ),
          count:
            Number(
              row.count ||
              0,
            ),
        }),
      ),

    statusCounts:
      statuses.rows.map(
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
      monthly.rows
        .map(
          row => ({
            month:
              String(
                row.month,
              ),
            invoiceCount:
              Number(
                row.invoice_count ||
                0,
              ),
            amount:
              money(
                row.invoiced_total,
              ),
          }),
        )
        .reverse(),

    invoices:
      invoices.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          invoiceNumber:
            String(
              row.invoice_number,
            ),
          customerId:
            String(
              row.customer_id,
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
          status:
            String(
              row.status,
            ),
          invoiceDate:
            String(
              row.invoice_date,
            ),
          dueDate:
            String(
              row.due_date,
            ),
          currency:
            String(
              row.currency,
            ),
          totalAmount:
            money(
              row.total_amount,
            ),
          paidAmount:
            money(
              row.paid_amount,
            ),
          creditedAmount:
            money(
              row.credited_amount,
            ),
          balanceDue:
            money(
              row.balance_due,
            ),
          daysOverdue:
            Number(
              row.days_overdue ||
              0,
            ),
          createdAt:
            row.created_at
              ? new Date(
                  row.created_at,
                ).toISOString()
              : null,
        }),
      ),

    customers:
      customers.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
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
          billingAddress:
            row.billing_address
              ? String(
                  row.billing_address,
                )
              : null,
          taxId:
            row.tax_id
              ? String(
                  row.tax_id,
                )
              : null,
          currency:
            String(
              row.currency,
            ),
          paymentTermsId:
            row.payment_terms_id
              ? String(
                  row.payment_terms_id,
                )
              : null,
          paymentTermsName:
            row.payment_terms_name
              ? String(
                  row.payment_terms_name,
                )
              : null,
          dueDays:
            row.due_days ===
              null ||
            row.due_days ===
              undefined
              ? null
              : Number(
                  row.due_days,
                ),
          status:
            String(
              row.status,
            ),
          invoiceCount:
            Number(
              row.invoice_count ||
              0,
            ),
          invoicedTotal:
            money(
              row.invoiced_total,
            ),
          paidTotal:
            money(
              row.paid_total,
            ),
          outstandingTotal:
            money(
              row.outstanding_total,
            ),
        }),
      ),

    payments:
      payments.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          paymentNumber:
            String(
              row.payment_number,
            ),
          customerName:
            row.customer_name
              ? String(
                  row.customer_name,
                )
              : null,
          paymentDate:
            String(
              row.payment_date,
            ),
          amount:
            money(
              row.amount,
            ),
          currency:
            String(
              row.currency,
            ),
          method:
            String(
              row.method,
            ),
          reference:
            row.reference
              ? String(
                  row.reference,
                )
              : null,
          invoiceNumbers:
            Array.isArray(
              row.invoice_numbers,
            )
              ? row.invoice_numbers
                  .map(
                    (
                      item:
                        unknown,
                    ) =>
                      String(
                        item,
                      ),
                  )
              : [],
        }),
      ),

    recurring:
      recurring.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          status:
            String(
              row.status,
            ),
          intervalUnit:
            String(
              row.interval_unit,
            ),
          intervalCount:
            Number(
              row.interval_count ||
              1,
            ),
          nextRunAt:
            String(
              row.next_run_at,
            ),
          autoSend:
            row.auto_send ===
            true,
          currency:
            String(
              row.currency,
            ),
        }),
      ),

    paymentTerms:
      paymentTerms.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          dueDays:
            Number(
              row.due_days ||
              0,
            ),
          isDefault:
            row.is_default ===
            true,
        }),
      ),

    taxRates:
      taxRates.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          rate:
            money(
              row.rate,
            ),
          isDefault:
            row.is_default ===
            true,
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
            row.default_tax_rate_id
              ? String(
                  row.default_tax_rate_id,
                )
              : null,
          taxRateName:
            row.tax_rate_name
              ? String(
                  row.tax_rate_name,
                )
              : null,
          taxRate:
            money(
              row.tax_rate,
            ),
        }),
      ),

    settings: {
      defaultCurrency:
        String(
          setting.default_currency ||
          context.company
            .currentCompany.currency ||
          'KES',
        ),
      defaultDueDays:
        Number(
          setting.default_due_days ||
          30,
        ),
      taxCalculation:
        String(
          setting.tax_calculation ||
          'exclusive',
        ),
      allowPartialPayments:
        setting.allow_partial_payments !==
        false,
      allowCreditNotes:
        setting.allow_credit_notes !==
        false,
      requireApproval:
        setting.require_approval ===
        true,
      autoSendRecurring:
        setting.auto_send_recurring ===
        true,
      reminderEnabled:
        setting.reminder_enabled !==
        false,
      paymentInstructions:
        setting.payment_instructions
          ? String(
              setting.payment_instructions,
            )
          : null,
      bankDetails:
        setting.bank_details
          ? String(
              setting.bank_details,
            )
          : null,
      termsAndConditions:
        setting.terms_and_conditions
          ? String(
              setting.terms_and_conditions,
            )
          : null,
    },
  };
}


export async function getInvoicingInvoiceDetail(
  invoiceIdInput:
    unknown,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const invoiceId =
    requireUuid(
      invoiceIdInput,
      'Invoice',
    );

  const [
    invoiceResult,
    linesResult,
    paymentsResult,
    creditsResult,
    historyResult,
    deliveriesResult,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            a.effective_status
              AS status,
            i.invoice_date,
            i.due_date,
            i.currency,
            i.reference,
            i.purchase_order_number,
            i.subtotal,
            i.discount_total,
            i.tax_total,
            i.shipping_total,
            i.rounding_adjustment,
            i.total_amount,
            a.balance_due,
            GREATEST(
              i.total_amount -
              a.balance_due -
              COALESCE(
                (
                  SELECT
                    SUM(
                      cn.total_amount
                    )
                  FROM invoicing_credit_notes cn
                  WHERE cn.invoice_id =
                        i.id
                    AND cn.status IN (
                      'issued',
                      'applied',
                      'refunded'
                    )
                    AND cn.deleted_at
                        IS NULL
                ),
                0
              ),
              0
            )
              AS paid_amount,
            COALESCE(
              (
                SELECT
                  SUM(
                    cn.total_amount
                  )
                FROM invoicing_credit_notes cn
                WHERE cn.invoice_id =
                      i.id
                  AND cn.status IN (
                    'issued',
                    'applied',
                    'refunded'
                  )
                  AND cn.deleted_at
                      IS NULL
              ),
              0
            )
              AS credited_amount,
            i.tax_calculation,
            i.notes,
            i.terms,
            i.payment_instructions,
            c.id
              AS customer_id,
            COALESCE(
              i.bill_to_name,
              c.name
            )
              AS customer_name,
            COALESCE(
              i.bill_to_email,
              c.email
            )
              AS customer_email,
            COALESCE(
              i.bill_to_phone,
              c.phone
            )
              AS customer_phone,
            COALESCE(
              i.bill_to_address,
              c.billing_address
            )
              AS billing_address,
            COALESCE(
              i.bill_to_tax_id,
              c.tax_id
            )
              AS tax_id,
            COALESCE(
              i.payment_terms_name_snapshot,
              pt.name
            )
              AS payment_terms_name
          FROM invoicing_invoices i
          INNER JOIN invoicing_customers c
            ON c.id =
               i.customer_id
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
          INNER JOIN invoicing_aging a
            ON a.invoice_id =
               i.id
          WHERE i.id =
                $1
            AND i.company_id =
                $2
            AND i.deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          invoiceId,
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
            tax_rate_id,
            tax_name_snapshot,
            tax_rate,
            tax_amount,
            subtotal,
            line_total
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
          invoiceId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            p.id,
            p.payment_number,
            p.payment_date,
            a.amount,
            p.method,
            p.reference
          FROM invoicing_payment_allocations a
          INNER JOIN invoicing_payments p
            ON p.id =
               a.payment_id
          WHERE a.invoice_id =
                $1
            AND a.company_id =
                $2
            AND p.status =
                'posted'
            AND p.deleted_at
                IS NULL
          ORDER BY
            p.payment_date DESC,
            p.created_at DESC
        `,
        [
          invoiceId,
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            credit_note_number,
            issue_date,
            status,
            total_amount,
            reason
          FROM invoicing_credit_notes
          WHERE invoice_id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          ORDER BY
            issue_date DESC,
            created_at DESC
        `,
        [
          invoiceId,
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
          FROM invoicing_status_history
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT 100
        `,
        [
          invoiceId,
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
          FROM invoicing_delivery_log
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT 100
        `,
        [
          invoiceId,
          context.companyId,
        ],
      ),
    ]);

  if (
    invoiceResult.rows.length !==
      1
  ) {
    return null;
  }

  const row =
    invoiceResult.rows[0];

  return {
    id:
      String(
        row.id,
      ),
    invoiceNumber:
      String(
        row.invoice_number,
      ),
    status:
      String(
        row.status,
      ),
    invoiceDate:
      String(
        row.invoice_date,
      ),
    dueDate:
      String(
        row.due_date,
      ),
    currency:
      String(
        row.currency,
      ),
    reference:
      row.reference
        ? String(
            row.reference,
          )
        : null,
    purchaseOrderNumber:
      row.purchase_order_number
        ? String(
            row.purchase_order_number,
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
    roundingAdjustment:
      money(
        row.rounding_adjustment,
      ),
    totalAmount:
      money(
        row.total_amount,
      ),
    paidAmount:
      money(
        row.paid_amount,
      ),
    creditedAmount:
      money(
        row.credited_amount,
      ),
    balanceDue:
      money(
        row.balance_due,
      ),
    taxCalculation:
      row.tax_calculation ===
        'inclusive'
        ? 'inclusive' as const
        : 'exclusive' as const,
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
    paymentInstructions:
      row.payment_instructions
        ? String(
            row.payment_instructions,
          )
        : null,
    customer: {
      id:
        String(
          row.customer_id,
        ),
      name:
        String(
          row.customer_name,
        ),
      email:
        row.customer_email
          ? String(
              row.customer_email,
            )
          : null,
      phone:
        row.customer_phone
          ? String(
              row.customer_phone,
            )
          : null,
      billingAddress:
        row.billing_address
          ? String(
              row.billing_address,
            )
          : null,
      taxId:
        row.tax_id
          ? String(
              row.tax_id,
            )
          : null,
      paymentTermsName:
        row.payment_terms_name
          ? String(
              row.payment_terms_name,
            )
          : null,
    },
    lines:
      linesResult.rows.map(
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
              ? 'fixed' as const
              : 'percent' as const,
          discountValue:
            money(
              line.discount_value,
            ),
          discountAmount:
            money(
              line.discount_amount,
            ),
          taxRateId:
            line.tax_rate_id
              ? String(
                  line.tax_rate_id,
                )
              : null,
          taxName:
            line.tax_name_snapshot
              ? String(
                  line.tax_name_snapshot,
                )
              : null,
          taxRate:
            money(
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
    payments:
      paymentsResult.rows.map(
        payment => ({
          id:
            String(
              payment.id,
            ),
          paymentNumber:
            String(
              payment.payment_number,
            ),
          paymentDate:
            String(
              payment.payment_date,
            ),
          amount:
            money(
              payment.amount,
            ),
          method:
            String(
              payment.method,
            ),
          reference:
            payment.reference
              ? String(
                  payment.reference,
                )
              : null,
        }),
      ),
    creditNotes:
      creditsResult.rows.map(
        credit => ({
          id:
            String(
              credit.id,
            ),
          creditNoteNumber:
            String(
              credit.credit_note_number,
            ),
          issueDate:
            String(
              credit.issue_date,
            ),
          status:
            String(
              credit.status,
            ),
          amount:
            money(
              credit.total_amount,
            ),
          reason:
            String(
              credit.reason,
            ),
        }),
      ),
    history:
      historyResult.rows.map(
        history => ({
          id:
            String(
              history.id,
            ),
          fromStatus:
            history.from_status
              ? String(
                  history.from_status,
                )
              : null,
          toStatus:
            String(
              history.to_status,
            ),
          reason:
            history.reason
              ? String(
                  history.reason,
                )
              : null,
          createdAt:
            new Date(
              history.created_at,
            ).toISOString(),
        }),
      ),
    deliveries:
      deliveriesResult.rows.map(
        delivery => ({
          id:
            String(
              delivery.id,
            ),
          channel:
            String(
              delivery.channel,
            ),
          provider:
            delivery.provider
              ? String(
                  delivery.provider,
                )
              : null,
          status:
            String(
              delivery.status,
            ),
          errorCode:
            delivery.error_code
              ? String(
                  delivery.error_code,
                )
              : null,
          createdAt:
            new Date(
              delivery.created_at,
            ).toISOString(),
        }),
      ),
  };
}


export async function searchInvoicingRecords(
  tenantId:
    string,
  companyId:
    string,
  query:
    string,
  limit =
    12,
) {
  const normalized =
    query
      .trim()
      .slice(
        0,
        120,
      );

  if (
    !normalized
  ) {
    return [];
  }

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT *
        FROM (
          SELECT
            'invoice'::text
              AS kind,
            i.id,
            i.invoice_number
              AS title,
            c.name
              AS subtitle,
            i.status
              AS badge,
            i.total_amount,
            i.currency,
            i.created_at
          FROM invoicing_invoices i
          INNER JOIN invoicing_customers c
            ON c.id =
               i.customer_id
          WHERE i.company_id =
                $1
            AND i.deleted_at
                IS NULL
            AND (
              i.invoice_number
                ILIKE $2
              OR COALESCE(
                   i.reference,
                   ''
                 )
                   ILIKE $2
              OR COALESCE(
                   i.purchase_order_number,
                   ''
                 )
                   ILIKE $2
              OR c.name
                   ILIKE $2
            )

          UNION ALL

          SELECT
            'customer'::text
              AS kind,
            c.id,
            c.name
              AS title,
            COALESCE(
              c.email,
              c.phone,
              ''
            )
              AS subtitle,
            c.status
              AS badge,
            0::numeric
              AS total_amount,
            c.currency,
            c.created_at
          FROM invoicing_customers c
          WHERE c.company_id =
                $1
            AND c.deleted_at
                IS NULL
            AND (
              c.name
                ILIKE $2
              OR COALESCE(
                   c.email,
                   ''
                 )
                   ILIKE $2
              OR COALESCE(
                   c.phone,
                   ''
                 )
                   ILIKE $2
              OR COALESCE(
                   c.tax_id,
                   ''
                 )
                   ILIKE $2
            )
        ) records
        ORDER BY
          created_at DESC
        LIMIT $3
      `,
      [
        companyId,
        '%' +
        normalized +
        '%',
        Math.max(
          1,
          Math.min(
            30,
            limit,
          ),
        ),
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
      title:
        String(
          row.title,
        ),
      subtitle:
        row.subtitle
          ? String(
              row.subtitle,
            )
          : null,
      badge:
        row.badge
          ? String(
              row.badge,
            )
          : null,
      amount:
        money(
          row.total_amount,
        ),
      currency:
        String(
          row.currency ||
          '',
        ),
    }),
  );
}
