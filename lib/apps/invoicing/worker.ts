import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

import {
  datePlusDays,
  money,
  nextDocumentNumber,
  recordInvoicingActivity,
} from '@/lib/apps/invoicing/context';

import {
  normalizeInvoicingLines,
} from '@/lib/apps/invoicing/commands';

import {
  postInvoiceConfirmationToAccounting,
} from '@/lib/apps/invoicing/accounting';

import {
  deliverInvoice,
  normalizeInvoiceDeliveryChannels,
} from '@/lib/apps/invoicing/delivery';


const MAX_TENANTS_PER_TICK =
  250;

const MAX_RECURRING_PER_TENANT =
  50;

const MAX_REMINDERS_PER_TENANT =
  100;


function databaseCode(
  error:
    unknown,
) {
  if (
    error &&
    typeof error ===
      'object' &&
    'code' in error
  ) {
    return String(
      (
        error as {
          code?:
            unknown;
        }
      ).code ||
      '',
    );
  }

  return '';
}


function missingInvoicingSchema(
  error:
    unknown,
) {
  return [
    '42P01',
    '42703',
  ].includes(
    databaseCode(
      error,
    ),
  );
}


function plainObject(
  value:
    unknown,
):
  Record<string, unknown> {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<string, unknown>
    : {};
}


function dateString(
  value:
    unknown,
) {
  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  return String(
    value ||
    '',
  )
    .slice(
      0,
      10,
    );
}


function advanceDate(
  date:
    string,
  unit:
    string,
  count:
    number,
) {
  const parsed =
    new Date(
      date +
      'T00:00:00Z',
    );

  const amount =
    Math.max(
      1,
      Math.floor(
        count ||
        1,
      ),
    );

  if (
    unit ===
      'day'
  ) {
    parsed.setUTCDate(
      parsed.getUTCDate() +
      amount,
    );
  } else if (
    unit ===
      'week'
  ) {
    parsed.setUTCDate(
      parsed.getUTCDate() +
      amount *
      7,
    );
  } else if (
    unit ===
      'quarter'
  ) {
    parsed.setUTCMonth(
      parsed.getUTCMonth() +
      amount *
      3,
    );
  } else if (
    unit ===
      'year'
  ) {
    parsed.setUTCFullYear(
      parsed.getUTCFullYear() +
      amount,
    );
  } else {
    parsed.setUTCMonth(
      parsed.getUTCMonth() +
      amount,
    );
  }

  return parsed
    .toISOString()
    .slice(
      0,
      10,
    );
}


async function listActiveInvoicingTenants() {
  const result =
    await queryControl(
      `
        SELECT DISTINCT
          td.tenant_id
        FROM tenant_databases td
        INNER JOIN tenants t
          ON t.id =
             td.tenant_id
        INNER JOIN tenant_modules tm
          ON tm.tenant_id =
             t.id
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE LOWER(
                COALESCE(
                  td.status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) =
              'active'
          AND t.deleted_at
              IS NULL
          AND tm.deleted_at
              IS NULL
          AND m.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  m.status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  m.key,
                  ''
                )
              ) =
              'invoicing'
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
        ORDER BY
          td.tenant_id
        LIMIT $1
      `,
      [
        MAX_TENANTS_PER_TICK,
      ],
    );

  return result.rows
    .map(
      row =>
        String(
          row.tenant_id ||
          '',
        ),
    )
    .filter(
      Boolean,
    );
}


