import 'server-only';

import crypto from 'crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  money,
  nullableText,
  recordSalesActivity,
  SalesError,
  UUID_RE,
} from '@/lib/apps/sales/context';


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


function assertToken(
  token:
    string,
) {
  if (
    typeof token !==
      'string' ||
    token.length <
      32 ||
    token.length >
      200
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
    );
  }
}


export async function getPublicSalesQuote(
  tenantId:
    string,
  token:
    string,
  options: {
    markViewed?: boolean;
  } = {},
) {
  assertToken(
    token,
  );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const tokenHash =
    sha256(
      token,
    );

  const result =
    await pool.query(
      `
        SELECT
          q.id,
          q.company_id,
          q.quote_number,
          q.status,
          q.quote_date,
          q.valid_until,
          q.currency,
          q.reference,
          q.customer_name,
          q.customer_email,
          q.customer_phone,
          q.customer_tax_id,
          q.billing_address,
          q.subtotal,
          q.discount_total,
          q.tax_total,
          q.shipping_total,
          q.total_amount,
          q.notes,
          q.terms,
          q.sales_order_id,
          q.latest_invoice_id,
          q.viewed_at,
          c.name
            AS company_name,
          c.email
            AS company_email,
          c.phone
            AS company_phone,
          c.address
            AS company_address,
          c.tax_id
            AS company_tax_id,
          c.registration_number
            AS company_registration_number,
          COALESCE(
            t.primary_color,
            s.primary_color,
            '#164a9f'
          )
            AS primary_color,
          COALESCE(
            t.secondary_color,
            s.secondary_color,
            '#0f172a'
          )
            AS secondary_color,
          COALESCE(
            t.footer_text,
            s.footer_text
          )
            AS footer_text,
          COALESCE(
            s.allow_online_acceptance,
            TRUE
          )
            AS allow_online_acceptance,
          COALESCE(
            s.allow_online_rejection,
            TRUE
          )
            AS allow_online_rejection
        FROM sales_quotes q
        INNER JOIN companies c
          ON c.id =
             q.company_id
        LEFT JOIN sales_quote_templates t
          ON t.id =
             q.template_id
         AND t.company_id =
             q.company_id
         AND t.deleted_at
             IS NULL
        LEFT JOIN sales_settings s
          ON s.company_id =
             q.company_id
        WHERE q.public_token_hash =
              $1
          AND q.public_enabled =
              TRUE
          AND q.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        tokenHash,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
    );
  }

  const quote =
    result.rows[0];

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  let status =
    String(
      quote.status,
    );

  if (
    [
      'sent',
      'viewed',
    ].includes(
      status,
    ) &&
    quote.valid_until &&
    String(
      quote.valid_until,
    ) <
      today
  ) {
    status =
      'expired';

    await pool.query(
      `
        UPDATE sales_quotes
        SET
          status = 'expired',
          expired_at =
            COALESCE(
              expired_at,
              NOW()
            ),
          public_enabled =
            FALSE,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND status IN (
            'sent',
            'viewed'
          )
      `,
      [
        quote.id,
        quote.company_id,
      ],
    );
  } else if (
    options.markViewed !==
      false &&
    status ===
      'sent'
  ) {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const changed =
        await client.query(
          `
            UPDATE sales_quotes
            SET
              status = 'viewed',
              viewed_at =
                COALESCE(
                  viewed_at,
                  NOW()
                ),
              updated_at =
                NOW()
            WHERE id = $1
              AND company_id = $2
              AND status = 'sent'
            RETURNING id
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );

      if (
        changed.rows.length >
          0
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
              $1,$2,
              'sent',
              'viewed',
              'Viewed by customer',
              NULL
            )
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );

        await recordSalesActivity(
          client,
          {
            companyId:
              String(
                quote.company_id,
              ),
            userId:
              null,
            quoteId:
              String(
                quote.id,
              ),
            type:
              'sales.quote.viewed',
            content:
              'Quote ' +
              String(
                quote.quote_number,
              ) +
              ' viewed by customer.',
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

  const lines =
    await pool.query(
      `
        SELECT
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
        quote.id,
        quote.company_id,
      ],
    );

  const optionalItems =
    await pool.query(
      `
        SELECT
          id,
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          tax_name_snapshot,
          tax_rate,
          is_selected
        FROM sales_quote_optional_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quote.id,
        quote.company_id,
      ],
    );

  return {
    tenantId,
    token,
    id:
      String(
        quote.id,
      ),
    quoteNumber:
      String(
        quote.quote_number,
      ),
    status,
    quoteDate:
      String(
        quote.quote_date,
      ),
    validUntil:
      quote.valid_until
        ? String(
            quote.valid_until,
          )
        : null,
    currency:
      String(
        quote.currency,
      ),
    reference:
      quote.reference
        ? String(
            quote.reference,
          )
        : null,
    subtotal:
      money(
        quote.subtotal,
      ),
    discountTotal:
      money(
        quote.discount_total,
      ),
    taxTotal:
      money(
        quote.tax_total,
      ),
    shippingTotal:
      money(
        quote.shipping_total,
      ),
    totalAmount:
      money(
        quote.total_amount,
      ),
    notes:
      quote.notes
        ? String(
            quote.notes,
          )
        : null,
    terms:
      quote.terms
        ? String(
            quote.terms,
          )
        : null,
    salesOrderId:
      quote.sales_order_id
        ? String(
            quote.sales_order_id,
          )
        : null,
    latestInvoiceId:
      quote.latest_invoice_id
        ? String(
            quote.latest_invoice_id,
          )
        : null,
    customer: {
      name:
        String(
          quote.customer_name,
        ),
      email:
        quote.customer_email
          ? String(
              quote.customer_email,
            )
          : null,
      phone:
        quote.customer_phone
          ? String(
              quote.customer_phone,
            )
          : null,
      taxId:
        quote.customer_tax_id
          ? String(
              quote.customer_tax_id,
            )
          : null,
      billingAddress:
        quote.billing_address
          ? String(
              quote.billing_address,
            )
          : null,
    },
    company: {
      name:
        String(
          quote.company_name,
        ),
      email:
        quote.company_email
          ? String(
              quote.company_email,
            )
          : null,
      phone:
        quote.company_phone
          ? String(
              quote.company_phone,
            )
          : null,
      address:
        quote.company_address
          ? String(
              quote.company_address,
            )
          : null,
      taxId:
        quote.company_tax_id
          ? String(
              quote.company_tax_id,
            )
          : null,
      registrationNumber:
        quote.company_registration_number
          ? String(
              quote.company_registration_number,
            )
          : null,
    },
    portal: {
      allowAcceptance:
        quote.allow_online_acceptance !==
        false,
      allowRejection:
        quote.allow_online_rejection !==
        false,
    },
    template: {
      primaryColor:
        String(
          quote.primary_color ||
          '#164a9f',
        ),
      secondaryColor:
        String(
          quote.secondary_color ||
          '#0f172a',
        ),
      footerText:
        quote.footer_text
          ? String(
              quote.footer_text,
            )
          : null,
    },
    lines:
      lines.rows.map(
        line => ({
          description:
            String(
              line.description,
            ),
          sku:
            line.sku_snapshot
              ? String(
                  line.sku_snapshot,
                )
              : null,
          unit:
            String(
              line.unit ||
              'unit',
            ),
          quantity:
            Number(
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
          discountAmount:
            money(
              line.discount_amount,
            ),
          taxName:
            line.tax_name_snapshot
              ? String(
                  line.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              line.tax_rate,
            ),
          taxAmount:
            money(
              line.tax_amount,
            ),
          subtotal:
            money(
              line.subtotal,
            ),
          lineTotal:
            money(
              line.line_total,
            ),
        }),
      ),
    optionalItems:
      optionalItems.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          catalogItemId:
            item.catalog_item_id
              ? String(
                  item.catalog_item_id,
                )
              : null,
          description:
            String(
              item.description,
            ),
          sku:
            item.sku_snapshot
              ? String(
                  item.sku_snapshot,
                )
              : null,
          unit:
            String(
              item.unit ||
              'unit',
            ),
          quantity:
            Number(
              item.quantity,
            ),
          unitPrice:
            money(
              item.unit_price,
            ),
          taxName:
            item.tax_name_snapshot
              ? String(
                  item.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              item.tax_rate ||
              0,
            ),
          isSelected:
            item.is_selected ===
              true,
        }),
      ),
  };
}


