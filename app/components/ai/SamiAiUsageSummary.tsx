'use client';

import {
  Brain,
  Building2,
  Gauge,
  MessageSquareText,
  Paperclip,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import type {
  SamiAiRequestLimit,
  SamiAiUsageMetric,
  SamiAiWorkspaceStatus,
} from '@/app/components/ai/SamiAiStatus';

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat().format(
    value,
  );
}

function formatDateTime(
  value:
    string | null | undefined,
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date.toLocaleString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function UsageBar({
  percent,
}: {
  percent:
    number | null;
}) {
  if (
    percent ===
      null
  ) {
    return null;
  }

  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]">
      <div
        className="h-full rounded-full bg-blue-600 transition-all"
        style={{
          width:
            `${Math.max(
              2,
              Math.min(
                100,
                percent,
              ),
            )}%`,
        }}
      />
    </div>
  );
}

function MonthlyCard({
  metric,
}: {
  metric:
    SamiAiUsageMetric;
}) {
  const limit =
    metric.limit;

  const noMonthlyPlanCap =
    metric.mode ===
      'cost_controlled' &&
    limit ===
      null;

  return (
    <article className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Monthly AI requests
      </p>

      <div className="mt-2 flex items-end gap-2">
        <p className="text-2xl font-black tracking-tight">
          {formatNumber(
            metric.used,
          )}
        </p>

        <p className="pb-1 text-[10px] font-semibold text-slate-400">
          {noMonthlyPlanCap
            ? 'no monthly cap'
            : limit ===
                null
              ? 'metered'
              : `of ${formatNumber(
                  limit,
                )}`}
        </p>
      </div>

      <UsageBar
        percent={
          metric.percent
        }
      />

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
        <span>
          {noMonthlyPlanCap
            ? 'Custom plan usage is tracked but not stopped by a monthly plan quota'
            : metric.remaining ===
                null
              ? 'Allowance managed by your plan'
              : `${formatNumber(
                  metric.remaining,
                )} remaining`}
        </span>

        {metric.resetAt && (
          <span>
            Resets {formatDateTime(
              metric.resetAt,
            )}
          </span>
        )}
      </div>
    </article>
  );
}

function RequestLimitCard({
  title,
  metric,
  hint,
}: {
  title: string;
  metric:
    SamiAiRequestLimit | null;
  hint: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {title}
      </p>

      {metric ? (
        <>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-2xl font-black tracking-tight">
              {formatNumber(
                metric.used,
              )}
            </p>
            <p className="pb-1 text-[10px] font-semibold text-slate-400">
              of {formatNumber(
                metric.limit,
              )}
            </p>
          </div>

          <UsageBar
            percent={
              metric.percent
            }
          />

          <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">
            {formatNumber(
              metric.remaining,
            )} remaining · {hint}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Temporarily unavailable
        </p>
      )}
    </article>
  );
}

function CapabilityCard({
  icon:
    Icon,
  title,
  value,
  description,
}: {
  icon:
    typeof Gauge;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400">
            {title}
          </p>
          <p className="mt-1 truncate text-sm font-black">
            {value}
          </p>
          <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function SamiAiUsageSummary({
  status,
}: {
  status:
    SamiAiWorkspaceStatus | null;
}) {
  if (!status) {
    return (
      <div className="rounded-2xl border border-slate-200 p-5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        SaMi AI usage is loading.
      </div>
    );
  }

  const usage =
    status.usage;

  return (
    <div className="space-y-4">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
              Usage & limits
            </p>
            <h3 className="mt-1 text-base font-black">
              Your SaMi AI allowance
            </h3>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black capitalize text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
            {usage.planKey} plan
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <MonthlyCard
            metric={
              usage.monthlyQueries
            }
          />

          <RequestLimitCard
            title="Rolling 24 hours"
            metric={
              usage.rolling24Hours
            }
            hint="This window rolls continuously"
          />

          <RequestLimitCard
            title="Per minute"
            metric={
              usage.perMinute
            }
            hint="Short-burst protection"
          />
        </div>

        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[10px] leading-5 text-blue-900 dark:border-blue-500/15 dark:bg-blue-500/[0.07] dark:text-blue-200">
          <strong>
            How limits work:
          </strong>{' '}
          {usage.counting
            .description}
          {' '}
          Your SaMi plan is measured in AI requests; provider token counts are operational telemetry and are not shown as your plan allowance.
        </div>
      </section>

      <section>
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          What your SaMi AI can use
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CapabilityCard
            icon={
              Wrench
            }
            title="Available tools"
            value={
              String(
                status
                  .capabilities
                  .totalTools,
              )
            }
            description={
              `${status.capabilities.readTools} read tools · ${status.capabilities.writeTools} action tools`
            }
          />

          <CapabilityCard
            icon={
              ShieldCheck
            }
            title="Protected actions"
            value={
              String(
                status
                  .capabilities
                  .confirmationTools,
              )
            }
            description="High-impact writes wait for your explicit confirmation."
          />

          <CapabilityCard
            icon={
              Paperclip
            }
            title="Attachments"
            value={
              status
                .attachments
                .canUpload
                ? `Up to ${status.attachments.maxFilesPerMessage} per message`
                : 'Unavailable'
            }
            description="Files are read through SaMi's private workspace storage and your permissions."
          />

          <CapabilityCard
            icon={
              Brain
            }
            title="Personal memory"
            value={
              status
                .preferences
                .memoryEnabled
                ? `${status.capabilities.memoryCount} saved`
                : 'Off'
            }
            description="Durable personal context is scoped to you and the current company."
          />

          <CapabilityCard
            icon={
              MessageSquareText
            }
            title="Chat history"
            value={
              String(
                status
                  .capabilities
                  .conversationCount,
              )
            }
            description="Active conversations in the current company."
          />

          <CapabilityCard
            icon={
              Building2
            }
            title="Current company"
            value={
              status
                .company
                .name
            }
            description="Business tools and data stay scoped to this company and your access."
          />
        </div>
      </section>

      <section>
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          Service activity
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [
              'Requests · 24h',
              formatNumber(
                status
                  .performance
                  .requests24h,
              ),
            ],
            [
              'Requests · 7d',
              formatNumber(
                status
                  .performance
                  .requests7d,
              ),
            ],
            [
              'Tool calls · 24h',
              formatNumber(
                status
                  .performance
                  .toolCalls24h,
              ),
            ],
            [
              'Failures · 24h',
              formatNumber(
                status
                  .performance
                  .failures24h,
              ),
            ],
          ].map(
            item => (
              <div
                key={
                  item[0]
                }
                className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  {item[0]}
                </p>
                <p className="mt-2 text-xl font-black">
                  {item[1]}
                </p>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
