import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  applyFinanceSpecialistTransition,
} from '@/lib/apps/enterprise/specialist-finance-transitions';

import {
  applySpecialistExecutionTransition,
} from '@/lib/apps/enterprise/specialist-execution';


export async function applyEnterpriseTransitionEffects(
  client:
    PoolClient,
  context: {
    moduleKey: string;
    companyId: string;
    userId: string;
  },
  table:
    string,
  recordId:
    string,
  next:
    string,
) {
  if (
    context.moduleKey ===
      'accounting' &&
    table ===
      'journals' &&
    next ===
      'posted'
  ) {
    const balance =
      await client.query(
        `
          SELECT
            COUNT(*)::int
              AS line_count,
            COALESCE(
              SUM(debit),
              0
            )
              AS debit_total,
            COALESCE(
              SUM(credit),
              0
            )
              AS credit_total
          FROM journal_lines
          WHERE journal_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          context.companyId,
        ],
      );

    const row =
      balance.rows[0] ||
      {};

    const debit =
      Number(
        row.debit_total ||
        0,
      );

    const credit =
      Number(
        row.credit_total ||
        0,
      );

    if (
      Number(
        row.line_count ||
        0,
      ) ===
        0 ||
      debit <=
        0 ||
      Math.abs(
        debit -
        credit,
      ) >
        0.005
    ) {
      throw new Error(
        'A journal can only be posted when it has balanced debit and credit lines.',
      );
    }
  }

  if (
    context.moduleKey ===
      'purchase' &&
    table ===
      'purchase_orders' &&
    [
      'confirmed',
      'received',
      'closed',
    ].includes(
      next,
    )
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
        WHERE po.id = $1
          AND po.company_id = $2
      `,
      [
        recordId,
        context.companyId,
      ],
    );
  }

  if (
    context.moduleKey ===
      'manufacturing' &&
    table ===
      'manufacturing_orders' &&
    next ===
      'completed'
  ) {
    const quantity =
      await client.query(
        `
          SELECT
            planned_quantity,
            produced_quantity
          FROM manufacturing_orders
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          recordId,
          context.companyId,
        ],
      );

    if (
      quantity.rows.length !==
        1 ||
      Number(
        quantity.rows[0]
          .produced_quantity ||
        0,
      ) <=
        0
    ) {
      throw new Error(
        'Record produced quantity before completing a manufacturing order.',
      );
    }
  }

  await applyFinanceSpecialistTransition(
    client,
    {
      moduleKey:
        context.moduleKey,
      table,
      companyId:
        context.companyId,
      userId:
        context.userId,
      recordId,
      nextStatus:
        next,
    },
  );

  await applySpecialistExecutionTransition(
    client,
    {
      moduleKey:
        context.moduleKey,
      table,
      companyId:
        context.companyId,
      userId:
        context.userId,
      recordId,
      nextStatus:
        next,
    },
  );
}
