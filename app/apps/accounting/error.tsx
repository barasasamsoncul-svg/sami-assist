'use client';

import Link from 'next/link';
import { AlertTriangle,RefreshCw,Settings2 } from 'lucide-react';
import { useEffect } from 'react';

export default function AccountingError({
  error,
  reset,
}:{
  error:Error & {digest?:string};
  reset:()=>void;
}) {
  useEffect(()=>{
    console.error('[Accounting] Route error boundary',error);
  },[error]);

  return (
    <main className="min-h-screen bg-[var(--sami-canvas)] px-4 py-10 text-[var(--foreground)] sm:px-6">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 shadow-[var(--sami-shadow-lg)] sm:p-8">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5"/>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sami-muted)]">Accounting</p>
            <h1 className="mt-1 text-xl font-black">This Accounting page hit a recoverable error</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--sami-muted)]">
              SaMi did not intentionally change Accounting data because this page failed to render.
              Retry the request, return to the Accounting dashboard, or open Settings & Recovery for integrity checks.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
          >
            <RefreshCw className="h-4 w-4"/>Try again
          </button>
          <Link
            href="/apps/accounting"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 text-xs font-black"
          >
            Accounting dashboard
          </Link>
          <Link
            href="/apps/accounting/settings-recovery"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 text-xs font-black"
          >
            <Settings2 className="h-4 w-4"/>Settings & Recovery
          </Link>
        </div>

        {error.digest?(
          <p className="mt-5 break-all text-[10px] text-[var(--sami-muted)]">
            Reference: {error.digest}
          </p>
        ):null}
      </div>
    </main>
  );
}
