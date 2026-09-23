'use client';

import Link from 'next/link';

import {
  AlertTriangle,
  CloudCog,
  Database,
  FileClock,
  Gauge,
  TriangleAlert,
} from 'lucide-react';

import type {
  AdminOperationsDashboard,
} from '@/lib/admin/dashboard-operations';


function statusClasses(
  status:
    string,
) {
  const normalized =
    status
      .trim()
      .toLowerCase();

  if (
    [
      'active',
      'healthy',
      'trial',
    ].includes(
      normalized,
    )
  ) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (
    [
      'expired',
      'suspended',
      'payment_required',
      'unavailable',
      'critical',
    ].includes(
      normalized,
    )
  ) {
    return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
  }

  if (
    [
      'renewal_due',
      'quota_warning',
      'upgrade_recommended',
      'degraded',
      'not_configured',
    ].includes(
      normalized,
    )
  ) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  }

  return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300';
}


function dateLabel(
  value:
    string |
    null,
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date
    .toLocaleDateString(
      'en-KE',
      {
        dateStyle:
          'medium',
      },
    );
}


export default function AdminOperationsOverview({
  operations,
}: {
  operations:
    AdminOperationsDashboard;
}) {
  if (
    !operations.available
  ) {
    return (
      <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <TriangleAlert className="h-5 w-5" />
          </span>

          <div>
            <h2 className="text-sm font-black text-zinc-950 dark:text-white">
              Operations data not initialized
            </h2>

            <p className="mt-1 text-xs leading-5 text-zinc-500">
              The standard Platform Admin dashboard is still available. Apply the Category 24 control migrations to activate incidents, provider checks, jobs and infrastructure subscription monitoring.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const unhealthyDatabases =
    operations
      .tenantDatabases
      .degraded +
    operations
      .tenantDatabases
      .unreachable;

  const attentionServices =
    operations.services
      .filter(
        service =>
          ![
            'active',
            'trial',
          ].includes(
            service.status,
          ),
      )
      .slice(
        0,
        6,
      );

  const activeIncidents =
    operations
      .incidents
      .open +
    operations
      .incidents
      .acknowledged;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
            Platform Operations
          </p>

          <h2 className="mt-1 text-xl font-black tracking-[-0.025em] text-zinc-950 dark:text-white">
            SaMi control room
          </h2>
        </div>

        <Link
          href="/admin/operations/health"
          className="text-[11px] font-black text-blue-600 hover:underline dark:text-blue-400"
        >
          Open Platform Health
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/admin/operations/incidents"
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
              Active incidents
            </span>
            <AlertTriangle className="h-4 w-4 text-zinc-400" />
          </div>

          <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
            {activeIncidents}
          </p>

          <p className="mt-1 text-[10px] text-zinc-500">
            {operations.incidents.critical} critical · {operations.incidents.errors} errors
          </p>
        </Link>

        <Link
          href="/admin/businesses"
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
              Tenant DB problems
            </span>
            <Database className="h-4 w-4 text-zinc-400" />
          </div>

          <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
            {unhealthyDatabases}
          </p>

          <p className="mt-1 text-[10px] text-zinc-500">
            {operations.tenantDatabases.healthy}/{operations.tenantDatabases.total} healthy
          </p>
        </Link>

        <Link
          href="/admin/operations/jobs"
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
              Failed jobs · 24h
            </span>
            <FileClock className="h-4 w-4 text-zinc-400" />
          </div>

          <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
            {operations.jobs.failedLast24Hours}
          </p>

          <p className="mt-1 text-[10px] text-zinc-500">
            {operations.jobs.running} currently running
          </p>
        </Link>

        <Link
          href="/admin/operations/services"
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
              Services needing attention
            </span>
            <Gauge className="h-4 w-4 text-zinc-400" />
          </div>

          <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
            {attentionServices.length}
          </p>

          <p className="mt-1 text-[10px] text-zinc-500">
            Paid infrastructure, quotas & renewals
          </p>
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-zinc-950 dark:text-white">
                Infrastructure attention
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                Services that are not currently in a normal active/trial state.
              </p>
            </div>

            <CloudCog className="h-5 w-5 text-zinc-400" />
          </div>

          <div className="mt-4 space-y-2">
            {attentionServices.map(
              service => (
                <Link
                  key={
                    service.serviceKey
                  }
                  href="/admin/operations/services"
                  className="flex items-start justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-3 transition hover:bg-zinc-100 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-zinc-950 dark:text-white">
                      {service.serviceName}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      {service.provider} · {service.category}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusClasses(
                        service.status,
                      )}`}
                    >
                      {service.status.replace(
                        /_/g,
                        ' ',
                      )}
                    </span>

                    {(service.renewalAt ||
                      service.expiresAt) && (
                      <p className="mt-1 text-[9px] text-zinc-400">
                        {dateLabel(
                          service.renewalAt ||
                          service.expiresAt,
                        )}
                      </p>
                    )}
                  </div>
                </Link>
              ),
            )}

            {attentionServices.length ===
              0 && (
              <div className="rounded-xl bg-emerald-50 px-3 py-4 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                No monitored infrastructure service currently needs attention.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-black text-zinc-950 dark:text-white">
            Last provider checks
          </h3>

          <div className="mt-4 space-y-2">
            {operations.providerChecks
              .slice(
                0,
                8,
              )
              .map(
                provider => (
                  <div
                    key={`${provider.provider}:${provider.component}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black capitalize">
                        {provider.provider}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-zinc-500">
                        {provider.component}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusClasses(
                          provider.status,
                        )}`}
                      >
                        {provider.status}
                      </span>

                      {provider.latencyMs !==
                        null && (
                        <p className="mt-1 text-[9px] text-zinc-400">
                          {provider.latencyMs} ms
                        </p>
                      )}
                    </div>
                  </div>
                ),
              )}

            {operations.providerChecks.length ===
              0 && (
              <p className="rounded-xl bg-zinc-50 px-3 py-4 text-xs text-zinc-500 dark:bg-zinc-900/60">
                Provider checks will appear after the Platform Monitor runs or you use Sync now.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
