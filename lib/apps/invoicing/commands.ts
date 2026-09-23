import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  deliverInvoice,
  normalizeInvoiceDeliveryChannels,
} from '@/lib/apps/invoicing/delivery';

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

  const requestedPaymentTermsId =
    optionalUuid(
      input.paymentTermsId,
    );

  let paymentTermsId:
    string |
    null =
      null;

  if (
    requestedPaymentTermsId
  ) {
    const paymentTerm =
      await context.pool.query(
        `
          SELECT id
          FROM invoicing_payment_terms
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
          requestedPaymentTermsId,
          context.companyId,
        ],
      );

    if (
      paymentTerm.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose a valid payment term for this company.',
      );
    }

    paymentTermsId =
      requestedPaymentTermsId;
  }

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
        paymentTermsId,
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

  const requestedTaxRateId =
    optionalUuid(
      input.taxRateId,
    );

  let taxRateId:
    string |
    null =
      null;

  if (
    requestedTaxRateId
  ) {
    const tax =
      await context.pool.query(
        `
          SELECT id
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
          requestedTaxRateId,
          context.companyId,
        ],
      );

    if (
      tax.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Choose a valid tax rate for this company.',
      );
    }

    taxRateId =
      requestedTaxRateId;
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
        taxRateId,
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


export async function normalizeInvoicingLines(
  client:
    PoolClient,
  companyId:
    string,
  linesInput:
    unknown,
  taxCalculation:
    'exclusive' |
    'inclusive',
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

    const discountedAmount =
      Math.max(
        0,
        gross -
        discountAmount,
      );

    const taxAmount =
      taxCalculation ===
        'inclusive' &&
      taxRate >
        0
        ? discountedAmount *
          taxRate /
          (
            100 +
            taxRate
          )
        : discountedAmount *
          taxRate /
          100;

    const lineTotal =
      taxCalculation ===
        'inclusive'
        ? discountedAmount
        : discountedAmount +
          taxAmount;

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
          gross,
        ),
      lineTotal:
        money(
          lineTotal,
        ),
      sortOrder:
        index,
    });
  }

  return normalized;
}


