import {
  NextResponse,
} from 'next/server';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  requireCompanyContext,
} from '@/lib/auth/company-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  getSession,
} from '@/lib/auth/session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getSamiAiProviderStatus,
} from '@/lib/ai/config';

import {
  completeSamiAiChat,
} from '@/lib/ai/provider';

import {
  composeDashboard,
} from '@/lib/dashboard/composer';

import type {
  DashboardViewModel,
} from '@/lib/dashboard/types';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function fallbackSummary(
  dashboard:
    DashboardViewModel,
) {
  if (
    dashboard.attention
      .length >
    0
  ) {
    const top =
      dashboard.attention
        .slice(
          0,
          3,
        )
        .map(
          item =>
            item.title,
        )
        .join(
          ' · ',
        );

    return (
      dashboard.attention
        .length ===
      1
        ? '1 business issue needs attention: ' +
          top +
          '.'
        : dashboard.attention
            .length +
          ' business issues need attention: ' +
          top +
          '.'
    );
  }

  if (
    dashboard.aiContext
      .length >
    0
  ) {
    return dashboard.aiContext
      .slice(
        0,
        3,
      )
      .map(
        item =>
          item.title +
          ': ' +
          item.detail,
      )
      .join(
        ' ',
      );
  }

  if (
    dashboard.metrics
      .length >
    0
  ) {
    return dashboard.metrics
      .slice(
        0,
        3,
      )
      .map(
        metric =>
          metric.label +
          ' ' +
          metric.value +
          (
            metric.description
              ? ' (' +
                metric.description +
                ')'
              : ''
          ),
      )
      .join(
        ' · ',
      ) +
      '.';
  }

  if (
    dashboard.work
      .length >
    0
  ) {
    return dashboard.brief
      .message;
  }

  return 'Business analysis will appear here as your permitted apps produce financial, sales and operational signals.';
}


export async function GET() {
  try {
    const [
      session,
      permissions,
      company,
    ] =
      await Promise.all([
        getSession(),
        getPermissionContext(),
        requireCompanyContext()
          .catch(
            () =>
              null,
          ),
      ]);

    if (
      !session ||
      !session.currentTenantId ||
      session.user.id !==
        permissions.userId ||
      session.currentTenantId !==
        permissions.tenantId
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Your workspace session changed. Refresh and try again.',
        },
        {
          status:
            401,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const account =
      await getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      );

    const shell =
      resolveWorkspaceShellAccess({
        modules:
          account.modules,
        subscription:
          account.subscription,
        permissions,
      });

    const dashboard =
      await composeDashboard({
        userId:
          session.user.id,
        permissions,
        modules:
          shell.accessibleModules,
        currentCompanyId:
          company
            ?.currentCompany
            .id ||
          null,
        selectedCompanyIds:
          company
            ?.selectedCompanyIds ||
          [],
        allowedCompanyIds:
          company
            ?.allowedCompanyIds ||
          [],
        aiEnabled:
          shell.aiAvailable,
      });

    const fallback =
      fallbackSummary(
        dashboard,
      );

    const signalCount =
      dashboard.attention
        .length +
      dashboard.work
        .length +
      dashboard.metrics
        .length +
      dashboard.aiContext
        .length;

    if (
      !shell.aiAvailable ||
      signalCount ===
        0 ||
      !getSamiAiProviderStatus()
        .configured
    ) {
      return NextResponse.json(
        {
          success:
            true,
          summary: {
            message:
              fallback,
            generatedByAi:
              false,
            signalCount,
          },
        },
        {
          headers: {
            'Cache-Control':
              'private, max-age=30, stale-while-revalidate=60',
          },
        },
      );
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        3_500,
      );

    try {
      const response =
        await completeSamiAiChat({
          signal:
            controller.signal,
          tools:
            [],
          messages: [
            {
              role:
                'system',
              content:
                'You are SaMi AI. Write a concise business-analysis briefing from the supplied trusted, permission-filtered dashboard signals. Do not summarize audit events, user actions, AI-generated responses, tool calls, logins, or routine system telemetry. Focus on financial position, sales performance, receivables, exceptions, risks, deadlines, queues and supported opportunities. Use only supplied facts. Maximum 3 short sentences. Do not mention AI providers, permissions or implementation details. Do not use markdown.',
            },
            {
              role:
                'user',
              content:
                JSON.stringify({
                  scope:
                    dashboard.scope,
                  attention:
                    dashboard.attention
                      .map(
                        item => ({
                          title:
                            item.title,
                          description:
                            item.description,
                          priority:
                            item.priority,
                          module:
                            item.moduleKey,
                          dueAt:
                            item.dueAt,
                        }),
                      ),
                  work:
                    dashboard.work
                      .map(
                        item => ({
                          title:
                            item.title,
                          description:
                            item.description,
                          status:
                            item.status,
                          priority:
                            item.priority,
                          module:
                            item.moduleKey,
                          dueAt:
                            item.dueAt,
                        }),
                      ),
                  metrics:
                    dashboard.metrics
                      .map(
                        metric => ({
                          label:
                            metric.label,
                          value:
                            metric.value,
                          description:
                            metric.description,
                          tone:
                            metric.tone,
                          module:
                            metric.moduleKey,
                        }),
                      ),
                  analysis:
                    dashboard.aiContext
                      .map(
                        item => ({
                          title:
                            item.title,
                          detail:
                            item.detail,
                          priority:
                            item.priority,
                          module:
                            item.moduleKey,
                        }),
                      ),
                }),
            },
          ],
        });

      const message =
        response.content
          .replace(
            /\s+/g,
            ' ',
          )
          .trim()
          .slice(
            0,
            900,
          );

      return NextResponse.json(
        {
          success:
            true,
          summary: {
            message:
              message ||
              fallback,
            generatedByAi:
              Boolean(
                message,
              ),
            signalCount,
          },
        },
        {
          headers: {
            'Cache-Control':
              'private, max-age=30, stale-while-revalidate=90',
          },
        },
      );
    } catch {
      return NextResponse.json(
        {
          success:
            true,
          summary: {
            message:
              fallback,
            generatedByAi:
              false,
            signalCount,
          },
        },
        {
          headers: {
            'Cache-Control':
              'private, max-age=20',
          },
        },
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  } catch (
    error
  ) {
    console.error(
      '[SaMi Dashboard] Business analysis failed:',
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        error:
          'Dashboard analysis could not be refreshed.',
      },
      {
        status:
          500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
