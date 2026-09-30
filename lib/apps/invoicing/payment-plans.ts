import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  INVOICING_PERMISSIONS,
  InvoicingError,
  isoDate,
  money,
  nextDocumentNumber,
  numberInput,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


type InstallmentInput = {
  dueDate: string;
  amount: number;
  label: string | null;
};


async function recordPaymentPlanActivity(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    invoiceId: string;
    planId: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
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
        'invoicing.payment_plan',
        $3,$4,$5,$6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.planId,
      input.type,
      input.content,
      JSON.stringify({
        invoiceId:
          input.invoiceId,
        ...(
          input.metadata ||
          {}
        ),
      }),
    ],
  );
}


function parseInstallments(
  raw:
    unknown,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Add at least two installments.',
    );
  }

  if (
    raw.length <
      2 ||
    raw.length >
      120
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A payment plan must contain between 2 and 120 installments.',
    );
  }

  const parsed:
    InstallmentInput[] =
      raw.map(
        (
          item,
          index,
        ) => {
          const row =
            item &&
            typeof item ===
              'object' &&
            !Array.isArray(
              item,
            )
              ? item as
                  Record<
                    string,
                    unknown
                  >
              : {};

          const dueDate =
            isoDate(
              row.dueDate,
            );

          const amount =
            numberInput(
              row.amount,
              'Installment ' +
              (
                index +
                1
              ) +
              ' amount',
              {
                min:
                  0.0001,
              },
            );

          const label =
            cleanText(
              row.label,
              180,
            ) ||
            null;

          return {
            dueDate,
            amount:
              money(
                amount,
              ),
            label,
          };
        },
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.dueDate
            .localeCompare(
              right.dueDate,
            ),
      );

  return parsed;
}


