import 'server-only';

import type {
  PoolClient,
} from 'pg';


async function tableExists(
  client:
    PoolClient,
  table:
    string,
) {
  const result =
    await client.query(
      'SELECT to_regclass($1) AS relation',
      [
        'public.' +
        table,
      ],
    );

  return Boolean(
    result.rows[0]
      ?.relation,
  );
}


async function postInventoryAdjustment(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  recordId:
    string,
) {
  const adjustment =
    await client.query(
      `
        SELECT
          product_id,
          warehouse_id,
          difference_quantity
        FROM inventory_adjustments
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        recordId,
        companyId,
      ],
    );

  if (
    adjustment.rows.length !==
      1
  ) {
    throw new Error(
      'Inventory adjustment was not found.',
    );
  }

  const difference =
    Number(
      adjustment.rows[0]
        .difference_quantity ||
      0,
    );

  const reference =
    'inventory_adjustment:' +
    recordId;

  const existing =
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
        companyId,
        reference,
      ],
    );

  if (
    existing.rows.length ===
      0 &&
    Math.abs(
      difference,
    ) >
      0.000001
  ) {
    const productId =
      String(
        adjustment.rows[0]
          .product_id,
      );

    const warehouseId =
      String(
        adjustment.rows[0]
          .warehouse_id,
      );

    const movementType =
      difference >
        0
        ? 'adjustment_in'
        : 'adjustment_out';

    const quantity =
      Math.abs(
        difference,
      );

    if (
      difference >
        0
    ) {
      await client.query(
        `
          INSERT INTO stock_levels (
            product_id,
            warehouse_id,
            quantity,
            reorder_level,
            company_id,
            updated_by,
            updated_at
          )
          VALUES ($1,$2,$3,0,$4,$5,NOW())
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
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
        `,
        [
          productId,
          warehouseId,
          quantity,
          companyId,
          userId,
        ],
      );
    } else {
      const reduced =
        await client.query(
          `
            UPDATE stock_levels
            SET
              quantity =
                quantity -
                $3,
              updated_by =
                $5,
              updated_at =
                NOW()
            WHERE product_id = $1
              AND warehouse_id = $2
              AND company_id = $4
              AND deleted_at IS NULL
              AND quantity >= $3
            RETURNING id
          `,
          [
            productId,
            warehouseId,
            quantity,
            companyId,
            userId,
          ],
        );

      if (
        reduced.rows.length !==
          1
      ) {
        throw new Error(
          'Inventory adjustment cannot post because stock would become negative.',
        );
      }
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7,NOW(),NOW())
      `,
      [
        productId,
        warehouseId,
        movementType,
        quantity,
        reference,
        companyId,
        userId,
      ],
    );
  }

  await client.query(
    `
      UPDATE inventory_adjustments
      SET
        posted_at =
          COALESCE(
            posted_at,
            NOW()
          ),
        approved_at =
          COALESCE(
            approved_at,
            NOW()
          ),
        approved_by =
          COALESCE(
            approved_by,
            $3
          ),
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [
      recordId,
      companyId,
      userId,
    ],
  );
}


async function computePayslip(
  client:
    PoolClient,
  companyId:
    string,
  recordId:
    string,
) {
  const totals =
    await client.query(
      `
        SELECT
          COUNT(*)::int AS line_count,
          COALESCE(
            SUM(
              CASE
                WHEN line_type = 'earning'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS gross,
          COALESCE(
            SUM(
              CASE
                WHEN line_type = 'deduction'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS deductions,
          COALESCE(
            SUM(
              CASE
                WHEN line_type = 'employer_contribution'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS employer
        FROM payslip_lines
        WHERE payslip_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
      ],
    );

  const row =
    totals.rows[0] ||
    {};

  if (
    Number(
      row.line_count ||
      0,
    ) ===
      0
  ) {
    throw new Error(
      'Add payslip lines before computing the payslip.',
    );
  }

  const gross =
    Number(
      row.gross ||
      0,
    );

  const deductions =
    Number(
      row.deductions ||
      0,
    );

  if (
    deductions >
      gross
  ) {
    throw new Error(
      'Payslip deductions cannot exceed gross earnings.',
    );
  }

  await client.query(
    `
      UPDATE payslips
      SET
        gross_amount = $3,
        deduction_amount = $4,
        employer_contribution_amount = $5,
        net_amount = $3 - $4,
        generated_at =
          COALESCE(
            generated_at,
            NOW()
          ),
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [
      recordId,
      companyId,
      gross,
      deductions,
      Number(
        row.employer ||
        0,
      ),
    ],
  );
}


async function validateWarehouseBatchCompletion(
  client:
    PoolClient,
  companyId:
    string,
  recordId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE status NOT IN (
              'completed',
              'cancelled'
            )
          )::int AS incomplete_count
        FROM warehouse_picking_batch_operations
        WHERE batch_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
      ],
    );

  if (
    Number(
      result.rows[0]
        ?.incomplete_count ||
      0,
    ) >
      0
  ) {
    throw new Error(
      'Complete or cancel every picking operation before completing the batch.',
    );
  }

  await client.query(
    `
      UPDATE warehouse_picking_batches
      SET
        completed_at =
          COALESCE(
            completed_at,
            NOW()
          ),
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [
      recordId,
      companyId,
    ],
  );
}


async function validateManufacturingReadiness(
  client:
    PoolClient,
  companyId:
    string,
  recordId:
    string,
  nextStatus:
    string,
) {
  if (
    ![
      'in_progress',
      'completed',
    ].includes(
      nextStatus,
    )
  ) {
    return;
  }

  const result =
    await client.query(
      `
        SELECT
          COUNT(*)::int AS material_count,
          COUNT(*) FILTER (
            WHERE
              (
                $3 = 'in_progress' AND
                reserved_quantity <
                  required_quantity
              ) OR
              (
                $3 = 'completed' AND
                consumed_quantity <
                  required_quantity
              )
          )::int AS incomplete_count
        FROM manufacturing_material_reservations
        WHERE manufacturing_order_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
          AND status <> 'cancelled'
      `,
      [
        recordId,
        companyId,
        nextStatus,
      ],
    );

  if (
    Number(
      result.rows[0]
        ?.material_count ||
      0,
    ) >
      0 &&
    Number(
      result.rows[0]
        ?.incomplete_count ||
      0,
    ) >
      0
  ) {
    throw new Error(
      nextStatus ===
        'in_progress'
        ? 'Reserve all required manufacturing materials before starting production.'
        : 'Record consumption of all required materials before completing production.',
    );
  }
}


async function validateProjectBudgetApproval(
  client:
    PoolClient,
  companyId:
    string,
  recordId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          budget_amount,
          approved_amount
        FROM project_budgets
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        recordId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new Error(
      'Project budget was not found.',
    );
  }

  const budget =
    Number(
      result.rows[0]
        .budget_amount ||
      0,
    );

  const approved =
    Number(
      result.rows[0]
        .approved_amount ||
      0,
    );

  if (
    approved <=
      0 ||
    approved >
      budget
  ) {
    throw new Error(
      'Approved project budget must be greater than zero and cannot exceed the budget amount.',
    );
  }
}


async function updateHelpdeskSlaTiming(
  client:
    PoolClient,
  companyId:
    string,
  recordId:
    string,
  nextStatus:
    string,
) {
  if (
    nextStatus ===
      'breached'
  ) {
    await client.query(
      `
        UPDATE ticket_sla_tracking
        SET
          breached_at =
            COALESCE(
              breached_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
      ],
    );
  }

  if (
    nextStatus ===
      'met'
  ) {
    await client.query(
      `
        UPDATE ticket_sla_tracking
        SET
          resolved_at =
            COALESCE(
              resolved_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
      ],
    );
  }
}


export function assertSpecialistExecutionMutationAllowed(
  moduleKey:
    string,
  table:
    string,
  operation:
    'create' |
    'update' |
    'delete',
  row:
    Record<
      string,
      unknown
    >,
) {
  if (
    operation ===
      'create'
  ) {
    return;
  }

  const status =
    String(
      row.status ||
      '',
    )
      .trim()
      .toLowerCase();

  const terminal:
    Record<
      string,
      {
        state: string;
        message: string;
      }
    > = {
    'inventory:inventory_adjustments': {
      state:
        'posted',
      message:
        'Posted inventory adjustments are immutable. Create a correcting adjustment instead.',
    },
    'warehouse:warehouse_picking_batches': {
      state:
        'completed',
      message:
        'Completed warehouse picking batches are immutable.',
    },
    'payroll:payslips': {
      state:
        'paid',
      message:
        'Paid payslips are immutable. Correct payroll through a new payroll run.',
    },
    'projects:project_budgets': {
      state:
        'closed',
      message:
        'Closed project budgets are immutable. Reopen through workflow before changing them.',
    },
    'helpdesk:ticket_sla_tracking': {
      state:
        'met',
      message:
        'Completed SLA tracking records are immutable.',
    },
    'manufacturing:manufacturing_material_reservations': {
      state:
        'consumed',
      message:
        'Consumed manufacturing reservations are immutable.',
    },
  };

  const rule =
    terminal[
      moduleKey +
      ':' +
      table
    ];

  if (
    rule &&
    status ===
      rule.state
  ) {
    throw new Error(
      rule.message,
    );
  }
}


export async function applySpecialistExecutionTransition(
  client:
    PoolClient,
  input: {
    moduleKey: string;
    table: string;
    companyId: string;
    userId: string;
    recordId: string;
    nextStatus: string;
  },
) {
  const {
    moduleKey,
    table,
    companyId,
    userId,
    recordId,
    nextStatus,
  } =
    input;

  if (
    moduleKey ===
      'inventory' &&
    table ===
      'inventory_adjustments' &&
    nextStatus ===
      'posted'
  ) {
    if (
      await tableExists(
        client,
        'stock_movements',
      )
    ) {
      await postInventoryAdjustment(
        client,
        companyId,
        userId,
        recordId,
      );
    }
  }

  if (
    moduleKey ===
      'warehouse' &&
    table ===
      'warehouse_picking_batches' &&
    nextStatus ===
      'completed'
  ) {
    await validateWarehouseBatchCompletion(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'payroll' &&
    table ===
      'payslips'
  ) {
    if (
      nextStatus ===
        'computed'
    ) {
      await computePayslip(
        client,
        companyId,
        recordId,
      );
    }

    if (
      nextStatus ===
        'approved'
    ) {
      const result =
        await client.query(
          `
            SELECT
              gross_amount,
              deduction_amount,
              net_amount
            FROM payslips
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            FOR UPDATE
          `,
          [
            recordId,
            companyId,
          ],
        );

      const row =
        result.rows[0];

      if (
        !row ||
        Number(
          row.gross_amount ||
          0,
        ) <=
          0 ||
        Number(
          row.net_amount ||
          0,
        ) <
          0
      ) {
        throw new Error(
          'Compute a valid payslip before approval.',
        );
      }

      await client.query(
        `
          UPDATE payslips
          SET
            approved_at =
              COALESCE(
                approved_at,
                NOW()
              ),
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );
    }

    if (
      nextStatus ===
        'paid'
    ) {
      await client.query(
        `
          UPDATE payslips
          SET
            paid_at =
              COALESCE(
                paid_at,
                NOW()
              ),
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'manufacturing' &&
    table ===
      'manufacturing_orders'
  ) {
    await validateManufacturingReadiness(
      client,
      companyId,
      recordId,
      nextStatus,
    );
  }

  if (
    moduleKey ===
      'projects' &&
    table ===
      'project_budgets' &&
    nextStatus ===
      'approved'
  ) {
    await validateProjectBudgetApproval(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'helpdesk' &&
    table ===
      'ticket_sla_tracking'
  ) {
    await updateHelpdeskSlaTiming(
      client,
      companyId,
      recordId,
      nextStatus,
    );
  }
}
