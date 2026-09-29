import 'server-only';

import crypto from 'crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  cleanText,
  InvoicingError,
  money,
  recordInvoicingActivity,
  requireUuid,
} from '@/lib/apps/invoicing/context';


const CUSTOMER_VISIBLE_INVOICE_STATUSES = [
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'written_off',
] as const;


function sha256(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
    )
    .digest(
      'hex',
    );
}


function dateOnly(
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


function assertPortalToken(
  value:
    unknown,
) {
  const token =
    cleanText(
      value,
      200,
    );

  if (
    token.length <
      32
  ) {
    throw new InvoicingError(
      'PORTAL_NOT_FOUND',
      'Customer portal access is invalid or expired.',
    );
  }

  return token;
}


async function requirePortalAccess(
  tenantIdInput:
    string,
  tokenInput:
    string,
) {
  const tenantId =
    requireUuid(
      tenantIdInput,
      'Workspace',
    );

  const token =
    assertPortalToken(
      tokenInput,
    );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          access.id
            AS access_id,
          access.company_id,
          access.customer_id,
          access.expires_at,
          c.name
            AS customer_name,
          c.email
            AS customer_email,
          c.phone
            AS customer_phone,
          c.currency
            AS customer_currency,
          c.billing_address,
          c.shipping_address,
          c.tax_id
            AS customer_tax_id,
          c.status
            AS customer_status,
          company.name
            AS company_name,
          company.legal_name
            AS company_legal_name,
          company.logo_url,
          company.email
            AS company_email,
          company.phone
            AS company_phone,
          company.address,
          company.address_line1,
          company.address_line2,
          company.city,
          company.country,
          company.tax_id
            AS company_tax_id,
          company.registration_number
            AS company_registration_number,
          settings.portal_enabled,
          settings.portal_allow_messages,
          settings.portal_show_payment_history,
          settings.portal_show_credit_notes,
          settings.payment_instructions
        FROM invoicing_portal_access access
        INNER JOIN invoicing_customers c
          ON c.id =
             access.customer_id
         AND c.company_id =
             access.company_id
         AND c.deleted_at
             IS NULL
        INNER JOIN companies company
          ON company.id =
             access.company_id
        INNER JOIN invoicing_settings settings
          ON settings.company_id =
             access.company_id
        WHERE access.token_hash =
              $1
          AND access.status =
              'active'
        LIMIT 1
      `,
      [
        sha256(
          token,
        ),
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'PORTAL_NOT_FOUND',
      'Customer portal access is invalid or expired.',
    );
  }

  const row =
    result.rows[0];

  if (
    row.portal_enabled !==
      true ||
    row.customer_status !==
      'active'
  ) {
    throw new InvoicingError(
      'PORTAL_NOT_FOUND',
      'Customer portal access is invalid or expired.',
    );
  }

  const expiresAt =
    new Date(
      row.expires_at,
    );

  if (
    Number.isNaN(
      expiresAt.getTime(),
    ) ||
    expiresAt.getTime() <=
      Date.now()
  ) {
    await pool.query(
      `
        UPDATE invoicing_portal_access
        SET
          status =
            'expired',
          updated_at =
            NOW()
        WHERE id =
              $1
          AND status =
              'active'
      `,
      [
        row.access_id,
      ],
    );

    throw new InvoicingError(
      'PORTAL_NOT_FOUND',
      'Customer portal access is invalid or expired.',
    );
  }

  return {
    tenantId,
    token,
    pool,
    accessId:
      String(
        row.access_id,
      ),
    companyId:
      String(
        row.company_id,
      ),
    customerId:
      String(
        row.customer_id,
      ),
    expiresAt:
      expiresAt
        .toISOString(),
    customer: {
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
      currency:
        String(
          row.customer_currency ||
          'KES',
        ),
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
      taxId:
        row.customer_tax_id
          ? String(
              row.customer_tax_id,
            )
          : null,
    },
    company: {
      name:
        String(
          row.company_legal_name ||
          row.company_name,
        ),
      logoUrl:
        row.logo_url
          ? String(
              row.logo_url,
            )
          : null,
      email:
        row.company_email
          ? String(
              row.company_email,
            )
          : null,
      phone:
        row.company_phone
          ? String(
              row.company_phone,
            )
          : null,
      address:
        [
          row.address_line1,
          row.address_line2,
          row.city,
          row.country,
        ]
          .filter(
            Boolean,
          )
          .map(
            value =>
              String(
                value,
              ),
          )
          .join(
            ', ',
          ) ||
        (
          row.address
            ? String(
                row.address,
              )
            : null
        ),
      taxId:
        row.company_tax_id
          ? String(
              row.company_tax_id,
            )
          : null,
      registrationNumber:
        row.company_registration_number
          ? String(
              row.company_registration_number,
            )
          : null,
    },
    settings: {
      allowMessages:
        row.portal_allow_messages !==
        false,
      showPaymentHistory:
        row.portal_show_payment_history !==
        false,
      showCreditNotes:
        row.portal_show_credit_notes !==
        false,
      paymentInstructions:
        row.payment_instructions
          ? String(
              row.payment_instructions,
            )
          : null,
    },
  };
}


async function recordPortalEvent(
  input: {
    pool:
      Awaited<
        ReturnType<
          typeof getTenantPoolByTenantId
        >
      >;
    companyId:
      string;
    customerId:
      string;
    accessId:
      string;
    invoiceId?:
      string |
      null;
    eventType:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  await input.pool.query(
    `
      INSERT INTO invoicing_portal_events (
        company_id,
        customer_id,
        portal_access_id,
        invoice_id,
        event_type,
        metadata
      )
      VALUES (
        $1,$2,$3,$4,$5,$6::jsonb
      )
    `,
    [
      input.companyId,
      input.customerId,
      input.accessId,
      input.invoiceId ||
      null,
      input.eventType,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}


export async function getCustomerPortal(
  tenantId:
    string,
  token:
    string,
) {
  const context =
    await requirePortalAccess(
      tenantId,
      token,
    );

  await context.pool.query(
    `
      UPDATE invoicing_portal_access
      SET
        last_used_at =
          NOW(),
        updated_at =
          NOW()
      WHERE id =
            $1
    `,
    [
      context.accessId,
    ],
  );

  await recordPortalEvent({
    pool:
      context.pool,
    companyId:
      context.companyId,
    customerId:
      context.customerId,
    accessId:
      context.accessId,
    eventType:
      'portal.opened',
  });

  const [
    balance,
    invoices,
    payments,
    creditNotes,
    messages,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            invoice_count,
            invoiced_total,
            paid_total,
            credited_total,
            outstanding_total
          FROM invoicing_customer_balances
          WHERE company_id =
                $1
            AND customer_id =
                $2
          LIMIT 1
        `,
        [
          context.companyId,
          context.customerId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            aging.invoice_id,
            aging.invoice_number,
            aging.effective_status,
            aging.invoice_date,
            aging.due_date,
            aging.currency,
            aging.total_amount,
            aging.balance_due,
            aging.days_overdue,
            invoice.sent_at,
            invoice.viewed_at
          FROM invoicing_aging aging
          INNER JOIN invoicing_invoices invoice
            ON invoice.id =
               aging.invoice_id
           AND invoice.company_id =
               aging.company_id
          WHERE aging.company_id =
                $1
            AND aging.customer_id =
                $2
            AND invoice.status =
                ANY($3::varchar[])
          ORDER BY
            aging.invoice_date DESC,
            aging.invoice_id DESC
          LIMIT 500
        `,
        [
          context.companyId,
          context.customerId,
          [
            ...CUSTOMER_VISIBLE_INVOICE_STATUSES,
          ],
        ],
      ),

      context.settings
        .showPaymentHistory
        ? context.pool.query(
            `
              SELECT
                payment.id,
                payment.payment_number,
                payment.payment_date,
                payment.currency,
                payment.method,
                payment.reference,
                SUM(
                  allocation.amount
                )
                  AS allocated_amount,
                jsonb_agg(
                  DISTINCT jsonb_build_object(
                    'invoiceId',
                    invoice.id,
                    'invoiceNumber',
                    invoice.invoice_number
                  )
                )
                  AS invoices
              FROM invoicing_payments payment
              INNER JOIN invoicing_payment_allocations allocation
                ON allocation.payment_id =
                   payment.id
               AND allocation.company_id =
                   payment.company_id
               AND allocation.status =
                   'posted'
              INNER JOIN invoicing_invoices invoice
                ON invoice.id =
                   allocation.invoice_id
               AND invoice.company_id =
                   payment.company_id
              WHERE payment.company_id =
                    $1
                AND payment.customer_id =
                    $2
                AND payment.status =
                    'posted'
                AND payment.deleted_at
                    IS NULL
              GROUP BY
                payment.id
              ORDER BY
                payment.payment_date DESC,
                payment.created_at DESC
              LIMIT 300
            `,
            [
              context.companyId,
              context.customerId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      context.settings
        .showCreditNotes
        ? context.pool.query(
            `
              SELECT
                credit.id,
                credit.invoice_id,
                invoice.invoice_number,
                credit.credit_note_number,
                credit.issue_date,
                credit.currency,
                credit.total_amount,
                credit.reason,
                credit.status
              FROM invoicing_credit_notes credit
              INNER JOIN invoicing_invoices invoice
                ON invoice.id =
                   credit.invoice_id
               AND invoice.company_id =
                   credit.company_id
              WHERE credit.company_id =
                    $1
                AND credit.customer_id =
                    $2
                AND credit.status IN (
                  'issued',
                  'applied',
                  'refunded'
                )
                AND credit.deleted_at
                    IS NULL
              ORDER BY
                credit.issue_date DESC,
                credit.created_at DESC
              LIMIT 300
            `,
            [
              context.companyId,
              context.customerId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),

      context.settings
        .allowMessages
        ? context.pool.query(
            `
              SELECT
                message.id,
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
              LEFT JOIN invoicing_invoices invoice
                ON invoice.id =
                   message.invoice_id
               AND invoice.company_id =
                   message.company_id
              WHERE message.company_id =
                    $1
                AND message.customer_id =
                    $2
              ORDER BY
                message.created_at DESC,
                message.id DESC
              LIMIT 200
            `,
            [
              context.companyId,
              context.customerId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),
    ]);

  const totals =
    balance.rows[0] ||
    {};

  return {
    tenantId:
      context.tenantId,
    token:
      context.token,
    access: {
      id:
        context.accessId,
      expiresAt:
        context.expiresAt,
    },
    company:
      context.company,
    customer:
      context.customer,
    settings:
      context.settings,
    summary: {
      invoiceCount:
        Number(
          totals.invoice_count ||
          0,
        ),
      invoicedTotal:
        money(
          totals.invoiced_total,
        ),
      paidTotal:
        money(
          totals.paid_total,
        ),
      creditedTotal:
        money(
          totals.credited_total,
        ),
      outstandingTotal:
        money(
          totals.outstanding_total,
        ),
    },
    invoices:
      invoices.rows.map(
        row => ({
          id:
            String(
              row.invoice_id,
            ),
          invoiceNumber:
            String(
              row.invoice_number,
            ),
          status:
            String(
              row.effective_status,
            ),
          invoiceDate:
            dateOnly(
              row.invoice_date,
            ),
          dueDate:
            dateOnly(
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
          balanceDue:
            money(
              row.balance_due,
            ),
          paidAmount:
            money(
              row.total_amount,
            ) -
            money(
              row.balance_due,
            ),
          daysOverdue:
            Number(
              row.days_overdue ||
              0,
            ),
          sentAt:
            row.sent_at
              ? String(
                  row.sent_at,
                )
              : null,
          viewedAt:
            row.viewed_at
              ? String(
                  row.viewed_at,
                )
              : null,
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
          paymentDate:
            dateOnly(
              row.payment_date,
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
          allocatedAmount:
            money(
              row.allocated_amount,
            ),
          invoices:
            Array.isArray(
              row.invoices,
            )
              ? row.invoices.map(
                  (
                    invoice:
                      Record<
                        string,
                        unknown
                      >,
                  ) => ({
                    id:
                      String(
                        invoice.invoiceId,
                      ),
                    invoiceNumber:
                      String(
                        invoice.invoiceNumber,
                      ),
                  }),
                )
              : [],
        }),
      ),
    creditNotes:
      creditNotes.rows.map(
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
          creditNoteNumber:
            String(
              row.credit_note_number,
            ),
          issueDate:
            dateOnly(
              row.issue_date,
            ),
          currency:
            String(
              row.currency,
            ),
          amount:
            money(
              row.total_amount,
            ),
          reason:
            String(
              row.reason,
            ),
          status:
            String(
              row.status,
            ),
        }),
      ),
    messages:
      messages.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
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
              ? dateOnly(
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
      ),
  };
}


export async function getCustomerPortalInvoice(
  tenantId:
    string,
  token:
    string,
  invoiceIdInput:
    string,
  options: {
    markViewed?:
      boolean;
  } = {},
) {
  const context =
    await requirePortalAccess(
      tenantId,
      token,
    );

  const invoiceId =
    requireUuid(
      invoiceIdInput,
      'Invoice',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.invoice_date,
          i.due_date,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.service_date,
          i.ship_to_address,
          i.payment_terms_name_snapshot,
          i.tax_calculation,
          i.subtotal,
          i.discount_total,
          i.tax_total,
          i.shipping_total,
          i.rounding_adjustment,
          i.total_amount,
          i.notes,
          i.terms,
          i.payment_instructions,
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
            AS customer_tax_id,
          company.name
            AS company_name,
          company.legal_name
            AS company_legal_name,
          company.logo_url,
          company.email
            AS company_email,
          company.phone
            AS company_phone,
          company.address,
          company.address_line1,
          company.address_line2,
          company.city,
          company.country,
          company.tax_id,
          company.registration_number,
          template.name
            AS template_name,
          template.layout
            AS template_layout,
          template.primary_color,
          template.secondary_color,
          template.accent_color,
          template.logo_url
            AS template_logo_url,
          template.font_family,
          template.show_company_logo,
          template.show_company_address,
          template.show_company_contact,
          template.show_tax_id,
          template.show_payment_instructions,
          template.show_tax_breakdown,
          template.show_discount,
          template.footer_text,
          template.terms_text
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
           AND c.company_id =
             i.company_id
        INNER JOIN companies company
          ON company.id =
             i.company_id
        LEFT JOIN invoicing_templates template
          ON template.id =
             i.template_id
         AND template.company_id =
             i.company_id
         AND template.deleted_at
             IS NULL
        WHERE i.id =
              $1
          AND i.company_id =
              $2
          AND i.customer_id =
              $3
          AND i.status =
              ANY($4::varchar[])
          AND i.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        invoiceId,
        context.companyId,
        context.customerId,
        [
          ...CUSTOMER_VISIBLE_INVOICE_STATUSES,
        ],
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const invoice =
    result.rows[0];

  const [
    lines,
    settlement,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            description,
            sku_snapshot,
            unit,
            quantity,
            unit_price,
            discount_amount,
            tax_name_snapshot,
            tax_rate,
            tax_amount,
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
            a.balance_due,
            COALESCE(
              (
                SELECT SUM(
                  allocation.amount
                )
                FROM invoicing_payment_allocations allocation
                INNER JOIN invoicing_payments payment
                  ON payment.id =
                     allocation.payment_id
                WHERE allocation.invoice_id =
                      a.invoice_id
                  AND allocation.status =
                      'posted'
                  AND payment.status =
                      'posted'
                  AND payment.deleted_at
                      IS NULL
              ),
              0
            ) AS paid_amount,
            COALESCE(
              (
                SELECT SUM(
                  credit.total_amount
                )
                FROM invoicing_credit_notes credit
                WHERE credit.invoice_id =
                      a.invoice_id
                  AND credit.status IN (
                    'issued',
                    'applied',
                    'refunded'
                  )
                  AND credit.deleted_at
                      IS NULL
              ),
              0
            ) AS credited_amount
          FROM invoicing_aging a
          WHERE a.invoice_id =
                $1
            AND a.company_id =
                $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      ),
    ]);

  const markViewed =
    options.markViewed !==
    false;

  let status =
    String(
      invoice.status,
    );

  if (
    markViewed &&
    status ===
      'sent'
  ) {
    const client =
      await context.pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const changed =
        await client.query(
          `
            UPDATE invoicing_invoices
            SET
              status =
                'viewed',
              viewed_at =
                COALESCE(
                  viewed_at,
                  NOW()
                ),
              updated_at =
                NOW()
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND customer_id =
                  $3
              AND status =
                  'sent'
            RETURNING
              id
          `,
          [
            invoiceId,
            context.companyId,
            context.customerId,
          ],
        );

      if (
        changed.rows.length >
          0
      ) {
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
              $1,$2,
              'sent',
              'viewed',
              'Viewed in customer portal',
              NULL
            )
          `,
          [
            invoiceId,
            context.companyId,
          ],
        );

        await recordInvoicingActivity(
          client,
          {
            companyId:
              context.companyId,
            userId:
              null,
            invoiceId,
            type:
              'invoice.portal_viewed',
            content:
              'Invoice ' +
              String(
                invoice.invoice_number,
              ) +
              ' viewed in the customer portal.',
            metadata: {
              portalAccessId:
                context.accessId,
            },
          },
        );

        status =
          'viewed';
      }

      await client.query(
        'COMMIT',
      );
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

  await recordPortalEvent({
    pool:
      context.pool,
    companyId:
      context.companyId,
    customerId:
      context.customerId,
    accessId:
      context.accessId,
    invoiceId,
    eventType:
      'portal.invoice_viewed',
  });

  return {
    id:
      invoiceId,
    invoiceNumber:
      String(
        invoice.invoice_number,
      ),
    status,
    invoiceDate:
      dateOnly(
        invoice.invoice_date,
      ),
    dueDate:
      dateOnly(
        invoice.due_date,
      ),
    serviceDate:
      invoice.service_date
        ? dateOnly(
            invoice.service_date,
          )
        : null,
    currency:
      String(
        invoice.currency,
      ),
    reference:
      invoice.reference
        ? String(
            invoice.reference,
          )
        : null,
    purchaseOrderNumber:
      invoice.purchase_order_number
        ? String(
            invoice.purchase_order_number,
          )
        : null,
    paymentTermsName:
      invoice.payment_terms_name_snapshot
        ? String(
            invoice.payment_terms_name_snapshot,
          )
        : null,
    taxCalculation:
      invoice.tax_calculation ===
        'inclusive'
        ? 'inclusive' as const
        : 'exclusive' as const,
    subtotal:
      money(
        invoice.subtotal,
      ),
    discountTotal:
      money(
        invoice.discount_total,
      ),
    taxTotal:
      money(
        invoice.tax_total,
      ),
    shippingTotal:
      money(
        invoice.shipping_total,
      ),
    roundingAdjustment:
      money(
        invoice.rounding_adjustment,
      ),
    totalAmount:
      money(
        invoice.total_amount,
      ),
    paidAmount:
      money(
        settlement.rows[0]
          ?.paid_amount,
      ),
    creditedAmount:
      money(
        settlement.rows[0]
          ?.credited_amount,
      ),
    balanceDue:
      status ===
        'written_off'
        ? 0
        : money(
            settlement.rows[0]
              ?.balance_due,
          ),
    notes:
      invoice.notes
        ? String(
            invoice.notes,
          )
        : null,
    terms:
      invoice.terms
        ? String(
            invoice.terms,
          )
        : null,
    paymentInstructions:
      invoice.payment_instructions
        ? String(
            invoice.payment_instructions,
          )
        : context.settings
            .paymentInstructions,
    customer: {
      name:
        String(
          invoice.customer_name,
        ),
      email:
        invoice.customer_email
          ? String(
              invoice.customer_email,
            )
          : null,
      phone:
        invoice.customer_phone
          ? String(
              invoice.customer_phone,
            )
          : null,
      taxId:
        invoice.customer_tax_id
          ? String(
              invoice.customer_tax_id,
            )
          : null,
      billingAddress:
        invoice.billing_address
          ? String(
              invoice.billing_address,
            )
          : null,
      shippingAddress:
        invoice.ship_to_address
          ? String(
              invoice.ship_to_address,
            )
          : null,
    },
    template: {
      name:
        invoice.template_name
          ? String(
              invoice.template_name,
            )
          : 'Modern',
      layout:
        invoice.template_layout
          ? String(
              invoice.template_layout,
            )
          : 'modern',
      primaryColor:
        String(
          invoice.primary_color ||
          '#164a9f',
        ),
      secondaryColor:
        String(
          invoice.secondary_color ||
          '#0f172a',
        ),
      accentColor:
        invoice.accent_color
          ? String(
              invoice.accent_color,
            )
          : null,
      logoUrl:
        invoice.template_logo_url
          ? String(
              invoice.template_logo_url,
            )
          : null,
      fontFamily:
        String(
          invoice.font_family ||
          'Inter',
        ),
      showCompanyLogo:
        invoice.show_company_logo !==
        false,
      showCompanyAddress:
        invoice.show_company_address !==
        false,
      showCompanyContact:
        invoice.show_company_contact !==
        false,
      showTaxId:
        invoice.show_tax_id !==
        false,
      showPaymentInstructions:
        invoice.show_payment_instructions !==
        false,
      showTaxBreakdown:
        invoice.show_tax_breakdown !==
        false,
      showDiscount:
        invoice.show_discount !==
        false,
      footerText:
        invoice.footer_text
          ? String(
              invoice.footer_text,
            )
          : null,
      termsText:
        invoice.terms_text
          ? String(
              invoice.terms_text,
            )
          : null,
    },
    company: {
      name:
        String(
          invoice.company_legal_name ||
          invoice.company_name,
        ),
      logoUrl:
        invoice.template_logo_url
          ? String(
              invoice.template_logo_url,
            )
          : invoice.logo_url
            ? String(
                invoice.logo_url,
              )
            : null,
      email:
        invoice.company_email
          ? String(
              invoice.company_email,
            )
          : null,
      phone:
        invoice.company_phone
          ? String(
              invoice.company_phone,
            )
          : null,
      address:
        [
          invoice.address_line1,
          invoice.address_line2,
          invoice.city,
          invoice.country,
        ]
          .filter(
            Boolean,
          )
          .map(
            value =>
              String(
                value,
              ),
          )
          .join(
            ', ',
          ) ||
        (
          invoice.address
            ? String(
                invoice.address,
              )
            : null
        ),
      taxId:
        invoice.tax_id
          ? String(
              invoice.tax_id,
            )
          : null,
      registrationNumber:
        invoice.registration_number
          ? String(
              invoice.registration_number,
            )
          : null,
    },
    lines:
      lines.rows.map(
        row => ({
          description:
            String(
              row.description,
            ),
          sku:
            row.sku_snapshot
              ? String(
                  row.sku_snapshot,
                )
              : null,
          unit:
            String(
              row.unit ||
              'unit',
            ),
          quantity:
            money(
              row.quantity,
            ),
          unitPrice:
            money(
              row.unit_price,
            ),
          discountAmount:
            money(
              row.discount_amount,
            ),
          taxName:
            row.tax_name_snapshot
              ? String(
                  row.tax_name_snapshot,
                )
              : null,
          taxRate:
            money(
              row.tax_rate,
            ),
          taxAmount:
            money(
              row.tax_amount,
            ),
          lineTotal:
            money(
              row.line_total,
            ),
        }),
      ),
  };
}


