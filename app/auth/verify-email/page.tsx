'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  Moon,
  Mail,
  Loader2,
  Check,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type MessageState = {
  type: 'error' | 'success';
  text: string;
} | null;

export default function VerifyEmailPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * ---------------------------------------------------------
   * Theme
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    const shouldUseDark =
      savedTheme === 'dark' || (!savedTheme && prefersDark);

    setDarkMode(shouldUseDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
  }, []);

  /*
   * ---------------------------------------------------------
   * Load verification email
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const storedEmail = sessionStorage.getItem('sami_verification_email');

    if (!storedEmail) {
      router.replace('/auth/register');
      return;
    }

    setEmail(storedEmail);
  }, [router]);

  /*
   * ---------------------------------------------------------
   * Resend countdown
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  /*
   * ---------------------------------------------------------
   * Cleanup redirect timer
   * ---------------------------------------------------------
   */
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * Theme toggle
   * ---------------------------------------------------------
   */
  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle('dark', next);

    localStorage.setItem(
      'sami_theme',
      next ? 'dark' : 'light'
    );
  };

  /*
   * ---------------------------------------------------------
   * Code input
   * ---------------------------------------------------------
   */
  const handleCodeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value
      .replace(/\D/g, '')
      .slice(0, 6);

    setCode(value);

    if (message) {
      setMessage(null);
    }
  };

  /*
   * ---------------------------------------------------------
   * Verify email
   * ---------------------------------------------------------
   */
  const handleVerify = async () => {
    if (!email) {
      setMessage({
        type: 'error',
        text: 'We could not determine the email address. Please start registration again.',
      });
      return;
    }

    if (code.length !== 6) {
      setMessage({
        type: 'error',
        text: 'Please enter the 6-digit verification code.',
      });
      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
        }),
      });

      let data: {
        success?: boolean;
        error?: string;
        message?: string;
      } = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || !data.success) {
        setMessage({
          type: 'error',
          text:
            data.error ||
            data.message ||
            'The verification code is invalid or has expired. Please try again.',
        });
        setLoading(false);
        return;
      }

      // Verification successful
      setSuccess(true);
      setMessage(null);

      sessionStorage.removeItem('sami_verification_email');

      redirectTimerRef.current = setTimeout(() => {
        router.replace('/auth/login?verified=true');
      }, 1500);

    } catch {
      setMessage({
        type: 'error',
        text: 'We could not verify your email right now. Please check your connection and try again.',
      });
      setLoading(false);
    }
  };

  /*
   * ---------------------------------------------------------
   * Resend verification code
   * ---------------------------------------------------------
   */
  const handleResend = async () => {
    if (!email || resending || timeLeft > 0) {
      return;
    }

    setResending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      let data: {
        success?: boolean;
        error?: string;
        message?: string;
      } = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || !data.success) {
        setMessage({
          type: 'error',
          text:
            data.error ||
            data.message ||
            'We could not send a new verification code. Please try again.',
        });

        return;
      }

      setTimeLeft(60);
      setCode('');

      setMessage({
        type: 'success',
        text: 'A new verification code has been sent to your email.',
      });
    } catch {
      setMessage({
        type: 'error',
        text: 'We could not send a new verification code. Please try again.',
      });
    } finally {
      setResending(false);
    }
  };

  /*
   * ---------------------------------------------------------
   * Enter key
   * ---------------------------------------------------------
   */
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter' && code.length === 6 && !loading) {
      event.preventDefault();
      handleVerify();
    }
  };

  /*
   * ---------------------------------------------------------
   * Email display
   * ---------------------------------------------------------
   */
  const maskedEmail = (() => {
    if (!email || !email.includes('@')) {
      return email;
    }

    const [username, domain] = email.split('@');

    if (username.length <= 2) {
      return `${username[0] ?? ''}***@${domain}`;
    }

    return `${username.slice(0, 2)}***@${domain}`;
  })();

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      {/* Theme */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          darkMode
            ? 'Switch to light mode'
            : 'Switch to dark mode'
        }
        className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
      >
        {darkMode ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </button>

      <div className="w-full max-w-[440px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-8">
          {/* Brand */}
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex flex-col items-start"
            >
              <SaMiLogo size="lg" />

              <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
                AI-powered business workspace
              </span>
            </Link>
          </div>

          {success ? (
            /*
             * =================================================
             * SUCCESS STATE
             * =================================================
             */
            <div className="text-center py-8">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5">
                <Check
                  size={32}
                  strokeWidth={2.5}
                  className="text-green-600 dark:text-green-400"
                />
              </div>

              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                Email Verified
              </h1>

              <p className="mt-2 text-[14px] leading-relaxed text-gray-500 dark:text-gray-400">
                Your SaMi account has been successfully verified.
              </p>

              <div className="mt-6 flex items-center justify-center gap-2 text-[12px] text-gray-400 dark:text-gray-500">
                <Loader2
                  size={14}
                  className="animate-spin"
                />
                Redirecting to sign in...
              </div>
            </div>
          ) : (
            /*
             * =================================================
             * VERIFICATION STATE
             * =================================================
             */
            <>
              <div className="text-center mb-8">
                <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-5">
                  <Mail
                    size={30}
                    className="text-blue-600 dark:text-blue-400"
                  />
                </div>

                <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                  Verify your email
                </h1>

                <p className="mt-3 text-[14px] leading-relaxed text-gray-500 dark:text-gray-400">
                  We've sent a 6-digit verification code to
                </p>

                {email && (
                  <p className="mt-1 text-[14px] font-medium text-gray-800 dark:text-gray-200 break-all">
                    {maskedEmail}
                  </p>
                )}
              </div>

              {/* Security notice */}
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 px-4 py-3">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                />

                <p className="text-[12px] leading-relaxed text-blue-700 dark:text-blue-300">
                  Enter the code from your email to activate
                  your SaMi account. The code expires for
                  security.
                </p>
              </div>

              <div className="space-y-5">
                {/* Code */}
                <div>
                  <label
                    htmlFor="verification-code"
                    className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Verification code
                  </label>

                  <input
                    id="verification-code"
                    name="verification-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    autoFocus
                    placeholder="000000"
                    aria-label="6-digit verification code"
                    aria-invalid={
                      message?.type === 'error'
                    }
                    className={`w-full h-[54px] rounded-xl border bg-white dark:bg-gray-900 text-center text-[25px] tracking-[10px] font-mono font-semibold text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-700 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:opacity-60 ${
                      message?.type === 'error'
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                  />

                  {/* Status message */}
                  {message && (
                    <div
                      className={`mt-3 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed ${
                        message.type === 'success'
                          ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/40'
                          : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/40'
                      }`}
                      role="alert"
                    >
                      {message.text}
                    </div>
                  )}
                </div>

                {/* Verify */}
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={
                    loading ||
                    resending ||
                    code.length !== 6 ||
                    !email
                  }
                  className="w-full h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify email
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                {/* Resend */}
                <div className="text-center">
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 mb-1.5">
                    Didn't receive the code?
                  </p>

                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={
                      resending ||
                      timeLeft > 0 ||
                      loading ||
                      !email
                    }
                    className="text-[13px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {resending ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2
                          size={14}
                          className="animate-spin"
                        />
                        Sending new code...
                      </span>
                    ) : timeLeft > 0 ? (
                      `Resend code in ${timeLeft}s`
                    ) : (
                      'Resend code'
                    )}
                  </button>
                </div>
              </div>

              {/* Help text */}
              <div className="mt-7 pt-5 border-t border-gray-100 dark:border-gray-800">
                <p className="text-[11px] leading-relaxed text-center text-gray-400 dark:text-gray-500">
                  Check your spam or junk folder if you don't
                  see the email. Make sure you're checking the
                  correct inbox.
                </p>
              </div>
            </>
          )}
        </section>

        {/* Footer links */}
        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link
            href="/auth/login"
            className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition"
          >
            Sign In
          </Link>

          <Link
            href="/help"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Help
          </Link>

          <Link
            href="/auth/terms"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Terms
          </Link>

          <Link
            href="/auth/privacy"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}