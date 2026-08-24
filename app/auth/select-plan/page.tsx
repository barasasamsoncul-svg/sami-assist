'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function SelectPlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [selectedAppCount, setSelectedAppCount] = useState(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    const apps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
    setSelectedAppCount(apps.length);
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

  const installApps = async () => {
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
  };

  const handlePlanSelect = async (plan: string) => {
    setError('');
    setLoading(true);

    if (plan === 'custom') {
      window.location.href = 'mailto:sales@sami.tech?subject=Custom%20Plan%20Inquiry';
      return;
    }

    try {
      const businessId = sessionStorage.getItem('sami_pending_business_id');

      if (plan === 'standard') {
        const response = await fetch('/api/auth/update-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, plan }),
        });
        if (!response.ok) throw new Error('Failed to update plan');
        
        // Go to payment
        router.push('/auth/payment');
        return;
      }

      // Free plan - install apps and go to login
      await installApps();
      router.push('/auth/login?registered=true');
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

      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">Choose your plan</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">You selected {selectedAppCount} app{selectedAppCount !== 1 ? 's' : ''}</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        {selectedAppCount > 1 && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-400">
            You selected {selectedAppCount} apps. The Free plan includes only 1 app. Upgrade to Standard for all apps.
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-6">
          {/* Free */}
          <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${selectedAppCount <= 1 ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">One App Free</h3>
            <p className="text-4xl font-extrabold mt-3">$0</p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> 1 App</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> Unlimited users</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> 100 AI queries/month</li>
            </ul>
            <button onClick={() => handlePlanSelect('free')} disabled={selectedAppCount > 1 || loading} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {selectedAppCount <= 1 ? 'Continue Free' : 'Only 1 app on Free'}
            </button>
          </div>

          {/* Standard */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-blue-600 p-6 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold">RECOMMENDED</span>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Standard</h3>
            <p className="text-4xl font-extrabold mt-3">$14.90<span className="text-sm text-gray-500 font-normal">/user/mo</span></p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> All {selectedAppCount} selected apps</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> Per user billing</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> 1,000 AI queries/user/month</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> 15-day free trial</li>
            </ul>
            <button onClick={() => handlePlanSelect('standard')} disabled={loading} className="mt-6 w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-3 rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition flex items-center justify-center gap-2">
              Start Free Trial
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Custom */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Custom</h3>
            <p className="text-4xl font-extrabold mt-3">$24.90<span className="text-sm text-gray-500 font-normal">/user/mo</span></p>
            <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> All Apps + Custom</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> Unlimited AI</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> Dedicated support</li>
            </ul>
            <button onClick={() => handlePlanSelect('custom')} disabled={loading} className="mt-6 w-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}