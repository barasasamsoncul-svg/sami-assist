import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  postCreditNoteApplicationToAccounting,
  postCreditNoteRefundToAccounting,
  postInvoiceCreditToAccounting,
  reverseInvoicingAccountingEvent,
} from '@/lib/apps/invoicing/accounting';

import {
  reconcileInvoiceSettlementStatus,
} from '@/lib/apps/invoicing/commands';

import {
  cleanText,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  nextDocumentNumber,
  nullableText,
  numberInput,
  recordInvoicingActivity,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


async function refreshCreditStatus(
  client:
    PoolClient,
  companyId:
    string,
  creditNoteId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          total_amount,
          applied_amount,
          refunded_amount,
          available_amount
        FROM invoicing_credit_note_balances
        WHERE company_id = $1
          AND credit_note_id = $2
        LIMIT 1
      `,
      [
        companyId,
        creditNoteId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    return {
      status:
        'cancelled',
      totalAmount:
        0,
      appliedAmount:
        0,
      refundedAmount:
        0,
      availableAmount:
        0,
    };
  }

  const row =
    result.rows[0];

  const totalAmount =
    money(
      row.total_amount,
    );

  const appliedAmount =
    money(
      row.applied_amount,
    );

  const refundedAmount =
    money(
      row.refunded_amount,
    );

  const availableAmount =
    money(
      row.available_amount,
    );

  let status =
    'issued';

  if (
    availableAmount <=
      0.0001
  ) {
    status =
      refundedAmount >=
        totalAmount -
        0.0001
        ? 'refunded'
        : 'applied';
  } else if (
    refundedAmount >
      0
  ) {
    status =
      'partially_refunded';
  } else if (
    appliedAmount >
      0
  ) {
    status =
      'partially_applied';
  }

  await client.query(
    `
      UPDATE invoicing_credit_notes
      SET
        status = $3,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND status <> 'cancelled'
    `,
    [
      creditNoteId,
      companyId,
      status,
    ],
  );

  return {
    status,
    totalAmount,
    appliedAmount,
    refundedAmount,
    availableAmount,
  };
}


function operationKey(
  raw:
    unknown,
  prefix:
    string,
) {
  const supplied =
    cleanText(
      raw,
      120,
    );

  return (
    prefix +
    ':' +
    (
      supplied ||
      crypto
        .randomUUID()
    )
  );
}


export async function issueInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_ISSUE,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
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

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      120,
    ) ||
    null;

  const requestedItems =
    Array.isArray(
      input.items,
    )
      ? input.items
          .filter(
            value =>
              value &&
              typeof value ===
                'object' &&
              !Array.isArray(
                value,
              ),
          )
          .map(
            value =>
              value as
                Record<
                  string,
                  unknown
                >,
          )
      : [];

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
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
      settings.rows[0]
        ?.allow_credit_notes ===
      false
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit notes are disabled for this company.',
      );
    }

    if (
      idempotencyKey
    ) {
      const duplicate =
        await client.query(
          `
            SELECT
              id,
              credit_note_number,
              total_amount,
              status
            FROM invoicing_credit_notes
            WHERE company_id = $1
              AND idempotency_key = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            context.companyId,
            idempotencyKey,
          ],
        );

      if (
        duplicate.rows.length >
          0
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          id:
            String(
              duplicate.rows[0]
                .id,
            ),
          creditNoteNumber:
            String(
              duplicate.rows[0]
                .credit_note_number,
            ),
          amount:
            money(
              duplicate.rows[0]
                .total_amount,
            ),
          status:
            String(
              duplicate.rows[0]
                .status,
            ),
          duplicate:
            true,
        };
      }
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
            total_amount,
            status
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

    const invoice =
      locked.rows[0];

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
          invoice.status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'A credit note cannot be issued for this invoice state.',
      );
    }

    const priorCredits =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(total_amount),
              0
            )::numeric(19,4)
              AS total
          FROM invoicing_credit_notes
          WHERE company_id = $1
            AND invoice_id = $2
            AND status <> 'cancelled'
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          invoiceId,
        ],
      );

    const maxCreditable =
      money(
        Math.max(
          money(
            invoice.total_amount,
          ) -
          money(
            priorCredits.rows[0]
              ?.total,
          ),
          0,
        ),
      );

    type PreparedLine = {
      invoiceItemId:
        string |
        null;
      description:
        string;
      quantity:
        number;
      unitPrice:
        number;
      subtotal:
        number;
      discountAmount:
        number;
      taxRate:
        number;
      taxAmount:
        number;
      lineTotal:
        number;
    };

    const lines:
      PreparedLine[] =
        [];

    if (
      requestedItems.length >
        0
    ) {
      const source =
        await client.query(
          `
            SELECT
              item.id,
              item.description,
              item.quantity,
              item.unit_price,
              item.discount_amount,
              item.tax_rate,
              item.tax_amount,
              item.line_total,
              COALESCE(
                (
                  SELECT SUM(
                    credited.quantity
                  )
                  FROM invoicing_credit_note_items credited
                  INNER JOIN invoicing_credit_notes note
                    ON note.id = credited.credit_note_id
                   AND note.company_id = credited.company_id
                  WHERE credited.invoice_item_id = item.id
                    AND credited.company_id = item.company_id
                    AND note.status <> 'cancelled'
                    AND note.deleted_at IS NULL
                ),
                0
              )::numeric(19,4)
                AS credited_quantity
            FROM invoicing_invoice_items item
            WHERE item.invoice_id = $1
              AND item.company_id = $2
          `,
          [
            invoiceId,
            context.companyId,
          ],
        );

      const sourceMap =
        new Map(
          source.rows.map(
            row => [
              String(
                row.id,
              ),
              row,
            ],
          ),
        );

      for (
        const requested
        of requestedItems
      ) {
        const invoiceItemId =
          requireUuid(
            requested.invoiceItemId,
            'Invoice item',
          );

        const sourceLine =
          sourceMap.get(
            invoiceItemId,
          );

        if (
          !sourceLine
        ) {
          throw new InvoicingError(
            'INVALID_INPUT',
            'A credited line does not belong to this invoice.',
          );
        }

        const originalQuantity =
          money(
            sourceLine.quantity,
          );

        const availableQuantity =
          money(
            Math.max(
              originalQuantity -
              money(
                sourceLine
                  .credited_quantity,
              ),
              0,
            ),
          );

        const quantity =
          numberInput(
            requested.quantity,
            'Credit quantity',
            {
              min:
                0.0001,
            },
          );

        if (
          quantity >
            availableQuantity +
            0.0001
        ) {
          throw new InvoicingError(
            'INVALID_INPUT',
            'Credit quantity exceeds the remaining quantity available on ' +
            String(
              sourceLine.description,
            ) +
            '.',
            {
              availableQuantity,
            },
          );
        }

        const ratio =
          originalQuantity >
            0
            ? quantity /
              originalQuantity
            : 0;

        const unitPrice =
          money(
            sourceLine.unit_price,
          );

        lines.push({
          invoiceItemId,
          description:
            String(
              sourceLine.description,
            ),
          quantity,
          unitPrice,
          subtotal:
            money(
              unitPrice *
              quantity,
            ),
          discountAmount:
            money(
              money(
                sourceLine
                  .discount_amount,
              ) *
              ratio,
            ),
          taxRate:
            money(
              sourceLine.tax_rate,
            ),
          taxAmount:
            money(
              money(
                sourceLine
                  .tax_amount,
              ) *
              ratio,
            ),
          lineTotal:
            money(
              money(
                sourceLine
                  .line_total,
              ) *
              ratio,
            ),
        });
      }
    } else {
      const amount =
        numberInput(
          input.amount,
          'Credit amount',
          {
            min:
              0.0001,
          },
        );

      lines.push({
        invoiceItemId:
          null,
        description:
          reason,
        quantity:
          1,
        unitPrice:
          amount,
        subtotal:
          amount,
        discountAmount:
          0,
        taxRate:
          0,
        taxAmount:
          0,
        lineTotal:
          amount,
      });
    }

    const subtotal =
      money(
        lines.reduce(
          (
            total,
            line,
          ) =>
            total +
            line.subtotal -
            line.discountAmount,
          0,
        ),
      );

    const taxTotal =
      money(
        lines.reduce(
          (
            total,
            line,
          ) =>
            total +
            line.taxAmount,
          0,
        ),
      );

    const totalAmount =
      money(
        lines.reduce(
          (
            total,
            line,
          ) =>
            total +
            line.lineTotal,
          0,
        ),
      );

    if (
      totalAmount <=
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit note total must be greater than zero.',
      );
    }

    if (
      totalAmount >
        maxCreditable +
        0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit note cannot exceed the remaining amount available to credit on the original invoice.',
        {
          maxCreditable,
        },
      );
    }

    const aging =
      await client.query(
        `
          SELECT
            balance_due
          FROM invoicing_aging
          WHERE invoice_id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    const sourceOffset =
      money(
        Math.min(
          money(
            aging.rows[0]
              ?.balance_due,
          ),
          totalAmount,
        ),
      );

    const availableCustomerCredit =
      money(
        totalAmount -
        sourceOffset,
      );

    const creditNoteNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'credit_note',
      );

    const issueDate =
      isoDate(
        input.issueDate,
        new Date(),
      );

    const inserted =
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
            tax_total,
            total_amount,
            idempotency_key,
            issued_at,
            issued_by,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,
            'issued',
            $5,$6,$7,$8,$9,$10,$11,
            NOW(),$12,$12,$12
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          invoiceId,
          invoice.customer_id,
          creditNoteNumber,
          issueDate,
          invoice.currency,
          reason,
          subtotal,
          taxTotal,
          totalAmount,
          idempotencyKey,
          context.userId,
        ],
      );

    const creditNoteId =
      String(
        inserted.rows[0].id,
      );

    for (
      const line
      of lines
    ) {
      await client.query(
        `
          INSERT INTO invoicing_credit_note_items (
            credit_note_id,
            company_id,
            invoice_item_id,
            description,
            quantity,
            unit_price,
            subtotal,
            discount_amount,
            tax_rate,
            tax_amount,
            line_total
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
          )
        `,
        [
          creditNoteId,
          context.companyId,
          line.invoiceItemId,
          line.description,
          line.quantity,
          line.unitPrice,
          line.subtotal,
          line.discountAmount,
          line.taxRate,
          line.taxAmount,
          line.lineTotal,
        ],
      );
    }

    if (
      sourceOffset >
        0
    ) {
      await client.query(
        `
          INSERT INTO invoicing_credit_note_applications (
            company_id,
            credit_note_id,
            target_invoice_id,
            application_type,
            amount,
            status,
            operation_key,
            applied_by,
            metadata
          )
          VALUES (
            $1,$2,$3,
            'source_offset',
            $4,
            'posted',
            $5,$6,
            '{"createdWithCreditNote":true}'::jsonb
          )
        `,
        [
          context.companyId,
          creditNoteId,
          invoiceId,
          sourceOffset,
          'source-offset:' +
          creditNoteId,
          context.userId,
        ],
      );
    }

    await postInvoiceCreditToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        creditNoteId,
        creditNoteNumber,
        totalAmount,
        subtotal,
        taxTotal,
        receivableAmount:
          sourceOffset,
        customerCreditAmount:
          availableCustomerCredit,
        exchangeRate:
          Number(
            invoice.exchange_rate ||
            1,
          ),
      },
    );

    const creditState =
      await refreshCreditStatus(
        client,
        context.companyId,
        creditNoteId,
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
          creditNoteId,
          amount:
            totalAmount,
          sourceOffset,
          availableCredit:
            creditState
              .availableAmount,
          lineCount:
            lines.length,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        creditNoteId,
      creditNoteNumber,
      amount:
        totalAmount,
      status:
        creditState.status,
      sourceOffset,
      availableCredit:
        creditState
          .availableAmount,
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
      duplicate:
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


export async function applyInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_APPLY,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const targetInvoiceId =
    requireUuid(
      input.targetInvoiceId,
      'Target invoice',
    );

  const amount =
    numberInput(
      input.amount,
      'Credit application amount',
      {
        min:
          0.0001,
      },
    );

  const key =
    operationKey(
      input.idempotencyKey,
      'credit-application',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            amount
          FROM invoicing_credit_note_applications
          WHERE company_id = $1
            AND operation_key = $2
          LIMIT 1
        `,
        [
          context.companyId,
          key,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        applicationId:
          String(
            duplicate.rows[0]
              .id,
          ),
        amount:
          money(
            duplicate.rows[0]
              .amount,
          ),
        duplicate:
          true,
      };
    }

    const creditResult =
      await client.query(
        `
          SELECT
            b.customer_id,
            b.credit_note_number,
            b.currency,
            b.available_amount,
            n.status,
            source.exchange_rate
          FROM invoicing_credit_note_balances b
          INNER JOIN invoicing_credit_notes n
            ON n.id = b.credit_note_id
           AND n.company_id = b.company_id
          INNER JOIN invoicing_invoices source
            ON source.id = n.invoice_id
           AND source.company_id = n.company_id
          WHERE b.company_id = $1
            AND b.credit_note_id = $2
          LIMIT 1
          FOR UPDATE OF n
        `,
        [
          context.companyId,
          creditNoteId,
        ],
      );

    if (
      creditResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CREDIT_NOTE_NOT_FOUND',
        'Credit note was not found or has no available balance.',
      );
    }

    const credit =
      creditResult.rows[0];

    const available =
      money(
        credit.available_amount,
      );

    if (
      amount >
        available +
        0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit application exceeds the available customer credit.',
        {
          availableCredit:
            available,
        },
      );
    }

    const targetResult =
      await client.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.customer_id,
            i.currency,
            i.exchange_rate,
            i.status,
            a.balance_due
          FROM invoicing_invoices i
          INNER JOIN invoicing_aging a
            ON a.invoice_id = i.id
           AND a.company_id = i.company_id
          WHERE i.id = $1
            AND i.company_id = $2
            AND i.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF i
        `,
        [
          targetInvoiceId,
          context.companyId,
        ],
      );

    if (
      targetResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Target invoice was not found.',
      );
    }

    const target =
      targetResult.rows[0];

    if (
      String(
        target.customer_id,
      ) !==
      String(
        credit.customer_id,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Customer credit can only be applied to an invoice for the same customer.',
      );
    }

    if (
      String(
        target.currency,
      ) !==
      String(
        credit.currency,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Customer credit and target invoice must use the same currency.',
      );
    }

    const targetBalance =
      money(
        target.balance_due,
      );

    if (
      targetBalance <=
        0 ||
      amount >
        targetBalance +
        0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit application exceeds the target invoice balance.',
        {
          balance:
            targetBalance,
        },
      );
    }

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_credit_note_applications (
            company_id,
            credit_note_id,
            target_invoice_id,
            application_type,
            amount,
            status,
            operation_key,
            applied_by
          )
          VALUES (
            $1,$2,$3,
            'customer_credit',
            $4,
            'posted',
            $5,$6
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          creditNoteId,
          targetInvoiceId,
          amount,
          key,
          context.userId,
        ],
      );

    const applicationId =
      String(
        inserted.rows[0].id,
      );

    await postCreditNoteApplicationToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        creditNoteId,
        applicationId,
        creditNoteNumber:
          String(
            credit.credit_note_number,
          ),
        invoiceNumber:
          String(
            target.invoice_number,
          ),
        amount,
        exchangeRate:
          Number(
            target.exchange_rate ||
            credit.exchange_rate ||
            1,
          ),
      },
    );

    const creditState =
      await refreshCreditStatus(
        client,
        context.companyId,
        creditNoteId,
      );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        targetInvoiceId,
        'Customer credit ' +
        String(
          credit.credit_note_number,
        ) +
        ' applied.',
      );

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId:
          targetInvoiceId,
        type:
          'invoice.credit_applied',
        content:
          'Credit note ' +
          String(
            credit.credit_note_number,
          ) +
          ' applied.',
        metadata: {
          creditNoteId,
          applicationId,
          amount,
          availableCredit:
            creditState
              .availableAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      applicationId,
      creditNoteId,
      targetInvoiceId,
      amount,
      status:
        creditState.status,
      availableCredit:
        creditState
          .availableAmount,
      invoiceStatus:
        settlement.status,
      remainingBalance:
        settlement.balanceDue,
      duplicate:
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


export async function reverseInvoiceCreditApplication(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_APPLY,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const applicationId =
    requireUuid(
      input.applicationId,
      'Credit application',
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
      'A credit application reversal reason is required.',
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
            a.credit_note_id,
            a.target_invoice_id,
            a.application_type,
            a.amount,
            a.status,
            n.credit_note_number
          FROM invoicing_credit_note_applications a
          INNER JOIN invoicing_credit_notes n
            ON n.id = a.credit_note_id
           AND n.company_id = a.company_id
          WHERE a.id = $1
            AND a.company_id = $2
          LIMIT 1
          FOR UPDATE OF a
        `,
        [
          applicationId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit application was not found.',
      );
    }

    const application =
      result.rows[0];

    if (
      application.status !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted credit application can be reversed.',
      );
    }

    if (
      application.application_type !==
        'customer_credit'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'The original source-invoice offset can only be reversed by cancelling the credit note.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_credit_note_applications
        SET
          status = 'reversed',
          reversed_by = $3,
          reversed_at = NOW(),
          reversal_reason = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        applicationId,
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
          'credit-application:' +
          applicationId,
        reversalEventKey:
          'credit-application-reversal:' +
          applicationId,
        sourceType:
          'credit_note_application_reversal',
        sourceId:
          applicationId,
        description:
          'Credit application from ' +
          String(
            application.credit_note_number,
          ) +
          ' reversed',
      },
    );

    const creditState =
      await refreshCreditStatus(
        client,
        context.companyId,
        String(
          application.credit_note_id,
        ),
      );

    const targetInvoiceId =
      String(
        application.target_invoice_id,
      );

    const settlement =
      await reconcileInvoiceSettlementStatus(
        client,
        context.companyId,
        context.userId,
        targetInvoiceId,
        'Credit application reversed: ' +
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
          targetInvoiceId,
        type:
          'invoice.credit_application_reversed',
        content:
          'Credit application reversed.',
        metadata: {
          applicationId,
          amount:
            money(
              application.amount,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      applicationId,
      status:
        'reversed',
      availableCredit:
        creditState
          .availableAmount,
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


export async function refundInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_REFUND,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const amount =
    numberInput(
      input.amount,
      'Credit refund amount',
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
      'A credit refund reason is required.',
    );
  }

  const method =
    cleanText(
      input.method,
      40,
    ) ||
    'bank';

  const reference =
    nullableText(
      input.reference,
      255,
    );

  const key =
    operationKey(
      input.idempotencyKey,
      'credit-refund',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const duplicate =
      await client.query(
        `
          SELECT
            id,
            refund_number,
            amount
          FROM invoicing_credit_note_refunds
          WHERE company_id = $1
            AND idempotency_key = $2
          LIMIT 1
        `,
        [
          context.companyId,
          key,
        ],
      );

    if (
      duplicate.rows.length >
        0
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        refundId:
          String(
            duplicate.rows[0]
              .id,
          ),
        refundNumber:
          String(
            duplicate.rows[0]
              .refund_number,
          ),
        amount:
          money(
            duplicate.rows[0]
              .amount,
          ),
        duplicate:
          true,
      };
    }

    const creditResult =
      await client.query(
        `
          SELECT
            b.credit_note_number,
            b.available_amount,
            n.invoice_id,
            source.exchange_rate
          FROM invoicing_credit_note_balances b
          INNER JOIN invoicing_credit_notes n
            ON n.id = b.credit_note_id
           AND n.company_id = b.company_id
          INNER JOIN invoicing_invoices source
            ON source.id = n.invoice_id
           AND source.company_id = n.company_id
          WHERE b.company_id = $1
            AND b.credit_note_id = $2
          LIMIT 1
          FOR UPDATE OF n
        `,
        [
          context.companyId,
          creditNoteId,
        ],
      );

    if (
      creditResult.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'CREDIT_NOTE_NOT_FOUND',
        'Credit note was not found or has no available balance.',
      );
    }

    const credit =
      creditResult.rows[0];

    const available =
      money(
        credit.available_amount,
      );

    if (
      amount >
        available +
        0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit refund exceeds the available customer credit.',
        {
          availableCredit:
            available,
        },
      );
    }

    const refundNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'credit_refund',
      );

    const refundDate =
      isoDate(
        input.refundDate,
        new Date(),
      );

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_credit_note_refunds (
            company_id,
            credit_note_id,
            refund_number,
            refund_date,
            amount,
            method,
            reference,
            reason,
            status,
            idempotency_key,
            created_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            'posted',
            $9,$10
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          creditNoteId,
          refundNumber,
          refundDate,
          amount,
          method,
          reference,
          reason,
          key,
          context.userId,
        ],
      );

    const refundId =
      String(
        inserted.rows[0].id,
      );

    await postCreditNoteRefundToAccounting(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        creditNoteId,
        refundId,
        refundNumber,
        refundDate,
        amount,
        exchangeRate:
          Number(
            credit.exchange_rate ||
            1,
          ),
      },
    );

    const creditState =
      await refreshCreditStatus(
        client,
        context.companyId,
        creditNoteId,
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
            credit.invoice_id,
          ),
        type:
          'invoice.credit_refunded',
        content:
          'Refund ' +
          refundNumber +
          ' posted from credit note ' +
          String(
            credit.credit_note_number,
          ) +
          '.',
        metadata: {
          creditNoteId,
          refundId,
          amount,
          method,
          reference,
          availableCredit:
            creditState
              .availableAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      refundId,
      refundNumber,
      creditNoteId,
      amount,
      status:
        creditState.status,
      availableCredit:
        creditState
          .availableAmount,
      duplicate:
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


export async function reverseInvoiceCreditNoteRefund(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_REFUND,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
    );

  const refundId =
    requireUuid(
      input.refundId,
      'Credit refund',
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
      'A credit refund reversal reason is required.',
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
            r.credit_note_id,
            r.refund_number,
            r.amount,
            r.status,
            n.invoice_id
          FROM invoicing_credit_note_refunds r
          INNER JOIN invoicing_credit_notes n
            ON n.id = r.credit_note_id
           AND n.company_id = r.company_id
          WHERE r.id = $1
            AND r.company_id = $2
          LIMIT 1
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
        'INVALID_INPUT',
        'Credit refund was not found.',
      );
    }

    const refund =
      result.rows[0];

    if (
      refund.status !==
        'posted'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only a posted credit refund can be reversed.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_credit_note_refunds
        SET
          status = 'reversed',
          reversed_by = $3,
          reversed_at = NOW(),
          reversal_reason = $4,
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
          'credit-refund:' +
          refundId,
        reversalEventKey:
          'credit-refund-reversal:' +
          refundId,
        sourceType:
          'credit_note_refund_reversal',
        sourceId:
          refundId,
        description:
          'Credit refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed',
      },
    );

    const creditState =
      await refreshCreditStatus(
        client,
        context.companyId,
        String(
          refund.credit_note_id,
        ),
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
            refund.invoice_id,
          ),
        type:
          'invoice.credit_refund_reversed',
        content:
          'Credit refund ' +
          String(
            refund.refund_number,
          ) +
          ' reversed.',
        metadata: {
          refundId,
          amount:
            money(
              refund.amount,
            ),
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      refundId,
      status:
        'reversed',
      creditNoteStatus:
        creditState.status,
      availableCredit:
        creditState
          .availableAmount,
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
      [
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_CANCEL,
        INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE,
      ],
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
      String(
        credit.status,
      ) ===
        'cancelled'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Credit note is already cancelled.',
      );
    }

    const blockers =
      await client.query(
        `
          SELECT
            (
              SELECT COUNT(*)::int
              FROM invoicing_credit_note_applications app
              WHERE app.credit_note_id = $1
                AND app.company_id = $2
                AND app.application_type = 'customer_credit'
                AND app.status = 'posted'
            ) AS applications,
            (
              SELECT COUNT(*)::int
              FROM invoicing_credit_note_refunds refund
              WHERE refund.credit_note_id = $1
                AND refund.company_id = $2
                AND refund.status = 'posted'
            ) AS refunds
        `,
        [
          creditNoteId,
          context.companyId,
        ],
      );

    if (
      Number(
        blockers.rows[0]
          ?.applications ||
        0,
      ) >
        0
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Reverse customer-credit applications before cancelling this credit note.',
      );
    }

    if (
      Number(
        blockers.rows[0]
          ?.refunds ||
        0,
      ) >
        0
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Reverse posted credit refunds before cancelling this credit note.',
      );
    }

    await client.query(
      `
        UPDATE invoicing_credit_note_applications
        SET
          status = 'reversed',
          reversed_by = $3,
          reversed_at = NOW(),
          reversal_reason = $4,
          updated_at = NOW()
        WHERE credit_note_id = $1
          AND company_id = $2
          AND application_type = 'source_offset'
          AND status = 'posted'
      `,
      [
        creditNoteId,
        context.companyId,
        context.userId,
        'Credit note cancellation: ' +
        reason,
      ],
    );

    await client.query(
      `
        UPDATE invoicing_credit_notes
        SET
          status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by = $3,
          cancellation_reason = $4,
          updated_by = $3,
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

    const invoiceId =
      String(
        credit.invoice_id,
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

    return {
      creditNoteId,
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
