import {
  ArrowRight,
  Braces,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
} from 'lucide-react';

const steps = [
  {
    number:
      '01',
    title:
      'Create a credential',
    description:
      'Give the integration a clear name, choose the minimum scopes it needs and restrict it to the SaMi apps it may read.',
  },
  {
    number:
      '02',
    title:
      'Copy the secret once',
    description:
      'SaMi shows the API key only when it is created or rotated. Store it in the calling system’s secret manager, never in browser code.',
  },
  {
    number:
      '03',
    title:
      'Call the versioned API',
    description:
      'Send the key as a Bearer token. SaMi still enforces workspace, company, scope, app-boundary and rate-limit checks server-side.',
  },
];

export default function DeveloperApiOverview() {
  return (
    <section className="mb-4 overflow-hidden rounded-[24px] border border-[var(--sami-border)] bg-[var(--sami-surface)] sm:mb-6">
      <div className="grid gap-0 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="border-b border-[var(--sami-border)] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)]">
              <Network className="h-4.5 w-4.5 text-blue-600 dark:text-blue-300" />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                SaMi Developer API
              </p>
              <h2 className="mt-1 text-lg font-black tracking-[-0.02em] sm:text-xl">
                Connect SaMi to another system
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                The API is the set of SaMi functions an external system can call. An API credential is the secure key that identifies that system and limits what it is allowed to access.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-xl border border-[var(--sami-border)] p-3.5">
              <div className="flex items-center gap-2 text-xs font-black">
                <Braces className="h-4 w-4 text-blue-600" />
                API
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                Versioned endpoints for reading approved SaMi workspace and business-app data.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--sami-border)] p-3.5">
              <div className="flex items-center gap-2 text-xs font-black">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                Credential
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                A revocable, rotatable secret with scopes, app boundaries, expiry and request limits.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <p className="text-[11px] leading-5 text-amber-900 dark:text-amber-100">
              Public API v1 currently exposes authenticated context and read-only business-app records. Internal SaMi create, edit, delete and workflow routes are not automatically exposed to external credentials.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Quick start
              </p>
              <h3 className="mt-1 text-sm font-black">
                From credential to first request
              </h3>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            {steps.map(
              step => (
                <div
                  key={step.number}
                  className="rounded-xl border border-[var(--sami-border)] p-3.5"
                >
                  <p className="text-[10px] font-black text-blue-600 dark:text-blue-300">
                    {step.number}
                  </p>
                  <p className="mt-1 text-xs font-black">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {step.description}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--sami-border)] bg-slate-950">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              <ArrowRight className="h-3.5 w-3.5" />
              Available public v1 reads
            </div>
            <div className="space-y-3 p-3 font-mono text-[11px] leading-5 text-slate-200">
              <div>
                <div className="text-emerald-300">GET /api/v1/context</div>
                <div className="text-slate-500">Authorization: Bearer &lt;API_KEY&gt;</div>
              </div>
              <div>
                <div className="text-emerald-300">GET /api/v1/apps/&lt;appKey&gt;/records?table=&lt;table&gt;&amp;limit=50</div>
                <div className="text-slate-500">Requires apps.read + explicit app boundary</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
