import type {
  SalesPipelineLossReason,
  SalesPipelineOutcomeSummary,
} from '@/lib/apps/sales/pipeline-outcomes';

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function days(value: number | null) {
  return value == null ? '—' : Math.round(value).toLocaleString() + ' days';
}

export default function SalesPipelineOutcomes({
  summaries,
  lossReasons,
}: {
  summaries: SalesPipelineOutcomeSummary[];
  lossReasons: SalesPipelineLossReason[];
}) {
  const currencies = Array.from(new Set([
    ...summaries.map(row => row.currency),
    ...lossReasons.map(row => row.currency),
  ]));

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-base font-black">Win/loss performance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Opportunities closed in the last 90 days. Win rate uses won and lost opportunities with recorded close outcomes.
          Sales-cycle duration runs from opportunity creation to its recorded close date. Figures remain separated by currency.
        </p>
      </header>

      {summaries.length === 0 ? (
        <p className="sami-surface rounded-[24px] p-5 text-sm text-slate-500">
          No opportunities were won or lost in the last 90 days. Closed outcomes will appear here as your team updates the pipeline.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {summaries.map(row => (
            <article key={row.currency} className="sami-surface min-w-0 rounded-[24px] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Closed pipeline · last 90 days</p>
                  <h3 className="mt-1 text-lg font-black">{row.currency}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Win rate</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {row.winRate == null ? '—' : Math.round(row.winRate) + '%'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--sami-border)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Won</p>
                  <p className="mt-1 text-lg font-black tabular-nums">{row.wonCount.toLocaleString()}</p>
                  <p className="mt-1 break-words text-xs text-slate-500">{money(row.wonValue, row.currency)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--sami-border)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Lost</p>
                  <p className="mt-1 text-lg font-black tabular-nums">{row.lostCount.toLocaleString()}</p>
                  <p className="mt-1 break-words text-xs text-slate-500">{money(row.lostValue, row.currency)}</p>
                </div>
              </div>

              <div className="mt-4 border-t border-[var(--sami-border)] pt-4">
                <h4 className="text-xs font-black">Sales-cycle duration</h4>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] text-slate-500">Average to win</dt>
                    <dd className="mt-1 break-words text-sm font-bold">{days(row.averageDaysToWin)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] text-slate-500">Median to win</dt>
                    <dd className="mt-1 break-words text-sm font-bold">{days(row.medianDaysToWin)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] text-slate-500">Average to lose</dt>
                    <dd className="mt-1 break-words text-sm font-bold">{days(row.averageDaysToLose)}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="sami-surface rounded-[24px] p-4 sm:p-5">
        <header>
          <h3 className="text-sm font-black">Top loss reasons</h3>
          <p className="mt-1 text-xs text-slate-500">Up to five reasons per currency, ranked by lost opportunity count, then lost value.</p>
        </header>

        {lossReasons.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No lost opportunities were recorded in this period.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {currencies.filter(currency => lossReasons.some(row => row.currency === currency)).map(currency => {
              const rows = lossReasons.filter(row => row.currency === currency);
              return (
                <section key={currency} aria-label={currency + ' loss reasons'}>
                  <h4 className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{currency}</h4>
                  <div className="divide-y divide-[var(--sami-border)]">
                    {rows.map(row => (
                      <div key={row.reason} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">{row.reason}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.opportunityCount.toLocaleString()} {row.opportunityCount === 1 ? 'opportunity' : 'opportunities'}</p>
                        </div>
                        <p className="break-words text-right text-sm font-black tabular-nums">{money(row.lostValue, row.currency)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
