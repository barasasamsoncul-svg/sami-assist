import 'server-only';

import {
  getEffectiveSubscriptionStatus,
  getSamiPlanPolicy,
  normalizeSamiPlanKey,
} from '@/lib/billing/plan-policy';

import {
  getSamiPricePerUserMonthly,
  SAMI_BILLING_CURRENCY,
} from '@/lib/billing/pricing';

import {
  applyDueScheduledPlanChanges,
} from '@/lib/billing/plan-transition';

import {
  getBillingProvider,
} from '@/lib/billing/registry';

import {
  updateActiveSubscriptionBillingProfile,
} from '@/lib/billing/profiles';

import {
  queryControl,
} from '@/lib/db/control';

import {
  notifyWorkspaceOwnersOfBillingEvent,
} from '@/lib/billing/notifications';

import {
  getSubscriptionSuspensionWindow,
} from '@/lib/billing/access';

function closeEnough(
  left:
    number | null,
  right:
    number,
) {
  return (
    left !==
      null &&
    Math.abs(
      left -
      right,
    ) <
      0.01
  );
}

async function billableUsers(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM tenant_users
        WHERE tenant_id = $1
          AND deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  member_type,
                  ''
                )
              ) =
              'internal'
      `,
      [
        tenantId,
      ],
    );

  return Math.max(
    1,
    Number(
      result.rows[0]
        ?.count ||
      0,
    ),
  );
}

export async function reconcileWorkspaceBilling(
  limit =
    100,
) {
  await applyDueScheduledPlanChanges();

  const result =
    await queryControl(
      `
        SELECT
          s.id,
          s.tenant_id,
          s.status,
          s.trial_ends_at,
          s.current_period_end,
          p.key
            AS plan_key,
          sp.key
            AS scheduled_plan_key,
          bp.provider,
          bp.provider_subscription_id,
          bp.recurring_status,
          bp.price_per_user_monthly,
          bp.seat_quantity
        FROM subscriptions s
        INNER JOIN plans p
          ON p.id =
             s.plan_id
         AND p.deleted_at
             IS NULL
         AND p.is_active =
             TRUE
        LEFT JOIN plans sp
          ON sp.id =
             s.scheduled_plan_id
         AND sp.deleted_at
             IS NULL
         AND sp.is_active =
             TRUE
        LEFT JOIN subscription_billing_profiles bp
          ON bp.subscription_id =
             s.id
         AND bp.is_active =
             TRUE
        WHERE s.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  s.status,
                  ''
                )
              ) IN (
                'trial',
                'trialing',
                'active',
                'past_due'
              )
        ORDER BY
          COALESCE(
            s.current_period_end,
            s.trial_ends_at,
            s.updated_at
          ) ASC NULLS LAST
        LIMIT $1
      `,
      [
        Math.max(
          1,
          Math.min(
            500,
            Math.floor(
              limit,
            ),
          ),
        ),
      ],
    );

  const report = {
    checked:
      0,
    statusUpdated:
      0,
    recurringUpdated:
      0,
    skipped:
      0,
    failures:
      0,
  };

  for (
    const row
    of result.rows
  ) {
    report.checked +=
      1;

    const planKey =
      normalizeSamiPlanKey(
        row.plan_key,
      );

    const policy =
      planKey
        ? getSamiPlanPolicy(
            planKey,
          )
        : null;

    const providerPlanKey =
      normalizeSamiPlanKey(
        row.scheduled_plan_key,
      ) ||
      planKey;

    const providerPlanPolicy =
      providerPlanKey
        ? getSamiPlanPolicy(
            providerPlanKey,
          )
        : null;

    if (
      !planKey ||
      !policy
    ) {
      report.skipped +=
        1;
      continue;
    }

    const effectiveStatus =
      getEffectiveSubscriptionStatus({
        status:
          row.status,
        planKey,
        trialEndsAt:
          row.trial_ends_at,
        currentPeriodEnd:
          row.current_period_end,
      });

    const suspension =
      getSubscriptionSuspensionWindow({
        effectiveStatus,
        trialEndsAt:
          row.trial_ends_at,
        currentPeriodEnd:
          row.current_period_end,
      });

    if (
      policy.paid &&
      [
        'trial',
        'trialing',
        'active',
      ].includes(
        effectiveStatus,
      )
    ) {
      const boundaryValue =
        (
          effectiveStatus ===
            'trial' ||
          effectiveStatus ===
            'trialing'
        )
          ? row.trial_ends_at
          : row.current_period_end;

      const boundaryDate =
        boundaryValue
          ? new Date(
              boundaryValue,
            )
          : null;

      if (
        boundaryDate &&
        !Number.isNaN(
          boundaryDate
            .getTime(),
        )
      ) {
        const remainingMs =
          boundaryDate
            .getTime() -
          Date.now();

        const remainingDays =
          Math.ceil(
            remainingMs /
            (
              24 *
              60 *
              60 *
              1000
            ),
          );

        const reminderBucket =
          remainingDays <= 1 &&
          remainingDays >= 0
            ? 1
            : remainingDays <= 3 &&
                remainingDays > 1
              ? 3
              : remainingDays <= 7 &&
                  remainingDays > 3
                ? 7
                : null;

        if (
          reminderBucket !==
            null
        ) {
          try {
            await notifyWorkspaceOwnersOfBillingEvent({
              tenantId:
                String(
                  row.tenant_id,
                ),
              type:
                'billing.due_soon',
              eventKey:
                'billing.due_soon',
              title:
                reminderBucket ===
                  1
                  ? 'Subscription payment due soon'
                  : `Subscription payment due within ${reminderBucket} days`,
              message:
                `Your SaMi ${policy.name} subscription billing boundary is ${boundaryDate.toLocaleDateString(
                  'en-KE',
                  {
                    year:
                      'numeric',
                    month:
                      'short',
                    day:
                      'numeric',
                    timeZone:
                      'Africa/Nairobi',
                  },
                )}. Review Billing before it becomes past due to avoid workspace suspension.`,
              priority:
                reminderBucket ===
                  1
                  ? 'urgent'
                  : 'high',
              dedupeKey:
                `billing:due-soon:${row.id}:${boundaryDate.toISOString()}:${reminderBucket}`,
              metadata: {
                subscriptionId:
                  String(
                    row.id,
                  ),
                plan:
                  planKey,
                billingBoundary:
                  boundaryDate
                    .toISOString(),
                reminderDays:
                  reminderBucket,
              },
            });
          } catch (
            error
          ) {
            console.error(
              '[SaMi Billing] Due-soon notification failed:',
              error,
            );
          }
        }
      }
    }

    if (
      effectiveStatus ===
        'past_due' &&
      String(
        row.status,
      )
        .toLowerCase() !==
        'past_due'
    ) {
      await queryControl(
        `
          UPDATE subscriptions
          SET
            status =
              'past_due',
            updated_at =
              NOW()
          WHERE id = $1
            AND deleted_at
                IS NULL
        `,
        [
          row.id,
        ],
      );

      report.statusUpdated +=
        1;
    }

    if (
      suspension.pastDue
    ) {
      const boundary =
        suspension.dueAt ||
        'unknown';

      const phase =
        suspension.suspended
          ? 'suspended'
          : (
              suspension.daysPastDue !==
                null &&
              suspension.daysPastDue >=
                Math.max(
                  1,
                  Math.floor(
                    suspension.graceDays /
                    2,
                  ),
                )
            )
            ? 'final_warning'
            : 'overdue';

      const graceDate =
        suspension.graceEndsAt
          ? new Date(
              suspension.graceEndsAt,
            )
              .toLocaleDateString(
                'en-KE',
                {
                  year:
                    'numeric',
                  month:
                    'short',
                  day:
                    'numeric',
                  timeZone:
                    'Africa/Nairobi',
                },
              )
          : null;

      try {
        await notifyWorkspaceOwnersOfBillingEvent({
          tenantId:
            String(
              row.tenant_id,
            ),
          type:
            suspension.suspended
              ? 'billing.suspended'
              : 'billing.past_due',
          eventKey:
            suspension.suspended
              ? 'billing.suspended'
              : 'billing.past_due',
          title:
            suspension.suspended
              ? 'Workspace suspended for overdue payment'
              : phase ===
                  'final_warning'
                ? 'Final payment reminder'
                : 'Subscription payment is overdue',
          message:
            suspension.suspended
              ? 'SaMi has suspended normal workspace work because the subscription remains unpaid after the grace period. Your data is retained. Open Billing and complete payment to restore access automatically.'
              : `Your SaMi subscription is overdue. Normal workspace access remains available during the ${suspension.graceDays}-day grace period${graceDate ? ` until ${graceDate}` : ''}. Complete payment before the deadline to avoid suspension.`,
          priority:
            'urgent',
          dedupeKey:
            `billing:${phase}:${row.id}:${String(
              boundary,
            )}`,
          metadata: {
            subscriptionId:
              String(
                row.id,
              ),
            plan:
              planKey,
            boundary:
              String(
                boundary,
              ),
            phase,
            graceDays:
              suspension.graceDays,
            graceEndsAt:
              suspension.graceEndsAt,
            daysPastDue:
              suspension.daysPastDue,
            suspended:
              suspension.suspended,
          },
        });
      } catch (
        error
      ) {
        console.error(
          '[SaMi Billing] Past-due notification failed:',
          error,
        );
      }
    }

    if (
      !policy.paid ||
      !providerPlanPolicy ||
      !providerPlanPolicy.paid ||
      !row.provider ||
      !row.provider_subscription_id ||
      ![
        'trialing',
        'active',
      ].includes(
        String(
          row.recurring_status ||
          '',
        )
          .toLowerCase(),
      )
    ) {
      continue;
    }

    try {
      const provider =
        getBillingProvider(
          String(
            row.provider,
          ),
        );

      if (
        !provider
          .isConfigured() ||
        !provider
          .capabilities
          .updateRecurringQuantity ||
        !provider
          .updateRecurringSubscription
      ) {
        report.skipped +=
          1;
        continue;
      }

      const seats =
        await billableUsers(
          String(
            row.tenant_id,
          ),
        );

      const price =
        getSamiPricePerUserMonthly(
          providerPlanKey,
        );

      const storedPrice =
        row.price_per_user_monthly ===
          null ||
        row.price_per_user_monthly ===
          undefined
          ? null
          : Number(
              row.price_per_user_monthly,
            );

      const storedSeats =
        row.seat_quantity ===
          null ||
        row.seat_quantity ===
          undefined
          ? null
          : Number(
              row.seat_quantity,
            );

      if (
        storedSeats ===
          seats &&
        closeEnough(
          storedPrice,
          price,
        )
      ) {
        continue;
      }

      const updated =
        await provider
          .updateRecurringSubscription({
            providerSubscriptionId:
              String(
                row.provider_subscription_id,
              ),
            pricePerUserMonthly:
              price,
            billableUsers:
              seats,
            currency:
              SAMI_BILLING_CURRENCY,
          });

      await updateActiveSubscriptionBillingProfile(
        String(
          row.id,
        ),
        {
          recurringStatus:
            updated.status ===
              'active'
              ? 'active'
              : updated.status ===
                  'trialing'
                ? 'trialing'
                : String(
                    row.recurring_status,
                  ),
          pricePerUserMonthly:
            price,
          seatQuantity:
            seats,
          metadata: {
            lastReconciledAt:
              new Date()
                .toISOString(),
            lastProviderStatus:
              updated.status,
          },
        },
      );

      report.recurringUpdated +=
        1;
    } catch (
      error
    ) {
      report.failures +=
        1;

      console.error(
        '[SaMi Billing] Recurring billing reconciliation failed:',
        {
          subscriptionId:
            row.id,
          provider:
            row.provider,
          error,
        },
      );
    }
  }

  return report;
}
