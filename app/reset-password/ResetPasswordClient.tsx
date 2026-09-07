'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';
import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type ResetPasswordResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
  next?: string;
};

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }

  return null;
}

function ResetPasswordClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(
    () => searchParams.get('token') || '',
    [searchParams]
  );

  const email = useMemo(
    () => searchParams.get('email') || '',
    [searchParams]
  );

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [overlay, setOverlay] =
    useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  useEffect(() => {
    if (!token) {
      setOverlay({
        type: 'warning',
        title: 'Invalid reset link',
        message:
          'This password reset link is missing or invalid. Request a new reset link to continue.',
        primaryAction: {
          label: 'Request new link',
          href: '/forgot-password',
        },
        secondaryAction: {
          label: 'Back to login',
          href: '/login',
        },
      });
    }
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    if (!token) {
      setOverlay({
        type: 'warning',
        title: 'Invalid reset link',
        message:
          'This password reset link is missing or invalid. Request a new reset link to continue.',
        primaryAction: {
          label: 'Request new link',
          href: '/forgot-password',
        },
      });
      return;
    }

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      setOverlay(
        getAuthOverlayMessage('PASSWORD_WEAK', {
          fallback: passwordError,
        })
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setOverlay(getAuthOverlayMessage('PASSWORDS_DO_NOT_MATCH'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token,
          email,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await response.json().catch(() => ({
        success: false,
        code: 'RESET_PASSWORD_ERROR',
        error: 'Could not reset password.',
      }))) as ResetPasswordResponse;

      if (!response.ok || !data.success) {
        setOverlay(
          getAuthOverlayMessage(data.code, {
            fallback: data.error || 'Could not reset password.',
          })
        );
        return;
      }

      setNewPassword('');
      setConfirmPassword('');

      setOverlay(getAuthOverlayMessage('PASSWORD_RESET_SUCCESS'));

      setTimeout(() => {
        router.replace(data.next || '/login?reason=password_reset');
      }, 900);
    } catch (error) {
      setOverlay(
        getAuthOverlayMessage('RESET_PASSWORD_ERROR', {
          fallback:
            error instanceof Error
              ? error.message
              : 'Could not reset password.',
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
                Create new password
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Choose a strong password for your SaMi account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="newPassword"
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  New password
                </label>

                <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-slate-600 dark:focus-within:ring-slate-800">
                  <LockKeyhole className="h-5 w-5 text-slate-400" />

                  <input
                    id="newPassword"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((value) => !value)
                    }
                    aria-label={
                      showPasswords
                        ? 'Hide password'
                        : 'Show password'
                    }
                    className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    {showPasswords ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  Confirm password
                </label>

                <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-slate-600 dark:focus-within:ring-slate-800">
                  <LockKeyhole className="h-5 w-5 text-slate-400" />

                  <input
                    id="confirmPassword"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-black">Password rules</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Use at least 8 characters with uppercase, lowercase, and a number.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !token}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
                Reset password
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordClient() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-6 h-12 w-full animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 h-12 w-full animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </main>
      }
    >
      <ResetPasswordClientInner />
    </Suspense>
  );
}
