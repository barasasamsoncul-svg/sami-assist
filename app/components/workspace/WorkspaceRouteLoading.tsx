import {
  Loader2,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

export default function WorkspaceRouteLoading({
  label = 'Loading workspace',
}: {
  label?: string;
}) {
  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
      <div className="hidden h-screen w-[286px] border-r border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0B0E14] lg:fixed lg:inset-y-0 lg:left-0 lg:block">
        <SaMiLogo
          size="md"
          className="max-w-[170px]"
        />

        <div className="mt-8 space-y-3">
          {Array.from({
            length: 6,
          }).map(
            (
              _,
              index,
            ) => (
              <div
                key={
                  index
                }
                className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.05]"
              />
            ),
          )}
        </div>
      </div>

      <div className="min-h-screen lg:pl-[286px]">
        <div className="h-16 border-b border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0B0E14]" />

        <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />

            <div>
              <p className="text-sm font-bold">
                {label}
              </p>

              <p className="mt-0.5 text-xs text-slate-400">
                SaMi is preparing the latest permitted workspace context.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="h-36 animate-pulse rounded-2xl bg-white dark:bg-white/[0.035]" />
            <div className="h-36 animate-pulse rounded-2xl bg-white dark:bg-white/[0.035]" />
            <div className="h-36 animate-pulse rounded-2xl bg-white dark:bg-white/[0.035]" />
          </div>
        </div>
      </div>
    </main>
  );
}
