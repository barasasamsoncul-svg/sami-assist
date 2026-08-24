'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Lock, CreditCard, ArrowRight, ArrowLeft } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function PaymentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [cardDetails, setCardDetails] = useState({
    nameOnCard: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (cardDetails.cardNumber.replace(/\s/g, '').length < 16) {
      setError('Please enter a valid card number');
      setLoading(false);
      return;
    }
    if (!cardDetails.expiry || !cardDetails.cvc || !cardDetails.nameOnCard) {
      setError('Please fill all card details');
      setLoading(false);
      return;
    }

    setTimeout(async () => {
      try {
        const businessId = sessionStorage.getItem('sami_pending_business_id');
        const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
        
        for (const appKey of selectedApps) {
          const response = await fetch('/api/auth/install-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, appKey }),
          });
          if (!response.ok) {
            console.warn(`Failed to install ${appKey}`);
          }
        }
        
        sessionStorage.removeItem('sami_pending_business_id');
        sessionStorage.removeItem('sami_selected_apps');
        router.push('/auth/login?registered=true');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        setLoading(false);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Payment Details</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Start your 15-day free trial. No charges until trial ends.</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={16} className="text-green-500" />
            <span className="text-sm text-gray-500">Secured payment</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name on Card *</label>
              <input type="text" value={cardDetails.nameOnCard} onChange={(e) => setCardDetails({ ...cardDetails, nameOnCard: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Card Number *</label>
              <div className="relative">
                <input type="text" value={cardDetails.cardNumber} onChange={(e) => setCardDetails({ ...cardDetails, cardNumber: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none pl-10" placeholder="4242 4242 4242 4242" maxLength={19} />
                <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Expiry *</label>
                <input type="text" value={cardDetails.expiry} onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="MM/YY" maxLength={5} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">CVC *</label>
                <input type="text" value={cardDetails.cvc} onChange={(e) => setCardDetails({ ...cardDetails, cvc: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="123" maxLength={4} />
              </div>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-500 dark:text-gray-400">You won't be charged until your 15-day trial ends. Cancel anytime.</p>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {loading ? 'Processing...' : 'Start Free Trial'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <button onClick={() => router.back()} className="mt-4 mx-auto flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} />
          Back to plan selection
        </button>
      </div>
    </div>
  );
}