export async function respondToPublicSalesQuote(
  tenantId:
    string,
  token:
    string,
  input: {
    action:
      'accept' |
      'reject';
    reason?:
      unknown;
    signerName?:
      unknown;
    signerEmail?:
      unknown;
    acceptanceNote?:
      unknown;
    selectedOptionalItemIds?:
      unknown;
  },
) {
  assertToken(
    token,
  );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const tokenHash =
    sha256(
      token,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            q.id,
            q.company_id,
            q.quote_number,
            q.status,
            q.valid_until,
            COALESCE(
              s.allow_online_acceptance,
              TRUE
            ) AS allow_online_acceptance,
            COALESCE(
              s.allow_online_rejection,
              TRUE
            ) AS allow_online_rejection
          FROM sales_quotes q
          LEFT JOIN sales_settings s
            ON s.company_id =
               q.company_id
          WHERE q.public_token_hash =
                $1
            AND q.public_enabled =
                TRUE
            AND q.deleted_at
                IS NULL
          FOR UPDATE
        `,
        [
          tokenHash,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const quote =
      result.rows[0];

    const current =
      String(
        quote.status,
      );

    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    if (
      quote.valid_until &&
      String(
        quote.valid_until,
      ) <
        today
    ) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            status = 'expired',
            expired_at =
              COALESCE(
                expired_at,
                NOW()
              ),
            public_enabled =
              FALSE,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          quote.id,
          quote.company_id,
        ],
      );

      await client.query(
        'COMMIT',
      );

      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote has expired.',
      );
    }

    if (
      ![
        'sent',
        'viewed',
      ].includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote can no longer be changed from the customer page.',
      );
    }

    if (
      input.action ===
        'accept' &&
      quote.allow_online_acceptance ===
        false
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Online quote acceptance is disabled for this company.',
      );
    }

    if (
      input.action ===
        'reject' &&
      quote.allow_online_rejection ===
        false
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Online quote rejection is disabled for this company.',
      );
    }

    const next =
      input.action ===
        'accept'
        ? 'accepted'
        : 'rejected';

    const reason =
      input.action ===
        'reject'
        ? nullableText(
            input.reason,
            2000,
          )
        : null;

    const signerName =
      input.action ===
        'accept'
        ? nullableText(
            input.signerName,
            255,
          )
        : null;

    const signerEmail =
      input.action ===
        'accept'
        ? nullableText(
            input.signerEmail,
            320,
          )
        : null;

    const acceptanceNote =
      input.action ===
        'accept'
        ? nullableText(
            input.acceptanceNote,
            2000,
          )
        : null;

    const selectedOptionalItemIds =
      input.action ===
        'accept' &&
      Array.isArray(
        input.selectedOptionalItemIds,
      )
        ? Array.from(
            new Set(
              input.selectedOptionalItemIds
                .filter(
                  value =>
                    typeof value ===
                      'string' &&
                    UUID_RE.test(
                      value,
                    ),
                ),
            ),
          )
        : [];

    if (
      Array.isArray(
        input.selectedOptionalItemIds,
      ) &&
      selectedOptionalItemIds.length !==
        input.selectedOptionalItemIds.length
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'One or more optional product selections are invalid.',
      );
    }

    if (
      input.action ===
        'accept' &&
      !signerName
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Enter the name of the person accepting this quotation.',
      );
    }

    if (
      input.action ===
        'accept'
    ) {
      const optionalRows =
        await client.query(
          `
            SELECT
              id
            FROM sales_quote_optional_items
            WHERE quote_id = $1
              AND company_id = $2
              AND id = ANY(
                $3::uuid[]
              )
            FOR UPDATE
          `,
          [
            quote.id,
            quote.company_id,
            selectedOptionalItemIds,
          ],
        );

      if (
        optionalRows.rows.length !==
          selectedOptionalItemIds.length
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'One or more selected optional products no longer belong to this quotation.',
        );
      }

      await client.query(
        `
          UPDATE sales_quote_optional_items
          SET
            is_selected =
              id = ANY(
                $3::uuid[]
              ),
            selected_at =
              CASE
                WHEN id = ANY(
                  $3::uuid[]
                )
                THEN NOW()
                ELSE NULL
              END,
            updated_at =
              NOW()
          WHERE quote_id = $1
            AND company_id = $2
        `,
        [
          quote.id,
          quote.company_id,
          selectedOptionalItemIds,
        ],
      );

      if (
        selectedOptionalItemIds.length >
          0
      ) {
        await client.query(
          `
            INSERT INTO sales_quote_items (
              quote_id,
              company_id,
              catalog_item_id,
              external_product_id,
              sort_order,
              description,
              sku_snapshot,
              unit,
              quantity,
              unit_price,
              unit_cost,
              cost_total,
              margin_amount,
              margin_percent,
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
              optional.quote_id,
              optional.company_id,
              optional.catalog_item_id,
              catalog.external_product_id,
              10000 +
                optional.sort_order,
              optional.description,
              optional.sku_snapshot,
              optional.unit,
              optional.quantity,
              optional.unit_price,
              optional.unit_cost,
              ROUND(
                optional.quantity *
                optional.unit_cost,
                2
              ),
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) -
                (
                  optional.quantity *
                  optional.unit_cost
                ),
                2
              ),
              CASE
                WHEN optional.quantity *
                     optional.unit_price >
                     0
                THEN ROUND(
                  (
                    (
                      optional.quantity *
                      optional.unit_price
                    ) -
                    (
                      optional.quantity *
                      optional.unit_cost
                    )
                  ) /
                  (
                    optional.quantity *
                    optional.unit_price
                  ) *
                  100,
                  4
                )
                ELSE 0
              END,
              'percent',
              0,
              0,
              optional.tax_name_snapshot,
              optional.tax_rate,
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) *
                optional.tax_rate /
                100,
                2
              ),
              ROUND(
                optional.quantity *
                optional.unit_price,
                2
              ),
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) *
                (
                  1 +
                  optional.tax_rate /
                  100
                ),
                2
              )
            FROM sales_quote_optional_items optional
            LEFT JOIN invoicing_catalog_items catalog
              ON catalog.id =
                 optional.catalog_item_id
             AND catalog.company_id =
                 optional.company_id
             AND catalog.deleted_at
                 IS NULL
            WHERE optional.quote_id = $1
              AND optional.company_id = $2
              AND optional.is_selected =
                  TRUE
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );
      }

      await client.query(
        `
          WITH totals AS (
            SELECT
              COALESCE(
                SUM(subtotal),
                0
              ) AS subtotal,
              COALESCE(
                SUM(discount_amount),
                0
              ) AS discount_total,
              COALESCE(
                SUM(tax_amount),
                0
              ) AS tax_total,
              COALESCE(
                SUM(cost_total),
                0
              ) AS cost_total
            FROM sales_quote_items
            WHERE quote_id = $1
              AND company_id = $2
          )
          UPDATE sales_quotes q
          SET
            subtotal =
              ROUND(
                totals.subtotal,
                2
              ),
            discount_total =
              ROUND(
                totals.discount_total,
                2
              ),
            tax_total =
              ROUND(
                totals.tax_total,
                2
              ),
            total_amount =
              ROUND(
                totals.subtotal -
                totals.discount_total +
                totals.tax_total +
                q.shipping_total,
                2
              ),
            cost_total =
              ROUND(
                totals.cost_total,
                2
              ),
            margin_amount =
              ROUND(
                (
                  totals.subtotal -
                  totals.discount_total
                ) -
                totals.cost_total,
                2
              ),
            margin_percent =
              CASE
                WHEN totals.subtotal -
                     totals.discount_total >
                     0
                THEN ROUND(
                  (
                    (
                      totals.subtotal -
                      totals.discount_total
                    ) -
                    totals.cost_total
                  ) /
                  (
                    totals.subtotal -
                    totals.discount_total
                  ) *
                  100,
                  4
                )
                ELSE 0
              END,
            updated_at =
              NOW()
          FROM totals
          WHERE q.id = $1
            AND q.company_id = $2
        `,
        [
          quote.id,
          quote.company_id,
        ],
      );

      await recordSalesActivity(
        client,
        {
          companyId:
            String(
              quote.company_id,
            ),
          userId:
            null,
          quoteId:
            String(
              quote.id,
            ),
          type:
            'sales.quote.optional_products_selected',
          content:
            selectedOptionalItemIds.length >
              0
              ? 'Customer selected optional products before accepting the quotation.'
              : 'Customer accepted the quotation without optional products.',
          metadata: {
            selectedOptionalItemIds,
          },
        },
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
          accepted_by_name =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $4
              ELSE accepted_by_name
            END,
          accepted_by_email =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $5
              ELSE accepted_by_email
            END,
          acceptance_note =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $6
              ELSE acceptance_note
            END,
          public_enabled =
            FALSE,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quote.id,
        quote.company_id,
        next,
        signerName,
        signerEmail,
        acceptanceNote,
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
          $1,$2,$3,$4,$5,NULL
        )
      `,
      [
        quote.id,
        quote.company_id,
        current,
        next,
        reason,
      ],
    );

    await recordSalesActivity(
      client,
      {
        companyId:
          String(
            quote.company_id,
          ),
        userId:
          null,
        quoteId:
          String(
            quote.id,
          ),
        type:
          'sales.quote.customer_' +
          next,
        content:
          'Customer ' +
          next +
          ' quote ' +
          String(
            quote.quote_number,
          ) +
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
        String(
          quote.id,
        ),
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
