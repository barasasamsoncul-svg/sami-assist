import Link from 'next/link';
import type {
  SalesOpportunityFunnelRow,
  SalesOpportunityRiskRow,
} from '@/lib/apps/sales/pipeline-funnel';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function stageOutcome(stageType: SalesOpportunityFunnelRow['stageType']) {
  if (stageType === 'won') return 'Won';
  if (stageType === 'lost') return 'Lost';
  return 'Open';
}

function riskLabels(row: SalesOpportunityRiskRow) {
  const labels: string[] = [];
  if (row.overdue) labels.push('Overdue close');
  if (row.stale) labels.push('30+ days in stage');
  if (row.missingCloseDate) labels.push('No close date');
  return labels;
}

export default function SalesOpportunityFunnel({
  rows,
  riskRows,
}: {
  rows: SalesOpportunityFunnelRow[];
  riskRows: SalesOpportunityRiskRow[];
}) {
  const currencies = Array.from(new Set(rows.map(row => row.currency)));

  return (
    <div className="space-y-5">
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <header>
          <h2 className="text-base font-black">Opportunity funnel by stage</h2>
          <p className="mt-1 text-sm text-slate-500">
            Current opportunity volume and value across your configured sales stages.
            Open-stage value is weighted by each opportunity’s probability. Currencies are reported separately.
            Open stages flag past-due close dates and opportunities that have remained in a stage for 30 days or more.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
            No active pipeline stages are available for reporting yet. Configure a stage to populate this report.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {currencies.map(currency => {
              const currencyRows = rows.filter(row => row.currency === currency);
              const maxValue = Math.max(
                1,
                ...currencyRows.map(row => row.stageType === 'open'
                  ? row.pipelineValue
                  : row.stageType === 'won' ? row.wonValue : row.lostValue),
              );

              return (
                <section key={currency} aria-label={currency + ' opportunity stages'}>
                  <h3 className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {currencyRows.map(row => {
                      const value = row.stageType === 'open'
                        ? row.pipelineValue
                        : row.stageType === 'won' ? row.wonValue : row.lostValue;
                      const barWidth = value > 0 ? Math.min(100, value / maxValue * 100) : 0;

                      return (
                        <article key={row.stageId + ':' + currency} className="min-w-0 rounded-2xl border border-[var(--sami-border)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-black">{row.stageName}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {row.opportunityCount.toLocaleString()} {row.opportunityCount === 1 ? 'opportunity' : 'opportunities'}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase">
                              {stageOutcome(row.stageType)}
                            </span>
                          </div>

                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-500/10" role="img"
                            aria-label={row.stageName + ' value ' + money(value, currency)}>
                            <div className="h-full rounded-full bg-blue-600" style={{ width: barWidth + '%' }} />
                          </div>

                          <div className="mt-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                              {row.stageType === 'open' ? 'Open pipeline value' : row.stageType === 'won' ? 'Won value' : 'Lost value'}
                            </p>
                            <p className="mt-1 break-words text-lg font-black tabular-nums">{money(value, currency)}</p>
                          </div>

                          {row.stageType === 'open' && (
                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--sami-border)] pt-3">
                              <span className="text-xs text-slate-500">Weighted value</span>
                              <span className="break-words text-right text-sm font-bold tabular-nums">
                                {money(row.weightedPipelineValue, currency)}
                              </span>
                            </div>
                          )}

                          {row.stageType === 'open' && (
                            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--sami-border)] pt-3">
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Overdue close</p>
                                <p className="mt-1 break-words text-sm font-black tabular-nums">{row.overdueOpportunityCount.toLocaleString()} deals</p>
                                <p className="mt-1 break-words text-xs text-slate-500">{money(row.overdueValue, currency)}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">30+ days in stage</p>
                                <p className="mt-1 break-words text-sm font-black tabular-nums">{row.staleOpportunityCount.toLocaleString()} deals</p>
                                <p className="mt-1 break-words text-xs text-slate-500">{money(row.staleValue, currency)}</p>
                              </div>
                            </div>
                          )}

                          {row.stageType === 'open' && (
                            <p className="mt-2 text-[10px] text-slate-500">
                              Default stage probability: {row.stageProbability.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Opportunities needing attention</h2>
            <p className="mt-1 text-sm text-slate-500">
              Prioritized open deals with overdue close dates, missing close dates or 30+ days in the current stage.
              Maximum 50 records are shown; currency is displayed per opportunity.
            </p>
          </div>
          <Link href="/apps/sales/opportunities" className="text-xs font-black text-blue-600 hover:underline">
            Open opportunities →
          </Link>
        </div>

        {riskRows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
            No open opportunities currently meet these risk conditions. Keep expected close dates and next steps up to date.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {riskRows.map(row => {
              const reasons = riskLabels(row);
              return (
                <article key={row.opportunityId} className="rounded-xl border border-[var(--sami-border)] p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black">{row.opportunityName}</p>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {row.opportunityNumber} · {row.customerName} · {row.stageName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reasons.map(reason => (
                          <span key={reason} className="rounded-full border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="break-words text-sm font-black tabular-nums">{money(row.expectedValue, row.currency)}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.probability}% probability</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--sami-border)] pt-3 text-xs sm:grid-cols-3">
                    <div>
                      <p className="text-slate-500">Expected close</p>
                      <p className="mt-1 font-bold">{row.expectedCloseDate || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Time in stage</p>
                      <p className="mt-1 font-bold">{row.daysInStage} days</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-slate-500">Owner</p>
                      <p className="mt-1 break-words font-bold">{row.salespersonName}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
