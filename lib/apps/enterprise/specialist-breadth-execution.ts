import 'server-only';

import type {
  PoolClient,
} from 'pg';


type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


const APPEND_ONLY_TABLES =
  new Set([
    'email_campaign_events',
    'signature_audit_events',
    'sms_delivery_events',
    'social_post_metrics',
    'document_versions',
  ]);


export function assertSpecialistBreadthMutationAllowed(
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
    operation !==
      'create' &&
    APPEND_ONLY_TABLES.has(
      table,
    )
  ) {
    throw new Error(
      'This specialist evidence ledger is append-only. Create a correcting event or version instead of editing history.',
    );
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
      string[]
    > = {
    'appointments:appointment_reminders': [
      'sent',
      'cancelled',
    ],
    'documents:document_approvals': [
      'approved',
      'rejected',
      'cancelled',
    ],
    'events:event_tickets': [
      'checked_in',
      'refunded',
      'cancelled',
    ],
    'field_services:service_checklists': [
      'completed',
      'waived',
      'cancelled',
    ],
    'plm:engineering_change_approvals': [
      'approved',
      'rejected',
      'cancelled',
    ],
    'pos_shop:shop_returns': [
      'processed',
      'rejected',
      'cancelled',
    ],
    'referrals:referral_rewards': [
      'issued',
      'cancelled',
    ],
    'rentals:rental_charges': [
      'posted',
      'waived',
      'cancelled',
    ],
  };

  if (
    operation !==
      'create' &&
    terminal[
      moduleKey +
      ':' +
      table
    ]?.includes(
      status,
    )
  ) {
    throw new Error(
      'This completed specialist record is immutable. Use its governed workflow or create a correcting record.',
    );
  }
}


export async function applySpecialistBreadthTransition(
  client:
    PoolClient,
  input: {
    moduleKey:
      string;
    table:
      string;
    companyId:
      string;
    userId:
      string;
    recordId:
      string;
    nextStatus:
      string;
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
      'appointments' &&
    table ===
      'appointment_reminders' &&
    nextStatus ===
      'sent'
  ) {
    await client.query(
      `
        UPDATE appointment_reminders
        SET
          sent_at =
            COALESCE(
              sent_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
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

  if (
    (
      moduleKey ===
        'documents' &&
      table ===
        'document_approvals'
    ) ||
    (
      moduleKey ===
        'plm' &&
      table ===
        'engineering_change_approvals'
    )
  ) {
    if (
      [
        'approved',
        'rejected',
      ].includes(
        nextStatus,
      )
    ) {
      await client.query(
        `
          UPDATE ${table}
          SET
            decision = $3,
            decided_at =
              COALESCE(
                decided_at,
                NOW()
              ),
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
          nextStatus,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'events' &&
    table ===
      'event_tickets' &&
    nextStatus ===
      'checked_in'
  ) {
    await client.query(
      `
        UPDATE event_tickets
        SET
          checked_in_at =
            COALESCE(
              checked_in_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
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

  if (
    moduleKey ===
      'field_services' &&
    table ===
      'service_checklists' &&
    nextStatus ===
      'completed'
  ) {
    await client.query(
      `
        UPDATE service_checklists
        SET
          completed_at =
            COALESCE(
              completed_at,
              NOW()
            ),
          completed_by =
            COALESCE(
              completed_by,
              $3
            ),
          updated_by = $3,
          updated_at = NOW()
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

  if (
    moduleKey ===
      'pos_shop' &&
    table ===
      'shop_returns' &&
    nextStatus ===
      'processed'
  ) {
    await client.query(
      `
        UPDATE shop_returns
        SET
          processed_at =
            COALESCE(
              processed_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
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

  if (
    moduleKey ===
      'referrals' &&
    table ===
      'referral_rewards' &&
    nextStatus ===
      'issued'
  ) {
    await client.query(
      `
        UPDATE referral_rewards
        SET
          issued_at =
            COALESCE(
              issued_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
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

  if (
    moduleKey ===
      'planning' &&
    table ===
      'planning_capacity' &&
    nextStatus ===
      'closed'
  ) {
    const result =
      await client.query(
        `
          SELECT
            capacity_hours,
            allocated_hours,
            unavailable_hours
          FROM planning_capacity
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
      !row
    ) {
      throw new Error(
        'Planning capacity record was not found.',
      );
    }

    const usable =
      Number(
        row.capacity_hours ||
        0,
      ) -
      Number(
        row.unavailable_hours ||
        0,
      );

    if (
      Number(
        row.allocated_hours ||
        0,
      ) >
        usable
    ) {
      throw new Error(
        'Resolve the resource overallocation before closing this planning capacity period.',
      );
    }
  }
}
