import {
  NextResponse,
} from 'next/server';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';
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
  getWorkspaceActivitySummary,
  listWorkspaceActivity,
} from '@/lib/services/workspace-activity';

export const runtime =
  'nodejs';
export const dynamic =
  'force-dynamic';

function fallbackSummary(
  activity:
    Awaited<
      ReturnType<
        typeof listWorkspaceActivity
      >
    >['items'],
  summary:
    Awaited<
      ReturnType<
        typeof getWorkspaceActivitySummary
      >
    >,
) {
  if (
    activity.length >
      0
  ) {
    const latest =
      activity
        .slice(
          0,
          3,
        )
        .map(
          item =>
            item.label,
        )
        .join(
          ' · ',
        );

    return summary.todayCount >
      0
      ? `You recorded ${summary.todayCount} workspace activit${summary.todayCount === 1 ? 'y' : 'ies'} today. Latest: ${latest}.`
      : `Your latest workspace activity: ${latest}.`;
  }

  if (
    summary.todayCount >
      0
  ) {
    return `You recorded ${summary.todayCount} workspace activit${summary.todayCount === 1 ? 'y' : 'ies'} today across ${summary.modules7d} module${summary.modules7d === 1 ? '' : 's'} this week.`;
  }

  return 'No recent workspace activity has been recorded yet. As you work in SaMi, this briefing will summarize what changed and what may need attention.';
}

export async function GET() {
  try {
    const [
      session,
      permissions,
    ] =
      await Promise.all([
        getSession(),
        getPermissionContext(),
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

    const [
      account,
      activityResult,
      activitySummary,
    ] =
      await Promise.all([
        getAccountContextForUser(
          session.user.id,
          session.currentTenantId,
        ),
        listWorkspaceActivity({
          view:
            'activity',
          limit:
            12,
        }),
        getWorkspaceActivitySummary(),
      ]);

    const shell =
      resolveWorkspaceShellAccess({
        modules:
          account.modules,
        subscription:
          account.subscription,
        permissions,
      });

    const fallback =
      fallbackSummary(
        activityResult.items,
        activitySummary,
      );

    if (
      !shell.aiAvailable ||
      activityResult.items
        .length ===
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
            activityCount:
              activitySummary.todayCount,
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
                'You are SaMi AI. Write a concise operational dashboard briefing from the supplied trusted workspace activity. Use only supplied facts. Maximum 3 short sentences. Mention concrete recent work and failures/attention when present. Do not mention AI providers, permissions, or implementation details. Do not use markdown.',
            },
            {
              role:
                'user',
              content:
                JSON.stringify({
                  todayActivityCount:
                    activitySummary.todayCount,
                  failuresLast7Days:
                    activitySummary.failed7d,
                  activeModulesLast7Days:
                    activitySummary.modules7d,
                  recentActivity:
                    activityResult.items.map(
                      item => ({
                        label:
                          item.label,
                        summary:
                          item.summary,
                        module:
                          item.module,
                        result:
                          item.result,
                        createdAt:
                          item.createdAt,
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
            activityCount:
              activitySummary.todayCount,
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
            activityCount:
              activitySummary.todayCount,
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
      '[SaMi Dashboard] AI summary failed:',
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        error:
          'Dashboard summary could not be refreshed.',
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
