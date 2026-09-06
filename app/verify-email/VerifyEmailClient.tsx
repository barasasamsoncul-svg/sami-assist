'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MailCheck,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import SaMiLogo from '@/app/components/SaMiLogo';

type OverlayState = {
  type: 'error' | 'success';
  message: string;
};

function normalizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialEmail = useMemo(
    () => searchParams.get('email') || '',
    [searchParams]
  );

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (verifying) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = normalizeCode(code);

    if (!isValidEmail(cleanEmail)) {
      setOverlay({
        type: 'error',
        message: 'Enter the email address used during registration.',
      });
      return;
    }

    if (cleanCode.length !== 6) {
      setOverlay({
        type: 'error',
        message: 'Enter the 6-digit verification code.',
      });
      return;
    }

    setVerifying(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          code: cleanCode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not verify email.');
      }

      setOverlay({
        type: 'success',
        message: data.message || 'Email verified successfully.',
      });

      setTimeout(() => {
        router.replace(data.next || '/login?verified=1');
      }, 700);
    } catch (error) {
      setOverlay({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not verify email.',
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    if (resending) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      setOverlay({
        type: 'error',
        message: 'Enter your email address first.',
      });
      return;
    }

    setResending(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not resend verification code.'
        );
      }

      setOverlay({
        type: 'success',
        message:
          data.message || 'A new verification code has been sent.',
      });
    } catch (error) {
      setOverlay({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not resend verification code.',
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <SaMiLogo />
              </div>

              <div>
                <p className="text-sm font-black">SaMi</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  AI-powered business workspace
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <MailCheck className="h-7 w-7" />
              </div>

              <h1 className="mt-5 text-2xl font-black tracking-tight">
                Verify your email
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter the verification code sent to your email address.
              </p>
            </div>

            {overlay && (
              <div
                className={[
                  'mt-6 flex gap-3 rounded-2xl border p-4 text-sm',
                  overlay.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
                ].join(' ')}
              >
                {overlay.type === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                )}

                <p className="leading-6">{overlay.message}</p>
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
                />
              </div>

              <div>
                <label
                  htmlFor="code"
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  Verification code
                </label>

                <input
                  id="code"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) =>
                    setCode(normalizeCode(event.target.value))
                  }
                  placeholder="000000"
                  className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-[0.45em] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
                />
              </div>

              <button
                type="submit"
                disabled={verifying}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {verifying ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Verify email
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Didn&apos;t receive the code?
              </p>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending}
                className="mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-950/30"
              >
                {resending ? 'Sending...' : 'Resend code'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}