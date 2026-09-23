import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileClock,
  ServerCog,
} from 'lucide-react';

import {
  getAdminPlatformHealth,
} from '@/lib/admin/oversight';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminPlatformHealthPage() {
  await requireAdminCapability(
    'health.read',
  );

  const health =
    await getAdminPlatformHealth();

  const cards = [
    {
      label:
        'Workspaces',
      value:
        health.tenants,
      detail:
        'Active Control DB records',
      icon:
        ServerCog,
    },
    {
      label:
        'Healthy tenant DBs',
      value:
        health.tenantDatabases.healthy,
      detail:
        `${health.tenantDatabases.total} registered`,
      icon:
        Database,
    },
    {
      label:
        'Open incidents',
      value:
        health.incidents.open +
        health.incidents.acknowledged,
      detail:
        `${health.incidents.critical} critical · ${health.incidents.errors} errors`,
      icon:
        AlertTriangle,
    },
    {
      label:
        'Failed jobs · 24h',
      value:
        health.failedJobsLast24Hours,
      detail:
        'Platform workers / scheduled jobs',
      icon:
        FileClock,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Operations
        </p>

        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              Platform Health
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Control-plane health, tenant database state, registration durability, schema level, incidents and background-job failures.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Control DB reachable
          </div>
        </div>

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

                  <p className="mt-1 text-[10px] text-zinc-500">
                    {card.detail}
                  </p>
                </div>
              );
            },
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-black">
              Tenant databases
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(
              health.tenantDatabases,
            ).map(
              ([
                key,
                value,
              ]) => (
                <div
                  key={
                    key
                  }
                  className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60"
                >
                  <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                    {key}
                  </p>
                  <p className="mt-1 text-lg font-black">
                    {value}
                  </p>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-black">
              Control plane
            </h2>
          </div>

          <dl className="mt-5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">
                Control DB latency
              </dt>
              <dd className="font-black">
                {health.controlDatabase.latencyMs} ms
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">
                Latest control migration
              </dt>
              <dd className="text-right font-black">
                {health.schema.latestVersion || '—'} {health.schema.latestName || ''}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">
                Entitled subscriptions
              </dt>
              <dd className="font-black">
                {health.entitledSubscriptions}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">
                Registration processing
              </dt>
              <dd className="font-black">
                {health.registrationRequests.processing}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">
                Registration failures
              </dt>
              <dd className="font-black">
                {health.registrationRequests.failed}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
