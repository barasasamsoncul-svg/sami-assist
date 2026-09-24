'use client';

import Link from 'next/link';

import {
  Gauge,
  Settings,
  X,
} from 'lucide-react';

import SamiAiUsageSummary from '@/app/components/ai/SamiAiUsageSummary';

import type {
  SamiAiWorkspaceStatus,
} from '@/app/components/ai/SamiAiStatus';

export default function SamiAiUsagePanel({
  status,
  onClose,
}: {
  status:
    SamiAiWorkspaceStatus | null;
  onClose:
    () => void;
}) {
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close usage and capabilities"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
      />

      <section className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0F131B]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 dark:border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Gauge className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">
              SaMi AI usage & capabilities
            </p>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              Your enforced allowance, business tools and current workspace scope
            </p>
          </div>

          <button
            type="button"
            aria-label="Close usage and capabilities"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78dvh] overflow-y-auto p-4 sm:p-5">
          <SamiAiUsageSummary
            status={
              status
            }
          />

          <div className="mt-5 flex justify-end">
            <Link
              href="/settings?tab=ai"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Settings className="h-4 w-4" />
              AI settings & data controls
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
