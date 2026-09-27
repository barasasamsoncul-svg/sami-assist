import 'server-only';

import type {
  PoolClient,
} from 'pg';


async function tableExists(
  client: PoolClient,
  table: string,
) {
  const result =
    await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
      `,
      [table],
    );

  return result.rows.length === 1;
}


async function columnExists(
  client: PoolClient,
  table: string,
  column: string,
) {
  const result =
    await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [table, column],
    );

  return result.rows.length === 1;
}


async function inventoryBridgeReady(
  client: PoolClient,
) {
  const required = [
    'products',
    'warehouses',
    'stock_levels',
    'stock_movements',
    'stock_reservations',
  ];

  for (const table of required) {
    if (!(await tableExists(client, table))) {
      return false;
    }

    if (!(await columnExists(client, table, 'company_id'))) {
      return false;
    }
  }

  return true;
}


async function resolveInventoryPosition(
  client: PoolClient,
  companyId: string,
  sku: string,
) {
  const result =
    await client.query(
      `
        SELECT
          p.id AS product_id,
          p.product_type,
          sl.warehouse_id,
          sl.quantity,
          COALESCE(
            (
              SELECT SUM(sr.quantity)
              FROM stock_reservations sr
              WHERE sr.company_id = $1
                AND sr.product_id = p.id
                AND sr.warehouse_id = sl.warehouse_id
                AND sr.deleted_at IS NULL
                AND sr.status IN ('active','allocated')
            ),
            0
          ) AS reserved_quantity
        FROM products p
        INNER JOIN stock_levels sl
          ON sl.product_id = p.id
         AND sl.company_id = p.company_id
         AND sl.deleted_at IS NULL
        INNER JOIN warehouses w
          ON w.id = sl.warehouse_id
         AND w.company_id = p.company_id
         AND w.deleted_at IS NULL
        WHERE p.company_id = $1
          AND p.deleted_at IS NULL
          AND p.is_active = TRUE
          AND LOWER(BTRIM(COALESCE(p.sku, ''))) = LOWER(BTRIM($2))
        ORDER BY
          (
            sl.quantity -
            COALESCE(
              (
                SELECT SUM(sr2.quantity)
                FROM stock_reservations sr2
                WHERE sr2.company_id = $1
                  AND sr2.product_id = p.id
                  AND sr2.warehouse_id = sl.warehouse_id
                  AND sr2.deleted_at IS NULL
                  AND sr2.status IN ('active','allocated')
              ),
              0
            )
          ) DESC,
          sl.quantity DESC,
          sl.warehouse_id
        LIMIT 1
        FOR UPDATE OF sl
      `,
      [
        companyId,
        sku,
      ],
    );

  return result.rows[0] || null;
}


export async function reserveSalesOrderInventory(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    orderId: string;
  },
) {
  if (!(await inventoryBridgeReady(client))) {
    return {
      integrated: false,
      reservationsCreated: 0,
    };
  }

  const lines =
    await client.query(
      `
        SELECT
          id,
          sku_snapshot,
          quantity
        FROM sales_order_items_v2
        WHERE sales_order_id = $1
          AND company_id = $2
        ORDER BY sort_order, id
      `,
      [
        input.orderId,
        input.companyId,
      ],
    );

  let reservationsCreated = 0;

  for (const line of lines.rows) {
    const sku =
      String(
        line.sku_snapshot ||
        '',
      ).trim();

    if (!sku) {
      continue;
    }

    const position =
      await resolveInventoryPosition(
        client,
        input.companyId,
        sku,
      );

    if (
      !position ||
      String(
        position.product_type ||
        '',
      ).toLowerCase() !==
        'stockable'
    ) {
      continue;
    }

    const available =
      Math.max(
        0,
        Number(position.quantity || 0) -
        Number(position.reserved_quantity || 0),
      );

    const requested =
      Number(
        line.quantity ||
        0,
      );

    const quantity =
      Math.min(
        available,
        requested,
      );

    if (quantity <= 0) {
      continue;
    }

    const sourceReference =
      input.orderId +
      ':' +
      String(line.id);

    const existing =
      await client.query(
        `
          SELECT id
          FROM stock_reservations
          WHERE company_id = $1
            AND source_type = 'sales_order'
            AND source_reference = $2
            AND deleted_at IS NULL
            AND status IN ('active','allocated','consumed')
          LIMIT 1
        `,
        [
          input.companyId,
          sourceReference,
        ],
      );

    if (existing.rows.length > 0) {
      continue;
    }

    await client.query(
      `
        INSERT INTO stock_reservations (
          company_id,
          product_id,
          warehouse_id,
          quantity,
          source_type,
          source_reference,
          required_at,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,
          'sales_order',
          $5,
          NOW(),
          'active',
          $6,$6
        )
      `,
      [
        input.companyId,
        position.product_id,
        position.warehouse_id,
        quantity,
        sourceReference,
        input.userId,
      ],
    );

    reservationsCreated += 1;
  }

  return {
    integrated: true,
    reservationsCreated,
  };
}


export async function postSalesOrderDelivery(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    orderId: string;
    lineId: string;
    deliveredQuantity: number;
  },
) {
  if (!(await inventoryBridgeReady(client))) {
    return {
      integrated: false,
      movementPosted: false,
    };
  }

  const lineResult =
    await client.query(
      `
        SELECT
          id,
          sku_snapshot,
          quantity,
          delivered_quantity,
          invoiced_quantity
        FROM sales_order_items_v2
        WHERE id = $1
          AND sales_order_id = $2
          AND company_id = $3
        FOR UPDATE
      `,
      [
        input.lineId,
        input.orderId,
        input.companyId,
      ],
    );

  if (lineResult.rows.length !== 1) {
    throw new Error(
      'Sales order line was not found while posting inventory fulfillment.',
    );
  }

  const line =
    lineResult.rows[0];

  const previous =
    Number(
      line.delivered_quantity ||
      0,
    );

  const invoiced =
    Number(
      line.invoiced_quantity ||
      0,
    );

  if (
    input.deliveredQuantity <
    invoiced -
      0.000001
  ) {
    throw new Error(
      'Delivered quantity cannot be reduced below the already invoiced quantity.',
    );
  }

  const sku =
    String(
      line.sku_snapshot ||
      '',
    ).trim();

  if (!sku) {
    return {
      integrated: true,
      movementPosted: false,
      previousDeliveredQuantity:
        previous,
    };
  }

  const sourceReference =
    input.orderId +
    ':' +
    input.lineId;

  const reservation =
    await client.query(
      `
        SELECT
          id,
          product_id,
          warehouse_id,
          quantity,
          status
        FROM stock_reservations
        WHERE company_id = $1
          AND source_type = 'sales_order'
          AND source_reference = $2
          AND deleted_at IS NULL
          AND status IN ('active','allocated','consumed')
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.companyId,
        sourceReference,
      ],
    );

  const position =
    reservation.rows[0] ||
    await resolveInventoryPosition(
      client,
      input.companyId,
      sku,
    );

  if (!position) {
    return {
      integrated: true,
      movementPosted: false,
      previousDeliveredQuantity:
        previous,
    };
  }

  const productId =
    String(
      position.product_id,
    );

  const warehouseId =
    String(
      position.warehouse_id,
    );

  const delta =
    input.deliveredQuantity -
    previous;

  if (
    Math.abs(delta) <=
      0.000001
  ) {
    return {
      integrated: true,
      movementPosted: false,
      previousDeliveredQuantity:
        previous,
    };
  }

  const reference =
    'sales-order:' +
    input.orderId +
    ':line:' +
    input.lineId +
    ':from:' +
    previous +
    ':to:' +
    input.deliveredQuantity;

  const duplicate =
    await client.query(
      `
        SELECT id
        FROM stock_movements
        WHERE company_id = $1
          AND reference = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        reference,
      ],
    );

  if (duplicate.rows.length === 0) {
    if (delta > 0) {
      const reduced =
        await client.query(
          `
            UPDATE stock_levels
            SET
              quantity =
                quantity -
                $3,
              updated_by =
                $4,
              updated_at =
                NOW()
            WHERE product_id = $1
              AND warehouse_id = $2
              AND company_id = $5
              AND deleted_at IS NULL
              AND quantity >= $3
            RETURNING id
          `,
          [
            productId,
            warehouseId,
            delta,
            input.userId,
            input.companyId,
          ],
        );

      if (reduced.rows.length !== 1) {
        throw new Error(
          'This delivery cannot be completed because available stock is insufficient.',
        );
      }

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id,
            warehouse_id,
            movement_type,
            quantity,
            reference,
            company_id,
            created_by,
            updated_by,
            created_at,
            updated_at
          )
          VALUES (
            $1,$2,
            'sales_delivery',
            $3,$4,$5,$6,$6,NOW(),NOW()
          )
        `,
        [
          productId,
          warehouseId,
          delta,
          reference,
          input.companyId,
          input.userId,
        ],
      );
    } else {
      const returned =
        Math.abs(delta);

      await client.query(
        `
          UPDATE stock_levels
          SET
            quantity =
              quantity +
              $3,
            updated_by =
              $4,
            updated_at =
              NOW()
          WHERE product_id = $1
            AND warehouse_id = $2
            AND company_id = $5
            AND deleted_at IS NULL
        `,
        [
          productId,
          warehouseId,
          returned,
          input.userId,
          input.companyId,
        ],
      );

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id,
            warehouse_id,
            movement_type,
            quantity,
            reference,
            company_id,
            created_by,
            updated_by,
            created_at,
            updated_at
          )
          VALUES (
            $1,$2,
            'return_in',
            $3,$4,$5,$6,$6,NOW(),NOW()
          )
        `,
        [
          productId,
          warehouseId,
          returned,
          reference,
          input.companyId,
          input.userId,
        ],
      );
    }
  }

  if (reservation.rows.length > 0) {
    const reserved =
      Number(
        reservation.rows[0]
          .quantity ||
        0,
      );

    const nextReservationStatus =
      input.deliveredQuantity >=
        reserved -
          0.000001
        ? 'consumed'
        : input.deliveredQuantity >
            0
          ? 'allocated'
          : 'active';

    await client.query(
      `
        UPDATE stock_reservations
        SET
          status = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        reservation.rows[0].id,
        input.companyId,
        nextReservationStatus,
        input.userId,
      ],
    );
  }

  return {
    integrated: true,
    movementPosted: true,
    previousDeliveredQuantity:
      previous,
  };
}
