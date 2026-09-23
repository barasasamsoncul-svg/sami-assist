import Link from 'next/link';
import {
  ArrowLeft,
  Bug,
  Building2,
  Code2,
  Fingerprint,
  UserRound,
} from 'lucide-react';
import {
  notFound,
} from 'next/navigation';

import IncidentActions from '@/app/admin/components/IncidentActions';

import {
  AdminDate,
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  getPlatformIncident,
} from '@/lib/admin/incidents';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AdminIncidentDetailPage({
  params,
}: {
  params:
    Promise<{
      incidentId:
        string;
    }>;
}) {
  const session =
    await requireAdminCapability(
      'incidents.read',
    );

  const {
    incidentId,
  } =
    await params;

  const data =
    await getPlatformIncident(
      incidentId,
    );

  if (
    !data
  ) {
    notFound();
  }

  const incident =
    data.incident;

  const canManage =
    hasAdminCapability(
      session.role,
      'incidents.manage',
    );

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <Link
          href="/admin/operations/incidents"
          className="inline-flex items-center gap-2 text-[11px] font-black text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to incidents
        </Link>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusPill
                value={
                  incident.severity
                }
              />

              <AdminStatusPill
                value={
                  incident.status
                }
              />
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              {incident.title}
            </h1>

            <p className="mt-2 max-w-4xl break-words text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              {incident.message || 'No diagnostic message was recorded.'}
            </p>
          </div>

          <IncidentActions
            incidentId={
              incident.id
            }
            status={
              incident.status
            }
            canManage={
              canManage
            }
          />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
            <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
              Occurrences
            </p>
            <p className="mt-1 text-xl font-black">
              {incident.occurrenceCount}
            </p>
          </div>

          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
            <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
              First seen
            </p>
            <div className="mt-1 text-xs font-bold">
              <AdminDate
                value={
                  incident.firstSeenAt
                }
              />
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
            <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
              Last seen
            </p>
            <div className="mt-1 text-xs font-bold">
              <AdminDate
                value={
                  incident.lastSeenAt
                }
              />
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
            <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
              Provider / source
            </p>
            <p className="mt-1 text-xs font-black capitalize">
              {incident.provider || incident.source}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-black">
            Context
          </h2>

          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex gap-3">
              <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  Route / operation
                </dt>
                <dd className="mt-1 break-all font-mono text-[11px]">
                  {incident.route || '—'}
                  {incident.operation ? ` · ${incident.operation}` : ''}
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <Bug className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  Error
                </dt>
                <dd className="mt-1 font-mono text-[11px]">
                  {incident.errorName || 'Error'}
                  {incident.errorCode ? ` · ${incident.errorCode}` : ''}
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  Workspace
                </dt>
                <dd className="mt-1">
                  {incident.tenantName || incident.tenantId || 'Platform-wide'}
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  User
                </dt>
                <dd className="mt-1">
                  {incident.userEmail || incident.userId || 'System / unknown'}
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                  Fingerprint
                </dt>
                <dd className="mt-1 break-all font-mono text-[10px] text-zinc-500">
                  {incident.fingerprint}
                </dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-black">
            Latest sanitized stack
          </h2>

          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-[10px] leading-5 text-zinc-300">
            {incident.stack || 'No stack trace was recorded.'}
          </pre>
        </div>
      </section>

      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-black">
          Occurrences
        </h2>

        <p className="mt-1 text-xs text-zinc-500">
          Latest 100 occurrences, newest first.
        </p>

        <div className="mt-4 space-y-3">
          {data.occurrences.map(
            occurrence => (
              <details
                key={
                  occurrence.id
                }
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <summary className="cursor-pointer">
                  <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <strong>
                      {occurrence.errorCode || occurrence.errorName || 'Error'}
                    </strong>

                    <span className="text-zinc-500">
                      {occurrence.route || 'No route'}
                    </span>

                    <AdminDate
                      value={
                        occurrence.createdAt
                      }
                    />
                  </div>
                </summary>

                <div className="mt-4 space-y-3">
                  <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    {occurrence.message || 'No message'}
                  </p>

                  <div className="grid gap-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
                    <p>
                      <strong>Correlation:</strong> {occurrence.correlationId}
                    </p>
                    <p>
                      <strong>Request:</strong> {occurrence.requestId || '—'}
                    </p>
                    <p>
                      <strong>Workspace:</strong> {occurrence.tenantName || occurrence.tenantId || '—'}
                    </p>
                    <p>
                      <strong>User:</strong> {occurrence.userEmail || occurrence.userId || '—'}
                    </p>
                  </div>

                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-3 text-[10px] leading-5 text-zinc-300">
                    {occurrence.stack || 'No stack trace.'}
                  </pre>

                  <details>
                    <summary className="cursor-pointer text-[10px] font-black text-zinc-500">
                      Diagnostic metadata
                    </summary>

                    <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-zinc-950 p-3 text-[10px] leading-5 text-zinc-300">
                      {JSON.stringify(
                        occurrence.metadata,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
              </details>
            ),
          )}

          {data.occurrences.length ===
            0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No occurrences were recorded.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
