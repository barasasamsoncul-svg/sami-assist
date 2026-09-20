import Link from 'next/link';

import {
  ArrowLeft,
  Grid2X2,
} from 'lucide-react';

export default function AppNotFound() {
  return (
    <main className="min-h-screen bg-[#F6F7F9] px-4 py-10 text-slate-950 dark:bg-[#090B10] dark:text-white sm:px-6">
      <div className="mx-auto max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-[#0F131B] sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
          <Grid2X2 className="h-5 w-5" />
        </div>

        <h1 className="mt-4 text-xl font-black">
          App unavailable
        </h1>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          This app is not available in your current workspace access.
        </p>

        <Link
          href="/apps"
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Apps
        </Link>
      </div>
    </main>
  );
}
