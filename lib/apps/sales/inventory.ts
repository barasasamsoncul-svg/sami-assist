import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  SalesError,
} from '@/lib/apps/sales/context';


async function inventoryRuntimeReady(
  client:
    PoolClient,
) {
  const result =
    await client.query(
      `
        SELECT
          to_regclass('public.products')
            IS NOT NULL
            AS products_ready,
          to_regclass('public.warehouses')
            IS NOT NULL
            AS warehouses_ready,
          to_regclass('public.stock_levels')
            IS NOT NULL
            AS stock_levels_ready,
          to_regclass('public.stock_movements')
            IS NOT NULL
            AS stock_movements_ready,
          to_regclass('public.stock_reservations')
            IS NOT NULL
            AS reservations_ready
      `,
    );

  const row =
    result.rows[0] ||
    {};

  return (
    row.products_ready ===
      true &&
    row.warehouses_ready ===
      true &&
    row.stock_levels_ready ===
      true &&
    row.stock_movements_ready ===
      true &&
    row.reservations_ready ===
      true
  );
}


async function chooseWarehouse(
  client:
    PoolClient,
  companyId:
    string,
  productId:
    string,
) {
  const stocked =
    await client.query(
      `
        SELECT
          sl.warehouse_id
        FROM stock_levels sl
        INNER JOIN warehouses w
          ON w.id =
             sl.warehouse_id
         AND w.company_id =
             sl.company_id
         AND w.deleted_at
             IS NULL
        WHERE sl.company_id =
              $1
          AND sl.product_id =
              $2
          AND sl.deleted_at
              IS NULL
        ORDER BY
          sl.quantity DESC,
          sl.warehouse_id
        LIMIT 1
      `,
      [
        companyId,
        productId,
      ],
    );

  if (
    stocked.rows[0]
      ?.warehouse_id
  ) {
    return String(
      stocked.rows[0]
        .warehouse_id,
    );
  }

  const fallback =
    await client.query(
      `
        SELECT id
        FROM warehouses
        WHERE company_id = $1
          AND deleted_at
              IS NULL
        ORDER BY
          created_at,
          id
        LIMIT 1
      `,
      [
        companyId,
      ],
    );

  return fallback.rows[0]
    ?.id
    ? String(
        fallback.rows[0].id,
      )
    : null;
}


