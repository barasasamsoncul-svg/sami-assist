import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  ensureSalesDefaults,
  hasSalesPermission,
  money,
  nullableText,
  numberInput,
  optionalUuid,
  recordSalesActivity,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

type PricelistRuleInput = {
  catalogItemId?: unknown;
  minQuantity?: unknown;
  calculation?: unknown;
  amount?: unknown;
  priority?: unknown;
};

function normalizeCurrency(
  value:
    unknown,
) {
  const currency =
    cleanText(
      value,
      3,
    ).toUpperCase();

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

  return currency;
}

function optionalDate(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }

  const date =
    cleanText(
      value,
      10,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid date.',
    );
  }

  return date;
}

function normalizeRules(
  value:
    unknown,
): Array<{
  catalogItemId: string | null;
  minQuantity: number;
  calculation: 'fixed' | 'discount_percent' | 'markup_percent';
  amount: number;
  priority: number;
}> {
  if (
    value ===
      undefined
  ) {
    return [];
  }

  if (
    !Array.isArray(
      value,
    ) ||
    value.length >
      250
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A pricelist can contain up to 250 rules.',
    );
  }

  return value.map(
    (
      raw,
      index,
    ) => {
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
          'Pricelist rule ' +
          (
            index +
            1
          ) +
          ' is invalid.',
        );
      }

      const item =
        raw as
          PricelistRuleInput;

      const calculationText =
        cleanText(
          item.calculation,
          30,
        );

      const calculation =
        calculationText ===
          'fixed' ||
        calculationText ===
          'discount_percent' ||
        calculationText ===
          'markup_percent'
          ? calculationText
          : null;

      if (
        !calculation
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Pricelist rule ' +
          (
            index +
            1
          ) +
          ' needs a valid calculation method.',
        );
      }

      const amount =
        numberInput(
          item.amount ??
          0,
          'Pricelist amount',
          {
            min:
              0,
            max:
              calculation ===
                'discount_percent'
                ? 100
                : 1_000_000_000,
          },
        );

      return {
        catalogItemId:
          optionalUuid(
            item.catalogItemId,
          ),
        minQuantity:
          numberInput(
            item.minQuantity ??
            1,
            'Minimum quantity',
            {
              min:
                0.0001,
              max:
                1_000_000,
            },
          ),
        calculation,
        amount,
        priority:
          Math.round(
            numberInput(
              item.priority ??
              100,
              'Rule priority',
              {
                min:
                  0,
                max:
                  100_000,
              },
            ),
          ),
      };
    },
  );
}

export async function getSalesCommercialData() {
  const context =
    await requireSalesContext();

  if (
    !hasSalesPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      SALES_PERMISSIONS
        .PRICING_VIEW,
    ) &&
    !hasSalesPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      SALES_PERMISSIONS
        .PRICING_MANAGE,
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Sales pricing access is required.',
    );
  }

  await ensureSalesDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const pricelists =
    await context.pool.query(
      `
        SELECT
          p.id,
          p.name,
          p.code,
          p.currency,
          p.billing_customer_id,
          p.valid_from,
          p.valid_until,
          p.priority,
          p.is_active,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',
                r.id,
                'catalogItemId',
                r.catalog_item_id,
                'minQuantity',
                r.min_quantity,
                'calculation',
                r.calculation,
                'amount',
                r.amount,
                'priority',
                r.priority
              )
              ORDER BY
                r.priority,
                r.min_quantity DESC,
                r.id
            )
            FILTER (
              WHERE r.id
                IS NOT NULL
            ),
            '[]'::jsonb
          ) AS rules
        FROM sales_pricelists p
        LEFT JOIN sales_pricelist_rules r
          ON r.pricelist_id =
             p.id
         AND r.company_id =
             p.company_id
        WHERE p.company_id = $1
          AND p.deleted_at IS NULL
        GROUP BY p.id
        ORDER BY
          p.is_active DESC,
          p.priority,
          LOWER(p.name)
      `,
      [
        context.companyId,
      ],
    );

  return {
    pricelists:
      pricelists.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          code:
            row.code
              ? String(
                  row.code,
                )
              : null,
          currency:
            String(
              row.currency,
            ),
          billingCustomerId:
            row.billing_customer_id
              ? String(
                  row.billing_customer_id,
                )
              : null,
          validFrom:
            row.valid_from
              ? String(
                  row.valid_from,
                )
              : null,
          validUntil:
            row.valid_until
              ? String(
                  row.valid_until,
                )
              : null,
          priority:
            Number(
              row.priority ||
              100,
            ),
          isActive:
            row.is_active ===
              true,
          rules:
            Array.isArray(
              row.rules,
            )
              ? row.rules
              : [],
        }),
      ),
  };
}

