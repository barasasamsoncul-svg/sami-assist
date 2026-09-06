'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type OverlayType = 'error' | 'warning' | 'success';

type OverlayState = {
  type: OverlayType;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

type LoginResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  next?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    firstName: string;
    lastName: string;
    avatarFileId: string | null;
    status: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  subscription?: {
    id: string;
    status: string;
    billingCycle: string | null;
    currentPeriodEnd: string | null;
    planKey: string | null;
    planName: string | null;
  } | null;
  role?: {
    id: string;
    key: string | null;
    name: string;
  } | null;
  modules?: {
    key: string;
    name: string;
    status: string;
  }[];
  session?: {
    id: string;
    expiresAt: string;
  };
};

const THEME_STORAGE_KEY = 'sami_theme';

function sanitizeRedirectPath(value: string | null): string {
  if (!value) {
    return '/dashboard';
  }

  if (!value.startsWith('/')) {
    return '/dashboard';
  }

  if (value.startsWith('//')) {
    return '/dashboard';
  }

  if (
    value.startsWith('/api') ||
    value.startsWith('/auth')
  ) {
    return '/dashboard';
  }

  return value;
}

function normalizePrefilledEmail(value: string | null): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value)
      .trim()
      .toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function getInitialOverlay(
  verified: string | null,
  reason: string | null
): OverlayState | null {
  if (verified === '1' || verified === 'true') {
    return {
      type: 'success',
      title: 'Email verified',
      message:
        'Your email has been verified. You can now sign in to SaMi.',
    };
  }

  if (reason === 'password_reset') {
  return {
    type: 'success',
    title: 'Password updated',
    message:
      'Your password has been reset. Please sign in with your new password.',
  };
}

  if (reason === 'session_expired') {
    return {
      type: 'warning',
      title: 'Session expired',
      message:
        'Please sign in again to continue.',
    };
  }

  if (reason === 'logged_out') {
    return {
      type: 'success',
      title: 'Logged out',
      message:
        'You have been logged out successfully.',
    };
  }

  return null;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const safeNextPath = useMemo(
    () =>
      sanitizeRedirectPath(
        searchParams.get('next')
      ),
    [searchParams]
  );

  const [email, setEmail] = useState(() =>
    normalizePrefilledEmail(
      searchParams.get('email')
    )
  );

  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] =
    useState(false);
  const [showPassword, setShowPassword] =
    useState(false);
  const [loading, setLoading] = useState(false);

  const [theme, setTheme] = useState<
    'light' | 'dark'
  >('light');

  const [overlay, setOverlay] =
    useState<OverlayState | null>(() =>
      getInitialOverlay(
        searchParams.get('verified'),
        searchParams.get('reason')
      )
    );

  useEffect(() => {
    const storedTheme =
      window.localStorage.getItem(
        THEME_STORAGE_KEY
      );

    const preferredTheme =
      storedTheme === 'dark' ||
      storedTheme === 'light'
        ? storedTheme
        : window.matchMedia(
            '(prefers-color-scheme: dark)'
          ).matches
          ? 'dark'
          : 'light';

    setTheme(preferredTheme);

    document.documentElement.classList.toggle(
      'dark',
      preferredTheme === 'dark'
    );
  }, []);

  function toggleTheme() {
    const nextTheme =
      theme === 'dark' ? 'light' : 'dark';

    setTheme(nextTheme);

    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      nextTheme
    );

    document.documentElement.classList.toggle(
      'dark',
      nextTheme === 'dark'
    );
  }

  function closeOverlay() {
    setOverlay(null);
  }

  function buildVerifyEmailHref() {
    const query = new URLSearchParams();

    if (email) {
      query.set('email', email);
    }

    return `/verify-email${
      query.toString()
        ? `?${query.toString()}`
        : ''
    }`;
  }

  function mapLoginError(
    status: number,
    data: LoginResponse
  ): OverlayState {
    const code = data.code || 'LOGIN_FAILED';
    const message =
      data.message ||
      'Unable to sign in. Please try again.';

    if (code === 'EMAIL_NOT_VERIFIED') {
      return {
        type: 'warning',
        title: 'Verify your email',
        message,
        actionLabel: 'Go to verification',
        actionHref: buildVerifyEmailHref(),
      };
    }

    if (code === 'PAYMENT_REQUIRED') {
      return {
        type: 'warning',
        title: 'Payment required',
        message,
        actionLabel: 'Complete payment',
        actionHref: '/billing',
      };
    }

    if (code === 'TENANT_PROVISIONING') {
      return {
        type: 'warning',
        title: 'Workspace preparing',
        message,
      };
    }

    if (code === 'TENANT_PROVISIONING_FAILED') {
      return {
        type: 'error',
        title: 'Workspace setup failed',
        message,
      };
    }

    if (
      code === 'ACCOUNT_SUSPENDED' ||
      code === 'ACCOUNT_LOCKED'
    ) {
      return {
        type: 'error',
        title:
          code === 'ACCOUNT_LOCKED'
            ? 'Account locked'
            : 'Account suspended',
        message,
      };
    }

    if (status === 401) {
      return {
        type: 'error',
        title: 'Invalid login details',
        message:
          'The email or password you entered is incorrect.',
      };
    }

    return {
      type: 'error',
      title: 'Login failed',
      message,
    };
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setOverlay({
        type: 'warning',
        title: 'Email required',
        message:
          'Please enter your email address.',
      });

      return;
    }

    if (!normalizedEmail.includes('@')) {
      setOverlay({
        type: 'warning',
        title: 'Invalid email',
        message:
          'Please enter a valid email address.',
      });

      return;
    }

    if (!password) {
      setOverlay({
        type: 'warning',
        title: 'Password required',
        message:
          'Please enter your password.',
      });

      return;
    }

    setLoading(true);
    setOverlay(null);

    try {
      const response = await fetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            rememberMe,
          }),
        }
      );

      let data: LoginResponse = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || data.success !== true) {
        setOverlay(
          mapLoginError(response.status, data)
        );

        return;
      }

      router.replace(safeNextPath);
      router.refresh();
    } catch (error) {
      console.error('[Login] Request failed:', error);

      setOverlay({
        type: 'error',
        title: 'Network error',
        message:
          'Could not connect to SaMi. Please check your internet and try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/4 -right-40 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative min-h-screen px-4 py-6 sm:px-6 lg:px-8 flex flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-3"
            aria-label="SaMi home"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <SaMiLogo />
            </div>

            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight">
                SaMi
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI-powered business workspace
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        </header>

        <section className="mx-auto flex w-full max-w-6xl flex-1 items-center py-10">
          <div className="grid w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
            <aside className="relative hidden min-h-[640px] overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
              <div className="absolute inset-0">
                <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
                <div className="absolute bottom-8 -left-20 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
              </div>

              <div className="relative">
                <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                    <SaMiLogo />
                  </div>
                  <div>
                    <p className="text-sm font-black">
                      SaMi Workspace
                    </p>
                    <p className="text-xs text-white/60">
                      Secure business access
                    </p>
                  </div>
                </div>

                <div className="mt-16 max-w-lg">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                    <Sparkles className="h-4 w-4" />
                    Built for growing businesses
                  </div>

                  <h1 className="text-5xl font-black tracking-tight">
                    Welcome back to your business command center.
                  </h1>

                  <p className="mt-6 text-base leading-8 text-white/65">
                    Sign in to manage your workspace, apps,
                    subscriptions, team, security settings,
                    and business operations from one secure
                    account.
                  </p>
                </div>
              </div>

              <div className="relative grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                  <ShieldCheck className="h-5 w-5 text-cyan-200" />
                  <p className="mt-3 text-sm font-bold">
                    Secure
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Protected sessions
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                  <LockKeyhole className="h-5 w-5 text-cyan-200" />
                  <p className="mt-3 text-sm font-bold">
                    Private
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    HttpOnly cookie
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                  <Sparkles className="h-5 w-5 text-cyan-200" />
                  <p className="mt-3 text-sm font-bold">
                    Smart
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    AI-ready account
                  </p>
                </div>
              </div>
            </aside>

            <div className="flex min-h-[640px] flex-col justify-center px-5 py-8 sm:px-8 lg:px-12">
              <div className="mx-auto w-full max-w-md">
                <div className="lg:hidden mb-8 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <SaMiLogo />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Sign in
                  </p>

                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                    Access your SaMi account
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Continue to your dashboard and business
                    workspace.
                  </p>
                </div>

                {overlay && (
                  <div
                    className={[
                      'mt-6 rounded-2xl border p-4',
                      overlay.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100'
                        : overlay.type === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
                    ].join(' ')}
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5">
                        {overlay.type === 'success' ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">
                          {overlay.title}
                        </p>
                        <p className="mt-1 text-sm opacity-85">
                          {overlay.message}
                        </p>

                        {overlay.actionHref &&
                          overlay.actionLabel && (
                            <Link
                              href={overlay.actionHref}
                              className="mt-3 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4"
                            >
                              {overlay.actionLabel}
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          )}
                      </div>

                      <button
                        type="button"
                        onClick={closeOverlay}
                        className="rounded-lg p-1 opacity-70 transition hover:opacity-100"
                        aria-label="Dismiss message"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  className="mt-8 space-y-5"
                >
                  <div>
                    <label
                      htmlFor="email"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Email address
                    </label>

                    <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
                      <Mail className="h-5 w-5 text-slate-400" />

                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(
                            event.target.value
                          )
                        }
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <label
                        htmlFor="password"
                        className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                      >
                        Password
                      </label>

                      <Link
                        href="/forgot-password"
                        className="text-sm font-bold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
                      <LockKeyhole className="h-5 w-5 text-slate-400" />

                      <input
                        id="password"
                        name="password"
                        type={
                          showPassword
                            ? 'text'
                            : 'password'
                        }
                        value={password}
                        onChange={(event) =>
                          setPassword(
                            event.target.value
                          )
                        }
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                        disabled={loading}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(
                            (value) => !value
                          )
                        }
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={
                          showPassword
                            ? 'Hide password'
                            : 'Show password'
                        }
                        disabled={loading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="inline-flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) =>
                          setRememberMe(
                            event.target.checked
                          )
                        }
                        disabled={loading}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                      />

                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Keep me signed in
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                    </div>

                    <div className="relative flex justify-center">
                      <span className="bg-white px-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-900">
                        or
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    title="Google sign-in will be connected later."
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-black text-slate-950">
                      G
                    </span>
                    Continue with Google
                  </button>
                </div>

                <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  New to SaMi?{' '}
                  <Link
                    href="/register"
                    className="font-black text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                  >
                    Create account
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 pb-4 text-xs font-medium text-slate-500 dark:text-slate-400 sm:justify-end">
          <Link
            href="/help"
            className="hover:text-slate-950 dark:hover:text-white"
          >
            Help
          </Link>
          <Link
            href="/terms"
            className="hover:text-slate-950 dark:hover:text-white"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="hover:text-slate-950 dark:hover:text-white"
          >
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}