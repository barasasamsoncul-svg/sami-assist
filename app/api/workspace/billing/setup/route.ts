import {
  NextRequest,
} from 'next/server';

import {
  completeWorkspaceRecurringBillingSetup,
  startWorkspaceRecurringBillingSetup,
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
        'start'
    ) {
      const setup =
        await startWorkspaceRecurringBillingSetup({
          origin:
            request.nextUrl
              .origin,
        });

      return billingJson({
        success:
          true,
        setup,
      });
    }

    if (
      action ===
        'complete'
    ) {
      const recurring =
        await completeWorkspaceRecurringBillingSetup();

      return billingJson({
        success:
          true,
        recurring,
      });
    }

    return billingJson(
      {
        success:
          false,
        code:
          'INVALID_BILLING_SETUP_ACTION',
        error:
          'Choose a valid billing setup action.',
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
