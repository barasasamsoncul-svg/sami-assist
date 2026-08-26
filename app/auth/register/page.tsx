'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, Check, Mail, Building2, User, Lock } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import { SAMI_APPS, APP_CATEGORIES, getRecommendedAppKeys } from '@/lib/sami-apps';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [mobileStep, setMobileStep] = useState<'account' | 'apps' | 'plan'>('account');

  // Invite state
  const [inviteData, setInviteData] = useState<any>(null);
  const [isInvite, setIsInvite] = useState(false);

  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
  });

  const [selectedApps, setSelectedApps] = useState<string[]>(getRecommendedAppKeys());
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'custom'>('free');

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Check if invite token exists
    if (inviteToken) {
      fetchInviteInfo(inviteToken);
    }
  }, [inviteToken]);

  const fetchInviteInfo = async (token: string) => {
    try {
      const response = await fetch(`/api/auth/invite-info?token=${token}`);
      const data = await response.json();
      if (response.ok && data.success) {
        setInviteData(data.invite);
        setIsInvite(true);
        setAccountForm(prev => ({
          ...prev,
          email: data.invite.email,
          businessName: data.invite.business_name,
        }));
      } else {
        setError('Invalid or expired invite link');
      }
    } catch (err) {
      setError('Failed to load invite');
    }
  };

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

  const handleSubmit = async () => {
    setError('');

    // Validation
    if (!accountForm.fullName || !accountForm.password) {
      setError('Please fill all fields');
      return;
    }
    if (accountForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!isInvite && !accountForm.email) {
      setError('Email is required');
      return;
    }
    if (!isInvite && !accountForm.businessName) {
      setError('Business name is required');
      return;
    }
    if (!isInvite && selectedApps.length === 0) {
      setError('Select at least one app');
      return;
    }

    setLoading(true);

    if (isInvite) {
      // Accept invite flow
      try {
        const response = await fetch('/api/auth/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteToken,
            fullName: accountForm.fullName,
            password: accountForm.password,
          }),
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to accept invite');

        router.push('/auth/login?invited=true');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        setLoading(false);
      }
      return;
    }

    // Normal registration flow
    if (selectedPlan === 'free') {
      try {
        const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(accountForm),
        });
        const registerData = await registerRes.json();

        if (!registerRes.ok) throw new Error(registerData.error || 'Registration failed');

        const businessId = registerData.business.id;

        for (const appKey of selectedApps) {
          await fetch('/api/auth/install-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, appKey }),
          });
        }

        router.push('/auth/check-email');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        setLoading(false);
      }
    } else if (selectedPlan === 'standard') {
      sessionStorage.setItem('sami_registration_data', JSON.stringify(accountForm));
      sessionStorage.setItem('sami_selected_apps', JSON.stringify(selectedApps));
      sessionStorage.setItem('sami_selected_plan', 'standard');

      try {
        const checkoutRes = await fetch('/api/payment/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: 'standard',
            billingCycle: 'monthly',
            businessName: accountForm.businessName,
            email: accountForm.email,
            fullName: accountForm.fullName,
          }),
        });
        const checkoutData = await checkoutRes.json();

        if (!checkoutRes.ok) throw new Error(checkoutData.error || 'Payment initiation failed');

        sessionStorage.setItem('sami_order_tracking_id', checkoutData.orderTrackingId);
        window.location.href = checkoutData.redirectUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment initiation failed');
        setLoading(false);
      }
    }
  };

  const mobileNext = () => {
    if (mobileStep === 'account') {
      if (!accountForm.fullName || !accountForm.password) {
        setError('Please fill all fields');
        return;
      }
      setError('');
      setMobileStep('apps');
    } else if (mobileStep === 'apps') {
      if (selectedApps.length === 0) {
        setError('Select at least one app');
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

  const stepNumber = mobileStep === 'account' ? 1 : mobileStep === 'apps' ? 2 : 3;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition z-10">
        {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center mb-6">
          <Link href="/">
            <SaMiLogo size="lg" />
          </Link>
          
          {isInvite ? (
            <>
              <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Accept Invitation</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                You've been invited to join <strong className="text-blue-600">{inviteData?.business_name}</strong>
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Create your workspace</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set up your account, pick apps, and choose a plan</p>
            </>
          )}
        </div>

        {error && (
          <div className="max-w-3xl mx-auto mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* INVITE REGISTRATION FORM */}
        {isInvite ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={accountForm.fullName}
                    onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={accountForm.email}
                    disabled
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={accountForm.password}
                    onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white"
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {loading ? 'Joining...' : 'Accept Invite & Join'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* NORMAL REGISTRATION - 3 columns on desktop, steps on mobile */
          <>
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
                    <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="Acme Ltd" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name *</label>
                    <input type="text" value={accountForm.fullName} onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email *</label>
                    <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="john@company.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password *</label>
                    <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" placeholder="Min 8 characters" />
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
                  <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>All</button>
                  {APP_CATEGORIES.slice(0, 6).map((cat) => (
                    <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>{cat.name}</button>
                  ))}
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {filteredApps.map((app) => (
                    <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 text-left ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{app.name}</span>
                        {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600" />}
                      </div>
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

                <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-sm">One App Free</span><span className="font-bold">$0</span></div>
                  <p className="text-xs text-gray-500 mt-1">1 app • Unlimited users • 100 AI queries</p>
                </button>
                <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-sm">Standard</span><span className="font-bold">$14.90<span className="text-xs text-gray-500">/user/mo</span></span></div>
                  <p className="text-xs text-gray-500 mt-1">All apps • 1,000 AI queries • 15-day trial</p>
                </button>
                <button onClick={() => setSelectedPlan('custom')} className={`w-full p-4 rounded-xl border-2 text-left ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-sm">Custom</span><span className="font-bold">$24.90</span></div>
                  <p className="text-xs text-gray-500 mt-1">All + custom • Unlimited AI</p>
                </button>

                <button onClick={handleSubmit} disabled={loading} className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Processing...' : selectedPlan === 'standard' ? 'Continue to Payment' : 'Create Workspace'}
                </button>
              </div>
            </div>

            {/* MOBILE: Step-by-Step */}
            <div className="lg:hidden max-w-md mx-auto">
              {mobileStep === 'account' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-lg font-semibold mb-4">Register</h3>
                  <div className="space-y-4">
                    <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} placeholder="Business Name" className="w-full rounded-xl border px-4 py-2.5 text-sm" />
                    <input type="text" value={accountForm.fullName} onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })} placeholder="Full Name" className="w-full rounded-xl border px-4 py-2.5 text-sm" />
                    <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} placeholder="Email" className="w-full rounded-xl border px-4 py-2.5 text-sm" />
                    <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder="Password (min 8 characters)" className="w-full rounded-xl border px-4 py-2.5 text-sm" />
                  </div>
                  <button onClick={mobileNext} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold">Next: Select Apps</button>
                </div>
              )}

              {mobileStep === 'apps' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border p-6">
                  <h3 className="text-lg font-semibold mb-4">Select Apps</h3>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {filteredApps.map((app) => (
                      <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                        {app.name}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button onClick={mobileBack} className="flex-1 px-4 py-3 border rounded-xl text-sm">Back</button>
                    <button onClick={mobileNext} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm">Next: Plan</button>
                  </div>
                </div>
              )}

              {mobileStep === 'plan' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border p-6">
                  <h3 className="text-lg font-semibold mb-4">Choose Plan</h3>
                  <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 mb-3 ${selectedPlan === 'free' ? 'border-blue-600' : 'border-gray-200'}`}>One App Free - $0</button>
                  <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 mb-3 ${selectedPlan === 'standard' ? 'border-blue-600' : 'border-gray-200'}`}>Standard - $14.90/user/mo</button>
                  <div className="mt-6 flex gap-3">
                    <button onClick={mobileBack} className="flex-1 px-4 py-3 border rounded-xl text-sm">Back</button>
                    <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm">
                      {loading ? 'Processing...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}