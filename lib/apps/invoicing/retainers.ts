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

import {
  postInvoicePaymentToAccounting,
} from '@/lib/apps/invoicing/accounting';


async function recordRetainerActivity(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    retainerId:
      string;
    type:
      string;
    content:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
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
        'invoicing.retainer',
        $3,$4,$5,$6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.retainerId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}


export async function recordCustomerRetainer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      [
        INVOICING_PERMISSIONS
          .RETAINER_MANAGE,
        INVOICING_PERMISSIONS
          .PAYMENT_RECORD,
      ],
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const amount =
    numberInput(
      input.amount,
      'Retainer amount',
      {
        min:
          0.0001,
      },
    );

  const retainerTypeRaw =
    cleanText(
      input.retainerType,
      20,
    );

  const retainerType =
    [
      'retainer',
      'deposit',
    ].includes(
      retainerTypeRaw,
    )
      ? retainerTypeRaw
      : 'retainer';

  const method =
    cleanText(
      input.method,
      50,
    ) ||
    'other';

  const reference =
    cleanText(
      input.reference,
      255,
    ) ||
    null;

  const purpose =
    cleanText(
      input.purpose,
      4000,
    ) ||
    null;

  const expectedUseRaw =
    cleanText(
      input.expectedUseDate,
      20,
    );

  const expectedUseDate =
    expectedUseRaw
      ? isoDate(
          expectedUseRaw,
        )
      : null;

  const receivedDate =
    isoDate(
      input.receivedDate,
      new Date(),
    );

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      120,
    );

  if (
    idempotencyKey.length <
      8
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A valid retainer request key is required.',
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
        SELECT
          pg_advisory_xact_lock(
            hashtext(
              $1
            )
          )
      `,
      [
        [
          'invoicing-retainer',
          context.companyId,
          idempotencyKey,
        ].join(
          ':',
        ),
      ],
    );

    const previous =
      await client.query(
        `
          SELECT
            r.id,
            r.retainer_number,
            r.payment_id,
            b.payment_number,
            b.amount,
            b.currency,
            b.allocated_amount,
            b.refunded_amount,
            b.available_amount,
            b.effective_status
          FROM invoicing_retainers r
          INNER JOIN invoicing_retainer_balances b
            ON b.retainer_id =
               r.id
           AND b.company_id =
               r.company_id
          WHERE r.company_id =
                $1
            AND r.idempotency_key =
                $2
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
        retainerId:
          String(
            row.id,
          ),
        retainerNumber:
          String(
            row.retainer_number,
          ),
        paymentId:
          String(
            row.payment_id,
          ),
        paymentNumber:
          String(
            row.payment_number,
          ),
        amount:
          money(
            row.amount,
          ),
        currency:
          String(
            row.currency,
          ),
        allocatedAmount:
          money(
            row.allocated_amount,
          ),
        refundedAmount:
          money(
            row.refunded_amount,
          ),
        availableAmount:
          money(
            row.available_amount,
          ),
        status:
          String(
            row.effective_status,
          ),
        reused:
          true,
      };
    }

    const customerResult =
      await client.query(
        `
          SELECT
            id,
            name,
            currency,
            status
          FROM invoicing_customers
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
          FOR UPDATE
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
        'Customer was not found.',
      );
    }

    const customer =
      customerResult.rows[0];

    if (
      String(
        customer.status,
      ) !==
        'active'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Retainers and deposits can only be received from an active customer.',
      );
    }

    if (
      reference
    ) {
      const duplicate =
        await client.query(
          `
            SELECT
              payment_number
            FROM invoicing_payments
            WHERE company_id =
                  $1
              AND deleted_at
                  IS NULL
              AND LOWER(
                    BTRIM(
                      COALESCE(
                        method,
                        ''
                      )
                    )
                  ) =
                  $2
              AND LOWER(
                    BTRIM(
                      COALESCE(
                        reference,
                        ''
                      )
                    )
                  ) =
                  $3
            LIMIT 1
          `,
          [
            context.companyId,
            method
              .toLowerCase(),
            reference
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

    const retainerNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'retainer',
      );

    const currency =
      String(
        customer.currency ||
        context.company
          .currentCompany
          .currency ||
        'KES',
      )
        .trim()
        .toUpperCase()
        .slice(
          0,
          3,
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
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,
            1,$7,$8,$9,
            'customer_credit',
            'posted',
            $10,$11,$11,
            jsonb_build_object(
              'source',
              'retainer',
              'retainerType',
              $12::text
            )
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          paymentNumber,
          customerId,
          receivedDate,
          amount,
          currency,
          method,
          reference,
          (
            'retainer:' +
            idempotencyKey
          ).slice(
            0,
            160,
          ),
          purpose,
          context.userId,
          retainerType,
        ],
      );

    const paymentId =
      String(
        payment.rows[0].id,
      );

    const retainer =
      await client.query(
        `
          INSERT INTO invoicing_retainers (
            company_id,
            customer_id,
            payment_id,
            retainer_number,
            retainer_type,
            purpose,
            expected_use_date,
            idempotency_key,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$9,
            jsonb_build_object(
              'paymentNumber',
              $10::text
            )
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          customerId,
          paymentId,
          retainerNumber,
          retainerType,
          purpose,
          expectedUseDate,
          idempotencyKey,
          context.userId,
          paymentNumber,
        ],
      );

    const retainerId =
      String(
        retainer.rows[0].id,
      );

    await client.query(
      `
        UPDATE invoicing_payments
        SET
          metadata =
            metadata ||
            jsonb_build_object(
              'retainerId',
              $3::text,
              'retainerNumber',
              $4::text
            ),
          updated_at =
            NOW(),
          updated_by =
            $5
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        paymentId,
        context.companyId,
        retainerId,
        retainerNumber,
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
        paymentDate:
          receivedDate,
        amount,
        exchangeRate:
          1,
      },
    );

    await recordRetainerActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        retainerId,
        type:
          'invoicing.retainer_received',
        content:
          (
            retainerType ===
              'deposit'
              ? 'Deposit '
              : 'Retainer '
          ) +
          retainerNumber +
          ' received from ' +
          String(
            customer.name,
          ) +
          '.',
        metadata: {
          paymentId,
          paymentNumber,
          customerId,
          amount,
          currency,
          method,
          reference,
          expectedUseDate,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      retainerId,
      retainerNumber,
      paymentId,
      paymentNumber,
      customerId,
      customerName:
        String(
          customer.name,
        ),
      retainerType,
      amount:
        money(
          amount,
        ),
      currency,
      allocatedAmount:
        0,
      refundedAmount:
        0,
      availableAmount:
        money(
          amount,
        ),
      status:
        'active',
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