async function generateOneRecurringInvoice(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const client =
    await pool.connect();

  let generated:
    {
      invoiceId:
        string;
      recurringRunId:
        string;
      companyId:
        string;
      companyName:
        string;
      userId:
        string |
        null;
      autoSend:
        boolean;
      deliveryChannels:
        ReturnType<
          typeof normalizeInvoiceDeliveryChannels
        >;
    } |
    null =
      null;

  let failedContext:
    {
      recurringId:
        string;
      companyId:
        string;
      scheduledFor:
        string;
      runKey:
        string;
    } |
    null =
      null;

  try {
    await client.query(
      'BEGIN',
    );

    const due =
      await client.query(
        `
          SELECT
            r.id,
            r.company_id,
            r.customer_id,
            r.name,
            r.interval_unit,
            r.interval_count,
            r.end_date,
            r.next_run_at,
            r.max_occurrences,
            r.run_count,
            r.consecutive_failures,
            r.max_retry_attempts,
            r.retry_after,
            r.auto_send,
            r.currency,
            r.invoice_payload,
            COALESCE(
              r.updated_by,
              r.created_by
            )
              AS actor_user_id,
            c.name
              AS customer_name,
            c.email
              AS customer_email,
            c.phone
              AS customer_phone,
            c.billing_address,
            c.tax_id,
            c.currency
              AS customer_currency,
            c.status
              AS customer_status,
            pt.name
              AS payment_terms_name,
            pt.due_days
              AS payment_due_days,
            s.default_currency,
            s.default_due_days,
            s.default_template_id,
            s.tax_calculation,
            s.payment_instructions,
            s.terms_and_conditions,
            s.auto_send_recurring,
            s.require_approval,
            company.name
              AS company_name
          FROM invoicing_recurring_templates r
          INNER JOIN invoicing_customers c
            ON c.id =
               r.customer_id
           AND c.company_id =
               r.company_id
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               r.company_id
           AND pt.deleted_at
               IS NULL
          INNER JOIN invoicing_settings s
            ON s.company_id =
               r.company_id
          INNER JOIN companies company
            ON company.id =
               r.company_id
          WHERE r.status =
                'active'
            AND r.deleted_at
                IS NULL
            AND r.next_run_at <=
                CURRENT_DATE
            AND (
              r.retry_after
                IS NULL
              OR r.retry_after <=
                 NOW()
            )
            AND (
              r.end_date
                IS NULL
              OR r.next_run_at <=
                 r.end_date
            )
            AND (
              r.max_occurrences
                IS NULL
              OR r.run_count <
                 r.max_occurrences
            )
          ORDER BY
            r.next_run_at,
            r.id
          LIMIT 1
          FOR UPDATE OF r
          SKIP LOCKED
        `,
      );

    if (
      due.rows.length ===
        0
    ) {
      await client.query(
        'COMMIT',
      );

      return null;
    }

    const row =
      due.rows[0];

    const recurringId =
      String(
        row.id,
      );

    const scheduledFor =
      dateString(
        row.next_run_at,
      );

    const runKey =
      [
        'recurring',
        recurringId,
        scheduledFor,
      ].join(
        ':',
      );

    failedContext = {
      recurringId,
      companyId:
        String(
          row.company_id,
        ),
      scheduledFor,
      runKey,
    };

    if (
      row.customer_status !==
        'active'
    ) {
      await client.query(
        `
          UPDATE invoicing_recurring_templates
          SET
            status =
              'paused',
            paused_at =
              NOW(),
            paused_by =
              NULL,
            completion_reason =
              NULL,
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) ||
              jsonb_build_object(
                'workerPauseReason',
                'CUSTOMER_INACTIVE',
                'workerPausedAt',
                NOW()
              ),
            updated_at =
              NOW()
          WHERE id =
                $1
        `,
        [
          recurringId,
        ],
      );

      await client.query(
        'COMMIT',
      );

      return {
        paused:
          true,
      };
    }

    const actorUserId =
      row.actor_user_id
        ? String(
            row.actor_user_id,
          )
        : null;

    if (
      !actorUserId
    ) {
      await client.query(
        `
          UPDATE invoicing_recurring_templates
          SET
            status =
              'paused',
            paused_at =
              NOW(),
            paused_by =
              NULL,
            completion_reason =
              NULL,
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) ||
              jsonb_build_object(
                'workerPauseReason',
                'RUN_AS_USER_UNAVAILABLE',
                'workerPausedAt',
                NOW()
              ),
            updated_at =
              NOW()
          WHERE id =
                $1
        `,
        [
          recurringId,
        ],
      );

      await client.query(
        'COMMIT',
      );

      return {
        paused:
          true,
      };
    }

    const existingRun =
      await client.query(
        `
          SELECT
            id,
            status,
            attempt_count,
            invoice_id
          FROM invoicing_recurring_runs
          WHERE recurring_template_id =
                $1
            AND scheduled_for =
                $2::date
          LIMIT 1
          FOR UPDATE
        `,
        [
          recurringId,
          scheduledFor,
        ],
      );

    if (
      existingRun.rows[0]
        ?.status ===
        'succeeded' &&
      existingRun.rows[0]
        ?.invoice_id
    ) {
      const nextRunAt =
        advanceDate(
          scheduledFor,
          String(
            row.interval_unit,
          ),
          Number(
            row.interval_count,
          ),
        );

      await client.query(
        `
          UPDATE invoicing_recurring_templates
          SET
            last_invoice_id =
              $2,
            last_success_at =
              COALESCE(
                last_success_at,
                NOW()
              ),
            run_count =
              GREATEST(
                run_count,
                (
                  SELECT
                    COUNT(*)::int
                  FROM
                    invoicing_recurring_runs rr
                  WHERE
                    rr.recurring_template_id =
                      $1
                    AND rr.status =
                      'succeeded'
                )
              ),
            next_run_at =
              $3::date,
            retry_after =
              NULL,
            completion_reason =
              CASE
                WHEN
                  max_occurrences
                    IS NOT NULL
                  AND
                  (
                    SELECT
                      COUNT(*)::int
                    FROM
                      invoicing_recurring_runs rr
                    WHERE
                      rr.recurring_template_id =
                        $1
                      AND rr.status =
                        'succeeded'
                  ) >=
                  max_occurrences
                THEN
                  'max_occurrences_reached'
                WHEN
                  end_date
                    IS NOT NULL
                  AND $3::date >
                      end_date
                THEN
                  'end_date_reached'
                ELSE
                  completion_reason
              END,
            status =
              CASE
                WHEN
                  (
                    max_occurrences
                      IS NOT NULL
                    AND
                    (
                      SELECT
                        COUNT(*)::int
                      FROM
                        invoicing_recurring_runs rr
                      WHERE
                        rr.recurring_template_id =
                          $1
                        AND rr.status =
                          'succeeded'
                    ) >=
                    max_occurrences
                  )
                  OR
                  (
                    end_date
                      IS NOT NULL
                    AND $3::date >
                        end_date
                  )
                THEN
                  'completed'
                ELSE
                  status
              END,
            updated_at =
              NOW()
          WHERE id =
                $1
        `,
        [
          recurringId,
          existingRun.rows[0]
            .invoice_id,
          nextRunAt,
        ],
      );

      await client.query(
        'COMMIT',
      );

      return {
        skipped:
          true,
        invoiceId:
          String(
            existingRun.rows[0]
              .invoice_id,
          ),
      };
    }

    let recurringRunId:
      string;

    if (
      existingRun.rows.length >
        0
    ) {
      const retried =
        await client.query(
          `
            UPDATE invoicing_recurring_runs
            SET
              status =
                'processing',
              attempt_count =
                attempt_count +
                1,
              started_at =
                NOW(),
              last_attempt_at =
                NOW(),
              completed_at =
                NULL,
              error_code =
                NULL,
              error_message =
                NULL,
              delivery_status =
                'not_requested',
              delivery_error_code =
                NULL,
              updated_at =
                NOW()
            WHERE id =
                  $1
            RETURNING
              id
          `,
          [
            existingRun.rows[0]
              .id,
          ],
        );

      recurringRunId =
        String(
          retried.rows[0].id,
        );
    } else {
      const started =
        await client.query(
          `
            INSERT INTO invoicing_recurring_runs (
              company_id,
              recurring_template_id,
              scheduled_for,
              run_key,
              status,
              attempt_count,
              started_at,
              last_attempt_at
            )
            VALUES (
              $1,$2,$3::date,$4,
              'processing',
              1,
              NOW(),
              NOW()
            )
            RETURNING
              id
          `,
          [
            row.company_id,
            recurringId,
            scheduledFor,
            runKey,
          ],
        );

      recurringRunId =
        String(
          started.rows[0].id,
        );
    }

    const payload =
      plainObject(
        row.invoice_payload,
      );

    const taxCalculation =
      payload.taxCalculation ===
        'inclusive'
        ? 'inclusive' as const
        : payload.taxCalculation ===
            'exclusive'
          ? 'exclusive' as const
          : row.tax_calculation ===
              'inclusive'
            ? 'inclusive' as const
            : 'exclusive' as const;

    const lines =
      await normalizeInvoicingLines(
        client,
        String(
          row.company_id,
        ),
        payload.lines,
        taxCalculation,
      );

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

    const shippingTotal =
      money(
        payload.shippingTotal,
      );

    const roundingAdjustment =
      money(
        payload.roundingAdjustment,
      );

    const totalAmount =
      money(
        subtotal -
        discountTotal +
        (
          taxCalculation ===
            'exclusive'
            ? taxTotal
            : 0
        ) +
        shippingTotal +
        roundingAdjustment,
      );

    const invoiceNumber =
      await nextDocumentNumber(
        client,
        String(
          row.company_id,
        ),
        actorUserId,
        'invoice',
      );

    const invoiceDate =
      scheduledFor;

    const dueDays =
      Math.max(
        0,
        Math.floor(
          Number(
            row.payment_due_days ??
            row.default_due_days ??
            30,
          ),
        ),
      );

    const dueDate =
      datePlusDays(
        invoiceDate,
        dueDays,
      );

    const requestedTemplateId =
      typeof payload.templateId ===
        'string'
        ? payload.templateId
        : '';

    let invoiceTemplateId =
      requestedTemplateId ||
      (
        row.default_template_id
          ? String(
              row.default_template_id,
            )
          : ''
      );

    if (
      invoiceTemplateId
    ) {
      const validTemplate =
        await client.query(
          `
            SELECT 1
            FROM invoicing_templates
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND is_active =
                  TRUE
              AND deleted_at
                  IS NULL
            LIMIT 1
          `,
          [
            invoiceTemplateId,
            row.company_id,
          ],
        );

      if (
        validTemplate.rows.length !==
          1
      ) {
        invoiceTemplateId =
          '';
      }
    }

    const currency =
      String(
        row.currency ||
        row.customer_currency ||
        row.default_currency ||
        'KES',
      )
        .toUpperCase()
        .slice(
          0,
          3,
        );

    const recurringInvoiceStatus =
      row.require_approval ===
        true
        ? 'pending_approval'
        : 'confirmed';

    const invoiceResult =
      await client.query(
        `
          INSERT INTO invoicing_invoices (
            company_id,
            customer_id,
            bill_to_name,
            bill_to_email,
            bill_to_phone,
            bill_to_address,
            bill_to_tax_id,
            payment_terms_name_snapshot,
            tax_calculation,
            template_id,
            invoice_number,
            status,
            invoice_date,
            due_date,
            currency,
            reference,
            purchase_order_number,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            rounding_adjustment,
            total_amount,
            notes,
            terms,
            payment_instructions,
            submitted_at,
            submitted_by,
            confirmed_at,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$28::varchar(30),$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,$22,$23,$24,$25,
            CASE
              WHEN $28::varchar(30) =
                   'pending_approval'
              THEN NOW()
              ELSE NULL
            END,
            CASE
              WHEN $28::varchar(30) =
                   'pending_approval'
              THEN $26::uuid
              ELSE NULL
            END,
            CASE
              WHEN $28::varchar(30) =
                   'confirmed'
              THEN NOW()
              ELSE NULL
            END,
            $26,$26,
            jsonb_build_object(
              'recurringTemplateId',
              $27::text,
              'generatedBy',
              'invoicing_worker',
              'recurringRunKey',
              $29::text,
              'recurringRunId',
              $30::text,
              'recurringScheduledFor',
              $31::text
            )
          )
          RETURNING
            id
        `,
        [
          row.company_id,
          row.customer_id,
          row.customer_name,
          row.customer_email,
          row.customer_phone,
          row.billing_address,
          row.tax_id,
          row.payment_terms_name,
          taxCalculation,
          invoiceTemplateId ||
          null,
          invoiceNumber,
          invoiceDate,
          dueDate,
          currency,
          payload.reference ||
          null,
          payload.purchaseOrderNumber ||
          null,
          subtotal,
          discountTotal,
          taxTotal,
          shippingTotal,
          roundingAdjustment,
          totalAmount,
          payload.notes ||
          null,
          payload.terms ||
          row.terms_and_conditions ||
          null,
          row.payment_instructions ||
          null,
          actorUserId,
          recurringId,
          recurringInvoiceStatus,
          runKey,
          recurringRunId,
          scheduledFor,
        ],
      );

    const invoiceId =
      String(
        invoiceResult.rows[0].id,
      );

    for (
      const line
      of lines
    ) {
      await client.query(
        `
          INSERT INTO invoicing_invoice_items (
            invoice_id,
            company_id,
            catalog_item_id,
            sort_order,
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
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,$17,$18
          )
        `,
        [
          invoiceId,
          row.company_id,
          line.catalogItemId,
          line.sortOrder,
          line.description,
          line.sku,
          line.unit,
          line.quantity,
          line.unitPrice,
          line.discountType,
          line.discountValue,
          line.discountAmount,
          line.taxRateId,
          line.taxName,
          line.taxRate,
          line.taxAmount,
          line.subtotal,
          line.lineTotal,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO invoicing_status_history (
          invoice_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,$3,$4,$5
        )
      `,
      [
        invoiceId,
        row.company_id,
        recurringInvoiceStatus,
        recurringInvoiceStatus ===
          'pending_approval'
          ? 'Generated from recurring invoice schedule and submitted for approval'
          : 'Generated and posted from recurring invoice schedule',
        actorUserId,
      ],
    );

    if (
      recurringInvoiceStatus ===
        'confirmed'
    ) {
      await postInvoiceConfirmationToAccounting(
        client,
        {
          companyId:
            String(
              row.company_id,
            ),
          userId:
            actorUserId,
          invoiceId,
        },
      );
    }

    await recordInvoicingActivity(
      client,
      {
        companyId:
          String(
            row.company_id,
          ),
        userId:
          actorUserId,
        invoiceId,
        type:
          'invoice.recurring_generated',
        content:
          'Invoice ' +
          invoiceNumber +
          ' generated from recurring schedule ' +
          String(
            row.name,
          ) +
          '.',
        metadata: {
          recurringTemplateId:
            recurringId,
          recurringRunId,
          scheduledFor,
          status:
            recurringInvoiceStatus,
        },
      },
    );

    const nextRunAt =
      advanceDate(
        invoiceDate,
        String(
          row.interval_unit,
        ),
        Number(
          row.interval_count,
        ),
      );

    const nextRunCount =
      Number(
        row.run_count ||
        0,
      ) +
      1;

    const maxOccurrences =
      row.max_occurrences ===
        null ||
      row.max_occurrences ===
        undefined
        ? null
        : Math.max(
            1,
            Number(
              row.max_occurrences,
            ),
          );

    const completedByOccurrences =
      maxOccurrences !==
        null &&
      nextRunCount >=
        maxOccurrences;

    const completedByEndDate =
      Boolean(
        row.end_date &&
        nextRunAt >
          dateString(
            row.end_date,
          ),
      );

    const completed =
      completedByOccurrences ||
      completedByEndDate;

    const completionReason =
      completedByOccurrences
        ? 'max_occurrences_reached'
        : completedByEndDate
          ? 'end_date_reached'
          : null;

    const shouldAutoSend =
      recurringInvoiceStatus ===
        'confirmed' &&
      (
        row.auto_send ===
          true ||
        row.auto_send_recurring ===
          true
      );

    await client.query(
      `
        UPDATE invoicing_recurring_templates
        SET
          last_invoice_id =
            $2,
          last_run_at =
            NOW(),
          last_success_at =
            NOW(),
          last_error_code =
            NULL,
          last_error_message =
            NULL,
          consecutive_failures =
            0,
          retry_after =
            NULL,
          run_count =
            $5,
          next_run_at =
            $3,
          completion_reason =
            $6,
          status =
            CASE
              WHEN $4
              THEN 'completed'
              ELSE status
            END,
          updated_at =
            NOW()
        WHERE id =
              $1
      `,
      [
        recurringId,
        invoiceId,
        nextRunAt,
        completed,
        nextRunCount,
        completionReason,
      ],
    );

    await client.query(
      `
        UPDATE invoicing_recurring_runs
        SET
          status =
            'succeeded',
          invoice_id =
            $2,
          delivery_status =
            $3,
          completed_at =
            NOW(),
          error_code =
            NULL,
          error_message =
            NULL,
          updated_at =
            NOW()
        WHERE id =
              $1
      `,
      [
        recurringRunId,
        invoiceId,
        shouldAutoSend
          ? 'pending'
          : 'not_requested',
      ],
    );

    await client.query(
      'COMMIT',
    );

    generated = {
      invoiceId,
      recurringRunId,
      companyId:
        String(
          row.company_id,
        ),
      companyName:
        String(
          row.company_name,
        ),
      userId:
        actorUserId,
      autoSend:
        shouldAutoSend,
      deliveryChannels:
        normalizeInvoiceDeliveryChannels(
          payload.deliveryChannels,
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

    if (
      failedContext
    ) {
      const errorCode =
        databaseCode(
          error,
        ) ||
        'RECURRING_GENERATION_FAILED';

      const errorMessage =
        (
          error instanceof
            Error
            ? error.message
            : 'Recurring invoice generation failed.'
        )
          .slice(
            0,
            2000,
          );

      try {
        await client.query(
          'BEGIN',
        );

        await client.query(
          `
            INSERT INTO invoicing_recurring_runs (
              company_id,
              recurring_template_id,
              scheduled_for,
              run_key,
              status,
              attempt_count,
              error_code,
              error_message,
              started_at,
              last_attempt_at,
              completed_at
            )
            VALUES (
              $1,$2,$3::date,$4,
              'failed',
              1,
              $5,$6,
              NOW(),
              NOW(),
              NOW()
            )
            ON CONFLICT (
              recurring_template_id,
              scheduled_for
            )
            DO UPDATE SET
              status =
                'failed',
              attempt_count =
                invoicing_recurring_runs.attempt_count +
                1,
              last_attempt_at =
                NOW(),
              completed_at =
                NOW(),
              error_code =
                EXCLUDED.error_code,
              error_message =
                EXCLUDED.error_message,
              updated_at =
                NOW()
          `,
          [
            failedContext
              .companyId,
            failedContext
              .recurringId,
            failedContext
              .scheduledFor,
            failedContext
              .runKey,
            errorCode,
            errorMessage,
          ],
        );

        await client.query(
          `
            UPDATE invoicing_recurring_templates
            SET
              consecutive_failures =
                consecutive_failures +
                1,
              last_failure_at =
                NOW(),
              last_error_code =
                $2,
              last_error_message =
                $3,
              retry_after =
                CASE
                  WHEN
                    consecutive_failures +
                    1 >=
                    max_retry_attempts
                  THEN NULL
                  ELSE
                    NOW() +
                    (
                      LEAST(
                        consecutive_failures +
                        1,
                        4
                      ) *
                      INTERVAL '15 minutes'
                    )
                END,
              status =
                CASE
                  WHEN
                    consecutive_failures +
                    1 >=
                    max_retry_attempts
                  THEN 'paused'
                  ELSE status
                END,
              paused_at =
                CASE
                  WHEN
                    consecutive_failures +
                    1 >=
                    max_retry_attempts
                  THEN NOW()
                  ELSE paused_at
                END,
              metadata =
                CASE
                  WHEN
                    consecutive_failures +
                    1 >=
                    max_retry_attempts
                  THEN
                    COALESCE(
                      metadata,
                      '{}'::jsonb
                    ) ||
                    jsonb_build_object(
                      'workerPauseReason',
                      'MAX_RETRY_ATTEMPTS',
                      'workerPausedAt',
                      NOW()
                    )
                  ELSE
                    COALESCE(
                      metadata,
                      '{}'::jsonb
                    )
                END,
              updated_at =
                NOW()
            WHERE id =
                  $1
          `,
          [
            failedContext
              .recurringId,
            errorCode,
            errorMessage,
          ],
        );

        await client.query(
          'COMMIT',
        );
      } catch (
        failureRecordError
      ) {
        try {
          await client.query(
            'ROLLBACK',
          );
        } catch {}

        console.error(
          '[SaMi Invoicing] Failed to persist recurring run failure:',
          {
            tenantId,
            recurringId:
              failedContext
                .recurringId,
            error:
              failureRecordError instanceof
                Error
                ? failureRecordError.message
                : 'unknown_error',
          },
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }

  if (
    generated &&
    generated.autoSend
  ) {
    try {
      const delivery =
        await deliverInvoice({
          pool,
          tenantId,
          companyId:
            generated.companyId,
          companyName:
            generated.companyName,
          userId:
            generated.userId,
          invoiceId:
            generated.invoiceId,
          channels:
            generated.deliveryChannels.length >
              0
              ? generated.deliveryChannels
              : [
                  'email',
                ],
          purpose:
            'recurring',
        });

      await pool.query(
        `
          UPDATE invoicing_recurring_runs
          SET
            delivery_status =
              'sent',
            delivery_error_code =
              NULL,
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) ||
              jsonb_build_object(
                'deliveries',
                $2::jsonb
              ),
            updated_at =
              NOW()
          WHERE id =
                $1
        `,
        [
          generated
            .recurringRunId,
          JSON.stringify(
            delivery.deliveries,
          ),
        ],
      );
    } catch (
      error
    ) {
      const deliveryErrorCode =
        databaseCode(
          error,
        ) ||
        'DELIVERY_FAILED';

      await pool.query(
        `
          UPDATE invoicing_recurring_runs
          SET
            delivery_status =
              'failed',
            delivery_error_code =
              $2,
            updated_at =
              NOW()
          WHERE id =
                $1
        `,
        [
          generated
            .recurringRunId,
          deliveryErrorCode,
        ],
      );

      console.error(
        '[SaMi Invoicing] Recurring invoice auto-delivery failed:',
        {
          tenantId,
          invoiceId:
            generated.invoiceId,
          error:
            error instanceof
              Error
              ? error.message
              : 'unknown_error',
        },
      );
    }
  }

  return {
    generated:
      true,
    invoiceId:
      generated?.invoiceId ||
      null,
  };
}

async function processRecurringForTenant(
  tenantId:
    string,
) {
  let generated =
    0;

  let paused =
    0;

  let failed =
    0;

  let skipped =
    0;

  for (
    let index =
      0;
    index <
      MAX_RECURRING_PER_TENANT;
    index +=
      1
  ) {
    try {
      const result =
        await generateOneRecurringInvoice(
          tenantId,
        );

      if (!result) {
        break;
      }

      if (
        'paused' in result &&
        result.paused
      ) {
        paused +=
          1;
      } else if (
        'skipped' in result &&
        result.skipped
      ) {
        skipped +=
          1;
      } else {
        generated +=
          1;
      }
    } catch (
      error
    ) {
      failed +=
        1;

      if (
        missingInvoicingSchema(
          error,
        )
      ) {
        break;
      }

      console.error(
        '[SaMi Invoicing] Recurring generation failed:',
        {
          tenantId,
          error:
            error instanceof
              Error
              ? error.message
              : 'unknown_error',
        },
      );

      continue;
    }
  }

  return {
    generated,
    paused,
    failed,
    skipped,
  };
}


async function processRemindersForTenant(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          a.invoice_id,
          a.company_id,
          a.due_date,
          a.days_overdue,
          i.created_by,
          i.updated_by,
          i.reminder_mode
            AS invoice_reminder_mode,
          i.reminder_pause_until
            AS invoice_pause_until,
          c.reminder_mode
            AS customer_reminder_mode,
          c.reminder_pause_until
            AS customer_pause_until,
          company.name
            AS company_name,
          s.updated_by
            AS settings_updated_by,
          p.id
            AS policy_id,
          p.name
            AS policy_name,
          stage.id
            AS stage_id,
          stage.stage_key,
          stage.name
            AS stage_name,
          stage.offset_days,
          stage.severity,
          stage.channels,
          stage.retry_limit,
          stage.retry_delay_minutes
        FROM invoicing_aging a
        INNER JOIN invoicing_invoices i
          ON i.id =
             a.invoice_id
        INNER JOIN invoicing_customers c
          ON c.id =
             a.customer_id
        INNER JOIN invoicing_settings s
          ON s.company_id =
             a.company_id
        INNER JOIN companies company
          ON company.id =
             a.company_id
        INNER JOIN invoicing_dunning_policies p
          ON p.company_id =
             a.company_id
         AND p.is_default =
             TRUE
         AND p.is_active =
             TRUE
         AND p.deleted_at
             IS NULL
        INNER JOIN LATERAL (
          SELECT
            ds.*
          FROM invoicing_dunning_stages ds
          WHERE ds.policy_id =
                p.id
            AND ds.company_id =
                a.company_id
            AND ds.auto_send =
                TRUE
            AND ds.deleted_at
                IS NULL
            AND (
              a.due_date +
              ds.offset_days
            ) <=
            CURRENT_DATE
          ORDER BY
            ds.offset_days DESC,
            ds.sequence_no DESC
          LIMIT 1
        ) stage
          ON TRUE
        WHERE s.reminder_enabled =
              TRUE
          AND a.balance_due >
              0
          AND a.effective_status
              NOT IN (
                'draft',
                'pending_approval',
                'rejected',
                'paid',
                'cancelled',
                'void',
                'written_off'
              )
        ORDER BY
          a.due_date,
          a.invoice_id
        LIMIT $1
      `,
      [
        MAX_REMINDERS_PER_TENANT,
      ],
    );

  let sent =
    0;

  let failed =
    0;

  let skipped =
    0;

  let suppressed =
    0;

  let retried =
    0;

  for (
    const row
    of result.rows
  ) {
    const invoiceMode =
      String(
        row.invoice_reminder_mode ||
        'inherit',
      );

    const customerMode =
      String(
        row.customer_reminder_mode ||
        'inherit',
      );

    const effectiveMode =
      invoiceMode !==
        'inherit'
        ? invoiceMode
        : customerMode !==
            'inherit'
          ? customerMode
          : 'enabled';

    const pauseUntil =
      invoiceMode ===
        'paused'
        ? row.invoice_pause_until
        : (
            invoiceMode ===
              'inherit' &&
            customerMode ===
              'paused'
          )
          ? row.customer_pause_until
          : null;

    const pauseActive =
      effectiveMode ===
        'paused' &&
      (
        !pauseUntil ||
        new Date(
          pauseUntil,
        ).getTime() >
        Date.now()
      );

    if (
      effectiveMode ===
        'disabled' ||
      pauseActive
    ) {
      suppressed +=
        1;

      continue;
    }

    const channels =
      normalizeInvoiceDeliveryChannels(
        row.channels,
      );

    if (
      channels.length ===
        0
    ) {
      skipped +=
        1;

      continue;
    }

    const actionable:
      typeof channels =
        [];

    for (
      const channel
      of channels
    ) {
      const existing =
        await pool.query(
          `
            SELECT
              id,
              status,
              attempt_count,
              max_attempts,
              next_attempt_at
            FROM invoicing_reminders
            WHERE invoice_id =
                  $1
              AND reminder_type =
                  $2
              AND channel =
                  $3
            LIMIT 1
          `,
          [
            row.invoice_id,
            row.stage_key,
            channel,
          ],
        );

      const prior =
        existing.rows[0];

      if (
        !prior
      ) {
        await pool.query(
          `
            INSERT INTO invoicing_reminders (
              company_id,
              invoice_id,
              dunning_policy_id,
              dunning_stage_id,
              reminder_type,
              scheduled_for,
              status,
              channel,
              source,
              attempt_count,
              max_attempts,
              next_attempt_at,
              metadata
            )
            VALUES (
              $1,$2,$3,$4,$5,
              NOW(),
              'scheduled',
              $6,
              'worker',
              0,
              $7,
              NOW(),
              jsonb_build_object(
                'daysOverdue',
                $8::int,
                'stageName',
                $9::text,
                'severity',
                $10::text,
                'worker',
                'invoicing_tick'
              )
            )
            ON CONFLICT (
              invoice_id,
              reminder_type,
              channel
            )
            DO NOTHING
          `,
          [
            row.company_id,
            row.invoice_id,
            row.policy_id,
            row.stage_id,
            row.stage_key,
            channel,
            Number(
              row.retry_limit ||
              3,
            ),
            Number(
              row.days_overdue ||
              0,
            ),
            row.stage_name,
            row.severity,
          ],
        );

        actionable.push(
          channel,
        );

        continue;
      }

      const status =
        String(
          prior.status,
        );

      const attempts =
        Number(
          prior.attempt_count ||
          0,
        );

      const maxAttempts =
        Number(
          prior.max_attempts ||
          row.retry_limit ||
          3,
        );

      const retryDue =
        !prior.next_attempt_at ||
        new Date(
          prior.next_attempt_at,
        ).getTime() <=
        Date.now();

      if (
        status ===
          'sent' ||
        status ===
          'cancelled' ||
        status ===
          'suppressed' ||
        attempts >=
          maxAttempts ||
        !retryDue
      ) {
        continue;
      }

      if (
        status ===
          'failed'
      ) {
        retried +=
          1;
      }

      actionable.push(
        channel,
      );
    }

    if (
      actionable.length ===
        0
    ) {
      skipped +=
        1;

      continue;
    }

    await pool.query(
      `
        UPDATE invoicing_reminders
        SET
          status =
            'sending',
          attempt_count =
            attempt_count +
            1,
          last_attempt_at =
            NOW(),
          next_attempt_at =
            NULL,
          updated_at =
            NOW()
        WHERE invoice_id =
              $1
          AND reminder_type =
              $2
          AND channel =
              ANY($3::varchar[])
          AND status IN (
            'scheduled',
            'failed'
          )
      `,
      [
        row.invoice_id,
        row.stage_key,
        actionable,
      ],
    );

    const userId =
      row.updated_by
        ? String(
            row.updated_by,
          )
        : row.created_by
          ? String(
              row.created_by,
            )
          : row.settings_updated_by
            ? String(
                row.settings_updated_by,
              )
            : null;

    try {
      const delivery =
        await deliverInvoice({
          pool,
          tenantId,
          companyId:
            String(
              row.company_id,
            ),
          companyName:
            String(
              row.company_name,
            ),
          userId,
          invoiceId:
            String(
              row.invoice_id,
            ),
          channels:
            actionable,
          purpose:
            'reminder',
        });

      for (
        const deliveryResult
        of delivery.deliveries
      ) {
        await pool.query(
          `
            UPDATE invoicing_reminders
            SET
              status =
                CASE
                  WHEN $4::boolean
                  THEN 'sent'
                  ELSE 'failed'
                END,
              sent_at =
                CASE
                  WHEN $4::boolean
                  THEN NOW()
                  ELSE sent_at
                END,
              completed_at =
                CASE
                  WHEN $4::boolean
                  THEN NOW()
                  WHEN attempt_count >=
                       max_attempts
                  THEN NOW()
                  ELSE NULL
                END,
              next_attempt_at =
                CASE
                  WHEN $4::boolean
                    OR attempt_count >=
                       max_attempts
                  THEN NULL
                  ELSE
                    NOW() +
                    (
                      $6::int *
                      INTERVAL '1 minute'
                    )
                END,
              failure_code =
                CASE
                  WHEN $4::boolean
                  THEN NULL
                  ELSE $5
                END,
              failure_message =
                CASE
                  WHEN $4::boolean
                  THEN NULL
                  ELSE 'Reminder delivery failed through ' ||
                       $3::text ||
                       '.'
                END,
              updated_at =
                NOW()
            WHERE invoice_id =
                  $1
              AND reminder_type =
                  $2
              AND channel =
                  $3
          `,
          [
            row.invoice_id,
            row.stage_key,
            deliveryResult.channel,
            deliveryResult.success,
            deliveryResult.errorCode ||
            'DELIVERY_FAILED',
            Number(
              row.retry_delay_minutes ||
              60,
            ),
          ],
        );

        if (
          deliveryResult.success
        ) {
          sent +=
            1;

          await pool.query(
            `
              UPDATE invoicing_invoices
              SET
                reminder_last_sent_at =
                  NOW(),
                updated_at =
                  NOW()
              WHERE id =
                    $1
                AND company_id =
                    $2
            `,
            [
              row.invoice_id,
              row.company_id,
            ],
          );
        } else {
          failed +=
            1;
        }
      }
    } catch (
      error
    ) {
      failed +=
        actionable.length;

      const errorCode =
        databaseCode(
          error,
        ) ||
        'DELIVERY_FAILED';

      const errorMessage =
        (
          error instanceof
            Error
            ? error.message
            : 'Reminder delivery failed.'
        )
          .slice(
            0,
            1000,
          );

      await pool.query(
        `
          UPDATE invoicing_reminders
          SET
            status =
              'failed',
            completed_at =
              CASE
                WHEN attempt_count >=
                     max_attempts
                THEN NOW()
                ELSE NULL
              END,
            next_attempt_at =
              CASE
                WHEN attempt_count >=
                     max_attempts
                THEN NULL
                ELSE
                  NOW() +
                  (
                    $4::int *
                    INTERVAL '1 minute'
                  )
              END,
            failure_code =
              $5,
            failure_message =
              $6,
            updated_at =
              NOW()
          WHERE invoice_id =
                $1
            AND reminder_type =
                $2
            AND channel =
                ANY($3::varchar[])
            AND status =
                'sending'
        `,
        [
          row.invoice_id,
          row.stage_key,
          actionable,
          Number(
            row.retry_delay_minutes ||
            60,
          ),
          errorCode,
          errorMessage,
        ],
      );

      console.error(
        '[SaMi Invoicing] Dunning reminder delivery failed:',
        {
          tenantId,
          invoiceId:
            String(
              row.invoice_id,
            ),
          stage:
            String(
              row.stage_key,
            ),
          error:
            errorMessage,
        },
      );
    }
  }

  return {
    candidates:
      result.rows.length,
    sent,
    failed,
    skipped,
    suppressed,
    retried,
  };
}

export async function runInvoicingWorkerTick() {
  const tenantIds =
    await listActiveInvoicingTenants();

  const summary = {
    tenants:
      tenantIds.length,
    recurring: {
      generated:
        0,
      paused:
        0,
      failed:
        0,
      skipped:
        0,
    },
    reminders: {
      candidates:
        0,
      sent:
        0,
      failed:
        0,
      skipped:
        0,
      suppressed:
        0,
      retried:
        0,
    },
  };

  for (
    const tenantId
    of tenantIds
  ) {
    try {
      const access =
        await getWorkspaceSubscriptionAccessState(
          tenantId,
        );

      if (
        access.suspended ||
        !access.entitled
      ) {
        continue;
      }

      const recurring =
        await processRecurringForTenant(
          tenantId,
        );

      summary.recurring
        .generated +=
        recurring.generated;

      summary.recurring
        .paused +=
        recurring.paused;

      summary.recurring
        .failed +=
        recurring.failed;

      summary.recurring
        .skipped +=
        recurring.skipped;

      const reminders =
        await processRemindersForTenant(
          tenantId,
        );

      summary.reminders
        .candidates +=
        reminders.candidates;

      summary.reminders
        .sent +=
        reminders.sent;

      summary.reminders
        .failed +=
        reminders.failed;

      summary.reminders
        .skipped +=
        reminders.skipped;

      summary.reminders
        .suppressed +=
        reminders.suppressed;

      summary.reminders
        .retried +=
        reminders.retried;
    } catch (
      error
    ) {
      if (
        missingInvoicingSchema(
          error,
        )
      ) {
        continue;
      }

      console.error(
        '[SaMi Invoicing] Tenant worker failed:',
        {
          tenantId,
          error:
            error instanceof
              Error
              ? error.message
              : 'unknown_error',
        },
      );

      summary.recurring
        .failed +=
        1;
    }
  }

  return summary;
}
