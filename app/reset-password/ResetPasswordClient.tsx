'use client';



import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  FormEvent,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from 'lucide-react';
import {
  useRouter,
  useSearchParams,
} from 'next/navigation';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function ResetPasswordClient() {
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

  const [password, setPassword] =
    useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');
  const [showPassword, setShowPassword] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [success, setSuccess] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const invalidToken =
    !token || token.length < 40;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (invalidToken) {
      setError(
        'This reset link is invalid. Please request a new one.'
      );
      return;
    }

    if (password.length < 8) {
      setError(
        'Password must be at least 8 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        'Passwords do not match.'
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/auth/reset-password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.success !== true) {
        setError(
          data.message ||
            'Unable to reset password.'
        );
        return;
      }

      setSuccess(true);

      window.setTimeout(() => {
        router.replace('/login?reason=password_reset');
      }, 1200);
    } catch (error) {
      console.error(
        '[Reset Password] Request failed:',
        error
      );

      setError(
        'Could not connect to SaMi. Please try again.'
      );
    } finally {
      setLoading(false);
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

      <div className="min-h-screen px-4 py-8 flex flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <SaMiLogo />
            </div>

            <div>
              <p className="text-sm font-black">
                SaMi
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI-powered business workspace
              </p>
            </div>
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Login
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30 sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              {success ? (
                <CheckCircle2 className="h-8 w-8" />
              ) : (
                <SaMiLogo />
              )}
            </div>

            <div className="mt-8 text-center">
              <h1 className="text-3xl font-black tracking-tight">
                {success
                  ? 'Password updated'
                  : 'Create new password'}
              </h1>

              <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">
                {success
                  ? 'Your password has been reset. Redirecting you to login.'
                  : email
                    ? `Reset password for ${email}.`
                    : 'Enter a new password for your SaMi account.'}
              </p>
            </div>

            {invalidToken && !success && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                This reset link is invalid or incomplete.
                Please request a new password reset link.
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
                {error}
              </div>
            )}

            {!success && (
              <form
                onSubmit={handleSubmit}
                className="mt-8 space-y-5"
              >
                <div>
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    New password
                  </label>

                  <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
                    <LockKeyhole className="h-5 w-5 text-slate-400" />

                    <input
                      id="password"
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
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      disabled={loading || invalidToken}
                      className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (value) => !value
                        )
                      }
                      disabled={loading}
                      className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      {showPassword ? (
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
                    className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Confirm password
                  </label>

                  <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
                    <LockKeyhole className="h-5 w-5 text-slate-400" />

                    <input
                      id="confirmPassword"
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(
                          event.target.value
                        )
                      }
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      disabled={loading || invalidToken}
                      className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || invalidToken}
                  className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg hover:bg-slate-800 disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      Reset password
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            )}

            <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Remember your password?{' '}
              <Link
                href="/login"
                className="font-black text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}