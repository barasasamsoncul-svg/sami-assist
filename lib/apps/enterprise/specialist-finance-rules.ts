type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


function numberValue(
  value:
    unknown,
) {
  const numeric =
    Number(
      value ||
      0,
    );

  return Number.isFinite(
    numeric,
  )
    ? numeric
    : 0;
}


function positive(
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


function nonNegative(
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


function percentage(
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


function dateOrder(
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


export function validateFinanceSpecialistRow(
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
      'purchase' &&
    table ===
      'purchase_requisitions'
  ) {
    nonNegative(
      row.estimated_total,
      'Purchase requisition total',
    );
    dateOrder(
      row.requested_date,
      row.needed_by,
      'Purchase requisition',
    );
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_requisition_lines'
  ) {
    positive(
      row.quantity,
      'Requisition quantity',
    );
    nonNegative(
      row.estimated_unit_cost,
      'Estimated unit cost',
    );
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_receipt_lines'
  ) {
    nonNegative(
      row.quantity_received,
      'Received quantity',
    );
    nonNegative(
      row.quantity_rejected,
      'Rejected quantity',
    );

    if (
      numberValue(
        row.quantity_rejected,
      ) >
      numberValue(
        row.quantity_received,
      )
    ) {
      throw new Error(
        'Rejected quantity cannot exceed received quantity.',
      );
    }
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_policies'
  ) {
    for (
      const [
        value,
        label,
      ]
      of [
        [row.daily_limit, 'Daily expense limit'],
        [row.per_claim_limit, 'Per-claim expense limit'],
        [row.receipt_required_above, 'Receipt threshold'],
      ] as const
    ) {
      if (
        value !== null &&
        value !== undefined
      ) {
        nonNegative(
          value,
          label,
        );
      }
    }
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_reports'
  ) {
    dateOrder(
      row.period_start,
      row.period_end,
      'Expense report period',
    );
    nonNegative(
      row.total_amount,
      'Expense report total',
    );
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_report_lines'
  ) {
    positive(
      row.amount,
      'Expense report line amount',
    );
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_mileage_rates'
  ) {
    nonNegative(
      row.rate_per_unit,
      'Mileage rate',
    );
    dateOrder(
      row.effective_from,
      row.effective_to,
      'Mileage rate',
    );
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'asset_categories' &&
    row.default_useful_life_months !==
      null &&
    row.default_useful_life_months !==
      undefined
  ) {
    positive(
      row.default_useful_life_months,
      'Default useful life',
    );
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'asset_impairments'
  ) {
    nonNegative(
      row.previous_book_value,
      'Previous book value',
    );
    nonNegative(
      row.impairment_amount,
      'Impairment amount',
    );
    nonNegative(
      row.new_book_value,
      'New book value',
    );

    if (
      numberValue(
        row.impairment_amount,
      ) >
      numberValue(
        row.previous_book_value,
      )
    ) {
      throw new Error(
        'Impairment amount cannot exceed the previous book value.',
      );
    }

    const expected =
      numberValue(
        row.previous_book_value,
      ) -
      numberValue(
        row.impairment_amount,
      );

    if (
      Math.abs(
        expected -
        numberValue(
          row.new_book_value,
        ),
      ) >
      0.0001
    ) {
      throw new Error(
        'New book value must equal previous book value minus impairment.',
      );
    }
  }

  if (
    moduleKey ===
      'fixed_assets' &&
    table ===
      'asset_insurance_policies'
  ) {
    nonNegative(
      row.insured_value,
      'Insured asset value',
    );
    nonNegative(
      row.premium_amount,
      'Insurance premium',
    );
    dateOrder(
      row.coverage_start,
      row.coverage_end,
      'Asset insurance coverage',
    );
  }

  if (
    moduleKey ===
      'tax' &&
    table ===
      'tax_codes'
  ) {
    nonNegative(
      row.rate,
      'Tax rate',
    );
    percentage(
      row.recoverable_percent,
      'Recoverable tax percentage',
    );
    dateOrder(
      row.effective_from,
      row.effective_to,
      'Tax code',
    );
  }

  if (
    moduleKey ===
      'tax' &&
    table ===
      'tax_rules'
  ) {
    nonNegative(
      row.priority,
      'Tax rule priority',
    );
    dateOrder(
      row.valid_from,
      row.valid_to,
      'Tax rule',
    );
  }

  if (
    moduleKey ===
      'tax' &&
    table ===
      'withholding_certificates'
  ) {
    nonNegative(
      row.gross_amount,
      'Withholding gross amount',
    );
    nonNegative(
      row.withheld_amount,
      'Withheld amount',
    );

    if (
      numberValue(
        row.withheld_amount,
      ) >
      numberValue(
        row.gross_amount,
      )
    ) {
      throw new Error(
        'Withheld amount cannot exceed gross amount.',
      );
    }

    dateOrder(
      row.period_start,
      row.period_end,
      'Withholding period',
    );
  }

  if (
    moduleKey ===
      'budgeting' &&
    table ===
      'budget_scenarios'
  ) {
    percentage(
      row.probability,
      'Budget scenario probability',
    );
  }

  if (
    moduleKey ===
      'budgeting' &&
    table ===
      'budget_scenario_lines'
  ) {
    nonNegative(
      row.planned_amount,
      'Scenario planned amount',
    );
  }

  if (
    moduleKey ===
      'cash_flow' &&
    table ===
      'cash_flow_scenarios'
  ) {
    percentage(
      row.probability,
      'Cash-flow scenario probability',
    );
  }

  if (
    moduleKey ===
      'cash_flow' &&
    table ===
      'cash_flow_scenario_items'
  ) {
    nonNegative(
      row.amount,
      'Scenario cash amount',
    );
    percentage(
      row.probability,
      'Scenario cash probability',
    );
  }

  if (
    moduleKey ===
      'billing' &&
    table ===
      'billing_cycles'
  ) {
    dateOrder(
      row.period_start,
      row.period_end,
      'Billing cycle',
    );
    nonNegative(
      row.issued_count,
      'Issued billing count',
    );
    nonNegative(
      row.total_amount,
      'Billing-cycle total',
    );
  }

  if (
    moduleKey ===
      'billing' &&
    table ===
      'billing_account_balances'
  ) {
    for (
      const [
        value,
        label,
      ]
      of [
        [row.invoiced_amount, 'Invoiced amount'],
        [row.paid_amount, 'Paid amount'],
        [row.credit_amount, 'Credit amount'],
        [row.overdue_amount, 'Overdue amount'],
      ] as const
    ) {
      nonNegative(
        value,
        label,
      );
    }

    if (
      numberValue(
        row.overdue_amount,
      ) >
      Math.max(
        0,
        numberValue(
          row.outstanding_amount,
        ),
      )
    ) {
      throw new Error(
        'Overdue amount cannot exceed the outstanding balance.',
      );
    }
  }

  if (
    moduleKey ===
      'billing' &&
    table ===
      'billing_dunning_cases'
  ) {
    positive(
      row.overdue_amount,
      'Dunning overdue amount',
    );
    positive(
      row.stage,
      'Dunning stage',
    );
    dateOrder(
      row.opened_at,
      row.closed_at,
      'Dunning case',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_plan_prices'
  ) {
    nonNegative(
      row.amount,
      'Subscription plan price',
    );
    dateOrder(
      row.effective_from,
      row.effective_to,
      'Subscription plan price',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_usage_charges'
  ) {
    dateOrder(
      row.period_start,
      row.period_end,
      'Subscription usage period',
    );
    nonNegative(
      row.quantity,
      'Subscription usage quantity',
    );
    nonNegative(
      row.unit_price,
      'Subscription usage unit price',
    );
    nonNegative(
      row.amount,
      'Subscription usage amount',
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_renewals'
  ) {
    nonNegative(
      row.renewal_amount,
      'Subscription renewal amount',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_batch_items'
  ) {
    positive(
      row.amount,
      'Payment batch item amount',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_refunds'
  ) {
    positive(
      row.amount,
      'Refund amount',
    );
    dateOrder(
      row.requested_at,
      row.processed_at,
      'Payment refund',
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_disputes'
  ) {
    positive(
      row.disputed_amount,
      'Disputed amount',
    );
    dateOrder(
      row.opened_at,
      row.resolved_at,
      'Payment dispute',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_tiers'
  ) {
    nonNegative(
      row.threshold_from,
      'Commission tier threshold',
    );

    if (
      row.threshold_to !==
        null &&
      row.threshold_to !==
        undefined &&
      numberValue(
        row.threshold_to,
      ) <
      numberValue(
        row.threshold_from,
      )
    ) {
      throw new Error(
        'Commission tier upper threshold cannot be below its lower threshold.',
      );
    }

    percentage(
      row.rate,
      'Commission tier rate',
    );
    positive(
      row.sequence,
      'Commission tier sequence',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_payouts'
  ) {
    dateOrder(
      row.period_start,
      row.period_end,
      'Commission payout period',
    );
    nonNegative(
      row.gross_commission,
      'Gross commission',
    );
    nonNegative(
      row.payable_amount,
      'Payable commission',
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_payout_lines'
  ) {
    nonNegative(
      row.amount,
      'Commission payout line amount',
    );
  }
}


export function assertFinanceSpecialistMutationAllowed(
  moduleKey:
    string,
  table:
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
    'purchase:purchase_receipts': {
      state: 'posted',
      message:
        'Posted purchase receipts are immutable. Correct them with a separate inventory adjustment or return.',
    },
    'expenses:expense_reports': {
      state: 'reimbursed',
      message:
        'Reimbursed expense reports are immutable. Use a corrective expense record.',
    },
    'fixed_assets:asset_impairments': {
      state: 'posted',
      message:
        'Posted asset impairments are immutable.',
    },
    'tax:withholding_certificates': {
      state: 'issued',
      message:
        'Issued withholding certificates are immutable. Void and reissue instead.',
    },
    'billing:billing_cycles': {
      state: 'completed',
      message:
        'Completed billing cycles are immutable.',
    },
    'subscriptions:subscription_changes': {
      state: 'applied',
      message:
        'Applied subscription changes are immutable.',
    },
    'payments:payment_refunds': {
      state: 'completed',
      message:
        'Completed refunds are immutable.',
    },
    'commissions:commission_payouts': {
      state: 'paid',
      message:
        'Paid commission payouts are immutable.',
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
