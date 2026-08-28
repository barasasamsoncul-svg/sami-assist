'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { ArrowRight, ArrowLeft, Check, Shield, Sun, Moon } from 'lucide-react';

export default function PaymentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    if (localStorage.getItem('sami_theme') === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
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

  const handleProceed = async () => {
    setLoading(true);
    setError('');
    try {
      const plan = sessionStorage.getItem('sami_selected_plan') || 'standard';
      const regData = JSON.parse(sessionStorage.getItem('sami_registration_data') || '{}');

      const response = await fetch('/api/payment/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan, billingCycle,
          businessName: regData.businessName,
          email: regData.email,
          fullName: regData.fullName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      sessionStorage.setItem('sami_order_tracking_id', data.orderTrackingId);
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold">Payment</h2>
          <p className="mt-1 text-sm text-gray-500">Start your 15-day free trial</p>
        </div>
        {error && <div className="mb-4 p-4 bg-red-50 rounded-xl text-red-700 text-sm">{error}</div>}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Billing Cycle</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setBillingCycle('monthly')} className={`p-4 rounded-xl border-2 text-left ${billingCycle === 'monthly' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                <span className="font-semibold text-sm">Monthly</span>
                <p className="text-xs text-gray-500 mt-1">KSh 2,000/mo</p>
              </button>
              <button onClick={() => setBillingCycle('annual')} className={`p-4 rounded-xl border-2 text-left ${billingCycle === 'annual' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                <span className="font-semibold text-sm">Annual</span>
                <p className="text-xs text-green-600 mt-1">KSh 19,200/yr (-20%)</p>
              </button>
            </div>
          </div>
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-sm font-medium mb-2">Pay via PesaPal:</p>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> M-Pesa</div>
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Airtel Money</div>
              <div className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Card</div>
            </div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-4 flex items-center gap-2">
            <Shield size={14} className="text-blue-600" />
            <p className="text-xs text-blue-700">KSh 1 verification. No charge until trial ends.</p>
          </div>
          <button onClick={handleProceed} disabled={loading} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? 'Redirecting...' : 'Proceed to Payment'}
            <ArrowRight size={16} />
          </button>
        </div>
        <button onClick={() => router.back()} className="mt-4 mx-auto flex items-center gap-1 text-sm text-gray-500">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    </div>
  );
}