export async function createInvoicePaymentPlan(
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

  const name =
    cleanText(
      input.name,
      180,
    ) ||
    'Installment plan';

  const notes =
    cleanText(
      input.notes,
      4000,
    ) ||
    null;

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      160,
    );

  if (
    idempotencyKey.length <
      8
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A valid payment-plan request key is required.',
    );
  }

  const installments =
    parseInstallments(
      input.installments,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

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
        [
          'invoicing-payment-plan',
          context.companyId,
          invoiceId,
        ].join(
          ':',
        ),
      ],
    );

    const previous =
      await client.query(
        `
          SELECT
            plan_id,
            plan_number,
            effective_status,
            total_amount,
            paid_amount,
            balance_due,
            next_due_date
          FROM invoicing_payment_plan_balances
          WHERE company_id =
                $1
            AND plan_id = (
              SELECT id
              FROM invoicing_payment_plans
              WHERE company_id =
                    $1
                AND idempotency_key =
                    $2
              LIMIT 1
            )
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

      const row =
        previous.rows[0];

      return {
        planId:
          String(
            row.plan_id,
          ),
        planNumber:
          String(
            row.plan_number,
          ),
        status:
          String(
            row.effective_status,
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
        nextDueDate:
          row.next_due_date
            ? String(
                row.next_due_date,
              )
            : null,
        reused:
          true,
      };
    }

    const invoiceResult =
      await client.query(
        `
          SELECT
            invoice.id,
            invoice.invoice_number,
            invoice.customer_id,
            invoice.invoice_date,
            invoice.due_date,
            invoice.currency,
            invoice.total_amount,
            invoice.status,
            COALESCE(
              aging.balance_due,
              invoice.total_amount
            )
              AS balance_due
          FROM invoicing_invoices invoice
          LEFT JOIN invoicing_aging aging
            ON aging.invoice_id =
               invoice.id
           AND aging.company_id =
               invoice.company_id
          WHERE invoice.id =
                $1
            AND invoice.company_id =
                $2
            AND invoice.deleted_at
                IS NULL
          FOR UPDATE OF invoice
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
        String(
          invoice.status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'This invoice cannot be placed on a payment plan in its current state.',
      );
    }

    const activePlan =
      await client.query(
        `
          SELECT
            plan_number
          FROM invoicing_payment_plans
          WHERE company_id =
                $1
            AND invoice_id =
                $2
            AND status =
                'active'
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          invoiceId,
        ],
      );

    if (
      activePlan.rows.length >
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice ' +
        String(
          invoice.invoice_number,
        ) +
        ' already has active payment plan ' +
        String(
          activePlan.rows[0]
            .plan_number,
        ) +
        '. Cancel it before creating another plan.',
      );
    }

    const currentBalance =
      money(
        invoice.balance_due,
      );

    if (
      currentBalance <=
        0
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'This invoice has no remaining balance to schedule.',
      );
    }

    const installmentTotal =
      money(
        installments.reduce(
          (
            total,
            installment,
          ) =>
            total +
            installment.amount,
          0,
        ),
      );

    if (
      Math.abs(
        installmentTotal -
        currentBalance,
      ) >
        0.01
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Installments must total the current invoice balance of ' +
        currentBalance.toFixed(
          2,
        ) +
        '.',
      );
    }

    const invoiceDate =
      isoDate(
        invoice.invoice_date,
      );

    for (
      const installment
      of installments
    ) {
      if (
        installment.dueDate <
        invoiceDate
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Installment due dates cannot be earlier than the invoice date.',
        );
      }
    }

    const planNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment_plan',
      );

    const originalDueDate =
      isoDate(
        invoice.due_date,
      );

    const finalDueDate =
      installments[
        installments.length -
        1
      ].dueDate;

    const settledBaselineAmount =
      money(
        money(
          invoice.total_amount,
        ) -
        currentBalance,
      );

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_payment_plans (
            company_id,
            invoice_id,
            customer_id,
            plan_number,
            name,
            status,
            currency,
            original_due_date,
            final_due_date,
            total_amount,
            settled_baseline_amount,
            installment_count,
            notes,
            idempotency_key,
            activated_at,
            activated_by,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,
            'active',
            $6,$7,$8,$9,$10,$11,$12,$13,
            NOW(),$14,$14,$14,
            jsonb_build_object(
              'invoiceNumber',
              $15::text,
              'balanceAtActivation',
              $9::numeric
            )
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          invoiceId,
          invoice.customer_id,
          planNumber,
          name,
          String(
            invoice.currency,
          ),
          originalDueDate,
          finalDueDate,
          currentBalance,
          settledBaselineAmount,
          installments.length,
          notes,
          idempotencyKey,
          context.userId,
          String(
            invoice.invoice_number,
          ),
        ],
      );

    const planId =
      String(
        inserted.rows[0].id,
      );

    for (
      let index =
        0;
      index <
      installments.length;
      index +=
        1
    ) {
      const installment =
        installments[
          index
        ];

      await client.query(
        `
          INSERT INTO invoicing_payment_plan_installments (
            company_id,
            plan_id,
            invoice_id,
            sequence_no,
            label,
            due_date,
            amount,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,
            jsonb_build_object(
              'createdFromPlan',
              TRUE
            )
          )
        `,
        [
          context.companyId,
          planId,
          invoiceId,
          index +
          1,
          installment.label,
          installment.dueDate,
          installment.amount,
        ],
      );
    }

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          due_date =
            $3,
          updated_at =
            NOW(),
          updated_by =
            $4,
          metadata =
            metadata ||
            jsonb_build_object(
              'paymentPlanId',
              $5::text,
              'paymentPlanNumber',
              $6::text
            )
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        finalDueDate,
        context.userId,
        planId,
        planNumber,
      ],
    );

    await recordPaymentPlanActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        planId,
        type:
          'invoicing.payment_plan_created',
        content:
          'Payment plan ' +
          planNumber +
          ' created for invoice ' +
          String(
            invoice.invoice_number,
          ) +
          '.',
        metadata: {
          planNumber,
          installmentCount:
            installments.length,
          totalAmount:
            currentBalance,
          originalDueDate,
          finalDueDate,
          settledBaselineAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      planId,
      planNumber,
      invoiceId,
      invoiceNumber:
        String(
          invoice.invoice_number,
        ),
      status:
        'active',
      totalAmount:
        currentBalance,
      paidAmount:
        0,
      balanceDue:
        currentBalance,
      installmentCount:
        installments.length,
      nextDueDate:
        installments[0]
          .dueDate,
      originalDueDate,
      finalDueDate,
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


export async function cancelInvoicePaymentPlan(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .PAYMENT_RECORD,
    );

  const planId =
    requireUuid(
      input.planId,
      'Payment plan',
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
      'Cancellation reason is required.',
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
            plan.id,
            plan.invoice_id,
            plan.plan_number,
            plan.original_due_date,
            plan.final_due_date,
            invoice.invoice_number,
            invoice.status
          FROM invoicing_payment_plans plan
          INNER JOIN invoicing_invoices invoice
            ON invoice.id =
               plan.invoice_id
           AND invoice.company_id =
               plan.company_id
          WHERE plan.id =
                $1
            AND plan.company_id =
                $2
            AND plan.status =
                'active'
          LIMIT 1
          FOR UPDATE OF plan, invoice
        `,
        [
          planId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Active payment plan was not found.',
      );
    }

    const row =
      result.rows[0];

    await client.query(
      `
        UPDATE invoicing_payment_plans
        SET
          status =
            'cancelled',
          cancelled_at =
            NOW(),
          cancelled_by =
            $3,
          cancellation_reason =
            $4,
          updated_at =
            NOW(),
          updated_by =
            $3
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        planId,
        context.companyId,
        context.userId,
        reason,
      ],
    );

    if (
      ![
        'paid',
        'cancelled',
        'void',
        'written_off',
      ].includes(
        String(
          row.status,
        ),
      )
    ) {
      await client.query(
        `
          UPDATE invoicing_invoices
          SET
            due_date =
              $3,
            updated_at =
              NOW(),
            updated_by =
              $4,
            metadata =
              metadata -
              'paymentPlanId' -
              'paymentPlanNumber'
          WHERE id =
                $1
            AND company_id =
                $2
            AND due_date =
                $5
        `,
        [
          row.invoice_id,
          context.companyId,
          row.original_due_date,
          context.userId,
          row.final_due_date,
        ],
      );
    }

    await recordPaymentPlanActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId:
          String(
            row.invoice_id,
          ),
        planId,
        type:
          'invoicing.payment_plan_cancelled',
        content:
          'Payment plan ' +
          String(
            row.plan_number,
          ) +
          ' cancelled.',
        metadata: {
          reason,
          restoredDueDate:
            String(
              row.original_due_date,
            ),
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      planId,
      status:
        'cancelled',
      invoiceId:
        String(
          row.invoice_id,
        ),
      invoiceNumber:
        String(
          row.invoice_number,
        ),
      reason,
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
