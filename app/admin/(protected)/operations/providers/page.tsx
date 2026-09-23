import {
  Activity,
  Cloud,
} from 'lucide-react';

import {
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';

import {
  getPlatformProviderHealth,
} from '@/lib/admin/provider-health';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminProvidersPage() {
  await requireAdminCapability(
    'providers.read',
  );

  const data =
    await getPlatformProviderHealth();

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Operations
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
          Providers
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Live server-side checks for infrastructure and service providers connected to SaMi. Credentials never leave the server and are never rendered here.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.providers.map(
          provider => (
            <section
              key={
                provider.key
              }
              className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <Cloud className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black text-zinc-950 dark:text-white">
                      {provider.name}
                    </h2>

                    <AdminStatusPill
                      value={
                        provider.status
                      }
                    />
                  </div>

                  <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {provider.message}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-[11px] dark:bg-zinc-900/60">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <Activity className="h-3.5 w-3.5" />
                  Latency
                </span>

                <strong>
                  {provider.latencyMs === null ? '—' : `${provider.latencyMs} ms`}
                </strong>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-black text-zinc-500">
                  Safe provider metadata
                </summary>

                <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-zinc-950 p-3 text-[10px] leading-5 text-zinc-300">
                  {JSON.stringify(
                    provider.metadata,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
