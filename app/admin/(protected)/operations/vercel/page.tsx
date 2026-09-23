import {
  AdminDate,
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';

import {
  getVercelOperationalSnapshot,
} from '@/lib/admin/vercel-observability';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminVercelRuntimePage() {
  await requireAdminCapability(
    'providers.read',
  );

  const data =
    await getVercelOperationalSnapshot();

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Operations · Vercel
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
          Deployments & Runtime Logs
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Production deployment state and recent sanitized runtime events from Vercel. API credentials remain server-only.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <AdminStatusPill
            value={
              data.configured
                ? data.error
                  ? 'degraded'
                  : 'healthy'
                : 'not_configured'
            }
          />

          <span className="font-mono text-[10px] text-zinc-500">
            {data.projectId || 'No project ID'}
          </span>
        </div>

        {data.error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-500/10 dark:text-amber-200">
            {data.error}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-black">
            Recent production deployments
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                {[
                  'State',
                  'Commit',
                  'Branch',
                  'URL',
                  'Created',
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
              {data.deployments.map(
                deployment => (
                  <tr
                    key={
                      deployment.id
                    }
                  >
                    <td className="px-4 py-3">
                      <AdminStatusPill
                        value={
                          deployment.state
                        }
                      />
                    </td>

                    <td className="max-w-[360px] px-4 py-3">
                      <p className="line-clamp-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {deployment.commitMessage || '—'}
                      </p>
                      <p className="mt-1 font-mono text-[9px] text-zinc-400">
                        {deployment.commitSha || deployment.id}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      {deployment.commitRef || '—'}
                    </td>

                    <td className="max-w-[260px] px-4 py-3 font-mono text-[10px] text-zinc-500">
                      <span className="break-all">
                        {deployment.url || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <AdminDate
                        value={
                          deployment.createdAt
                        }
                      />
                    </td>
                  </tr>
                ),
              )}

              {data.deployments.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      5
                    }
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No deployment data is available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h2 className="text-sm font-black">
            Runtime events
          </h2>

          <p className="mt-1 text-xs text-zinc-500">
            Latest events from the newest production deployment. Secrets and credential-like values are redacted before rendering.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {data.runtimeEvents.map(
            (
              event,
              index,
            ) => (
              <details
                key={`${event.createdAt || 'event'}-${event.requestId || index}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <summary className="cursor-pointer">
                  <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-[11px]">
                    <AdminStatusPill
                      value={
                        event.level ||
                        event.type ||
                        'info'
                      }
                    />

                    <span className="font-mono text-zinc-500">
                      {event.route || 'runtime'}
                    </span>

                    <AdminDate
                      value={
                        event.createdAt
                      }
                    />
                  </div>
                </summary>

                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-[10px] leading-5 text-zinc-300">
                  {event.text || 'No log text.'}
                </pre>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-zinc-400">
                  <span>
                    request: {event.requestId || '—'}
                  </span>
                  <span>
                    status: {event.statusCode ?? '—'}
                  </span>
                </div>
              </details>
            ),
          )}

          {data.runtimeEvents.length ===
            0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No runtime events are available for this deployment.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