export async function reserveSalesOrderInventory(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    orderId: string;
  },
) {
  if (
    !await inventoryRuntimeReady(
      client,
    )
  ) {
    return {
      integrated:
        false,
      reserved:
        0,
    };
  }

  const lines =
    await client.query(
      `
        SELECT
          line.id,
          line.external_product_id,
          line.quantity,
          line.stock_reservation_id,
          product.product_type
        FROM sales_order_items_v2 line
        INNER JOIN products product
          ON product.id =
             line.external_product_id
         AND product.company_id =
             line.company_id
         AND product.deleted_at
             IS NULL
        WHERE line.sales_order_id =
              $1
          AND line.company_id =
              $2
          AND line.external_product_id
              IS NOT NULL
        ORDER BY
          line.sort_order,
          line.id
      `,
      [
        input.orderId,
        input.companyId,
      ],
    );

  let reserved =
    0;

  for (
    const line
    of lines.rows
  ) {
    if (
      String(
        line.product_type ||
        'stockable',
      ) !==
        'stockable'
    ) {
      continue;
    }

    if (
      line.stock_reservation_id
    ) {
      continue;
    }

    const existing =
      await client.query(
        `
          SELECT id
          FROM stock_reservations
          WHERE company_id = $1
            AND source_type =
                'sales_order_line'
            AND source_reference = $2
            AND status IN (
              'active',
              'allocated',
              'consumed'
            )
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          input.companyId,
          String(
            line.id,
          ),
        ],
      );

    let reservationId =
      existing.rows[0]
        ?.id
        ? String(
            existing.rows[0].id,
          )
        : null;

    if (
      !reservationId
    ) {
      const warehouseId =
        await chooseWarehouse(
          client,
          input.companyId,
          String(
            line.external_product_id,
          ),
        );

      if (
        !warehouseId
      ) {
        continue;
      }

      const reservation =
        await client.query(
          `
            INSERT INTO stock_reservations (
              company_id,
              product_id,
              warehouse_id,
              quantity,
              source_type,
              source_reference,
              status,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,
              'sales_order_line',
              $5,
              'active',
              $6,$6
            )
            RETURNING id
          `,
          [
            input.companyId,
            line.external_product_id,
            warehouseId,
            line.quantity,
            String(
              line.id,
            ),
            input.userId,
          ],
        );

      reservationId =
        String(
          reservation.rows[0].id,
        );

      reserved +=
        1;
    }

    await client.query(
      `
        UPDATE sales_order_items_v2
        SET
          stock_reservation_id =
            $3
        WHERE id = $1
          AND company_id = $2
      `,
      [
        line.id,
        input.companyId,
        reservationId,
      ],
    );
  }

  return {
    integrated:
      true,
    reserved,
  };
}


export async function postSalesFulfillmentToInventory(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    orderId: string;
    lineId: string;
    orderedQuantity: number;
    quantityDelta: number;
    nextFulfilledQuantity: number;
    externalProductId:
      string |
      null;
    reservationId:
      string |
      null;
  },
) {
  const delta = input.quantityDelta;

  if (
    Math.abs(delta) < 0.0000001 ||
    !input.externalProductId
  ) {
    return {
      integrated: true,
      delta: 0,
      skipped: true,
    };
  }

  if (!await inventoryRuntimeReady(client)) {
    return {
      integrated: false,
      delta: 0,
      reason: 'inventory_runtime_unavailable',
    };
  }

  let reservationId =
    input.reservationId;

  if (
    !reservationId
  ) {
    await reserveSalesOrderInventory(
      client,
      {
        companyId:
          input.companyId,
        userId:
          input.userId,
        orderId:
          input.orderId,
      },
    );

    const refreshed =
      await client.query(
        `
          SELECT
            stock_reservation_id
          FROM sales_order_items_v2
          WHERE id = $1
            AND company_id = $2
          LIMIT 1
        `,
        [
          input.lineId,
          input.companyId,
        ],
      );

    reservationId =
      refreshed.rows[0]
        ?.stock_reservation_id
        ? String(
            refreshed.rows[0]
              .stock_reservation_id,
          )
        : null;
  }

  if (!reservationId) {
    const product = await client.query(
      `
        SELECT product_type
        FROM products
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.externalProductId, input.companyId],
    );

    if (product.rows.length === 1 && String(product.rows[0].product_type || 'stockable') !== 'stockable') {
      return {
        integrated: true,
        delta: 0,
        skipped: true,
      };
    }

    return {
      integrated: false,
      delta: 0,
      reason: 'stock_reservation_missing',
    };
  }

  const reservation =
    await client.query(
      `
        SELECT
          id,
          product_id,
          warehouse_id,
          status
        FROM stock_reservations
        WHERE id = $1
          AND company_id = $2
          AND deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        reservationId,
        input.companyId,
      ],
    );

  if (reservation.rows.length !== 1) {
    return {
      integrated: false,
      delta: 0,
      reason: 'stock_reservation_not_found',
    };
  }

  const productId =
    String(
      reservation.rows[0]
        .product_id,
    );

  const warehouseId =
    String(
      reservation.rows[0]
        .warehouse_id,
    );

  const stock =
    await client.query(
      `
        SELECT
          id,
          quantity
        FROM stock_levels
        WHERE company_id = $1
          AND product_id = $2
          AND warehouse_id = $3
          AND deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.companyId,
        productId,
        warehouseId,
      ],
    );

  const currentStock =
    Number(
      stock.rows[0]
        ?.quantity ||
      0,
    );

  if (
    delta >
      0 &&
    currentStock +
      0.0000001 <
      delta
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Insufficient available stock to post this delivery. Replenish or adjust Inventory before completing fulfillment.',
      {
        lineId:
          input.lineId,
        available:
          currentStock,
        requested:
          delta,
      },
    );
  }

  if (
    stock.rows.length ===
      0
  ) {
    if (
      delta >
        0
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'No stock balance exists for this product and warehouse.',
      );
    }

    await client.query(
      `
        INSERT INTO stock_levels (
          company_id,
          product_id,
          warehouse_id,
          quantity,
          reorder_level,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,0,$5,$5
        )
      `,
      [
        input.companyId,
        productId,
        warehouseId,
        Math.abs(
          delta,
        ),
        input.userId,
      ],
    );
  } else {
    await client.query(
      `
        UPDATE stock_levels
        SET
          quantity =
            quantity -
            $4,
          updated_by =
            $5,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND warehouse_id = $3
      `,
      [
        stock.rows[0].id,
        input.companyId,
        warehouseId,
        delta,
        input.userId,
      ],
    );
  }

  const movement =
    await client.query(
      `
        INSERT INTO stock_movements (
          company_id,
          product_id,
          warehouse_id,
          movement_type,
          quantity,
          reference,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$7
        )
        RETURNING
          id::text,
          created_at::date::text AS movement_date,
          movement_type,
          quantity::text,
          reference
      `,
      [
        input.companyId,
        productId,
        warehouseId,
        delta >
          0
          ? 'sales_delivery'
          : 'sales_return',
        Math.abs(
          delta,
        ),
        'sales-order:' +
        input.orderId +
        ':line:' +
        input.lineId,
        input.userId,
      ],
    );

  /*
   * Accounting Inventory Valuation is an optional consumer of authoritative
   * Inventory movements. Sales must never require Accounting to be installed,
   * but when the valuation contract exists and is enabled we snapshot the
   * product standard cost in the same transaction as the stock movement.
   */
  const valuationReady =
    await client.query(
      `
        SELECT
          to_regclass(
            'public.accounting_inventory_settings'
          ) IS NOT NULL
            AS settings_ready,
          to_regclass(
            'public.accounting_inventory_source_events'
          ) IS NOT NULL
            AS events_ready,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema =
                  'public'
              AND table_name =
                  'products'
              AND column_name =
                  'cost_price'
          ) AS cost_price_ready
      `,
    );

  if (
    valuationReady.rows[0]
      ?.settings_ready === true &&
    valuationReady.rows[0]
      ?.events_ready === true &&
    valuationReady.rows[0]
      ?.cost_price_ready === true &&
    movement.rows[0]
  ) {
    const movementRow =
      movement.rows[0];

    await client.query(
      `
        INSERT INTO accounting_inventory_source_events (
          company_id,
          source_type,
          source_id,
          source_event_key,
          event_date,
          movement_type,
          product_id,
          warehouse_id,
          source_quantity,
          quantity_effect,
          unit_cost,
          value_amount,
          cost_source,
          cost_estimated,
          status,
          metadata,
          created_by,
          updated_by
        )
        SELECT
          $1,
          'stock_movement',
          $2::uuid,
          'inventory:stock-movement:' ||
            $2,
          $3::date,
          $4,
          $5::uuid,
          $6::uuid,
          $7::numeric,
          CASE
            WHEN $4 =
                 'sales_delivery'
              THEN -$7::numeric
            ELSE $7::numeric
          END,
          COALESCE(
            product.cost_price,
            0
          ),
          ROUND(
            ABS(
              $7::numeric
            ) *
            COALESCE(
              product.cost_price,
              0
            ),
            2
          ),
          'movement_snapshot',
          FALSE,
          'pending',
          jsonb_build_object(
            'reference',
            $8,
            'salesOrderId',
            $9,
            'salesOrderLineId',
            $10
          ),
          $11,
          $11
        FROM products product
        INNER JOIN accounting_inventory_settings cfg
          ON cfg.company_id =
             $1
         AND cfg.enabled =
             TRUE
         AND cfg.status =
             'active'
         AND cfg.deleted_at
             IS NULL
         AND cfg.sync_sales_movements =
             TRUE
         AND cfg.valuation_start_date <=
             $3::date
        WHERE product.id =
              $5::uuid
          AND product.company_id =
              $1
          AND product.deleted_at
              IS NULL
        ON CONFLICT (
          company_id,
          source_event_key
        )
        WHERE deleted_at
              IS NULL
        DO NOTHING
      `,
      [
        input.companyId,
        String(
          movementRow.id,
        ),
        String(
          movementRow.movement_date,
        ),
        String(
          movementRow.movement_type,
        ),
        productId,
        warehouseId,
        String(
          movementRow.quantity,
        ),
        movementRow.reference
          ? String(
              movementRow.reference,
            )
          : null,
        input.orderId,
        input.lineId,
        input.userId,
      ],
    );
  }

  await client.query(
    `
      UPDATE stock_reservations
      SET
        quantity = CASE
          WHEN $3 = 'consumed' THEN quantity
          ELSE GREATEST($5::numeric, 0)
        END,
        status = $3,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      reservationId,
      input.companyId,
      input.nextFulfilledQuantity >= input.orderedQuantity - 0.000001
        ? 'consumed'
        : input.nextFulfilledQuantity > 0
          ? 'allocated'
          : 'active',
      input.userId,
      Math.max(0, input.orderedQuantity - input.nextFulfilledQuantity),
    ],
  );

  return {
    integrated:
      true,
    delta,
    warehouseId,
    productId,
  };
}


export async function releaseSalesOrderReservations(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    orderId: string;
  },
) {
  if (
    !await inventoryRuntimeReady(
      client,
    )
  ) {
    return 0;
  }

  const result =
    await client.query(
      `
        UPDATE stock_reservations reservation
        SET
          status =
            'released',
          updated_by =
            $3,
          updated_at =
            NOW()
        FROM sales_order_items_v2 line
        WHERE line.sales_order_id =
              $1
          AND line.company_id =
              $2
          AND line.stock_reservation_id =
              reservation.id
          AND reservation.company_id =
              $2
          AND reservation.status IN (
            'active',
            'allocated'
          )
          AND reservation.deleted_at
              IS NULL
        RETURNING
          reservation.id
      `,
      [
        input.orderId,
        input.companyId,
        input.userId,
      ],
    );

  return result.rowCount ||
    0;
}
