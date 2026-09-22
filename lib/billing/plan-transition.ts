import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  notifyWorkspaceOwnersOfBillingEvent,
} from '@/lib/billing/notifications';

import {
  getWorkspacePlanCapacityAssessment,
} from '@/lib/billing/capacity';

export async function applyDueScheduledPlanChanges(
  tenantId?:
    string | null,
) {
  const candidates =
    await queryControl(
      `
        SELECT
          s.id,
          s.tenant_id,
          s.scheduled_plan_id,
          s.scheduled_plan_effective_at,
          target.key
            AS target_plan_key
        FROM subscriptions s
        INNER JOIN plans target
          ON target.id =
             s.scheduled_plan_id
         AND target.deleted_at
             IS NULL
         AND target.is_active =
             TRUE
        WHERE s.deleted_at
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
        ORDER BY
          s.scheduled_plan_effective_at,
          s.id
      `,
      [
        tenantId ||
        null,
      ],
    );

  let applied =
    0;

  let blocked =
    0;

  for (
    const candidate
    of candidates.rows
  ) {
    const targetPlan =
      String(
        candidate
          .target_plan_key ||
        '',
      )
        .trim()
        .toLowerCase();

    let capacity:
      Awaited<
        ReturnType<
          typeof getWorkspacePlanCapacityAssessment
        >
      >;

    try {
      capacity =
        await getWorkspacePlanCapacityAssessment(
          String(
            candidate
              .tenant_id,
          ),
          targetPlan,
        );
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Scheduled plan capacity re-check failed:',
        error,
      );

      continue;
    }

    if (
      !capacity.supported ||
      !capacity.allowed
    ) {
      blocked +=
        1;

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
              'SUBSCRIPTION_PLAN_CHANGE_BLOCKED_AT_BOUNDARY',
              'subscription',
              $2,
              $3::jsonb,
              NOW()
            )
          `,
          [
            candidate.tenant_id,
            candidate.id,
            JSON.stringify({
              targetPlan,
              effectiveAt:
                candidate
                  .scheduled_plan_effective_at,
              blockers:
                capacity.blockers,
              users:
                capacity.users,
              apps:
                capacity.apps,
              companies:
                capacity.companies,
            }),
          ],
        );
      } catch (
        error
      ) {
        console.error(
          '[SaMi Billing] Blocked plan-change audit failed:',
          error,
        );
      }

      try {
        await notifyWorkspaceOwnersOfBillingEvent({
          tenantId:
            String(
              candidate
                .tenant_id,
            ),
          type:
            'billing.plan_change_blocked',
          eventKey:
            'billing.plan_change_blocked',
          title:
            'Plan change needs workspace cleanup',
          message:
            capacity.blockers[0] ||
            `SaMi could not apply the scheduled ${targetPlan} plan because the workspace no longer fits that plan's limits. The pending change has been kept so you can resolve the blocker or cancel the change in Billing.`,
          priority:
            'urgent',
          dedupeKey:
            `billing:plan-change-blocked:${String(
              candidate.id,
            )}:${targetPlan}:${String(
              candidate
                .scheduled_plan_effective_at,
            )}`,
          metadata: {
            subscriptionId:
              String(
                candidate.id,
              ),
            targetPlan,
            blockers:
              capacity.blockers,
            effectiveAt:
              candidate
                .scheduled_plan_effective_at,
          },
        });
      } catch (
        error
      ) {
        console.error(
          '[SaMi Billing] Blocked plan-change notification failed:',
          error,
        );
      }

      continue;
    }

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
          WHERE s.id = $1
            AND s.scheduled_plan_id =
                $2
            AND s.scheduled_plan_id =
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
          RETURNING
            s.id,
            s.tenant_id,
            s.status,
            target.key
              AS applied_plan_key
        `,
        [
          candidate.id,
          candidate
            .scheduled_plan_id,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      continue;
    }

    applied +=
      1;

    const row =
      result.rows[0];

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
    applied,
    blocked,
  };
}


export async function applyDueSubscriptionCancellations(
  tenantId?:
    string | null,
) {
  const result =
    await queryControl(
      `
        UPDATE subscriptions s
        SET
          status =
            'cancelled',
          billing_cycle =
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
        WHERE s.deleted_at
              IS NULL
          AND s.cancelled_at
              IS NOT NULL
          AND LOWER(
                COALESCE(
                  s.status,
                  ''
                )
              ) IN (
                'trial',
                'trialing',
                'active'
              )
          AND (
            CASE
              WHEN LOWER(
                     COALESCE(
                       s.status,
                       ''
                     )
                   ) IN (
                     'trial',
                     'trialing'
                   )
              THEN s.trial_ends_at
              ELSE s.current_period_end
            END
          ) IS NOT NULL
          AND (
            CASE
              WHEN LOWER(
                     COALESCE(
                       s.status,
                       ''
                     )
                   ) IN (
                     'trial',
                     'trialing'
                   )
              THEN s.trial_ends_at
              ELSE s.current_period_end
            END
          ) <=
              NOW()
          AND (
            $1::uuid IS NULL
            OR s.tenant_id =
               $1::uuid
          )
        RETURNING
          s.id,
          s.tenant_id,
          s.cancelled_at
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
          UPDATE subscription_billing_profiles
          SET
            recurring_status =
              'cancelled',
            metadata =
              metadata ||
              $2::jsonb,
            updated_at =
              NOW()
          WHERE subscription_id =
                $1
            AND is_active =
                TRUE
        `,
        [
          row.id,
          JSON.stringify({
            cancellationAppliedAt:
              new Date()
                .toISOString(),
          }),
        ],
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Cancellation profile finalization failed:',
        error,
      );
    }

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
            'SUBSCRIPTION_CANCELLATION_APPLIED',
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
            requestedAt:
              row.cancelled_at,
            effectiveAt:
              new Date()
                .toISOString(),
            dataRetained:
              true,
          }),
        ],
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Subscription cancellation audit failed:',
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
          'billing.subscription_cancelled',
        eventKey:
          'billing.subscription_cancelled',
        title:
          'SaMi subscription ended',
        message:
          'Your paid SaMi subscription has ended. Workspace data, files, settings and installed app data remain retained. Billing access remains available if you want to reactivate or move to another plan.',
        priority:
          'high',
        dedupeKey:
          `billing:subscription-cancelled:${String(
            row.id,
          )}`,
        metadata: {
          subscriptionId:
            String(
              row.id,
            ),
          requestedAt:
            row.cancelled_at,
          dataRetained:
            true,
        },
      });
    } catch (
      error
    ) {
      console.error(
        '[SaMi Billing] Subscription cancellation notification failed:',
        error,
      );
    }
  }

  return {
    cancelled:
      result.rows.length,
  };
}
