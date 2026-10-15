import 'server-only';

import { createHash } from 'node:crypto';

import type {
  PoolClient,
} from 'pg';

import {
  allocateInvoicePayment,
  createInvoicingCustomer,
} from '@/lib/apps/invoicing/commands';

import {
  issueInvoiceCreditNote,
  refundInvoiceCreditNote,
} from '@/lib/apps/invoicing/credit-notes';

import {
  recordCustomerRetainer,
} from '@/lib/apps/invoicing/retainers';

import {
  postSalesFulfillmentToInventory,
} from '@/lib/apps/sales/inventory';

import { salesOrderDepositIdempotencyKey } from '@/lib/apps/sales/deposit-rules';

import {
  legacySalesReturnRefundIdempotencyKey,
  salesReturnRefundIdempotencyKey,
} from '@/lib/apps/sales/return-credit-rules';

import {
  cleanText,
  money,
  nextSalesNumber,
  nullableText,
  numberInput,
  requireSalesContext,
  requireUuid,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';

function permissionAny(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  permissions:
    string[],
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

async function recordOrderActivity(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    orderId:
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
        'sales.order',
        $3,$4,$5,$6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.orderId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}

async function ensureOrderBillingCustomer(
  input: {
    context:
      Awaited<
        ReturnType<
          typeof requireSalesContext
        >
      >;
    order:
      Record<
        string,
        unknown
      >;
  },
) {
  const existing =
    input.order
      .billing_customer_id
      ? String(
          input.order
            .billing_customer_id,
        )
      : null;

  if (
    existing
  ) {
    return existing;
  }

  try {
    const created =
      await createInvoicingCustomer({
        name:
          input.order
            .customer_name,
        email:
          input.order
            .customer_email,
        phone:
          input.order
            .customer_phone,
        taxId:
          input.order
            .customer_tax_id,
        billingAddress:
          input.order
            .billing_address,
        shippingAddress:
          input.order
            .shipping_address,
        currency:
          input.order
            .currency,
        notes:
          'Created from SaMi Sales order ' +
          String(
            input.order
              .order_number,
          ) +
          '.',
      });

    const customerId =
      created.id;

    if (
      input.order
        .quote_id
    ) {
      await input.context
        .pool.query(
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
            input.order
              .quote_id,
            input.context
              .companyId,
            customerId,
            input.context
              .userId,
          ],
        );
    }

    return customerId;
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
      if (
        input.order
          .quote_id
      ) {
        await input.context
          .pool.query(
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
              input.order
                .quote_id,
              input.context
                .companyId,
              existingId,
              input.context
                .userId,
            ],
          );
      }

      return existingId;
    }

    throw new SalesError(
      'BILLING_CUSTOMER_REQUIRED',
      'This sales order needs a billing customer before a deposit can be recorded.',
    );
  }
}

