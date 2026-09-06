import { Suspense } from 'react';
import TwoFactorLoginClient from './TwoFactorLoginClient';

export const dynamic = 'force-dynamic';

export default function TwoFactorLoginPage() {
  return (
    <Suspense fallback={<TwoFactorLoginFallback />}>
      <TwoFactorLoginClient />
    </Suspense>
  );
}

function TwoFactorLoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="mt-6 h-12 w-full animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </main>
  );
}