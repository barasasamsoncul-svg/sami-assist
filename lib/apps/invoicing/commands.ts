import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';

import {
  sendWorkspaceNotificationSms,
} from '@/lib/services/sms';

import type {
  CreateInvoiceInput,
  CreateInvoiceLineInput,
} from '@/lib/apps/invoicing/types';

import {
  cleanText,
  datePlusDays,
  ensureCompanyDefaults,
  InvoicingError,
  INVOICING_PERMISSIONS,
  isoDate,
  money,
  nextDocumentNumber,
  nullableText,
  numberInput,
  optionalUuid,
  recordInvoicingActivity,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


export async function createInvoicingCustomer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Customer name is required.',
    );
  }

  const currency =
    cleanText(
      input.currency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Currency must be a three-letter code.',
    );
  }

  const customerType =
    cleanText(
      input.customerType,
      30,
    );

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_customers (
          company_id,
          customer_type,
          name,
          legal_name,
          contact_name,
          email,
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          postal_code,
          country,
          country_code,
          tax_id,
          registration_number,
          currency,
          payment_terms_id,
          credit_limit,
          notes,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21
        )
        RETURNING
          id,
          name
      `,
      [
        context.companyId,
        [
          'individual',
          'company',
          'government',
          'non_profit',
        ].includes(
          customerType,
        )
          ? customerType
          : 'company',
        name,
        nullableText(
          input.legalName,
          255,
        ),
        nullableText(
          input.contactName,
          255,
        ),
        nullableText(
          input.email,
          255,
        ),
        nullableText(
          input.phone,
          60,
        ),
        nullableText(
          input.billingAddress,
          4000,
        ),
        nullableText(
          input.shippingAddress,
          4000,
        ),
        nullableText(
          input.city,
          120,
        ),
        nullableText(
          input.state,
          120,
        ),
        nullableText(
          input.postalCode,
          40,
        ),
        nullableText(
          input.country,
          120,
        ),
        nullableText(
          input.countryCode,
          2,
        ),
        nullableText(
          input.taxId,
          120,
        ),
        nullableText(
          input.registrationNumber,
          120,
        ),
        currency,
        optionalUuid(
          input.paymentTermsId,
        ),
        input.creditLimit ===
          null ||
        input.creditLimit ===
          undefined ||
        input.creditLimit ===
          ''
          ? null
          : numberInput(
              input.creditLimit,
              'Credit limit',
            ),
        nullableText(
          input.notes,
          4000,
        ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
    name:
      String(
        result.rows[0].name,
      ),
  };
}


export async function createInvoicingCatalogItem(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CATALOG_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      255,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Item name is required.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_catalog_items (
          company_id,
          item_type,
          name,
          sku,
          description,
          unit,
          unit_price,
          default_tax_rate_id,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
        )
        RETURNING
          id,
          name
      `,
      [
        context.companyId,
        cleanText(
          input.itemType,
          30,
        ) ===
          'product'
          ? 'product'
          : 'service',
        name,
        nullableText(
          input.sku,
          120,
        ),
        nullableText(
          input.description,
          4000,
        ),
        cleanText(
          input.unit,
          40,
        ) ||
        'unit',
        numberInput(
          input.unitPrice,
          'Unit price',
        ),
        optionalUuid(
          input.taxRateId,
        ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
    name:
      String(
        result.rows[0].name,
      ),
  };
}


