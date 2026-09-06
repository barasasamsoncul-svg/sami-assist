import { Suspense } from 'react';
import LoginClient from './LoginClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function LoginLoading() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl">
        <div className="h-8 w-40 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="mt-8 space-y-4">
          <div className="h-11 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-11 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-11 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginClient />
    </Suspense>
  );
}