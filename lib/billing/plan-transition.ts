import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  notifyWorkspaceOwnersOfBillingEvent,
} from '@/lib/billing/notifications';

export async function applyDueScheduledPlanChanges(
  tenantId?:
    string | null,
) {
  const result =
    await queryControl(
      `
        UPDATE subscriptions s
        SET
          plan_id =
            s.scheduled_plan_id,
          status =
            CASE
              WHEN LOWER(
                     target.key
                   ) =
                   'free'
              THEN 'active'
              ELSE 'past_due'
            END,
          billing_cycle =
            CASE
              WHEN LOWER(
                     target.key
                   ) =
                   'free'
              THEN NULL
              ELSE 'monthly'
            END,
          current_period_start =
            CASE
              WHEN LOWER(
                     target.key
                   ) =
                   'free'
              THEN NULL
              ELSE s.current_period_start
            END,
          current_period_end =
            CASE
              WHEN LOWER(
                     target.key
                   ) =
                   'free'
              THEN NULL
              ELSE s.current_period_end
            END,
          cancelled_at =
            NULL,
          scheduled_plan_id =
            NULL,
          scheduled_plan_effective_at =
            NULL,
          scheduled_plan_requested_by =
            NULL,
          scheduled_plan_requested_at =
            NULL,
          updated_at =
            NOW()
        FROM plans target
        WHERE s.scheduled_plan_id =
              target.id
          AND target.deleted_at
              IS NULL
          AND target.is_active =
              TRUE
          AND s.deleted_at
              IS NULL
          AND s.scheduled_plan_effective_at
              IS NOT NULL
          AND s.scheduled_plan_effective_at <=
              NOW()
          AND (
            $1::uuid IS NULL
            OR s.tenant_id =
               $1::uuid
          )
        RETURNING
          s.id,
          s.tenant_id,
          s.status,
          target.key
            AS applied_plan_key
      `,
      [
        tenantId ||
        null,
      ],
    );

  for (
    const row
    of result.rows
  ) {
    try {
      await queryControl(
        `
          INSERT INTO audit_logs (
            tenant_id,
            actor_type,
            event_type,
            entity_type,
            entity_id,
            metadata,
            created_at
          )
          VALUES (
            $1,
            'system',
            'SUBSCRIPTION_PLAN_CHANGE_APPLIED',
            'subscription',
            $2,
            $3::jsonb,
            NOW()
          )
        `,
        [
          row.tenant_id,
          row.id,
          JSON.stringify({
            plan:
              row.applied_plan_key,
            status:
              row.status,
          }),
        ],
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Scheduled plan audit failed:',
        error,
      );
    }

    try {
      await notifyWorkspaceOwnersOfBillingEvent({
        tenantId:
          String(
            row.tenant_id,
          ),
        type:
          'billing.plan_changed',
        eventKey:
          'billing.plan_changed',
        title:
          'Subscription plan updated',
        message:
          `Your SaMi workspace is now on the ${String(
            row.applied_plan_key,
          )} plan. Current access has been recalculated from the new subscription state.`,
        priority:
          'high',
        dedupeKey:
          `billing:plan-applied:${row.id}:${String(
            row.applied_plan_key,
          )}`,
        metadata: {
          subscriptionId:
            String(
              row.id,
            ),
          plan:
            String(
              row.applied_plan_key,
            ),
          status:
            String(
              row.status,
            ),
        },
      });
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Applied-plan notification failed:',
        error,
      );
    }
  }

  return {
    applied:
      result.rows.length,
  };
}
