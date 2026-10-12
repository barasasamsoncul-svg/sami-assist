'use client';

type ForecastRow = {
  horizonDays: number;
  currency: string;
  opportunityCount: number;
  openPipelineValue: number;
  weightedPipelineValue: number;
};

const HORIZONS = [
  { days: 30, label: 'Next 30 days' },
  { days: 60, label: 'Next 60 days' },
  { days: 90, label: 'Next 90 days' },
] as const;

function formatMoney(value: number, currency: string) {
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

export default function SalesWeightedForecast({ rows }: { rows: ForecastRow[] }) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <header>
        <h2 className="text-sm font-black">Weighted pipeline forecast</h2>
        <p className="mt-1 text-xs text-slate-500">
          Open opportunities expected to close within each horizon. Weighted value uses the opportunity probability.
          Values stay grouped by currency and are never combined across currencies.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
          No open opportunities have an expected close date within the next 90 days. Add expected close dates to build the forecast.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {HORIZONS.map(horizon => {
            const horizonRows = rows.filter(row => row.horizonDays === horizon.days);
            return (
              <section key={horizon.days} className="min-w-0 rounded-2xl border border-[var(--sami-border)] p-4">
                <h3 className="text-xs font-black uppercase tracking-[0.08em]">{horizon.label}</h3>
                {horizonRows.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No opportunities with a close date in this horizon.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {horizonRows.map(row => (
                      <div key={horizon.days + '-' + row.currency} className="border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-black">{row.currency}</span>
                          <span className="text-[10px] text-slate-500">{row.opportunityCount.toLocaleString()} opportunities</span>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] text-slate-500">Open pipeline</p>
                            <p className="break-words text-sm font-bold tabular-nums">{formatMoney(row.openPipelineValue, row.currency)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">Probability-weighted</p>
                            <p className="break-words text-sm font-black tabular-nums">{formatMoney(row.weightedPipelineValue, row.currency)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