async function recalculateOrderFulfillment(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    orderId:
      string;
    userId:
      string;
  },
) {
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
          input.orderId,
          input.companyId,
        ],
      )
    ).rows[0] ||
    {};

  const state =
    (
      await client.query(
        `
          SELECT
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
          input.orderId,
          input.companyId,
        ],
      )
    ).rows[0];

  if (
    !state
  ) {
    throw new SalesError(
      'ORDER_NOT_FOUND',
      'Sales order was not found.',
    );
  }

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

  const fulfillmentStatus =
    delivered <=
      0
      ? 'not_started'
      : delivered >=
          ordered -
          0.000001
        ? 'fulfilled'
        : 'partial';

  const invoiceStatus =
    String(
      state.invoice_status ||
      'not_invoiced',
    );

  const orderStatus =
    fulfillmentStatus ===
      'fulfilled' &&
    invoiceStatus ===
      'invoiced'
      ? 'closed'
      : 'confirmed';

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
      input.orderId,
      input.companyId,
      orderStatus,
      fulfillmentStatus,
      input.userId,
    ],
  );

  return {
    orderStatus,
    fulfillmentStatus,
    orderedQuantity:
      ordered,
    deliveredQuantity:
      delivered,
  };
}

export async function getSalesOperationsData(
  horizonInput?:
    unknown,
) {
  const context =
    await requireSalesContext();

  if (
    !permissionAny(
      context,
      [
        SALES_PERMISSIONS
          .SHIPPING_VIEW,
        SALES_PERMISSIONS
          .SHIPPING_MANAGE,
        SALES_PERMISSIONS
          .RETURN_VIEW,
        SALES_PERMISSIONS
          .RETURN_MANAGE,
        SALES_PERMISSIONS
          .DEPOSIT_MANAGE,
        SALES_PERMISSIONS
          .FORECAST_VIEW,
      ],
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Sales operations access is required.',
    );
  }

  const horizonDays =
    Math.round(
      numberInput(
        horizonInput ??
        90,
        'Forecast horizon',
        {
          min:
            1,
          max:
            365,
        },
      ),
    );

  const [
    shipments,
    returns,
    deposits,
    forecast,
  ] =
    await Promise.all([
      permissionAny(
        context,
        [
          SALES_PERMISSIONS
            .SHIPPING_VIEW,
          SALES_PERMISSIONS
            .SHIPPING_MANAGE,
        ],
      )
        ? context.pool.query(
            `
              SELECT
                shipment.id,
                shipment.sales_order_id,
                order_row.order_number,
                shipment.shipment_number,
                shipment.status,
                shipment.carrier,
                shipment.service_level,
                shipment.tracking_number,
                shipment.tracking_url,
                shipment.recipient_name,
                shipment.proof_note,
                shipment.shipped_at,
                shipment.delivered_at,
                shipment.inventory_posted_at,
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'id',
                      item.id,
                      'salesOrderLineId',
                      item.sales_order_line_id,
                      'quantity',
                      item.quantity
                    )
                    ORDER BY item.id
                  )
                  FILTER (
                    WHERE item.id
                      IS NOT NULL
                  ),
                  '[]'::jsonb
                ) AS items
              FROM sales_shipments shipment
              INNER JOIN sales_orders_v2 order_row
                ON order_row.id =
                   shipment.sales_order_id
               AND order_row.company_id =
                   shipment.company_id
              LEFT JOIN sales_shipment_items item
                ON item.shipment_id =
                   shipment.id
               AND item.company_id =
                   shipment.company_id
              WHERE shipment.company_id = $1
              GROUP BY
                shipment.id,
                order_row.order_number
              ORDER BY
                shipment.created_at DESC
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows:
              [],
          }),
      permissionAny(
        context,
        [
          SALES_PERMISSIONS
            .RETURN_VIEW,
          SALES_PERMISSIONS
            .RETURN_MANAGE,
        ],
      )
        ? context.pool.query(
            `
              SELECT
                return_row.id,
                return_row.sales_order_id,
                order_row.order_number,
                return_row.return_number,
                return_row.status,
                return_row.reason,
                return_row.requested_at,
                return_row.approved_at,
                return_row.received_at,
                return_row.credited_at,
                return_row.refunded_at,
                COALESCE(
                  jsonb_agg(
                    DISTINCT
                    jsonb_build_object(
                      'id',
                      item.id,
                      'salesOrderLineId',
                      item.sales_order_line_id,
                      'quantity',
                      item.quantity
                    )
                  )
                  FILTER (
                    WHERE item.id
                      IS NOT NULL
                  ),
                  '[]'::jsonb
                ) AS items,
                COALESCE(
                  (
                    SELECT
                      jsonb_agg(
                        jsonb_build_object(
                          'id',
                          credit.id,
                          'invoiceId',
                          credit.invoice_id,
                          'creditNoteId',
                          credit.credit_note_id,
                          'creditNoteNumber',
                          credit.credit_note_number,
                          'currency',
                          order_row.currency,
                          'amount',
                          credit.amount,
                          'availableCredit',
                          credit.available_credit,
                          'refundedAmount',
                          credit.refunded_amount
                        )
                        ORDER BY
                          credit.created_at
                      )
                    FROM sales_return_credits credit
                    WHERE credit.return_id =
                          return_row.id
                      AND credit.company_id =
                          return_row.company_id
                  ),
                  '[]'::jsonb
                ) AS credits
              FROM sales_returns return_row
              INNER JOIN sales_orders_v2 order_row
                ON order_row.id =
                   return_row.sales_order_id
               AND order_row.company_id =
                   return_row.company_id
              LEFT JOIN sales_return_items item
                ON item.return_id =
                   return_row.id
               AND item.company_id =
                   return_row.company_id
              WHERE return_row.company_id = $1
              GROUP BY
                return_row.id,
                order_row.order_number,
                order_row.currency
              ORDER BY
                return_row.created_at DESC
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows:
              [],
          }),
      permissionAny(
        context,
        [
          SALES_PERMISSIONS
            .DEPOSIT_MANAGE,
        ],
      )
        ? context.pool.query(
            `
              SELECT
                order_row.id,
                order_row.order_number,
                order_row.customer_name,
                order_row.currency,
                order_row.total_amount,
                order_row.deposit_type,
                order_row.deposit_value,
                order_row.deposit_required_amount,
                order_row.deposit_received_amount,
                order_row.deposit_status,
                order_row.deposit_retainer_id,
                order_row.deposit_payment_id
              FROM sales_orders_v2 order_row
              WHERE order_row.company_id = $1
                AND order_row.deleted_at IS NULL
                AND (
                  order_row.deposit_type <>
                    'none'
                  OR order_row.deposit_received_amount >
                     0
                )
              ORDER BY
                order_row.created_at DESC
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows:
              [],
          }),
      permissionAny(
        context,
        [
          SALES_PERMISSIONS
            .FORECAST_VIEW,
        ],
      )
        ? context.pool.query(
            `
              WITH quote_pipeline AS (
                SELECT
                  base_currency AS currency,
                  COALESCE(SUM(base_total_amount), 0) AS open_pipeline,
                  COALESCE(
                    SUM(
                      base_total_amount *
                      CASE status
                        WHEN 'draft' THEN 0.20
                        WHEN 'sent' THEN 0.40
                        WHEN 'viewed' THEN 0.60
                        WHEN 'accepted' THEN 1.00
                        ELSE 0
                      END
                    ),
                    0
                  ) AS weighted_pipeline,
                  COUNT(*) FILTER (
                    WHERE status IN ('draft', 'sent', 'viewed')
                      AND valid_until IS NOT NULL
                      AND valid_until BETWEEN CURRENT_DATE
                      AND CURRENT_DATE + 7
                  ) AS expiring_7_days
                FROM sales_quotes
                WHERE company_id = $1
                  AND deleted_at IS NULL
                  AND status IN ('draft', 'sent', 'viewed', 'accepted')
                  AND (
                    valid_until IS NULL
                    OR valid_until <= CURRENT_DATE + $2::int
                  )
                  AND (
                    status = 'accepted'
                    OR valid_until IS NULL
                    OR valid_until >= CURRENT_DATE
                  )
                GROUP BY base_currency
              ),
              committed AS (
                SELECT
                  base_currency AS currency,
                  COALESCE(SUM(base_total_amount), 0) AS committed_orders,
                  COUNT(*) AS order_count
                FROM sales_orders_v2
                WHERE company_id = $1
                  AND deleted_at IS NULL
                  AND status = 'confirmed'
                  AND invoice_status <> 'invoiced'
                GROUP BY base_currency
              ),
              currencies AS (
                SELECT currency FROM quote_pipeline
                UNION
                SELECT currency FROM committed
              )
              SELECT
                currencies.currency,
                COALESCE(quote_pipeline.open_pipeline, 0) AS open_pipeline,
                COALESCE(quote_pipeline.weighted_pipeline, 0) AS weighted_pipeline,
                COALESCE(quote_pipeline.expiring_7_days, 0) AS expiring_7_days,
                COALESCE(committed.committed_orders, 0) AS committed_orders,
                COALESCE(committed.order_count, 0) AS order_count,
                COALESCE(quote_pipeline.weighted_pipeline, 0) +
                  COALESCE(committed.committed_orders, 0) AS expected_revenue
              FROM currencies
              LEFT JOIN quote_pipeline
                ON quote_pipeline.currency = currencies.currency
              LEFT JOIN committed
                ON committed.currency = currencies.currency
              ORDER BY currencies.currency
            `,
            [
              context.companyId,
              horizonDays,
            ],
          )
        : Promise.resolve({
            rows: [
              {
                currency:
                  String(context.company.currentCompany.currency || 'KES').toUpperCase(),
                open_pipeline: 0,
                weighted_pipeline: 0,
                expiring_7_days: 0,
                committed_orders: 0,
                order_count: 0,
                expected_revenue: 0,
              },
            ],
          }),
    ]);

  const companyBaseCurrency =
    String(
      context.company.currentCompany.currency ||
      'KES',
    ).toUpperCase();

  const forecastCurrencies = (
    forecast.rows || []
  ).map(
    row => ({
      currency:
        String(
          row.currency ||
          companyBaseCurrency,
        ).toUpperCase(),
      openPipeline:
        money(row.open_pipeline || 0),
      weightedPipeline:
        money(row.weighted_pipeline || 0),
      committedOrders:
        money(row.committed_orders || 0),
      expectedRevenue:
        money(row.expected_revenue || 0),
      expiring7Days:
        Number(row.expiring_7_days || 0),
      committedOrderCount:
        Number(row.order_count || 0),
    }),
  );

  const baseCurrencyForecast =
    forecastCurrencies.find(
      item => item.currency === companyBaseCurrency,
    );

  const forecastData = {
    horizonDays,
    baseCurrency: companyBaseCurrency,
    // Legacy scalar fields represent only the current company base currency.
    openPipeline:
      baseCurrencyForecast?.openPipeline || 0,
    weightedPipeline:
      baseCurrencyForecast?.weightedPipeline || 0,
    committedOrders:
      baseCurrencyForecast?.committedOrders || 0,
    expectedRevenue:
      baseCurrencyForecast?.expectedRevenue || 0,
    currencyBreakdown:
      forecastCurrencies,
    expiring7Days:
      forecastCurrencies.reduce(
        (total, item) => total + item.expiring7Days,
        0,
      ),
    committedOrderCount:
      forecastCurrencies.reduce(
        (total, item) => total + item.committedOrderCount,
        0,
      ),
  };

  if (
    permissionAny(
      context,
      [
        SALES_PERMISSIONS
          .FORECAST_VIEW,
      ],
    )
  ) {
    await context.pool.query(
      `
        INSERT INTO sales_forecast_snapshots (
          company_id,
          as_of_date,
          horizon_days,
          open_pipeline,
          weighted_pipeline,
          committed_orders,
          expected_revenue,
          metadata,
          created_by
        )
        VALUES (
          $1,CURRENT_DATE,$2,$3,$4,$5,$6,$7::jsonb,$8
        )
        ON CONFLICT (
          company_id,
          as_of_date,
          horizon_days
        )
        DO UPDATE SET
          open_pipeline =
            EXCLUDED.open_pipeline,
          weighted_pipeline =
            EXCLUDED.weighted_pipeline,
          committed_orders =
            EXCLUDED.committed_orders,
          expected_revenue =
            EXCLUDED.expected_revenue,
          metadata =
            EXCLUDED.metadata,
          created_by =
            EXCLUDED.created_by,
          created_at =
            NOW()
      `,
      [
        context.companyId,
        horizonDays,
        forecastData
          .openPipeline,
        forecastData
          .weightedPipeline,
        forecastData
          .committedOrders,
        forecastData
          .expectedRevenue,
        JSON.stringify({
          baseCurrency: companyBaseCurrency,
          currencyBreakdown: forecastData.currencyBreakdown,
          expiring7Days: forecastData.expiring7Days,
          committedOrderCount: forecastData.committedOrderCount,
        }),
        context.userId,
      ],
    );
  }

  return {
    capabilities: {
      canViewShipping:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .SHIPPING_VIEW,
            SALES_PERMISSIONS
              .SHIPPING_MANAGE,
          ],
        ),
      canManageShipping:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .SHIPPING_MANAGE,
          ],
        ),
      canViewReturns:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .RETURN_VIEW,
            SALES_PERMISSIONS
              .RETURN_MANAGE,
          ],
        ),
      canManageReturns:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .RETURN_MANAGE,
          ],
        ),
      canManageDeposits:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .DEPOSIT_MANAGE,
          ],
        ),
      canViewForecast:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .FORECAST_VIEW,
          ],
        ),
    },
    shipments:
      shipments.rows,
    returns:
      returns.rows,
    deposits:
      deposits.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          orderNumber:
            String(
              row.order_number,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          currency:
            String(
              row.currency,
            ),
          totalAmount:
            money(
              row.total_amount,
            ),
          depositType:
            String(
              row.deposit_type,
            ),
          depositValue:
            money(
              row.deposit_value,
            ),
          requiredAmount:
            money(
              row.deposit_required_amount,
            ),
          receivedAmount:
            money(
              row.deposit_received_amount,
            ),
          status:
            String(
              row.deposit_status,
            ),
          retainerId:
            row.deposit_retainer_id
              ? String(
                  row.deposit_retainer_id,
                )
              : null,
          paymentId:
            row.deposit_payment_id
              ? String(
                  row.deposit_payment_id,
                )
              : null,
        }),
      ),
    forecast:
      forecastData,
  };
}

