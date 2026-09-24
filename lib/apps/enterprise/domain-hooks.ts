import 'server-only';

import type {
  PoolClient,
} from 'pg';


type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


function numberValue(
  value:
    unknown,
) {
  const parsed =
    Number(
      value ??
      0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}


export function assertEnterpriseDomainMutationAllowed(
  moduleKey:
    string,
  table:
    string,
  operation:
    MutationOperation,
) {
  if (
    moduleKey ===
      'inventory' &&
    table ===
      'stock_movements' &&
    operation !==
      'create'
  ) {
    throw new Error(
      'Posted stock movements are immutable. Create a reversing stock movement instead.',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_reconciliations' &&
    operation ===
      'delete'
  ) {
    throw new Error(
      'Payment reconciliation history cannot be deleted. Correct it through a compensating reconciliation.',
    );
  }
}


export function normalizeEnterpriseDomainValues(
  moduleKey:
    string,
  table:
    string,
  values:
    Map<
      string,
      unknown
    >,
) {
  if (
    values.has(
      'quantity',
    ) &&
    values.has(
      'unit_price',
    ) &&
    (
      table.endsWith(
        '_items',
      ) ||
      table.endsWith(
        '_lines',
      )
    )
  ) {
    values.set(
      'line_total',
      Number(
        (
          numberValue(
            values.get(
              'quantity',
            ),
          ) *
          numberValue(
            values.get(
              'unit_price',
            ),
          )
        ).toFixed(
          4,
        ),
      ),
    );
  }

  if (
    moduleKey ===
      'inventory' &&
    table ===
      'stock_movements'
  ) {
    const quantity =
      numberValue(
        values.get(
          'quantity',
        ),
      );

    if (
      quantity <=
        0
    ) {
      throw new Error(
        'Stock movement quantity must be greater than zero.',
      );
    }

    const movementType =
      String(
        values.get(
          'movement_type',
        ) ||
        '',
      )
        .trim()
        .toLowerCase();

    const accepted =
      new Set([
        'in',
        'inbound',
        'receipt',
        'return_in',
        'adjustment_in',
        'out',
        'outbound',
        'issue',
        'sale',
        'return_out',
        'adjustment_out',
      ]);

    if (
      !accepted.has(
        movementType,
      )
    ) {
      throw new Error(
        'Choose a supported stock movement type.',
      );
    }
  }
}


async function recalculatePurchaseOrder(
  client:
    PoolClient,
  orderId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE purchase_orders po
      SET
        total_amount =
          COALESCE(
            (
              SELECT
                SUM(
                  quantity *
                  unit_cost
                )
              FROM purchase_order_items i
              WHERE i.purchase_order_id =
                    po.id
                AND i.company_id =
                    po.company_id
                AND i.deleted_at
                    IS NULL
            ),
            0
          ),
        updated_at =
          NOW()
      WHERE po.id =
            $1
        AND po.company_id =
            $2
        AND po.deleted_at
            IS NULL
    `,
    [
      orderId,
      companyId,
    ],
  );
}


async function recalculateCpqQuote(
  client:
    PoolClient,
  quoteId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE cpq_quotes q
      SET
        subtotal =
          COALESCE(
            (
              SELECT
                SUM(
                  line_total
                )
              FROM cpq_quote_lines l
              WHERE l.quote_id =
                    q.id
                AND l.company_id =
                    q.company_id
                AND l.deleted_at
                    IS NULL
            ),
            0
          ),
        total_amount =
          COALESCE(
            (
              SELECT
                SUM(
                  line_total
                )
              FROM cpq_quote_lines l
              WHERE l.quote_id =
                    q.id
                AND l.company_id =
                    q.company_id
                AND l.deleted_at
                    IS NULL
            ),
            0
          ),
        updated_at =
          NOW()
      WHERE q.id =
            $1
        AND q.company_id =
            $2
        AND q.deleted_at
            IS NULL
    `,
    [
      quoteId,
      companyId,
    ],
  );
}


async function recalculateStorefrontOrder(
  client:
    PoolClient,
  orderId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE storefront_orders o
      SET
        total_amount =
          COALESCE(
            (
              SELECT
                SUM(
                  line_total
                )
              FROM storefront_order_lines l
              WHERE l.order_id =
                    o.id
                AND l.company_id =
                    o.company_id
                AND l.deleted_at
                    IS NULL
            ),
            0
          ),
        updated_at =
          NOW()
      WHERE o.id =
            $1
        AND o.company_id =
            $2
        AND o.deleted_at
            IS NULL
    `,
    [
      orderId,
      companyId,
    ],
  );
}


async function recalculateShopOrder(
  client:
    PoolClient,
  orderId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE shop_orders o
      SET
        subtotal =
          COALESCE(
            totals.subtotal,
            0
          ),
        tax_amount =
          COALESCE(
            totals.tax_amount,
            0
          ),
        total_amount =
          COALESCE(
            totals.subtotal,
            0
          ) +
          COALESCE(
            totals.tax_amount,
            0
          ),
        updated_at =
          NOW()
      FROM (
        SELECT
          i.order_id,
          SUM(
            i.line_total
          )
            AS subtotal,
          SUM(
            i.line_total *
            COALESCE(
              p.tax_rate,
              0
            ) /
            100
          )
            AS tax_amount
        FROM shop_order_items i
        LEFT JOIN shop_products p
          ON p.id =
             i.product_id
         AND p.company_id =
             i.company_id
         AND p.deleted_at
             IS NULL
        WHERE i.order_id =
              $1
          AND i.company_id =
              $2
          AND i.deleted_at
              IS NULL
        GROUP BY
          i.order_id
      ) totals
      WHERE o.id =
            totals.order_id
        AND o.id =
            $1
        AND o.company_id =
            $2
        AND o.deleted_at
            IS NULL
    `,
    [
      orderId,
      companyId,
    ],
  );

  await client.query(
    `
      UPDATE shop_orders
      SET
        subtotal = 0,
        tax_amount = 0,
        total_amount = 0,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM shop_order_items
          WHERE order_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        )
    `,
    [
      orderId,
      companyId,
    ],
  );
}