async function resolveInvoiceTemplateId(
  client:
    PoolClient,
  companyId:
    string,
  requested:
    unknown,
  fallback:
    unknown,
) {
  const candidate =
    optionalUuid(
      requested,
    ) ||
    optionalUuid(
      fallback,
    );

  if (
    !candidate
  ) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
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
        candidate,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid active invoice template.',
    );
  }

  return String(
    result.rows[0].id,
  );
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
            c.id,
            c.name,
            c.email,
            c.phone,
            c.billing_address,
            c.tax_id,
            c.currency,
            c.payment_terms_id,
            pt.name
              AS payment_terms_name,
            pt.due_days
          FROM invoicing_customers c
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               c.company_id
           AND pt.deleted_at
               IS NULL
          WHERE c.id =
                $1
            AND c.company_id =
                $2
            AND c.status =
                'active'
            AND c.deleted_at
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

    const templateId =
      await resolveInvoiceTemplateId(
        client,
        context.companyId,
        input.templateId,
        settings.default_template_id,
      );

    const invoiceDate =
      isoDate(
        input.invoiceDate,
        new Date(),
      );

    const taxCalculation:
      'exclusive' |
      'inclusive' =
        settings.tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive';

    let dueDays =
      Number(
        settings.default_due_days ||
        30,
      );

    if (
      customerResult.rows[0]
        .payment_terms_id
    ) {
      dueDays =
        Number(
          customerResult.rows[0]
            .due_days ||
          dueDays,
        );
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
      await normalizeInvoicingLines(
        client,
        context.companyId,
        input.lines,
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
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,
            CASE
              WHEN $12 =
                   'confirmed'
              THEN NOW()
              ELSE NULL
            END,
            $27,$27
          )
          RETURNING
            id,
            invoice_number,
            status
        `,
        [
          context.companyId,
          customerId,
          nullableText(
            customerResult.rows[0].name,
            255,
          ),
          nullableText(
            customerResult.rows[0].email,
            255,
          ),
          nullableText(
            customerResult.rows[0].phone,
            60,
          ),
          nullableText(
            customerResult.rows[0].billing_address,
            4000,
          ),
          nullableText(
            customerResult.rows[0].tax_id,
            120,
          ),
          nullableText(
            customerResult.rows[0].payment_terms_name,
            140,
          ),
          taxCalculation,
          templateId,
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


export async function updateInvoiceDraft(
  input:
    CreateInvoiceInput &
    {
      invoiceId?: unknown;
    },
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_EDIT,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const existing =
      await client.query(
        `
          SELECT
            id,
            invoice_number,
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
      existing.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVOICE_NOT_FOUND',
        'Invoice was not found.',
      );
    }

    if (
      String(
        existing.rows[0].status,
      ) !==
      'draft'
    ) {
      throw new InvoicingError(
        'INVOICE_STATE_INVALID',
        'Only draft invoices can be edited. Use payments, credit notes or cancellation after confirmation.',
      );
    }

    const customerId =
      requireUuid(
        input.customerId,
        'Customer',
      );

    const customerResult =
      await client.query(
        `
          SELECT
            c.id,
            c.name,
            c.email,
            c.phone,
            c.billing_address,
            c.tax_id,
            c.currency,
            c.payment_terms_id,
            pt.name
              AS payment_terms_name,
            pt.due_days
          FROM invoicing_customers c
          LEFT JOIN invoicing_payment_terms pt
            ON pt.id =
               c.payment_terms_id
           AND pt.company_id =
               c.company_id
           AND pt.deleted_at
               IS NULL
          WHERE c.id =
                $1
            AND c.company_id =
                $2
            AND c.status =
                'active'
            AND c.deleted_at
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

    const templateId =
      await resolveInvoiceTemplateId(
        client,
        context.companyId,
        input.templateId,
        settings.default_template_id,
      );

    const taxCalculation:
      'exclusive' |
      'inclusive' =
        settings.tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive';

    const invoiceDate =
      isoDate(
        input.invoiceDate,
        new Date(),
      );

    const dueDays =
      Number(
        customerResult.rows[0]
          .due_days ||
        settings.default_due_days ||
        30,
      );

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
      await normalizeInvoicingLines(
        client,
        context.companyId,
        input.lines,
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
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const rawRounding =
      Number(
        input.roundingAdjustment ??
        0,
      );

    if (
      !Number.isFinite(
        rawRounding,
      ) ||
      Math.abs(
        rawRounding,
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
        rawRounding,
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

    if (
      totalAmount <
      0
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Invoice total cannot be negative.',
      );
    }

    const currency =
      cleanText(
        input.currency ||
        customerResult.rows[0]
          .currency ||
        settings.default_currency ||
        context.company
          .currentCompany
          .currency ||
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

    await client.query(
      `
        UPDATE invoicing_invoices
        SET
          customer_id =
            $3,
          bill_to_name =
            $4,
          bill_to_email =
            $5,
          bill_to_phone =
            $6,
          bill_to_address =
            $7,
          bill_to_tax_id =
            $8,
          payment_terms_name_snapshot =
            $9,
          tax_calculation =
            $10,
          template_id =
            $11,
          invoice_date =
            $12,
          due_date =
            $13,
          currency =
            $14,
          reference =
            $15,
          purchase_order_number =
            $16,
          subtotal =
            $17,
          discount_total =
            $18,
          tax_total =
            $19,
          shipping_total =
            $20,
          rounding_adjustment =
            $21,
          total_amount =
            $22,
          notes =
            $23,
          terms =
            $24,
          payment_instructions =
            $25,
          updated_by =
            $26,
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
        customerId,
        nullableText(
          customerResult.rows[0].name,
          255,
        ),
        nullableText(
          customerResult.rows[0].email,
          255,
        ),
        nullableText(
          customerResult.rows[0].phone,
          60,
        ),
        nullableText(
          customerResult.rows[0]
            .billing_address,
          4000,
        ),
        nullableText(
          customerResult.rows[0].tax_id,
          120,
        ),
        nullableText(
          customerResult.rows[0]
            .payment_terms_name,
          140,
        ),
        taxCalculation,
        templateId,
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

    await client.query(
      `
        DELETE FROM invoicing_invoice_items
        WHERE invoice_id =
              $1
          AND company_id =
              $2
      `,
      [
        invoiceId,
        context.companyId,
      ],
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

    await recordInvoicingActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        invoiceId,
        type:
          'invoice.draft_updated',
        content:
          'Invoice ' +
          String(
            existing.rows[0]
              .invoice_number,
          ) +
          ' draft updated.',
        metadata: {
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
      invoiceNumber:
        String(
          existing.rows[0]
            .invoice_number,
        ),
      status:
        'draft',
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

  const channels =
    normalizeInvoiceDeliveryChannels(
      input.channels,
    );

  return deliverInvoice({
    pool:
      context.pool,
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    companyName:
      context.company
        .currentCompany
        .name,
    userId:
      context.userId,
    invoiceId,
    channels,
  });
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

  const sourceInvoiceId =
    requireUuid(
      input.sourceInvoiceId,
      'Source invoice',
    );

  const source =
    await context.pool.query(
      `
        SELECT
          i.id,
          i.customer_id,
          i.invoice_number,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.shipping_total,
          i.rounding_adjustment,
          i.notes,
          i.terms,
          i.tax_calculation,
          i.template_id,
          i.status,
          c.status
            AS customer_status
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
          AND c.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        sourceInvoiceId,
        context.companyId,
      ],
    );

  if (
    source.rows.length !==
      1 ||
    source.rows[0]
      .customer_status !==
      'active'
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Choose an invoice with an active customer.',
    );
  }

  if (
    [
      'cancelled',
      'void',
      'written_off',
    ].includes(
      String(
        source.rows[0].status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Cancelled, void or written-off invoices cannot become recurring templates.',
    );
  }

  const lines =
    await context.pool.query(
      `
        SELECT
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          tax_rate_id,
          tax_rate
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
        sourceInvoiceId,
        context.companyId,
      ],
    );

  if (
    lines.rows.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The source invoice has no line items.',
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

  const requestedDeliveryChannels =
    normalizeInvoiceDeliveryChannels(
      input.deliveryChannels,
    );

  const deliveryChannels =
    requestedDeliveryChannels.length >
      0
      ? requestedDeliveryChannels
      : [
          'email',
        ] as const;

  const payload = {
    sourceInvoiceNumber:
      String(
        source.rows[0]
          .invoice_number,
      ),
    reference:
      source.rows[0]
        .reference ||
      null,
    purchaseOrderNumber:
      source.rows[0]
        .purchase_order_number ||
      null,
    shippingTotal:
      money(
        source.rows[0]
          .shipping_total,
      ),
    roundingAdjustment:
      money(
        source.rows[0]
          .rounding_adjustment,
      ),
    notes:
      source.rows[0]
        .notes ||
      null,
    terms:
      source.rows[0]
        .terms ||
      null,
    taxCalculation:
      source.rows[0]
        .tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive',
    templateId:
      source.rows[0]
        .template_id ||
      null,
    deliveryChannels,
    lines:
      lines.rows.map(
        line => ({
          catalogItemId:
            line.catalog_item_id ||
            undefined,
          description:
            String(
              line.description,
            ),
          sku:
            line.sku_snapshot ||
            undefined,
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
              ? 'fixed'
              : 'percent',
          discountValue:
            money(
              line.discount_value,
            ),
          taxRateId:
            line.tax_rate_id ||
            undefined,
          taxRate:
            money(
              line.tax_rate,
            ),
        }),
      ),
  };

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_recurring_templates (
          company_id,
          customer_id,
          source_invoice_id,
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
          $1,$2,$3,$4,
          'active',
          $5,$6,
          CURRENT_DATE,
          $7,$8,$9,$10::jsonb,$11,$11
        )
        RETURNING
          id
      `,
      [
        context.companyId,
        source.rows[0]
          .customer_id,
        sourceInvoiceId,
        name,
        intervalUnit,
        intervalCount,
        isoDate(
          input.nextRunAt,
          new Date(),
        ),
        input.autoSend ===
          true,
        String(
          source.rows[0]
            .currency,
        ),
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


function normalizedHexColor(
  value:
    unknown,
  fallback:
    string,
) {
  const text =
    cleanText(
      value,
      16,
    );

  return /^#[0-9a-f]{6}$/i.test(
    text,
  )
    ? text.toLowerCase()
    : fallback;
}


export async function saveInvoicingTemplate(
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

  const templateId =
    optionalUuid(
      input.templateId,
    );

  const name =
    cleanText(
      input.name,
      140,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Template name is required.',
    );
  }

  const layoutRaw =
    cleanText(
      input.layout,
      40,
    );

  const layout =
    [
      'modern',
      'classic',
      'compact',
      'bold',
    ].includes(
      layoutRaw,
    )
      ? layoutRaw
      : 'modern';

  const fontRaw =
    cleanText(
      input.fontFamily,
      100,
    );

  const fontFamily =
    [
      'Inter',
      'Arial',
      'Helvetica',
      'Georgia',
    ].includes(
      fontRaw,
    )
      ? fontRaw
      : 'Inter';

  const makeDefault =
    input.isDefault ===
    true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_templates
          SET
            is_default =
              FALSE,
            updated_by =
              $2,
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    let result;

    if (
      templateId
    ) {
      result =
        await client.query(
          `
            UPDATE invoicing_templates
            SET
              name =
                $3,
              is_default =
                $4,
              primary_color =
                $5,
              secondary_color =
                $6,
              accent_color =
                $7,
              logo_url =
                $8,
              font_family =
                $9,
              layout =
                $10,
              show_company_logo =
                $11,
              show_company_address =
                $12,
              show_company_contact =
                $13,
              show_tax_id =
                $14,
              show_payment_instructions =
                $15,
              show_tax_breakdown =
                $16,
              show_discount =
                $17,
              footer_text =
                $18,
              terms_text =
                $19,
              updated_by =
                $20,
              updated_at =
                NOW()
            WHERE id =
                  $1
              AND company_id =
                  $2
              AND deleted_at
                  IS NULL
            RETURNING
              id,
              name
          `,
          [
            templateId,
            context.companyId,
            name,
            makeDefault,
            normalizedHexColor(
              input.primaryColor,
              '#164a9f',
            ),
            normalizedHexColor(
              input.secondaryColor,
              '#0f172a',
            ),
            input.accentColor
              ? normalizedHexColor(
                  input.accentColor,
                  '#d4af37',
                )
              : null,
            nullableText(
              input.logoUrl,
              2000,
            ),
            fontFamily,
            layout,
            input.showCompanyLogo !==
              false,
            input.showCompanyAddress !==
              false,
            input.showCompanyContact !==
              false,
            input.showTaxId !==
              false,
            input.showPaymentInstructions !==
              false,
            input.showTaxBreakdown !==
              false,
            input.showDiscount !==
              false,
            nullableText(
              input.footerText,
              4000,
            ),
            nullableText(
              input.termsText,
              10000,
            ),
            context.userId,
          ],
        );

      if (
        result.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'INVALID_INPUT',
          'Invoice template was not found.',
        );
      }
    } else {
      result =
        await client.query(
          `
            INSERT INTO invoicing_templates (
              company_id,
              name,
              is_default,
              primary_color,
              secondary_color,
              accent_color,
              logo_url,
              font_family,
              layout,
              show_company_logo,
              show_company_address,
              show_company_contact,
              show_tax_id,
              show_payment_instructions,
              show_tax_breakdown,
              show_discount,
              footer_text,
              terms_text,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$19
            )
            RETURNING
              id,
              name
          `,
          [
            context.companyId,
            name,
            makeDefault,
            normalizedHexColor(
              input.primaryColor,
              '#164a9f',
            ),
            normalizedHexColor(
              input.secondaryColor,
              '#0f172a',
            ),
            input.accentColor
              ? normalizedHexColor(
                  input.accentColor,
                  '#d4af37',
                )
              : null,
            nullableText(
              input.logoUrl,
              2000,
            ),
            fontFamily,
            layout,
            input.showCompanyLogo !==
              false,
            input.showCompanyAddress !==
              false,
            input.showCompanyContact !==
              false,
            input.showTaxId !==
              false,
            input.showPaymentInstructions !==
              false,
            input.showTaxBreakdown !==
              false,
            input.showDiscount !==
              false,
            nullableText(
              input.footerText,
              4000,
            ),
            nullableText(
              input.termsText,
              10000,
            ),
            context.userId,
          ],
        );
    }

    const savedId =
      String(
        result.rows[0].id,
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_template_id =
              $2,
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
          savedId,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        savedId,
      name:
        String(
          result.rows[0].name,
        ),
      isDefault:
        makeDefault,
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


export async function createInvoicingPaymentTerm(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      120,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Payment term name is required.',
    );
  }

  const dueDays =
    Math.floor(
      numberInput(
        input.dueDays,
        'Due days',
        {
          min:
            0,
          max:
            3650,
        },
      ),
    );

  const makeDefault =
    input.isDefault ===
    true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_payment_terms
          SET
            is_default =
              FALSE,
            updated_by =
              $2,
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO invoicing_payment_terms (
            company_id,
            name,
            description,
            due_days,
            is_default,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$6
          )
          RETURNING
            id,
            name
        `,
        [
          context.companyId,
          name,
          nullableText(
            input.description,
            1000,
          ),
          dueDays,
          makeDefault,
          context.userId,
        ],
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_payment_terms_id =
              $2,
            default_due_days =
              $3,
            updated_by =
              $4,
            updated_at =
              NOW()
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
          result.rows[0].id,
          dueDays,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
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


export async function createInvoicingTaxRate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      120,
    );

  if (
    !name
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Tax name is required.',
    );
  }

  const rate =
    numberInput(
      input.rate,
      'Tax rate',
      {
        min:
          0,
        max:
          100,
      },
    );

  const makeDefault =
    input.isDefault ===
    true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_tax_rates
          SET
            is_default =
              FALSE,
            updated_by =
              $2,
            updated_at =
              NOW()
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO invoicing_tax_rates (
            company_id,
            name,
            rate,
            tax_type,
            country_code,
            is_default,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$7
          )
          RETURNING
            id,
            name
        `,
        [
          context.companyId,
          name,
          rate,
          cleanText(
            input.taxType,
            40,
          ) ||
          'vat',
          nullableText(
            input.countryCode,
            2,
          ),
          makeDefault,
          context.userId,
        ],
      );

    if (
      makeDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            default_tax_rate_id =
              $2,
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
          result.rows[0].id,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
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

  const reminderDaysBeforeRaw =
    Number(
      input.reminderDaysBefore ??
      3,
    );

  const reminderDaysBefore =
    Number.isFinite(
      reminderDaysBeforeRaw,
    )
      ? Math.max(
          0,
          Math.min(
            365,
            Math.floor(
              reminderDaysBeforeRaw,
            ),
          ),
        )
      : 3;

  const reminderDaysAfter =
    cleanText(
      input.reminderDaysAfter,
      120,
    )
      .split(',')
      .map(
        value =>
          Number.parseInt(
            value.trim(),
            10,
          ),
      )
      .filter(
        value =>
          Number.isInteger(
            value,
          ) &&
          value >=
            0 &&
          value <=
            365,
      )
      .slice(
        0,
        12,
      );

  const reminderChannels =
    normalizeInvoiceDeliveryChannels(
      input.reminderChannels,
    );


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
        reminder_channels =
          $10::jsonb,
        reminder_days_before =
          $11,
        reminder_days_after =
          $12,
        payment_instructions =
          $13,
        bank_details =
          $14,
        terms_and_conditions =
          $15,
        updated_by =
          $16,
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
      JSON.stringify(
        reminderChannels.length >
          0
          ? reminderChannels
          : [
              'email',
            ],
      ),
      reminderDaysBefore,
      reminderDaysAfter.length >
        0
        ? reminderDaysAfter
        : [
            1,
            7,
            14,
          ],
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
