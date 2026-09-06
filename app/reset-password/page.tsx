import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="h-72 w-full max-w-md animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResetPasswordClient />
    </Suspense>
  );
}