'use client';



import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  FormEvent,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] =
    useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail.includes('@')) {
      setError(
        'Please enter a valid email address.'
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ||
            'Unable to send reset link.'
        );
        return;
      }

      setSent(true);
    } catch (error) {
      console.error(
        '[Forgot Password] Request failed:',
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
              {sent ? (
                <CheckCircle2 className="h-8 w-8" />
              ) : (
                <SaMiLogo />
              )}
            </div>

            {sent ? (
              <div className="mt-8 text-center">
                <h1 className="text-3xl font-black tracking-tight">
                  Check your email
                </h1>

                <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">
                  If an account exists for that email,
                  we have sent a password reset link.
                  The link expires in 30 minutes.
                </p>

                <Link
                  href="/login"
                  className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Back to login
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-8 text-center">
                  <h1 className="text-3xl font-black tracking-tight">
                    Reset your password
                  </h1>

                  <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">
                    Enter your email and we will send
                    you a secure password reset link.
                  </p>
                </div>

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
                    {error}
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

                    <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
                      <Mail className="h-5 w-5 text-slate-400" />

                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(
                            event.target.value
                          )
                        }
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={loading}
                        className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg hover:bg-slate-800 disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}