export async function saveSalesPricelist(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .PRICING_MANAGE,
    );

  await ensureSalesDefaults(
    context.pool,
    context.companyId,
    context.userId,
  );

  const id =
    optionalUuid(
      input.id,
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
      'Pricelist name is required.',
    );
  }

  const currency =
    normalizeCurrency(
      input.currency ||
      context.company
        .currentCompany.currency ||
      'KES',
    );

  const validFrom =
    optionalDate(
      input.validFrom,
    );

  const validUntil =
    optionalDate(
      input.validUntil,
    );

  if (
    validFrom &&
    validUntil &&
    validUntil <
      validFrom
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Pricelist end date cannot be before its start date.',
    );
  }

  const rules =
    normalizeRules(
      input.rules,
    );

  const billingCustomerId =
    optionalUuid(
      input.billingCustomerId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      billingCustomerId
    ) {
      const customerTable =
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
        customerTable.rows[0]
          ?.ready !==
          true
      ) {
        throw new SalesError(
          'INVOICING_REQUIRED',
          'Install Invoicing before assigning a pricelist to a billing customer.',
        );
      }

      const customer =
        await client.query(
          `
            SELECT 1
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
        customer.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Choose a valid active customer for this pricelist.',
        );
      }
    }

    const header =
      id
        ? await client.query(
            `
              UPDATE sales_pricelists
              SET
                name = $3,
                code = $4,
                currency = $5,
                billing_customer_id = $6,
                valid_from = $7,
                valid_until = $8,
                priority = $9,
                is_active = $10,
                updated_by = $11,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              id,
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              currency,
              billingCustomerId,
              validFrom,
              validUntil,
              Math.round(
                numberInput(
                  input.priority ??
                  100,
                  'Pricelist priority',
                  {
                    min:
                      0,
                    max:
                      100_000,
                  },
                ),
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_pricelists (
                company_id,
                name,
                code,
                currency,
                billing_customer_id,
                valid_from,
                valid_until,
                priority,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
              )
              RETURNING id
            `,
            [
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              currency,
              billingCustomerId,
              validFrom,
              validUntil,
              Math.round(
                numberInput(
                  input.priority ??
                  100,
                  'Pricelist priority',
                  {
                    min:
                      0,
                    max:
                      100_000,
                  },
                ),
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      header.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Pricelist was not found.',
      );
    }

    const pricelistId =
      String(
        header.rows[0].id,
      );

    if (
      input.rules !==
        undefined
    ) {
      await client.query(
        `
          DELETE FROM sales_pricelist_rules
          WHERE company_id = $1
            AND pricelist_id = $2
        `,
        [
          context.companyId,
          pricelistId,
        ],
      );

      for (
        const rule
        of rules
      ) {
        await client.query(
          `
            INSERT INTO sales_pricelist_rules (
              company_id,
              pricelist_id,
              catalog_item_id,
              min_quantity,
              calculation,
              amount,
              priority,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$8
            )
          `,
          [
            context.companyId,
            pricelistId,
            rule.catalogItemId,
            rule.minQuantity,
            rule.calculation,
            rule.amount,
            rule.priority,
            context.userId,
          ],
        );
      }
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        pricelistId,
      name,
      currency,
      ruleCount:
        rules.length,
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

export async function resolveSalesPricelistUnitPrice(
  client:
    PoolClient,
  input: {
    companyId: string;
    pricelistId: string | null;
    catalogItemId: string | null;
    billingCustomerId: string | null;
    quantity: number;
    baseUnitPrice: number;
    quoteDate: string;
  },
) {
  if (
    !input.pricelistId
  ) {
    return {
      unitPrice:
        money(
          input.baseUnitPrice,
        ),
      pricelistId:
        null,
    };
  }

  const result =
    await client.query(
      `
        SELECT
          p.id,
          p.currency,
          r.calculation,
          r.amount
        FROM sales_pricelists p
        LEFT JOIN LATERAL (
          SELECT
            rule.calculation,
            rule.amount
          FROM sales_pricelist_rules rule
          WHERE rule.company_id =
                p.company_id
            AND rule.pricelist_id =
                p.id
            AND (
              rule.catalog_item_id =
                $3
              OR rule.catalog_item_id
                IS NULL
            )
            AND rule.min_quantity <=
                $4
          ORDER BY
            CASE
              WHEN rule.catalog_item_id =
                   $3
              THEN 0
              ELSE 1
            END,
            rule.min_quantity DESC,
            rule.priority,
            rule.id
          LIMIT 1
        ) r ON TRUE
        WHERE p.id = $1
          AND p.company_id = $2
          AND p.is_active = TRUE
          AND p.deleted_at IS NULL
          AND (
            p.billing_customer_id IS NULL
            OR p.billing_customer_id =
               $6
          )
          AND (
            p.valid_from IS NULL
            OR p.valid_from <=
               $5::date
          )
          AND (
            p.valid_until IS NULL
            OR p.valid_until >=
               $5::date
          )
        LIMIT 1
      `,
      [
        input.pricelistId,
        input.companyId,
        input.catalogItemId,
        input.quantity,
        input.quoteDate,
        input.billingCustomerId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose an active pricelist that is valid for the quotation date.',
    );
  }

  const row =
    result.rows[0];

  const base =
    money(
      input.baseUnitPrice,
    );

  const amount =
    Number(
      row.amount ||
      0,
    );

  const unitPrice =
    row.calculation ===
      'fixed'
      ? amount
      : row.calculation ===
          'discount_percent'
        ? base *
          (
            1 -
            Math.min(
              100,
              amount,
            ) /
            100
          )
        : row.calculation ===
            'markup_percent'
          ? base *
            (
              1 +
              amount /
              100
            )
          : base;

  return {
    unitPrice:
      money(
        Math.max(
          0,
          unitPrice,
        ),
      ),
    pricelistId:
      String(
        row.id,
      ),
    currency:
      String(
        row.currency,
      ),
  };
}

export async function createSalesQuoteRevision(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_REVISE,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quotation',
    );

  const reason =
    nullableText(
      input.reason,
      2000,
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
        'Quotation was not found.',
      );
    }

    const row =
      quote.rows[0];

    if (
      [
        'accepted',
        'converted',
        'cancelled',
      ].includes(
        String(
          row.status,
        ),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Accepted, converted or cancelled quotations cannot be revised.',
      );
    }

    const [
      lines,
      optionalItems,
      settings,
    ] =
      await Promise.all([
        client.query(
          `
            SELECT *
            FROM sales_quote_items
            WHERE quote_id = $1
              AND company_id = $2
            ORDER BY sort_order, id
          `,
          [
            quoteId,
            context.companyId,
          ],
        ),
        client.query(
          `
            SELECT *
            FROM sales_quote_optional_items
            WHERE quote_id = $1
              AND company_id = $2
            ORDER BY sort_order, id
          `,
          [
            quoteId,
            context.companyId,
          ],
        ),
        client.query(
          `
            SELECT
              require_quote_approval,
              quote_approval_threshold
            FROM sales_settings
            WHERE company_id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        ),
      ]);

    const currentRevision =
      Math.max(
        1,
        Number(
          row.current_revision ||
          1,
        ),
      );

    await client.query(
      `
        INSERT INTO sales_quote_revisions (
          quote_id,
          company_id,
          revision_number,
          reason,
          snapshot,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5::jsonb,$6
        )
        ON CONFLICT (
          quote_id,
          revision_number
        )
        DO NOTHING
      `,
      [
        quoteId,
        context.companyId,
        currentRevision,
        reason,
        JSON.stringify({
          quote:
            row,
          lines:
            lines.rows,
          optionalItems:
            optionalItems.rows,
        }),
        context.userId,
      ],
    );

    const policy =
      settings.rows[0] ||
      {};

    const approvalRequired =
      policy.require_quote_approval ===
        true &&
      money(
        row.total_amount,
      ) >=
        money(
          policy.quote_approval_threshold,
        );

    const nextRevision =
      currentRevision +
      1;

    await client.query(
      `
        UPDATE sales_quotes
        SET
          current_revision = $3,
          status = 'draft',
          approval_status = $4,
          approval_requested_at = NULL,
          approval_requested_by = NULL,
          approved_at = NULL,
          approved_by = NULL,
          approval_rejected_at = NULL,
          approval_rejected_by = NULL,
          approval_rejection_reason = NULL,
          public_token_hash = NULL,
          public_enabled = FALSE,
          sent_at = NULL,
          viewed_at = NULL,
          accepted_at = NULL,
          accepted_by_name = NULL,
          accepted_by_email = NULL,
          acceptance_note = NULL,
          rejected_at = NULL,
          expired_at = NULL,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
        nextRevision,
        approvalRequired
          ? 'draft'
          : 'not_required',
        context.userId,
      ],
    );

    if (
      String(
        row.status,
      ) !==
        'draft'
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
            'draft',
            $4,
            $5
          )
        `,
        [
          quoteId,
          context.companyId,
          String(
            row.status,
          ),
          reason ||
          'Quotation revised',
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
          'sales.quote.revised',
        content:
          'Quotation revised from revision ' +
          currentRevision +
          ' to revision ' +
          nextRevision +
          '.',
        metadata: {
          previousRevision:
            currentRevision,
          currentRevision:
            nextRevision,
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
      previousRevision:
        currentRevision,
      currentRevision:
        nextRevision,
      status:
        'draft',
      approvalStatus:
        approvalRequired
          ? 'draft'
          : 'not_required',
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

export async function saveSalesQuoteOptionalItems(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_OPTIONAL_MANAGE,
    );

  const quoteId =
    requireUuid(
      input.quoteId,
      'Quotation',
    );

  if (
    !Array.isArray(
      input.items,
    ) ||
    input.items.length >
      100
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Optional products must be an array with no more than 100 items.',
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
          SELECT status
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
        'Quotation was not found.',
      );
    }

    if (
      String(
        quote.rows[0].status,
      ) !==
        'draft'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Optional products can only be changed while the quotation is a draft.',
      );
    }

    await client.query(
      `
        DELETE FROM sales_quote_optional_items
        WHERE quote_id = $1
          AND company_id = $2
      `,
      [
        quoteId,
        context.companyId,
      ],
    );

    const canManageMargin =
      hasSalesPermission(
        context.permissions
          .isOwner,
        context.permissions
          .permissionSet,
        SALES_PERMISSIONS
          .MARGIN_MANAGE,
      );

    let index =
      0;

    for (
      const raw
      of input.items
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
          'An optional product is invalid.',
        );
      }

      const item =
        raw as
          Record<string, unknown>;

      const catalogItemId =
        optionalUuid(
          item.catalogItemId,
        );

      let catalogUnitCost =
        0;

      if (
        catalogItemId
      ) {
        const catalog =
          await client.query(
            `
              SELECT metadata
              FROM invoicing_catalog_items
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              LIMIT 1
            `,
            [
              catalogItemId,
              context.companyId,
            ],
          );

        if (
          catalog.rows.length !==
            1
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Choose a valid catalog item for the optional product.',
          );
        }

        const metadata =
          catalog.rows[0]
            ?.metadata &&
          typeof catalog.rows[0]
            .metadata ===
            'object' &&
          !Array.isArray(
            catalog.rows[0]
              .metadata,
          )
            ? catalog.rows[0]
                .metadata as
                  Record<
                    string,
                    unknown
                  >
            : {};

        catalogUnitCost =
          numberInput(
            metadata.standardCost ??
            metadata.unitCost ??
            0,
            'Optional product unit cost',
          );
      }

      if (
        item.unitCost !==
          undefined &&
        !canManageMargin
      ) {
        throw new SalesError(
          'SALES_PERMISSION_REQUIRED',
          'Margin-management permission is required to override optional-product cost.',
        );
      }

      const unitCost =
        item.unitCost !==
          undefined
          ? numberInput(
              item.unitCost,
              'Optional product unit cost',
            )
          : catalogUnitCost;

      const description =
        cleanText(
          item.description,
          4000,
        );

      if (
        !description
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Every optional product needs a description.',
        );
      }

      await client.query(
        `
          INSERT INTO sales_quote_optional_items (
            quote_id,
            company_id,
            catalog_item_id,
            sort_order,
            description,
            sku_snapshot,
            unit,
            quantity,
            unit_price,
            unit_cost,
            tax_name_snapshot,
            tax_rate,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13
          )
        `,
        [
          quoteId,
          context.companyId,
          catalogItemId,
          index,
          description,
          nullableText(
            item.sku,
            180,
          ),
          cleanText(
            item.unit ||
            'unit',
            60,
          ) ||
          'unit',
          numberInput(
            item.quantity ??
            1,
            'Optional product quantity',
            {
              min:
                0.0001,
              max:
                1_000_000,
            },
          ),
          numberInput(
            item.unitPrice ??
            0,
            'Optional product unit price',
          ),
          unitCost,
          nullableText(
            item.taxName,
            180,
          ),
          numberInput(
            item.taxRate ??
            0,
            'Optional product tax rate',
            {
              min:
                0,
              max:
                100,
            },
          ),
          context.userId,
        ],
      );

      index +=
        1;
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        quoteId,
      optionalItemCount:
        index,
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
