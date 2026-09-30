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


function dateOnlyValue(
  value:
    unknown,
) {
  if (
    value instanceof
      Date
  ) {
    return Number.isNaN(
      value.getTime(),
    )
      ? ''
      : value
          .toISOString()
          .slice(
            0,
            10,
          );
  }

  const text =
    String(
      value ||
      '',
    )
      .trim();

  if (
    /^\d{4}-\d{2}-\d{2}/.test(
      text,
    )
  ) {
    return text.slice(
      0,
      10,
    );
  }

  const parsed =
    new Date(
      text,
    );

  return Number.isNaN(
    parsed.getTime(),
  )
    ? ''
    : parsed
        .toISOString()
        .slice(
          0,
          10,
        );
}


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

  const canViewCustomers =
    allowed(
      INVOICING_PERMISSIONS
        .CUSTOMER_VIEW,
    ) ||
    allowed(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const canViewCatalog =
    allowed(
      INVOICING_PERMISSIONS
        .CATALOG_VIEW,
    ) ||
    allowed(
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  const canViewPayments =
    allowed(
      INVOICING_PERMISSIONS
        .PAYMENT_VIEW,
    ) ||
    allowed(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
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
      ) &&
      canViewCustomers,
    canEdit:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_EDIT,
      ) &&
      canViewCustomers,
    canConfirm:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_CONFIRM,
      ),
    canCancel:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_CANCEL,
      ),
    canSend:
      allowed(
        INVOICING_PERMISSIONS
          .INVOICE_SEND,
      ),
    canViewPayments,
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
    canViewCustomers,
    canManageCustomers:
      allowed(
        INVOICING_PERMISSIONS
          .CUSTOMER_MANAGE,
      ),
    canViewCatalog,
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

  const access =
    capabilities(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
    );

  const [
    metrics,
    aging,
    statuses,
    monthly,
    invoices,
    customers,
    payments,
    retainers,
    paymentPlans,
    recurring,
    templates,
    paymentTerms,
    taxRates,
    catalogItems,
    dunningPolicies,
    reminders,
    portalAccess,
    portalMessages,
    currencies,
    exchangeRates,
    currencyExposure,
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
              SUM(base_total_amount)
                FILTER (
                  WHERE effective_status
                        NOT IN (
                          'draft',
                          'pending_approval',
                          'rejected',
                          'cancelled',
                          'void'
                        )
                ),
              0
            )
              AS invoiced_total,
            COALESCE(
              SUM(
                base_total_amount -
                base_balance_due
              )
                FILTER (
                  WHERE effective_status
                        NOT IN (
                          'draft',
                          'pending_approval',
                          'rejected',
                          'cancelled',
                          'void'
                        )
                ),
              0
            )
              AS paid_total,
            COALESCE(
              SUM(base_balance_due)
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
              SUM(base_balance_due)
                FILTER (
                  WHERE effective_status =
                        'overdue'
                ),
              0
            )
              AS overdue_total
          FROM invoicing_aging_base
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
              SUM(base_balance_due),
              0
            )
              AS amount
          FROM invoicing_aging_base
          WHERE company_id =
                $1
            AND base_balance_due >
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
              SUM(base_total_amount),
              0
            )
              AS amount
          FROM invoicing_aging_base
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
            TO_CHAR(
              DATE_TRUNC(
                'month',
                invoice_date
              ),
              'YYYY-MM'
            ) AS month,
            COUNT(*)::int
              AS invoice_count,
            COALESCE(
              SUM(base_total_amount),
              0
            ) AS invoiced_total
          FROM invoicing_aging_base
          WHERE company_id =
                $1
          GROUP BY
            DATE_TRUNC(
              'month',
              invoice_date
            )
          ORDER BY
            DATE_TRUNC(
              'month',
              invoice_date
            ) DESC
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
            a.effective_status
              AS status,
            a.invoice_date,
            a.due_date,
            a.currency,
            a.total_amount,
            COALESCE(
              (
                SELECT
                  SUM(
                    COALESCE(
                      allocation.invoice_amount,
                      allocation.amount
                    )
                  )
                FROM invoicing_payment_allocations allocation
                INNER JOIN invoicing_payments payment
                  ON payment.id =
                     allocation.payment_id
                 AND payment.company_id =
                     allocation.company_id
                WHERE allocation.invoice_id =
                      a.invoice_id
                  AND allocation.company_id =
                      a.company_id
                  AND allocation.status =
                      'posted'
                  AND payment.status =
                      'posted'
                  AND payment.deleted_at
                      IS NULL
              ),
              0
            )
              AS paid_amount,
            COALESCE(
              (
                SELECT
                  SUM(
                    application.amount
                  )
                FROM invoicing_credit_note_applications application
                INNER JOIN invoicing_credit_notes note
                  ON note.id =
                     application.credit_note_id
                 AND note.company_id =
                     application.company_id
                WHERE application.target_invoice_id =
                      a.invoice_id
                  AND application.company_id =
                      a.company_id
                  AND application.status =
                      'posted'
                  AND note.status <>
                      'cancelled'
                  AND note.deleted_at
                      IS NULL
              ),
              0
            )
              AS credited_amount,
            COALESCE(
              (
                SELECT
                  available_credit
                FROM invoicing_customer_credit_balances credit_balance
                WHERE credit_balance.company_id =
                      a.company_id
                  AND credit_balance.customer_id =
                      a.customer_id
                  AND credit_balance.currency =
                      a.currency
                LIMIT 1
              ),
              0
            )
              AS customer_available_credit,
            a.balance_due,
            a.days_overdue,
            i.reminder_mode,
            i.reminder_pause_until,
            i.reminder_pause_reason,
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
            c.customer_type,
            c.name,
            c.legal_name,
            c.contact_name,
            c.email,
            c.phone,
            c.billing_address,
            c.shipping_address,
            c.city,
            c.state,
            c.postal_code,
            c.country,
            c.country_code,
            c.tax_id,
            c.registration_number,
            c.currency,
            c.payment_terms_id,
            c.credit_limit,
            c.reminder_mode,
            c.reminder_pause_until,
            c.reminder_pause_reason,
            c.notes,
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
            p.status,
            p.customer_id,
            c.name
              AS customer_name,
            p.payment_date,
            p.amount,
            p.currency,
            p.exchange_rate,
            p.method,
            p.reference,
            b.allocated_amount,
            b.refunded_amount,
            b.unapplied_amount,
            p.reconciled_at,
            p.reconciliation_reference,
            p.reconciliation_notes,
            COALESCE(
              (
                SELECT ARRAY_AGG(
                  i.invoice_number
                  ORDER BY
                    i.invoice_number
                )
                FROM invoicing_payment_allocations a
                INNER JOIN invoicing_invoices i
                  ON i.id = a.invoice_id
                 AND i.company_id = a.company_id
                WHERE a.payment_id = p.id
                  AND a.company_id = p.company_id
                  AND a.status = 'posted'
              ),
              ARRAY[]::varchar[]
            )
              AS invoice_numbers,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', a.id,
                    'invoiceId', a.invoice_id,
                    'invoiceNumber', i.invoice_number,
                    'amount', a.amount,
                    'status', a.status,
                    'operationKey', a.operation_key
                  )
                  ORDER BY
                    a.created_at,
                    a.id
                )
                FROM invoicing_payment_allocations a
                INNER JOIN invoicing_invoices i
                  ON i.id = a.invoice_id
                 AND i.company_id = a.company_id
                WHERE a.payment_id = p.id
                  AND a.company_id = p.company_id
              ),
              '[]'::jsonb
            )
              AS allocations,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', r.id,
                    'refundNumber', r.refund_number,
                    'refundDate', r.refund_date,
                    'amount', r.amount,
                    'status', r.status,
                    'reason', r.reason
                  )
                  ORDER BY
                    r.refund_date,
                    r.id
                )
                FROM invoicing_payment_refunds r
                WHERE r.payment_id = p.id
                  AND r.company_id = p.company_id
              ),
              '[]'::jsonb
            )
              AS refunds
          FROM invoicing_payments p
          LEFT JOIN invoicing_customers c
            ON c.id = p.customer_id
           AND c.company_id = p.company_id
          INNER JOIN invoicing_payment_balances b
            ON b.payment_id = p.id
           AND b.company_id = p.company_id
          WHERE p.company_id = $1
            AND p.deleted_at IS NULL
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
            b.retainer_id,
            b.retainer_number,
            b.retainer_type,
            b.customer_id,
            customer.name
              AS customer_name,
            b.payment_id,
            b.payment_number,
            b.received_date,
            b.amount,
            b.currency,
            b.exchange_rate,
            b.method,
            b.reference,
            b.purpose,
            b.expected_use_date,
            b.effective_status,
            b.allocated_amount,
            b.refunded_amount,
            b.available_amount,
            b.reconciled_at,
            b.created_at,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', allocation.id,
                    'invoiceId', allocation.invoice_id,
                    'invoiceNumber', invoice.invoice_number,
                    'amount', allocation.amount,
                    'status', allocation.status,
                    'operationKey', allocation.operation_key
                  )
                  ORDER BY
                    allocation.created_at,
                    allocation.id
                )
                FROM invoicing_payment_allocations allocation
                INNER JOIN invoicing_invoices invoice
                  ON invoice.id = allocation.invoice_id
                 AND invoice.company_id = allocation.company_id
                WHERE allocation.payment_id = b.payment_id
                  AND allocation.company_id = b.company_id
              ),
              '[]'::jsonb
            ) AS allocations,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', refund.id,
                    'refundNumber', refund.refund_number,
                    'refundDate', refund.refund_date,
                    'amount', refund.amount,
                    'status', refund.status,
                    'reason', refund.reason
                  )
                  ORDER BY
                    refund.refund_date,
                    refund.id
                )
                FROM invoicing_payment_refunds refund
                WHERE refund.payment_id = b.payment_id
                  AND refund.company_id = b.company_id
              ),
              '[]'::jsonb
            ) AS refunds
          FROM invoicing_retainer_balances b
          INNER JOIN invoicing_customers customer
            ON customer.id = b.customer_id
           AND customer.company_id = b.company_id
          WHERE b.company_id = $1
          ORDER BY
            b.received_date DESC,
            b.created_at DESC,
            b.retainer_id DESC
          LIMIT 300
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            plan.plan_id,
            plan.plan_number,
            plan.invoice_id,
            invoice.invoice_number,
            plan.customer_id,
            customer.name
              AS customer_name,
            plan.name,
            plan.effective_status,
            plan.currency,
            plan.original_due_date,
            plan.final_due_date,
            plan.total_amount,
            plan.paid_amount,
            plan.balance_due,
            plan.installment_count,
            plan.paid_installments,
            plan.overdue_installments,
            plan.next_due_date,
            plan.notes,
            plan.activated_at,
            plan.cancelled_at,
            plan.cancellation_reason,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', installment.id,
                    'sequenceNo', installment.sequence_no,
                    'label', installment.label,
                    'dueDate', installment.due_date,
                    'amount', installment.amount,
                    'paidAmount', installment.paid_amount,
                    'balanceDue', installment.balance_due,
                    'status', installment.effective_status
                  )
                  ORDER BY
                    installment.sequence_no
                )
                FROM invoicing_payment_plan_installment_balances installment
                WHERE installment.plan_id =
                      plan.plan_id
                  AND installment.company_id =
                      plan.company_id
              ),
              '[]'::jsonb
            )
              AS installments
          FROM invoicing_payment_plan_balances plan
          INNER JOIN invoicing_invoices invoice
            ON invoice.id =
               plan.invoice_id
           AND invoice.company_id =
               plan.company_id
          INNER JOIN invoicing_customers customer
            ON customer.id =
               plan.customer_id
           AND customer.company_id =
               plan.company_id
          WHERE plan.company_id =
                $1
          ORDER BY
            CASE
              WHEN plan.effective_status =
                   'overdue'
              THEN 0
              WHEN plan.effective_status =
                   'active'
              THEN 1
              ELSE 2
            END,
            plan.next_due_date NULLS LAST,
            plan.activated_at DESC
          LIMIT 300
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
            r.source_invoice_id,
            source.invoice_number
              AS source_invoice_number,
            r.status,
            r.interval_unit,
            r.interval_count,
            r.start_date,
            r.end_date,
            r.next_run_at,
            r.max_occurrences,
            r.run_count,
            r.consecutive_failures,
            r.max_retry_attempts,
            r.last_invoice_id,
            last_invoice.invoice_number
              AS last_invoice_number,
            r.last_run_at,
            r.last_success_at,
            r.last_failure_at,
            r.retry_after,
            r.last_error_code,
            r.last_error_message,
            r.completion_reason,
            r.auto_send,
            r.invoice_payload,
            r.currency,
            COALESCE(
              (
                SELECT
                  jsonb_agg(
                    to_jsonb(recent_run)
                  )
                FROM (
                  SELECT
                    rr.id,
                    rr.scheduled_for
                      AS "scheduledFor",
                    rr.status,
                    rr.attempt_count
                      AS "attemptCount",
                    rr.invoice_id
                      AS "invoiceId",
                    generated.invoice_number
                      AS "invoiceNumber",
                    rr.delivery_status
                      AS "deliveryStatus",
                    rr.delivery_error_code
                      AS "deliveryErrorCode",
                    rr.started_at
                      AS "startedAt",
                    rr.last_attempt_at
                      AS "lastAttemptAt",
                    rr.completed_at
                      AS "completedAt",
                    rr.error_code
                      AS "errorCode",
                    rr.error_message
                      AS "errorMessage"
                  FROM
                    invoicing_recurring_runs rr
                  LEFT JOIN
                    invoicing_invoices generated
                    ON generated.id =
                       rr.invoice_id
                   AND generated.company_id =
                       rr.company_id
                  WHERE
                    rr.recurring_template_id =
                      r.id
                    AND rr.company_id =
                      r.company_id
                  ORDER BY
                    rr.scheduled_for DESC,
                    rr.created_at DESC
                  LIMIT 12
                ) recent_run
              ),
              '[]'::jsonb
            )
              AS recent_runs
          FROM
            invoicing_recurring_templates r
          INNER JOIN invoicing_customers c
            ON c.id =
               r.customer_id
          LEFT JOIN invoicing_invoices source
            ON source.id =
               r.source_invoice_id
          LEFT JOIN invoicing_invoices last_invoice
            ON last_invoice.id =
               r.last_invoice_id
           AND last_invoice.company_id =
               r.company_id
          WHERE r.company_id =
                $1
            AND r.deleted_at
                IS NULL
          ORDER BY
            CASE
              WHEN r.status =
                   'active'
              THEN 0
              WHEN r.status =
                   'paused'
              THEN 1
              ELSE 2
            END,
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
            is_default,
            layout,
            primary_color,
            secondary_color,
            accent_color,
            logo_url,
            font_family,
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
            terms_text
          FROM invoicing_templates
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
            id,
            name,
            description,
            due_days,
            is_default,
            is_active
          FROM invoicing_payment_terms
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
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
            tax_type,
            country_code,
            is_default,
            is_active
          FROM invoicing_tax_rates
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
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
            item.is_active,
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
            p.id,
            p.name,
            p.is_default,
            p.is_active,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id',
                  s.id,
                  'stageKey',
                  s.stage_key,
                  'name',
                  s.name,
                  'sequenceNo',
                  s.sequence_no,
                  'offsetDays',
                  s.offset_days,
                  'severity',
                  s.severity,
                  'channels',
                  s.channels,
                  'autoSend',
                  s.auto_send,
                  'retryLimit',
                  s.retry_limit,
                  'retryDelayMinutes',
                  s.retry_delay_minutes,
                  'subjectTemplate',
                  s.subject_template,
                  'messageTemplate',
                  s.message_template
                )
                ORDER BY
                  s.sequence_no
              )
                FILTER (
                  WHERE s.id
                        IS NOT NULL
                ),
              '[]'::jsonb
            )
              AS stages
          FROM invoicing_dunning_policies p
          LEFT JOIN invoicing_dunning_stages s
            ON s.policy_id =
               p.id
           AND s.company_id =
               p.company_id
           AND s.deleted_at
               IS NULL
          WHERE p.company_id =
                $1
            AND p.deleted_at
                IS NULL
          GROUP BY
            p.id
          ORDER BY
            p.is_default DESC,
            LOWER(p.name)
          LIMIT 50
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            r.id,
            r.invoice_id,
            i.invoice_number,
            COALESCE(
              i.bill_to_name,
              c.name
            )
              AS customer_name,
            r.dunning_policy_id,
            r.dunning_stage_id,
            COALESCE(
              stage.name,
              r.reminder_type
            )
              AS stage_name,
            COALESCE(
              stage.severity,
              'friendly'
            )
              AS severity,
            r.reminder_type,
            r.channel,
            r.source,
            r.status,
            r.attempt_count,
            r.max_attempts,
            r.scheduled_for,
            r.last_attempt_at,
            r.next_attempt_at,
            r.sent_at,
            r.completed_at,
            r.failure_code,
            r.failure_message,
            r.created_at
          FROM invoicing_reminders r
          INNER JOIN invoicing_invoices i
            ON i.id =
               r.invoice_id
           AND i.company_id =
               r.company_id
          INNER JOIN invoicing_customers c
            ON c.id =
               i.customer_id
          LEFT JOIN invoicing_dunning_stages stage
            ON stage.id =
               r.dunning_stage_id
          WHERE r.company_id =
                $1
          ORDER BY
            r.created_at DESC,
            r.id DESC
          LIMIT 300
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            access.id,
            access.customer_id,
            customer.name
              AS customer_name,
            customer.email
              AS customer_email,
            CASE
              WHEN access.status =
                   'active'
               AND access.expires_at <=
                   NOW()
              THEN 'expired'
              ELSE access.status
            END
              AS effective_status,
            access.expires_at,
            access.last_used_at,
            access.created_at
          FROM invoicing_portal_access access
          INNER JOIN invoicing_customers customer
            ON customer.id =
               access.customer_id
           AND customer.company_id =
               access.company_id
           AND customer.deleted_at
               IS NULL
          WHERE access.company_id =
                $1
          ORDER BY
            CASE
              WHEN access.status =
                   'active'
               AND access.expires_at >
                   NOW()
              THEN 0
              ELSE 1
            END,
            access.created_at DESC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            message.id,
            message.customer_id,
            customer.name
              AS customer_name,
            customer.email
              AS customer_email,
            message.invoice_id,
            invoice.invoice_number,
            message.direction,
            message.category,
            message.subject,
            message.body,
            message.promised_amount,
            message.promised_date,
            message.status,
            message.created_at
          FROM invoicing_portal_messages message
          INNER JOIN invoicing_customers customer
            ON customer.id =
               message.customer_id
           AND customer.company_id =
               message.company_id
          LEFT JOIN invoicing_invoices invoice
            ON invoice.id =
               message.invoice_id
           AND invoice.company_id =
               message.company_id
          WHERE message.company_id =
                $1
          ORDER BY
            message.created_at DESC,
            message.id DESC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            code,
            name,
            symbol,
            decimal_places,
            is_active,
            is_base
          FROM invoicing_currencies
          WHERE company_id =
                $1
          ORDER BY
            is_base DESC,
            is_active DESC,
            code ASC
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            id,
            currency,
            base_currency,
            rate_to_base,
            effective_date,
            source_type,
            source_name,
            note
          FROM invoicing_exchange_rates
          WHERE company_id =
                $1
            AND is_active =
                TRUE
          ORDER BY
            effective_date DESC,
            currency ASC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            currency,
            base_currency,
            open_invoice_count,
            invoiced_amount,
            open_amount,
            invoiced_base_amount,
            open_base_amount
          FROM invoicing_currency_exposure
          WHERE company_id =
                $1
          ORDER BY
            open_base_amount DESC,
            currency ASC
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            default_currency,
            base_currency,
            exchange_rate_mode,
            allow_cross_currency_payments,
            default_due_days,
            default_template_id,
            tax_calculation,
            allow_partial_payments,
            allow_credit_notes,
            require_approval,
            auto_send_recurring,
            reminder_enabled,
            reminder_channels,
            reminder_days_before,
            reminder_days_after,
            portal_enabled,
            portal_access_days,
            portal_allow_messages,
            portal_show_payment_history,
            portal_show_credit_notes,
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
      access,

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
      access.canViewReports
        ? aging.rows.map(
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
      )
        : [],

    statusCounts:
      access.canViewReports
        ? statuses.rows.map(
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
      )
        : [],

    monthly:
      access.canViewReports
        ? monthly.rows
        .map(
          row => ({
            month:
              dateOnlyValue(
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
        .reverse()
        : [],

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
          customerAvailableCredit:
            money(
              row.customer_available_credit,
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
          reminderMode:
            String(
              row.reminder_mode ||
              'inherit',
            ),
          reminderPauseUntil:
            row.reminder_pause_until
              ? String(
                  row.reminder_pause_until,
                )
              : null,
          reminderPauseReason:
            row.reminder_pause_reason
              ? String(
                  row.reminder_pause_reason,
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

    customers:
      access.canViewCustomers
        ? customers.rows.map(
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
          creditLimit:
            row.credit_limit ===
              null ||
            row.credit_limit ===
              undefined
              ? null
              : money(
                  row.credit_limit,
                ),
          reminderMode:
            String(
              row.reminder_mode ||
              'inherit',
            ),
          reminderPauseUntil:
            row.reminder_pause_until
              ? String(
                  row.reminder_pause_until,
                )
              : null,
          reminderPauseReason:
            row.reminder_pause_reason
              ? String(
                  row.reminder_pause_reason,
                )
              : null,
          notes:
            row.notes
              ? String(
                  row.notes,
                )
              : null,
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
      )
        : [],

    payments:
      access.canViewPayments
        ? payments.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          paymentNumber:
            String(
              row.payment_number,
            ),
          status:
            String(
              row.status,
            ),
          customerId:
            row.customer_id
              ? String(
                  row.customer_id,
                )
              : null,
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
          exchangeRate:
            Number(
              row.exchange_rate ||
              1,
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
          allocatedAmount:
            money(
              row.allocated_amount,
            ),
          refundedAmount:
            money(
              row.refunded_amount,
            ),
          unappliedAmount:
            money(
              row.unapplied_amount,
            ),
          reconciledAt:
            row.reconciled_at
              ? new Date(
                  row.reconciled_at,
                ).toISOString()
              : null,
          reconciliationReference:
            row.reconciliation_reference
              ? String(
                  row.reconciliation_reference,
                )
              : null,
          reconciliationNotes:
            row.reconciliation_notes
              ? String(
                  row.reconciliation_notes,
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
          allocations:
            Array.isArray(
              row.allocations,
            )
              ? row.allocations.map(
                  (
                    item:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        item.id,
                      ),
                    invoiceId:
                      String(
                        item.invoiceId,
                      ),
                    invoiceNumber:
                      String(
                        item.invoiceNumber,
                      ),
                    amount:
                      money(
                        item.amount,
                      ),
                    status:
                      String(
                        item.status,
                      ),
                    operationKey:
                      item.operationKey
                        ? String(
                            item.operationKey,
                          )
                        : null,
                  }),
                )
              : [],
          refunds:
            Array.isArray(
              row.refunds,
            )
              ? row.refunds.map(
                  (
                    item:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        item.id,
                      ),
                    refundNumber:
                      String(
                        item.refundNumber,
                      ),
                    refundDate:
                      String(
                        item.refundDate,
                      ),
                    amount:
                      money(
                        item.amount,
                      ),
                    status:
                      String(
                        item.status,
                      ),
                    reason:
                      String(
                        item.reason,
                      ),
                  }),
                )
              : [],
        }),
      )
        : [],

    retainers:
      access.canViewPayments
        ? retainers.rows.map(
            row => ({
              id: String(row.retainer_id),
              retainerNumber: String(row.retainer_number),
              retainerType: String(row.retainer_type),
              customerId: String(row.customer_id),
              customerName: String(row.customer_name),
              paymentId: String(row.payment_id),
              paymentNumber: String(row.payment_number),
              receivedDate: String(row.received_date),
              amount: money(row.amount),
              currency: String(row.currency),
              exchangeRate: Number(row.exchange_rate || 1),
              method: String(row.method),
              reference: row.reference ? String(row.reference) : null,
              purpose: row.purpose ? String(row.purpose) : null,
              expectedUseDate: row.expected_use_date
                ? String(row.expected_use_date)
                : null,
              status: String(row.effective_status),
              allocatedAmount: money(row.allocated_amount),
              refundedAmount: money(row.refunded_amount),
              availableAmount: money(row.available_amount),
              reconciledAt: row.reconciled_at
                ? new Date(row.reconciled_at).toISOString()
                : null,
              createdAt: new Date(row.created_at).toISOString(),
              allocations: Array.isArray(row.allocations)
                ? row.allocations.map(
                    (
                      item:
                        Record<string, unknown>,
                    ) => ({
                      id: String(item.id),
                      invoiceId: String(item.invoiceId),
                      invoiceNumber: String(item.invoiceNumber),
                      amount: money(item.amount),
                      status: String(item.status),
                      operationKey: item.operationKey
                        ? String(item.operationKey)
                        : null,
                    }),
                  )
                : [],
              refunds: Array.isArray(row.refunds)
                ? row.refunds.map(
                    (
                      item:
                        Record<string, unknown>,
                    ) => ({
                      id: String(item.id),
                      refundNumber: String(item.refundNumber),
                      refundDate: String(item.refundDate),
                      amount: money(item.amount),
                      status: String(item.status),
                      reason: String(item.reason),
                    }),
                  )
                : [],
            }),
          )
        : [],

    paymentPlans:
      access.canViewPayments
        ? paymentPlans.rows.map(
            row => ({
              id:
                String(
                  row.plan_id,
                ),
              planNumber:
                String(
                  row.plan_number,
                ),
              invoiceId:
                String(
                  row.invoice_id,
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
              name:
                String(
                  row.name,
                ),
              status:
                String(
                  row.effective_status,
                ),
              currency:
                String(
                  row.currency,
                ),
              originalDueDate:
                String(
                  row.original_due_date,
                ),
              finalDueDate:
                String(
                  row.final_due_date,
                ),
              totalAmount:
                money(
                  row.total_amount,
                ),
              paidAmount:
                money(
                  row.paid_amount,
                ),
              balanceDue:
                money(
                  row.balance_due,
                ),
              installmentCount:
                Number(
                  row.installment_count,
                ),
              paidInstallments:
                Number(
                  row.paid_installments ||
                  0,
                ),
              overdueInstallments:
                Number(
                  row.overdue_installments ||
                  0,
                ),
              nextDueDate:
                row.next_due_date
                  ? String(
                      row.next_due_date,
                    )
                  : null,
              notes:
                row.notes
                  ? String(
                      row.notes,
                    )
                  : null,
              activatedAt:
                new Date(
                  row.activated_at,
                ).toISOString(),
              cancelledAt:
                row.cancelled_at
                  ? new Date(
                      row.cancelled_at,
                    ).toISOString()
                  : null,
              cancellationReason:
                row.cancellation_reason
                  ? String(
                      row.cancellation_reason,
                    )
                  : null,
              installments:
                Array.isArray(
                  row.installments,
                )
                  ? row.installments.map(
                      (
                        item:
                          Record<
                            string,
                            unknown
                          >,
                      ) => ({
                        id:
                          String(
                            item.id,
                          ),
                        sequenceNo:
                          Number(
                            item.sequenceNo,
                          ),
                        label:
                          item.label
                            ? String(
                                item.label,
                              )
                            : null,
                        dueDate:
                          String(
                            item.dueDate,
                          ),
                        amount:
                          money(
                            item.amount,
                          ),
                        paidAmount:
                          money(
                            item.paidAmount,
                          ),
                        balanceDue:
                          money(
                            item.balanceDue,
                          ),
                        status:
                          String(
                            item.status,
                          ),
                      }),
                    )
                  : [],
            }),
          )
        : [],

    recurring:
      access.canManageRecurring
        ? recurring.rows.map(
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
          sourceInvoiceId:
            row.source_invoice_id
              ? String(
                  row.source_invoice_id,
                )
              : null,
          sourceInvoiceNumber:
            row.source_invoice_number
              ? String(
                  row.source_invoice_number,
                )
              : null,
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
          startDate:
            String(
              row.start_date,
            ),
          endDate:
            row.end_date
              ? String(
                  row.end_date,
                )
              : null,
          nextRunAt:
            String(
              row.next_run_at,
            ),
          maxOccurrences:
            row.max_occurrences ===
              null ||
            row.max_occurrences ===
              undefined
              ? null
              : Number(
                  row.max_occurrences,
                ),
          runCount:
            Number(
              row.run_count ||
              0,
            ),
          consecutiveFailures:
            Number(
              row.consecutive_failures ||
              0,
            ),
          maxRetryAttempts:
            Number(
              row.max_retry_attempts ||
              3,
            ),
          lastInvoiceId:
            row.last_invoice_id
              ? String(
                  row.last_invoice_id,
                )
              : null,
          lastInvoiceNumber:
            row.last_invoice_number
              ? String(
                  row.last_invoice_number,
                )
              : null,
          lastRunAt:
            row.last_run_at
              ? String(
                  row.last_run_at,
                )
              : null,
          lastSuccessAt:
            row.last_success_at
              ? String(
                  row.last_success_at,
                )
              : null,
          lastFailureAt:
            row.last_failure_at
              ? String(
                  row.last_failure_at,
                )
              : null,
          retryAfter:
            row.retry_after
              ? String(
                  row.retry_after,
                )
              : null,
          lastErrorCode:
            row.last_error_code
              ? String(
                  row.last_error_code,
                )
              : null,
          lastErrorMessage:
            row.last_error_message
              ? String(
                  row.last_error_message,
                )
              : null,
          completionReason:
            row.completion_reason
              ? String(
                  row.completion_reason,
                )
              : null,
          autoSend:
            row.auto_send ===
            true,
          deliveryChannels:
            (
              Array.isArray(
                row.invoice_payload
                  ?.deliveryChannels,
              )
                ? row.invoice_payload
                    .deliveryChannels
                : [
                    'email',
                  ]
            )
              .map(
                (
                  channel:
                    unknown,
                ) =>
                  String(
                    channel,
                  )
                    .trim()
                    .toLowerCase(),
              )
              .filter(
                (
                  channel:
                    string,
                ): channel is
                  | 'email'
                  | 'whatsapp'
                  | 'sms' =>
                    channel ===
                      'email' ||
                    channel ===
                      'whatsapp' ||
                    channel ===
                      'sms',
              ),
          currency:
            String(
              row.currency,
            ),
          runs:
            Array.isArray(
              row.recent_runs,
            )
              ? row.recent_runs.map(
                  (
                    item:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        item.id,
                      ),
                    scheduledFor:
                      String(
                        item.scheduledFor,
                      ),
                    status:
                      String(
                        item.status,
                      ),
                    attemptCount:
                      Number(
                        item.attemptCount ||
                        1,
                      ),
                    invoiceId:
                      item.invoiceId
                        ? String(
                            item.invoiceId,
                          )
                        : null,
                    invoiceNumber:
                      item.invoiceNumber
                        ? String(
                            item.invoiceNumber,
                          )
                        : null,
                    deliveryStatus:
                      String(
                        item.deliveryStatus ||
                        'not_requested',
                      ),
                    deliveryErrorCode:
                      item.deliveryErrorCode
                        ? String(
                            item.deliveryErrorCode,
                          )
                        : null,
                    startedAt:
                      String(
                        item.startedAt,
                      ),
                    lastAttemptAt:
                      String(
                        item.lastAttemptAt,
                      ),
                    completedAt:
                      item.completedAt
                        ? String(
                            item.completedAt,
                          )
                        : null,
                    errorCode:
                      item.errorCode
                        ? String(
                            item.errorCode,
                          )
                        : null,
                    errorMessage:
                      item.errorMessage
                        ? String(
                            item.errorMessage,
                          )
                        : null,
                  }),
                )
              : [],
        }),
      )
        : [],

    dunningPolicies:
      dunningPolicies.rows.map(
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
          isActive:
            row.is_active !==
            false,
          stages:
            Array.isArray(
              row.stages,
            )
              ? row.stages.map(
                  (
                    stage:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        stage.id,
                      ),
                    stageKey:
                      String(
                        stage.stageKey,
                      ),
                    name:
                      String(
                        stage.name,
                      ),
                    sequenceNo:
                      Number(
                        stage.sequenceNo,
                      ),
                    offsetDays:
                      Number(
                        stage.offsetDays,
                      ),
                    severity:
                      String(
                        stage.severity,
                      ),
                    channels:
                      Array.isArray(
                        stage.channels,
                      )
                        ? stage.channels
                            .map(
                              channel =>
                                String(
                                  channel,
                                ),
                            )
                            .filter(
                              (
                                channel,
                              ): channel is
                                | 'email'
                                | 'whatsapp'
                                | 'sms' =>
                                  channel ===
                                    'email' ||
                                  channel ===
                                    'whatsapp' ||
                                  channel ===
                                    'sms',
                            )
                        : [],
                    autoSend:
                      stage.autoSend !==
                      false,
                    retryLimit:
                      Number(
                        stage.retryLimit ||
                        3,
                      ),
                    retryDelayMinutes:
                      Number(
                        stage.retryDelayMinutes ||
                        60,
                      ),
                    subjectTemplate:
                      stage.subjectTemplate
                        ? String(
                            stage.subjectTemplate,
                          )
                        : null,
                    messageTemplate:
                      stage.messageTemplate
                        ? String(
                            stage.messageTemplate,
                          )
                        : null,
                  }),
                )
              : [],
        }),
      ),

    reminders:
      reminders.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          invoiceId:
            String(
              row.invoice_id,
            ),
          invoiceNumber:
            String(
              row.invoice_number,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          policyId:
            row.dunning_policy_id
              ? String(
                  row.dunning_policy_id,
                )
              : null,
          stageId:
            row.dunning_stage_id
              ? String(
                  row.dunning_stage_id,
                )
              : null,
          stageName:
            String(
              row.stage_name,
            ),
          severity:
            String(
              row.severity,
            ),
          reminderType:
            String(
              row.reminder_type,
            ),
          channel:
            String(
              row.channel,
            ),
          source:
            String(
              row.source,
            ),
          status:
            String(
              row.status,
            ),
          attemptCount:
            Number(
              row.attempt_count ||
              0,
            ),
          maxAttempts:
            Number(
              row.max_attempts ||
              1,
            ),
          scheduledFor:
            row.scheduled_for
              ? String(
                  row.scheduled_for,
                )
              : null,
          lastAttemptAt:
            row.last_attempt_at
              ? String(
                  row.last_attempt_at,
                )
              : null,
          nextAttemptAt:
            row.next_attempt_at
              ? String(
                  row.next_attempt_at,
                )
              : null,
          sentAt:
            row.sent_at
              ? String(
                  row.sent_at,
                )
              : null,
          completedAt:
            row.completed_at
              ? String(
                  row.completed_at,
                )
              : null,
          failureCode:
            row.failure_code
              ? String(
                  row.failure_code,
                )
              : null,
          failureMessage:
            row.failure_message
              ? String(
                  row.failure_message,
                )
              : null,
          createdAt:
            String(
              row.created_at,
            ),
        }),
      ),

    portalAccess:
      access.canViewCustomers
        ? portalAccess.rows.map(
            row => ({
              id:
                String(
                  row.id,
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
                  row.effective_status,
                ),
              expiresAt:
                String(
                  row.expires_at,
                ),
              lastUsedAt:
                row.last_used_at
                  ? String(
                      row.last_used_at,
                    )
                  : null,
              createdAt:
                String(
                  row.created_at,
                ),
            }),
          )
        : [],

    portalMessages:
      access.canViewCustomers
        ? portalMessages.rows.map(
            row => ({
              id:
                String(
                  row.id,
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
              invoiceId:
                row.invoice_id
                  ? String(
                      row.invoice_id,
                    )
                  : null,
              invoiceNumber:
                row.invoice_number
                  ? String(
                      row.invoice_number,
                    )
                  : null,
              direction:
                String(
                  row.direction,
                ),
              category:
                String(
                  row.category,
                ),
              subject:
                row.subject
                  ? String(
                      row.subject,
                    )
                  : null,
              body:
                String(
                  row.body,
                ),
              promisedAmount:
                row.promised_amount ===
                  null ||
                row.promised_amount ===
                  undefined
                  ? null
                  : money(
                      row.promised_amount,
                    ),
              promisedDate:
                row.promised_date
                  ? dateOnlyValue(
                      row.promised_date,
                    )
                  : null,
              status:
                String(
                  row.status,
                ),
              createdAt:
                String(
                  row.created_at,
                ),
            }),
          )
        : [],

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
          layout:
            String(
              row.layout ||
              'modern',
            ),
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
          accentColor:
            row.accent_color
              ? String(
                  row.accent_color,
                )
              : null,
          logoUrl:
            row.logo_url
              ? String(
                  row.logo_url,
                )
              : null,
          fontFamily:
            String(
              row.font_family ||
              'Inter',
            ),
          designVersion:
            Number(
              row.design_version ||
              1,
            ),
          density:
            String(
              row.density ||
              'comfortable',
            ),
          headerStyle:
            String(
              row.header_style ||
              'band',
            ),
          documentTitle:
            String(
              row.document_title ||
              'Invoice',
            ),
          fromLabel:
            String(
              row.from_label ||
              'From',
            ),
          billToLabel:
            String(
              row.bill_to_label ||
              'Bill to',
            ),
          notesLabel:
            String(
              row.notes_label ||
              'Notes',
            ),
          termsLabel:
            String(
              row.terms_label ||
              'Terms',
            ),
          paymentLabel:
            String(
              row.payment_label ||
              'Payment instructions',
            ),
          footerAlignment:
            String(
              row.footer_alignment ||
              'left',
            ),
          showStatus:
            row.show_status !==
            false,
          showPageNumbers:
            row.show_page_numbers !==
            false,
          showSku:
            row.show_sku !==
            false,
          showUnit:
            row.show_unit !==
            false,
          showQuantity:
            row.show_quantity !==
            false,
          showUnitPrice:
            row.show_unit_price !==
            false,
          showLineTax:
            row.show_line_tax !==
            false,
          showLineDiscount:
            row.show_line_discount !==
            false,
          showCompanyLogo:
            row.show_company_logo !==
            false,
          showCompanyAddress:
            row.show_company_address !==
            false,
          showCompanyContact:
            row.show_company_contact !==
            false,
          showTaxId:
            row.show_tax_id !==
            false,
          showPaymentInstructions:
            row.show_payment_instructions !==
            false,
          showTaxBreakdown:
            row.show_tax_breakdown !==
            false,
          showDiscount:
            row.show_discount !==
            false,
          footerText:
            row.footer_text
              ? String(
                  row.footer_text,
                )
              : null,
          termsText:
            row.terms_text
              ? String(
                  row.terms_text,
                )
              : null,
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
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          dueDays:
            Number(
              row.due_days ||
              0,
            ),
          isDefault:
            row.is_default ===
            true,
          isActive:
            row.is_active !==
            false,
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
          taxType:
            String(
              row.tax_type ||
              'vat',
            ),
          countryCode:
            row.country_code
              ? String(
                  row.country_code,
                )
              : null,
          isDefault:
            row.is_default ===
            true,
          isActive:
            row.is_active !==
            false,
        }),
      ),

    catalogItems:
      access.canViewCatalog
        ? catalogItems.rows.map(
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
          isActive:
            row.is_active !==
            false,
        }),
      )
        : [],

    currencies:
      currencies.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          code:
            String(
              row.code,
            ),
          name:
            String(
              row.name,
            ),
          symbol:
            String(
              row.symbol,
            ),
          decimalPlaces:
            Number(
              row.decimal_places ||
              2,
            ),
          isActive:
            row.is_active !==
            false,
          isBase:
            row.is_base ===
            true,
        }),
      ),

    exchangeRates:
      exchangeRates.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          currency:
            String(
              row.currency,
            ),
          baseCurrency:
            String(
              row.base_currency,
            ),
          rate:
            Number(
              row.rate_to_base ||
              1,
            ),
          effectiveDate:
            String(
              row.effective_date,
            ),
          sourceType:
            String(
              row.source_type ||
              'manual',
            ),
          sourceName:
            row.source_name
              ? String(
                  row.source_name,
                )
              : null,
          note:
            row.note
              ? String(
                  row.note,
                )
              : null,
        }),
      ),

    currencyExposure:
      currencyExposure.rows.map(
        row => ({
          currency:
            String(
              row.currency,
            ),
          baseCurrency:
            String(
              row.base_currency,
            ),
          openInvoiceCount:
            Number(
              row.open_invoice_count ||
              0,
            ),
          invoicedAmount:
            money(
              row.invoiced_amount,
            ),
          openAmount:
            money(
              row.open_amount,
            ),
          invoicedBaseAmount:
            money(
              row.invoiced_base_amount,
            ),
          openBaseAmount:
            money(
              row.open_base_amount,
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
      baseCurrency:
        String(
          setting.base_currency ||
          setting.default_currency ||
          context.company
            .currentCompany.currency ||
          'KES',
        ),
      exchangeRateMode:
        String(
          setting.exchange_rate_mode ||
          'table',
        ),
      allowCrossCurrencyPayments:
        setting.allow_cross_currency_payments !==
        false,
      defaultDueDays:
        Number(
          setting.default_due_days ||
          30,
        ),
      defaultTemplateId:
        setting.default_template_id
          ? String(
              setting.default_template_id,
            )
          : null,
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
      reminderChannels:
        Array.isArray(
          setting.reminder_channels,
        )
          ? setting.reminder_channels
              .map(
                (
                  value:
                    unknown,
                ) =>
                  String(
                    value,
                  )
                    .trim()
                    .toLowerCase(),
              )
              .filter(
                (
                  value:
                    string,
                ):
                  value is
                    'email' |
                    'whatsapp' |
                    'sms' =>
                  value ===
                    'email' ||
                  value ===
                    'whatsapp' ||
                  value ===
                    'sms',
              )
          : [
              'email',
            ],
      reminderDaysBefore:
        Number(
          setting.reminder_days_before ??
          3,
        ),
      reminderDaysAfter:
        Array.isArray(
          setting.reminder_days_after,
        )
          ? setting.reminder_days_after
              .map(
                (
                  value:
                    unknown,
                ) =>
                  Number(
                    value,
                  ),
              )
              .filter(
                (
                  value:
                    number,
                ) =>
                  Number.isInteger(
                    value,
                  ) &&
                  value >=
                    0,
              )
          : [
              1,
              7,
              14,
            ],
      portalEnabled:
        setting.portal_enabled !==
        false,
      portalAccessDays:
        Number(
          setting.portal_access_days ||
          90,
        ),
      portalAllowMessages:
        setting.portal_allow_messages !==
        false,
      portalShowPaymentHistory:
        setting.portal_show_payment_history !==
        false,
      portalShowCreditNotes:
        setting.portal_show_credit_notes !==
        false,
      paymentInstructions:
        setting.payment_instructions
          ? String(
              setting.payment_instructions,
            )
          : null,
      bankDetails:
        access.canManageSettings &&
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

  const canViewPayments =
    hasInvoicingPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .PAYMENT_VIEW,
    ) ||
    hasInvoicingPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const [
    invoiceResult,
    linesResult,
    paymentsResult,
    creditsResult,
    historyResult,
    deliveriesResult,
    snapshotsResult,
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
            i.exchange_rate,
            i.reference,
            i.purchase_order_number,
            i.service_date,
            i.ship_to_address,
            i.subtotal,
            i.discount_total,
            i.tax_total,
            i.shipping_total,
            i.rounding_adjustment,
            i.total_amount,
            a.balance_due,
            COALESCE(
              (
                SELECT SUM(allocation.amount)
                FROM invoicing_payment_allocations allocation
                INNER JOIN invoicing_payments payment
                  ON payment.id = allocation.payment_id
                WHERE allocation.invoice_id = i.id
                  AND allocation.company_id = i.company_id
                  AND allocation.status = 'posted'
                  AND payment.status = 'posted'
                  AND payment.deleted_at IS NULL
              ),
              0
            ) AS paid_amount,
            COALESCE(
              (
                SELECT SUM(application.amount)
                FROM invoicing_credit_note_applications application
                INNER JOIN invoicing_credit_notes note
                  ON note.id = application.credit_note_id
                 AND note.company_id = application.company_id
                WHERE application.target_invoice_id = i.id
                  AND application.company_id = i.company_id
                  AND application.status = 'posted'
                  AND note.status <> 'cancelled'
                  AND note.deleted_at IS NULL
              ),
              0
            ) AS credited_amount,
            COALESCE(
              (
                SELECT available_credit
                FROM invoicing_customer_credit_balances credit_balance
                WHERE credit_balance.company_id = i.company_id
                  AND credit_balance.customer_id = i.customer_id
                  AND credit_balance.currency = i.currency
                LIMIT 1
              ),
              0
            ) AS customer_available_credit,
            i.tax_calculation,
            i.template_id,
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

      canViewPayments
        ? context.pool.query(
            `
              SELECT
                p.id,
                p.payment_number,
                p.status,
                p.payment_date,
                a.amount,
                p.method,
                p.reference,
                p.reconciled_at,
                a.id AS allocation_id,
                a.status AS allocation_status,
                a.operation_key
              FROM invoicing_payment_allocations a
              INNER JOIN invoicing_payments p
                ON p.id =
                   a.payment_id
              WHERE a.invoice_id =
                    $1
                AND a.company_id =
                    $2
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
          )
        : Promise.resolve({
            rows: [],
          }),

      context.pool.query(
        `
          SELECT
            note.id,
            note.credit_note_number,
            note.issue_date,
            note.status,
            note.subtotal,
            note.tax_total,
            note.total_amount,
            note.reason,
            COALESCE(
              balance.applied_amount,
              0
            ) AS applied_amount,
            COALESCE(
              balance.refunded_amount,
              0
            ) AS refunded_amount,
            COALESCE(
              balance.available_amount,
              0
            ) AS available_amount,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id',
                    app.id,
                    'targetInvoiceId',
                    app.target_invoice_id,
                    'targetInvoiceNumber',
                    target.invoice_number,
                    'applicationType',
                    app.application_type,
                    'amount',
                    app.amount,
                    'status',
                    app.status,
                    'appliedAt',
                    app.applied_at,
                    'reversalReason',
                    app.reversal_reason
                  )
                  ORDER BY
                    app.applied_at DESC,
                    app.id DESC
                )
                FROM invoicing_credit_note_applications app
                INNER JOIN invoicing_invoices target
                  ON target.id =
                     app.target_invoice_id
                 AND target.company_id =
                     app.company_id
                WHERE app.credit_note_id =
                      note.id
                  AND app.company_id =
                      note.company_id
              ),
              '[]'::jsonb
            ) AS applications,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id',
                    refund.id,
                    'refundNumber',
                    refund.refund_number,
                    'refundDate',
                    refund.refund_date,
                    'amount',
                    refund.amount,
                    'method',
                    refund.method,
                    'reference',
                    refund.reference,
                    'reason',
                    refund.reason,
                    'status',
                    refund.status,
                    'reversalReason',
                    refund.reversal_reason
                  )
                  ORDER BY
                    refund.refund_date DESC,
                    refund.id DESC
                )
                FROM invoicing_credit_note_refunds refund
                WHERE refund.credit_note_id =
                      note.id
                  AND refund.company_id =
                      note.company_id
              ),
              '[]'::jsonb
            ) AS refunds
          FROM invoicing_credit_notes note
          LEFT JOIN invoicing_credit_note_balances balance
            ON balance.credit_note_id =
               note.id
           AND balance.company_id =
               note.company_id
          WHERE note.invoice_id =
                $1
            AND note.company_id =
                $2
            AND note.deleted_at
                IS NULL
          ORDER BY
            note.issue_date DESC,
            note.created_at DESC
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
            document_snapshot_id,
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

      context.pool.query(
        `
          SELECT
            id,
            version_no,
            is_primary,
            snapshot_reason,
            invoice_status,
            renderer_version,
            payload_sha256,
            pdf_sha256,
            pdf_size_bytes,
            created_by,
            created_at
          FROM invoicing_document_snapshots
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          ORDER BY
            version_no DESC,
            created_at DESC
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
    serviceDate:
      row.service_date
        ? String(
            row.service_date,
          )
        : null,
    currency:
      String(
        row.currency,
      ),
    exchangeRate:
      Number(
        row.exchange_rate ||
        1,
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
    customerAvailableCredit:
      money(
        row.customer_available_credit,
      ),
    balanceDue:
      [
        'cancelled',
        'void',
        'written_off',
      ].includes(
        String(
          row.status,
        ),
      )
        ? 0
        : money(
            row.balance_due,
          ),
    taxCalculation:
      row.tax_calculation ===
        'inclusive'
        ? 'inclusive' as const
        : 'exclusive' as const,
    templateId:
      row.template_id
        ? String(
            row.template_id,
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
      shippingAddress:
        row.ship_to_address
          ? String(
              row.ship_to_address,
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
          status:
            String(
              payment.status,
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
          allocationId:
            String(
              payment.allocation_id,
            ),
          allocationStatus:
            String(
              payment.allocation_status,
            ),
          operationKey:
            payment.operation_key
              ? String(
                  payment.operation_key,
                )
              : null,
          reconciledAt:
            payment.reconciled_at
              ? new Date(
                  payment.reconciled_at,
                ).toISOString()
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
          subtotal:
            money(
              credit.subtotal,
            ),
          taxTotal:
            money(
              credit.tax_total,
            ),
          amount:
            money(
              credit.total_amount,
            ),
          appliedAmount:
            money(
              credit.applied_amount,
            ),
          refundedAmount:
            money(
              credit.refunded_amount,
            ),
          availableAmount:
            money(
              credit.available_amount,
            ),
          reason:
            String(
              credit.reason,
            ),
          applications:
            Array.isArray(
              credit.applications,
            )
              ? credit.applications.map(
                  (
                    item:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(item.id),
                    targetInvoiceId:
                      String(item.targetInvoiceId),
                    targetInvoiceNumber:
                      String(item.targetInvoiceNumber),
                    applicationType:
                      String(item.applicationType),
                    amount:
                      money(item.amount),
                    status:
                      String(item.status),
                    appliedAt:
                      String(item.appliedAt),
                    reversalReason:
                      item.reversalReason
                        ? String(item.reversalReason)
                        : null,
                  }),
                )
              : [],
          refunds:
            Array.isArray(
              credit.refunds,
            )
              ? credit.refunds.map(
                  (
                    item:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(item.id),
                    refundNumber:
                      String(item.refundNumber),
                    refundDate:
                      String(item.refundDate),
                    amount:
                      money(item.amount),
                    method:
                      String(item.method),
                    reference:
                      item.reference
                        ? String(item.reference)
                        : null,
                    reason:
                      String(item.reason),
                    status:
                      String(item.status),
                    reversalReason:
                      item.reversalReason
                        ? String(item.reversalReason)
                        : null,
                  }),
                )
              : [],
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
          documentSnapshotId:
            delivery.document_snapshot_id
              ? String(
                  delivery.document_snapshot_id,
                )
              : null,
          createdAt:
            new Date(
              delivery.created_at,
            ).toISOString(),
        }),
      ),
    documentSnapshots:
      snapshotsResult.rows.map(
        snapshot => ({
          id:
            String(
              snapshot.id,
            ),
          versionNo:
            Number(
              snapshot.version_no,
            ),
          isPrimary:
            snapshot.is_primary ===
            true,
          reason:
            String(
              snapshot.snapshot_reason,
            ),
          sourceStatus:
            String(
              snapshot.invoice_status,
            ),
          rendererVersion:
            String(
              snapshot.renderer_version,
            ),
          payloadSha256:
            String(
              snapshot.payload_sha256,
            ),
          pdfSha256:
            String(
              snapshot.pdf_sha256,
            ),
          pdfSizeBytes:
            Number(
              snapshot.pdf_size_bytes,
            ),
          createdBy:
            snapshot.created_by
              ? String(
                  snapshot.created_by,
                )
              : null,
          createdAt:
            new Date(
              snapshot.created_at,
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
  options: {
    includeCustomers?: boolean;
  } = {},
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

  return result.rows
    .filter(
      row =>
        options.includeCustomers ===
          true ||
        String(
          row.kind,
        ) ===
          'invoice',
    )
    .map(
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
