import { NextRequest, NextResponse } from 'next/server';

import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  approveBudgetVersion,
  closeBudgetPlan,
  createBudgetPlan,
  createBudgetRevision,
  createBudgetVarianceSnapshot,
  generateBudgetForecast,
  getAccountingBudgets,
  publishBudgetVersion,
  saveBudgetAssumption,
  saveBudgetLines,
  saveBudgetSettings,
} from '@/lib/apps/accounting/budgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const respond = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });

function failure(error: unknown) {
  if (error instanceof SyntaxError) {
    return respond({ error: 'Enter valid budgets and forecasts data.' }, 400);
  }
  if (error instanceof AccountingInputError) {
    return respond({ error: error.message }, 400);
  }
  if (error instanceof TenantContextError) {
    return respond(
      { error: error.message },
      error.code === 'UNAUTHENTICATED' ? 401 : 403,
    );
  }
  if (error instanceof EnterpriseModuleError) {
    return respond(
      { error: error.message },
      error.code === 'MODULE_PERMISSION_REQUIRED' ? 403 : 409,
    );
  }

  console.error('[Accounting] Budgets and Forecasts action failed', error);
  return respond(
    {
      error:
        'The budget or forecast action could not be completed. Retry or contact your administrator.',
    },
    500,
  );
}

export async function GET() {
  try {
    return respond({
      success: true,
      result: await getAccountingBudgets(),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== request.nextUrl.origin)
  ) {
    return respond({ error: 'This request could not be verified.' }, 403);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 256 * 1024) {
      return respond({ error: 'Budget or forecast request is too large.' }, 413);
    }
    const body = JSON.parse(raw) as Record<string, unknown>;

    const result =
      body.action === 'save-settings'
        ? await saveBudgetSettings(body)
        : body.action === 'create-plan'
          ? await createBudgetPlan(body)
          : body.action === 'save-lines'
            ? await saveBudgetLines(body)
            : body.action === 'save-assumption'
              ? await saveBudgetAssumption(body)
              : body.action === 'create-revision'
                ? await createBudgetRevision(body)
                : body.action === 'approve-version'
                  ? await approveBudgetVersion(body)
                  : body.action === 'publish-version'
                    ? await publishBudgetVersion(body)
                    : body.action === 'generate-forecast'
                      ? await generateBudgetForecast(body)
                      : body.action === 'variance-snapshot'
                        ? await createBudgetVarianceSnapshot(body)
                        : body.action === 'close-plan'
                          ? await closeBudgetPlan(body)
                          : (() => {
                              throw new AccountingInputError(
                                'Choose a supported budgets and forecasts action.',
                              );
                            })();

    return respond({ success: true, result });
  } catch (error) {
    return failure(error);
  }
}
