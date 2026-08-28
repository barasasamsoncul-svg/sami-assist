'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, Mail, Loader2, X, AlertTriangle, User, Phone, Lock, Building2 } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function RegisterPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [overlay, setOverlay] = useState<null | { type: 'error' | 'warning'; title: string; message: string }>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    businessName: '',
  });

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

  const handleNext = async () => {
    // Validate fields
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.businessName) {
      setOverlay({ type: 'error', title: 'Missing Fields', message: 'All fields marked * are required.' });
      return;
    }
    if (form.password.length < 8) {
      setOverlay({ type: 'error', title: 'Weak Password', message: 'Password must be at least 8 characters.' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setOverlay({ type: 'error', title: 'Invalid Email', message: 'Please enter a valid email address.' });
      return;
    }

    // Check if email exists
    setCheckingEmail(true);
    try {
      const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(form.email)}`);
      const data = await response.json();
      
      if (data.exists) {
        setOverlay({ 
          type: 'warning', 
          title: 'Email Already Registered', 
          message: 'This email is already registered. Please login instead.' 
        });
        setCheckingEmail(false);
        return;
      }
    } catch {
      setOverlay({ type: 'error', title: 'Error', message: 'Failed to check email. Please try again.' });
      setCheckingEmail(false);
      return;
    }

    setCheckingEmail(false);

    // Save and proceed
    sessionStorage.setItem('sami_account_form', JSON.stringify(form));
    router.push('/auth/select-apps');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-12 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-10">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-6xl mx-auto">
        {/* Header - Full width */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-right">Create your account</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-right">Step 1 of 4</p>
          </div>
        </div>

        {/* Progress - Full width */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}>
                {step}
              </div>
              <div className={`flex-1 h-1 rounded ${step < 4 ? 'bg-gray-200 dark:bg-gray-800' : 'bg-transparent'}`} />
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left side - Form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">First Name *</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Last Name *</label>
                  <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone (optional)</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 700 000 000" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password *</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Name *</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Acme Ltd" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white" />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleNext} 
                disabled={checkingEmail}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {checkingEmail ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Checking email...
                  </>
                ) : (
                  <>
                    Next: Select Apps
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right side - Info/Features */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
              <h3 className="text-xl font-bold">Why SaMi?</h3>
              <p className="mt-2 text-sm text-blue-100">AI-powered business workspace that brings your apps, data, and AI together.</p>
              <ul className="mt-4 space-y-2 text-sm text-blue-100">
                <li>✓ Isolated database per workspace</li>
                <li>✓ Multi-company support</li>
                <li>✓ AI respects your permissions</li>
                <li>✓ 35+ business apps</li>
              </ul>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">What happens next?</h4>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p><strong className="text-gray-900 dark:text-white">Step 2:</strong> Select your apps</p>
                <p><strong className="text-gray-900 dark:text-white">Step 3:</strong> Review Terms & Privacy</p>
                <p><strong className="text-gray-900 dark:text-white">Step 4:</strong> Choose your plan</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          Already have an account? <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Sign in</Link>
        </p>
      </div>

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mx-auto ${overlay.type === 'error' ? 'bg-red-100 dark:bg-red-900/20' : 'bg-yellow-100 dark:bg-yellow-900/20'}`}>
              <AlertTriangle size={28} className={overlay.type === 'error' ? 'text-red-600' : 'text-yellow-600'} />
            </div>
            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>
            <button onClick={() => setOverlay(null)} className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}