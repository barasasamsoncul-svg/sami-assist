'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Mail, Loader2, Check, X, AlertTriangle, ArrowRight, Key } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const storedEmail = sessionStorage.getItem('sami_verification_email');
    if (storedEmail) {
      setEmail(storedEmail);
    } else {
      router.push('/auth/register');
    }

    // Timer for resend
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('sami_theme', next ? 'dark' : 'light');
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/auth/login?verified=true');
        }, 1500);
      } else {
        setError(data.error || 'Invalid verification code');
      }
    } catch {
      setError('Failed to verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setTimeLeft(60);
        setError('New code sent! Check your inbox.');
        setTimeout(() => setError(''), 5000);
      } else {
        setError(data.error || 'Failed to resend code');
      }
    } catch {
      setError('Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[440px] mx-auto">
        <div className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-8">
          <div className="mb-8">
            <Link href="/" className="inline-flex flex-col items-start">
              <SaMiLogo size="lg" />
              <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">AI-powered business workspace</span>
            </Link>
          </div>

          {success ? (
            <>
              <div className="text-center py-8">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Email Verified!</h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">Your account is now active. Redirecting to login...</p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                  <Mail size={32} className="text-blue-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify Your Email</h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  We've sent a 6-digit code to <strong className="text-gray-700 dark:text-gray-300">{email}</strong>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Enter Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCode(val);
                      setError('');
                    }}
                    className={`w-full px-4 py-3 rounded-lg border text-center text-2xl tracking-[8px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      error && !error.includes('sent') 
                        ? 'border-red-400 dark:border-red-500' 
                        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                    }`}
                    placeholder="123456"
                    autoFocus
                  />
                  {error && (
                    <p className={`mt-2 text-sm ${error.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
                      {error}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleVerify}
                  disabled={loading || code.length !== 6}
                  className="w-full h-[48px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify Email'}
                  {!loading && <ArrowRight size={18} />}
                </button>

                <div className="text-center">
                  <button
                    onClick={handleResend}
                    disabled={resending || timeLeft > 0}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resending ? (
                      <Loader2 size={14} className="animate-spin inline mr-1" />
                    ) : timeLeft > 0 ? (
                      `Resend code in ${timeLeft}s`
                    ) : (
                      'Resend code'
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/auth/login" className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Sign In</Link>
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>
    </main>
  );
}