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


function assertPositive(
  value:
    unknown,
  label:
    string,
) {
  if (
    numberValue(
      value,
    ) <=
      0
  ) {
    throw new Error(
      label +
      ' must be greater than zero.',
    );
  }
}


function assertNonNegative(
  value:
    unknown,
  label:
    string,
) {
  if (
    numberValue(
      value,
    ) <
      0
  ) {
    throw new Error(
      label +
      ' cannot be negative.',
    );
  }
}


function assertDateOrder(
  startValue:
    unknown,
  endValue:
    unknown,
  label:
    string,
) {
  if (
    !startValue ||
    !endValue
  ) {
    return;
  }

  const start =
    Date.parse(
      String(
        startValue,
      ),
    );

  const end =
    Date.parse(
      String(
        endValue,
      ),
    );

  if (
    Number.isFinite(
      start,
    ) &&
    Number.isFinite(
      end,
    ) &&
    end <
      start
  ) {
    throw new Error(
      label +
      ' end cannot be before its start.',
    );
  }
}


function assertPercentage(
  value:
    unknown,
  label:
    string,
) {
  const numeric =
    numberValue(
      value,
    );

  if (
    numeric <
      0 ||
    numeric >
      100
  ) {
    throw new Error(
      label +
      ' must be between 0 and 100.',
    );
  }
}


