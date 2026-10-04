import 'server-only';

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

import {
  cleanText,
  money,
  nextSalesNumber,
  nullableText,
  numberInput,
  optionalUuid,
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
                order_row.order_number
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
                  COALESCE(
                    SUM(total_amount),
                    0
                  ) AS open_pipeline,
                  COALESCE(
                    SUM(
                      total_amount *
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
                    WHERE valid_until IS NOT NULL
                      AND valid_until BETWEEN
                          CURRENT_DATE
                          AND CURRENT_DATE + 7
                  ) AS expiring_7_days
                FROM sales_quotes
                WHERE company_id = $1
                  AND deleted_at IS NULL
                  AND status IN (
                    'draft',
                    'sent',
                    'viewed',
                    'accepted'
                  )
                  AND (
                    valid_until IS NULL
                    OR valid_until <=
                       CURRENT_DATE +
                       $2::int
                  )
              ),
              committed AS (
                SELECT
                  COALESCE(
                    SUM(
                      subtotal -
                      discount_total
                    ),
                    0
                  ) AS committed_orders,
                  COUNT(*) AS order_count
                FROM sales_orders_v2
                WHERE company_id = $1
                  AND deleted_at IS NULL
                  AND status =
                      'confirmed'
                  AND invoice_status <>
                      'invoiced'
              )
              SELECT
                quote_pipeline.open_pipeline,
                quote_pipeline.weighted_pipeline,
                quote_pipeline.expiring_7_days,
                committed.committed_orders,
                committed.order_count,
                quote_pipeline.weighted_pipeline +
                  committed.committed_orders
                  AS expected_revenue
              FROM quote_pipeline,
                   committed
            `,
            [
              context.companyId,
              horizonDays,
            ],
          )
        : Promise.resolve({
            rows: [
              {
                open_pipeline:
                  0,
                weighted_pipeline:
                  0,
                expiring_7_days:
                  0,
                committed_orders:
                  0,
                order_count:
                  0,
                expected_revenue:
                  0,
              },
            ],
          }),
    ]);

  const forecastRow =
    forecast.rows[0] ||
    {};

  const forecastData = {
    horizonDays,
    openPipeline:
      money(
        forecastRow
          .open_pipeline,
      ),
    weightedPipeline:
      money(
        forecastRow
          .weighted_pipeline,
      ),
    committedOrders:
      money(
        forecastRow
          .committed_orders,
      ),
    expectedRevenue:
      money(
        forecastRow
          .expected_revenue,
      ),
    expiring7Days:
      Number(
        forecastRow
          .expiring_7_days ||
        0,
      ),
    committedOrderCount:
      Number(
        forecastRow
          .order_count ||
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
          expiring7Days:
            forecastData
              .expiring7Days,
          committedOrderCount:
            forecastData
              .committedOrderCount,
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

  const orderResult =
    await context.pool.query(
      `
        SELECT
          o.*,
          q.billing_customer_id
        FROM sales_orders_v2 o
        LEFT JOIN sales_quotes q
          ON q.id = o.quote_id
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
    orderResult.rows.length !==
      1
  ) {
    throw new SalesError(
      'ORDER_NOT_FOUND',
      'Sales order was not found.',
    );
  }

  const order =
    orderResult.rows[0];

  if (
    String(
      order.status,
    ) ===
      'cancelled'
  ) {
    throw new SalesError(
      'QUOTE_STATE_INVALID',
      'A cancelled sales order cannot receive a deposit.',
    );
  }

  if (
    order.deposit_payment_id
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A deposit is already recorded for this sales order.',
    );
  }

  const customerId =
    await ensureOrderBillingCustomer({
      context,
      order,
    });

  const required =
    money(
      order.deposit_required_amount,
    );

  const amount =
    numberInput(
      input.amount ??
      required,
      'Deposit amount',
      {
        min:
          0.0001,
      },
    );

  if (
    required >
      0 &&
    Math.abs(
      amount -
      required,
    ) >
      0.0001
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'The recorded deposit must match the configured order deposit requirement.',
      {
        requiredAmount:
          required,
      },
    );
  }

  const key =
    cleanText(
      input.idempotencyKey,
      120,
    ) ||
    (
      'sales-order-' +
      orderId +
      '-deposit'
    );

  const deposit =
    await recordCustomerRetainer({
      customerId,
      amount,
      retainerType:
        'deposit',
      method:
        input.method,
      reference:
        input.reference,
      purpose:
        'Deposit for Sales order ' +
        String(
          order.order_number,
        ),
      expectedUseDate:
        input.expectedUseDate,
      receivedDate:
        input.receivedDate,
      idempotencyKey:
        key,
    });

  await context.pool.query(
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
    [
      orderId,
      context.companyId,
      deposit.retainerId,
      deposit.paymentId,
      deposit.amount,
      context.userId,
    ],
  );

  return {
    orderId,
    ...deposit,
    depositStatus:
      'received',
  };
}

