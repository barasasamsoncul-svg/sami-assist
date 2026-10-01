import "server-only";

import {
  requireEnterpriseModuleTableContext,
} from "@/lib/apps/enterprise/service";

import {
  accountingId,
  decimalAmount,
  minorUnits,
} from "./validation";

import type {
  AccountingReceivablesWorkspace,
  ReceivablesAgingBucket,
  ReceivablesControlReconciliation,
  ReceivablesCustomerExposure,
} from "./receivables-types";


const AGING_BUCKETS =
  new Set<
    ReceivablesAgingBucket
  >([
    "current",
    "1-30",
    "31-60",
    "61-90",
    "90+",
  ]);


function pageValue(
  value: unknown,
) {
  const parsed =
    Number(
      value ||
        1,
    );

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? Math.min(
        parsed,
        100000,
      )
    : 1;
}


function searchValue(
  value: unknown,
) {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      120,
    );
}


function bucketValue(
  value: unknown,
):
  ReceivablesAgingBucket |
  "" {
  if (
    typeof value ===
      "string" &&
    AGING_BUCKETS.has(
      value as ReceivablesAgingBucket,
    )
  ) {
    return value as ReceivablesAgingBucket;
  }

  return "";
}


function customerValue(
  value: unknown,
) {
  if (
    !value
  ) {
    return "";
  }

  try {
    return accountingId(
      value,
    );
  } catch {
    return "";
  }
}


function cents(
  value:
    unknown,
) {
  const text =
    String(
      value ??
        "0",
    );

  const negative =
    text.startsWith(
      "-",
    );

  const normalized =
    negative
      ? text.slice(
          1,
        )
      : text;

  const amount =
    minorUnits(
      normalized,
    );

  return negative
    ? -amount
    : amount;
}


function reconciliation(
  account:
    {
      id?: string | null;
      code?: string | null;
      name?: string | null;
    } |
    null,
  gl:
    unknown,
  subledger:
    unknown,
): ReceivablesControlReconciliation {
  const glCents =
    cents(
      gl,
    );

  const subledgerCents =
    cents(
      subledger,
    );

  const difference =
    glCents -
    subledgerCents;

  return {
    accountId:
      account?.id ||
      null,
    accountCode:
      account?.code ||
      null,
    accountName:
      account?.name ||
      null,
    glBalance:
      decimalAmount(
        glCents,
      ),
    subledgerBalance:
      decimalAmount(
        subledgerCents,
      ),
    difference:
      decimalAmount(
        difference,
      ),
    reconciled:
      difference ===
      BigInt(
        0,
      ),
  };
}


function emptyWorkspace(
  companyId:
    string,
  currency:
    string,
  filters:
    AccountingReceivablesWorkspace[
      "filters"
    ],
  reason:
    string,
): AccountingReceivablesWorkspace {
  const zeroControl =
    reconciliation(
      null,
      "0",
      "0",
    );

  return {
    available:
      false,
    unavailableReason:
      reason,
    companyId,
    currency,
    filters,
    metrics: {
      outstanding:
        "0.00",
      overdue:
        "0.00",
      current:
        "0.00",
      customerCredits:
        "0.00",
      openInvoiceCount:
        0,
      overdueInvoiceCount:
        0,
      customersWithBalance:
        0,
      dsoDays:
        null,
    },
    receivableControl:
      zeroControl,
    customerCreditControl:
      zeroControl,
    aging: [
      "current",
      "1-30",
      "31-60",
      "61-90",
      "90+",
    ].map(
      bucket => ({
        bucket:
          bucket as ReceivablesAgingBucket,
        amount:
          "0.00",
        count:
          0,
      }),
    ),
    customers:
      [],
    customerCredits:
      [],
    openItems:
      [],
    openItemCount:
      0,
    selectedCustomer:
      null,
  };
}


