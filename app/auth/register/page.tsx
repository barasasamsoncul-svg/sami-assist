'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Sun, Moon, ArrowRight, ArrowLeft, Check, 
  CreditCard, Lock, X, Building2, AppWindow, CreditCard as PlanIcon
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import { SAMI_APPS, APP_CATEGORIES, getRecommendedAppKeys } from '@/lib/sami-apps';

export default function RegisterPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  
  // Mobile step state
  const [mobileStep, setMobileStep] = useState<'account' | 'apps' | 'plan'>('account');

  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
  });

  const [selectedApps, setSelectedApps] = useState<string[]>(getRecommendedAppKeys());
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'custom'>('free');

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

  useEffect(() => {
    if (selectedApps.length <= 1) {
      setSelectedPlan('free');
    } else {
      setSelectedPlan('standard');
    }
  }, [selectedApps.length]);

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

  const toggleApp = (appKey: string) => {
    setSelectedApps(prev => 
      prev.includes(appKey) ? prev.filter(k => k !== appKey) : [...prev, appKey]
    );
  };

  const filteredApps = activeCategory === 'all' 
    ? SAMI_APPS 
    : SAMI_APPS.filter(app => app.category === activeCategory);

  const validateAndSubmit = () => {
    if (!accountForm.fullName || !accountForm.email || !accountForm.password || !accountForm.businessName) {
      setError('Please fill all account details');
      return;
    }
    if (accountForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (selectedApps.length === 0) {
      setError('Please select at least one app');
      return;
    }
    setError('');

    if (selectedPlan === 'standard') {
      setShowPayment(true);
    } else {
      completeRegistration();
    }
  };

  const completeRegistration = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      const businessId = data.business.id;

      if (selectedPlan === 'standard') {
        await fetch('/api/auth/update-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, plan: 'standard' }),
        });
      }

      for (const appKey of selectedApps) {
        const installRes = await fetch('/api/auth/install-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, appKey }),
        });
        if (!installRes.ok) {
          console.warn(`Failed to install ${appKey}`);
        }
      }

      router.push('/auth/login?registered=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
      setShowPayment(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cardDetails.cardNumber.replace(/\s/g, '').length < 16) {
      setError('Please enter a valid card number');
      return;
    }
    if (!cardDetails.expiry || !cardDetails.cvc || !cardDetails.nameOnCard) {
      setError('Please fill all card details');
      return;
    }

    setError('');
    setLoading(true);
    setTimeout(() => {
      completeRegistration();
    }, 1500);
  };

  const mobileNext = () => {
    if (mobileStep === 'account') {
      if (!accountForm.fullName || !accountForm.email || !accountForm.password || !accountForm.businessName) {
        setError('Please fill all account details');
        return;
      }
      if (accountForm.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      setError('');
      setMobileStep('apps');
    } else if (mobileStep === 'apps') {
      if (selectedApps.length === 0) {
        setError('Please select at least one app');
        return;
      }
      setError('');
      setMobileStep('plan');
    }
  };

  const mobileBack = () => {
    if (mobileStep === 'apps') setMobileStep('account');
    else if (mobileStep === 'plan') setMobileStep('apps');
  };

  // Mobile Step Indicator
  const stepNumber = mobileStep === 'account' ? 1 : mobileStep === 'apps' ? 2 : 3;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition z-10">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <Link href="/">
            <SaMiLogo size="lg" />
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Create your workspace</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set up your account, pick apps, and choose a plan</p>
        </div>

        {/* Mobile Step Indicator */}
        <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === stepNumber ? 'bg-blue-600 text-white' : step < stepNumber ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}>
                {step < stepNumber ? <Check size={14} /> : step}
              </div>
              {step < 3 && <div className={`w-8 h-0.5 ${step < stepNumber ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-3xl mx-auto mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* DESKTOP: 3-Column Layout */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-6">
          {/* Column 1: Register */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">1</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Register</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Name *</label>
                <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none" placeholder="Acme Ltd" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name *</label>
                <input type="text" value={accountForm.fullName} onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email *</label>
                <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none" placeholder="john@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password *</label>
                <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none" placeholder="Min 8 characters" />
              </div>
            </div>
          </div>

          {/* Column 2: Apps */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">2</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Apps</h3>
              </div>
              <span className="text-xs text-gray-500">{selectedApps.length} selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
              {APP_CATEGORIES.slice(0, 6).map((cat) => (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
              ))}
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filteredApps.map((app) => (
                <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 text-left transition ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</span>
                    {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{app.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Plan */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">3</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Choose Plan</h3>
            </div>

            <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 transition ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">One App Free</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">$0</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">1 app • Unlimited users • 100 AI queries/mo</p>
            </button>

            <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 transition ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Standard</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">$14.90<span className="text-xs text-gray-500">/user/mo</span></span>
              </div>
              <p className="text-xs text-gray-500 mt-1">All apps • Per user • 1,000 AI queries • 15-day trial</p>
            </button>

            <button onClick={() => setSelectedPlan('custom')} className={`w-full p-4 rounded-xl border-2 text-left transition ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Custom</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">$24.90<span className="text-xs text-gray-500">/user/mo</span></span>
              </div>
              <p className="text-xs text-gray-500 mt-1">All apps + custom • Unlimited AI • Dedicated support</p>
            </button>

            <button onClick={validateAndSubmit} disabled={loading} className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {loading ? 'Creating...' : selectedPlan === 'standard' ? 'Continue to Payment' : 'Create Workspace'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </div>
        </div>

        {/* MOBILE: Step-by-Step Wizard */}
        <div className="lg:hidden max-w-md mx-auto">
          {/* Step 1: Account */}
          {mobileStep === 'account' && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Register</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Name *</label>
                  <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="Acme Ltd" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name *</label>
                  <input type="text" value={accountForm.fullName} onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email *</label>
                  <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="john@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password *</label>
                  <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="Min 8 characters" />
                </div>
              </div>
              <button onClick={mobileNext} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                Next: Select Apps
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Apps */}
          {mobileStep === 'apps' && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Apps</h3>
                <span className="text-xs text-gray-500">{selectedApps.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
                {APP_CATEGORIES.slice(0, 5).map((cat) => (
                  <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
                ))}
              </div>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {filteredApps.map((app) => (
                  <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 text-left ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</span>
                      {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600" />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={mobileBack} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm">
                  Back
                </button>
                <button onClick={mobileNext} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                  Next: Plan
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Plan */}
          {mobileStep === 'plan' && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Choose Plan</h3>

              <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">One App Free</span>
                  <span className="text-lg font-bold">$0</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">1 app • Unlimited users • 100 AI queries/mo</p>
              </button>

              <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">Standard</span>
                  <span className="text-lg font-bold">$14.90<span className="text-xs text-gray-500">/user/mo</span></span>
                </div>
                <p className="text-xs text-gray-500 mt-1">All apps • Per user • 1,000 AI queries • 15-day trial</p>
              </button>

              <button onClick={() => setSelectedPlan('custom')} className={`w-full p-4 rounded-xl border-2 text-left ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">Custom</span>
                  <span className="text-lg font-bold">$24.90<span className="text-xs text-gray-500">/user/mo</span></span>
                </div>
                <p className="text-xs text-gray-500 mt-1">All apps + custom • Unlimited AI • Dedicated support</p>
              </button>

              <div className="mt-6 flex gap-3">
                <button onClick={mobileBack} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm">
                  Back
                </button>
                <button onClick={validateAndSubmit} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
                  {loading ? 'Creating...' : selectedPlan === 'standard' ? 'Payment' : 'Create'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-500 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>

      {/* Payment Overlay Modal (appears on both desktop and mobile) */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setShowPayment(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <X size={18} className="text-gray-500" />
            </button>

            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <CreditCard size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Payment Details</h3>
                <p className="text-xs text-gray-500">15-day free trial • No charges until trial ends</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Lock size={14} className="text-green-500" />
              <span className="text-xs text-gray-500">Secured payment</span>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name on Card *</label>
                <input type="text" value={cardDetails.nameOnCard} onChange={(e) => setCardDetails({ ...cardDetails, nameOnCard: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Card Number *</label>
                <input type="text" value={cardDetails.cardNumber} onChange={(e) => setCardDetails({ ...cardDetails, cardNumber: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="4242 4242 4242 4242" maxLength={19} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry *</label>
                  <input type="text" value={cardDetails.expiry} onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="MM/YY" maxLength={5} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">CVC *</label>
                  <input type="text" value={cardDetails.cvc} onChange={(e) => setCardDetails({ ...cardDetails, cvc: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="123" maxLength={4} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {loading ? 'Processing...' : 'Start Free Trial'}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}