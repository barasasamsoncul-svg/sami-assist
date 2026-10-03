import { NextRequest, NextResponse } from 'next/server';

import { EnterpriseModuleError } from '@/lib/apps/enterprise/service';
import { TenantContextError } from '@/lib/auth/tenant-context';
import { AccountingInputError } from '@/lib/apps/accounting/validation';
import {
  createAnalyticProject,
  getAccountingDimensions,
  importProjectDimension,
  saveDimensionBudgetLine,
  saveDimensionRule,
  saveDimensionSettings,
  saveJournalLineDimensions,
  setAnalyticProjectStatus,
  setDimensionRuleEnabled,
} from '@/lib/apps/accounting/dimensions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const respond = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

function failure(error: unknown) {
  if (error instanceof SyntaxError) {
    return respond({ error: 'Enter valid project and departmental accounting data.' }, 400);
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

  console.error('[Accounting] Project and departmental action failed', error);
  return respond(
    { error: 'The analytic accounting action could not be completed. Retry or contact your administrator.' },
    500,
  );
}

export async function GET(request: NextRequest) {
  try {
    return respond({
      success: true,
      result: await getAccountingDimensions({
        from: request.nextUrl.searchParams.get('from') || undefined,
        to: request.nextUrl.searchParams.get('to') || undefined,
      }),
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
      return respond({ error: 'Analytic accounting request is too large.' }, 413);
    }
    const body = JSON.parse(raw) as Record<string, unknown>;

    const result =
      body.action === 'save-settings'
        ? await saveDimensionSettings(body)
        : body.action === 'create-project'
          ? await createAnalyticProject(body)
          : body.action === 'import-project'
            ? await importProjectDimension(body)
            : body.action === 'save-allocation'
              ? await saveJournalLineDimensions(body)
              : body.action === 'save-rule'
                ? await saveDimensionRule(body)
                : body.action === 'set-project-status'
                  ? await setAnalyticProjectStatus(body)
                  : body.action === 'set-rule-enabled'
                    ? await setDimensionRuleEnabled(body)
                    : body.action === 'save-budget-line'
                      ? await saveDimensionBudgetLine(body)
                  : (() => {
                      throw new AccountingInputError(
                        'Choose a supported project and departmental accounting action.',
                      );
                    })();

    return respond({ success: true, result });
  } catch (error) {
    return failure(error);
  }
}
