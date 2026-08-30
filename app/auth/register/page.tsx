'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  Moon,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Phone,
  Building2,
  User,
  ShieldCheck,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type OverlayType = 'error' | 'warning' | 'success';

type OverlayState = {
  type: OverlayType;
  title: string;
  message: string;
};

export default function RegisterPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    businessName: '',
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

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

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const markTouched = (field: keyof typeof form) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const getFieldError = (field: keyof typeof form): string | null => {
    if (!touched[field]) return null;

    const value = form[field].trim();

    if (field === 'firstName' && !value) return 'First name is required.';
    if (field === 'lastName' && !value) return 'Last name is required.';

    if (field === 'email') {
      if (!value) return 'Email is required.';
      if (!emailRegex.test(value)) return 'Enter a valid email address.';
    }

    if (field === 'password') {
      if (!value) return 'Password is required.';
      if (value.length < 8) return 'Password must contain at least 8 characters.';
    }

    if (field === 'businessName' && !value) return 'Business name is required.';

    return null;
  };

  const validateForm = () => {
    const requiredFields: Array<keyof typeof form> = ['firstName', 'lastName', 'email', 'password', 'businessName'];

    const nextTouched: Record<string, boolean> = {};
    requiredFields.forEach((field) => { nextTouched[field] = true; });
    setTouched(nextTouched);

    if (!form.firstName.trim()) return 'Please enter your first name.';
    if (!form.lastName.trim()) return 'Please enter your last name.';
    if (!emailRegex.test(form.email.trim())) return 'Please enter a valid email address.';
    if (form.password.length < 8) return 'Your password must contain at least 8 characters.';
    if (!form.businessName.trim()) return 'Please enter your business name.';

    return null;
  };

  const handleNext = async () => {
    const validationError = validateForm();

    if (validationError) {
      setOverlay({ type: 'error', title: 'Check your information', message: validationError });
      return;
    }

    setCheckingEmail(true);

    try {
      const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(form.email.trim())}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error('Email check failed');

      const data = await response.json();

      if (data.exists) {
        setOverlay({
          type: 'warning',
          title: 'Account already exists',
          message: 'This email is already registered. You can sign in instead.',
        });
        setCheckingEmail(false);
        return;
      }

      sessionStorage.setItem('sami_account_form', JSON.stringify(form));
      router.push('/auth/select-apps');
    } catch {
      setOverlay({
        type: 'error',
        title: 'Something went wrong',
        message: 'We could not verify your email right now. Please try again.',
      });
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    window.location.href = '/api/auth/google';
  };

  const inputBase =
    'w-full h-[46px] rounded-lg border bg-white dark:bg-gray-900 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3.5 outline-none transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500';

  const normalBorder = 'border-gray-300 dark:border-gray-700';
  const errorBorder = 'border-red-400 dark:border-red-500';

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
      >
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            {/* Brand */}
            <div className="mb-7">
              <Link href="/" className="inline-flex flex-col items-start">
                <SaMiLogo size="lg" />
                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
                  AI-powered business workspace
                </span>
              </Link>
            </div>

            {/* Header */}
            <div className="mb-7">
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                Create your account
              </h1>
              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                Create your SaMi workspace and start managing your business in one place.
              </p>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || checkingEmail}
              className="relative w-full h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-medium text-[14px] flex items-center justify-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.995] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {googleLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.35 12.27c0-.77-.07-1.52-.2-2.24H12v4.24h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.39z" />
                  <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.34l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7z" />
                  <path fill="#FBBC05" d="M6.54 13.8A5.86 5.86 0 0 1 6.23 12c0-.63.11-1.24.31-1.8V7.67H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.33l3.24-2.53z" />
                  <path fill="#EA4335" d="M12 6.17c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.83 3.28 14.62 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.37l3.24 2.53C7.31 7.89 9.46 6.17 12 6.17z" />
                </svg>
              )}
              <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-7">
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
              <span className="text-[12px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">or</span>
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
            </div>

            {/* Form */}
            <div className="space-y-5">
              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">First name</label>
                  <div className="relative">
                    <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      onBlur={() => markTouched('firstName')}
                      placeholder="John"
                      className={`${inputBase} pl-10 ${getFieldError('firstName') ? errorBorder : normalBorder}`}
                    />
                  </div>
                  {getFieldError('firstName') && <p className="mt-1 text-[11px] text-red-500">{getFieldError('firstName')}</p>}
                </div>

                <div>
                  <label htmlFor="lastName" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">Last name</label>
                  <div className="relative">
                    <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      onBlur={() => markTouched('lastName')}
                      placeholder="Doe"
                      className={`${inputBase} pl-10 ${getFieldError('lastName') ? errorBorder : normalBorder}`}
                    />
                  </div>
                  {getFieldError('lastName') && <p className="mt-1 text-[11px] text-red-500">{getFieldError('lastName')}</p>}
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">Email address</label>
                <div className="relative">
                  <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    onBlur={() => markTouched('email')}
                    placeholder="john@company.com"
                    className={`${inputBase} pl-10 ${getFieldError('email') ? errorBorder : normalBorder}`}
                  />
                </div>
                {getFieldError('email') && <p className="mt-1 text-[11px] text-red-500">{getFieldError('email')}</p>}
              </div>

              {/* Phone + Business */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">
                    Phone <span className="font-normal text-gray-400">optional</span>
                  </label>
                  <div className="relative">
                    <Phone size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="+254 700 000 000"
                      className={`${inputBase} pl-10 ${normalBorder}`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="businessName" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">Business name</label>
                  <div className="relative">
                    <Building2 size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="businessName"
                      type="text"
                      autoComplete="organization"
                      value={form.businessName}
                      onChange={(e) => updateField('businessName', e.target.value)}
                      onBlur={() => markTouched('businessName')}
                      placeholder="Acme Ltd"
                      className={`${inputBase} pl-10 ${getFieldError('businessName') ? errorBorder : normalBorder}`}
                    />
                  </div>
                  {getFieldError('businessName') && <p className="mt-1 text-[11px] text-red-500">{getFieldError('businessName')}</p>}
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block mb-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">Password</label>
                <div className="relative">
                  <ShieldCheck size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    onBlur={() => markTouched('password')}
                    placeholder="At least 8 characters"
                    className={`${inputBase} pl-10 pr-11 ${getFieldError('password') ? errorBorder : normalBorder}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {getFieldError('password') && <p className="mt-1 text-[11px] text-red-500">{getFieldError('password')}</p>}
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">Use at least 8 characters. A strong password is recommended.</p>
              </div>
            </div>

            {/* Bottom action */}
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-5">
              <p className="hidden sm:block max-w-[380px] text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                By continuing, you agree to SaMi's terms and acknowledge our privacy policy.
              </p>
              <button
                type="button"
                onClick={handleNext}
                disabled={checkingEmail || googleLoading}
                className="ml-auto min-w-[145px] h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {checkingEmail ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Bottom links */}
        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/help" className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">Terms</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">Privacy</Link>
        </div>
      </div>

      {/* Overlay */}
      {overlay && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setOverlay(null)}>
          <div className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOverlay(null)} className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={17} />
            </button>

            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              overlay.type === 'error' ? 'bg-red-100 dark:bg-red-950/40' 
              : overlay.type === 'warning' ? 'bg-yellow-100 dark:bg-yellow-950/40'
              : 'bg-green-100 dark:bg-green-950/40'
            }`}>
              {overlay.type === 'success' ? <CheckCircle2 size={25} className="text-green-600" /> : <AlertTriangle size={25} className={overlay.type === 'error' ? 'text-red-600' : 'text-yellow-600'} />}
            </div>

            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">{overlay.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">{overlay.message}</p>

            <button type="button" onClick={() => setOverlay(null)} className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition">
              Continue
            </button>
          </div>
        </div>
      )}
    </main>
  );
}