async function normalizeInvoiceLines(
  client:
    PoolClient,
  companyId:
    string,
  linesInput:
    unknown,
) {
  if (
    !Array.isArray(
      linesInput,
    ) ||
    linesInput.length <
      1 ||
    linesInput.length >
      100
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'An invoice needs between 1 and 100 line items.',
    );
  }

  const normalized:
    Array<{
      catalogItemId: string | null;
      description: string;
      sku: string | null;
      unit: string;
      quantity: number;
      unitPrice: number;
      discountType:
        'percent' |
        'fixed';
      discountValue: number;
      discountAmount: number;
      taxRateId: string | null;
      taxName: string | null;
      taxRate: number;
      taxAmount: number;
      subtotal: number;
      lineTotal: number;
      sortOrder: number;
    }> =
      [];

  for (
    let index =
      0;
    index <
      linesInput.length;
    index +=
      1
  ) {
    const raw =
      (
        linesInput[index] &&
        typeof linesInput[index] ===
          'object' &&
        !Array.isArray(
          linesInput[index],
        )
      )
        ? linesInput[index] as
            CreateInvoiceLineInput
        : {};

    const catalogItemId =
      optionalUuid(
        raw.catalogItemId,
      );

    let catalog:
      Record<
        string,
        unknown
      > |
      null =
        null;

    if (
      catalogItemId
    ) {
      const result =
        await client.query(
          `
            SELECT
              id,
              name,
              sku,
              description,
              unit,
              unit_price,
              default_tax_rate_id
            FROM invoicing_catalog_items
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
            catalogItemId,
            companyId,
          ],
        );

      if (
        result.rows.length ===
          1
      ) {
        catalog =
          result.rows[0];
      }
    }

    const description =
      cleanText(
        raw.description ||
        catalog
          ?.description ||
        catalog
          ?.name,
        2000,
      );

    if (
      !description
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Every invoice line needs a description.',
      );
    }

    const quantity =
      numberInput(
        raw.quantity ??
        1,
        'Quantity',
        {
          min:
            0.0001,
          max:
            1_000_000,
        },
      );

    const unitPrice =
      numberInput(
        raw.unitPrice ??
        catalog
          ?.unit_price ??
        0,
        'Unit price',
      );

    const discountType:
      'percent' |
      'fixed' =
        raw.discountType ===
          'fixed'
          ? 'fixed'
          : 'percent';

    const discountValue =
      numberInput(
        raw.discountValue ??
        0,
        'Discount',
        {
          max:
            discountType ===
              'percent'
              ? 100
              : 1_000_000_000_000,
        },
      );

    const gross =
      quantity *
      unitPrice;

    const discountAmount =
      discountType ===
        'percent'
        ? gross *
          discountValue /
          100
        : Math.min(
            gross,
            discountValue,
          );

    let taxRateId =
      optionalUuid(
        raw.taxRateId ||
        catalog
          ?.default_tax_rate_id,
      );

    let taxRate =
      raw.taxRate ===
        undefined ||
      raw.taxRate ===
        null ||
      raw.taxRate ===
        ''
        ? null
        : numberInput(
            raw.taxRate,
            'Tax rate',
            {
              max:
                100,
            },
          );

    let taxName:
      string |
      null =
        null;

    if (
      taxRateId
    ) {
      const taxResult =
        await client.query(
          `
            SELECT
              name,
              rate
            FROM invoicing_tax_rates
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
            taxRateId,
            companyId,
          ],
        );

      if (
        taxResult.rows.length !==
          1
      ) {
        taxRateId =
          null;
      } else {
        taxName =
          String(
            taxResult.rows[0].name,
          );

        taxRate =
          money(
            taxResult.rows[0].rate,
          );
      }
    }

    taxRate =
      taxRate ??
      0;

    const subtotal =
      Math.max(
        0,
        gross -
        discountAmount,
      );

    const taxAmount =
      subtotal *
      taxRate /
      100;

    normalized.push({
      catalogItemId,
      description,
      sku:
        nullableText(
          raw.sku ||
          catalog?.sku,
          120,
        ),
      unit:
        cleanText(
          raw.unit ||
          catalog?.unit ||
          'unit',
          40,
        ) ||
        'unit',
      quantity,
      unitPrice,
      discountType,
      discountValue,
      discountAmount:
        money(
          discountAmount,
        ),
      taxRateId,
      taxName,
      taxRate:
        money(
          taxRate,
        ),
      taxAmount:
        money(
          taxAmount,
        ),
      subtotal:
        money(
          subtotal,
        ),
      lineTotal:
        money(
          subtotal +
          taxAmount,
        ),
      sortOrder:
        index,
    });
  }

  return normalized;
}


