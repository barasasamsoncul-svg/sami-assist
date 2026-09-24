import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  createInvoice,
  createInvoicingCustomer,
} from '@/lib/apps/invoicing/commands';

import {
  deliverSalesQuote,
  normalizeSalesQuoteDeliveryChannels,
} from '@/lib/apps/sales/delivery';

import {
  cleanText,
  datePlusDays,
  ensureSalesDefaults,
  isoDate,
  money,
  nextSalesNumber,
  nullableText,
  numberInput,
  optionalUuid,
  recordSalesActivity,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

import type {
  CreateSalesQuoteInput,
} from '@/lib/apps/sales/types';


type NormalizedQuoteLine = {
  catalogItemId:
    string | null;
  sortOrder:
    number;
  description:
    string;
  sku:
    string | null;
  unit:
    string;
  quantity:
    number;
  unitPrice:
    number;
  discountType:
    'percent' |
    'fixed';
  discountValue:
    number;
  discountAmount:
    number;
  taxName:
    string | null;
  taxRate:
    number;
  taxAmount:
    number;
  subtotal:
    number;
  lineTotal:
    number;
};


function crossPermission(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  ...permissions:
    string[]
) {
  return (
    context.permissions
      .isOwner ||
    permissions.some(
      permission =>
        context.permissions
          .permissionSet
          .has(
            permission,
          ),
    )
  );
}


async function resolveCustomerSnapshot(
  client:
    PoolClient,
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  input:
    CreateSalesQuoteInput,
) {
  const billingCustomerId =
    optionalUuid(
      input.billingCustomerId,
    );

  if (
    billingCustomerId
  ) {
    if (
      !crossPermission(
        context,
        'invoicing.customer.view',
        'invoicing.customer.manage',
      )
    ) {
      throw new SalesError(
        'SALES_PERMISSION_REQUIRED',
        'Billing customer access is required to use an Invoicing customer on a quote.',
      );
    }

    const table =
      await client.query(
        `
          SELECT
            to_regclass(
              'public.invoicing_customers'
            ) IS NOT NULL
              AS ready
        `,
      );

    if (
      table.rows[0]
        ?.ready !==
        true
    ) {
      throw new SalesError(
        'INVOICING_REQUIRED',
        'Install Invoicing before linking billing customers.',
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            name,
            email,
            phone,
            tax_id,
            billing_address,
            shipping_address,
            currency
          FROM invoicing_customers
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          billingCustomerId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Choose a valid active billing customer.',
      );
    }

    const row =
      result.rows[0];

    return {
      billingCustomerId,
      customerName:
        String(
          row.name,
        ),
      customerEmail:
        row.email
          ? String(
              row.email,
            )
          : null,
      customerPhone:
        row.phone
          ? String(
              row.phone,
            )
          : null,
      customerTaxId:
        row.tax_id
          ? String(
              row.tax_id,
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
      currency:
        String(
          row.currency ||
          '',
        ),
    };
  }

  const customerName =
    cleanText(
      input.customerName,
      255,
    );

  if (
    !customerName
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Customer name is required.',
    );
  }

  return {
    billingCustomerId:
      null,
    customerName,
    customerEmail:
      nullableText(
        input.customerEmail,
        255,
      ),
    customerPhone:
      nullableText(
        input.customerPhone,
        80,
      ),
    customerTaxId:
      nullableText(
        input.customerTaxId,
        120,
      ),
    billingAddress:
      nullableText(
        input.billingAddress,
        4000,
      ),
    shippingAddress:
      nullableText(
        input.shippingAddress,
        4000,
      ),
    currency:
      '',
  };
}


async function resolveTemplate(
  client:
    PoolClient,
  companyId:
    string,
  templateIdInput:
    unknown,
) {
  const requested =
    optionalUuid(
      templateIdInput,
    );

  const result =
    requested
      ? await client.query(
          `
            SELECT
              id,
              notes,
              terms
            FROM sales_quote_templates
            WHERE id = $1
              AND company_id = $2
              AND is_active = TRUE
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            requested,
            companyId,
          ],
        )
      : await client.query(
          `
            SELECT
              id,
              notes,
              terms
            FROM sales_quote_templates
            WHERE company_id = $1
              AND is_active = TRUE
              AND deleted_at IS NULL
            ORDER BY
              is_default DESC,
              created_at
            LIMIT 1
          `,
          [
            companyId,
          ],
        );

  if (
    requested &&
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid quote template.',
    );
  }

  return result.rows[0] ||
    null;
}


async function normalizeQuoteLines(
  client:
    PoolClient,
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  input:
    unknown,
): Promise<
  NormalizedQuoteLine[]
> {
  if (
    !Array.isArray(
      input,
    ) ||
    input.length ===
      0 ||
    input.length >
      100
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Add between 1 and 100 quote lines.',
    );
  }

  const canUseCatalog =
    crossPermission(
      context,
      'invoicing.catalog.view',
      'invoicing.catalog.manage',
    );

  const lines:
    NormalizedQuoteLine[] =
      [];

  for (
    let index =
      0;
    index <
      input.length;
    index +=
      1
  ) {
    const raw =
      input[index];

    if (
      !raw ||
      typeof raw !==
        'object' ||
      Array.isArray(
        raw,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote line ' +
        (
          index +
          1
        ) +
        ' is invalid.',
      );
    }

    const item =
      raw as
        Record<
          string,
          unknown
        >;

    const catalogItemId =
      optionalUuid(
        item.catalogItemId,
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
      if (
        !canUseCatalog
      ) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Catalog access is required to use saved products or services on a quote.',
        );
      }

      const table =
        await client.query(
          `
            SELECT
              to_regclass(
                'public.invoicing_catalog_items'
              ) IS NOT NULL
                AS ready
          `,
        );

      if (
        table.rows[0]
          ?.ready !==
          true
      ) {
        throw new SalesError(
          'INVOICING_REQUIRED',
          'Install Invoicing before using its product catalog.',
        );
      }

      const result =
        await client.query(
          `
            SELECT
              item.id,
              item.name,
              item.sku,
              item.description,
              item.unit,
              item.unit_price,
              tax.name
                AS tax_name,
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
            WHERE item.id = $1
              AND item.company_id = $2
              AND item.is_active = TRUE
              AND item.deleted_at IS NULL
            LIMIT 1
          `,
          [
            catalogItemId,
            context.companyId,
          ],
        );

      if (
        result.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Choose a valid active quote item.',
        );
      }

      catalog =
        result.rows[0];
    }

    const description =
      cleanText(
        item.description ||
        catalog
          ?.description ||
        catalog
          ?.name,
        4000,
      );

    if (
      !description
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote line ' +
        (
          index +
          1
        ) +
        ' needs a description.',
      );
    }

    const quantity =
      numberInput(
        item.quantity ??
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
        item.unitPrice ??
        catalog
          ?.unit_price ??
        0,
        'Unit price',
      );

    const discountType =
      cleanText(
        item.discountType,
        20,
      ) ===
        'fixed'
        ? 'fixed' as const
        : 'percent' as const;

    const discountValue =
      numberInput(
        item.discountValue ??
        0,
        'Discount',
        {
          min:
            0,
          max:
            discountType ===
              'percent'
              ? 100
              : 1_000_000_000,
        },
      );

    const taxRate =
      numberInput(
        item.taxRate ??
        catalog
          ?.tax_rate ??
        0,
        'Tax rate',
        {
          min:
            0,
          max:
            100,
        },
      );

    const subtotal =
      money(
        quantity *
        unitPrice,
      );

    const discountAmount =
      money(
        discountType ===
          'percent'
          ? subtotal *
            (
              discountValue /
              100
            )
          : Math.min(
              subtotal,
              discountValue,
            ),
      );

    const taxable =
      money(
        subtotal -
        discountAmount,
      );

    const taxAmount =
      money(
        taxable *
        (
          taxRate /
          100
        ),
      );

    const lineTotal =
      money(
        taxable +
        taxAmount,
      );

    lines.push({
      catalogItemId,
      sortOrder:
        index,
      description,
      sku:
        nullableText(
          item.sku ||
          catalog
            ?.sku,
          180,
        ),
      unit:
        cleanText(
          item.unit ||
          catalog
            ?.unit ||
          'unit',
          60,
        ) ||
        'unit',
      quantity,
      unitPrice,
      discountType,
      discountValue,
      discountAmount,
      taxName:
        nullableText(
          item.taxName ||
          catalog
            ?.tax_name,
          180,
        ),
      taxRate,
      taxAmount,
      subtotal,
      lineTotal,
    });
  }

  return lines;
}


async function insertQuoteLines(
  client:
    PoolClient,
  companyId:
    string,
  quoteId:
    string,
  lines:
    NormalizedQuoteLine[],
) {
  for (
    const line
    of lines
  ) {
    await client.query(
      `
        INSERT INTO sales_quote_items (
          quote_id,
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
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17
        )
      `,
      [
        quoteId,
        companyId,
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
        line.taxName,
        line.taxRate,
        line.taxAmount,
        line.subtotal,
        line.lineTotal,
      ],
    );
  }
}


function totals(
  lines:
    NormalizedQuoteLine[],
  shipping:
    number,
) {
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

  const totalAmount =
    money(
      subtotal -
      discountTotal +
      taxTotal +
      shipping,
    );

  return {
    subtotal,
    discountTotal,
    taxTotal,
    totalAmount,
  };
}


export async function createSalesQuote(
  input:
    CreateSalesQuoteInput,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_CREATE,
    );

  await ensureSalesDefaults(
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

    const settingsResult =
      await client.query(
        `
          SELECT *
          FROM sales_settings
          WHERE company_id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
        ],
      );

    const settings =
      settingsResult.rows[0] ||
      {};

    const template =
      await resolveTemplate(
        client,
        context.companyId,
        input.templateId,
      );

    const customer =
      await resolveCustomerSnapshot(
        client,
        context,
        input,
      );

    const quoteDate =
      isoDate(
        input.quoteDate,
      );

    const validUntil =
      input.validUntil
        ? isoDate(
            input.validUntil,
          )
        : datePlusDays(
            quoteDate,
            Number(
              settings.default_validity_days ||
              14,
            ),
          );

    if (
      validUntil <
      quoteDate
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote expiry date cannot be before the quote date.',
      );
    }

    const lines =
      await normalizeQuoteLines(
        client,
        context,
        input.lines,
      );

    const shippingTotal =
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const calculated =
      totals(
        lines,
        shippingTotal,
      );

    const approvalRequired =
      settings.require_quote_approval ===
        true &&
      calculated.totalAmount >=
        money(
          settings.quote_approval_threshold,
        );

    const approvalStatus =
      approvalRequired
        ? 'draft'
        : 'not_required';

    const quoteNumber =
      await nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'quote',
      );

    const currency =
      cleanText(
        input.currency ||
        customer.currency ||
        settings.default_currency ||
        context.company
          .currentCompany.currency ||
        'KES',
        3,
      )
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO sales_quotes (
            company_id,
            billing_customer_id,
            template_id,
            quote_number,
            status,
            quote_date,
            valid_until,
            currency,
            reference,
            approval_status,
            customer_name,
            customer_email,
            customer_phone,
            customer_tax_id,
            billing_address,
            shipping_address,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            total_amount,
            notes,
            terms,
            internal_notes,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,
            'draft',
            $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,
            $24,$24
          )
          RETURNING
            id,
            quote_number,
            status
        `,
        [
          context.companyId,
          customer.billingCustomerId,
          template
            ?.id ||
          null,
          quoteNumber,
          quoteDate,
          validUntil,
          currency,
          nullableText(
            input.reference,
            255,
          ),
          approvalStatus,
          customer.customerName,
          customer.customerEmail,
          customer.customerPhone,
          customer.customerTaxId,
          customer.billingAddress,
          customer.shippingAddress,
          calculated.subtotal,
          calculated.discountTotal,
          calculated.taxTotal,
          shippingTotal,
          calculated.totalAmount,
          nullableText(
            input.notes ||
            template
              ?.notes ||
            settings.default_notes,
            6000,
          ),
          nullableText(
            input.terms ||
            template
              ?.terms ||
            settings.terms_and_conditions,
            12000,
          ),
          nullableText(
            input.internalNotes,
            6000,
          ),
          context.userId,
        ],
      );

    const quoteId =
      String(
        result.rows[0].id,
      );

    await insertQuoteLines(
      client,
      context.companyId,
      quoteId,
      lines,
    );

    await client.query(
      `
        INSERT INTO sales_quote_status_history (
          quote_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,
          'draft',
          'Quote created',
          $3
        )
      `,
      [
        quoteId,
        context.companyId,
        context.userId,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.created',
        content:
          'Quote ' +
          quoteNumber +
          ' created.',
        metadata: {
          totalAmount:
            calculated.totalAmount,
          currency,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      quoteNumber,
      status:
        'draft',
      totalAmount:
        calculated.totalAmount,
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


export async function updateSalesQuoteDraft(
  input:
    CreateSalesQuoteInput & {
      quoteId?: unknown;
    },
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_EDIT,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
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
            quote_number,
            status,
            approval_status
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    if (
      String(
        existing.rows[0].status,
      ) !==
      'draft'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Only draft quotes can be edited. Duplicate the quote when renegotiation is required after sending.',
      );
    }

    if (
      [
        'pending',
        'approved',
      ].includes(
        String(
          existing.rows[0]
            .approval_status ||
          'not_required',
        ),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote is in approval. Withdraw or reject approval before editing the commercial terms.',
      );
    }

    const settings =
      (
        await client.query(
          `
            SELECT *
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const template =
      await resolveTemplate(
        client,
        context.companyId,
        input.templateId,
      );

    const customer =
      await resolveCustomerSnapshot(
        client,
        context,
        input,
      );

    const quoteDate =
      isoDate(
        input.quoteDate,
      );

    const validUntil =
      input.validUntil
        ? isoDate(
            input.validUntil,
          )
        : datePlusDays(
            quoteDate,
            Number(
              settings.default_validity_days ||
              14,
            ),
          );

    if (
      validUntil <
      quoteDate
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote expiry date cannot be before the quote date.',
      );
    }

    const lines =
      await normalizeQuoteLines(
        client,
        context,
        input.lines,
      );

    const shippingTotal =
      numberInput(
        input.shippingTotal ??
        0,
        'Shipping',
      );

    const calculated =
      totals(
        lines,
        shippingTotal,
      );

    const approvalRequired =
      settings.require_quote_approval ===
        true &&
      calculated.totalAmount >=
        money(
          settings.quote_approval_threshold,
        );

    const approvalStatus =
      approvalRequired
        ? 'draft'
        : 'not_required';

    const currency =
      cleanText(
        input.currency ||
        customer.currency ||
        settings.default_currency ||
        'KES',
        3,
      )
        .toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Currency must be a three-letter code.',
      );
    }

    await client.query(
      `
        UPDATE sales_quotes
        SET
          billing_customer_id = $3,
          template_id = $4,
          quote_date = $5,
          valid_until = $6,
          currency = $7,
          reference = $8,
          approval_status = $9,
          approval_requested_at = NULL,
          approval_requested_by = NULL,
          approved_at = NULL,
          approved_by = NULL,
          approval_rejected_at = NULL,
          approval_rejected_by = NULL,
          approval_rejection_reason = NULL,
          customer_name = $10,
          customer_email = $11,
          customer_phone = $12,
          customer_tax_id = $13,
          billing_address = $14,
          shipping_address = $15,
          subtotal = $16,
          discount_total = $17,
          tax_total = $18,
          shipping_total = $19,
          total_amount = $20,
          notes = $21,
          terms = $22,
          internal_notes = $23,
          updated_by = $24,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        customer.billingCustomerId,
        template
          ?.id ||
        null,
        quoteDate,
        validUntil,
        currency,
        nullableText(
          input.reference,
          255,
        ),
        approvalStatus,
        customer.customerName,
        customer.customerEmail,
        customer.customerPhone,
        customer.customerTaxId,
        customer.billingAddress,
        customer.shippingAddress,
        calculated.subtotal,
        calculated.discountTotal,
        calculated.taxTotal,
        shippingTotal,
        calculated.totalAmount,
        nullableText(
          input.notes ||
          template
            ?.notes ||
          settings.default_notes,
          6000,
        ),
        nullableText(
          input.terms ||
          template
            ?.terms ||
          settings.terms_and_conditions,
          12000,
        ),
        nullableText(
          input.internalNotes,
          6000,
        ),
        context.userId,
      ],
    );

    await client.query(
      `
        DELETE FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

    await insertQuoteLines(
      client,
      context.companyId,
      quoteId,
      lines,
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.updated',
        content:
          'Quote ' +
          String(
            existing.rows[0]
              .quote_number,
          ) +
          ' updated.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      quoteNumber:
        String(
          existing.rows[0]
            .quote_number,
        ),
      status:
        'draft',
      totalAmount:
        calculated.totalAmount,
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


export async function duplicateSalesQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_CREATE,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const quote =
    await context.pool.query(
      `
        SELECT *
        FROM sales_quotes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

  if (
    quote.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
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
          tax_name_snapshot,
          tax_rate
        FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

  const row =
    quote.rows[0];

  return createSalesQuote({
    billingCustomerId:
      row.billing_customer_id,
    templateId:
      row.template_id,
    quoteDate:
      isoDate(
        null,
      ),
    validUntil:
      undefined,
    currency:
      row.currency,
    reference:
      row.reference,
    customerName:
      row.customer_name,
    customerEmail:
      row.customer_email,
    customerPhone:
      row.customer_phone,
    customerTaxId:
      row.customer_tax_id,
    billingAddress:
      row.billing_address,
    shippingAddress:
      row.shipping_address,
    shippingTotal:
      row.shipping_total,
    notes:
      row.notes,
    terms:
      row.terms,
    internalNotes:
      row.internal_notes,
    lines:
      lines.rows.map(
        line => ({
          catalogItemId:
            line.catalog_item_id ||
            undefined,
          description:
            line.description,
          sku:
            line.sku_snapshot,
          unit:
            line.unit,
          quantity:
            Number(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          discountType:
            line.discount_type,
          discountValue:
            money(
              line.discount_value,
            ),
          taxName:
            line.tax_name_snapshot,
          taxRate:
            Number(
              line.tax_rate,
            ),
        }),
      ),
  });
}


export async function changeSalesQuoteStatus(
  input:
    Record<string, unknown>,
) {
  const nextStatus =
    cleanText(
      input.status,
      30,
    );

  const permission =
    [
      'accepted',
      'rejected',
    ].includes(
      nextStatus,
    )
      ? SALES_PERMISSIONS
          .QUOTE_APPROVE
      : SALES_PERMISSIONS
          .QUOTE_CANCEL;

  const context =
    await requireSalesContext(
      permission,
    );

  if (
    ![
      'accepted',
      'rejected',
      'cancelled',
    ].includes(
      nextStatus,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid quote status action.',
    );
  }

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    (
      nextStatus ===
        'rejected' ||
      nextStatus ===
        'cancelled'
    ) &&
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A reason is required for rejection or cancellation.',
    );
  }

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
            quote_number,
            status,
            valid_until,
            sales_order_id
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      existing.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const current =
      String(
        existing.rows[0].status,
      );

    const expired =
      existing.rows[0]
        .valid_until &&
      String(
        existing.rows[0]
          .valid_until,
      ) <
        isoDate(
          null,
        );

    if (
      expired &&
      [
        'sent',
        'viewed',
      ].includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote has expired. Duplicate it to issue a new offer.',
      );
    }

    const allowed =
      nextStatus ===
        'accepted'
        ? [
            'draft',
            'sent',
            'viewed',
          ]
        : nextStatus ===
            'rejected'
          ? [
              'sent',
              'viewed',
            ]
          : [
              'draft',
              'sent',
              'viewed',
              'accepted',
            ];

    if (
      !allowed.includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote cannot be changed from ' +
        current +
        ' to ' +
        nextStatus +
        '.',
      );
    }

    if (
      existing.rows[0]
        .sales_order_id
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote is already linked to a sales order and cannot be closed directly.',
      );
    }

    await client.query(
      `
        UPDATE sales_quotes
        SET
          status = $3::varchar(30),
          accepted_at =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN NOW()
              ELSE accepted_at
            END,
          rejected_at =
            CASE
              WHEN $3::varchar(30) =
                   'rejected'
              THEN NOW()
              ELSE rejected_at
            END,
          public_enabled =
            CASE
              WHEN $3::varchar(30) IN (
                'rejected',
                'cancelled'
              )
              THEN FALSE
              ELSE public_enabled
            END,
          updated_by = $4::uuid,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        nextStatus,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_quote_status_history (
          quote_id,
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
        quoteId,
        context.companyId,
        current,
        nextStatus,
        reason,
        context.userId,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.' +
          nextStatus,
        content:
          'Quote ' +
          String(
            existing.rows[0]
              .quote_number,
          ) +
          ' changed to ' +
          nextStatus +
          '.',
        metadata: {
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      status:
        nextStatus,
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


export async function requestSalesQuoteApproval(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_EDIT,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const quote =
      await client.query(
        `
          SELECT
            quote_number,
            status,
            approval_status,
            total_amount
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      quote.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const row =
      quote.rows[0];

    if (
      String(
        row.status,
      ) !==
        'draft'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Only draft quotations can enter internal approval.',
      );
    }

    const current =
      String(
        row.approval_status ||
        'not_required',
      );

    if (
      current ===
        'not_required'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          quoteId,
        approvalStatus:
          'not_required',
      };
    }

    if (
      current ===
        'pending'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          quoteId,
        approvalStatus:
          'pending',
      };
    }

    if (
      ![
        'draft',
        'rejected',
      ].includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quotation cannot be submitted for approval from its current approval state.',
      );
    }

    await client.query(
      `
        UPDATE sales_quotes
        SET
          approval_status = 'pending',
          approval_requested_at = NOW(),
          approval_requested_by = $3,
          approval_rejected_at = NULL,
          approval_rejected_by = NULL,
          approval_rejection_reason = NULL,
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_quote_approval_history (
          quote_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,
          'pending',
          'Submitted for internal sales approval',
          $4
        )
      `,
      [
        quoteId,
        context.companyId,
        current,
        context.userId,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.approval_requested',
        content:
          'Quotation ' +
          String(
            row.quote_number,
          ) +
          ' submitted for approval.',
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      approvalStatus:
        'pending',
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


export async function reviewSalesQuoteApproval(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_INTERNAL_APPROVE,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const decision =
    cleanText(
      input.decision,
      20,
    )
      .toLowerCase();

  if (
    decision !==
      'approve' &&
    decision !==
      'reject'
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose approve or reject.',
    );
  }

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    decision ===
      'reject' &&
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A reason is required when rejecting a quotation approval request.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const quote =
      await client.query(
        `
          SELECT
            quote_number,
            status,
            approval_status
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      quote.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const row =
      quote.rows[0];

    if (
      String(
        row.status,
      ) !==
        'draft' ||
      String(
        row.approval_status,
      ) !==
        'pending'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Only pending draft quotation approvals can be reviewed.',
      );
    }

    const next =
      decision ===
        'approve'
        ? 'approved'
        : 'rejected';

    await client.query(
      `
        UPDATE sales_quotes
        SET
          approval_status = $3,
          approved_at =
            CASE
              WHEN $3 = 'approved'
              THEN NOW()
              ELSE approved_at
            END,
          approved_by =
            CASE
              WHEN $3 = 'approved'
              THEN $4::uuid
              ELSE approved_by
            END,
          approval_rejected_at =
            CASE
              WHEN $3 = 'rejected'
              THEN NOW()
              ELSE NULL
            END,
          approval_rejected_by =
            CASE
              WHEN $3 = 'rejected'
              THEN $4::uuid
              ELSE NULL
            END,
          approval_rejection_reason =
            CASE
              WHEN $3 = 'rejected'
              THEN $5
              ELSE NULL
            END,
          updated_by = $4::uuid,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        next,
        context.userId,
        reason,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_quote_approval_history (
          quote_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,
          'pending',
          $3,$4,$5
        )
      `,
      [
        quoteId,
        context.companyId,
        next,
        reason,
        context.userId,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.approval_' +
          next,
        content:
          'Quotation ' +
          String(
            row.quote_number,
          ) +
          ' ' +
          next +
          ' internally.',
        metadata: {
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      approvalStatus:
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


export async function sendSalesQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_SEND,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  return deliverSalesQuote({
    pool:
      context.pool,
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    companyName:
      context.company
        .currentCompany.name,
    userId:
      context.userId,
    quoteId,
    channels:
      normalizeSalesQuoteDeliveryChannels(
        input.channels,
      ),
  });
}


export async function createSalesOrderFromQuote(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_CONVERT,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  await ensureSalesDefaults(
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

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-from-quote:' +
        quoteId,
      ],
    );

    const quote =
      await client.query(
        `
          SELECT *
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          quoteId,
          context.companyId,
        ],
      );

    if (
      quote.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const row =
      quote.rows[0];

    if (
      row.sales_order_id
    ) {
      const existing =
        await client.query(
          `
            SELECT
              id,
              order_number,
              status,
              latest_invoice_id
            FROM sales_orders_v2
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            row.sales_order_id,
            context.companyId,
          ],
        );

      if (
        existing.rows.length ===
          1
      ) {
        await client.query(
          'COMMIT',
        );

        return {
          id:
            String(
              existing.rows[0].id,
            ),
          orderNumber:
            String(
              existing.rows[0]
                .order_number,
            ),
          status:
            String(
              existing.rows[0].status,
            ),
          invoiceId:
            existing.rows[0]
              .latest_invoice_id
              ? String(
                  existing.rows[0]
                    .latest_invoice_id,
                )
              : null,
        };
      }
    }

    const currentStatus =
      String(
        row.status,
      );

    if (
      ![
        'accepted',
        'converted',
      ].includes(
        currentStatus,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Accept the quote before creating a sales order.',
      );
    }

    const orderNumber =
      await nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'order',
      );

    const order =
      await client.query(
        `
          INSERT INTO sales_orders_v2 (
            company_id,
            quote_id,
            order_number,
            status,
            order_date,
            currency,
            reference,
            customer_name,
            customer_email,
            customer_phone,
            customer_tax_id,
            billing_address,
            shipping_address,
            subtotal,
            discount_total,
            tax_total,
            shipping_total,
            total_amount,
            notes,
            terms,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,
            'confirmed',
            CURRENT_DATE,
            $4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,
            $19,$19
          )
          RETURNING
            id,
            order_number,
            status
        `,
        [
          context.companyId,
          quoteId,
          orderNumber,
          row.currency,
          row.reference,
          row.customer_name,
          row.customer_email,
          row.customer_phone,
          row.customer_tax_id,
          row.billing_address,
          row.shipping_address,
          row.subtotal,
          row.discount_total,
          row.tax_total,
          row.shipping_total,
          row.total_amount,
          row.notes,
          row.terms,
          context.userId,
        ],
      );

    const orderId =
      String(
        order.rows[0].id,
      );

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,NULL,
          'confirmed',
          'Created from accepted quote',
          $3
        )
      `,
      [
        orderId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_order_items_v2 (
          sales_order_id,
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
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        )
        SELECT
          $3,
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
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quoteId,
        context.companyId,
        orderId,
      ],
    );

    await client.query(
      `
        UPDATE sales_quotes
        SET
          sales_order_id = $3,
          status = 'converted',
          converted_at =
            COALESCE(
              converted_at,
              NOW()
            ),
          public_enabled =
            FALSE,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        orderId,
        context.userId,
      ],
    );

    if (
      currentStatus !==
        'converted'
    ) {
      await client.query(
        `
          INSERT INTO sales_quote_status_history (
            quote_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1,$2,$3,
            'converted',
            'Converted to sales order',
            $4
          )
        `,
        [
          quoteId,
          context.companyId,
          currentStatus,
          context.userId,
        ],
      );
    }

    await recordSalesActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        quoteId,
        type:
          'sales.quote.converted',
        content:
          'Quote ' +
          String(
            row.quote_number,
          ) +
          ' converted to sales order ' +
          orderNumber +
          '.',
        metadata: {
          orderId,
          orderNumber,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        orderId,
      orderNumber,
      status:
        'confirmed',
      invoiceId:
        null,
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


export async function convertSalesQuoteToInvoice(
  input:
    Record<string, unknown>,
) {
  const quoteId =
    requireUuid(
      input.quoteId,
      'Quote',
    );

  const order =
    await createSalesOrderFromQuote({
      quoteId,
    });

  const invoice =
    await createSalesOrderInvoice({
      orderId:
        order.id,
      idempotencyKey:
        cleanText(
          input.idempotencyKey,
          120,
        ) ||
        (
          'quote-' +
          quoteId
        ),
    });

  return {
    orderId:
      order.id,
    orderNumber:
      order.orderNumber,
    invoiceId:
      invoice.invoiceId,
    reused:
      invoice.reused,
  };
}


export async function updateSalesOrderFulfillment(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .ORDER_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const updates =
    Array.isArray(
      input.lines,
    )
      ? input.lines
      : [];

  if (
    updates.length ===
      0 ||
    updates.length >
      200
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose at least one sales-order line to update.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const order =
      await client.query(
        `
          SELECT
            order_number,
            status,
            fulfillment_status,
            invoice_status
          FROM sales_orders_v2
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const currentStatus =
      String(
        order.rows[0].status,
      );

    const currentFulfillment =
      String(
        order.rows[0]
          .fulfillment_status ||
        'not_started',
      );

    const currentInvoiceStatus =
      String(
        order.rows[0]
          .invoice_status ||
        'not_invoiced',
      );

    if (
      [
        'cancelled',
        'closed',
      ].includes(
        currentStatus,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This sales order can no longer change fulfillment quantities.',
      );
    }

    for (
      const raw
      of updates
    ) {
      if (
        !raw ||
        typeof raw !==
          'object' ||
        Array.isArray(
          raw,
        )
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'A fulfillment line is invalid.',
        );
      }

      const row =
        raw as
          Record<
            string,
            unknown
          >;

      const lineId =
        requireUuid(
          row.lineId,
          'Sales order line',
        );

      const deliveredQuantity =
        numberInput(
          row.deliveredQuantity,
          'Delivered quantity',
          {
            min:
              0,
            max:
              1_000_000,
          },
        );

      const changed =
        await client.query(
          `
            UPDATE sales_order_items_v2
            SET
              delivered_quantity = $4
            WHERE id = $1
              AND sales_order_id = $2
              AND company_id = $3
              AND $4 <= quantity
            RETURNING id
          `,
          [
            lineId,
            orderId,
            context.companyId,
            deliveredQuantity,
          ],
        );

      if (
        changed.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Delivered quantity cannot exceed the ordered quantity.',
        );
      }
    }

    const totals =
      (
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(quantity),
                0
              ) AS ordered,
              COALESCE(
                SUM(delivered_quantity),
                0
              ) AS delivered
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const ordered =
      Number(
        totals.ordered ||
        0,
      );

    const delivered =
      Number(
        totals.delivered ||
        0,
      );

    const nextFulfillment =
      delivered <=
        0
        ? 'not_started'
        : delivered >=
            ordered
          ? 'fulfilled'
          : 'partial';

    const nextStatus =
      nextFulfillment ===
        'fulfilled' &&
      currentInvoiceStatus ===
        'invoiced'
        ? 'closed'
        : 'confirmed';

    if (
      currentFulfillment !==
        nextFulfillment
    ) {
      await client.query(
        `
          INSERT INTO sales_order_status_history (
            sales_order_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1,$2,$3,$4,
            'Fulfillment quantities updated',
            $5
          )
        `,
        [
          orderId,
          context.companyId,
          'fulfillment:' +
          currentFulfillment,
          'fulfillment:' +
          nextFulfillment,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          status = $3,
          fulfillment_status = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        nextStatus,
        nextFulfillment,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        orderId,
      status:
        nextStatus,
      fulfillmentStatus:
        nextFulfillment,
      invoiceStatus:
        currentInvoiceStatus,
      orderedQuantity:
        ordered,
      deliveredQuantity:
        delivered,
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


export async function cancelSalesOrder(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .ORDER_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const reason =
    nullableText(
      input.reason,
      2000,
    );

  if (
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A reason is required to cancel a sales order.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const order =
      await client.query(
        `
          SELECT
            o.order_number,
            o.status,
            COALESCE(
              (
                SELECT SUM(
                  oi.invoiced_quantity
                )
                FROM sales_order_items_v2 oi
                WHERE oi.sales_order_id =
                      o.id
                  AND oi.company_id =
                      o.company_id
              ),
              0
            ) AS invoiced_quantity
          FROM sales_orders_v2 o
          WHERE o.id = $1
            AND o.company_id = $2
            AND o.deleted_at IS NULL
          FOR UPDATE
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const current =
      String(
        order.rows[0].status,
      );

    if (
      current ===
        'cancelled'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          orderId,
        status:
          'cancelled',
      };
    }

    if (
      Number(
        order.rows[0]
          .invoiced_quantity ||
        0,
      ) >
        0
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This order already has invoiced quantities. Correct the related invoice before cancelling the order.',
      );
    }

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          status = 'cancelled',
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        context.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,
          'cancelled',
          $4,$5
        )
      `,
      [
        orderId,
        context.companyId,
        current,
        reason,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        orderId,
      status:
        'cancelled',
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


export async function createSalesOrderInvoice(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .ORDER_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const idempotencyKey =
    cleanText(
      input.idempotencyKey,
      120,
    ) ||
    crypto
      .randomUUID();

  const client =
    await context.pool.connect();

  const lockKey =
    'sales-order-invoice:' +
    orderId;

  try {
    await client.query(
      `
        SELECT pg_advisory_lock(
          hashtext($1)
        )
      `,
      [
        lockKey,
      ],
    );

    const existingBatch =
      await client.query(
        `
          SELECT
            id,
            invoice_id,
            source_reference,
            status,
            requested_lines
          FROM sales_order_invoice_batches
          WHERE company_id = $1
            AND sales_order_id = $2
            AND idempotency_key = $3
          LIMIT 1
        `,
        [
          context.companyId,
          orderId,
          idempotencyKey,
        ],
      );

    if (
      existingBatch.rows.length >
        0 &&
      existingBatch.rows[0]
        .invoice_id
    ) {
      return {
        orderId,
        invoiceId:
          String(
            existingBatch.rows[0]
              .invoice_id,
          ),
        reused:
          true,
      };
    }

    const settings =
      (
        await client.query(
          `
            SELECT
              allow_partial_invoicing,
              require_billing_customer_for_invoice,
              invoice_policy
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const order =
      await client.query(
        `
          SELECT
            o.*,
            q.billing_customer_id,
            q.quote_number
          FROM sales_orders_v2 o
          LEFT JOIN sales_quotes q
            ON q.id =
               o.quote_id
           AND q.company_id =
               o.company_id
          WHERE o.id = $1
            AND o.company_id = $2
            AND o.deleted_at IS NULL
          LIMIT 1
        `,
        [
          orderId,
          context.companyId,
        ],
      );

    if (
      order.rows.length !==
        1
    ) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'Sales order was not found.',
      );
    }

    const orderRow =
      order.rows[0];

    if (
      orderRow.status ===
        'cancelled'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A cancelled sales order cannot be invoiced.',
      );
    }

    let billingCustomerId =
      orderRow
        .billing_customer_id
        ? String(
            orderRow
              .billing_customer_id,
          )
        : null;

    if (
      !billingCustomerId
    ) {
      try {
        const createdCustomer =
          await createInvoicingCustomer({
            name:
              orderRow.customer_name,
            email:
              orderRow.customer_email,
            phone:
              orderRow.customer_phone,
            taxId:
              orderRow.customer_tax_id,
            billingAddress:
              orderRow.billing_address,
            shippingAddress:
              orderRow.shipping_address,
            currency:
              orderRow.currency,
            notes:
              'Created from SaMi Sales order ' +
              String(
                orderRow.order_number,
              ) +
              '.',
          });

        billingCustomerId =
          createdCustomer.id;
      } catch (
        error
      ) {
        const existingId =
          (
            error &&
            typeof error ===
              'object' &&
            'details' in error &&
            error.details &&
            typeof error.details ===
              'object' &&
            'existingCustomerId' in
              error.details
          )
            ? String(
                (
                  error.details as
                    Record<
                      string,
                      unknown
                    >
                )
                  .existingCustomerId ||
                '',
              )
            : '';

        if (
          existingId
        ) {
          billingCustomerId =
            existingId;
        } else {
          throw new SalesError(
            'BILLING_CUSTOMER_REQUIRED',
            'This sales order needs a billing customer before it can be invoiced. Create or link the customer in Invoicing, or grant customer-management access.',
          );
        }
      }

      if (
        billingCustomerId &&
        orderRow.quote_id
      ) {
        await context.pool.query(
          `
            UPDATE sales_quotes
            SET
              billing_customer_id = $3,
              updated_by = $4,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
          `,
          [
            orderRow.quote_id,
            context.companyId,
            billingCustomerId,
            context.userId,
          ],
        );
      }
    }

    const lineRows =
      (
        await client.query(
          `
            SELECT
              id,
              description,
              sku_snapshot,
              unit,
              quantity,
              delivered_quantity,
              invoiced_quantity,
              unit_price,
              discount_type,
              discount_value,
              tax_rate
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
            ORDER BY
              sort_order,
              id
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows;

    const requested =
      Array.isArray(
        input.lines,
      )
        ? input.lines
        : [];

    const requestedMap =
      new Map<
        string,
        number
      >();

    for (
      const raw
      of requested
    ) {
      if (
        !raw ||
        typeof raw !==
          'object' ||
        Array.isArray(
          raw,
        )
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'An invoice line selection is invalid.',
        );
      }

      const item =
        raw as
          Record<
            string,
            unknown
          >;

      requestedMap.set(
        requireUuid(
          item.lineId,
          'Sales order line',
        ),
        numberInput(
          item.quantity,
          'Invoice quantity',
          {
            min:
              0.0001,
            max:
              1_000_000,
          },
        ),
      );
    }

    const invoicePolicy =
      settings.invoice_policy ===
        'delivered'
        ? 'delivered'
        : 'ordered';

    const selected =
      lineRows
        .map(
          line => {
            const ordered =
              Number(
                line.quantity,
              );

            const delivered =
              Number(
                line.delivered_quantity ||
                0,
              );

            const already =
              Number(
                line.invoiced_quantity ||
                0,
              );

            const eligible =
              invoicePolicy ===
                'delivered'
                ? delivered
                : ordered;

            const remaining =
              Math.max(
                0,
                eligible -
                already,
              );

            const requestedQuantity =
              requestedMap.size >
                0
                ? (
                    requestedMap.get(
                      String(
                        line.id,
                      ),
                    ) ||
                    0
                  )
                : remaining;

            if (
              requestedQuantity >
              remaining +
                0.000001
            ) {
              throw new SalesError(
                'INVALID_INPUT',
                'Invoice quantity exceeds the remaining invoiceable quantity for ' +
                String(
                  line.description,
                ) +
                '.',
              );
            }

            return {
              line,
              quantity:
                requestedQuantity,
              remaining,
            };
          },
        )
        .filter(
          item =>
            item.quantity >
            0,
        );

    if (
      selected.length ===
        0
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'There are no invoiceable quantities remaining on this sales order.',
      );
    }

    if (
      settings.allow_partial_invoicing ===
        false &&
      selected.some(
        item =>
          Math.abs(
            item.quantity -
            item.remaining,
          ) >
            0.000001,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Partial invoicing is disabled in Sales settings.',
      );
    }

    let batchId:
      string;

    let sourceReference:
      string;

    if (
      existingBatch.rows.length >
        0
    ) {
      batchId =
        String(
          existingBatch.rows[0].id,
        );

      sourceReference =
        String(
          existingBatch.rows[0]
            .source_reference,
        );
    } else {
      const batch =
        await client.query(
          `
            INSERT INTO sales_order_invoice_batches (
              company_id,
              sales_order_id,
              idempotency_key,
              source_reference,
              requested_lines,
              created_by
            )
            VALUES (
              $1,$2,$3,
              '',
              $4::jsonb,
              $5
            )
            RETURNING id
          `,
          [
            context.companyId,
            orderId,
            idempotencyKey,
            JSON.stringify(
              selected.map(
                item => ({
                  lineId:
                    String(
                      item.line.id,
                    ),
                  quantity:
                    item.quantity,
                }),
              ),
            ),
            context.userId,
          ],
        );

      batchId =
        String(
          batch.rows[0].id,
        );

      sourceReference =
        'Sales order ' +
        String(
          orderRow.order_number,
        ) +
        ' / ' +
        batchId;

      await client.query(
        `
          UPDATE sales_order_invoice_batches
          SET
            source_reference = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          batchId,
          sourceReference,
        ],
      );
    }

    const recovered =
      await context.pool.query(
        `
          SELECT id
          FROM invoicing_invoices
          WHERE company_id = $1
            AND reference = $2
            AND deleted_at IS NULL
          ORDER BY
            created_at DESC
          LIMIT 1
        `,
        [
          context.companyId,
          sourceReference,
        ],
      )
        .catch(
          () => ({
            rows: [],
          }),
        );

    const shippingAmount =
      orderRow.shipping_invoiced ===
        true
        ? 0
        : money(
            orderRow.shipping_total,
          );

    let invoiceId:
      string;

    if (
      recovered.rows.length >
        0
    ) {
      invoiceId =
        String(
          recovered.rows[0].id,
        );
    } else {
      const invoice =
        await createInvoice({
          customerId:
            String(
              billingCustomerId,
            ),
          currency:
            orderRow.currency,
          reference:
            sourceReference,
          notes:
            orderRow.notes,
          terms:
            orderRow.terms,
          shippingTotal:
            shippingAmount,
          confirm:
            false,
          lines:
            selected.map(
              item => ({
                description:
                  String(
                    item.line.description,
                  ),
                sku:
                  item.line
                    .sku_snapshot ||
                  undefined,
                unit:
                  String(
                    item.line.unit ||
                    'unit',
                  ),
                quantity:
                  item.quantity,
                unitPrice:
                  money(
                    item.line.unit_price,
                  ),
                discountType:
                  item.line
                    .discount_type ===
                    'fixed'
                    ? 'fixed'
                    : 'percent',
                discountValue:
                  item.line
                    .discount_type ===
                    'fixed'
                    ? money(
                        Number(
                          item.line
                            .discount_value ||
                          0,
                        ) *
                        (
                          item.quantity /
                          Number(
                            item.line
                              .quantity,
                          )
                        ),
                      )
                    : money(
                        item.line
                          .discount_value,
                      ),
                taxRate:
                  Number(
                    item.line
                      .tax_rate,
                  ),
              }),
            ),
        });

      invoiceId =
        invoice.id;
    }

    await client.query(
      'BEGIN',
    );

    for (
      const item
      of selected
    ) {
      await client.query(
        `
          UPDATE sales_order_items_v2
          SET
            invoiced_quantity =
              invoiced_quantity +
              $4
          WHERE id = $1
            AND sales_order_id = $2
            AND company_id = $3
            AND invoiced_quantity +
                $4 <=
                quantity
        `,
        [
          item.line.id,
          orderId,
          context.companyId,
          item.quantity,
        ],
      );
    }

    const totals =
      (
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(quantity),
                0
              ) AS ordered,
              COALESCE(
                SUM(invoiced_quantity),
                0
              ) AS invoiced
            FROM sales_order_items_v2
            WHERE sales_order_id = $1
              AND company_id = $2
          `,
          [
            orderId,
            context.companyId,
          ],
        )
      ).rows[0] ||
      {};

    const allInvoiced =
      Number(
        totals.invoiced ||
        0,
      ) >=
      Number(
        totals.ordered ||
        0,
      ) -
        0.000001;

    const nextInvoiceStatus =
      allInvoiced
        ? 'invoiced'
        : 'partial';

    const nextStatus =
      nextInvoiceStatus ===
        'invoiced' &&
      String(
        orderRow
          .fulfillment_status ||
        'not_started',
      ) ===
        'fulfilled'
        ? 'closed'
        : 'confirmed';

    await client.query(
      `
        UPDATE sales_order_invoice_batches
        SET
          invoice_id = $2,
          status = 'created',
          error_code = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        batchId,
        invoiceId,
      ],
    );

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          latest_invoice_id = $3,
          status = $4,
          invoice_status = $5,
          shipping_invoiced =
            CASE
              WHEN $7::numeric >
                   0
              THEN TRUE
              ELSE shipping_invoiced
            END,
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        invoiceId,
        nextStatus,
        nextInvoiceStatus,
        context.userId,
        shippingAmount,
      ],
    );

    if (
      orderRow.quote_id
    ) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            latest_invoice_id = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          orderRow.quote_id,
          context.companyId,
          invoiceId,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        INSERT INTO sales_order_status_history (
          sales_order_id,
          company_id,
          from_status,
          to_status,
          reason,
          changed_by
        )
        VALUES (
          $1,$2,$3,$4,
          'Invoice created from sales order',
          $5
        )
      `,
      [
        orderId,
        context.companyId,
        'invoice:' +
        String(
          orderRow.invoice_status ||
          'not_invoiced',
        ),
        'invoice:' +
        nextInvoiceStatus,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      orderId,
      invoiceId,
      batchId,
      status:
        nextStatus,
      invoiceStatus:
        nextInvoiceStatus,
      reused:
        recovered.rows.length >
        0,
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
    try {
      await client.query(
        `
          SELECT pg_advisory_unlock(
            hashtext($1)
          )
        `,
        [
          lockKey,
        ],
      );
    } catch {}

    client.release();
  }
}


export async function updateSalesSettings(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  await ensureSalesDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const defaultCurrency =
    cleanText(
      input.defaultCurrency ||
      context.company
        .currentCompany.currency ||
      'KES',
      3,
    )
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      defaultCurrency,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Currency must be a three-letter code.',
    );
  }

  const defaultValidityDays =
    numberInput(
      input.defaultValidityDays ??
      14,
      'Default validity days',
      {
        min:
          1,
        max:
          365,
      },
    );

  const result =
    await context.pool.query(
      `
        UPDATE sales_settings
        SET
          default_currency = $2,
          default_validity_days = $3,
          terms_and_conditions = $4,
          default_notes = $5,
          email_message = $6,
          primary_color = $7,
          secondary_color = $8,
          footer_text = $9,
          allow_online_acceptance = $10,
          allow_online_rejection = $11,
          allow_partial_invoicing = $12,
          require_billing_customer_for_invoice = $13,
          invoice_policy = $14,
          lock_confirmed_orders = $15,
          require_quote_approval = $16,
          quote_approval_threshold = $17,
          updated_by = $18,
          updated_at = NOW()
        WHERE company_id = $1
        RETURNING company_id
      `,
      [
        context.companyId,
        defaultCurrency,
        Math.floor(
          defaultValidityDays,
        ),
        nullableText(
          input.termsAndConditions,
          12000,
        ),
        nullableText(
          input.defaultNotes,
          6000,
        ),
        nullableText(
          input.emailMessage,
          6000,
        ),
        cleanText(
          input.primaryColor,
          20,
        ) ||
        '#164a9f',
        cleanText(
          input.secondaryColor,
          20,
        ) ||
        '#0f172a',
        nullableText(
          input.footerText,
          1000,
        ),
        input.allowOnlineAcceptance !==
          false,
        input.allowOnlineRejection !==
          false,
        input.allowPartialInvoicing !==
          false,
        input.requireBillingCustomerForInvoice !==
          false,
        cleanText(
          input.invoicePolicy,
          30,
        ) ===
          'delivered'
          ? 'delivered'
          : 'ordered',
        input.lockConfirmedOrders !==
          false,
        input.requireQuoteApproval ===
          true,
        numberInput(
          input.quoteApprovalThreshold ??
          0,
          'Quote approval threshold',
          {
            min:
              0,
            max:
              1_000_000_000_000,
          },
        ),
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Sales settings could not be updated.',
    );
  }

  return {
    updated:
      true,
  };
}


export async function saveSalesQuoteTemplate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const name =
    cleanText(
      input.name,
      180,
    );

  if (
    !name
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Template name is required.',
    );
  }

  const templateId =
    optionalUuid(
      input.templateId,
    );

  const isDefault =
    input.isDefault ===
      true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      isDefault
    ) {
      await client.query(
        `
          UPDATE sales_quote_templates
          SET
            is_default = FALSE,
            updated_by = $2,
            updated_at = NOW()
          WHERE company_id = $1
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    const result =
      templateId
        ? await client.query(
            `
              UPDATE sales_quote_templates
              SET
                name = $3,
                is_default = $4,
                notes = $5,
                terms = $6,
                footer_text = $7,
                primary_color = $8,
                secondary_color = $9,
                updated_by = $10,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id, name
            `,
            [
              templateId,
              context.companyId,
              name,
              isDefault,
              nullableText(
                input.notes,
                6000,
              ),
              nullableText(
                input.terms,
                12000,
              ),
              nullableText(
                input.footerText,
                1000,
              ),
              cleanText(
                input.primaryColor,
                20,
              ) ||
              '#164a9f',
              cleanText(
                input.secondaryColor,
                20,
              ) ||
              '#0f172a',
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_quote_templates (
                company_id,
                name,
                is_default,
                notes,
                terms,
                footer_text,
                primary_color,
                secondary_color,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
              )
              RETURNING id, name
            `,
            [
              context.companyId,
              name,
              isDefault,
              nullableText(
                input.notes,
                6000,
              ),
              nullableText(
                input.terms,
                12000,
              ),
              nullableText(
                input.footerText,
                1000,
              ),
              cleanText(
                input.primaryColor,
                20,
              ) ||
              '#164a9f',
              cleanText(
                input.secondaryColor,
                20,
              ) ||
              '#0f172a',
              context.userId,
            ],
          );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Quote template was not found.',
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
