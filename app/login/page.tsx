'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
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
      });

      let data: {
        success?: boolean;
        authenticated?: boolean;
        code?: string;
        error?: string;
        nextStep?: string;
      } = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || !data.success) {
        if (data.code === 'EMAIL_VERIFICATION_REQUIRED') {
          const params = new URLSearchParams({
            email: normalizedEmail,
          });

          router.push(`/auth/verify-email?${params.toString()}`);
          return;
        }

        setError(
          data.error ||
            'Unable to sign in. Please check your email and password.'
        );

        return;
      }

      if (!data.authenticated) {
        setError('Unable to establish your session. Please try again.');
        return;
      }

      /*
       * The API has already created the HttpOnly session cookie.
       *
       * We now decide where the authenticated user should go.
       */

      switch (data.nextStep) {
        case 'workspace_setup':
          router.replace('/auth/workspace-setup');
          break;

        case 'payment':
          router.replace('/billing');
          break;

        case 'verification':
          router.replace('/auth/verify-email');
          break;

        case 'provisioning':
          router.replace('/auth/provisioning');
          break;

        case 'dashboard':
        default:
          /*
           * You said you do not have a dashboard yet.
           *
           * For now, send authenticated users to the root
           * application page instead of a missing dashboard.
           */
          router.replace('/');
          break;
      }
    } catch (error) {
      console.error('[SaMi] Login request failed:', error);

      setError(
        'Unable to connect to SaMi right now. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ================================================== */}
        {/* LEFT SIDE */}
        {/* ================================================== */}

        <section className="hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between p-12 xl:p-16">
          <div>
            <Link
              href="/"
              className="inline-flex items-center"
              aria-label="SaMi home"
            >
              <div>
                <div className="text-3xl font-black tracking-tight text-white">
                  SaMi
                </div>

                <div className="mt-1 text-sm text-slate-400">
                  AI-powered business workspace
                </div>
              </div>
            </Link>
          </div>

          <div className="max-w-xl">
            <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>

            <h1 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
              Welcome back to SaMi.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
              Sign in to continue managing your business workspace,
              information, and AI-powered workflows.
            </p>
          </div>

          <div className="text-sm text-slate-500">
            © {new Date().getFullYear()} SaMi. All rights reserved.
          </div>
        </section>

        {/* ================================================== */}
        {/* RIGHT SIDE */}
        {/* ================================================== */}

        <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile logo */}

            <div className="mb-10 lg:hidden">
              <Link href="/" className="inline-block">
                <div className="text-3xl font-black tracking-tight">
                  SaMi
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  AI-powered business workspace
                </div>
              </Link>
            </div>

            {/* Heading */}

            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Sign in
              </h2>

              <p className="mt-3 text-base leading-6 text-slate-500">
                Enter your details to access your SaMi account.
              </p>
            </div>

            {/* Error */}

            {error && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
              >
                {error}
              </div>
            )}

            {/* Form */}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Email address
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
              </div>

              {/* Password */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Password
                  </label>

                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    disabled={loading}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={loading}
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:cursor-not-allowed"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}

              <div className="flex items-center">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                    disabled={loading}
                    className="h-4 w-4 rounded border-slate-300 accent-slate-950"
                  />

                  <span className="text-sm text-slate-600">
                    Keep me signed in
                  </span>
                </label>
              </div>

              {/* Submit */}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Register */}

            <p className="mt-8 text-center text-sm text-slate-500">
              Don't have a SaMi account?{' '}
              <Link
                href="/auth/register"
                className="font-semibold text-slate-950 hover:underline"
              >
                Create an account
              </Link>
            </p>

            {/* Security note */}

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />

              <p className="text-xs leading-5 text-slate-500">
                Your session is protected by a secure,
                HttpOnly authentication cookie. SaMi never
                exposes your session token to the browser's
                JavaScript.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}