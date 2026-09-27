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
      `
        SELECT
          to_regclass($1)
            IS NOT NULL
            AS ready
      `,
      [
        'public.' +
        table,
      ],
    );

  return result.rows[0]
    ?.ready ===
    true;
}


async function acceptRecruitmentOffer(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    recordId: string;
  },
) {
  if (
    !await tableExists(
      client,
      'employees',
    ) ||
    !await tableExists(
      client,
      'employee_lifecycle_events',
    )
  ) {
    return;
  }

  const offer =
    await client.query(
      `
        SELECT
          offer.offer_number,
          offer.job_title,
          offer.base_salary,
          offer.start_date,
          applicant.id
            AS applicant_id,
          applicant.full_name,
          applicant.email,
          applicant.phone
        FROM job_offers offer
        INNER JOIN applicants applicant
          ON applicant.id =
             offer.applicant_id
         AND applicant.company_id =
             offer.company_id
         AND applicant.deleted_at
             IS NULL
        WHERE offer.id = $1
          AND offer.company_id = $2
          AND offer.deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.recordId,
        input.companyId,
      ],
    );

  if (
    offer.rows.length !==
      1
  ) {
    throw new Error(
      'The accepted offer could not be resolved to an active applicant.',
    );
  }

  const row =
    offer.rows[0];

  const hireReason =
    'Created from accepted job offer ' +
    String(
      row.offer_number,
    );

  const existing =
    await client.query(
      `
        SELECT
          employee.id
        FROM employee_lifecycle_events event
        INNER JOIN employees employee
          ON employee.id =
             event.employee_id
         AND employee.company_id =
             event.company_id
         AND employee.deleted_at
             IS NULL
        WHERE event.company_id = $1
          AND event.event_type =
              'hire'
          AND event.reason = $2
          AND event.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        hireReason,
      ],
    );

  let employeeId =
    existing.rows[0]
      ?.id
      ? String(
          existing.rows[0].id,
        )
      : null;

  if (
    !employeeId
  ) {
    const employee =
      await client.query(
        `
          INSERT INTO employees (
            company_id,
            employee_number,
            full_name,
            email,
            phone,
            job_title,
            employment_status,
            hire_date,
            salary,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            'EMP-' ||
            UPPER(
              SUBSTRING(
                REPLACE(
                  $2::text,
                  '-',
                  ''
                ),
                1,
                12
              )
            ),
            $3,$4,$5,$6,
            'active',
            COALESCE(
              $7::date,
              CURRENT_DATE
            ),
            $8,$9,$9
          )
          RETURNING id
        `,
        [
          input.companyId,
          row.applicant_id,
          row.full_name,
          row.email,
          row.phone,
          row.job_title,
          row.start_date,
          row.base_salary,
          input.userId,
        ],
      );

    employeeId =
      String(
        employee.rows[0].id,
      );

    await client.query(
      `
        INSERT INTO employee_lifecycle_events (
          company_id,
          employee_id,
          event_type,
          effective_date,
          to_value,
          reason,
          approved_by,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,
          'hire',
          COALESCE(
            $3::date,
            CURRENT_DATE
          ),
          jsonb_build_object(
            'jobTitle',
            $4::text,
            'salary',
            $5::numeric,
            'applicantId',
            $6::text
          ),
          $7,$8,
          'effective',
          $8,$8
        )
      `,
      [
        input.companyId,
        employeeId,
        row.start_date,
        row.job_title,
        row.base_salary,
        row.applicant_id,
        hireReason,
        input.userId,
      ],
    );
  }

  await client.query(
    `
      UPDATE applicants
      SET
        stage =
          'hired',
        updated_by =
          $3,
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at
            IS NULL
    `,
    [
      row.applicant_id,
      input.companyId,
      input.userId,
    ],
  );

  if (
    await tableExists(
      client,
      'employee_onboardings',
    )
  ) {
    await client.query(
      `
        INSERT INTO employee_onboardings (
          company_id,
          employee_reference,
          start_date,
          target_completion_date,
          status,
          created_by,
          updated_by,
          metadata
        )
        SELECT
          $1,$2,
          COALESCE(
            $3::date,
            CURRENT_DATE
          ),
          COALESCE(
            $3::date,
            CURRENT_DATE
          ) +
          30,
          'active',
          $4,$4,
          jsonb_build_object(
            'source',
            'recruitment',
            'jobOfferId',
            $5::text
          )
        WHERE NOT EXISTS (
          SELECT 1
          FROM employee_onboardings
          WHERE company_id = $1
            AND employee_reference = $2
            AND deleted_at
                IS NULL
            AND metadata ->>
                'jobOfferId' =
                $5::text
        )
      `,
      [
        input.companyId,
        employeeId,
        row.start_date,
        input.userId,
        input.recordId,
      ],
    );
  }
}


