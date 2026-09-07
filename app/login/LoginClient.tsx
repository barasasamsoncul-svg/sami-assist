'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
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

type LoginResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;
  email?: string;
  challengeToken?: string;
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeNextPath(value: string | null): string {
  if (!value) return '/dashboard';
  if (!value.startsWith('/')) return '/dashboard';
  if (value.startsWith('//')) return '/dashboard';

  if (
    value.startsWith('/login') ||
    value.startsWith('/register') ||
    value.startsWith('/forgot-password') ||
    value.startsWith('/reset-password') ||
    value.startsWith('/verify-email')
  ) {
    return '/dashboard';
  }

  return value;
}

function LoginClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => safeNextPath(searchParams.get('next')),
    [searchParams]
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [overlay, setOverlay] =
    useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  useEffect(() => {
    const verified = searchParams.get('verified');
    const reason = searchParams.get('reason');
    const emailParam = searchParams.get('email');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (verified === '1') {
      setOverlay(getAuthOverlayMessage('EMAIL_VERIFIED'));
      return;
    }

    if (reason === 'password_reset') {
      setOverlay(getAuthOverlayMessage('PASSWORD_RESET_SUCCESS'));
      return;
    }

    if (reason === 'logged_out') {
      setOverlay(getAuthOverlayMessage('LOGGED_OUT'));
      return;
    }

    if (reason === 'session_expired') {
      setOverlay(getAuthOverlayMessage('SESSION_EXPIRED'));
    }
  }, [searchParams]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      setOverlay(getAuthOverlayMessage('INVALID_EMAIL'));
      return;
    }

    if (!password) {
      setOverlay(getAuthOverlayMessage('PASSWORD_REQUIRED'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: cleanEmail,
          password,
          rememberMe,
        }),
      });

      const data = (await response.json().catch(() => ({
        success: false,
        code: 'LOGIN_ERROR',
        error: 'Login failed. Please try again.',
      }))) as LoginResponse;

      if (
        data.code === 'TWO_FACTOR_REQUIRED' &&
        data.challengeToken
      ) {
        window.sessionStorage.setItem(
          'sami_2fa_email',
          data.email || cleanEmail
        );

        window.sessionStorage.setItem(
          'sami_2fa_challenge',
          data.challengeToken
        );

        window.sessionStorage.setItem(
          'sami_2fa_remember',
          String(rememberMe)
        );

        router.push(data.next || '/login/two-factor');
        return;
      }

      if (!response.ok || !data.success) {
        setOverlay(
          getAuthOverlayMessage(data.code, {
            fallback: data.error,
            retryAfterSeconds: data.retryAfterSeconds,
            lockedUntil: data.lockedUntil,
            email: cleanEmail,
          })
        );
        return;
      }

      router.replace(data.next || nextPath || '/dashboard');
    } catch (error) {
      setOverlay(
        getAuthOverlayMessage('LOGIN_ERROR', {
          fallback:
            error instanceof Error
              ? error.message
              : 'Login failed. Please try again.',
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleLogin() {
    setOverlay({
      type: 'info',
      title: 'Google sign-in coming soon',
      message:
        'Google authentication will be connected after password login, verification, sessions, lockout, and two-factor authentication are stable.',
    });
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
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950">
                  <SaMiLogo />
                </div>

                <div>
                  <p className="text-lg font-black">SaMi</p>
                  <p className="text-sm text-slate-400">
                    AI-powered business workspace
                  </p>
                </div>
              </div>

              <div className="mt-20">
                <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-300">
                  Welcome back
                </p>

                <h1 className="mt-5 max-w-md text-5xl font-black leading-tight tracking-tight">
                  Run your business from one secure workspace.
                </h1>

                <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
                  Sign in to access your workspace, apps, settings,
                  sessions, and SaMi AI.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="text-sm font-black">Secure access</p>
                  <p className="text-xs text-slate-400">
                    Protected sessions and account safeguards.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                <LockKeyhole className="h-5 w-5 text-blue-300" />
                <div>
                  <p className="text-sm font-black">Workspace ready</p>
                  <p className="text-xs text-slate-400">
                    Your apps load after successful authentication.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="p-6 sm:p-8 lg:p-12">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <SaMiLogo />
                </div>

                <div>
                  <p className="text-sm font-black">SaMi</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    AI-powered business workspace
                  </p>
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-md">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">
                  Sign in
                </p>

                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  Access your workspace
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Use your SaMi account email and password.
                </p>
              </div>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
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
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-4">
                    <label
                      htmlFor="password"
                      className="text-sm font-bold text-slate-700 dark:text-slate-200"
                    >
                      Password
                    </label>

                    <Link
                      href="/forgot-password"
                      className="text-sm font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                    >
                      Forgot?
                    </Link>
                  </div>

                  <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-slate-600 dark:focus-within:ring-slate-800">
                    <LockKeyhole className="h-5 w-5 text-slate-400" />

                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      aria-label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                      className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                  <span>
                    <span className="block text-sm font-black">
                      Remember this device
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      Stay signed in for longer on this browser.
                    </span>
                  </span>

                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-300"
                  />
                </label>

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
                  Sign in
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs font-bold text-slate-400">
                  OR
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-black">
                  G
                </span>
                Continue with Google
              </button>

              <div className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm leading-6">
                    For your security, repeated failed attempts may
                    temporarily lock your account.
                  </p>
                </div>
              </div>

              <p className="mt-7 text-center text-sm text-slate-500 dark:text-slate-400">
                Don&apos;t have an account?{' '}
                <Link
                  href="/register"
                  className="font-black text-slate-950 hover:underline dark:text-white"
                >
                  Create account
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="fixed bottom-4 left-0 right-0 hidden justify-center gap-5 text-xs font-bold text-slate-400 lg:flex">
        <Link
          href="/help"
          className="hover:text-slate-700 dark:hover:text-white"
        >
          Help
        </Link>

        <Link
          href="/terms"
          className="hover:text-slate-700 dark:hover:text-white"
        >
          Terms
        </Link>

        <Link
          href="/privacy"
          className="hover:text-slate-700 dark:hover:text-white"
        >
          Privacy
        </Link>
      </div>
    </main>
  );
}

export default function LoginClient() {
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
      <LoginClientInner />
    </Suspense>
  );
}