'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

function normalizeCode(value: string): string {
  return value.trim().slice(0, 32);
}

export default function TwoFactorLoginClient() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [overlay, setOverlay] =
    useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  useEffect(() => {
    const storedEmail =
      window.sessionStorage.getItem('sami_2fa_email') || '';
    const storedChallenge =
      window.sessionStorage.getItem('sami_2fa_challenge') || '';
    const storedRemember =
      window.sessionStorage.getItem('sami_2fa_remember') === 'true';

    setEmail(storedEmail);
    setChallengeToken(storedChallenge);
    setRememberMe(storedRemember);

    if (!storedEmail || !storedChallenge) {
      setOverlay({
        type: 'warning',
        title: 'Start login again',
        message:
          'Your login verification session is missing or expired.',
        primaryAction: {
          label: 'Back to login',
          href: '/login',
        },
      });
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email,
          challengeToken,
          code: normalizeCode(code),
          rememberMe,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setOverlay(
          getAuthOverlayMessage(data.code, {
            fallback: data.error,
          })
        );
        return;
      }

      window.sessionStorage.removeItem('sami_2fa_email');
      window.sessionStorage.removeItem('sami_2fa_challenge');
      window.sessionStorage.removeItem('sami_2fa_remember');

      router.replace(data.next || '/dashboard');
    } catch (error) {
      setOverlay({
        type: 'error',
        title: 'Verification failed',
        message:
          error instanceof Error
            ? error.message
            : 'Could not complete verification.',
      });
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

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <SaMiLogo />
              </div>

              <div>
                <p className="text-sm font-black">SaMi</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Secure login
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <ShieldCheck className="h-7 w-7" />
              </div>

              <h1 className="mt-5 text-2xl font-black tracking-tight">
                Two-factor verification
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter the 6-digit code from your authenticator app, or use a recovery code.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <input
                value={code}
                onChange={(event) =>
                  setCode(normalizeCode(event.target.value))
                }
                placeholder="000000 or recovery code"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-lg font-black tracking-[0.2em] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
              />

              <button
                type="submit"
                disabled={submitting || !email || !challengeToken}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Verify and continue
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}