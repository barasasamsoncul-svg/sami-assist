'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, ArrowLeft, Check, X, AlertTriangle, Mail, Loader2, CheckCircle } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function SelectPlanPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'custom'>('free');
  const [loading, setLoading] = useState(false);
  const [overlay, setOverlay] = useState<null | any>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const handleResend = async () => {
    const accountForm = JSON.parse(sessionStorage.getItem('sami_account_form') || '{}');
    setResending(true);
    setResendMessage('');
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountForm.email }),
      });
      const data = await response.json();
      if (data.success) setResendMessage('Email sent. Check your inbox.');
      else setResendMessage(data.message || data.error || 'Failed');
    } catch {
      setResendMessage('Failed to resend');
    } finally {
      setResending(false);
    }
  };

  // Poll for email verification
  useEffect(() => {
    if (overlay?.type === 'verify') {
      const accountForm = JSON.parse(sessionStorage.getItem('sami_account_form') || '{}');
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/auth/check-verification?email=${encodeURIComponent(accountForm.email)}`);
          const data = await response.json();
          if (data.verified) {
            clearInterval(interval);
            setOverlay({ type: 'success', title: 'Email Verified!', message: 'Redirecting to login...' });
            setTimeout(() => router.push('/auth/login?verified=true'), 2000);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [overlay, router]);

  const handleSubmit = async () => {
    setLoading(true);
    const accountForm = JSON.parse(sessionStorage.getItem('sami_account_form') || '{}');
    const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');

    const registerBody = {
      firstName: accountForm.firstName,
      lastName: accountForm.lastName,
      email: accountForm.email,
      phone: accountForm.phone,
      password: accountForm.password,
      businessName: accountForm.businessName,
      acceptTerms: true,
      acceptPrivacy: true,
    };

    try {
      // Step 1: Create account
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerBody),
      });
      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        setOverlay({ type: 'error', title: 'Registration Failed', message: registerData.error });
        setLoading(false);
        return;
      }

      const tenantId = registerData.tenant?.id;

      // Step 2: Install selected apps (this provisions database + installs schemas)
      if (tenantId) {
        for (const appKey of selectedApps) {
          await fetch('/api/auth/install-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, appKey }),
          });
        }
      }

      // Step 3: Show verification overlay
      setOverlay({
        type: 'verify',
        title: 'Verify Your Email',
        message: `We sent a verification link to ${accountForm.email}. Check your inbox.`,
        email: accountForm.email,
      });
      setLoading(false);
    } catch {
      setOverlay({ type: 'error', title: 'Failed', message: 'Registration failed' });
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            <div className="mb-7">
              <Link href="/" className="inline-flex flex-col items-start">
                <SaMiLogo size="lg" />
                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">AI-powered business workspace</span>
              </Link>
            </div>

            <div className="mb-7">
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Choose your plan</h1>
              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">Step 3 of 3: Select the plan that fits your business.</p>
            </div>

            {/* Plans */}
            <div className="space-y-4 mb-5">
              <button onClick={() => setSelectedPlan('free')} className={`w-full p-5 rounded-xl border-2 text-left transition ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white text-[15px]">One App Free</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">1 app • Unlimited users • 100 AI queries</p>
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$0</span>
                </div>
              </button>

              <button onClick={() => setSelectedPlan('standard')} className={`w-full p-5 rounded-xl border-2 text-left transition ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white text-[15px]">Standard</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All apps • Per user • 1,000 AI queries • 15-day trial</p>
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$14.90<span className="text-sm text-gray-500">/mo</span></span>
                </div>
              </button>

              <button onClick={() => setSelectedPlan('custom')} className={`w-full p-5 rounded-xl border-2 text-left transition ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white text-[15px]">Custom</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All + custom • Unlimited AI</p>
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$24.90<span className="text-sm text-gray-500">/mo</span></span>
                </div>
              </button>
            </div>

            {/* Bottom action */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-5">
              <p className="hidden sm:block text-[11px] text-gray-400 dark:text-gray-500">You can change your plan anytime.</p>
              <div className="flex gap-3 ml-auto">
                <button onClick={() => router.back()} className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                  <ArrowLeft size={15} /> Back
                </button>
                <button onClick={handleSubmit} disabled={loading} className="h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-2 transition disabled:opacity-60">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : selectedPlan === 'free' ? 'Create Account' : 'Continue to Payment'}
                  {!loading && <ArrowRight size={15} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>

      {/* Overlay */}
      {overlay && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setOverlay(null)}>
          <div className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={17} /></button>

            {overlay.type === 'verify' && <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center"><Mail size={25} className="text-blue-600" /></div>}
            {overlay.type === 'success' && <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center"><CheckCircle size={25} className="text-green-600" /></div>}
            {overlay.type === 'error' && <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center"><AlertTriangle size={25} className="text-red-600" /></div>}

            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">{overlay.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{overlay.message}</p>

            {overlay.type === 'verify' && (
              <>
                {resendMessage && <p className="mt-3 text-sm text-green-600">{resendMessage}</p>}
                <button onClick={handleResend} disabled={resending} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60">
                  {resending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                  {resending ? 'Sending...' : 'Resend Email'}
                </button>
              </>
            )}

            {overlay.type !== 'verify' && (
              <button onClick={() => setOverlay(null)} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition">Continue</button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}