export async function createInvoice(
  input:
    CreateInvoiceInput,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_CREATE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const customerId =
      requireUuid(
        input.customerId,
        'Customer',
      );

    const customerResult =
      await client.query(
        `
          SELECT
            id,
            name,
            email,
            phone,
            currency,
            payment_terms_id
          FROM invoicing_customers
          WHERE id =
                $1
            AND company_id =
                $2
            AND status =
                'active'
            AND deleted_at
                IS NULL
          LIMIT 1
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
        'Choose an active customer.',
      );
    }

    const settingsResult =
      await client.query(
        `
          SELECT *
          FROM invoicing_settings
          WHERE company_id =
                $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0] ||
      {};

    const invoiceDate =
      isoDate(
        input.invoiceDate,
        new Date(),
      );

    let dueDays =
      Number(
        settings.default_due_days ||
        30,
      );

    if (
      customerResult.rows[0]
        .payment_terms_id
    ) {
      const term =
        await client.query(
          `
            SELECT
              due_days
            FROM invoicing_payment_terms
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND deleted_at
                  IS NULL
            LIMIT 1
          `,
          [
            customerResult.rows[0]
              .payment_terms_id,
            context.companyId,
          ],
        );

      if (
        term.rows[0]
      ) {
        dueDays =
          Number(
            term.rows[0].due_days ||
            dueDays,
          );
      }
    }

    const dueDate =
      input.dueDate
        ? isoDate(
            input.dueDate,
          )
        : datePlusDays(
            invoiceDate,
            dueDays,
          );

    if (
      dueDate <
      invoiceDate
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Due date cannot be before invoice date.',
      );
    }

    const lines =
      await normalizeInvoiceLines(
        client,
        context.companyId,
        input.lines,
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
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const rounding =
      Number(
        input.roundingAdjustment ??
        0,
      );

    if (
      !Number.isFinite(
        rounding,
      ) ||
      Math.abs(
        rounding,
      ) >
        1_000_000
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Rounding adjustment is invalid.',
      );
    }

    const roundingAdjustment =
      money(
        rounding,
      );

    const totalAmount =
      money(
        subtotal +
        taxTotal +
        shippingTotal +
        roundingAdjustment,
      );

    if (
      totalAmount <
      0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice total cannot be negative.',
      );
    }

    const invoiceNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'invoice',
      );

    const currency =
      cleanText(
        input.currency ||
        customerResult.rows[0].currency ||
        settings.default_currency ||
        context.company
          .currentCompany.currency ||
        'KES',
        3,
      ).toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const confirmAllowed =
      context.permissions.isOwner ||
      permissionContextHas(
        context.permissions,
        INVOICING_PERMISSIONS
          .INVOICE_CONFIRM,
      );

    const status =
      input.confirm ===
        true &&
      confirmAllowed
        ? 'confirmed'
        : 'draft';

    const invoiceResult =
      await client.query(
        `
          INSERT INTO invoicing_invoices (
            company_id,
            customer_id,
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
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,$18,$19,
            CASE
              WHEN $5 =
                   'confirmed'
              THEN NOW()
              ELSE NULL
            END,
            $20,$20
          )
          RETURNING
            id,
            invoice_number,
            status
        `,
        [
          context.companyId,
          customerId,
          settings.default_template_id ||
          null,
          invoiceNumber,
          status,
          invoiceDate,
          dueDate,
          currency,
          nullableText(
            input.reference,
            255,
          ),
          nullableText(
            input.purchaseOrderNumber,
            180,
          ),
          subtotal,
          discountTotal,
          taxTotal,
          shippingTotal,
          roundingAdjustment,
          totalAmount,
          nullableText(
            input.notes,
            5000,
          ),
          nullableText(
            input.terms ||
            settings.terms_and_conditions,
            10000,
          ),
          nullableText(
            settings.payment_instructions,
            10000,
          ),
          context.userId,
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
          context.companyId,
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
          $1,$2,NULL,$3,
          'Invoice created',
          $4
        )
      `,
      [
        invoiceId,
        context.companyId,
        status,
        context.userId,
      ],
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
          'invoice.created',
        content:
          'Invoice ' +
          invoiceNumber +
          ' created.',
        metadata: {
          status,
          totalAmount,
          currency,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        invoiceId,
      invoiceNumber,
      status,
      totalAmount,
      currency,
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


const ALLOWED_MANUAL_TRANSITIONS:
  Record<
    string,
    string[]
  > = {
    draft: [
      'confirmed',
      'cancelled',
      'void',
    ],
    confirmed: [
      'cancelled',
      'void',
      'written_off',
    ],
    sent: [
      'cancelled',
      'void',
      'written_off',
    ],
    viewed: [
      'cancelled',
      'void',
      'written_off',
    ],
    overdue: [
      'cancelled',
      'void',
      'written_off',
    ],
    partially_paid: [
      'written_off',
    ],
  };


export async function changeInvoiceStatus(
  input:
    Record<string, unknown>,
) {
  const next =
    cleanText(
      input.status,
      30,
    );

  const permission =
    next ===
      'confirmed'
      ? INVOICING_PERMISSIONS
          .INVOICE_CONFIRM
      : INVOICING_PERMISSIONS
          .INVOICE_CANCEL;

  const context =
    await requireInvoicingContext(
      permission,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const current =
    await context.pool.query(
      `
        SELECT
          status,
          invoice_number
        FROM invoicing_invoices
        WHERE id =
              $1
          AND company_id =
              $2
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        invoiceId,
        context.companyId,
      ],
    );

  if (
    current.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const oldStatus =
    String(
      current.rows[0].status,
    );

  if (
    !(
      ALLOWED_MANUAL_TRANSITIONS[
        oldStatus
      ] ||
      []
    ).includes(
      next,
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'That invoice status change is not allowed.',
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
        UPDATE invoicing_invoices
        SET
          status =
            $3,
          confirmed_at =
            CASE
              WHEN $3 =
                   'confirmed'
              THEN COALESCE(
                confirmed_at,
                NOW()
              )
              ELSE confirmed_at
            END,
          cancelled_at =
            CASE
              WHEN $3 IN (
                'cancelled',
                'void'
              )
              THEN NOW()
              ELSE cancelled_at
            END,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        next,
        context.userId,
      ],
    );

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
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        invoiceId,
        context.companyId,
        oldStatus,
        next,
        nullableText(
          input.reason,
          2000,
        ),
        context.userId,
      ],
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
          'invoice.status_changed',
        content:
          'Invoice status changed from ' +
          oldStatus +
          ' to ' +
          next +
          '.',
        metadata: {
          from:
            oldStatus,
          to:
            next,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        invoiceId,
      status:
        next,
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


export async function recordInvoicePayment(
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

  const paymentAmount =
    numberInput(
      input.amount,
      'Payment amount',
      {
        min:
          0.0001,
      },
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const locked =
      await client.query(
        `
          SELECT
            id,
            invoice_number,
            customer_id,
            currency,
            total_amount,
            status
          FROM invoicing_invoices
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
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

    const aging =
      await client.query(
        `
          SELECT
            balance_due,
            effective_status
          FROM invoicing_aging
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    const invoice = {
      ...locked.rows[0],
      ...(
        aging.rows[0] ||
        {}
      ),
    };

    const effectiveStatus =
      String(
        invoice.effective_status ||
        invoice.status,
      );

    if (
      [
        'draft',
        'cancelled',
        'void',
        'written_off',
        'paid',
      ].includes(
        effectiveStatus,
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Payments can only be recorded against an open confirmed or sent invoice.',
      );
    }

    const balance =
      money(
        invoice.balance_due,
      );

    if (
      paymentAmount >
      balance +
      0.0001
    ) {
      throw new InvoicingError(
        'PAYMENT_EXCEEDS_BALANCE',
        'Payment exceeds the invoice balance.',
        {
          balance,
        },
      );
    }

    const paymentNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'payment',
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
            method,
            reference,
            status,
            notes,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            'posted',
            $9,$10,$10
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          paymentNumber,
          invoice.customer_id,
          isoDate(
            input.paymentDate,
            new Date(),
          ),
          paymentAmount,
          String(
            invoice.currency,
          ),
          cleanText(
            input.method,
            50,
          ) ||
          'other',
          nullableText(
            input.reference,
            255,
          ),
          nullableText(
            input.notes,
            3000,
          ),
          context.userId,
        ],
      );

    const paymentId =
      String(
        payment.rows[0].id,
      );

    await client.query(
      `
        INSERT INTO invoicing_payment_allocations (
          company_id,
          payment_id,
          invoice_id,
          amount,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5
        )
      `,
      [
        context.companyId,
        paymentId,
        invoiceId,
        paymentAmount,
        context.userId,
      ],
    );

    const remaining =
      money(
        balance -
        paymentAmount,
      );

    const nextStatus =
      remaining <=
        0.0001
        ? 'paid'
        : 'partially_paid';

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          status =
            $3,
          paid_at =
            CASE
              WHEN $3 =
                   'paid'
              THEN NOW()
              ELSE NULL
            END,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        nextStatus,
        context.userId,
      ],
    );

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
          $1,$2,$3,$4,$5,$6
        )
      `,
      [
        invoiceId,
        context.companyId,
        String(
          invoice.status,
        ),
        nextStatus,
        'Payment ' +
        paymentNumber +
        ' recorded',
        context.userId,
      ],
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
          'invoice.payment_recorded',
        content:
          'Payment ' +
          paymentNumber +
          ' recorded against invoice ' +
          String(
            invoice.invoice_number,
          ) +
          '.',
        metadata: {
          paymentId,
          paymentNumber,
          amount:
            paymentAmount,
          remainingBalance:
            remaining,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      paymentId,
      paymentNumber,
      invoiceId,
      status:
        nextStatus,
      remainingBalance:
        remaining,
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


export async function issueInvoiceCreditNote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CREDIT_NOTE_MANAGE,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const creditAmount =
    numberInput(
      input.amount,
      'Credit amount',
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
      'Credit note reason is required.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const locked =
      await client.query(
        `
          SELECT
            id,
            customer_id,
            invoice_number,
            currency,
            status
          FROM invoicing_invoices
          WHERE id =
                $1
            AND company_id =
                $2
            AND deleted_at
                IS NULL
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

    if (
      [
        'draft',
        'cancelled',
        'void',
        'written_off',
      ].includes(
        String(
          locked.rows[0].status,
        ),
      )
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'A credit note cannot be issued for this invoice state.',
      );
    }

    const aging =
      await client.query(
        `
          SELECT
            balance_due
          FROM invoicing_aging
          WHERE invoice_id =
                $1
            AND company_id =
                $2
          LIMIT 1
        `,
        [
          invoiceId,
          context.companyId,
        ],
      );

    const balance =
      money(
        aging.rows[0]
          ?.balance_due,
      );

    if (
      creditAmount >
      balance +
      0.0001
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Credit note cannot exceed the remaining invoice balance.',
        {
          balance,
        },
      );
    }

    const creditNoteNumber =
      await nextDocumentNumber(
        client,
        context.companyId,
        context.userId,
        'credit_note',
      );

    const result =
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
            total_amount,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,
            'issued',
            CURRENT_DATE,
            $5,$6,$7,$7,$8,$8
          )
          RETURNING
            id
        `,
        [
          context.companyId,
          invoiceId,
          locked.rows[0]
            .customer_id,
          creditNoteNumber,
          locked.rows[0]
            .currency,
          reason,
          creditAmount,
          context.userId,
        ],
      );

    await client.query(
      `
        INSERT INTO invoicing_credit_note_items (
          credit_note_id,
          company_id,
          description,
          quantity,
          unit_price,
          line_total
        )
        VALUES (
          $1,$2,$3,1,$4,$4
        )
      `,
      [
        result.rows[0].id,
        context.companyId,
        reason,
        creditAmount,
      ],
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
          creditNoteNumber,
          amount:
            creditAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          result.rows[0].id,
        ),
      creditNoteNumber,
      amount:
        creditAmount,
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


function publicBaseUrl() {
  const raw =
    process.env.APP_URL ||
    process.env
      .NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  return raw
    .replace(
      /\/+$/,
      '',
    );
}


export async function sendInvoiceToCustomer(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.total_amount,
          i.currency,
          c.name
            AS customer_name,
          c.email,
          c.phone
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
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

  if (
    [
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
      'This invoice cannot be sent in its current state.',
    );
  }

  const token =
    crypto
      .randomBytes(
        32,
      )
      .toString(
        'base64url',
      );

  const tokenHash =
    sha256(
      token,
    );

  const publicPath =
    '/i/' +
    context.tenantId +
    '/' +
    token;

  const channels =
    Array.isArray(
      input.channels,
    )
      ? input.channels
          .map(
            item =>
              String(
                item,
              )
                .trim()
                .toLowerCase(),
          )
      : [
          'email',
        ];

  const deliveries:
    Array<{
      channel: string;
      success: boolean;
      provider?: string;
      messageId?: string;
      errorCode?: string;
    }> =
      [];

  if (
    channels.includes(
      'email',
    ) &&
    invoice.email
  ) {
    try {
      const delivery =
        await sendWorkspaceNotificationEmail(
          String(
            invoice.email,
          ),
          String(
            invoice.customer_name,
          ),
          {
            title:
              'Invoice ' +
              String(
                invoice.invoice_number,
              ),
            message:
              context.company
                .currentCompany.name +
              ' sent you invoice ' +
              String(
                invoice.invoice_number,
              ) +
              ' for ' +
              String(
                invoice.currency,
              ) +
              ' ' +
              money(
                invoice.total_amount,
              ).toLocaleString() +
              '.',
            actionHref:
              publicPath,
          },
        );

      deliveries.push({
        channel:
          'email',
        success:
          delivery.success,
        messageId:
          delivery.messageId,
      });
    } catch {
      deliveries.push({
        channel:
          'email',
        success:
          false,
        errorCode:
          'EMAIL_DELIVERY_FAILED',
      });
    }
  }

  if (
    channels.includes(
      'sms',
    ) &&
    invoice.phone
  ) {
    const delivery =
      await sendWorkspaceNotificationSms(
        String(
          invoice.phone,
        ),
        {
          title:
            'Invoice ' +
            String(
              invoice.invoice_number,
            ),
          message:
            'View: ' +
            publicBaseUrl() +
            publicPath,
        },
      );

    deliveries.push({
      channel:
        'sms',
      success:
        delivery.success,
      provider:
        delivery.provider,
      messageId:
        delivery.messageId,
      errorCode:
        delivery.errorCode,
    });
  }

  if (
    deliveries.length ===
      0
  ) {
    throw new InvoicingError(
      'DELIVERY_FAILED',
      'This customer does not have a usable email address or phone number for the selected channel.',
    );
  }

  const successful =
    deliveries.filter(
      delivery =>
        delivery.success,
    );

  if (
    successful.length ===
      0
  ) {
    throw new InvoicingError(
      'DELIVERY_FAILED',
      'Invoice delivery failed on every selected channel.',
      {
        deliveries,
      },
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const oldStatus =
      String(
        invoice.status,
      );

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          public_token_hash =
            $3,
          public_enabled =
            TRUE,
          status =
            CASE
              WHEN status IN (
                'draft',
                'confirmed'
              )
              THEN 'sent'
              ELSE status
            END,
          confirmed_at =
            COALESCE(
              confirmed_at,
              NOW()
            ),
          sent_at =
            NOW(),
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
        tokenHash,
        context.userId,
      ],
    );

    if (
      [
        'draft',
        'confirmed',
      ].includes(
        oldStatus,
      )
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
            $1,$2,$3,
            'sent',
            'Invoice delivered to customer',
            $4
          )
        `,
        [
          invoiceId,
          context.companyId,
          oldStatus,
          context.userId,
        ],
      );
    }

    for (
      const delivery
      of deliveries
    ) {
      await client.query(
        `
          INSERT INTO invoicing_delivery_log (
            company_id,
            invoice_id,
            channel,
            destination_fingerprint,
            provider,
            provider_message_id,
            status,
            error_code,
            created_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9
          )
        `,
        [
          context.companyId,
          invoiceId,
          delivery.channel,
          sha256(
            delivery.channel ===
              'email'
              ? String(
                  invoice.email ||
                  '',
                )
              : String(
                  invoice.phone ||
                  '',
                ),
          ),
          delivery.provider ||
          null,
          delivery.messageId ||
          null,
          delivery.success
            ? 'sent'
            : 'failed',
          delivery.errorCode ||
          null,
          context.userId,
        ],
      );
    }

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.sent',
        content:
          'Invoice ' +
          String(
            invoice.invoice_number,
          ) +
          ' sent to the customer.',
        metadata: {
          channels:
            successful.map(
              delivery =>
                delivery.channel,
            ),
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      invoiceId,
      publicPath,
      deliveries,
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


export async function createRecurringInvoiceTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .RECURRING_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const customer =
    await context.pool.query(
      `
        SELECT id
        FROM invoicing_customers
        WHERE id =
              $1
          AND company_id =
              $2
          AND deleted_at
              IS NULL
          AND status =
              'active'
        LIMIT 1
      `,
      [
        customerId,
        context.companyId,
      ],
    );

  if (
    customer.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'CUSTOMER_NOT_FOUND',
      'Choose an active customer.',
    );
  }

  const rawInterval =
    cleanText(
      input.intervalUnit,
      20,
    );

  const intervalUnit =
    [
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ].includes(
      rawInterval,
    )
      ? rawInterval
      : 'month';

  const rawIntervalCount =
    Number(
      input.intervalCount ||
      1,
    );

  const intervalCount =
    Number.isFinite(
      rawIntervalCount,
    )
      ? Math.max(
          1,
          Math.min(
            120,
            Math.floor(
              rawIntervalCount,
            ),
          ),
        )
      : 1;

  const name =
    cleanText(
      input.name,
      255,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Recurring invoice name is required.',
    );
  }

  const payload =
    (
      input.invoicePayload &&
      typeof input.invoicePayload ===
        'object' &&
      !Array.isArray(
        input.invoicePayload,
      )
    )
      ? input.invoicePayload
      : {};

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_recurring_templates (
          company_id,
          customer_id,
          name,
          status,
          interval_unit,
          interval_count,
          start_date,
          next_run_at,
          auto_send,
          currency,
          invoice_payload,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,
          'active',
          $4,$5,
          CURRENT_DATE,
          $6,$7,$8,$9::jsonb,$10,$10
        )
        RETURNING
          id
      `,
      [
        context.companyId,
        customerId,
        name,
        intervalUnit,
        intervalCount,
        isoDate(
          input.nextRunAt,
          new Date(),
        ),
        input.autoSend ===
          true,
        cleanText(
          input.currency ||
          context.company
            .currentCompany.currency ||
          'KES',
          3,
        ).toUpperCase(),
        JSON.stringify(
          payload,
        ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function updateInvoicingSettings(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  await ensureCompanyDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const currency =
    cleanText(
      input.defaultCurrency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Default currency must be a three-letter code.',
    );
  }

  const rawDays =
    Number(
      input.defaultDueDays ??
      30,
    );

  const dueDays =
    Number.isFinite(
      rawDays,
    )
      ? Math.max(
          0,
          Math.min(
            3650,
            Math.floor(
              rawDays,
            ),
          ),
        )
      : 30;

  await context.pool.query(
    `
      UPDATE invoicing_settings
      SET
        default_currency =
          $2,
        default_due_days =
          $3,
        tax_calculation =
          $4,
        allow_partial_payments =
          $5,
        allow_credit_notes =
          $6,
        require_approval =
          $7,
        auto_send_recurring =
          $8,
        reminder_enabled =
          $9,
        payment_instructions =
          $10,
        bank_details =
          $11,
        terms_and_conditions =
          $12,
        updated_by =
          $13,
        updated_at =
          NOW()
      WHERE company_id =
            $1
    `,
    [
      context.companyId,
      currency,
      dueDays,
      input.taxCalculation ===
        'inclusive'
        ? 'inclusive'
        : 'exclusive',
      input.allowPartialPayments !==
        false,
      input.allowCreditNotes !==
        false,
      input.requireApproval ===
        true,
      input.autoSendRecurring ===
        true,
      input.reminderEnabled !==
        false,
      nullableText(
        input.paymentInstructions,
        10000,
      ),
      nullableText(
        input.bankDetails,
        10000,
      ),
      nullableText(
        input.termsAndConditions,
        10000,
      ),
      context.userId,
    ],
  );

  return {
    updated:
      true,
  };
}