async function applyLeaveDecision(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    recordId: string;
    nextStatus: string;
  },
) {
  if (
    ![
      'approved',
      'cancelled',
    ].includes(
      input.nextStatus,
    ) ||
    !await tableExists(
      client,
      'leave_balances',
    )
  ) {
    return;
  }

  const request =
    await client.query(
      `
        SELECT
          request.status,
          request.employee_reference,
          request.leave_type_id,
          request.start_date,
          request.days,
          type.days_per_year
        FROM leave_requests request
        INNER JOIN leave_types type
          ON type.id =
             request.leave_type_id
         AND type.company_id =
             request.company_id
         AND type.deleted_at
             IS NULL
        WHERE request.id = $1
          AND request.company_id = $2
          AND request.deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.recordId,
        input.companyId,
      ],
    );

  if (
    request.rows.length !==
      1
  ) {
    throw new Error(
      'The leave request could not be resolved.',
    );
  }

  const row =
    request.rows[0];

  if (
    !row.employee_reference
  ) {
    throw new Error(
      'Link the leave request to an employee before approval.',
    );
  }

  const year =
    new Date(
      String(
        row.start_date,
      ),
    ).getUTCFullYear();

  const days =
    Number(
      row.days ||
      0,
    );

  await client.query(
    `
      INSERT INTO leave_balances (
        company_id,
        employee_reference,
        leave_type_id,
        year,
        opening_balance,
        accrued,
        used,
        adjusted,
        closing_balance,
        status,
        created_by,
        updated_by
      )
      VALUES (
        $1,$2,$3,$4,
        0,$5,0,0,$5,
        'active',
        $6,$6
      )
      ON CONFLICT (
        company_id,
        employee_reference,
        leave_type_id,
        year
      )
      WHERE deleted_at IS NULL
      DO NOTHING
    `,
    [
      input.companyId,
      row.employee_reference,
      row.leave_type_id,
      year,
      Number(
        row.days_per_year ||
        0,
      ),
      input.userId,
    ],
  );

  const balance =
    await client.query(
      `
        SELECT
          id,
          opening_balance,
          accrued,
          used,
          adjusted,
          closing_balance
        FROM leave_balances
        WHERE company_id = $1
          AND employee_reference = $2
          AND leave_type_id = $3
          AND year = $4
          AND deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.companyId,
        row.employee_reference,
        row.leave_type_id,
        year,
      ],
    );

  if (
    balance.rows.length !==
      1
  ) {
    throw new Error(
      'SaMi could not resolve the employee leave balance.',
    );
  }

  const current =
    balance.rows[0];

  if (
    input.nextStatus ===
      'approved'
  ) {
    if (
      Number(
        current.closing_balance ||
        0,
      ) +
      0.0001 <
      days
    ) {
      throw new Error(
        'The employee does not have enough leave balance for this approval.',
      );
    }

    await client.query(
      `
        UPDATE leave_balances
        SET
          used =
            used +
            $2,
          closing_balance =
            opening_balance +
            accrued +
            adjusted -
            (
              used +
              $2
            ),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        current.id,
        days,
        input.userId,
      ],
    );
  } else if (
    String(
      row.status,
    ) ===
      'approved'
  ) {
    await client.query(
      `
        UPDATE leave_balances
        SET
          used =
            GREATEST(
              0,
              used -
              $2
            ),
          closing_balance =
            opening_balance +
            accrued +
            adjusted -
            GREATEST(
              0,
              used -
              $2
            ),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        current.id,
        days,
        input.userId,
      ],
    );
  }
}


async function approveAttendanceCorrection(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    recordId: string;
    nextStatus: string;
  },
) {
  if (
    input.nextStatus !==
      'approved'
  ) {
    return;
  }

  const correction =
    await client.query(
      `
        SELECT
          attendance_entry_id,
          requested_clock_in,
          requested_clock_out
        FROM attendance_corrections
        WHERE id = $1
          AND company_id = $2
          AND deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.recordId,
        input.companyId,
      ],
    );

  if (
    correction.rows.length !==
      1
  ) {
    throw new Error(
      'The attendance correction could not be resolved.',
    );
  }

  const row =
    correction.rows[0];

  await client.query(
    `
      UPDATE attendance_entries
      SET
        clock_in =
          COALESCE(
            $3::timestamptz,
            clock_in
          ),
        clock_out =
          COALESCE(
            $4::timestamptz,
            clock_out
          ),
        worked_minutes =
          CASE
            WHEN COALESCE(
                   $3::timestamptz,
                   clock_in
                 )
                 IS NOT NULL
             AND COALESCE(
                   $4::timestamptz,
                   clock_out
                 )
                 IS NOT NULL
            THEN GREATEST(
              0,
              FLOOR(
                EXTRACT(
                  EPOCH FROM (
                    COALESCE(
                      $4::timestamptz,
                      clock_out
                    ) -
                    COALESCE(
                      $3::timestamptz,
                      clock_in
                    )
                  )
                ) /
                60
              )
            )::int
            ELSE worked_minutes
          END,
        updated_by =
          $5,
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at
            IS NULL
    `,
    [
      row.attendance_entry_id,
      input.companyId,
      row.requested_clock_in,
      row.requested_clock_out,
      input.userId,
    ],
  );

  await client.query(
    `
      UPDATE attendance_corrections
      SET
        approved_by =
          $3,
        decided_at =
          NOW(),
        updated_by =
          $3,
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      input.recordId,
      input.companyId,
      input.userId,
    ],
  );
}


