import {
  NextRequest,
} from 'next/server';

import {
  cancelScheduledWorkspacePlanChange,
  cancelWorkspaceSubscription,
  changeWorkspaceSubscriptionPlan,
  getWorkspaceBillingState,
  reactivateCancelledWorkspaceSubscription,
  resumeWorkspaceSubscriptionCancellation,
  startWorkspaceBillingCheckout,
} from '@/lib/services/workspace-billing';

import {
  billingJson,
  handleBillingError,
  readBillingJson,
  rejectBillingCrossOrigin,
} from '@/lib/services/workspace-billing-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export async function GET() {
  try {
    const state =
      await getWorkspaceBillingState();

    return billingJson({
      success:
        true,
      billing:
        state,
    });
  } catch (
    error
  ) {
    return handleBillingError(
      error,
    );
  }
}

export async function POST(
  request:
    NextRequest,
) {
  const rejected =
    rejectBillingCrossOrigin(
      request,
    );

  if (
    rejected
  ) {
    return rejected;
  }

  try {
    const body =
      await readBillingJson(
        request,
      );

    const action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';

    if (
      action ===
        'checkout'
    ) {
      const result =
        await startWorkspaceBillingCheckout({
          origin:
            request.nextUrl
              .origin,
        });

      return billingJson({
        success:
          true,
        checkout:
          result,
      });
    }

    if (
      action ===
        'change_plan'
    ) {
      const result =
        await changeWorkspaceSubscriptionPlan(
          body.targetPlan,
        );

      return billingJson({
        success:
          true,
        planChange:
          result,
      });
    }

    if (
      action ===
        'cancel_plan_change'
    ) {
      const result =
        await cancelScheduledWorkspacePlanChange();

      return billingJson({
        success:
          true,
        planChangeCancellation:
          result,
      });
    }

    if (
      action ===
        'cancel_subscription'
    ) {
      const result =
        await cancelWorkspaceSubscription();

      return billingJson({
        success:
          true,
        subscriptionCancellation:
          result,
      });
    }

    if (
      action ===
        'resume_subscription'
    ) {
      const result =
        await resumeWorkspaceSubscriptionCancellation();

      return billingJson({
        success:
          true,
        subscriptionResume:
          result,
      });
    }

    if (
      action ===
        'reactivate_subscription'
    ) {
      const result =
        await reactivateCancelledWorkspaceSubscription();

      return billingJson({
        success:
          true,
        subscriptionReactivation:
          result,
      });
    }

    return billingJson(
      {
        success:
          false,
        code:
          'INVALID_BILLING_ACTION',
        error:
          'Choose a valid billing action.',
      },
      400,
    );
  } catch (
    error
  ) {
    return handleBillingError(
      error,
    );
  }
}