export async function applySalesOrderDeposit(
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

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          o.deposit_payment_id,
          o.deposit_received_amount,
          batch.invoice_id,
          payment_balance.unapplied_amount,
          aging.balance_due
        FROM sales_orders_v2 o
        INNER JOIN sales_order_invoice_batches batch
          ON batch.sales_order_id = o.id
         AND batch.company_id =
             o.company_id
         AND batch.invoice_id = $3
         AND batch.status = 'created'
        LEFT JOIN invoicing_payment_balances payment_balance
          ON payment_balance.payment_id =
             o.deposit_payment_id
         AND payment_balance.company_id =
             o.company_id
        LEFT JOIN invoicing_aging aging
          ON aging.invoice_id =
             batch.invoice_id
         AND aging.company_id =
             o.company_id
        WHERE o.id = $1
          AND o.company_id = $2
          AND o.deleted_at IS NULL
        LIMIT 1
      `,
      [
        orderId,
        context.companyId,
        invoiceId,
      ],
    );

  if (
    result.rows.length !==
      1 ||
    !result.rows[0]
      .deposit_payment_id
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'This sales order has no recorded deposit available for that invoice.',
    );
  }

  const available =
    money(
      result.rows[0]
        .unapplied_amount,
    );

  const balance =
    money(
      result.rows[0]
        .balance_due,
    );

  const requested =
    input.amount ===
      undefined ||
    input.amount ===
      null ||
    input.amount ===
      ''
      ? Math.min(
          available,
          balance,
        )
      : numberInput(
          input.amount,
          'Deposit allocation amount',
          {
            min:
              0.0001,
          },
        );

  if (
    requested <=
      0 ||
    requested >
      available +
        0.0001 ||
    requested >
      balance +
        0.0001
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Deposit allocation must fit the unapplied deposit and invoice balance.',
      {
        availableDeposit:
          available,
        invoiceBalance:
          balance,
      },
    );
  }

  const allocation =
    await allocateInvoicePayment({
      paymentId:
        String(
          result.rows[0]
            .deposit_payment_id,
        ),
      invoiceId,
      amount:
        requested,
      operationKey:
        (
          'sales-order:' +
          orderId +
          ':deposit:' +
          invoiceId
        ).slice(
          0,
          160,
        ),
    });

  const nextStatus =
    allocation.unappliedAmount <=
      0.0001
      ? 'applied'
      : 'partially_applied';

  await context.pool.query(
    `
      UPDATE sales_orders_v2
      SET
        deposit_status = $3,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      orderId,
      context.companyId,
      nextStatus,
      context.userId,
    ],
  );

  return {
    orderId,
    invoiceId,
    depositStatus:
      nextStatus,
    ...allocation,
  };
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
        'A cancelled sales order cannot be shipped.',
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
          'A shipment line is invalid.',
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
        );

      const quantity =
        numberInput(
          item.quantity,
          'Shipment quantity',
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
              line.quantity,
              line.delivered_quantity,
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
                    AND shipment.status <>
                        'cancelled'
                    AND shipment.inventory_posted_at
                        IS NULL
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
        Number(
          line.rows[0]
            .quantity,
        ) -
        Number(
          line.rows[0]
            .delivered_quantity ||
          0,
        ) -
        Number(
          line.rows[0]
            .planned_quantity ||
          0,
        );

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
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,'ready',
            $4,$5,$6,$7,$8,$8
          )
          RETURNING id
        `,
        [
          context.companyId,
          orderId,
          shipmentNumber,
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

    if (
      shipment.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Shipment was not found.',
      );
    }

    const row =
      shipment.rows[0];

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

    const shouldPost =
      [
        'shipped',
        'in_transit',
        'delivered',
      ].includes(
        nextStatus,
      ) &&
      !row.inventory_posted_at;

    if (
      shouldPost
    ) {
      const items =
        await client.query(
          `
            SELECT
              shipment_item.id,
              shipment_item.sales_order_line_id,
              shipment_item.quantity,
              line.quantity
                AS ordered_quantity,
              line.delivered_quantity,
              line.external_product_id,
              line.stock_reservation_id
            FROM sales_shipment_items shipment_item
            INNER JOIN sales_order_items_v2 line
              ON line.id =
                 shipment_item.sales_order_line_id
             AND line.company_id =
                 shipment_item.company_id
            WHERE shipment_item.shipment_id = $1
              AND shipment_item.company_id = $2
            ORDER BY
              shipment_item.id
            FOR UPDATE OF line
          `,
          [
            shipmentId,
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

        const next =
          previous +
          Number(
            item.quantity,
          );

        if (
          next >
            Number(
              item.ordered_quantity,
            ) +
              0.000001
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Shipment would exceed the ordered quantity for a sales-order line.',
          );
        }

        await postSalesFulfillmentToInventory(
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
            lineId:
              String(
                item.sales_order_line_id,
              ),
            orderedQuantity:
              Number(
                item.ordered_quantity,
              ),
            previousDeliveredQuantity:
              previous,
            nextDeliveredQuantity:
              next,
            externalProductId:
              item.external_product_id
                ? String(
                    item.external_product_id,
                  )
                : null,
            reservationId:
              item.stock_reservation_id
                ? String(
                    item.stock_reservation_id,
                  )
                : null,
          },
        );

        await client.query(
          `
            UPDATE sales_order_items_v2
            SET
              delivered_quantity = $4
            WHERE id = $1
              AND sales_order_id = $2
              AND company_id = $3
          `,
          [
            item.sales_order_line_id,
            row.sales_order_id,
            context.companyId,
            next,
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
              row.sales_order_id,
            ),
          userId:
            context.userId,
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

export async function createSalesReturn(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .RETURN_MANAGE,
    );

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
        );

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
      await nextSalesNumber(
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

export async function approveSalesReturn(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .RETURN_MANAGE,
    );

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

export async function receiveSalesReturn(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .RETURN_MANAGE,
    );

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

    const items =
      await client.query(
        `
          SELECT
            return_item.id,
            return_item.sales_order_line_id,
            return_item.quantity,
            line.quantity
              AS ordered_quantity,
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

      await postSalesFulfillmentToInventory(
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
          lineId:
            String(
              item.sales_order_line_id,
            ),
          orderedQuantity:
            Number(
              item.ordered_quantity,
            ),
          previousDeliveredQuantity:
            previous,
          nextDeliveredQuantity:
            next,
          externalProductId:
            item.external_product_id
              ? String(
                  item.external_product_id,
                )
              : null,
          reservationId:
            item.stock_reservation_id
              ? String(
                  item.stock_reservation_id,
                )
              : null,
        },
      );

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

