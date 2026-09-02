'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sun,
  Moon,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Crown,
  Sparkles,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type PlanKey = 'free' | 'standard' | 'custom';

type OverlayState = {
  type: 'error' | 'success' | 'payment';
  title: string;
  message: string;
  redirectUrl?: string;
};

const PLANS: Array<{
  key: PlanKey;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
}> = [
  {
    key: 'free',
    name: 'Free',
    price: 'Free',
    period: 'forever',
    description: 'Perfect for getting started',
    features: [
      '1 app only',
      'Unlimited users',
      '100 AI queries/month',
      'Basic support',
    ],
  },
  {
    key: 'standard',
    name: 'Standard',
    price: 'KES 2,000',
    period: '/month',
    description: 'For growing businesses',
    features: [
      'All apps included',
      'Per user pricing',
      '1,000 AI queries/month',
      '15-day free trial',
      'Priority support',
    ],
  },
  {
    key: 'custom',
    name: 'Custom',
    price: 'KES 3,340',
    period: '/month',
    description: 'For enterprises',
    features: [
      'All apps + custom',
      'Unlimited AI queries',
      'Dedicated support',
      'Custom integrations',
      'SLA',
    ],
  },
];

export default function SelectPlanPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('free');
  const [loading, setLoading] = useState(false);
  const [selectedAppCount, setSelectedAppCount] = useState(0);

  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    try {
      const storedApps = sessionStorage.getItem('sami_selected_apps');
      const selectedApps = storedApps ? JSON.parse(storedApps) : [];

      if (Array.isArray(selectedApps)) {
        setSelectedAppCount(selectedApps.length);

        if (selectedApps.length > 1) {
          setSelectedPlan('standard');
        }
      }
    } catch (error) {
      console.error('Failed to read selected apps:', error);
      setSelectedAppCount(0);
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle('dark', next);

    localStorage.setItem(
      'sami_theme',
      next ? 'dark' : 'light'
    );
  };

  const getPlanCardClass = (
    plan: (typeof PLANS)[number],
    isSelected: boolean,
    isDisabled: boolean
  ) => {
    if (isDisabled) {
      return [
        'relative p-5 rounded-xl border-2 text-left transition-all',
        'border-gray-200 dark:border-gray-700',
        'opacity-50 cursor-not-allowed',
      ].join(' ');
    }

    if (isSelected) {
      if (plan.key === 'standard') {
        return [
          'relative p-5 rounded-xl border-2 text-left transition-all',
          'border-blue-600',
          'bg-blue-50 dark:bg-blue-900/20',
          'shadow-sm',
        ].join(' ');
      }

      if (plan.key === 'custom') {
        return [
          'relative p-5 rounded-xl border-2 text-left transition-all',
          'border-purple-600',
          'bg-purple-50 dark:bg-purple-900/20',
          'shadow-sm',
        ].join(' ');
      }

      return [
        'relative p-5 rounded-xl border-2 text-left transition-all',
        'border-gray-600',
        'bg-gray-50 dark:bg-gray-800/60',
        'shadow-sm',
      ].join(' ');
    }

    return [
      'relative p-5 rounded-xl border-2 text-left transition-all',
      'border-gray-200 dark:border-gray-700',
      'hover:border-gray-300 dark:hover:border-gray-600',
      'hover:bg-gray-50 dark:hover:bg-gray-800/50',
      'cursor-pointer',
    ].join(' ');
  };

  const getPlanIcon = (planKey: PlanKey) => {
    if (planKey === 'free') {
      return (
        <Sparkles
          size={18}
          className="text-gray-500 dark:text-gray-400"
        />
      );
    }

    if (planKey === 'standard') {
      return (
        <Crown
          size={18}
          className="text-blue-600"
        />
      );
    }

    return (
      <Crown
        size={18}
        className="text-purple-600"
      />
    );
  };

  const handleCreateAccount = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const storedAccount =
        sessionStorage.getItem('sami_account_form');

      const storedApps =
        sessionStorage.getItem('sami_selected_apps');

      const accountForm = storedAccount
        ? JSON.parse(storedAccount)
        : null;

      const selectedApps = storedApps
        ? JSON.parse(storedApps)
        : [];

      if (!accountForm || !accountForm.email) {
        setOverlay({
          type: 'error',
          title: 'Registration information missing',
          message:
            'Your registration session has expired or is incomplete. Please return to the registration page and start again.',
        });

        setLoading(false);
        return;
      }

      if (!Array.isArray(selectedApps) || selectedApps.length === 0) {
        setOverlay({
          type: 'error',
          title: 'No apps selected',
          message:
            'Please go back and select at least one app before creating your account.',
        });

        setLoading(false);
        return;
      }

      const finalPlan: PlanKey =
        selectedApps.length > 1
          ? 'standard'
          : selectedPlan;

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...accountForm,
          plan: finalPlan,
          selectedApps,
        }),
      });

      let data: any = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        setOverlay({
          type: 'error',
          title: 'Registration Failed',
          message:
            data?.error ||
            'We could not create your account. Please try again.',
        });

        setLoading(false);
        return;
      }

      /*
       * ==========================================================
       * PAID PLAN - Redirect to PesaPal immediately
       * ==========================================================
       */
      if (data?.requiresPayment && data?.pesapalOrder?.redirectUrl) {
        // Store email for later verification (after payment)
        sessionStorage.setItem('sami_verification_email', accountForm.email);

        setOverlay({
          type: 'payment',
          title: 'Complete Payment',
          message: `Your 15-day free trial is ready. Complete payment to activate your workspace.`,
          redirectUrl: data.pesapalOrder.redirectUrl,
        });

        setLoading(false);
        return;
      }

      /*
       * ==========================================================
       * FREE PLAN - Go to verify email
       * ==========================================================
       */
      if (data?.success) {
        const verificationEmail =
          accountForm.email.toLowerCase().trim();

        sessionStorage.setItem(
          'sami_verification_email',
          verificationEmail
        );

        setOverlay({
          type: 'success',
          title: 'Account created',
          message: `We've sent a verification code to ${verificationEmail}. Please check your inbox to activate your account.`,
        });

        setLoading(false);

        setTimeout(() => {
          router.push('/auth/verify-email');
        }, 1800);

        return;
      }

      setOverlay({
        type: 'error',
        title: 'Registration incomplete',
        message:
          data?.message ||
          'Your account could not be completed. Please try again.',
      });

      setLoading(false);
    } catch (error) {
      console.error(
        'Create account error:',
        error
      );

      setOverlay({
        type: 'error',
        title: 'Something went wrong',
        message:
          'We could not create your account right now. Please check your connection and try again.',
      });

      setLoading(false);
    }
  };

  const closeOverlay = () => {
    setOverlay(null);
  };

  const handleOverlayAction = () => {
    if (
      overlay?.type === 'payment' &&
      overlay.redirectUrl
    ) {
      window.location.href =
        overlay.redirectUrl;

      return;
    }

    setOverlay(null);
  };

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
      >
        {darkMode ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </button>

      <div className="w-full max-w-[880px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            {/* Brand */}
            <div className="mb-7">
              <Link
                href="/"
                className="inline-flex flex-col items-start"
              >
                <SaMiLogo size="lg" />

                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
                  AI-powered business workspace
                </span>
              </Link>
            </div>

            {/* Header */}
            <div className="mb-7">
              <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                Choose your plan
              </h1>

              <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                Step 3 of 3: You selected{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {selectedAppCount}
                </span>{' '}
                app
                {selectedAppCount !== 1
                  ? 's'
                  : ''}
                {selectedAppCount > 1 && (
                  <>
                    {' '}
                    — Free plan is not available
                    for multiple apps
                  </>
                )}
              </p>
            </div>

            {/* Plans */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {PLANS.map((plan) => {
                const isDisabled =
                  plan.key === 'free' &&
                  selectedAppCount > 1;

                const isSelected =
                  selectedPlan === plan.key;

                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedPlan(
                          plan.key
                        );
                      }
                    }}
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    className={getPlanCardClass(
                      plan,
                      isSelected,
                      isDisabled
                    )}
                  >
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check
                          size={12}
                          className="text-white"
                        />
                      </div>
                    )}

                    {/* Popular badge */}
                    {plan.key ===
                      'standard' && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                        Most Popular
                      </div>
                    )}

                    {/* Plan title */}
                    <div className="flex items-center gap-2 mb-2">
                      {getPlanIcon(
                        plan.key
                      )}

                      <span className="font-semibold text-gray-900 dark:text-white">
                        {plan.name}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="mb-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {plan.price}
                      </span>

                      <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                        {plan.period}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {plan.description}
                    </p>

                    {/* Features */}
                    <ul className="space-y-1.5">
                      {plan.features.map(
                        (feature, index) => (
                          <li
                            key={`${plan.key}-${index}`}
                            className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                          >
                            <Check
                              size={12}
                              className="text-blue-600 mt-0.5 flex-shrink-0"
                            />

                            <span>
                              {feature}
                            </span>
                          </li>
                        )
                      )}
                    </ul>

                    {/* Disabled Free plan */}
                    {isDisabled && (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                        Free plan supports only
                        one app.
                      </p>
                    )}

                    {/* Auto-selected Standard */}
                    {plan.key ===
                      'standard' &&
                      selectedAppCount > 1 && (
                        <div className="mt-3 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                          Standard is required
                          for{' '}
                          {selectedAppCount}{' '}
                          apps
                        </div>
                      )}
                  </button>
                );
              })}
            </div>

            {/* Bottom actions */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {selectedAppCount > 1 ? (
                  <span>
                    Standard plan required for
                    multiple apps.
                  </span>
                ) : selectedPlan ===
                  'free' ? (
                  <span>
                    Free plan — no payment
                    required.
                  </span>
                ) : (
                  <span>
                    Your selected plan includes
                    a 15-day free trial.
                  </span>
                )}
              </div>

              <div className="flex gap-3 sm:flex-shrink-0">
                {/* Back */}
                <button
                  type="button"
                  onClick={() =>
                    router.back()
                  }
                  disabled={loading}
                  className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft size={15} />

                  Back
                </button>

                {/* Continue */}
                <button
                  type="button"
                  onClick={
                    handleCreateAccount
                  }
                  disabled={loading}
                  className="h-[44px] px-6 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2
                        size={15}
                        className="animate-spin"
                      />

                      Processing...
                    </>
                  ) : (
                    <>
                      {selectedPlan ===
                        'free' &&
                      selectedAppCount <=
                        1
                        ? 'Create Account'
                        : 'Proceed to Payment'}

                      <ArrowRight
                        size={15}
                      />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer links */}
        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link
            href="/auth/login"
            className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            Sign In
          </Link>

          <Link
            href="/help"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Help
          </Link>

          <Link
            href="/auth/terms"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Terms
          </Link>

          <Link
            href="/auth/privacy"
            className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            Privacy
          </Link>
        </div>
      </div>

      {/* Overlay */}
      {overlay && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={closeOverlay}
        >
          <div
            className="w-full max-w-[390px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* Close */}
            <button
              type="button"
              onClick={closeOverlay}
              aria-label="Close"
              className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X size={17} />
            </button>

            {/* Icon */}
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                overlay.type === 'error'
                  ? 'bg-red-100 dark:bg-red-950/40'
                  : overlay.type ===
                      'payment'
                    ? 'bg-yellow-100 dark:bg-yellow-950/40'
                    : 'bg-green-100 dark:bg-green-950/40'
              }`}
            >
              {overlay.type ===
              'payment' ? (
                <AlertTriangle
                  size={25}
                  className="text-yellow-600"
                />
              ) : overlay.type ===
                'error' ? (
                <AlertTriangle
                  size={25}
                  className="text-red-600"
                />
              ) : (
                <Check
                  size={25}
                  className="text-green-600"
                />
              )}
            </div>

            {/* Title */}
            <h2 className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white">
              {overlay.title}
            </h2>

            {/* Message */}
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              {overlay.message}
            </p>

            {/* Payment action */}
            {overlay.type ===
              'payment' &&
              overlay.redirectUrl && (
                <button
                  type="button"
                  onClick={
                    handleOverlayAction
                  }
                  className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition flex items-center justify-center gap-2"
                >
                  Go to PesaPal

                  <ArrowRight
                    size={15}
                  />
                </button>
              )}

            {/* Normal action */}
            {overlay.type !==
              'payment' && (
              <button
                type="button"
                onClick={
                  handleOverlayAction
                }
                className="mt-6 w-full h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}