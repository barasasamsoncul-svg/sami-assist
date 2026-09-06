import { Suspense } from 'react';
import ForgotPasswordClient from './ForgotPasswordClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ForgotPasswordClient />
    </Suspense>
  );
}