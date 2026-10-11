import type { SalesPipelineVelocityRow } from '@/lib/apps/sales/pipeline-velocity';

function duration(days: number | null) {
  return days == null ? '—' : days.toFixed(1) + ' days';
}

export default function SalesPipelineVelocity({
  transitions,
}: {
  transitions: SalesPipelineVelocityRow[];
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-6">
      <header>
        <h2 className="text-base font-black">Pipeline stage velocity</h2>
        <p className="mt-1 text-sm text-slate-500">
          Stage transitions recorded in the last 90 days. Time in stage is measured from the previous recorded entry into the source stage to the transition out. The slowest median transitions appear first.
        </p>
      </header>

      {transitions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
          No stage transitions were recorded in the last 90 days. As opportunities move through the pipeline, this report will reveal where deals tend to slow down.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {transitions.map(row => (
            <article key={row.fromStageId + ':' + row.toStageId} className="min-w-0 rounded-2xl border border-[var(--sami-border)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-sm font-black">{row.fromStageName}</span>
                <span aria-hidden="true" className="text-slate-400">→</span>
                <span className="break-words text-sm font-black">{row.toStageName}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {row.opportunityCount.toLocaleString()} distinct {row.opportunityCount === 1 ? 'opportunity' : 'opportunities'} · {row.transitionCount.toLocaleString()} recorded transitions
              </p>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--sami-border)] pt-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Median time</p>
                  <p className="mt-1 break-words text-sm font-black tabular-nums">{duration(row.medianDaysInStage)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Average time</p>
                  <p className="mt-1 break-words text-sm font-bold tabular-nums">{duration(row.averageDaysInStage)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Longest</p>
                  <p className="mt-1 break-words text-sm font-bold tabular-nums">{duration(row.maxDaysInStage)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
