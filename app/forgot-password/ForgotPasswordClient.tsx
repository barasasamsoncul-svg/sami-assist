'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type ForgotPasswordResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [overlay, setOverlay] =
    useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      setOverlay(getAuthOverlayMessage('INVALID_EMAIL'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = (await response.json().catch(() => ({
        success: false,
        code: 'FORGOT_PASSWORD_ERROR',
        error: 'Could not send reset link.',
      }))) as ForgotPasswordResponse;

      if (!response.ok || !data.success) {
        setOverlay(
          getAuthOverlayMessage(data.code, {
            fallback: data.error || 'Could not send reset link.',
          })
        );
        return;
      }

      setOverlay(getAuthOverlayMessage('RESET_LINK_SENT'));
    } catch (error) {
      setOverlay(
        getAuthOverlayMessage('FORGOT_PASSWORD_ERROR', {
          fallback:
            error instanceof Error
              ? error.message
              : 'Could not send reset link.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      {overlay && (
        <SaMiOverlay
          open={true}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={overlay.primaryAction}
          secondaryAction={overlay.secondaryAction}
          onClose={() => setOverlay(null)}
        />
      )}

      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <SaMiLogo />
              </div>

              <div>
                <p className="text-sm font-black">SaMi</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Account recovery
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <ShieldCheck className="h-7 w-7" />
              </div>

              <h1 className="mt-5 text-2xl font-black tracking-tight">
                Reset your password
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter your SaMi account email. If the account exists, we will send a secure password reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  Email address
                </label>

                <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-slate-600 dark:focus-within:ring-slate-800">
                  <Mail className="h-5 w-5 text-slate-400" />

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
                Send reset link
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500 dark:text-slate-400">
              Remember your password?{' '}
              <Link
                href="/login"
                className="font-black text-slate-950 hover:underline dark:text-white"
              >
                Sign in
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
