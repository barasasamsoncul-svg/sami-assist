'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, ArrowLeft, Check, X, AlertTriangle, Loader2, Crown, Sparkles } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: 'Free',
    period: 'forever',
    description: 'Perfect for getting started',
    features: ['1 app only', 'Unlimited users', '100 AI queries/month', 'Basic support'],
    color: 'gray',
  },
  {
    key: 'standard',
    name: 'Standard',
    price: 'KES 2,000',
    period: '/month',
    description: 'For growing businesses',
    features: ['All apps included', 'Per user pricing', '1,000 AI queries/month', '15-day free trial', 'Priority support'],
    color: 'blue',
  },
  {
    key: 'custom',
    name: 'Custom',
    price: 'KES 3,340',
    period: '/month',
    description: 'For enterprises',
    features: ['All apps + custom', 'Unlimited AI queries', 'Dedicated support', 'Custom integrations', 'SLA'],
    color: 'purple',
  }
];

export default function SelectPlanPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [loading, setLoading] = useState(false);
  const [selectedAppCount, setSelectedAppCount] = useState(0);
  const [overlay, setOverlay] = useState<null | { type: 'error' | 'success' | 'payment'; title: string; message: string; redirectUrl?: string }>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Get selected apps count
    const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
    setSelectedAppCount(selectedApps.length);
    
    // Auto-select Standard if multiple apps
    if (selectedApps.length > 1) {
      setSelectedPlan('standard');
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('sami_theme', next ? 'dark' : 'light');
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    
    try {
      const accountForm = JSON.parse(sessionStorage.getItem('sami_account_form') || '{}');
      const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
      
      // If more than 1 app, force Standard plan
      const finalPlan = selectedApps.length > 1 ? 'standard' : selectedPlan;

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...accountForm,
          plan: finalPlan,
          selectedApps
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOverlay({ 
          type: 'error', 
          title: 'Registration Failed', 
          message: data.error || 'Something went wrong' 
        });
        setLoading(false);
        return;
      }

      if (data.requiresPayment && data.pesapalOrder) {
        // Redirect to PesaPal
        setOverlay({
          type: 'payment',
          title: 'Complete Payment',
          message: `You're getting 15 days FREE trial! After that, it's ${finalPlan === 'standard' ? 'KES 2,000' : 'KES 3,340'}/month.`,
          redirectUrl: data.pesapalOrder.redirectUrl
        });
        return;
      }

      // Free plan - show verification
      setOverlay({
        type: 'success',
        title: 'Account Created!',
        message: `We've sent a verification code to ${accountForm.email}. Please check your inbox.`
      });

      sessionStorage.setItem('sami_verification_email', accountForm.email);
      
      setTimeout(() => {
        router.push('/auth/verify-email');
      }, 2000);

    } catch (error) {
      setOverlay({ 
        type: 'error', 
        title: 'Error', 
        message: 'Failed to create account. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[880px] mx-auto">
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
              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                Step 3 of 3: You selected {selectedAppCount} app{selectedAppCount > 1 ? 's' : ''}
                {selectedAppCount > 1 && ' — Free plan is not available for multiple apps'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {PLANS.map((plan) => {
                const isDisabled = plan.key === 'free' && selectedAppCount > 1;
                const isSelected = selectedPlan === plan.key;

                return (
                  <button
                    key={plan.key}
                    onClick={() => !isDisabled && setSelectedPlan(plan.key)}
                    disabled={isDisabled}
                    className={`relative p-5 rounded-xl border-2 text-left transition-all ${
                      isSelected 
                        ? `border-${plan.color === 'blue' ? 'blue' : plan.color === 'purple' ? 'purple' : 'gray'}-600 bg-${plan.color}-50 dark:bg-${plan.color}-900/20` 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    
                    {plan.key === 'standard' && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                        Most Popular
                      </div>
                    )}

                    <div className="flex items-center gap-2 mb-2">
                      {plan.key === 'free' && <Sparkles size={18} className="text-gray-500" />}
                      {plan.key === 'standard' && <Crown size={18} className="text-blue-600" />}
                      {plan.key === 'custom' && <Crown size={18} className="text-purple-600" />}
                      <span className="font-semibold text-gray-900 dark:text-white">{plan.name}</span>
                    </div>

                    <div className="mb-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{plan.price}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{plan.period}</span>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{plan.description}</p>

                    <ul className="space-y-1.5">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <Check size={12} className="text-blue-600 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {isDisabled && (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                        ⚠️ Free plan only supports 1 app
                      </p>
                    )}
                    
                    {plan.key === 'standard' && selectedAppCount > 1 && (
                      <div className="mt-3 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded text-xs text-blue-700 dark:text-blue-300 text-center">
                        ✓ Auto-selected for {selectedAppCount} apps
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-5">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {selectedAppCount > 1 ? 'Standard plan required for multiple apps' : 'You can change your plan anytime.'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => router.back()} 
                  className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <button 
                  onClick={handleCreateAccount} 
                  disabled={loading}
                  className="h-[44px] px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-2 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : 
                    selectedAppCount > 1 ? 'Proceed to Payment' : 'Create Account'}
                  {!loading && <ArrowRight size={15} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/auth/login" className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Sign In</Link>
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>

      {overlay && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative">
            <button 
              onClick={() => {
                if (overlay.type === 'payment' && overlay.redirectUrl) {
                  window.location.href = overlay.redirectUrl;
                } else {
                  setOverlay(null);
                }
              }} 
              className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={17} />
            </button>
            
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              overlay.type === 'error' ? 'bg-red-100 dark:bg-red-950/40' : 
              overlay.type === 'payment' ? 'bg-yellow-100 dark:bg-yellow-950/40' :
              'bg-green-100 dark:bg-green-950/40'
            }`}>
              {overlay.type === 'payment' ? <AlertTriangle size={25} className="text-yellow-600" /> :
               overlay.type === 'error' ? <AlertTriangle size={25} className="text-red-600" /> :
               <Check size={25} className="text-green-600" />}
            </div>
            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">{overlay.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{overlay.message}</p>
            
            {overlay.type === 'payment' && overlay.redirectUrl && (
              <button 
                onClick={() => window.location.href = overlay.redirectUrl!}
                className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition flex items-center justify-center gap-2"
              >
                Go to PesaPal <ArrowRight size={15} />
              </button>
            )}
            
            {overlay.type !== 'payment' && (
              <button onClick={() => setOverlay(null)} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition">Continue</button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}