async function recalculateRestaurantOrder(
  client:
    PoolClient,
  orderId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE restaurant_orders o
      SET
        total_amount =
          COALESCE(
            (
              SELECT
                SUM(
                  line_total
                )
              FROM restaurant_order_items i
              WHERE i.order_id =
                    o.id
                AND i.company_id =
                    o.company_id
                AND i.deleted_at
                    IS NULL
            ),
            0
          ),
        updated_at =
          NOW()
      WHERE o.id =
            $1
        AND o.company_id =
            $2
        AND o.deleted_at
            IS NULL
    `,
    [
      orderId,
      companyId,
    ],
  );
}


async function recalculatePayrollRun(
  client:
    PoolClient,
  runId:
    string,
  companyId:
    string,
) {
  await client.query(
    `
      UPDATE payroll_runs r
      SET
        total_gross =
          COALESCE(
            totals.total_gross,
            0
          ),
        total_deductions =
          COALESCE(
            totals.total_deductions,
            0
          ),
        total_net =
          COALESCE(
            totals.total_net,
            0
          ),
        updated_at =
          NOW()
      FROM (
        SELECT
          payroll_run_id,
          SUM(
            gross_amount
          )
            AS total_gross,
          SUM(
            deductions
          )
            AS total_deductions,
          SUM(
            net_amount
          )
            AS total_net
        FROM payroll_run_lines
        WHERE payroll_run_id =
              $1
          AND company_id =
              $2
          AND deleted_at
              IS NULL
        GROUP BY
          payroll_run_id
      ) totals
      WHERE r.id =
            totals.payroll_run_id
        AND r.id =
            $1
        AND r.company_id =
            $2
        AND r.deleted_at
            IS NULL
    `,
    [
      runId,
      companyId,
    ],
  );

  await client.query(
    `
      UPDATE payroll_runs
      SET
        total_gross = 0,
        total_deductions = 0,
        total_net = 0,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM payroll_run_lines
          WHERE payroll_run_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        )
    `,
    [
      runId,
      companyId,
    ],
  );
}


async function applyStockMovement(
  client:
    PoolClient,
  row:
    Record<
      string,
      unknown
    >,
  companyId:
    string,
) {
  const movementType =
    String(
      row.movement_type ||
      '',
    )
      .trim()
      .toLowerCase();

  const quantity =
    numberValue(
      row.quantity,
    );

  const inbound =
    new Set([
      'in',
      'inbound',
      'receipt',
      'return_in',
      'adjustment_in',
    ]).has(
      movementType,
    );

  if (
    inbound
  ) {
    await client.query(
      `
        INSERT INTO stock_levels (
          product_id,
          warehouse_id,
          quantity,
          reorder_level,
          company_id,
          updated_at
        )
        VALUES (
          $1,$2,$3,0,$4,NOW()
        )
        ON CONFLICT (
          product_id,
          warehouse_id
        )
        DO UPDATE
        SET
          quantity =
            stock_levels.quantity +
            EXCLUDED.quantity,
          company_id =
            EXCLUDED.company_id,
          updated_at =
            NOW()
      `,
      [
        row.product_id,
        row.warehouse_id,
        quantity,
        companyId,
      ],
    );

    return;
  }

  const changed =
    await client.query(
      `
        UPDATE stock_levels
        SET
          quantity =
            quantity -
            $3,
          updated_at =
            NOW()
        WHERE product_id =
              $1
          AND warehouse_id =
              $2
          AND company_id =
              $4
          AND deleted_at
              IS NULL
          AND quantity >=
              $3
        RETURNING id
      `,
      [
        row.product_id,
        row.warehouse_id,
        quantity,
        companyId,
      ],
    );

  if (
    changed.rows.length !==
      1
  ) {
    throw new Error(
      'Insufficient stock for this movement.',
    );
  }
}


async function synchronizeDerivedLineValues(
  client:
    PoolClient,
  moduleKey:
    string,
  table:
    string,
  row:
    Record<
      string,
      unknown
    >,
  companyId:
    string,
) {
  if (
    !row.id
  ) {
    return;
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_order_items'
  ) {
    await client.query(
      `
        UPDATE purchase_order_items
        SET
          line_total =
            quantity *
            unit_cost,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.id,
        companyId,
      ],
    );
  }

  if (
    (
      moduleKey ===
        'cpq' &&
      table ===
        'cpq_quote_lines'
    ) ||
    (
      moduleKey ===
        'ecommerce' &&
      table ===
        'storefront_order_lines'
    ) ||
    (
      moduleKey ===
        'pos_shop' &&
      table ===
        'shop_order_items'
    ) ||
    (
      moduleKey ===
        'pos_restaurant' &&
      table ===
        'restaurant_order_items'
    )
  ) {
    const target =
      moduleKey ===
        'cpq'
        ? 'cpq_quote_lines'
        : moduleKey ===
            'ecommerce'
          ? 'storefront_order_lines'
          : moduleKey ===
              'pos_shop'
            ? 'shop_order_items'
            : 'restaurant_order_items';

    await client.query(
      'UPDATE ' +
      target +
      ' SET line_total = quantity * unit_price, updated_at = NOW() WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [
        row.id,
        companyId,
      ],
    );
  }

  if (
    moduleKey ===
      'payroll' &&
    table ===
      'payroll_run_lines'
  ) {
    const payrollLine =
      await client.query(
      `
        UPDATE payroll_run_lines
        SET
          net_amount =
            gross_amount -
            deductions,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
          AND deductions <=
              gross_amount
        RETURNING id
      `,
      [
        row.id,
        companyId,
      ],
    );

    if (
      payrollLine.rows.length !==
        1
    ) {
      throw new Error(
        'Payroll deductions cannot exceed gross pay.',
      );
    }
  }
}


