'use client';

import {
  FormEvent,
  useState,
  useEffect,
  useId,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Mail,
  LockKeyhole,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type LoginResponse = {
  success?: boolean;
  authenticated?: boolean;
  code?: string;
  error?: string;
  message?: string;
  nextStep?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    emailVerified?: boolean;
  };
  session?: {
    id?: string;
    expiresAt?: string;
  };
};

function getSafeRedirect(value: string | null): string {
  if (!value) return '/';

  // Only allow internal paths.
  // Prevents redirects such as https://malicious-site.com.
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';

  return value;
}

export default function LoginPage() {
  const router = useRouter();

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [redirectPath, setRedirectPath] = useState('/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const redirect = params.get('redirect');
    setRedirectPath(getSafeRedirect(redirect));
  }, []);

  function clearMessages() {
    setError('');
    setSuccessMessage('');
  }

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || googleLoading) return;

    clearMessages();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Enter your email address.');
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          rememberMe,
        }),
      });

      let data: LoginResponse = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      /*
       * ----------------------------------------------------------
       * EMAIL VERIFICATION
       * ----------------------------------------------------------
       */

      if (data.code === 'EMAIL_VERIFICATION_REQUIRED') {
        try {
          sessionStorage.setItem(
            'sami_verification_email',
            normalizedEmail
          );
        } catch {
          // Ignore storage failure.
        }

        router.push('/auth/verify-email');
        return;
      }

      /*
       * ----------------------------------------------------------
       * TWO-FACTOR AUTHENTICATION
       * ----------------------------------------------------------
       *
       * The backend can return:
       *
       * code: 'TWO_FACTOR_REQUIRED'
       * nextStep: '2fa'
       *
       * We intentionally do NOT store passwords, session tokens,
       * or authentication secrets in sessionStorage.
       */

      if (
        data.code === 'TWO_FACTOR_REQUIRED' ||
        data.nextStep === '2fa'
      ) {
        router.push('/auth/2fa');
        return;
      }

      /*
       * ----------------------------------------------------------
       * DEVICE VERIFICATION
       * ----------------------------------------------------------
       */

      if (
        data.code === 'DEVICE_VERIFICATION_REQUIRED' ||
        data.nextStep === 'device-verification'
      ) {
        try {
          sessionStorage.setItem(
            'sami_device_verification_email',
            normalizedEmail
          );
        } catch {
          // Ignore storage failure.
        }

        router.push('/auth/device-verification');
        return;
      }

      /*
       * ----------------------------------------------------------
       * PASSWORD RESET REQUIRED
       * ----------------------------------------------------------
       */

      if (
        data.code === 'PASSWORD_RESET_REQUIRED' ||
        data.nextStep === 'password-reset'
      ) {
        try {
          sessionStorage.setItem(
            'sami_password_reset_email',
            normalizedEmail
          );
        } catch {
          // Ignore storage failure.
        }

        router.push('/auth/forgot-password');
        return;
      }

      /*
       * ----------------------------------------------------------
       * ACCOUNT STATES
       * ----------------------------------------------------------
       */

      if (data.code === 'ACCOUNT_LOCKED') {
        setError(
          data.error ||
            'Your account is temporarily locked. Please try again later.'
        );
        return;
      }

      if (data.code === 'ACCOUNT_SUSPENDED') {
        setError(
          data.error ||
            'Your account has been suspended. Please contact support.'
        );
        return;
      }

      if (data.code === 'ACCOUNT_DISABLED') {
        setError(
          data.error ||
            'Your account is disabled. Please contact your administrator.'
        );
        return;
      }

      /*
       * ----------------------------------------------------------
       * NORMAL LOGIN FAILURE
       * ----------------------------------------------------------
       */

      if (!response.ok || !data.success) {
        setError(
          data.error ||
            data.message ||
            'Unable to sign in. Check your email and password.'
        );

        return;
      }

      /*
       * ----------------------------------------------------------
       * AUTHENTICATION SUCCESS
       * ----------------------------------------------------------
       */

      if (!data.authenticated) {
        setError(
          'Sign-in could not be completed. Please try again.'
        );
        return;
      }

      /*
       * The backend should establish the secure HttpOnly session
       * cookie. We do not store session tokens in browser storage.
       */

      router.replace(redirectPath);
      router.refresh();
    } catch (requestError) {
      console.error(
        '[SaMi] Login request failed:',
        requestError
      );

      setError(
        'Unable to connect to SaMi. Check your internet connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleSignIn() {
    if (loading || googleLoading) return;

    clearMessages();
    setGoogleLoading(true);

    /*
     * OAuth authentication should happen through the backend.
     *
     * The Google endpoint should:
     * 1. Start the OAuth flow.
     * 2. Authenticate with Google.
     * 3. Validate the callback.
     * 4. Create/find the SaMi user.
     * 5. Establish the secure HttpOnly session.
     * 6. Redirect back into SaMi.
     */

    const redirect = encodeURIComponent(redirectPath);

    window.location.href = `/api/auth/google?redirect=${redirect}`;
  }

  const formDisabled = loading || googleLoading;

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* ======================================================
            LEFT BRAND PANEL
            ====================================================== */}

        <section className="relative hidden overflow-hidden bg-slate-950 lg:flex">
          <div className="absolute inset-0">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/[0.04] blur-3xl" />
            <div className="absolute -bottom-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-white/[0.04] blur-3xl" />
          </div>

          <div className="relative flex min-h-screen w-full flex-col justify-between p-10 xl:p-14">

            {/* Brand */}
            <Link
              href="/"
              aria-label="SaMi home"
              className="group inline-flex w-fit flex-col"
            >
              <SaMiLogo size="lg" />

              <span className="mt-2 text-sm font-medium tracking-wide text-slate-400">
                AI-powered business workspace
              </span>
            </Link>

            {/* Main message */}
            <div className="max-w-xl">
              <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <ShieldCheck
                  className="h-6 w-6 text-white"
                  strokeWidth={1.8}
                />
              </div>

              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
                Your business,
                <br />
                intelligently connected.
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 xl:text-lg">
                Sign in to continue working with your business,
                your data, your team and your AI workspace.
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-semibold text-white">
                    Secure
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Protected authentication
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-semibold text-white">
                    Connected
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Your business workspace
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-semibold text-white">
                    Intelligent
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    AI-powered workflows
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-6">
              <p className="text-xs text-slate-600">
                © {new Date().getFullYear()} SaMi
              </p>

              <div className="flex items-center gap-5 text-xs text-slate-600">
                <Link
                  href="/privacy"
                  className="transition hover:text-slate-400"
                >
                  Privacy
                </Link>

                <Link
                  href="/terms"
                  className="transition hover:text-slate-400"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================
            RIGHT AUTH PANEL
            ====================================================== */}

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="w-full max-w-md">

            {/* Mobile brand */}
            <div className="mb-10 lg:hidden">
              <Link
                href="/"
                aria-label="SaMi home"
                className="inline-flex flex-col"
              >
                <SaMiLogo size="lg" />

                <span className="mt-2 text-xs font-medium text-slate-500">
                  AI-powered business workspace
                </span>
              </Link>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to continue to your SaMi workspace.
              </p>
            </div>

            {/* ==================================================
                SUCCESS MESSAGE
                ================================================== */}

            {successMessage && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              >
                {successMessage}
              </div>
            )}

            {/* ==================================================
                ERROR MESSAGE
                ================================================== */}

            {error && (
              <div
                id={errorId}
                role="alert"
                aria-live="polite"
                className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

                <span className="leading-5">
                  {error}
                </span>
              </div>
            )}

            {/* ==================================================
                GOOGLE
                ================================================== */}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={formDisabled}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center text-[17px] font-bold"
                >
                  G
                </span>
              )}

              <span>
                {googleLoading
                  ? 'Connecting to Google...'
                  : 'Continue with Google'}
              </span>
            </button>

            {/* Divider */}
            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />

              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                or
              </span>

              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* ==================================================
                LOGIN FORM
                ================================================== */}

            <form
              onSubmit={handleSubmit}
              noValidate
              aria-describedby={error ? errorId : undefined}
            >
              {/* Email */}
              <div>
                <label
                  htmlFor={emailId}
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id={emailId}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);

                      if (error) {
                        setError('');
                      }
                    }}
                    placeholder="you@company.com"
                    disabled={formDisabled}
                    aria-invalid={Boolean(error)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor={passwordId}
                    className="block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>

                  <Link
                    href="/auth/forgot-password"
                    tabIndex={formDisabled ? -1 : 0}
                    className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id={passwordId}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);

                      if (error) {
                        setError('');
                      }
                    }}
                    placeholder="Enter your password"
                    disabled={formDisabled}
                    aria-invalid={Boolean(error)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    disabled={formDisabled}
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="mt-5 flex items-center">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                    disabled={formDisabled}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-300"
                  />

                  <span className="text-sm text-slate-600">
                    Keep me signed in
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={formDisabled}
                className="group mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in</span>

                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* ==================================================
                REGISTER
                ================================================== */}

            <div className="mt-7 text-center text-sm text-slate-500">
              Don't have a SaMi account?{' '}
              <Link
                href="/auth/register"
                className="font-semibold text-slate-950 transition hover:text-slate-600"
              >
                Create an account
              </Link>
            </div>

            {/* ==================================================
                SECURITY
                ================================================== */}

            <div className="mt-9 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />

              <p className="text-xs leading-5 text-slate-500">
                Your session is protected using secure,
                HttpOnly authentication cookies. SaMi never
                stores your password or session token in
                browser storage.
              </p>
            </div>

            {/* Legal */}
            <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">
              By continuing, you agree to SaMi's{' '}
              <Link
                href="/terms"
                className="underline underline-offset-2 hover:text-slate-600"
              >
                Terms
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-slate-600"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}