export async function submitCustomerPortalMessage(
  tenantId:
    string,
  token:
    string,
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requirePortalAccess(
      tenantId,
      token,
    );

  if (
    !context.settings
      .allowMessages
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Customer messages are disabled for this portal.',
    );
  }

  const categoryRaw =
    cleanText(
      input.category,
      30,
    );

  const category =
    [
      'general',
      'invoice_question',
      'dispute',
      'payment_promise',
    ].includes(
      categoryRaw,
    )
      ? categoryRaw
      : 'general';

  const subject =
    cleanText(
      input.subject,
      255,
    ) ||
    null;

  const body =
    cleanText(
      input.body,
      5000,
    );

  if (
    !body
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Message is required.',
    );
  }

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
      'A valid message request key is required.',
    );
  }

  const invoiceId =
    input.invoiceId
      ? requireUuid(
          input.invoiceId,
          'Invoice',
        )
      : null;

  let promisedAmount:
    number |
    null =
      null;

  let promisedDate:
    string |
    null =
      null;

  if (
    category ===
      'payment_promise'
  ) {
    const rawAmount =
      Number(
        input.promisedAmount,
      );

    if (
      !Number.isFinite(
        rawAmount,
      ) ||
      rawAmount <=
        0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Enter the amount you expect to pay.',
      );
    }

    promisedAmount =
      money(
        rawAmount,
      );

    const rawDate =
      cleanText(
        input.promisedDate,
        20,
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        rawDate,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose the expected payment date.',
      );
    }

    promisedDate =
      rawDate;
  }

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
            id
          FROM invoicing_portal_messages
          WHERE portal_access_id =
                $1
            AND idempotency_key =
                $2
          LIMIT 1
        `,
        [
          context.accessId,
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
            duplicate.rows[0].id,
          ),
        duplicate:
          true,
      };
    }

    const recent =
      await client.query(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM invoicing_portal_messages
          WHERE portal_access_id =
                $1
            AND direction =
                'customer_to_business'
            AND created_at >=
                NOW() -
                INTERVAL '10 minutes'
        `,
        [
          context.accessId,
        ],
      );

    if (
      Number(
        recent.rows[0]
          ?.count ||
        0,
      ) >=
        10
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Too many portal messages were submitted. Try again later.',
      );
    }

    if (
      invoiceId
    ) {
      const invoice =
        await client.query(
          `
            SELECT
              id
            FROM invoicing_invoices
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND customer_id =
                  $3
              AND status =
                  ANY($4::varchar[])
              AND deleted_at
                  IS NULL
            LIMIT 1
          `,
          [
            invoiceId,
            context.companyId,
            context.customerId,
            [
              ...CUSTOMER_VISIBLE_INVOICE_STATUSES,
            ],
          ],
        );

      if (
        invoice.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'INVOICE_NOT_FOUND',
          'Invoice was not found.',
        );
      }
    }

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_portal_messages (
            company_id,
            customer_id,
            invoice_id,
            portal_access_id,
            direction,
            category,
            subject,
            body,
            idempotency_key,
            promised_amount,
            promised_date,
            status,
            customer_name_snapshot,
            customer_email_snapshot
          )
          VALUES (
            $1,$2,$3,$4,
            'customer_to_business',
            $5,$6,$7,$8,$9,$10,
            'open',
            $11,$12
          )
          RETURNING
            id,
            created_at
        `,
        [
          context.companyId,
          context.customerId,
          invoiceId,
          context.accessId,
          category,
          subject,
          body,
          idempotencyKey,
          promisedAmount,
          promisedDate,
          context.customer
            .name,
          context.customer
            .email,
        ],
      );

    await client.query(
      `
        INSERT INTO invoicing_portal_events (
          company_id,
          customer_id,
          portal_access_id,
          invoice_id,
          event_type,
          metadata
        )
        VALUES (
          $1,$2,$3,$4,
          'portal.message_sent',
          jsonb_build_object(
            'category',
            $5::text
          )
        )
      `,
      [
        context.companyId,
        context.customerId,
        context.accessId,
        invoiceId,
        category,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          inserted.rows[0].id,
        ),
      createdAt:
        String(
          inserted.rows[0]
            .created_at,
        ),
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