export async function setSalesOrderDepositRequirement(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .DEPOSIT_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const depositTypeRaw =
    cleanText(
      input.depositType,
      20,
    );

  const depositType =
    depositTypeRaw ===
      'percent' ||
    depositTypeRaw ===
      'fixed'
      ? depositTypeRaw
      : 'none';

  const depositValue =
    depositType ===
      'none'
      ? 0
      : numberInput(
          input.depositValue,
          'Deposit value',
          {
            min:
              0.0001,
            max:
              depositType ===
                'percent'
                ? 100
                : 1_000_000_000,
          },
        );

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
            total_amount,
            deposit_received_amount,
            status
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

    if (
      String(
        order.rows[0]
          .status,
      ) ===
        'cancelled'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A cancelled sales order cannot require a deposit.',
      );
    }

    if (
      money(
        order.rows[0]
          .deposit_received_amount,
      ) >
        0
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'The deposit requirement cannot be changed after a deposit has been received.',
      );
    }

    const total =
      money(
        order.rows[0]
          .total_amount,
      );

    const requiredAmount =
      depositType ===
        'percent'
        ? money(
            total *
            depositValue /
            100,
          )
        : depositType ===
            'fixed'
          ? Math.min(
              total,
              money(
                depositValue,
              ),
            )
          : 0;

    const status =
      requiredAmount >
        0
        ? 'pending'
        : 'none';

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          deposit_type = $3,
          deposit_value = $4,
          deposit_required_amount = $5,
          deposit_status = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        orderId,
        context.companyId,
        depositType,
        depositValue,
        requiredAmount,
        status,
        context.userId,
      ],
    );

    await recordOrderActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId,
        type:
          'sales.order.deposit_requirement_changed',
        content:
          requiredAmount >
            0
            ? 'Deposit requirement updated.'
            : 'Deposit requirement removed.',
        metadata: {
          depositType,
          depositValue,
          requiredAmount,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        orderId,
      depositType,
      depositValue,
      requiredAmount,
      status,
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

export async function recordSalesOrderDeposit(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(SALES_PERMISSIONS.DEPOSIT_MANAGE);
  const orderId = requireUuid(input.orderId, 'Sales order');
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize deposits for a single order before checking or creating the
    // external Invoicing retainer. This prevents concurrent requests with
    // different caller-supplied keys from creating competing deposits.
    const orderResult = await client.query(
      `
        SELECT o.*, q.billing_customer_id
        FROM sales_orders_v2 o
        LEFT JOIN sales_quotes q
          ON q.id = o.quote_id
         AND q.company_id = o.company_id
        WHERE o.id = $1
          AND o.company_id = $2
          AND o.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF o
      `,
      [orderId, context.companyId],
    );

    if (orderResult.rows.length !== 1) {
      throw new SalesError('ORDER_NOT_FOUND', 'Sales order was not found.');
    }

    const order = orderResult.rows[0];

    if (String(order.status) === 'cancelled') {
      throw new SalesError('QUOTE_STATE_INVALID', 'A cancelled sales order cannot receive a deposit.');
    }

    if (order.deposit_payment_id) {
      throw new SalesError('INVALID_INPUT', 'A deposit is already recorded for this sales order.');
    }

    const customerId = await ensureOrderBillingCustomer({ context, order });
    const required = money(order.deposit_required_amount);
    const amount = numberInput(input.amount ?? required, 'Deposit amount', { min: 0.0001 });

    if (required > 0 && Math.abs(amount - required) > 0.0001) {
      throw new SalesError(
        'INVALID_INPUT',
        'The recorded deposit must match the configured order deposit requirement.',
        { requiredAmount: required },
      );
    }

    // A Sales order supports one deposit. Do not let a caller-supplied key
    // bypass that invariant; a retry after a cross-module partial failure must
    // recover the same Invoicing retainer regardless of the request key.
    const key = salesOrderDepositIdempotencyKey(orderId);
    const deposit = await recordCustomerRetainer({
      customerId,
      amount,
      retainerType: 'deposit',
      method: input.method,
      reference: input.reference,
      purpose: 'Deposit for Sales order ' + String(order.order_number),
      expectedUseDate: input.expectedUseDate,
      receivedDate: input.receivedDate,
      idempotencyKey: key,
    });

    if (Math.abs(money(deposit.amount) - amount) > 0.0001) {
      throw new SalesError(
        'INVALID_INPUT',
        'A deposit already exists for this sales order with a different amount. Retry using the original amount.',
        { recordedAmount: money(deposit.amount) },
      );
    }

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          deposit_retainer_id = $3,
          deposit_payment_id = $4,
          deposit_received_amount = $5,
          deposit_status = 'received',
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [orderId, context.companyId, deposit.retainerId, deposit.paymentId, deposit.amount, context.userId],
    );

    await client.query('COMMIT');

    return {
      orderId,
      ...deposit,
      depositStatus: 'received',
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
export async function applySalesOrderDeposit(
  input: Record<string, unknown>,
) {
  const context = await requireSalesContext(
    SALES_PERMISSIONS.DEPOSIT_MANAGE,
  );
  const orderId = requireUuid(input.orderId, 'Sales order').toLowerCase();
  const invoiceId = requireUuid(input.invoiceId, 'Invoice').toLowerCase();
  const operationKey = (
    'sales-order:' + orderId + ':deposit:' + invoiceId
  ).slice(0, 160);

  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize all applications for this order. Keep the row lock until the
    // Invoicing allocation is committed and the Sales-side status is repaired.
    const orderResult = await client.query(
      `
        SELECT o.deposit_payment_id
        FROM sales_orders_v2 o
        INNER JOIN sales_order_invoice_batches batch
          ON batch.sales_order_id = o.id
         AND batch.company_id = o.company_id
         AND batch.invoice_id = $3
         AND batch.status = 'created'
        WHERE o.id = $1
          AND o.company_id = $2
          AND o.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF o
      `,
      [orderId, context.companyId, invoiceId],
    );

    if (
      orderResult.rows.length !== 1 ||
      !orderResult.rows[0].deposit_payment_id
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'This sales order has no recorded deposit available for that invoice.',
      );
    }

    const paymentId = String(orderResult.rows[0].deposit_payment_id);

    // Read balances only after the order lock has been acquired. Keeping the
    // mutable payment/invoice balances out of the locking SELECT avoids using
    // a pre-wait snapshot when another allocation has just completed.
    const [paymentBalanceResult, agingResult] = await Promise.all([
      client.query(
        `
          SELECT
            allocated_amount,
            refunded_amount,
            unapplied_amount
          FROM invoicing_payment_balances
          WHERE payment_id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [paymentId, context.companyId],
      ),
      client.query(
        `
          SELECT
            balance_due,
            effective_status
          FROM invoicing_aging
          WHERE invoice_id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [invoiceId, context.companyId],
      ),
    ]);

    if (
      paymentBalanceResult.rows.length !== 1 ||
      agingResult.rows.length !== 1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'The deposit payment or target invoice balance could not be found.',
      );
    }

    const paymentBalance = paymentBalanceResult.rows[0];
    const aging = agingResult.rows[0];
    const available = money(paymentBalance.unapplied_amount);
    const balance = money(aging.balance_due);

    // Invoicing commits its allocation in a separate transaction. If that
    // succeeded but this Sales transaction failed, recover the exact prior
    // allocation rather than calling allocateInvoicePayment again (which
    // correctly rejects a second active allocation to the same invoice).
    const existingResult = await client.query(
      `
        SELECT
          id,
          payment_amount,
          amount,
          operation_key,
          status
        FROM invoicing_payment_allocations
        WHERE company_id = $1
          AND payment_id = $2
          AND invoice_id = $3
          AND operation_key = $4
          AND status = 'posted'
        LIMIT 1
      `,
      [context.companyId, paymentId, invoiceId, operationKey],
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      const existingAmount = money(
        existing.payment_amount ?? existing.amount,
      );
      const amountWasProvided =
        input.amount !== undefined &&
        input.amount !== null &&
        input.amount !== '';

      if (amountWasProvided) {
        const requestedAmount = numberInput(
          input.amount,
          'Deposit allocation amount',
          { min: 0.0001 },
        );
        if (Math.abs(requestedAmount - existingAmount) > 0.0001) {
          throw new SalesError(
            'INVALID_INPUT',
            'This deposit was already applied to the invoice with a different amount. Reverse that allocation before changing it.',
            { recordedAmount: existingAmount },
          );
        }
      }

      const nextStatus =
        available <= 0.0001 ? 'applied' : 'partially_applied';

      await client.query(
        `
          UPDATE sales_orders_v2
          SET
            deposit_status = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [orderId, context.companyId, nextStatus, context.userId],
      );

      await client.query('COMMIT');

      return {
        orderId,
        depositStatus: nextStatus,
        allocationId: String(existing.id),
        paymentId,
        invoiceId,
        invoiceStatus: String(aging.effective_status || ''),
        remainingBalance: balance,
        allocatedAmount: money(paymentBalance.allocated_amount),
        refundedAmount: money(paymentBalance.refunded_amount),
        unappliedAmount: available,
        reused: true,
      };
    }

    const requested =
      input.amount === undefined ||
      input.amount === null ||
      input.amount === ''
        ? Math.min(available, balance)
        : numberInput(
            input.amount,
            'Deposit allocation amount',
            { min: 0.0001 },
          );

    if (
      requested <= 0 ||
      requested > available + 0.0001 ||
      requested > balance + 0.0001
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Deposit allocation must fit the unapplied deposit and invoice balance.',
        {
          availableDeposit: available,
          invoiceBalance: balance,
        },
      );
    }

    const allocation = await allocateInvoicePayment({
      paymentId,
      invoiceId,
      amount: requested,
      operationKey,
    });

    const nextStatus =
      allocation.unappliedAmount <= 0.0001
        ? 'applied'
        : 'partially_applied';

    await client.query(
      `
        UPDATE sales_orders_v2
        SET
          deposit_status = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [orderId, context.companyId, nextStatus, context.userId],
    );

    await client.query('COMMIT');

    return {
      orderId,
      depositStatus: nextStatus,
      ...allocation,
      reused: false,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function createSalesShipment(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SHIPPING_MANAGE,
    );

  const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const requested =
    Array.isArray(
      input.lines,
    )
      ? input.lines
      : [];

  if (
    requested.length <
      1 ||
    requested.length >
      200
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A shipment needs at least one sales-order line.',
    );
  }

  const rawIdempotencyKey =
    typeof input.idempotencyKey === 'string'
      ? input.idempotencyKey.trim()
      : '';

  if (rawIdempotencyKey.length > 120) {
    throw new SalesError(
      'INVALID_INPUT',
      'Shipment request keys must be 120 characters or fewer.',
    );
  }

  const idempotencyKey =
    rawIdempotencyKey || null;

  const requestLines:
    Array<{
      lineId: string;
      quantity: number;
    }> = [];

  const requestLineIds =
    new Set<string>();

  for (const raw of requested) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'A shipment line is invalid.',
      );
    }

    const item = raw as Record<string, unknown>;
    const lineId = requireUuid(
      item.lineId,
      'Sales order line',
    ).toLowerCase();

    if (requestLineIds.has(lineId)) {
      throw new SalesError(
        'INVALID_INPUT',
        'A sales-order line may appear only once in a shipment. Combine its quantity into one line.',
      );
    }
    requestLineIds.add(lineId);

    requestLines.push({
      lineId,
      quantity: numberInput(
        item.quantity,
        'Shipment quantity',
        { min: 0.0001, max: 1_000_000 },
      ),
    });
  }

  requestLines.sort(
    (left, right) =>
      left.lineId.localeCompare(right.lineId),
  );

  const requestPayload = {
    lines: requestLines,
    carrier: nullableText(input.carrier, 180),
    serviceLevel: nullableText(input.serviceLevel, 180),
    trackingNumber: nullableText(input.trackingNumber, 255),
    trackingUrl: nullableText(input.trackingUrl, 4000),
  };

  const requestFingerprint =
    createHash('sha256')
      .update(JSON.stringify(requestPayload))
      .digest('hex');

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
        'sales-order-invoice:' + orderId,
      ],
    );

    const order =
      await client.query(
        `
          SELECT
            status,
            order_number
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

    if (idempotencyKey) {
      const existingShipment =
        await client.query(
          `
            SELECT
              id,
              shipment_number,
              status,
              metadata
            FROM sales_shipments
            WHERE company_id = $1
              AND sales_order_id = $2
              AND metadata->>'idempotencyKey' = $3
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
          `,
          [
            context.companyId,
            orderId,
            idempotencyKey,
          ],
        );

      if (existingShipment.rows.length > 0) {
        const existing = existingShipment.rows[0];
        let metadata: unknown = existing.metadata;

        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch {
            metadata = null;
          }
        }

        const storedFingerprint =
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>).requestFingerprint
            : null;

        if (
          typeof storedFingerprint !== 'string' ||
          storedFingerprint !== requestFingerprint
        ) {
          throw new SalesError(
            'QUOTE_STATE_INVALID',
            'This shipment request key already belongs to a different shipment request. Reload the order before starting a new shipment.',
          );
        }

        await client.query('COMMIT');

        return {
          shipmentId: String(existing.id),
          shipmentNumber: String(existing.shipment_number),
          status: String(existing.status),
          reused: true,
        };
      }
    }

    if (
      ['cancelled', 'closed'].includes(
        String(order.rows[0].status),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A cancelled or closed sales order cannot receive a new shipment.',
      );
    }

    const prepared:
      Array<{
        lineId:
          string;
        quantity:
          number;
      }> =
        [];

    for (const requestedLine of requestLines) {
      const lineId = requestedLine.lineId;
      const quantity = requestedLine.quantity;

      const line =
        await client.query(
          `
            SELECT
              line.quantity,
              line.shipped_quantity,
              COALESCE(
                (
                  SELECT SUM(
                    shipment_item.quantity
                  )
                  FROM sales_shipment_items shipment_item
                  INNER JOIN sales_shipments shipment
                    ON shipment.id =
                       shipment_item.shipment_id
                   AND shipment.company_id =
                       shipment_item.company_id
                  WHERE shipment_item.sales_order_line_id =
                        line.id
                    AND shipment_item.company_id =
                        line.company_id
                    AND shipment.status NOT IN (
                      'cancelled',
                      'failed'
                    )
                    AND shipment.inventory_posted_at IS NULL
                ),
                0
              ) AS planned_quantity
            FROM sales_order_items_v2 line
            WHERE line.id = $1
              AND line.sales_order_id = $2
              AND line.company_id = $3
            FOR UPDATE
          `,
          [
            lineId,
            orderId,
            context.companyId,
          ],
        );

      if (
        line.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'A shipment line does not belong to this sales order.',
        );
      }

      const remaining =
        Number(line.rows[0].quantity) -
        Number(line.rows[0].shipped_quantity || 0) -
        Number(line.rows[0].planned_quantity || 0);

      if (
        quantity >
          remaining +
            0.000001
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Shipment quantity exceeds the unassigned order quantity.',
          {
            lineId,
            remainingQuantity:
              Math.max(
                0,
                remaining,
              ),
          },
        );
      }

      prepared.push({
        lineId,
        quantity,
      });
    }

    const shipmentNumber =
      await nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'shipment',
      );

    const shipment =
      await client.query(
        `
          INSERT INTO sales_shipments (
            company_id,
            sales_order_id,
            shipment_number,
            status,
            carrier,
            service_level,
            tracking_number,
            tracking_url,
            metadata,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,'ready',
            $4,$5,$6,$7,$8::jsonb,$9,$9
          )
          RETURNING id
        `,
        [
          context.companyId,
          orderId,
          shipmentNumber,
          requestPayload.carrier,
          requestPayload.serviceLevel,
          requestPayload.trackingNumber,
          requestPayload.trackingUrl,
          JSON.stringify(
            idempotencyKey
              ? {
                  idempotencyKey,
                  requestFingerprint,
                }
              : {},
          ),
          context.userId,
        ],
      );

    const shipmentId =
      String(
        shipment.rows[0].id,
      );

    for (
      const item
      of prepared
    ) {
      await client.query(
        `
          INSERT INTO sales_shipment_items (
            company_id,
            shipment_id,
            sales_order_line_id,
            quantity
          )
          VALUES (
            $1,$2,$3,$4
          )
        `,
        [
          context.companyId,
          shipmentId,
          item.lineId,
          item.quantity,
        ],
      );
    }

    await recordOrderActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId,
        type:
          'sales.order.shipment.created',
        content:
          'Shipment ' +
          shipmentNumber +
          ' created.',
        metadata: {
          shipmentId,
          carrier:
            nullableText(
              input.carrier,
              180,
            ),
          trackingNumber:
            nullableText(
              input.trackingNumber,
              255,
            ),
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      shipmentId,
      shipmentNumber,
      status:
        'ready',
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

export async function updateSalesShipmentStatus(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .SHIPPING_MANAGE,
    );

  const shipmentId =
    requireUuid(
      input.shipmentId,
      'Shipment',
    );

  const nextStatus =
    cleanText(
      input.status,
      30,
    );

  if (
    ![
      'ready',
      'shipped',
      'in_transit',
      'delivered',
      'failed',
      'cancelled',
    ].includes(
      nextStatus,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid shipment status.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const shipmentOwner =
      await client.query(
        `
          SELECT sales_order_id
          FROM sales_shipments
          WHERE id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [
          shipmentId,
          context.companyId,
        ],
      );

    if (shipmentOwner.rows.length !== 1) {
      throw new SalesError(
        'INVALID_INPUT',
        'Shipment was not found.',
      );
    }

    const orderId =
      String(shipmentOwner.rows[0].sales_order_id);

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-invoice:' + orderId,
      ],
    );

    const shipment =
      await client.query(
        `
          SELECT
            *
          FROM sales_shipments
          WHERE id = $1
            AND company_id = $2
          FOR UPDATE
        `,
        [
          shipmentId,
          context.companyId,
        ],
      );

    if (shipment.rows.length !== 1) {
      throw new SalesError(
        'INVALID_INPUT',
        'Shipment was not found.',
      );
    }

    const row =
      shipment.rows[0];

    if (String(row.sales_order_id) !== orderId) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Shipment order linkage changed while the action was being prepared. Reload and retry.',
      );
    }

    const parentOrder =
      await client.query(
        `
          SELECT status
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

    if (parentOrder.rows.length !== 1) {
      throw new SalesError(
        'ORDER_NOT_FOUND',
        'The sales order for this shipment was not found.',
      );
    }

    const parentOrderStatus =
      String(parentOrder.rows[0].status);

    if (
      ['cancelled', 'closed'].includes(parentOrderStatus) &&
      !['cancelled', 'failed'].includes(nextStatus)
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A shipment for a cancelled or closed sales order cannot be dispatched or delivered. Cancel the unshipped shipment instead.',
      );
    }

    if (
      String(
        row.status,
      ) ===
        'cancelled' ||
      String(
        row.status,
      ) ===
        'delivered'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This shipment is already final.',
      );
    }

    if (row.inventory_posted_at && nextStatus === 'ready') {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A dispatched shipment cannot return to ready status. Use a Sales return to reverse stock if the goods came back.',
      );
    }

    if (
      nextStatus ===
        'cancelled' &&
      row.inventory_posted_at
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A posted shipment cannot be cancelled. Use a Sales return to reverse delivered stock.',
      );
    }

    if (
      nextStatus === 'failed' &&
      row.inventory_posted_at
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A shipment with posted stock movement cannot be marked failed. Reconcile the Inventory movement first; use the Sales return process when goods have been received back.',
      );
    }

    const shouldPost =
      [
        'shipped',
        'in_transit',
        'delivered',
      ].includes(nextStatus) &&
      !row.inventory_posted_at;

    const shouldRecordDelivery =
      nextStatus === 'delivered' &&
      String(row.status) !== 'delivered';

    if (shouldPost || shouldRecordDelivery) {
      const items = await client.query(
        `
          SELECT
            line.id AS sales_order_line_id,
            shipment_totals.quantity,
            line.quantity AS ordered_quantity,
            line.shipped_quantity,
            line.delivered_quantity,
            line.external_product_id,
            line.stock_reservation_id
          FROM (
            SELECT
              sales_order_line_id,
              company_id,
              SUM(quantity) AS quantity
            FROM sales_shipment_items
            WHERE shipment_id = $1
              AND company_id = $2
            GROUP BY sales_order_line_id, company_id
          ) shipment_totals
          INNER JOIN sales_order_items_v2 line
            ON line.id = shipment_totals.sales_order_line_id
           AND line.company_id = shipment_totals.company_id
          ORDER BY line.id
          FOR UPDATE OF line
        `,
        [shipmentId, context.companyId],
      );

      if (items.rows.length === 0) {
        throw new SalesError(
          'QUOTE_STATE_INVALID',
          'This shipment has no valid sales-order lines to fulfill.',
        );
      }

      for (const item of items.rows) {
        const quantity = Number(item.quantity || 0);
        const orderedQuantity = Number(item.ordered_quantity || 0);
        const previousShippedQuantity = Number(item.shipped_quantity || 0);
        const previousDeliveredQuantity = Number(item.delivered_quantity || 0);
        let nextShippedQuantity = previousShippedQuantity;

        if (shouldPost) {
          nextShippedQuantity = previousShippedQuantity + quantity;
          if (nextShippedQuantity > orderedQuantity + 0.000001) {
            throw new SalesError(
              'INVALID_INPUT',
              'Shipment would exceed the ordered quantity for a sales-order line.',
            );
          }

          const inventoryResult = await postSalesFulfillmentToInventory(
            client,
            {
              companyId: context.companyId,
              userId: context.userId,
              orderId: String(row.sales_order_id),
              lineId: String(item.sales_order_line_id),
              orderedQuantity,
              quantityDelta: quantity,
              nextFulfilledQuantity: nextShippedQuantity,
              externalProductId: item.external_product_id
                ? String(item.external_product_id)
                : null,
              reservationId: item.stock_reservation_id
                ? String(item.stock_reservation_id)
                : null,
            },
          );

          if (!inventoryResult.integrated) {
            throw new SalesError(
              'INVENTORY_INTEGRATION_UNAVAILABLE',
              'Inventory could not record this dispatch. Check the product mapping, warehouse, reservation and Inventory availability, then retry the shipment.',
              inventoryResult,
            );
          }

          await client.query(
            `
              UPDATE sales_order_items_v2
              SET shipped_quantity = $4
              WHERE id = $1
                AND sales_order_id = $2
                AND company_id = $3
            `,
            [item.sales_order_line_id, row.sales_order_id, context.companyId, nextShippedQuantity],
          );
        }

        if (shouldRecordDelivery) {
          const nextDeliveredQuantity = previousDeliveredQuantity + quantity;
          if (
            nextDeliveredQuantity > orderedQuantity + 0.000001 ||
            nextDeliveredQuantity > nextShippedQuantity + 0.000001
          ) {
            throw new SalesError(
              'INVALID_INPUT',
              'A shipment cannot be recorded as delivered before it has been dispatched, or for more than the ordered quantity.',
            );
          }

          await client.query(
            `
              UPDATE sales_order_items_v2
              SET delivered_quantity = $4
              WHERE id = $1
                AND sales_order_id = $2
                AND company_id = $3
            `,
            [item.sales_order_line_id, row.sales_order_id, context.companyId, nextDeliveredQuantity],
          );
        }
      }

      await recalculateOrderFulfillment(
        client,
        {
          companyId: context.companyId,
          orderId: String(row.sales_order_id),
          userId: context.userId,
        },
      );
    }

    const deliveredAt =
      nextStatus ===
        'delivered'
        ? new Date()
        : null;

    await client.query(
      `
        UPDATE sales_shipments
        SET
          status = $3,
          carrier =
            COALESCE(
              $4,
              carrier
            ),
          service_level =
            COALESCE(
              $5,
              service_level
            ),
          tracking_number =
            COALESCE(
              $6,
              tracking_number
            ),
          tracking_url =
            COALESCE(
              $7,
              tracking_url
            ),
          recipient_name =
            COALESCE(
              $8,
              recipient_name
            ),
          proof_note =
            COALESCE(
              $9,
              proof_note
            ),
          shipped_at =
            CASE
              WHEN $3 IN (
                'shipped',
                'in_transit',
                'delivered'
              )
              THEN COALESCE(
                shipped_at,
                NOW()
              )
              ELSE shipped_at
            END,
          delivered_at =
            CASE
              WHEN $3 =
                   'delivered'
              THEN COALESCE(
                delivered_at,
                $10
              )
              ELSE delivered_at
            END,
          inventory_posted_at =
            CASE
              WHEN $11 = TRUE
              THEN COALESCE(
                inventory_posted_at,
                NOW()
              )
              ELSE inventory_posted_at
            END,
          updated_by = $12,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        shipmentId,
        context.companyId,
        nextStatus,
        nullableText(
          input.carrier,
          180,
        ),
        nullableText(
          input.serviceLevel,
          180,
        ),
        nullableText(
          input.trackingNumber,
          255,
        ),
        nullableText(
          input.trackingUrl,
          4000,
        ),
        nullableText(
          input.recipientName,
          255,
        ),
        nullableText(
          input.proofNote,
          4000,
        ),
        deliveredAt,
        shouldPost,
        context.userId,
      ],
    );

    await recordOrderActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId:
          String(
            row.sales_order_id,
          ),
        type:
          'sales.order.shipment.status_changed',
        content:
          'Shipment ' +
          String(
            row.shipment_number,
          ) +
          ' changed to ' +
          nextStatus +
          '.',
        metadata: {
          shipmentId,
          fromStatus:
            String(
              row.status,
            ),
          toStatus:
            nextStatus,
          inventoryPosted:
            shouldPost,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      shipmentId,
      status:
        nextStatus,
      inventoryPosted:
        Boolean(
          row.inventory_posted_at ||
          shouldPost,
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

type SalesReturnCreateDependencies = {
  nextSalesNumber: typeof nextSalesNumber;
};

const defaultSalesReturnCreateDependencies: SalesReturnCreateDependencies = {
  nextSalesNumber,
};

export async function createSalesReturnTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesReturnCreateDependencies> = {},
) {
const orderId =
    requireUuid(
      input.orderId,
      'Sales order',
    );

  const reason =
    cleanText(
      input.reason,
      4000,
    );

  if (
    !reason
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A return reason is required.',
    );
  }

  const requested =
    Array.isArray(
      input.lines,
    )
      ? input.lines
      : [];

  if (
    requested.length <
      1 ||
    requested.length >
      200
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose at least one delivered sales-order line to return.',
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
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-invoice:' + orderId,
      ],
    );

    const order =
      await client.query(
        `
          SELECT
            status,
            order_number
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

    if (
      String(
        order.rows[0]
          .status,
      ) ===
        'cancelled'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'A cancelled sales order cannot receive a return.',
      );
    }

    const prepared:
      Array<{
        lineId:
          string;
        quantity:
          number;
      }> =
        [];
    const preparedLineIds =
      new Set<string>();

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
          'A return line is invalid.',
        );
      }

      const item =
        raw as
          Record<
            string,
            unknown
          >;

      const lineId =
        requireUuid(
          item.lineId,
          'Sales order line',
        ).toLowerCase();

      if (preparedLineIds.has(lineId)) {
        throw new SalesError(
          'INVALID_INPUT',
          'A sales-order line can only be selected once for a return.',
        );
      }
      preparedLineIds.add(lineId);

      const quantity =
        numberInput(
          item.quantity,
          'Return quantity',
          {
            min:
              0.0001,
            max:
              1_000_000,
          },
        );

      const line =
        await client.query(
          `
            SELECT
              line.delivered_quantity,
              COALESCE(
                (
                  SELECT SUM(
                    return_item.quantity
                  )
                  FROM sales_return_items return_item
                  INNER JOIN sales_returns return_row
                    ON return_row.id =
                       return_item.return_id
                   AND return_row.company_id =
                       return_item.company_id
                  WHERE return_item.sales_order_line_id =
                        line.id
                    AND return_item.company_id =
                        line.company_id
                    AND return_row.status IN (
                      'requested',
                      'approved'
                    )
                ),
                0
              ) AS pending_return_quantity
            FROM sales_order_items_v2 line
            WHERE line.id = $1
              AND line.sales_order_id = $2
              AND line.company_id = $3
            FOR UPDATE
          `,
          [
            lineId,
            orderId,
            context.companyId,
          ],
        );

      if (
        line.rows.length !==
          1
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'A return line does not belong to this sales order.',
        );
      }

      const available =
        Number(
          line.rows[0]
            .delivered_quantity ||
          0,
        ) -
        Number(
          line.rows[0]
            .pending_return_quantity ||
          0,
        );

      if (
        quantity >
          available +
            0.000001
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Return quantity exceeds the delivered quantity still available to return.',
          {
            lineId,
            availableQuantity:
              Math.max(
                0,
                available,
              ),
          },
        );
      }

      prepared.push({
        lineId,
        quantity,
      });
    }

    const returnNumber =
      await deps.nextSalesNumber(
        client,
        context.companyId,
        context.userId,
        'return',
      );

    const created =
      await client.query(
        `
          INSERT INTO sales_returns (
            company_id,
            sales_order_id,
            return_number,
            status,
            reason,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,
            'requested',
            $4,$5,$5
          )
          RETURNING id
        `,
        [
          context.companyId,
          orderId,
          returnNumber,
          reason,
          context.userId,
        ],
      );

    const returnId =
      String(
        created.rows[0].id,
      );

    for (
      const item
      of prepared
    ) {
      await client.query(
        `
          INSERT INTO sales_return_items (
            company_id,
            return_id,
            sales_order_line_id,
            quantity
          )
          VALUES (
            $1,$2,$3,$4
          )
        `,
        [
          context.companyId,
          returnId,
          item.lineId,
          item.quantity,
        ],
      );
    }

    await recordOrderActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId,
        type:
          'sales.order.return.requested',
        content:
          'Return ' +
          returnNumber +
          ' requested.',
        metadata: {
          returnId,
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      returnId,
      returnNumber,
      status:
        'requested',
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


export async function createSalesReturn(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.RETURN_MANAGE);
  return createSalesReturnTransaction(input, context);
}

export async function approveSalesReturnTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
) {
const returnId =
    requireUuid(
      input.returnId,
      'Sales return',
    );

  const result =
    await context.pool.query(
      `
        UPDATE sales_returns
        SET
          status = 'approved',
          approved_at = NOW(),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'requested'
        RETURNING
          id,
          sales_order_id,
          return_number
      `,
      [
        returnId,
        context.companyId,
        context.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_STATE_INVALID',
      'Only a requested return can be approved.',
    );
  }

  return {
    returnId,
    status:
      'approved',
  };
}


export async function approveSalesReturn(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.RETURN_MANAGE);
  return approveSalesReturnTransaction(input, context);
}

export async function receiveSalesReturnTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
) {
const returnId =
    requireUuid(
      input.returnId,
      'Sales return',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const returnResult =
      await client.query(
        `
          SELECT
            id,
            sales_order_id,
            return_number,
            status
          FROM sales_returns
          WHERE id = $1
            AND company_id = $2
          FOR UPDATE
        `,
        [
          returnId,
          context.companyId,
        ],
      );

    if (
      returnResult.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Sales return was not found.',
      );
    }

    const returnRow =
      returnResult.rows[0];

    if (
      String(
        returnRow.status,
      ) !==
        'approved'
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Approve the Sales return before receiving returned goods.',
      );
    }

    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtext($1)
        )
      `,
      [
        'sales-order-invoice:' +
        String(returnRow.sales_order_id),
      ],
    );

    const items =
      await client.query(
        `
          SELECT
            return_item.id,
            return_item.sales_order_line_id,
            return_item.quantity,
            line.quantity
              AS ordered_quantity,
            line.shipped_quantity,
            line.delivered_quantity,
            line.returned_quantity,
            line.external_product_id,
            line.stock_reservation_id
          FROM sales_return_items return_item
          INNER JOIN sales_order_items_v2 line
            ON line.id =
               return_item.sales_order_line_id
           AND line.company_id =
               return_item.company_id
          WHERE return_item.return_id = $1
            AND return_item.company_id = $2
          ORDER BY
            return_item.id
          FOR UPDATE OF line
        `,
        [
          returnId,
          context.companyId,
        ],
      );

    for (
      const item
      of items.rows
    ) {
      const previous =
        Number(
          item.delivered_quantity ||
          0,
        );

      const quantity =
        Number(
          item.quantity,
        );

      if (
        quantity >
          previous +
            0.000001
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'Returned quantity exceeds the quantity currently delivered for a sales-order line.',
        );
      }

      const next =
        Math.max(
          0,
          previous -
          quantity,
        );

      const inventoryResult = await postSalesFulfillmentToInventory(
        client,
        {
          companyId: context.companyId,
          userId: context.userId,
          orderId: String(returnRow.sales_order_id),
          lineId: String(item.sales_order_line_id),
          orderedQuantity: Number(item.ordered_quantity),
          quantityDelta: -quantity,
          nextFulfilledQuantity: Number(item.shipped_quantity || 0),
          externalProductId: item.external_product_id ? String(item.external_product_id) : null,
          reservationId: item.stock_reservation_id ? String(item.stock_reservation_id) : null,
        },
      );

      if (!inventoryResult.integrated) {
        throw new SalesError(
          'INVENTORY_INTEGRATION_UNAVAILABLE',
          'Inventory could not record the returned goods. Check the product mapping, warehouse, reservation and Inventory availability, then retry the return.',
          inventoryResult,
        );
      }

      await client.query(
        `
          UPDATE sales_order_items_v2
          SET
            delivered_quantity = $4,
            returned_quantity =
              returned_quantity +
              $5
          WHERE id = $1
            AND sales_order_id = $2
            AND company_id = $3
        `,
        [
          item.sales_order_line_id,
          returnRow
            .sales_order_id,
          context.companyId,
          next,
          quantity,
        ],
      );
    }

    await recalculateOrderFulfillment(
      client,
      {
        companyId:
          context.companyId,
        orderId:
          String(
            returnRow
              .sales_order_id,
          ),
        userId:
          context.userId,
      },
    );

    await client.query(
      `
        UPDATE sales_returns
        SET
          status = 'received',
          received_at = NOW(),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        returnId,
        context.companyId,
        context.userId,
      ],
    );

    await recordOrderActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        orderId:
          String(
            returnRow
              .sales_order_id,
          ),
        type:
          'sales.order.return.received',
        content:
          'Return ' +
          String(
            returnRow
              .return_number,
          ) +
          ' received into Inventory.',
        metadata: {
          returnId,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      returnId,
      status:
        'received',
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


export async function receiveSalesReturn(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.RETURN_MANAGE);
  return receiveSalesReturnTransaction(input, context);
}

type SalesReturnCreditDependencies = {
  issueInvoiceCreditNote: typeof issueInvoiceCreditNote;
};

const defaultSalesReturnCreditDependencies: SalesReturnCreditDependencies = {
  issueInvoiceCreditNote,
};

export async function issueSalesReturnCreditTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesReturnCreditDependencies> = {},
) {
const returnId = requireUuid(input.returnId, 'Sales return').toLowerCase();

  // Serialize the complete return-credit workflow. Invoicing writes the credit
  // note in its own transaction, so a retry must not race another request for
  // the same return while either request is recovering the Sales-side records.
  const serializationClient = await context.pool.connect();
  const lockParameters = [
    context.companyId,
    'sales-return-credit:' + returnId,
  ];
  try {
    await serializationClient.query(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      lockParameters,
    );
  } catch (error) {
    serializationClient.release();
    throw error;
  }

  try {

    const returnResult =
      await serializationClient.query(
        `
          SELECT
            id,
            sales_order_id,
            return_number,
            reason,
            status
          FROM sales_returns
          WHERE id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [
          returnId,
          context.companyId,
        ],
      );

    if (
      returnResult.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Sales return was not found.',
      );
    }

    const returnRow =
      returnResult.rows[0];

    if (
      ![
        'received',
        'credited',
        'partially_refunded',
        'refunded',
      ].includes(
        String(
          returnRow.status,
        ),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Receive returned goods before issuing invoice credit.',
      );
    }

    const returnItems =
      await context.pool.query(
        `
          SELECT
            item.id,
            item.sales_order_line_id,
            item.quantity,
            line.invoiced_quantity,
            line.credited_quantity
          FROM sales_return_items item
          INNER JOIN sales_order_items_v2 line
            ON line.id =
               item.sales_order_line_id
           AND line.company_id =
               item.company_id
          WHERE item.return_id = $1
            AND item.company_id = $2
          ORDER BY
            item.id
        `,
        [
          returnId,
          context.companyId,
        ],
      );

    type CreditLine = {
      returnItemId:
        string;
      orderLineId:
        string;
      invoiceItemId:
        string;
      quantity:
        number;
    };

    const byInvoice =
      new Map<
        string,
        CreditLine[]
      >();

    for (
      const returnItem
      of returnItems.rows
    ) {
      let remaining =
        Number(
          returnItem.quantity,
        );

      let mappedQuantity =
        0;

      const expectedCreditQuantity =
        Math.min(
          Number(
            returnItem.quantity,
          ),
          Math.max(
            0,
            Number(
              returnItem
                .invoiced_quantity ||
              0,
            ) -
            Number(
              returnItem
                .credited_quantity ||
              0,
            ),
          ),
        );

      const invoiceItems =
        await context.pool.query(
          `
            SELECT
              invoice_item.id,
              invoice_item.invoice_id,
              invoice_item.quantity,
              COALESCE(
                (
                  SELECT SUM(
                    credit_item.quantity
                  )
                  FROM invoicing_credit_note_items credit_item
                  INNER JOIN invoicing_credit_notes credit
                    ON credit.id =
                       credit_item.credit_note_id
                   AND credit.company_id =
                       credit_item.company_id
                  WHERE credit_item.invoice_item_id =
                        invoice_item.id
                    AND credit_item.company_id =
                        invoice_item.company_id
                    AND credit.status <>
                        'cancelled'
                    AND credit.deleted_at
                        IS NULL
                    AND COALESCE(
                      credit.idempotency_key,
                      ''
                    ) <> (
                      'sales-return:' ||
                      $4::text ||
                      ':invoice:' ||
                      invoice_item.invoice_id::text
                    )
                ),
                0
              ) AS credited_quantity,
              invoice.invoice_date
            FROM invoicing_invoice_items invoice_item
            INNER JOIN invoicing_invoices invoice
              ON invoice.id =
                 invoice_item.invoice_id
             AND invoice.company_id =
                 invoice_item.company_id
            WHERE invoice_item.company_id = $1
              AND invoice_item.metadata ->>
                  'sourceModule' =
                  'sales'
              AND invoice_item.metadata ->>
                  'salesOrderId' =
                  $2
              AND invoice_item.metadata ->>
                  'salesOrderLineId' =
                  $3
              AND invoice.deleted_at IS NULL
              AND invoice.status NOT IN (
                'draft',
                'pending_approval',
                'rejected',
                'cancelled',
                'void',
                'written_off'
              )
            ORDER BY
              invoice.invoice_date,
              invoice_item.sort_order,
              invoice_item.id
          `,
          [
            context.companyId,
            String(
              returnRow
                .sales_order_id,
            ),
            String(
              returnItem
                .sales_order_line_id,
            ),
            returnId,
          ],
        );

      for (
        const invoiceItem
        of invoiceItems.rows
      ) {
        if (
          remaining <=
            0.000001
        ) {
          break;
        }

        const available =
          Math.max(
            0,
            Number(
              invoiceItem.quantity,
            ) -
            Number(
              invoiceItem
                .credited_quantity ||
              0,
            ),
          );

        if (
          available <=
            0.000001
        ) {
          continue;
        }

        const quantity =
          Math.min(
            remaining,
            available,
          );

        const invoiceId =
          String(
            invoiceItem
              .invoice_id,
          );

        const lines =
          byInvoice.get(
            invoiceId,
          ) ||
          [];

        lines.push({
          returnItemId:
            String(
              returnItem.id,
            ),
          orderLineId:
            String(
              returnItem
                .sales_order_line_id,
            ),
          invoiceItemId:
            String(
              invoiceItem.id,
            ),
          quantity,
        });

        byInvoice.set(
          invoiceId,
          lines,
        );

        remaining -=
          quantity;

        mappedQuantity +=
          quantity;
      }

      if (
        expectedCreditQuantity >
          0.000001 &&
        mappedQuantity +
          0.000001 <
          expectedCreditQuantity
      ) {
        throw new SalesError(
          'RETURN_CREDIT_LINK_MISSING',
          'This return includes quantities invoiced before Sales line-source tracking was enabled. Issue the unmatched credit from Invoicing manually; SaMi will not guess the invoice line mapping.',
          {
            salesOrderLineId:
              String(
                returnItem
                  .sales_order_line_id,
              ),
            expectedCreditQuantity,
            mappedQuantity,
          },
        );
      }
    }

    const createdCredits:
      Array<{
        invoiceId:
          string;
        creditNoteId:
          string;
        creditNoteNumber:
          string;
        amount:
          number;
        availableCredit:
          number;
      }> =
        [];

    for (
      const [
        invoiceId,
        lines,
      ] of byInvoice
    ) {
      const credit =
        await deps.issueInvoiceCreditNote({
          invoiceId,
          reason:
            'Sales return ' +
            String(
              returnRow
                .return_number,
            ) +
            ': ' +
            String(
              returnRow.reason,
            ),
          idempotencyKey:
            (
              'sales-return:' +
              returnId +
              ':invoice:' +
              invoiceId
            ).slice(
              0,
              120,
            ),
          items:
            lines.map(
              line => ({
                invoiceItemId:
                  line.invoiceItemId,
                quantity:
                  line.quantity,
              }),
            ),
        });

      // Invoice credit creation is independently idempotent. Persist the Sales-side
      // allocation rows and counters atomically so a retry can repair a failed
      // local save without incrementing a quantity for an existing allocation.
      const client = serializationClient;
      let returnCreditId = "";
      try {
        await client.query('BEGIN');

        const saved = await client.query(
          `
            INSERT INTO sales_return_credits (
              company_id,
              return_id,
              invoice_id,
              credit_note_id,
              credit_note_number,
              amount,
              available_credit,
              refunded_amount,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,0,$8,$8
            )
            ON CONFLICT (
              return_id,
              invoice_id
            )
            DO UPDATE SET
              credit_note_id =
                EXCLUDED.credit_note_id,
              credit_note_number =
                EXCLUDED.credit_note_number,
              amount =
                EXCLUDED.amount,
              available_credit =
                EXCLUDED.available_credit,
              updated_by =
                EXCLUDED.updated_by,
              updated_at =
                NOW()
            RETURNING id
          `,
          [
            context.companyId,
            returnId,
            invoiceId,
            credit.id,
            credit.creditNoteNumber,
            credit.amount,
            credit.availableCredit,
            context.userId,
          ],
        );

        returnCreditId = String(saved.rows[0].id);

        for (const line of lines) {
          const allocation = await client.query(
            `
              INSERT INTO sales_return_credit_items (
                company_id,
                return_credit_id,
                return_item_id,
                invoice_item_id,
                quantity
              )
              VALUES (
                $1,$2,$3,$4,$5
              )
              ON CONFLICT (
                return_credit_id,
                return_item_id,
                invoice_item_id
              )
              DO NOTHING
              RETURNING id
            `,
            [
              context.companyId,
              returnCreditId,
              line.returnItemId,
              line.invoiceItemId,
              line.quantity,
            ],
          );

          // Only newly persisted allocations advance this aggregate. An idempotent
          // retry sees the existing allocation and leaves credited_quantity alone.
          if (allocation.rows.length > 0) {
            await client.query(
              `
                UPDATE sales_order_items_v2
                SET
                  credited_quantity =
                    LEAST(
                      returned_quantity,
                      credited_quantity + $4
                    )
                WHERE id = $1
                  AND sales_order_id = $2
                  AND company_id = $3
              `,
              [
                line.orderLineId,
                returnRow.sales_order_id,
                context.companyId,
                line.quantity,
              ],
            );
          }
        }

        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {}
        throw error;
      } finally {
        // The session-level return-credit lock remains held until the outer finally.
      }

      createdCredits.push({
        invoiceId,
        creditNoteId:
          credit.id,
        creditNoteNumber:
          credit.creditNoteNumber,
        amount:
          money(
            credit.amount,
          ),
        availableCredit:
          money(
            credit.availableCredit ??
            credit.amount,
          ),
      });
    }

    const returnState = await context.pool.query(
      `
        UPDATE sales_returns
        SET
          status = CASE
            WHEN status IN ('partially_refunded', 'refunded')
            THEN status
            WHEN $4::boolean
            THEN 'credited'
            ELSE status
          END,
          credited_at = CASE
            WHEN $4::boolean THEN COALESCE(credited_at, NOW())
            ELSE credited_at
          END,
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
        RETURNING status
      `,
      [
        returnId,
        context.companyId,
        context.userId,
        createdCredits.length > 0,
      ],
    );

    return {
      returnId,
      status:
        String(returnState.rows[0]?.status || returnRow.status),
      credits:
        createdCredits,
    };
  } finally {
    try {
      await serializationClient.query(
        'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
        lockParameters,
      );
    } catch {}
    serializationClient.release();
  }
}