export async function applyEnterpriseDomainSideEffects(
  client:
    PoolClient,
  input: {
    moduleKey: string;
    table: string;
    companyId: string;
    operation: MutationOperation;
    row:
      Record<
        string,
        unknown
      >;
  },
) {
  const {
    moduleKey,
    table,
    companyId,
    operation,
    row,
  } =
    input;

  if (
    operation !==
      'delete'
  ) {
    await synchronizeDerivedLineValues(
      client,
      moduleKey,
      table,
      row,
      companyId,
    );
  }

  if (
    moduleKey ===
      'inventory' &&
    table ===
      'stock_movements' &&
    operation ===
      'create'
  ) {
    await applyStockMovement(
      client,
      row,
      companyId,
    );
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_order_items' &&
    row.purchase_order_id
  ) {
    await recalculatePurchaseOrder(
      client,
      String(
        row.purchase_order_id,
      ),
      companyId,
    );
  }

  if (
    moduleKey ===
      'cpq' &&
    table ===
      'cpq_quote_lines' &&
    row.quote_id
  ) {
    await recalculateCpqQuote(
      client,
      String(
        row.quote_id,
      ),
      companyId,
    );
  }

  if (
    moduleKey ===
      'ecommerce' &&
    table ===
      'storefront_order_lines' &&
    row.order_id
  ) {
    await recalculateStorefrontOrder(
      client,
      String(
        row.order_id,
      ),
      companyId,
    );
  }

  if (
    moduleKey ===
      'pos_shop' &&
    table ===
      'shop_order_items' &&
    row.order_id
  ) {
    await recalculateShopOrder(
      client,
      String(
        row.order_id,
      ),
      companyId,
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'restaurant_order_items' &&
    row.order_id
  ) {
    await recalculateRestaurantOrder(
      client,
      String(
        row.order_id,
      ),
      companyId,
    );
  }

  if (
    moduleKey ===
      'payroll' &&
    table ===
      'payroll_run_lines' &&
    row.payroll_run_id
  ) {
    await recalculatePayrollRun(
      client,
      String(
        row.payroll_run_id,
      ),
      companyId,
    );
  }
}