export async function issueSalesReturnCredit(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .RETURN_MANAGE,
    );

  const returnId =
    requireUuid(
      input.returnId,
      'Sales return',
    );

  const returnResult =
    await context.pool.query(
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
      await issueInvoiceCreditNote({
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

    const saved =
      await context.pool.query(
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

    const returnCreditId =
      String(
        saved.rows[0].id,
      );

    for (
      const line
      of lines
    ) {
      await context.pool.query(
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
        `,
        [
          context.companyId,
          returnCreditId,
          line.returnItemId,
          line.invoiceItemId,
          line.quantity,
        ],
      );

      await context.pool.query(
        `
          UPDATE sales_order_items_v2
          SET
            credited_quantity =
              LEAST(
                returned_quantity,
                credited_quantity +
                $4
              )
          WHERE id = $1
            AND sales_order_id = $2
            AND company_id = $3
        `,
        [
          line.orderLineId,
          returnRow
            .sales_order_id,
          context.companyId,
          line.quantity,
        ],
      );
    }

    createdCredits.push({
      invoiceId,
      creditNoteId:
        credit.id,
      creditNoteNumber:
        credit.creditNoteNumber,
      amount:
        credit.amount,
      availableCredit:
        credit.availableCredit,
    });
  }

  await context.pool.query(
    `
      UPDATE sales_returns
      SET
        status = 'credited',
        credited_at =
          COALESCE(
            credited_at,
            NOW()
          ),
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

  return {
    returnId,
    status:
      'credited',
    credits:
      createdCredits,
  };
}

export async function refundSalesReturnCredit(
  input:
    Record<
      string,
      unknown
    >,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .RETURN_MANAGE,
    );

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

  const row =
    result.rows[0];

  const available =
    money(
      row.available_credit,
    );

  const amount =
    input.amount ===
      undefined ||
    input.amount ===
      null ||
    input.amount ===
      ''
      ? available
      : numberInput(
          input.amount,
          'Refund amount',
          {
            min:
              0.0001,
          },
        );

  if (
    amount <=
      0 ||
    amount >
      available +
        0.0001
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Refund amount exceeds the customer credit available from this return.',
      {
        availableCredit:
          available,
      },
    );
  }

  const refund =
    await refundInvoiceCreditNote({
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
        (
          'sales-return-credit:' +
          returnCreditId +
          ':refund:' +
          cleanText(
            input.idempotencyKey,
            80,
          )
        ).slice(
          0,
          120,
        ),
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

  await context.pool.query(
    `
      UPDATE sales_return_credits
      SET
        available_credit = $3,
        refunded_amount =
          refunded_amount +
          $4,
        updated_by = $5,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      returnCreditId,
      context.companyId,
      refund.availableCredit,
      amount,
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
    remaining <=
      0.0001 &&
    refundedAmount >
      0
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
      refund.availableCredit,
  };
}