export async function issueSalesReturnCredit(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.RETURN_MANAGE);
  return issueSalesReturnCreditTransaction(input, context);
}

type SalesReturnRefundDependencies = {
  refundInvoiceCreditNote: typeof refundInvoiceCreditNote;
};

const defaultSalesReturnRefundDependencies: SalesReturnRefundDependencies = {
  refundInvoiceCreditNote,
};

export async function refundSalesReturnCreditTransaction(
  input: Record<string, unknown>,
  context: Awaited<ReturnType<typeof requireSalesContext>>,
  overrides: Partial<SalesReturnRefundDependencies> = {},
) {
const returnCreditId =
    requireUuid(
      input.returnCreditId,
      'Sales return credit',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          credit.id,
          credit.return_id,
          credit.credit_note_id,
          credit.available_credit,
          credit.refunded_amount,
          return_row.status
        FROM sales_return_credits credit
        INNER JOIN sales_returns return_row
          ON return_row.id =
             credit.return_id
         AND return_row.company_id =
             credit.company_id
        WHERE credit.id = $1
          AND credit.company_id = $2
        LIMIT 1
      `,
      [
        returnCreditId,
        context.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Sales return credit was not found.',
    );
  }

  const returnId = String(result.rows[0].return_id).toLowerCase();
  const serializationClient = await context.pool.connect();
  const lockParameters = [
    context.companyId,
    'sales-return-credit:' + returnId,
  ];
  try {
    await serializationClient.query(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      lockParameters,
    );
  } catch (error) {
    serializationClient.release();
    throw error;
  }

  try {
    const freshResult = await serializationClient.query(
      `
        SELECT
          credit.id,
          credit.return_id,
          credit.credit_note_id,
          credit.available_credit,
          credit.refunded_amount,
          return_row.status
        FROM sales_return_credits credit
        INNER JOIN sales_returns return_row
          ON return_row.id = credit.return_id
         AND return_row.company_id = credit.company_id
        WHERE credit.id = $1
          AND credit.company_id = $2
          AND credit.return_id = $3
        LIMIT 1
      `,
      [returnCreditId, context.companyId, returnId],
    );

    if (freshResult.rows.length !== 1) {
      throw new SalesError('INVALID_INPUT', 'Sales return credit changed while the refund was waiting. Reload and retry.');
    }

    const row = freshResult.rows[0];

    const available =
      money(row.available_credit);

    const callerKey = cleanText(input.idempotencyKey, 80);
    // Hash the full caller key so values that differ after character 56 never
    // collapse to the same database idempotency key. The compact key plus the
    // Invoicing prefix stays within 120 characters.
    const suppliedRefundKey = callerKey
      ? salesReturnRefundIdempotencyKey(returnCreditId, callerKey)
      : null;
    // Older versions stored a truncated, readable key. Keep looking it up so
    // an in-flight/previously committed refund is recovered instead of replayed.
    const legacyRefundKey = callerKey
      ? legacySalesReturnRefundIdempotencyKey(returnCreditId, callerKey)
      : null;

    // A retry may arrive after Invoicing has committed the refund and Sales has
    // repaired its cached balance. Recover the existing operation before
    // rejecting its original amount against that now-lower balance.
    let priorRefund: { amount: unknown; idempotency_key: unknown } | null = null;
    if (suppliedRefundKey && legacyRefundKey) {
      const priorRefundResult = await context.pool.query(
        `
          SELECT amount, idempotency_key
          FROM invoicing_credit_note_refunds
          WHERE company_id = $1
            AND credit_note_id = $2
            AND idempotency_key IN ($3, $4)
          ORDER BY CASE WHEN idempotency_key = $4 THEN 0 ELSE 1 END
          LIMIT 1
        `,
        [
          context.companyId,
          String(row.credit_note_id),
          'credit-refund:' + legacyRefundKey,
          'credit-refund:' + suppliedRefundKey,
        ],
      );
      priorRefund = priorRefundResult.rows[0] || null;
    }
    const refundOperationKey = priorRefund
      ? String(priorRefund.idempotency_key).slice('credit-refund:'.length)
      : suppliedRefundKey;

    const hasRequestedAmount =
      input.amount !== undefined &&
      input.amount !== null &&
      input.amount !== '';
    const requestedAmount = hasRequestedAmount
      ? numberInput(input.amount, 'Refund amount', { min: 0.0001 })
      : null;
    const amount = priorRefund
      ? money(priorRefund.amount)
      : requestedAmount ?? available;

    if (
      priorRefund &&
      requestedAmount !== null &&
      Math.abs(requestedAmount - amount) > 0.0001
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'This refund idempotency key was already used with a different amount.',
        { recordedAmount: amount },
      );
    }

    if (
      amount <= 0 ||
      (!priorRefund && amount > available + 0.0001)
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Refund amount exceeds the customer credit available from this return.',
        { availableCredit: available },
      );
    }

    const refund =
      await deps.refundInvoiceCreditNote({
        creditNoteId:
          String(
            row.credit_note_id,
          ),
        amount,
        method:
          input.method,
        reference:
          input.reference,
        reason:
          cleanText(
            input.reason,
            2000,
          ) ||
          'Refund for Sales return',
        idempotencyKey:
          refundOperationKey ||
          (
            'sales-return-credit:' +
            returnCreditId +
            ':refund:' +
            available.toFixed(2) +
            ':' +
            amount.toFixed(2)
          ).slice(0, 106),
        metadata: {
          sourceModule:
            'sales',
          salesReturnId:
            String(
              row.return_id,
            ),
          salesReturnCreditId:
            returnCreditId,
        },
      });

    const authoritative =
      await context.pool.query(
        `
          SELECT
            balance.available_amount,
            COALESCE(
              SUM(
                CASE
                  WHEN refund_row.status = 'posted'
                  THEN refund_row.amount
                  ELSE 0
                END
              ),
              0
            ) AS refunded_amount
          FROM invoicing_credit_note_balances balance
          LEFT JOIN invoicing_credit_note_refunds refund_row
            ON refund_row.credit_note_id =
               balance.credit_note_id
           AND refund_row.company_id =
               balance.company_id
          WHERE balance.company_id = $1
            AND balance.credit_note_id = $2
          GROUP BY
            balance.available_amount
          LIMIT 1
        `,
        [
          context.companyId,
          String(
            row.credit_note_id,
          ),
        ],
      );

    const availableAfter =
      money(
        authoritative.rows[0]
          ?.available_amount ??
        refund.availableCredit ??
        Math.max(
          0,
          available -
          amount,
        ),
      );

    const authoritativeRefunded =
      money(
        authoritative.rows[0]
          ?.refunded_amount ??
        (
          money(
            row.refunded_amount,
          ) +
          (
            refund.duplicate
              ? 0
              : amount
          )
        ),
      );

    await context.pool.query(
      `
        UPDATE sales_return_credits
        SET
          available_credit = $3,
          refunded_amount = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        returnCreditId,
        context.companyId,
        availableAfter,
        authoritativeRefunded,
        context.userId,
      ],
    );

    const balances =
      await context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(available_credit),
              0
            ) AS available_credit,
            COALESCE(
              SUM(refunded_amount),
              0
            ) AS refunded_amount
          FROM sales_return_credits
          WHERE return_id = $1
            AND company_id = $2
        `,
        [
          row.return_id,
          context.companyId,
        ],
      );

    const remaining =
      money(
        balances.rows[0]
          ?.available_credit,
      );

    const refundedAmount =
      money(
        balances.rows[0]
          ?.refunded_amount,
      );

    const nextStatus =
      refundedAmount <= 0.0001
        ? 'credited'
        : remaining <= 0.0001
          ? 'refunded'
          : 'partially_refunded';

    await context.pool.query(
      `
        UPDATE sales_returns
        SET
          status = $3,
          refunded_at =
            CASE
              WHEN $3 =
                   'refunded'
              THEN COALESCE(
                refunded_at,
                NOW()
              )
              ELSE refunded_at
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        row.return_id,
        context.companyId,
        nextStatus,
        context.userId,
      ],
    );

    return {
      returnCreditId,
      returnId:
        String(
          row.return_id,
        ),
      status:
        nextStatus,
      refundId:
        refund.refundId,
      refundNumber:
        refund.refundNumber,
      amount:
        refund.amount,
      availableCredit:
        availableAfter,
    };
  } finally {
    try {
      await serializationClient.query(
        'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
        lockParameters,
      );
    } catch {}
    serializationClient.release();
  }
}


export async function refundSalesReturnCredit(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.RETURN_MANAGE);
  return refundSalesReturnCreditTransaction(input, context);
}
