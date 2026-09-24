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
              r.end_date
                IS NULL
              OR r.next_run_at <=
                 r.end_date
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
      dateString(
        row.next_run_at,
      );

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
            confirmed_at,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,'confirmed',$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,$22,$23,$24,$25,NOW(),$26,$26,
            jsonb_build_object(
              'recurringTemplateId',
              $27::text,
              'generatedBy',
              'invoicing_worker'
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
          $1,$2,NULL,
          'confirmed',
          'Generated from recurring invoice schedule',
          $3
        )
      `,
      [
        invoiceId,
        row.company_id,
        actorUserId,
      ],
    );

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

    const completed =
      Boolean(
        row.end_date &&
        nextRunAt >
          dateString(
            row.end_date,
          ),
      );

    await client.query(
      `
        UPDATE invoicing_recurring_templates
        SET
          last_invoice_id =
            $2,
          last_run_at =
            NOW(),
          next_run_at =
            $3,
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
      ],
    );

    await client.query(
      'COMMIT',
    );

    generated = {
      invoiceId,
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
        row.auto_send ===
          true ||
        row.auto_send_recurring ===
          true,
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

    throw error;
  } finally {
    client.release();
  }

  if (
    generated &&
    generated.autoSend
  ) {
    try {
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
    } catch (
      error
    ) {
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

      break;
    }
  }

  return {
    generated,
    paused,
    failed,
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
          company.name
            AS company_name,
          s.updated_by
            AS settings_updated_by,
          s.reminder_days_before,
          s.reminder_days_after,
          s.reminder_channels
        FROM invoicing_aging a
        INNER JOIN invoicing_invoices i
          ON i.id =
             a.invoice_id
        INNER JOIN invoicing_settings s
          ON s.company_id =
             a.company_id
        INNER JOIN companies company
          ON company.id =
             a.company_id
        WHERE s.reminder_enabled =
              TRUE
          AND a.balance_due >
              0
          AND a.effective_status
              NOT IN (
                'draft',
                'paid',
                'cancelled',
                'void',
                'written_off'
              )
          AND (
            (
              a.days_overdue =
                0
              AND a.due_date -
                  CURRENT_DATE =
                  s.reminder_days_before
            )
            OR
            a.days_overdue >
              0
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

  for (
    const row
    of result.rows
  ) {
    const daysOverdue =
      Number(
        row.days_overdue ||
        0,
      );

    let reminderType =
      '';

    if (
      daysOverdue >
        0
    ) {
      const thresholds =
        Array.isArray(
          row.reminder_days_after,
        )
          ? row.reminder_days_after
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
                    0 &&
                  value <=
                    daysOverdue,
              )
              .sort(
                (
                  left:
                    number,
                  right:
                    number,
                ) =>
                  right -
                  left,
              )
          : [];

      if (
        thresholds.length ===
          0
      ) {
        skipped +=
          1;

        continue;
      }

      reminderType =
        'overdue_' +
        thresholds[0];
    } else {
      reminderType =
        'before_due_' +
        Number(
          row.reminder_days_before ||
          0,
        );
    }

    const channels =
      normalizeInvoiceDeliveryChannels(
        row.reminder_channels,
      );

    const pendingChannels:
      typeof channels =
        [];

    for (
      const channel
      of channels
    ) {
      const existing =
        await pool.query(
          `
            SELECT 1
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
            reminderType,
            channel,
          ],
        );

      if (
        existing.rows.length ===
          0
      ) {
        pendingChannels.push(
          channel,
        );
      }
    }

    if (
      pendingChannels.length ===
        0
    ) {
      skipped +=
        1;

      continue;
    }

    for (
      const channel
      of pendingChannels
    ) {
      await pool.query(
        `
          INSERT INTO invoicing_reminders (
            company_id,
            invoice_id,
            reminder_type,
            scheduled_for,
            status,
            channel,
            metadata
          )
          VALUES (
            $1,$2,$3,NOW(),
            'scheduled',$4,
            jsonb_build_object(
              'daysOverdue',
              $5::int,
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
          reminderType,
          channel,
          daysOverdue,
        ],
      );
    }

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
            pendingChannels,
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
                $4::varchar(30),
              sent_at =
                CASE
                  WHEN $4::varchar(30) =
                       'sent'
                  THEN NOW()
                  ELSE sent_at
                END,
              failure_code =
                $5
            WHERE invoice_id =
                  $1
              AND reminder_type =
                  $2
              AND channel =
                  $3
          `,
          [
            row.invoice_id,
            reminderType,
            deliveryResult.channel,
            deliveryResult.success
              ? 'sent'
              : 'failed',
            deliveryResult.errorCode ||
            null,
          ],
        );

        if (
          deliveryResult.success
        ) {
          sent +=
            1;
        } else {
          failed +=
            1;
        }
      }
    } catch (
      error
    ) {
      failed +=
        pendingChannels.length;

      await pool.query(
        `
          UPDATE invoicing_reminders
          SET
            status =
              'failed',
            failure_code =
              'DELIVERY_FAILED'
          WHERE invoice_id =
                $1
            AND reminder_type =
                $2
            AND channel =
                ANY($3::varchar[])
            AND status =
                'scheduled'
        `,
        [
          row.invoice_id,
          reminderType,
          pendingChannels,
        ],
      );

      console.error(
        '[SaMi Invoicing] Reminder delivery failed:',
        {
          tenantId,
          invoiceId:
            String(
              row.invoice_id,
            ),
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
    candidates:
      result.rows.length,
    sent,
    failed,
    skipped,
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