export async function getAccountingReceivables(
  input: {
    page?: unknown;
    bucket?: unknown;
    customerId?: unknown;
    search?: unknown;
  } = {},
): Promise<AccountingReceivablesWorkspace> {
  const context =
    await requireEnterpriseModuleTableContext(
      "accounting",
      "journals",
      "report",
    );

  const filters = {
    page:
      pageValue(
        input.page,
      ),
    bucket:
      bucketValue(
        input.bucket,
      ),
    customerId:
      customerValue(
        input.customerId,
      ),
    search:
      searchValue(
        input.search,
      ),
  };

  const currency =
    context.company
      .currentCompany
      .currency;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );

    const readiness =
      await client.query(
        `SELECT
           to_regclass('public.invoicing_customers') IS NOT NULL AS customers_ready,
           to_regclass('public.invoicing_invoices') IS NOT NULL AS invoices_ready,
           to_regclass('public.invoicing_aging_base') IS NOT NULL AS aging_ready,
           to_regclass('public.invoicing_payment_balances') IS NOT NULL AS payment_balances_ready,
           to_regclass('public.invoicing_credit_note_balances') IS NOT NULL AS credit_balances_ready`,
      );

    const ready =
      readiness.rows[
        0
      ];

    if (
      !ready?.customers_ready ||
      !ready?.invoices_ready ||
      !ready?.aging_ready ||
      !ready?.payment_balances_ready ||
      !ready?.credit_balances_ready
    ) {
      await client.query(
        "COMMIT",
      );

      return emptyWorkspace(
        context.companyId,
        currency,
        filters,
        "Install or upgrade Invoicing to use the Accounting receivables subledger.",
      );
    }

    const controls =
      await client.query(
        `WITH setup AS (
           SELECT default_receivable_account_id
           FROM accounting_settings
           WHERE company_id=$1
             AND deleted_at IS NULL
           LIMIT 1
         )
         SELECT
           ar.id::text AS ar_id,
           ar.code AS ar_code,
           ar.name AS ar_name,
           credit.id::text AS credit_id,
           credit.code AS credit_code,
           credit.name AS credit_name
         FROM (SELECT 1) seed
         LEFT JOIN LATERAL (
           SELECT a.id,a.code,a.name
           FROM accounts a
           LEFT JOIN setup s ON TRUE
           WHERE a.company_id=$1
             AND a.deleted_at IS NULL
             AND a.is_active=TRUE
             AND (
               a.id=s.default_receivable_account_id
               OR a.system_role='receivable_control'
             )
           ORDER BY
             CASE WHEN a.id=s.default_receivable_account_id THEN 0 ELSE 1 END,
             a.id
           LIMIT 1
         ) ar ON TRUE
         LEFT JOIN LATERAL (
           SELECT a.id,a.code,a.name
           FROM accounts a
           WHERE a.company_id=$1
             AND a.deleted_at IS NULL
             AND a.is_active=TRUE
             AND a.system_role='invoicing_customer_credit'
           ORDER BY a.id
           LIMIT 1
         ) credit ON TRUE`,
        [
          context.companyId,
        ],
      );

    const control =
      controls.rows[
        0
      ] ||
      {};

    const receivableAccount =
      control.ar_id
        ? {
            id:
              String(
                control.ar_id,
              ),
            code:
              String(
                control.ar_code ||
                  "",
              ),
            name:
              String(
                control.ar_name ||
                  "",
              ),
          }
        : null;

    const customerCreditAccount =
      control.credit_id
        ? {
            id:
              String(
                control.credit_id,
              ),
            code:
              String(
                control.credit_code ||
                  "",
              ),
            name:
              String(
                control.credit_name ||
                  "",
              ),
          }
        : null;

    const subledgerTotals =
      await client.query(
        `SELECT
           COALESCE(SUM(base_balance_due),0)::text AS outstanding,
           COALESCE(SUM(base_balance_due) FILTER (WHERE due_date < CURRENT_DATE),0)::text AS overdue,
           COALESCE(SUM(base_balance_due) FILTER (WHERE due_date >= CURRENT_DATE),0)::text AS current_amount,
           COUNT(*) FILTER (WHERE base_balance_due > 0)::int AS open_invoice_count,
           COUNT(*) FILTER (WHERE base_balance_due > 0 AND due_date < CURRENT_DATE)::int AS overdue_invoice_count,
           COUNT(DISTINCT customer_id) FILTER (WHERE base_balance_due > 0)::int AS customers_with_balance
         FROM invoicing_aging_base
         WHERE company_id=$1`,
        [
          context.companyId,
        ],
      );

    const paymentCredits =
      await client.query(
        `SELECT
           COALESCE(SUM(b.unapplied_amount * COALESCE(p.exchange_rate,1)),0)::text AS amount
         FROM invoicing_payment_balances b
         JOIN invoicing_payments p
           ON p.company_id=b.company_id
          AND p.id=b.payment_id
          AND p.deleted_at IS NULL
          AND p.status='posted'
         WHERE b.company_id=$1`,
        [
          context.companyId,
        ],
      );

    const noteCredits =
      await client.query(
        `SELECT
           COALESCE(SUM(
             b.available_amount *
             COALESCE(source_invoice.exchange_rate,1)
           ),0)::text AS amount
         FROM invoicing_credit_note_balances b
         JOIN invoicing_credit_notes cn
           ON cn.company_id=b.company_id
          AND cn.id=b.credit_note_id
          AND cn.deleted_at IS NULL
         LEFT JOIN invoicing_invoices source_invoice
           ON source_invoice.company_id=cn.company_id
          AND source_invoice.id=cn.invoice_id
          AND source_invoice.deleted_at IS NULL
         WHERE b.company_id=$1`,
        [
          context.companyId,
        ],
      );

    const customerCreditSubledger =
      cents(
        paymentCredits.rows[
          0
        ]?.amount ||
        "0",
      ) +
      cents(
        noteCredits.rows[
          0
        ]?.amount ||
        "0",
      );

    const glBalances =
      await client.query(
        `SELECT
           COALESCE(SUM(l.debit-l.credit) FILTER (WHERE l.account_id=$2),0)::text AS receivable_gl,
           COALESCE(SUM(l.credit-l.debit) FILTER (WHERE l.account_id=$3),0)::text AS customer_credit_gl
         FROM journal_lines l
         JOIN journals j
           ON j.company_id=l.company_id
          AND j.id=l.journal_id
          AND j.deleted_at IS NULL
          AND j.status='posted'
         WHERE l.company_id=$1
           AND l.deleted_at IS NULL
           AND (
             ($2::uuid IS NOT NULL AND l.account_id=$2)
             OR
             ($3::uuid IS NOT NULL AND l.account_id=$3)
           )`,
        [
          context.companyId,
          receivableAccount
            ?.id ||
            null,
          customerCreditAccount
            ?.id ||
            null,
        ],
      );

    const receivableSubledger =
      subledgerTotals.rows[
        0
      ]?.outstanding ||
      "0";

    const receivableControl =
      reconciliation(
        receivableAccount,
        glBalances.rows[
          0
        ]?.receivable_gl ||
          "0",
        receivableSubledger,
      );

    const customerCreditControl =
      reconciliation(
        customerCreditAccount,
        glBalances.rows[
          0
        ]?.customer_credit_gl ||
          "0",
        decimalAmount(
          customerCreditSubledger,
        ),
      );

    const agingResult =
      await client.query(
        `SELECT
           aging_bucket AS bucket,
           COALESCE(SUM(base_balance_due),0)::text AS amount,
           COUNT(*) FILTER (WHERE base_balance_due > 0)::int AS count
         FROM invoicing_aging_base
         WHERE company_id=$1
           AND base_balance_due > 0
           AND aging_bucket IN ('current','1-30','31-60','61-90','90+')
         GROUP BY aging_bucket`,
        [
          context.companyId,
        ],
      );

    const agingByBucket =
      new Map(
        agingResult.rows.map(
          row => [
            String(
              row.bucket,
            ),
            row,
          ],
        ),
      );

    const aging =
      (
        [
          "current",
          "1-30",
          "31-60",
          "61-90",
          "90+",
        ] as ReceivablesAgingBucket[]
      ).map(
        bucket => ({
          bucket,
          amount:
            String(
              agingByBucket.get(
                bucket,
              )?.amount ||
              "0.00",
            ),
          count:
            Number(
              agingByBucket.get(
                bucket,
              )?.count ||
              0,
            ),
        }),
      );

    const customerResult =
      await client.query(
        `SELECT
           c.id::text AS customer_id,
           c.name AS customer_name,
           c.status AS customer_status,
           c.currency AS customer_currency,
           c.credit_limit::text,
           COUNT(a.invoice_id) FILTER (WHERE a.base_balance_due > 0)::int AS invoice_count,
           COALESCE(SUM(a.base_balance_due),0)::text AS outstanding,
           COALESCE(SUM(a.base_balance_due) FILTER (WHERE a.due_date < CURRENT_DATE),0)::text AS overdue,
           COALESCE(MAX(a.days_overdue) FILTER (WHERE a.base_balance_due > 0),0)::int AS max_days_overdue
         FROM invoicing_customers c
         LEFT JOIN invoicing_aging_base a
           ON a.company_id=c.company_id
          AND a.customer_id=c.id
          AND a.base_balance_due > 0
         WHERE c.company_id=$1
           AND c.deleted_at IS NULL
         GROUP BY c.id
         HAVING COALESCE(SUM(a.base_balance_due),0) > 0
         ORDER BY
           COALESCE(SUM(a.base_balance_due) FILTER (WHERE a.due_date < CURRENT_DATE),0) DESC,
           COALESCE(SUM(a.base_balance_due),0) DESC,
           c.name
         LIMIT 100`,
        [
          context.companyId,
        ],
      );

    const creditByCustomer =
      await client.query(
        `WITH payment_credit AS (
           SELECT
             p.customer_id,
             COALESCE(SUM(b.unapplied_amount * COALESCE(p.exchange_rate,1)),0) AS amount
           FROM invoicing_payment_balances b
           JOIN invoicing_payments p
             ON p.company_id=b.company_id
            AND p.id=b.payment_id
            AND p.deleted_at IS NULL
            AND p.status='posted'
           WHERE b.company_id=$1
             AND p.customer_id IS NOT NULL
           GROUP BY p.customer_id
         ),
         note_credit AS (
           SELECT
             b.customer_id,
             COALESCE(SUM(
               b.available_amount *
               COALESCE(source_invoice.exchange_rate,1)
             ),0) AS amount
           FROM invoicing_credit_note_balances b
           JOIN invoicing_credit_notes cn
             ON cn.company_id=b.company_id
            AND cn.id=b.credit_note_id
            AND cn.deleted_at IS NULL
           LEFT JOIN invoicing_invoices source_invoice
             ON source_invoice.company_id=cn.company_id
            AND source_invoice.id=cn.invoice_id
            AND source_invoice.deleted_at IS NULL
           WHERE b.company_id=$1
           GROUP BY b.customer_id
         )
         SELECT
           c.id::text AS customer_id,
           c.name AS customer_name,
           COALESCE(p.amount,0)::text AS unapplied_receipts,
           COALESCE(n.amount,0)::text AS unused_credit_notes,
           (COALESCE(p.amount,0)+COALESCE(n.amount,0))::text AS total_credit
         FROM invoicing_customers c
         LEFT JOIN payment_credit p
           ON p.customer_id=c.id
         LEFT JOIN note_credit n
           ON n.customer_id=c.id
         WHERE c.company_id=$1
           AND c.deleted_at IS NULL
           AND (COALESCE(p.amount,0)+COALESCE(n.amount,0)) > 0
         ORDER BY
           (COALESCE(p.amount,0)+COALESCE(n.amount,0)) DESC,
           c.name
         LIMIT 100`,
        [
          context.companyId,
        ],
      );

    const creditMap =
      new Map(
        creditByCustomer.rows.map(
          row => [
            String(
              row.customer_id,
            ),
            String(
              row.total_credit ||
              "0",
            ),
          ],
        ),
      );

    const customers:
      ReceivablesCustomerExposure[] =
      customerResult.rows.map(
        row => ({
          customerId:
            String(
              row.customer_id,
            ),
          customerName:
            String(
              row.customer_name ||
              "",
            ),
          customerStatus:
            String(
              row.customer_status ||
              "",
            ),
          customerCurrency:
            String(
              row.customer_currency ||
              currency,
            ),
          creditLimit:
            row.credit_limit ===
              null
              ? null
              : String(
                  row.credit_limit,
                ),
          invoiceCount:
            Number(
              row.invoice_count ||
              0,
            ),
          outstanding:
            String(
              row.outstanding ||
              "0",
            ),
          overdue:
            String(
              row.overdue ||
              "0",
            ),
          maxDaysOverdue:
            Number(
              row.max_days_overdue ||
              0,
            ),
          creditAvailable:
            creditMap.get(
              String(
                row.customer_id,
              ),
            ) ||
            "0.00",
        }),
      );

    const conditions:
      string[] = [
        "a.company_id=$1",
        "a.base_balance_due > 0",
      ];

    const values:
      unknown[] = [
        context.companyId,
      ];

    if (
      filters.bucket
    ) {
      values.push(
        filters.bucket,
      );
      conditions.push(
        "a.aging_bucket=$" +
        values.length,
      );
    }

    if (
      filters.customerId
    ) {
      values.push(
        filters.customerId,
      );
      conditions.push(
        "a.customer_id=$" +
        values.length,
      );
    }

    if (
      filters.search
    ) {
      values.push(
        "%" +
        filters.search +
        "%",
      );
      conditions.push(
        "(i.invoice_number ILIKE $" +
        values.length +
        " OR c.name ILIKE $" +
        values.length +
        ")",
      );
    }

    const pageSize =
      50;

    const openCount =
      await client.query(
        `SELECT COUNT(*)::int AS count
         FROM invoicing_aging_base a
         JOIN invoicing_invoices i
           ON i.company_id=a.company_id
          AND i.id=a.invoice_id
          AND i.deleted_at IS NULL
         JOIN invoicing_customers c
           ON c.company_id=a.company_id
          AND c.id=a.customer_id
          AND c.deleted_at IS NULL
         WHERE ` +
        conditions.join(
          " AND ",
        ),
        values,
      );

    const itemValues = [
      ...values,
      pageSize,
      (
        filters.page -
        1
      ) *
        pageSize,
    ];

    const openItems =
      await client.query(
        `SELECT
           a.invoice_id::text,
           a.invoice_number,
           a.customer_id::text,
           c.name AS customer_name,
           a.invoice_date::text,
           a.due_date::text,
           a.currency,
           a.base_currency,
           a.exchange_rate::text,
           a.total_amount::text,
           a.balance_due::text,
           a.base_balance_due::text,
           a.effective_status,
           a.days_overdue::int,
           a.aging_bucket
         FROM invoicing_aging_base a
         JOIN invoicing_invoices i
           ON i.company_id=a.company_id
          AND i.id=a.invoice_id
          AND i.deleted_at IS NULL
         JOIN invoicing_customers c
           ON c.company_id=a.company_id
          AND c.id=a.customer_id
          AND c.deleted_at IS NULL
         WHERE ` +
        conditions.join(
          " AND ",
        ) +
        `
         ORDER BY
           CASE WHEN a.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
           a.due_date,
           a.invoice_number
         LIMIT $` +
        (
          values.length +
          1
        ) +
        `
         OFFSET $` +
        (
          values.length +
          2
        ),
        itemValues,
      );

    const trailingSales =
      await client.query(
        `SELECT
           COALESCE(SUM(total_amount * COALESCE(exchange_rate,1)),0)::text AS billed
         FROM invoicing_invoices
         WHERE company_id=$1
           AND deleted_at IS NULL
           AND status NOT IN ('draft','pending_approval','rejected','cancelled','void')
           AND invoice_date >= CURRENT_DATE - INTERVAL '90 days'`,
        [
          context.companyId,
        ],
      );

    const outstandingCents =
      cents(
        receivableSubledger,
      );

    const billedCents =
      cents(
        trailingSales.rows[
          0
        ]?.billed ||
        "0",
      );

    const dsoDays =
      billedCents >
        BigInt(
          0,
        )
        ? Math.round(
            Number(
              outstandingCents *
              BigInt(
                9000,
              ) /
              billedCents,
            ) /
            100,
          )
        : null;

    const selectedCustomer =
      filters.customerId
        ? customers.find(
            customer =>
              customer.customerId ===
              filters.customerId,
          ) ||
          null
        : null;

    await client.query(
      "COMMIT",
    );

    return {
      available:
        true,
      unavailableReason:
        null,
      companyId:
        context.companyId,
      currency,
      filters,
      metrics: {
        outstanding:
          String(
            receivableSubledger,
          ),
        overdue:
          String(
            subledgerTotals.rows[
              0
            ]?.overdue ||
            "0",
          ),
        current:
          String(
            subledgerTotals.rows[
              0
            ]?.current_amount ||
            "0",
          ),
        customerCredits:
          decimalAmount(
            customerCreditSubledger,
          ),
        openInvoiceCount:
          Number(
            subledgerTotals.rows[
              0
            ]?.open_invoice_count ||
            0,
          ),
        overdueInvoiceCount:
          Number(
            subledgerTotals.rows[
              0
            ]?.overdue_invoice_count ||
            0,
          ),
        customersWithBalance:
          Number(
            subledgerTotals.rows[
              0
            ]?.customers_with_balance ||
            0,
          ),
        dsoDays,
      },
      receivableControl,
      customerCreditControl,
      aging,
      customers,
      customerCredits:
        creditByCustomer.rows.map(
          row => ({
            customerId:
              String(
                row.customer_id,
              ),
            customerName:
              String(
                row.customer_name ||
                "",
              ),
            unappliedReceipts:
              String(
                row.unapplied_receipts ||
                "0",
              ),
            unusedCreditNotes:
              String(
                row.unused_credit_notes ||
                "0",
              ),
            totalCredit:
              String(
                row.total_credit ||
                "0",
              ),
          }),
        ),
      openItems:
        openItems.rows.map(
          row => ({
            invoiceId:
              String(
                row.invoice_id,
              ),
            invoiceNumber:
              String(
                row.invoice_number ||
                "",
              ),
            customerId:
              String(
                row.customer_id,
              ),
            customerName:
              String(
                row.customer_name ||
                "",
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
            baseCurrency:
              String(
                row.base_currency ||
                currency,
              ),
            exchangeRate:
              String(
                row.exchange_rate ||
                "1",
              ),
            totalAmount:
              String(
                row.total_amount ||
                "0",
              ),
            balanceDue:
              String(
                row.balance_due ||
                "0",
              ),
            baseBalanceDue:
              String(
                row.base_balance_due ||
                "0",
              ),
            effectiveStatus:
              String(
                row.effective_status ||
                "",
              ),
            daysOverdue:
              Number(
                row.days_overdue ||
                0,
              ),
            agingBucket:
              String(
                row.aging_bucket ||
                "",
              ),
          }),
        ),
      openItemCount:
        Number(
          openCount.rows[
            0
          ]?.count ||
          0,
        ),
      selectedCustomer,
    };
  } catch (
    error
  ) {
    await client.query(
      "ROLLBACK",
    );
    throw error;
  } finally {
    client.release();
  }
}
