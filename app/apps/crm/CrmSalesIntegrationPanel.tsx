'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  RefreshCw,
  UsersRound,
} from 'lucide-react';

type SalesLead = {
  id: string;
  status?: string | null;
  name?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  lead_number?: string | null;
};

type SalesOpportunity = {
  id: string;
  name?: string | null;
  customer_name?: string | null;
  stage_name?: string | null;
  stage_type?: string | null;
  expected_value?: number | string | null;
  currency?: string | null;
  probability?: number | string | null;
  expected_close_date?: string | null;
};

type SalesActivity = {
  id: string;
  status?: string | null;
  subject?: string | null;
  activity_type?: string | null;
  due_date?: string | null;
  lead_name?: string | null;
  opportunity_name?: string | null;
  lead_contact_name?: string | null;
  opportunity_contact_name?: string | null;
};

type SalesPipelineData = {
  activePipelineId?: string;
  pipelines?: Array<{ id: string; name: string; is_default?: boolean }>;
  leads?: SalesLead[];
  opportunities?: SalesOpportunity[];
  activities?: SalesActivity[];
  opportunityActivities?: SalesActivity[];
};

type PipelineResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  pipeline?: SalesPipelineData;
};

function displayMoney(
  value: number | string | null | undefined,
  currency: string | null | undefined,
) {
  const amount = Number(value ?? 0);
  const code = (currency || 'KES').trim().toUpperCase();

  if (!Number.isFinite(amount)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: /^[A-Z]{3}$/.test(code) ? code : 'KES',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
  }
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Close date not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Close date not set';
  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isOpenLead(lead: SalesLead) {
  const status = (lead.status || '').toLowerCase();
  return status !== 'converted' && status !== 'disqualified';
}

function isOpenOpportunity(opportunity: SalesOpportunity) {
  return (opportunity.stage_type || '').toLowerCase() === 'open';
}

function isOverdueActivity(activity: SalesActivity, now: number) {
  if ((activity.status || '').toLowerCase() !== 'planned' || !activity.due_date) {
    return false;
  }

  const due = new Date(activity.due_date).getTime();
  return Number.isFinite(due) && due < now;
}

export default function CrmSalesIntegrationPanel({
  enabled,
}: {
  enabled: boolean;
}) {
  const [pipeline, setPipeline] = useState<SalesPipelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/apps/sales?pipeline=1', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as PipelineResponse;

      if (!response.ok || payload.success !== true || !payload.pipeline) {
        if (response.status === 403 || payload.code === 'SALES_PERMISSION_REQUIRED') {
          throw new Error('Your current Sales permissions do not allow the CRM workspace to display pipeline data.');
        }

        throw new Error(
          payload.error || 'The live Sales pipeline could not be loaded.',
        );
      }

      setPipeline(payload.pipeline);
      setLoadedAt(new Date().toISOString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The live Sales pipeline could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  if (!enabled) {
    return (
      <section
        aria-label="Sales integration"
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="text-sm font-semibold text-slate-900">Sales integration</p>
        <p className="mt-1 text-sm text-slate-600">
          Enable SaMi Sales for this workspace to see its live leads, opportunities and follow-up activities here.
          CRM account and contact records remain available independently.
        </p>
      </section>
    );
  }

  const now = Date.now();
  const leads = (pipeline?.leads || []).filter(isOpenLead);
  const opportunities = (pipeline?.opportunities || []).filter(isOpenOpportunity);
  const overdue = [
    ...(pipeline?.activities || []),
    ...(pipeline?.opportunityActivities || []),
  ]
    .filter((activity) => isOverdueActivity(activity, now))
    .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
    .slice(0, 5);

  const recentOpportunities = opportunities.slice(0, 6);
  const activePipelineName =
    pipeline?.pipelines?.find((item) => item.id === pipeline.activePipelineId)?.name
    || 'Sales pipeline';

  return (
    <section
      aria-label="Live SaMi Sales integration"
      className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Connected workspace
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">Sales pipeline</h2>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Live · read-only
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            CRM reads the same leads, opportunities and follow-ups managed in SaMi Sales. Commercial changes stay in Sales to preserve its validation, history and permissions.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-500">{activePipelineName}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Sales data is unavailable</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">Open leads</p>
            <UsersRound className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
            {!pipeline ? '—' : leads.length.toLocaleString('en-KE')}
          </p>
          <Link href="/apps/sales/pipeline" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
            Review leads <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">Open opportunities</p>
            <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
            {!pipeline ? '—' : opportunities.length.toLocaleString('en-KE')}
          </p>
          <Link href="/apps/sales/opportunities" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
            View opportunities <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">Overdue follow-ups</p>
            <Clock3 className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
            {!pipeline ? '—' : overdue.length.toLocaleString('en-KE')}
          </p>
          <p className="mt-2 text-xs text-slate-500">Showing up to five due items below</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <div className="min-w-0 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Open opportunities</h3>
            <Link href="/apps/sales/opportunities" className="text-xs font-semibold text-blue-700 hover:underline">
              Open Sales register
            </Link>
          </div>
          {recentOpportunities.length ? (
            <div className="divide-y divide-slate-100">
              {recentOpportunities.map((opportunity) => (
                <div key={opportunity.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{opportunity.name || 'Untitled opportunity'}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">
                      {[opportunity.customer_name, opportunity.stage_name].filter(Boolean).join(' · ') || 'Stage not set'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{displayDate(opportunity.expected_close_date)}</p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {displayMoney(opportunity.expected_value, opportunity.currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {Number.isFinite(Number(opportunity.probability)) ? `${Number(opportunity.probability)}% probability` : 'Probability not set'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-slate-600">
              {loading ? 'Loading opportunities…' : error ? 'Opportunity records could not be loaded.' : 'No open opportunities are currently in this pipeline.'}
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Follow-ups needing attention</h3>
            <p className="mt-0.5 text-xs text-slate-600">Planned Sales activities past their due date</p>
          </div>
          {overdue.length ? (
            <div className="divide-y divide-slate-100">
              {overdue.map((activity) => (
                <div key={`${activity.activity_type || 'activity'}-${activity.id}`} className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{activity.subject || activity.activity_type || 'Follow-up'}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-600">
                    {activity.lead_name || activity.opportunity_name || activity.lead_contact_name || activity.opportunity_contact_name || 'Sales record'}
                  </p>
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    Due {activity.due_date ? displayDate(activity.due_date) : 'date not set'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-slate-600">
              {loading ? 'Checking follow-ups…' : error ? 'Follow-up records could not be loaded.' : 'No overdue planned follow-ups found.'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {loadedAt ? `Refreshed ${new Date(loadedAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}` : 'Sales data refreshes when this workspace is opened.'}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
          <Link href="/apps/sales/pipeline" className="text-blue-700 hover:underline">Pipeline</Link>
          <Link href="/apps/sales/customers" className="text-blue-700 hover:underline">Customers</Link>
          <Link href="/apps/sales/quotes" className="text-blue-700 hover:underline">Quotations</Link>
        </div>
      </div>
    </section>
  );
}