async function synchronizeTimesheetSubmission(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    recordId: string;
    nextStatus: string;
  },
) {
  if (
    ![
      'submitted',
      'approved',
      'locked',
    ].includes(
      input.nextStatus,
    )
  ) {
    return;
  }

  const submission =
    await client.query(
      `
        SELECT
          submission.employee_reference,
          period.period_start,
          period.period_end
        FROM timesheet_submissions submission
        INNER JOIN timesheet_periods period
          ON period.id =
             submission.period_id
         AND period.company_id =
             submission.company_id
         AND period.deleted_at
             IS NULL
        WHERE submission.id = $1
          AND submission.company_id = $2
          AND submission.deleted_at
              IS NULL
        FOR UPDATE
      `,
      [
        input.recordId,
        input.companyId,
      ],
    );

  if (
    submission.rows.length !==
      1
  ) {
    throw new Error(
      'The timesheet submission could not be resolved.',
    );
  }

  const row =
    submission.rows[0];

  const total =
    await client.query(
      `
        SELECT
          COALESCE(
            SUM(hours),
            0
          ) AS hours
        FROM time_entries
        WHERE company_id = $1
          AND employee_reference = $2
          AND work_date
              BETWEEN $3::date
                  AND $4::date
          AND deleted_at
              IS NULL
      `,
      [
        input.companyId,
        row.employee_reference,
        row.period_start,
        row.period_end,
      ],
    );

  await client.query(
    `
      UPDATE timesheet_submissions
      SET
        total_hours =
          $3,
        submitted_at =
          CASE
            WHEN $4 IN (
              'submitted',
              'approved',
              'locked'
            )
            THEN COALESCE(
              submitted_at,
              NOW()
            )
            ELSE submitted_at
          END,
        approved_at =
          CASE
            WHEN $4 IN (
              'approved',
              'locked'
            )
            THEN COALESCE(
              approved_at,
              NOW()
            )
            ELSE approved_at
          END,
        approved_by =
          CASE
            WHEN $4 IN (
              'approved',
              'locked'
            )
            THEN COALESCE(
              approved_by,
              $5
            )
            ELSE approved_by
          END,
        updated_by =
          $5,
        updated_at =
          NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      input.recordId,
      input.companyId,
      Number(
        total.rows[0]
          ?.hours ||
        0,
      ),
      input.nextStatus,
      input.userId,
    ],
  );

  if (
    input.nextStatus ===
      'locked'
  ) {
    await client.query(
      `
        UPDATE time_entries
        SET
          status =
            'approved',
          updated_by =
            $5,
          updated_at =
            NOW()
        WHERE company_id = $1
          AND employee_reference = $2
          AND work_date
              BETWEEN $3::date
                  AND $4::date
          AND deleted_at
              IS NULL
      `,
      [
        input.companyId,
        row.employee_reference,
        row.period_start,
        row.period_end,
        input.userId,
      ],
    );
  }
}


export async function applyPeopleSpecialistTransition(
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
  if (
    input.moduleKey ===
      'recruitment' &&
    input.table ===
      'job_offers' &&
    input.nextStatus ===
      'accepted'
  ) {
    await acceptRecruitmentOffer(
      client,
      input,
    );

    return;
  }

  if (
    input.moduleKey ===
      'time_off' &&
    input.table ===
      'leave_requests'
  ) {
    await applyLeaveDecision(
      client,
      input,
    );

    return;
  }

  if (
    input.moduleKey ===
      'attendance' &&
    input.table ===
      'attendance_corrections'
  ) {
    await approveAttendanceCorrection(
      client,
      input,
    );

    return;
  }

  if (
    input.moduleKey ===
      'timesheets' &&
    input.table ===
      'timesheet_submissions'
  ) {
    await synchronizeTimesheetSubmission(
      client,
      input,
    );
  }
}
