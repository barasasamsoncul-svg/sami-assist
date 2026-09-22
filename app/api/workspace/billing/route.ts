import {
  NextRequest,
} from 'next/server';

import {
  getWorkspaceBillingState,
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
      action !==
        'checkout'
    ) {
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
    }

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
  } catch (
    error
  ) {
    return handleBillingError(
      error,
    );
  }
}
