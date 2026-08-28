'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, Check, ArrowLeft, Mail, Loader2, X } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import { SAMI_APPS, APP_CATEGORIES } from '@/lib/sami-apps';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [mobileStep, setMobileStep] = useState<'account' | 'apps' | 'plan'>('account');

  const [inviteData, setInviteData] = useState<any>(null);
  const [isInvite, setIsInvite] = useState(false);

  const [accountForm, setAccountForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    businessName: '',
    acceptTerms: false,
    acceptPrivacy: false,
  });

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'custom'>('free');

  // Verification overlay state
  const [showVerifyOverlay, setShowVerifyOverlay] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
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

    if (inviteToken) {
      fetch(`/api/auth/invite-info?token=${inviteToken}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setInviteData(data.invite);
            setIsInvite(true);
            setAccountForm(prev => ({ ...prev, email: data.invite.email, businessName: data.invite.tenant_name }));
          }
        });
    }
  }, [inviteToken]);

  useEffect(() => {
    if (selectedApps.length <= 1) setSelectedPlan('free');
    else setSelectedPlan('standard');
  }, [selectedApps.length]);

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

  const toggleApp = (appKey: string) => {
    setSelectedApps(prev => prev.includes(appKey) ? prev.filter(k => k !== appKey) : [...prev, appKey]);
  };

  const filteredApps = activeCategory === 'all' ? SAMI_APPS : SAMI_APPS.filter(app => app.category === activeCategory);

  const handleResendFromOverlay = async () => {
    setResending(true);
    setResendMessage('');
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await response.json();
      if (data.success) {
        setResendMessage('Email sent. Check your inbox.');
      } else if (data.message) {
        setResendMessage(data.message);
      } else {
        setResendMessage(data.error || 'Failed to resend');
      }
    } catch {
      setResendMessage('Failed to resend');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!accountForm.firstName || !accountForm.lastName || !accountForm.email || !accountForm.password) {
      setError('First name, last name, email, and password are required');
      return;
    }
    if (accountForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!accountForm.acceptTerms || !accountForm.acceptPrivacy) {
      setError('You must accept Terms of Service and Privacy Policy');
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
      try {
        const response = await fetch('/api/auth/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteToken,
            fullName: `${accountForm.firstName} ${accountForm.lastName}`,
            password: accountForm.password,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        router.push('/auth/login?invited=true');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        setLoading(false);
      }
      return;
    }

    const registerBody = {
      firstName: accountForm.firstName,
      lastName: accountForm.lastName,
      email: accountForm.email,
      phone: accountForm.phone,
      password: accountForm.password,
      acceptTerms: accountForm.acceptTerms,
      acceptPrivacy: accountForm.acceptPrivacy,
    };

    if (selectedPlan === 'free') {
      try {
        const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerBody),
        });
        const registerData = await registerRes.json();
        if (!registerRes.ok) throw new Error(registerData.error);

        // Show verification overlay
        setRegisteredEmail(accountForm.email);
        setShowVerifyOverlay(true);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        setLoading(false);
      }
      return;
    }

    if (selectedPlan === 'standard' || selectedPlan === 'custom') {
      sessionStorage.setItem('sami_registration_data', JSON.stringify(registerBody));
      sessionStorage.setItem('sami_selected_apps', JSON.stringify(selectedApps));
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
        if (!checkoutRes.ok) throw new Error(checkoutData.error);

        sessionStorage.setItem('sami_order_tracking_id', checkoutData.orderTrackingId);
        window.location.href = checkoutData.redirectUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment initiation failed');
        setLoading(false);
      }
    }
  };

  const mobileNext = () => {
    setError('');
    if (mobileStep === 'account') {
      if (!accountForm.firstName || !accountForm.lastName || !accountForm.email || !accountForm.password) {
        setError('Fill all required fields');
        return;
      }
      if (!accountForm.acceptTerms || !accountForm.acceptPrivacy) {
        setError('Accept Terms and Privacy');
        return;
      }
      setMobileStep('apps');
    } else if (mobileStep === 'apps') {
      if (selectedApps.length === 0) {
        setError('Select at least one app');
        return;
      }
      setMobileStep('plan');
    }
  };

  const mobileBack = () => {
    setError('');
    if (mobileStep === 'apps') setMobileStep('account');
    else if (mobileStep === 'plan') setMobileStep('apps');
  };

  const stepNumber = mobileStep === 'account' ? 1 : mobileStep === 'apps' ? 2 : 3;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-10">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center mb-6">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          {isInvite ? (
            <>
              <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Accept Invitation</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Join <strong>{inviteData?.tenant_name}</strong></p>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Create your account</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Start your SaMi workspace</p>
            </>
          )}
        </div>

        {error && (
          <div className="max-w-3xl mx-auto mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
        )}

        {isInvite ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
                <input type="text" value={accountForm.firstName} onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })} placeholder="First Name" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                <input type="text" value={accountForm.lastName} onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })} placeholder="Last Name" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                <input type="email" value={accountForm.email} disabled className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" />
                <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder="Password (min 8)" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Joining...' : 'Accept Invite'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Steps */}
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

            {/* Desktop 3-Column */}
            <div className="hidden lg:grid lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">1</div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Account</h3>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={accountForm.firstName} onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })} placeholder="First Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                    <input type="text" value={accountForm.lastName} onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })} placeholder="Last Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                  </div>
                  <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} placeholder="Email *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                  <input type="text" value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                  <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder="Password (min 8) *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                  <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} placeholder="Business Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={accountForm.acceptTerms} onChange={(e) => setAccountForm({ ...accountForm, acceptTerms: e.target.checked })} className="h-4 w-4" />
                      I accept Terms of Service
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={accountForm.acceptPrivacy} onChange={(e) => setAccountForm({ ...accountForm, acceptPrivacy: e.target.checked })} className="h-4 w-4" />
                      I accept Privacy Policy
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">2</div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Apps</h3>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{selectedApps.length} selected</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>All</button>
                  {APP_CATEGORIES.slice(0, 6).map((cat) => (
                    <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${activeCategory === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{cat.name}</button>
                  ))}
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {filteredApps.map((app) => (
                    <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 text-left transition ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{app.name}</span>
                        {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-8 w-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">3</div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Choose Plan</h3>
                </div>
                <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 transition ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-gray-900 dark:text-white">Free</span><span className="font-bold text-gray-900 dark:text-white">$0</span></div>
                </button>
                <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 transition ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-gray-900 dark:text-white">Standard</span><span className="font-bold text-gray-900 dark:text-white">$14.90/user/mo</span></div>
                </button>
                <button onClick={() => setSelectedPlan('custom')} className={`w-full p-4 rounded-xl border-2 text-left transition ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex justify-between"><span className="font-semibold text-gray-900 dark:text-white">Custom</span><span className="font-bold text-gray-900 dark:text-white">$24.90/user/mo</span></div>
                </button>
                <button onClick={handleSubmit} disabled={loading} className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Processing...' : selectedPlan === 'free' ? 'Create Account' : 'Continue to Payment'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </div>
            </div>

            {/* Mobile Steps */}
            <div className="lg:hidden max-w-md mx-auto">
              {mobileStep === 'account' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={accountForm.firstName} onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })} placeholder="First Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                      <input type="text" value={accountForm.lastName} onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })} placeholder="Last Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                    </div>
                    <input type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} placeholder="Email *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                    <input type="text" value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                    <input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder="Password (min 8) *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                    <input type="text" value={accountForm.businessName} onChange={(e) => setAccountForm({ ...accountForm, businessName: e.target.value })} placeholder="Business Name *" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountForm.acceptTerms} onChange={(e) => setAccountForm({ ...accountForm, acceptTerms: e.target.checked })} className="h-4 w-4" /> Accept Terms</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountForm.acceptPrivacy} onChange={(e) => setAccountForm({ ...accountForm, acceptPrivacy: e.target.checked })} className="h-4 w-4" /> Accept Privacy</label>
                    </div>
                  </div>
                  <button onClick={mobileNext} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">Next: Apps <ArrowRight size={16} /></button>
                </div>
              )}
              {mobileStep === 'apps' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-lg font-semibold mb-4">Select Apps</h3>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {filteredApps.map((app) => (
                      <button key={app.key} onClick={() => toggleApp(app.key)} className={`w-full p-3 rounded-xl border-2 text-left ${selectedApps.includes(app.key) ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{app.name}</span>
                          {selectedApps.includes(app.key) && <Check size={16} className="text-blue-600" />}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button onClick={mobileBack} className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold flex items-center justify-center gap-1"><ArrowLeft size={14} /> Back</button>
                    <button onClick={mobileNext} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm">Next: Plan</button>
                  </div>
                </div>
              )}
              {mobileStep === 'plan' && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-lg font-semibold mb-4">Choose Plan</h3>
                  <button onClick={() => setSelectedPlan('free')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'free' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>Free - $0</button>
                  <button onClick={() => setSelectedPlan('standard')} className={`w-full p-4 rounded-xl border-2 text-left mb-3 ${selectedPlan === 'standard' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>Standard - $14.90/user/mo</button>
                  <button onClick={() => setSelectedPlan('custom')} className={`w-full p-4 rounded-xl border-2 text-left ${selectedPlan === 'custom' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>Custom - $24.90/user/mo</button>
                  <div className="mt-6 flex gap-3">
                    <button onClick={mobileBack} className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold flex items-center justify-center gap-1"><ArrowLeft size={14} /> Back</button>
                    <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm">{loading ? 'Processing...' : selectedPlan === 'free' ? 'Create Account' : 'Payment'}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Already have an account? <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Sign in</Link>
        </p>
      </div>

      {/* VERIFICATION OVERLAY */}
      {showVerifyOverlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setShowVerifyOverlay(false)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>
            <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto">
              <Mail size={28} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Verify Your Email</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              We sent a verification link to <strong className="text-gray-900 dark:text-white">{registeredEmail}</strong>
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Check your inbox. The link expires in 15 minutes.
            </p>

            {resendMessage && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-400">{resendMessage}</p>
            )}

            <button
              onClick={handleResendFromOverlay}
              disabled={resending}
              className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {resending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              {resending ? 'Sending...' : 'Resend Email'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}