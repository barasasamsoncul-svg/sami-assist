import {
  AlertTriangle,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';

import {
  AdminDate,
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';

import {
  getAdminSecurityOverview,
} from '@/lib/admin/oversight';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminSecurityPage() {
  await requireAdminCapability(
    'security.read',
  );

  const data =
    await getAdminSecurityOverview();

  const cards = [
    {
      label:
        'Locked users',
      value:
        data.lockedUsers,
      icon:
        LockKeyhole,
    },
    {
      label:
        'Failed user logins · 24h',
      value:
        data.failedUserLoginsLast24Hours,
      icon:
        AlertTriangle,
    },
    {
      label:
        'Failed admin logins · 24h',
      value:
        data.failedAdminLoginsLast24Hours,
      icon:
        ShieldCheck,
    },
    {
      label:
        'Active admin sessions',
      value:
        data.activeAdminSessions,
      icon:
        UserRoundCheck,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Platform Administration
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
          Security
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Cross-platform security posture for SaMi identities and Platform Administrators. Workspace business permissions remain isolated from this operator surface.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(
            card => {
              const Icon =
                card.icon;

              return (
                <div
                  key={
                    card.label
                  }
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      {card.label}
                    </p>

                    <Icon className="h-4 w-4 text-zinc-400" />
                  </div>

                  <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
                    {card.value.toLocaleString(
                      'en-KE',
                    )}
                  </p>
                </div>
              );
            },
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-black text-zinc-950 dark:text-white">
            Recent administrator security events
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                {[
                  'Event',
                  'Result',
                  'Admin',
                  'IP',
                  'Reason',
                  'Time',
                ].map(
                  label => (
                    <th
                      key={
                        label
                      }
                      className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {data.recentEvents.map(
                event => (
                  <tr
                    key={
                      event.id
                    }
                    className="align-top"
                  >
                    <td className="px-4 py-3 text-xs font-black text-zinc-950 dark:text-white">
                      {event.eventType || event.action || 'Security event'}
                    </td>

                    <td className="px-4 py-3">
                      <AdminStatusPill
                        value={
                          event.successful
                            ? 'success'
                            : 'failed'
                        }
                      />
                    </td>

                    <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                      {event.adminId || 'unknown'}
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {event.ipAddress || '—'}
                    </td>

                    <td className="max-w-[260px] px-4 py-3 text-xs text-zinc-500">
                      {event.failureReason || '—'}
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <AdminDate
                        value={
                          event.createdAt
                        }
                      />
                    </td>
                  </tr>
                ),
              )}

              {data.recentEvents.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No recent administrator security events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
