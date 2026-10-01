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


async function postPurchaseReceiptToInventory(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  receiptId:
    string,
) {
  const hasInventory =
    await tableExists(
      client,
      'stock_movements',
    ) &&
    await tableExists(
      client,
      'stock_levels',
    );

  if (
    !hasInventory
  ) {
    return;
  }

  const receipt =
    await client.query(
      `
        SELECT
          id,
          receipt_number,
          warehouse_reference
        FROM purchase_receipts
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        receiptId,
        companyId,
      ],
    );

  if (
    receipt.rows.length !==
      1
  ) {
    throw new Error(
      'Purchase receipt was not found.',
    );
  }

  const lines =
    await client.query(
      `
        SELECT
          id,
          product_reference,
          quantity_received,
          quantity_rejected
        FROM purchase_receipt_lines
        WHERE receipt_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        ORDER BY created_at, id
      `,
      [
        receiptId,
        companyId,
      ],
    );

  const stockLines =
    lines.rows
      .map(
        row => ({
          id:
            String(
              row.id,
            ),
          productId:
            row.product_reference
              ? String(
                  row.product_reference,
                )
              : '',
          quantity:
            Number(
              row.quantity_received ||
              0,
            ) -
            Number(
              row.quantity_rejected ||
              0,
            ),
        }),
      )
      .filter(
        line =>
          Boolean(
            line.productId,
          ) &&
          line.quantity >
            0,
      );

  if (
    stockLines.length ===
      0
  ) {
    return;
  }

  const warehouseId =
    receipt.rows[0]
      .warehouse_reference
      ? String(
          receipt.rows[0]
            .warehouse_reference,
        )
      : '';

  if (
    !warehouseId
  ) {
    throw new Error(
      'Choose a warehouse before posting a stock-bearing purchase receipt.',
    );
  }

  for (
    const line
    of stockLines
  ) {
    const movementReference =
      'purchase_receipt:' +
      receiptId +
      ':' +
      line.id;

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
          movementReference,
        ],
      );

    if (
      existing.rows.length >
        0
    ) {
      continue;
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
          $1,$2,'receipt',$3,$4,$5,$6,$6,NOW(),NOW()
        )
      `,
      [
        line.productId,
        warehouseId,
        line.quantity,
        movementReference,
        companyId,
        userId,
      ],
    );

    await client.query(
      `
        INSERT INTO stock_levels (
          product_id,
          warehouse_id,
          quantity,
          reorder_level,
          company_id,
          created_by,
          updated_by,
          updated_at
        )
        VALUES (
          $1,$2,$3,0,$4,$5,$5,NOW()
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
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `,
      [
        line.productId,
        warehouseId,
        line.quantity,
        companyId,
        userId,
      ],
    );
  }
}


async function reimburseExpenseReport(
  client:
    PoolClient,
  companyId:
    string,
  reportId:
    string,
) {
  const accountingEnabled =
    await tableExists(
      client,
      'accounting_expense_report_postings',
    );

  if (
    accountingEnabled
  ) {
    const financial =
      await client.query(
        `
          SELECT
            p.status,
            p.settlement_mode,
            COALESCE(
              b.outstanding_amount,
              0
            )::text AS outstanding_amount
          FROM accounting_expense_report_postings p
          LEFT JOIN accounting_expense_reimbursement_balances b
            ON b.company_id =
               p.company_id
           AND b.expense_report_id =
               p.expense_report_id
          WHERE p.company_id =
                $1
            AND p.expense_report_id =
                $2
            AND p.deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE OF p
        `,
        [
          companyId,
          reportId,
        ],
      );

    const posting =
      financial.rows[0];

    if (
      !posting ||
      String(
        posting.status ||
        '',
      ) !==
        'posted'
    ) {
      throw new Error(
        'Post this approved expense report through Accounting before marking it reimbursed.',
      );
    }

    if (
      String(
        posting.settlement_mode ||
        '',
      ) ===
        'employee_reimbursement' &&
      Number(
        posting.outstanding_amount ||
        0,
      ) >
        0.000001
    ) {
      throw new Error(
        'This expense report still has an outstanding employee reimbursement in Accounting.',
      );
    }
  }

  await client.query(
    `
      UPDATE expenses e
      SET
        status = 'paid',
        updated_at = NOW()
      WHERE e.company_id = $1
        AND e.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM expense_report_lines l
          WHERE l.report_id = $2
            AND l.expense_id = e.id
            AND l.company_id = e.company_id
            AND l.deleted_at IS NULL
        )
    `,
    [
      companyId,
      reportId,
    ],
  );
}


