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
      if (data.success) {
        setResendMessage('Email sent. Check your inbox.');
      } else {
        setResendMessage(data.message || data.error || 'Failed');
      }
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
        } catch {
          // Keep polling
        }
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

    if (selectedPlan === 'free') {
      try {
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
        if (tenantId) {
          for (const appKey of selectedApps) {
            await fetch('/api/auth/install-app', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tenantId, appKey }),
            });
          }
        }

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
      return;
    }

    if (selectedPlan === 'standard' || selectedPlan === 'custom') {
      sessionStorage.setItem('sami_registration_data', JSON.stringify(registerBody));
      sessionStorage.setItem('sami_selected_plan', selectedPlan);

      try {
        const checkoutRes = await fetch('/api/payment/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: selectedPlan,
            billingCycle: 'monthly',
            businessName: accountForm.businessName,
            email: accountForm.email,
            fullName: `${accountForm.firstName} ${accountForm.lastName}`,
          }),
        });
        const checkoutData = await checkoutRes.json();
        if (!checkoutRes.ok) {
          setOverlay({ type: 'error', title: 'Payment Failed', message: checkoutData.error });
          setLoading(false);
          return;
        }

        sessionStorage.setItem('sami_order_tracking_id', checkoutData.orderTrackingId);
        window.location.href = checkoutData.redirectUrl;
      } catch {
        setOverlay({ type: 'error', title: 'Failed', message: 'Payment initiation failed' });
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-12 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-10">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-lg w-full">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Choose your plan</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Step 4 of 4: Select plan</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === 4 ? 'bg-blue-600 text-white' : step < 4 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}>
                {step < 4 ? <Check size={14} /> : step}
              </div>
              {step < 4 && <div className={`w-6 h-0.5 ${step < 4 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <button onClick={() => setSelectedPlan('free')} className={`w-full p-5 rounded-xl border-2 text-left mb-4 transition ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900 dark:text-white">One App Free</span>
                <p className="text-xs text-gray-500 mt-1">1 app • Unlimited users • 100 AI queries</p>
              </div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$0</span>
            </div>
          </button>

          <button onClick={() => setSelectedPlan('standard')} className={`w-full p-5 rounded-xl border-2 text-left mb-4 transition ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900 dark:text-white">Standard</span>
                <p className="text-xs text-gray-500 mt-1">All apps • Per user • 1,000 AI queries</p>
              </div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$14.90<span className="text-sm text-gray-500">/mo</span></span>
            </div>
          </button>

          <button onClick={() => setSelectedPlan('custom')} className={`w-full p-5 rounded-xl border-2 text-left transition ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900 dark:text-white">Custom</span>
                <p className="text-xs text-gray-500 mt-1">All + custom • Unlimited AI</p>
              </div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$24.90<span className="text-sm text-gray-500">/mo</span></span>
            </div>
          </button>

          <div className="mt-6 flex gap-3">
            <button onClick={() => router.back()} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-1">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1">
              {loading ? 'Processing...' : selectedPlan === 'free' ? 'Create Account' : 'Continue to Payment'}
              {!loading && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>

            {overlay.type === 'verify' && (
              <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <Mail size={28} className="text-blue-600" />
              </div>
            )}
            {overlay.type === 'success' && (
              <div className="h-14 w-14 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-600" />
              </div>
            )}
            {overlay.type === 'error' && (
              <div className="h-14 w-14 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
            )}

            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>

            {overlay.type === 'verify' && (
              <>
                {resendMessage && <p className="mt-3 text-sm text-green-600">{resendMessage}</p>}
                <button onClick={handleResend} disabled={resending} className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {resending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  {resending ? 'Sending...' : 'Resend Email'}
                </button>
              </>
            )}

            {overlay.type !== 'verify' && (
              <button onClick={() => setOverlay(null)} className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold">OK</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}