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


export function validatePeopleSpecialistRow(
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
      'employees' &&
    table ===
      'employee_contracts'
  ) {
    dateOrder(
      row.start_date,
      row.end_date,
      'Employee contract',
    );

    if (
      row.base_salary !==
        null &&
      row.base_salary !==
        undefined
    ) {
      nonNegative(
        row.base_salary,
        'Contract salary',
      );
    }

    if (
      row.working_hours_per_week !==
        null &&
      row.working_hours_per_week !==
        undefined
    ) {
      nonNegative(
        row.working_hours_per_week,
        'Weekly working hours',
      );
    }

    nonNegative(
      row.notice_days,
      'Notice days',
    );
  }

  if (
    moduleKey ===
      'employees' &&
    table ===
      'employee_emergency_contacts'
  ) {
    positive(
      row.priority,
      'Emergency-contact priority',
    );
  }

  if (
    moduleKey ===
      'recruitment' &&
    table ===
      'recruitment_requisitions'
  ) {
    positive(
      row.headcount,
      'Requested headcount',
    );
  }

  if (
    moduleKey ===
      'recruitment' &&
    table ===
      'applicant_sources'
  ) {
    nonNegative(
      row.acquisition_cost,
      'Applicant acquisition cost',
    );
  }

  if (
    moduleKey ===
      'recruitment' &&
    table ===
      'interview_scorecards'
  ) {
    percentage(
      row.score,
      'Interview score',
    );
    percentage(
      row.weight,
      'Interview score weight',
    );
  }

  if (
    moduleKey ===
      'recruitment' &&
    table ===
      'job_offers'
  ) {
    nonNegative(
      row.base_salary,
      'Job-offer salary',
    );

    dateOrder(
      row.sent_at,
      row.expires_at,
      'Job offer',
    );
  }

  if (
    moduleKey ===
      'attendance' &&
    table ===
      'attendance_exceptions'
  ) {
    nonNegative(
      row.minutes,
      'Attendance exception minutes',
    );
  }

  if (
    moduleKey ===
      'attendance' &&
    table ===
      'attendance_corrections'
  ) {
    dateOrder(
      row.requested_clock_in,
      row.requested_clock_out,
      'Attendance correction',
    );
  }

  if (
    moduleKey ===
      'attendance' &&
    table ===
      'attendance_overtime_requests'
  ) {
    positive(
      row.requested_minutes,
      'Requested overtime',
    );
    nonNegative(
      row.approved_minutes,
      'Approved overtime',
    );

    if (
      numberValue(
        row.approved_minutes,
      ) >
      numberValue(
        row.requested_minutes,
      )
    ) {
      throw new Error(
        'Approved overtime cannot exceed requested overtime.',
      );
    }
  }

  if (
    moduleKey ===
      'shifts' &&
    table ===
      'open_shifts'
  ) {
    dateOrder(
      row.starts_at,
      row.ends_at,
      'Open shift',
    );
    positive(
      row.required_workers,
      'Required workers',
    );
    nonNegative(
      row.claimed_workers,
      'Claimed workers',
    );

    if (
      numberValue(
        row.claimed_workers,
      ) >
      numberValue(
        row.required_workers,
      )
    ) {
      throw new Error(
        'Claimed workers cannot exceed required workers.',
      );
    }
  }

  if (
    moduleKey ===
      'shifts' &&
    table ===
      'shift_availability'
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
        'Shift availability weekday must be between 0 and 6.',
      );
    }

    dateOrder(
      row.effective_from,
      row.effective_to,
      'Shift availability',
    );
  }

  if (
    moduleKey ===
      'time_off' &&
    table ===
      'leave_balances'
  ) {
    nonNegative(
      row.opening_balance,
      'Opening leave balance',
    );
    nonNegative(
      row.accrued,
      'Accrued leave',
    );
    nonNegative(
      row.used,
      'Used leave',
    );

    const expected =
      numberValue(
        row.opening_balance,
      ) +
      numberValue(
        row.accrued,
      ) +
      numberValue(
        row.adjusted,
      ) -
      numberValue(
        row.used,
      );

    if (
      Math.abs(
        expected -
        numberValue(
          row.closing_balance,
        ),
      ) >
      0.001
    ) {
      throw new Error(
        'Closing leave balance must equal opening plus accrued plus adjustments minus used leave.',
      );
    }
  }

  if (
    moduleKey ===
      'time_off' &&
    table ===
      'leave_accruals'
  ) {
    positive(
      row.amount,
      'Leave accrual',
    );
  }

  if (
    moduleKey ===
      'time_off' &&
    table ===
      'leave_blackout_periods'
  ) {
    dateOrder(
      row.starts_on,
      row.ends_on,
      'Leave blackout period',
    );
  }

  if (
    moduleKey ===
      'timesheets' &&
    table ===
      'timesheet_periods'
  ) {
    dateOrder(
      row.period_start,
      row.period_end,
      'Timesheet period',
    );
  }

  if (
    moduleKey ===
      'timesheets' &&
    table ===
      'timesheet_submissions'
  ) {
    nonNegative(
      row.total_hours,
      'Submitted timesheet hours',
    );
  }

  if (
    moduleKey ===
      'benefits' &&
    table ===
      'benefit_claims'
  ) {
    positive(
      row.claimed_amount,
      'Benefit claim amount',
    );
    nonNegative(
      row.approved_amount,
      'Approved benefit amount',
    );

    if (
      numberValue(
        row.approved_amount,
      ) >
      numberValue(
        row.claimed_amount,
      )
    ) {
      throw new Error(
        'Approved benefit amount cannot exceed the claimed amount.',
      );
    }
  }

  if (
    moduleKey ===
      'benefits' &&
    table ===
      'benefit_contributions'
  ) {
    nonNegative(
      row.employer_amount,
      'Employer benefit contribution',
    );
    nonNegative(
      row.employee_amount,
      'Employee benefit contribution',
    );
  }

  if (
    moduleKey ===
      'appraisals' &&
    table ===
      'appraisal_competencies'
  ) {
    percentage(
      row.weight,
      'Competency weight',
    );
  }

  if (
    moduleKey ===
      'appraisals' &&
    table ===
      'appraisal_competency_scores'
  ) {
    for (
      const [
        value,
        label,
      ]
      of [
        [row.self_score, 'Self score'],
        [row.reviewer_score, 'Reviewer score'],
        [row.final_score, 'Final competency score'],
      ] as const
    ) {
      if (
        value !== null &&
        value !== undefined
      ) {
        percentage(
          value,
          label,
        );
      }
    }
  }

  if (
    moduleKey ===
      'appraisals' &&
    table ===
      'appraisal_feedback' &&
    row.rating !==
      null &&
    row.rating !==
      undefined
  ) {
    percentage(
      row.rating,
      'Appraisal feedback rating',
    );
  }

  if (
    moduleKey ===
      'appraisals' &&
    table ===
      'appraisal_calibrations'
  ) {
    if (
      row.original_rating !==
        null &&
      row.original_rating !==
        undefined
    ) {
      percentage(
        row.original_rating,
        'Original appraisal rating',
      );
    }
    percentage(
      row.calibrated_rating,
      'Calibrated appraisal rating',
    );
  }

  if (
    moduleKey ===
      'onboarding' &&
    table ===
      'onboarding_checkins'
  ) {
    if (
      row.employee_rating !==
        null &&
      row.employee_rating !==
        undefined
    ) {
      percentage(
        row.employee_rating,
        'Employee onboarding rating',
      );
    }
    if (
      row.manager_rating !==
        null &&
      row.manager_rating !==
        undefined
    ) {
      percentage(
        row.manager_rating,
        'Manager onboarding rating',
      );
    }
  }

  if (
    moduleKey ===
      'onboarding' &&
    table ===
      'onboarding_equipment_assignments'
  ) {
    dateOrder(
      row.assigned_at,
      row.returned_at,
      'Onboarding equipment assignment',
    );
  }

  if (
    moduleKey ===
      'learning' &&
    table ===
      'learning_assessments'
  ) {
    percentage(
      row.passing_score,
      'Assessment passing score',
    );

    if (
      row.maximum_attempts !==
        null &&
      row.maximum_attempts !==
        undefined
    ) {
      positive(
        row.maximum_attempts,
        'Maximum assessment attempts',
      );
    }

    if (
      row.time_limit_minutes !==
        null &&
      row.time_limit_minutes !==
        undefined
    ) {
      positive(
        row.time_limit_minutes,
        'Assessment time limit',
      );
    }
  }

  if (
    moduleKey ===
      'learning' &&
    table ===
      'learning_assessment_attempts'
  ) {
    positive(
      row.attempt_number,
      'Assessment attempt number',
    );

    if (
      row.score !==
        null &&
      row.score !==
        undefined
    ) {
      percentage(
        row.score,
        'Assessment score',
      );
    }

    dateOrder(
      row.started_at,
      row.submitted_at,
      'Assessment attempt',
    );
  }

  if (
    moduleKey ===
      'learning' &&
    table ===
      'learning_certificates'
  ) {
    dateOrder(
      row.issued_at,
      row.expires_at,
      'Learning certificate',
    );
  }

  if (
    moduleKey ===
      'org_chart' &&
    table ===
      'succession_candidates' &&
    row.readiness_score !==
      null &&
    row.readiness_score !==
      undefined
  ) {
    percentage(
      row.readiness_score,
      'Succession readiness score',
    );
  }
}


export function assertPeopleSpecialistMutationAllowed(
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
    'recruitment:job_offers': {
      state: 'accepted',
      message:
        'Accepted job offers are immutable. Use an employee lifecycle correction instead.',
    },
    'attendance:attendance_corrections': {
      state: 'approved',
      message:
        'Approved attendance corrections are immutable.',
    },
    'time_off:leave_accruals': {
      state: 'posted',
      message:
        'Posted leave accruals are immutable. Reverse the accrual instead.',
    },
    'timesheets:timesheet_submissions': {
      state: 'locked',
      message:
        'Locked timesheet submissions are immutable.',
    },
    'benefits:benefit_claims': {
      state: 'paid',
      message:
        'Paid benefit claims are immutable.',
    },
    'learning:learning_certificates': {
      state: 'revoked',
      message:
        'Revoked learning certificates are immutable.',
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