function validateDomainRow(
  moduleKey:
    string,
  table:
    string,
  row:
    Record<
      string,
      unknown
    >,
) {
  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expenses'
  ) {
    assertPositive(
      row.amount,
      'Expense amount',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'business_payments'
  ) {
    assertPositive(
      row.amount,
      'Payment amount',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_allocations'
  ) {
    assertPositive(
      row.amount,
      'Allocated amount',
    );
  }

  if (
    moduleKey ===
      'payroll' &&
    table ===
      'payroll_employees'
  ) {
    assertNonNegative(
      row.basic_salary,
      'Basic salary',
    );
  }

  if (
    moduleKey ===
      'payroll' &&
    table ===
      'payroll_run_lines'
  ) {
    assertNonNegative(
      row.gross_amount,
      'Gross pay',
    );

    assertNonNegative(
      row.deductions,
      'Payroll deductions',
    );
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_order_items'
  ) {
    assertPositive(
      row.quantity,
      'Purchase quantity',
    );

    assertNonNegative(
      row.unit_cost,
      'Unit cost',
    );
  }

  if (
    moduleKey ===
      'manufacturing' &&
    (
      table ===
        'boms' ||
      table ===
        'bom_items'
    )
  ) {
    assertPositive(
      row.quantity,
      'Manufacturing quantity',
    );
  }

  if (
    moduleKey ===
      'manufacturing' &&
    table ===
      'manufacturing_orders'
  ) {
    assertPositive(
      row.planned_quantity,
      'Planned quantity',
    );

    assertNonNegative(
      row.produced_quantity,
      'Produced quantity',
    );
  }

  if (
    moduleKey ===
      'time_off' &&
    table ===
      'leave_requests'
  ) {
    assertPositive(
      row.days,
      'Leave days',
    );

    const start =
      Date.parse(
        String(
          row.start_date ||
          '',
        ),
      );

    const end =
      Date.parse(
        String(
          row.end_date ||
          '',
        ),
      );

    if (
      Number.isFinite(
        start,
      ) &&
      Number.isFinite(
        end,
      ) &&
      end <
        start
    ) {
      throw new Error(
        'Leave end date cannot be before the start date.',
      );
    }
  }

  if (
    moduleKey ===
      'projects' &&
    table ===
      'projects' &&
    row.start_date &&
    row.due_date
  ) {
    const start =
      Date.parse(
        String(
          row.start_date,
        ),
      );

    const due =
      Date.parse(
        String(
          row.due_date,
        ),
      );

    if (
      Number.isFinite(
        start,
      ) &&
      Number.isFinite(
        due,
      ) &&
      due <
        start
    ) {
      throw new Error(
        'Project due date cannot be before the start date.',
      );
    }
  }

  if (
    moduleKey ===
      'billing' &&
    table ===
      'billing_accounts'
  ) {
    assertNonNegative(
      row.credit_limit,
      'Credit limit',
    );
  }

  if (
    moduleKey ===
      'billing' &&
    (
      table ===
        'billing_schedules' ||
      table ===
        'billing_charges'
    )
  ) {
    assertNonNegative(
      row.amount,
      table ===
        'billing_schedules'
        ? 'Scheduled amount'
        : 'Charge amount',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_plans'
  ) {
    assertNonNegative(
      row.price,
      'Subscription price',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_payments'
  ) {
    assertPositive(
      row.amount,
      'Subscription payment',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscriptions'
  ) {
    assertDateOrder(
      row.start_date,
      row.end_date,
      'Subscription',
    );
  }

  if (
    moduleKey ===
      'tax' &&
    table ===
      'tax_filings'
  ) {
    assertDateOrder(
      row.period_start,
      row.period_end,
      'Tax filing period',
    );

    assertNonNegative(
      row.taxable_amount,
      'Taxable amount',
    );

    assertNonNegative(
      row.tax_amount,
      'Tax amount',
    );
  }

  if (
    moduleKey ===
      'tax' &&
    table ===
      'tax_payments'
  ) {
    assertPositive(
      row.amount,
      'Tax payment',
    );
  }

  if (
    moduleKey ===
      'budgeting' &&
    table ===
      'budget_lines'
  ) {
    assertDateOrder(
      row.period_start,
      row.period_end,
      'Budget period',
    );
  }

  if (
    moduleKey ===
      'cash_flow' &&
    table ===
      'cash_flow_forecasts'
  ) {
    assertDateOrder(
      row.period_start,
      row.period_end,
      'Cash-flow forecast period',
    );
  }

  if (
    moduleKey ===
      'cash_flow' &&
    table ===
      'cash_flow_items'
  ) {
    assertPositive(
      row.amount,
      'Cash-flow item amount',
    );

    assertPercentage(
      row.probability,
      'Cash-flow probability',
    );
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'fixed_assets'
  ) {
    assertNonNegative(
      row.acquisition_cost,
      'Acquisition cost',
    );

    assertNonNegative(
      row.salvage_value,
      'Salvage value',
    );

    if (
      numberValue(
        row.salvage_value,
      ) >
      numberValue(
        row.acquisition_cost,
      )
    ) {
      throw new Error(
        'Salvage value cannot exceed acquisition cost.',
      );
    }

    if (
      row.useful_life_months !==
        null &&
      row.useful_life_months !==
        undefined
    ) {
      assertPositive(
        row.useful_life_months,
        'Useful life',
      );
    }
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'asset_depreciation_entries'
  ) {
    assertNonNegative(
      row.depreciation_amount,
      'Depreciation amount',
    );

    assertNonNegative(
      row.accumulated_depreciation,
      'Accumulated depreciation',
    );

    assertNonNegative(
      row.book_value,
      'Book value',
    );
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'asset_disposals'
  ) {
    assertNonNegative(
      row.proceeds,
      'Disposal proceeds',
    );
  }

  if (
    moduleKey ===
      'appointments' &&
    table ===
      'appointment_services'
  ) {
    assertPositive(
      row.duration_minutes,
      'Service duration',
    );

    assertNonNegative(
      row.price,
      'Service price',
    );
  }

  if (
    moduleKey ===
      'appointments' &&
    table ===
      'appointments'
  ) {
    assertDateOrder(
      row.start_at,
      row.end_at,
      'Appointment',
    );
  }

  if (
    moduleKey ===
      'bookings' &&
    table ===
      'booking_resources'
  ) {
    assertPositive(
      row.capacity,
      'Booking capacity',
    );
  }

  if (
    moduleKey ===
      'bookings' &&
    table ===
      'bookings'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Booking',
    );
  }

  if (
    moduleKey ===
      'bookings' &&
    table ===
      'booking_availability_rules' &&
    row.weekday !==
      null &&
    row.weekday !==
      undefined
  ) {
    const weekday =
      numberValue(
        row.weekday,
      );

    if (
      weekday <
        0 ||
      weekday >
        6
    ) {
      throw new Error(
        'Booking weekday must be between 0 and 6.',
      );
    }
  }

  if (
    moduleKey ===
      'field_services' &&
    table ===
      'service_orders'
  ) {
    assertDateOrder(
      row.scheduled_start,
      row.scheduled_end,
      'Service schedule',
    );
  }

  if (
    moduleKey ===
      'field_services' &&
    table ===
      'service_visits'
  ) {
    assertDateOrder(
      row.started_at,
      row.completed_at,
      'Service visit',
    );
  }

  if (
    moduleKey ===
      'field_services' &&
    table ===
      'service_materials'
  ) {
    assertPositive(
      row.quantity,
      'Service material quantity',
    );

    assertNonNegative(
      row.unit_cost,
      'Service material unit cost',
    );
  }

  if (
    moduleKey ===
      'work_orders' &&
    table ===
      'work_orders'
  ) {
    assertDateOrder(
      row.scheduled_at,
      row.due_at,
      'Work order schedule',
    );
  }

  if (
    moduleKey ===
      'work_orders' &&
    table ===
      'work_order_materials'
  ) {
    assertPositive(
      row.quantity,
      'Work-order material quantity',
    );

    assertNonNegative(
      row.unit_cost,
      'Work-order material unit cost',
    );
  }


  if (
    moduleKey ===
      'attendance' &&
    table ===
      'attendance_policies'
  ) {
    assertNonNegative(
      row.grace_minutes,
      'Attendance grace minutes',
    );
  }

  if (
    moduleKey ===
      'attendance' &&
    table ===
      'attendance_entries'
  ) {
    assertNonNegative(
      row.worked_minutes,
      'Worked minutes',
    );

    assertNonNegative(
      row.late_minutes,
      'Late minutes',
    );

    assertDateOrder(
      row.clock_in,
      row.clock_out,
      'Attendance entry',
    );
  }

  if (
    moduleKey ===
      'shifts' &&
    table ===
      'shift_templates'
  ) {
    assertNonNegative(
      row.break_minutes,
      'Shift break minutes',
    );
  }

  if (
    moduleKey ===
      'shifts' &&
    table ===
      'shift_schedules'
  ) {
    assertDateOrder(
      row.period_start,
      row.period_end,
      'Shift schedule period',
    );
  }

  if (
    moduleKey ===
      'shifts' &&
    table ===
      'shift_assignments'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Shift assignment',
    );
  }

  if (
    moduleKey ===
      'timesheets' &&
    table ===
      'time_entries'
  ) {
    assertNonNegative(
      row.hours,
      'Timesheet hours',
    );

    assertDateOrder(
      row.start_time,
      row.end_time,
      'Time entry',
    );
  }

  if (
    moduleKey ===
      'appraisals' &&
    table ===
      'appraisal_cycles'
  ) {
    assertDateOrder(
      row.start_date,
      row.end_date,
      'Appraisal cycle',
    );
  }

  if (
    moduleKey ===
      'benefits' &&
    table ===
      'benefit_plans'
  ) {
    assertNonNegative(
      row.employer_cost,
      'Employer benefit cost',
    );

    assertNonNegative(
      row.employee_cost,
      'Employee benefit cost',
    );

    assertDateOrder(
      row.effective_from,
      row.effective_to,
      'Benefit plan',
    );
  }

  if (
    moduleKey ===
      'benefits' &&
    table ===
      'benefit_enrollments'
  ) {
    assertDateOrder(
      row.enrolled_at,
      row.ended_at,
      'Benefit enrollment',
    );
  }

  if (
    moduleKey ===
      'learning' &&
    table ===
      'learning_courses' &&
    row.estimated_minutes !==
      null &&
    row.estimated_minutes !==
      undefined
  ) {
    assertPositive(
      row.estimated_minutes,
      'Estimated learning minutes',
    );
  }

  if (
    moduleKey ===
      'learning' &&
    table ===
      'learning_enrollments'
  ) {
    assertPercentage(
      row.progress_percent,
      'Learning progress',
    );
  }

  if (
    moduleKey ===
      'onboarding' &&
    table ===
      'employee_onboardings'
  ) {
    assertDateOrder(
      row.start_date,
      row.target_completion_date,
      'Employee onboarding',
    );
  }

  if (
    moduleKey ===
      'rentals' &&
    table ===
      'rental_items'
  ) {
    assertNonNegative(
      row.rental_rate,
      'Rental rate',
    );
  }

  if (
    moduleKey ===
      'rentals' &&
    table ===
      'rental_contracts'
  ) {
    assertDateOrder(
      row.start_date,
      row.expected_return_date,
      'Rental contract',
    );

    assertDateOrder(
      row.start_date,
      row.actual_return_date,
      'Rental return',
    );

    assertNonNegative(
      row.total_amount,
      'Rental total',
    );
  }

  if (
    moduleKey ===
      'fleet' &&
    table ===
      'vehicles'
  ) {
    assertNonNegative(
      row.mileage,
      'Vehicle mileage',
    );
  }

  if (
    moduleKey ===
      'fleet' &&
    table ===
      'vehicle_assignments'
  ) {
    assertDateOrder(
      row.assigned_from,
      row.assigned_to,
      'Vehicle assignment',
    );
  }

  if (
    moduleKey ===
      'fleet' &&
    table ===
      'fleet_services'
  ) {
    assertNonNegative(
      row.mileage,
      'Service mileage',
    );

    assertNonNegative(
      row.cost,
      'Fleet service cost',
    );
  }

  if (
    moduleKey ===
      'safety' &&
    table ===
      'safety_checks'
  ) {
    assertDateOrder(
      row.scheduled_at,
      row.completed_at,
      'Safety check',
    );
  }

  if (
    moduleKey ===
      'ads' &&
    table ===
      'ad_campaigns'
  ) {
    assertNonNegative(
      row.budget_amount,
      'Ad campaign budget',
    );

    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Ad campaign',
    );
  }

  if (
    moduleKey ===
      'ads' &&
    table ===
      'ad_daily_metrics'
  ) {
    assertNonNegative(
      row.impressions,
      'Ad impressions',
    );
    assertNonNegative(
      row.clicks,
      'Ad clicks',
    );
    assertNonNegative(
      row.conversions,
      'Ad conversions',
    );
    assertNonNegative(
      row.spend,
      'Ad spend',
    );
  }

  if (
    moduleKey ===
      'calendar' &&
    table ===
      'calendar_events'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Calendar event',
    );
  }

  if (
    moduleKey ===
      'checkout' &&
    table ===
      'checkout_links'
  ) {
    assertNonNegative(
      row.amount,
      'Checkout link amount',
    );
  }

  if (
    moduleKey ===
      'checkout' &&
    table ===
      'checkout_sessions'
  ) {
    assertPositive(
      row.amount,
      'Checkout session amount',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_plans'
  ) {
    assertPercentage(
      row.rate,
      'Commission rate',
    );

    assertDateOrder(
      row.effective_from,
      row.effective_to,
      'Commission plan',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_assignments'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Commission assignment',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_entries'
  ) {
    assertNonNegative(
      row.base_amount,
      'Commission base amount',
    );

    assertNonNegative(
      row.commission_amount,
      'Commission amount',
    );
  }

  if (
    moduleKey ===
      'demand_planning' &&
    table ===
      'demand_forecasts'
  ) {
    assertDateOrder(
      row.horizon_start,
      row.horizon_end,
      'Demand forecast horizon',
    );
  }

  if (
    moduleKey ===
      'demand_planning' &&
    table ===
      'demand_forecast_lines'
  ) {
    assertNonNegative(
      row.forecast_quantity,
      'Forecast quantity',
    );

    assertPercentage(
      row.confidence,
      'Forecast confidence',
    );

    assertDateOrder(
      row.period_start,
      row.period_end,
      'Demand forecast period',
    );
  }

  if (
    moduleKey ===
      'demand_planning' &&
    table ===
      'replenishment_recommendations'
  ) {
    assertPositive(
      row.recommended_quantity,
      'Recommended replenishment quantity',
    );
  }

  if (
    moduleKey ===
      'ecommerce' &&
    table ===
      'storefront_products'
  ) {
    assertNonNegative(
      row.price,
      'Storefront product price',
    );
  }

  if (
    moduleKey ===
      'ecommerce' &&
    table ===
      'storefront_order_lines'
  ) {
    assertPositive(
      row.quantity,
      'Storefront order quantity',
    );

    assertNonNegative(
      row.unit_price,
      'Storefront unit price',
    );
  }

  if (
    moduleKey ===
      'events' &&
    table ===
      'events'
  ) {
    assertDateOrder(
      row.start_at,
      row.end_at,
      'Event',
    );

    assertNonNegative(
      row.capacity,
      'Event capacity',
    );
  }

  if (
    moduleKey ===
      'facilities' &&
    (
      table ===
        'facilities' ||
      table ===
        'facility_spaces'
    )
  ) {
    assertNonNegative(
      row.capacity,
      'Facility capacity',
    );
  }

  if (
    moduleKey ===
      'gift_cards' &&
    table ===
      'gift_card_programs' &&
    row.expires_after_days !==
      null &&
    row.expires_after_days !==
      undefined
  ) {
    assertPositive(
      row.expires_after_days,
      'Gift-card expiry days',
    );
  }

  if (
    moduleKey ===
      'gift_cards' &&
    table ===
      'gift_cards'
  ) {
    assertNonNegative(
      row.initial_value,
      'Gift-card initial value',
    );

    assertNonNegative(
      row.balance,
      'Gift-card balance',
    );

    if (
      numberValue(
        row.balance,
      ) >
      numberValue(
        row.initial_value,
      )
    ) {
      throw new Error(
        'Gift-card balance cannot exceed its initial value.',
      );
    }
  }

  if (
    moduleKey ===
      'gift_cards' &&
    table ===
      'gift_card_transactions'
  ) {
    assertPositive(
      row.amount,
      'Gift-card transaction amount',
    );
  }

  if (
    moduleKey ===
      'inspections' &&
    table ===
      'inspections'
  ) {
    assertDateOrder(
      row.scheduled_at,
      row.completed_at,
      'Inspection',
    );

    if (
      row.score !==
        null &&
      row.score !==
        undefined
    ) {
      assertPercentage(
        row.score,
        'Inspection score',
      );
    }
  }

  if (
    moduleKey ===
      'loyalty' &&
    table ===
      'loyalty_programs'
  ) {
    assertNonNegative(
      row.earning_rate,
      'Loyalty earning rate',
    );

    assertNonNegative(
      row.redemption_rate,
      'Loyalty redemption rate',
    );
  }

  if (
    moduleKey ===
      'loyalty' &&
    table ===
      'loyalty_members'
  ) {
    assertNonNegative(
      row.points_balance,
      'Loyalty points balance',
    );
  }

  if (
    moduleKey ===
      'maintenance' &&
    table ===
      'maintenance_requests'
  ) {
    assertDateOrder(
      row.scheduled_date,
      row.completed_date,
      'Maintenance request',
    );
  }

  if (
    moduleKey ===
      'maintenance' &&
    table ===
      'maintenance_logs'
  ) {
    assertNonNegative(
      row.cost,
      'Maintenance cost',
    );
  }

  if (
    moduleKey ===
      'marketing_automation' &&
    table ===
      'automation_steps'
  ) {
    assertNonNegative(
      row.step_order,
      'Automation step order',
    );
  }

  if (
    moduleKey ===
      'marketing_automation' &&
    table ===
      'automation_runs'
  ) {
    assertDateOrder(
      row.started_at,
      row.completed_at,
      'Marketing automation run',
    );
  }

  if (
    moduleKey ===
      'marketplace' &&
    table ===
      'marketplace_sellers'
  ) {
    assertPercentage(
      row.commission_rate,
      'Marketplace commission rate',
    );
  }

  if (
    moduleKey ===
      'marketplace' &&
    table ===
      'marketplace_listings'
  ) {
    assertNonNegative(
      row.price,
      'Marketplace listing price',
    );

    assertNonNegative(
      row.stock_quantity,
      'Marketplace stock quantity',
    );
  }

  if (
    moduleKey ===
      'marketplace' &&
    table ===
      'marketplace_order_lines'
  ) {
    assertPositive(
      row.quantity,
      'Marketplace order quantity',
    );

    assertNonNegative(
      row.line_total,
      'Marketplace line total',
    );

    assertNonNegative(
      row.commission_amount,
      'Marketplace commission amount',
    );

    if (
      numberValue(
        row.commission_amount,
      ) >
      numberValue(
        row.line_total,
      )
    ) {
      throw new Error(
        'Marketplace commission cannot exceed the line total.',
      );
    }
  }

  if (
    moduleKey ===
      'meetings' &&
    table ===
      'meetings'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Meeting',
    );
  }

  if (
    moduleKey ===
      'org_chart' &&
    table ===
      'org_position_history'
  ) {
    assertDateOrder(
      row.starts_at,
      row.ends_at,
      'Organization-position history',
    );
  }

  if (
    moduleKey ===
      'planning' &&
    table ===
      'planning_shifts'
  ) {
    assertDateOrder(
      row.start_at,
      row.end_at,
      'Planning shift',
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'menu_items'
  ) {
    assertNonNegative(
      row.price,
      'Menu item price',
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'restaurant_tables'
  ) {
    assertPositive(
      row.seats,
      'Restaurant table seats',
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'restaurant_order_items'
  ) {
    assertPositive(
      row.quantity,
      'Restaurant item quantity',
    );

    assertNonNegative(
      row.unit_price,
      'Restaurant item unit price',
    );
  }

  if (
    moduleKey ===
      'pos_shop' &&
    table ===
      'shop_products'
  ) {
    assertNonNegative(
      row.price,
      'Shop product price',
    );

    assertPercentage(
      row.tax_rate,
      'Shop product tax rate',
    );

    assertNonNegative(
      row.stock_quantity,
      'Shop stock quantity',
    );
  }

  if (
    moduleKey ===
      'pos_shop' &&
    table ===
      'shop_order_items'
  ) {
    assertPositive(
      row.quantity,
      'Shop order quantity',
    );

    assertNonNegative(
      row.unit_price,
      'Shop order unit price',
    );
  }

  if (
    moduleKey ===
      'seo' &&
    table ===
      'seo_rankings'
  ) {
    assertNonNegative(
      row.position,
      'SEO ranking position',
    );

    assertNonNegative(
      row.search_volume,
      'SEO search volume',
    );

    assertNonNegative(
      row.clicks,
      'SEO clicks',
    );

    assertNonNegative(
      row.impressions,
      'SEO impressions',
    );
  }

  if (
    moduleKey ===
      'shipping' &&
    table ===
      'shipments'
  ) {
    assertDateOrder(
      row.shipped_at,
      row.delivered_at,
      'Shipment',
    );
  }

  if (
    moduleKey ===
      'shipping' &&
    table ===
      'shipment_packages'
  ) {
    for (
      const [
        value,
        label,
      ]
      of [
        [
          row.weight,
          'Package weight',
        ],
        [
          row.length,
          'Package length',
        ],
        [
          row.width,
          'Package width',
        ],
        [
          row.height,
          'Package height',
        ],
      ] as const
    ) {
      assertNonNegative(
        value,
        label,
      );
    }
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signature_requests'
  ) {
    assertDateOrder(
      row.sent_at,
      row.completed_at,
      'Signature request',
    );
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signers'
  ) {
    assertPositive(
      row.signing_order,
      'Signer order',
    );
  }

  if (
    moduleKey ===
      'surveys' &&
    table ===
      'surveys'
  ) {
    assertDateOrder(
      row.opens_at,
      row.closes_at,
      'Survey',
    );
  }

  if (
    moduleKey ===
      'warehouse' &&
    table ===
      'warehouse_operations'
  ) {
    assertDateOrder(
      row.scheduled_at,
      row.completed_at,
      'Warehouse operation',
    );
  }

  if (
    moduleKey ===
      'warehouse' &&
    table ===
      'warehouse_operation_lines'
  ) {
    assertPositive(
      row.quantity,
      'Warehouse operation quantity',
    );
  }

  if (
    moduleKey ===
      'web_analytics' &&
    table ===
      'analytics_sessions'
  ) {
    assertDateOrder(
      row.started_at,
      row.ended_at,
      'Analytics session',
    );
  }

  if (
    moduleKey ===
      'web_analytics' &&
    table ===
      'analytics_conversions'
  ) {
    assertNonNegative(
      row.value,
      'Analytics conversion value',
    );
  }

  if (
    moduleKey ===
      'whiteboard' &&
    table ===
      'whiteboards'
  ) {
    assertPositive(
      row.width,
      'Whiteboard width',
    );

    assertPositive(
      row.height,
      'Whiteboard height',
    );
  }

  if (
    moduleKey ===
      'whiteboard' &&
    table ===
      'whiteboard_versions'
  ) {
    assertPositive(
      row.version_number,
      'Whiteboard version',
    );
  }

}


async function validateDomainLifecycleMutation(
  client:
    PoolClient,
  moduleKey:
    string,
  table:
    string,
  companyId:
    string,
  operation:
    MutationOperation,
  row:
    Record<
      string,
      unknown
    >,
) {
  if (
    moduleKey ===
      'accounting' &&
    table ===
      'journals' &&
    operation !==
      'create' &&
    String(
      row.status ||
      '',
    )
      .toLowerCase() ===
      'posted'
  ) {
    throw new Error(
      'Posted journals are immutable. Reverse the journal instead of editing or deleting it.',
    );
  }

  if (
    moduleKey ===
      'accounting' &&
    table ===
      'journal_lines' &&
    row.journal_id
  ) {
    const parent =
      await client.query(
        `
          SELECT status
          FROM journals
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          row.journal_id,
          companyId,
        ],
      );

    if (
      String(
        parent.rows[0]
          ?.status ||
        '',
      )
        .toLowerCase() ===
        'posted'
    ) {
      throw new Error(
        'Lines on a posted journal are immutable. Reverse the journal instead.',
      );
    }
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_orders' &&
    operation !==
      'create' &&
    ![
      '',
      'draft',
    ].includes(
      String(
        row.status ||
        '',
      )
        .toLowerCase(),
    )
  ) {
    throw new Error(
      'Confirmed purchase orders cannot be edited or deleted directly. Use the purchase workflow.',
    );
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_order_items' &&
    row.purchase_order_id
  ) {
    const parent =
      await client.query(
        `
          SELECT status
          FROM purchase_orders
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          row.purchase_order_id,
          companyId,
        ],
      );

    const parentStatus =
      String(
        parent.rows[0]
          ?.status ||
        '',
      )
        .toLowerCase();

    if (
      parentStatus &&
      parentStatus !==
        'draft'
    ) {
      throw new Error(
        'Purchase-order lines cannot change after the order leaves draft.',
      );
    }
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_reconciliations' &&
    operation ===
      'update' &&
    row.reconciled_at
  ) {
    throw new Error(
      'Completed reconciliation history is immutable. Create a compensating reconciliation instead.',
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

  await validateDomainLifecycleMutation(
    client,
    moduleKey,
    table,
    companyId,
    operation,
    row,
  );

  if (
    operation !==
      'delete'
  ) {
    validateDomainRow(
      moduleKey,
      table,
      row,
    );

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
