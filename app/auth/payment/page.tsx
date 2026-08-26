'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, ArrowLeft, Check, Shield } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    
    if (searchParams.get('cancelled') === 'true') {
      setError('Payment was cancelled. Please try again.');
    }
  }, [searchParams]);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const handleProceedToPayment = async () => {
    setLoading(true);
    setError('');

    try {
      const plan = sessionStorage.getItem('sami_selected_plan') || 'standard';
      
      const response = await fetch('/api/payment/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed');

      sessionStorage.setItem('sami_order_tracking_id', data.orderTrackingId);
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Payment</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Start your 15-day free trial. No charges until trial ends.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Billing Cycle</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  billingCycle === 'monthly' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Monthly</span>
                <p className="text-xs text-gray-500 mt-1">KSh 2,000/month</p>
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  billingCycle === 'annual' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Annual</span>
                <p className="text-xs text-green-600 mt-1">KSh 19,200/year (Save 20%)</p>
              </button>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pay via PesaPal:</p>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> M-Pesa</div>
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Airtel Money</div>
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Credit/Debit Card</div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-4 flex items-center gap-2">
            <Shield size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              You won't be charged until the 15-day trial ends. Cancel anytime.
            </p>
          </div>

          <button
            onClick={handleProceedToPayment}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? 'Redirecting to PesaPal...' : 'Proceed to Payment'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </div>

        <button onClick={() => router.back()} className="mt-4 mx-auto flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} />
          Back
        </button>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PaymentContent />
    </Suspense>
  );
}