async function applySubscriptionChange(
  client:
    PoolClient,
  companyId:
    string,
  changeId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          subscription_id,
          change_type,
          to_plan_id,
          effective_date
        FROM subscription_changes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        changeId,
        companyId,
      ],
    );

  const change =
    result.rows[0];

  if (
    !change
  ) {
    throw new Error(
      'Subscription change was not found.',
    );
  }

  const type =
    String(
      change.change_type ||
      '',
    )
      .trim()
      .toLowerCase();

  if (
    (
      type ===
        'upgrade' ||
      type ===
        'downgrade'
    ) &&
    !change.to_plan_id
  ) {
    throw new Error(
      'Choose the target plan before applying this subscription change.',
    );
  }

  if (
    type ===
      'upgrade' ||
    type ===
      'downgrade'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          plan_id = $1,
          status = 'active'
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        change.to_plan_id,
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'pause'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET status = 'paused'
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'cancel'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          status = 'cancelled',
          end_date =
            COALESCE(
              end_date,
              $1
            )
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        change.effective_date,
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'resume' ||
    type ===
      'renew'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          status = 'active',
          end_date =
            CASE
              WHEN $1 = 'renew'
                THEN NULL
              ELSE end_date
            END
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        type,
        change.subscription_id,
        companyId,
      ],
    );
  }
}


async function completeRefund(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  refundId:
    string,
) {
  const refund =
    await client.query(
      `
        SELECT
          r.id,
          r.amount,
          r.refund_reference,
          p.payment_account_id,
          p.currency,
          p.counterparty_name
        FROM payment_refunds r
        INNER JOIN business_payments p
          ON p.id = r.payment_id
         AND p.company_id = r.company_id
         AND p.deleted_at IS NULL
        WHERE r.id = $1
          AND r.company_id = $2
          AND r.deleted_at IS NULL
        FOR UPDATE
      `,
      [
        refundId,
        companyId,
      ],
    );

  const row =
    refund.rows[0];

  if (
    !row
  ) {
    throw new Error(
      'Refund payment was not found.',
    );
  }

  const reference =
    'refund:' +
    refundId;

  await client.query(
    `
      INSERT INTO business_payments (
        payment_account_id,
        direction,
        amount,
        currency,
        paid_at,
        external_reference,
        counterparty_name,
        status,
        company_id,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      SELECT
        $1,
        'outbound',
        $2,
        $3,
        NOW(),
        $4,
        $5,
        'completed',
        $6,
        $7,
        $7,
        NOW(),
        NOW()
      WHERE NOT EXISTS (
        SELECT 1
        FROM business_payments
        WHERE company_id = $6
          AND external_reference = $4
          AND deleted_at IS NULL
      )
    `,
    [
      row.payment_account_id,
      row.amount,
      row.currency,
      reference,
      row.counterparty_name,
      companyId,
      userId,
    ],
  );
}


async function closeCommissionEntries(
  client:
    PoolClient,
  companyId:
    string,
  payoutId:
    string,
) {
  await client.query(
    `
      UPDATE commission_entries e
      SET
        status = 'paid',
        updated_at = NOW()
      WHERE e.company_id = $1
        AND e.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM commission_payout_lines l
          WHERE l.payout_id = $2
            AND l.commission_entry_id = e.id
            AND l.company_id = e.company_id
            AND l.deleted_at IS NULL
        )
    `,
    [
      companyId,
      payoutId,
    ],
  );
}


async function approveBudget(
  client:
    PoolClient,
  companyId:
    string,
  approvalId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          budget_id,
          approver_user_id
        FROM budget_approvals
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        approvalId,
        companyId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    return;
  }

  await client.query(
    `
      UPDATE budgets
      SET
        approved_at = NOW(),
        approved_by =
          COALESCE(
            $1,
            approved_by
          ),
        status = 'active',
        updated_at = NOW()
      WHERE id = $2
        AND company_id = $3
        AND deleted_at IS NULL
    `,
    [
      row.approver_user_id,
      row.budget_id,
      companyId,
    ],
  );
}


export async function applyFinanceSpecialistTransition(
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
      'purchase' &&
    table ===
      'purchase_receipts' &&
    nextStatus ===
      'posted'
  ) {
    await postPurchaseReceiptToInventory(
      client,
      companyId,
      userId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_reports' &&
    nextStatus ===
      'reimbursed'
  ) {
    await reimburseExpenseReport(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_changes' &&
    nextStatus ===
      'applied'
  ) {
    await applySubscriptionChange(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_refunds' &&
    nextStatus ===
      'completed'
  ) {
    await completeRefund(
      client,
      companyId,
      userId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_payouts' &&
    nextStatus ===
      'paid'
  ) {
    await closeCommissionEntries(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'budgeting' &&
    table ===
      'budget_approvals' &&
    nextStatus ===
      'approved'
  ) {
    await approveBudget(
      client,
      companyId,
      recordId,
    );
  }
}
