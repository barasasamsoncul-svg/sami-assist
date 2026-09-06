
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  ShieldCheck,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ACCOUNT_STORAGE_KEY =
  'sami_account_form';

const APPS_STORAGE_KEY =
  'sami_selected_apps';

const VERIFICATION_EMAIL_STORAGE_KEY =
  'sami_verification_email';

const THEME_STORAGE_KEY =
  'sami_theme';

const REGISTER_ENDPOINT =
  '/api/auth/register';

const VERIFY_EMAIL_ROUTE =
  '/verify-email';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type PlanKey =
  | 'free'
  | 'standard'
  | 'custom';

type OverlayType =
  | 'error'
  | 'success'
  | 'payment';

type OverlayState = {
  type: OverlayType;
  title: string;
  message: string;
  redirectUrl?: string;
};

type PlanDefinition = {
  key: PlanKey;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
};

/* -------------------------------------------------------------------------- */
/* Plans                                                                      */
/* -------------------------------------------------------------------------- */

const PLANS: PlanDefinition[] = [
  {
    key: 'free',
    name: 'Free',
    price: 'Free',
    period: 'forever',
    description:
      'Perfect for getting started',
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
    description:
      'For growing businesses',
    features: [
      'All apps included',
      'Per-user pricing',
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
    description:
      'For enterprises',
    features: [
      'All apps + custom',
      'Unlimited AI queries',
      'Dedicated support',
      'Custom integrations',
      'SLA',
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isPlanKey(
  value: unknown
): value is PlanKey {
  return (
    value === 'free' ||
    value === 'standard' ||
    value === 'custom'
  );
}

function readSelectedApps(): string[] {
  if (
    typeof window === 'undefined'
  ) {
    return [];
  }

  try {
    const raw =
      sessionStorage.getItem(
        APPS_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return [
      ...new Set(
        parsed.filter(
          (
            value
          ): value is string =>
            typeof value ===
            'string' &&
            value.trim()
              .length > 0
        )
      ),
    ];
  } catch {
    return [];
  }
}

function readAccountForm(): Record<
  string,
  unknown
> | null {
  if (
    typeof window === 'undefined'
  ) {
    return null;
  }

  try {
    const raw =
      sessionStorage.getItem(
        ACCOUNT_STORAGE_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function SelectPlanPage() {
  const router = useRouter();

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<PlanKey>(
    'free'
  );

  const [
    selectedAppCount,
    setSelectedAppCount,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    overlay,
    setOverlay,
  ] = useState<
    OverlayState | null
  >(null);

  /* ------------------------------------------------------------------------ */
  /* Theme                                                                    */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    try {
      const savedTheme =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const prefersDark =
        window.matchMedia(
          '(prefers-color-scheme: dark)'
        ).matches;

      const shouldUseDark =
        savedTheme === 'dark' ||
        (
          savedTheme !== 'light' &&
          prefersDark
        );

      setDarkMode(
        shouldUseDark
      );

      document.documentElement.classList.toggle(
        'dark',
        shouldUseDark
      );
    } catch {
      // Ignore theme storage errors.
    }
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Restore onboarding state                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const apps =
      readSelectedApps();

    setSelectedAppCount(
      apps.length
    );

    /*
     * A free plan supports only one app.
     *
     * If the user previously had Free selected
     * and now has multiple apps, move the UI to
     * Standard.
     *
     * The server remains authoritative.
     */
    if (
      apps.length > 1
    ) {
      setSelectedPlan(
        'standard'
      );
    }
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Theme toggle                                                             */
  /* ------------------------------------------------------------------------ */

  const toggleTheme =
    useCallback(() => {
      setDarkMode(
        (current) => {
          const next =
            !current;

          document.documentElement.classList.toggle(
            'dark',
            next
          );

          try {
            localStorage.setItem(
              THEME_STORAGE_KEY,
              next
                ? 'dark'
                : 'light'
            );
          } catch {
            // Ignore storage errors.
          }

          return next;
        }
      );
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Derived state                                                            */
  /* ------------------------------------------------------------------------ */

  const multipleApps =
    selectedAppCount > 1;

  const freeDisabled =
    multipleApps;

  const effectivePlan =
    multipleApps
      ? 'standard'
      : selectedPlan;

  const effectivePlanDefinition =
    useMemo(
      () =>
        PLANS.find(
          (plan) =>
            plan.key ===
            effectivePlan
        ) ??
        PLANS[0],
      [effectivePlan]
    );

  /* ------------------------------------------------------------------------ */
  /* Plan selection                                                           */
  /* ------------------------------------------------------------------------ */

  const selectPlan =
    useCallback(
      (plan: PlanKey) => {
        if (loading) {
          return;
        }

        if (
          plan === 'free' &&
          multipleApps
        ) {
          return;
        }

        setSelectedPlan(
          plan
        );
      },
      [
        loading,
        multipleApps,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Plan card styles                                                         */
  /* ------------------------------------------------------------------------ */

  const getPlanCardClass =
    useCallback(
      (
        plan: PlanDefinition,
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
          if (
            plan.key ===
            'standard'
          ) {
            return [
              'relative p-5 rounded-xl border-2 text-left transition-all',
              'border-blue-600 bg-blue-50 dark:bg-blue-900/20',
              'shadow-lg shadow-blue-500/10 scale-[1.02]',
            ].join(' ');
          }

          if (
            plan.key ===
            'custom'
          ) {
            return [
              'relative p-5 rounded-xl border-2 text-left transition-all',
              'border-purple-600 bg-purple-50 dark:bg-purple-900/20',
              'shadow-lg shadow-purple-500/10 scale-[1.02]',
            ].join(' ');
          }

          return [
            'relative p-5 rounded-xl border-2 text-left transition-all',
            'border-gray-600 bg-gray-50 dark:bg-gray-800/60',
            'shadow-lg scale-[1.02]',
          ].join(' ');
        }

        return [
          'relative p-5 rounded-xl border-2 text-left transition-all',
          'border-gray-200 dark:border-gray-700',
          'hover:border-gray-300 dark:hover:border-gray-600',
          'hover:bg-gray-50 dark:hover:bg-gray-800/50',
          'hover:shadow-lg hover:-translate-y-0.5',
          'cursor-pointer',
        ].join(' ');
      },
      []
    );

  /* ------------------------------------------------------------------------ */
  /* Plan icon                                                                */
  /* ------------------------------------------------------------------------ */

  const getPlanIcon =
    useCallback(
      (planKey: PlanKey) => {
        if (
          planKey ===
          'free'
        ) {
          return (
            <Sparkles
              size={18}
              className="text-gray-500 dark:text-gray-400"
            />
          );
        }

        if (
          planKey ===
          'standard'
        ) {
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
      },
      []
    );

  /* ------------------------------------------------------------------------ */
  /* Create account                                                           */
  /* ------------------------------------------------------------------------ */

  const handleCreateAccount =
    useCallback(async () => {
      if (loading) {
        return;
      }

      setLoading(true);

      try {
        const accountForm =
          readAccountForm();

        const selectedApps =
          readSelectedApps();

        /* ------------------------------------------------------------------ */
        /* Validate onboarding state                                          */
        /* ------------------------------------------------------------------ */

        if (
          !accountForm
        ) {
          setOverlay({
            type: 'error',
            title:
              'Registration information missing',
            message:
              'Your registration session has expired or is incomplete. Please return to registration and start again.',
          });

          setLoading(false);
          return;
        }

        const email =
          typeof accountForm.email ===
          'string'
            ? accountForm.email
                .trim()
                .toLowerCase()
            : '';

        if (!email) {
          setOverlay({
            type: 'error',
            title:
              'Email address missing',
            message:
              'We could not find the email address from your registration. Please return to registration and try again.',
          });

          setLoading(false);
          return;
        }

        if (
          selectedApps.length ===
          0
        ) {
          setOverlay({
            type: 'error',
            title:
              'No apps selected',
            message:
              'Please go back and select at least one app before creating your account.',
          });

          setLoading(false);
          return;
        }

        /* ------------------------------------------------------------------ */
        /* Determine plan                                                     */
        /* ------------------------------------------------------------------ */

        /*
         * This is only the client's intended plan.
         *
         * /api/auth/register MUST validate this again
         * against the Control DB and the available
         * module/plan configuration.
         */
        const finalPlan: PlanKey =
          selectedApps.length >
          1
            ? 'standard'
            : selectedPlan;

        if (
          !isPlanKey(
            finalPlan
          )
        ) {
          setOverlay({
            type: 'error',
            title:
              'Invalid plan',
            message:
              'The selected plan is not valid. Please choose a plan and try again.',
          });

          setLoading(false);
          return;
        }

        /* ------------------------------------------------------------------ */
        /* Build request                                                       */
        /* ------------------------------------------------------------------ */

        const payload = {
          ...accountForm,
          email,
          plan: finalPlan,
          selectedApps,
        };

        const response =
          await fetch(
            REGISTER_ENDPOINT,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Accept:
                  'application/json',
              },
              body: JSON.stringify(
                payload
              ),
              cache: 'no-store',
            }
          );

        let data:
          | Record<
              string,
              any
            >
          | null = null;

        try {
          data =
            await response.json();
        } catch {
          data = null;
        }

        /* ------------------------------------------------------------------ */
        /* Server error                                                        */
        /* ------------------------------------------------------------------ */

        if (
          !response.ok
        ) {
          setOverlay({
            type: 'error',
            title:
              'Registration Failed',
            message:
              data?.error ??
              data?.message ??
              'We could not create your account. Please try again.',
          });

          setLoading(false);
          return;
        }

        /* ------------------------------------------------------------------ */
        /* Payment required                                                    */
        /* ------------------------------------------------------------------ */

        if (
          data?.requiresPayment &&
          data?.pesapalOrder
            ?.redirectUrl
        ) {
          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              email
            );
          } catch {
            /*
             * Payment redirect can still proceed.
             * The server should retain the relevant
             * registration/payment state.
             */
          }

          setOverlay({
            type: 'payment',
            title:
              'Complete Payment',
            message:
              data?.message ??
              'Your workspace is ready. Complete payment to continue.',
            redirectUrl:
              data.pesapalOrder
                .redirectUrl,
          });

          setLoading(false);
          return;
        }

        /* ------------------------------------------------------------------ */
        /* Successful free registration                                       */
        /* ------------------------------------------------------------------ */

        if (
          data?.success
        ) {
          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              email
            );
          } catch {
            // Ignore storage errors.
          }

          setOverlay({
            type: 'success',
            title:
              'Account created',
            message:
              data?.message ??
              `We've sent a verification code to ${email}. Please check your inbox to activate your account.`,
          });

          setLoading(false);

          /*
           * Give the success state enough time
           * to be visible before navigating.
           */
          window.setTimeout(
            () => {
              router.push(
                VERIFY_EMAIL_ROUTE
              );
            },
            1400
          );

          return;
        }

        /* ------------------------------------------------------------------ */
        /* Unexpected response                                                 */
        /* ------------------------------------------------------------------ */

        setOverlay({
          type: 'error',
          title:
            'Registration incomplete',
          message:
            data?.message ??
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
          title:
            'Something went wrong',
          message:
            'We could not create your account right now. Please check your connection and try again.',
        });

        setLoading(false);
      }
    }, [
      loading,
      selectedPlan,
      router,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Back                                                                     */
  /* ------------------------------------------------------------------------ */

  const handleBack =
    useCallback(() => {
      if (loading) {
        return;
      }

      router.back();
    }, [
      loading,
      router,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Overlay                                                                  */
  /* ------------------------------------------------------------------------ */

  const closeOverlay =
    useCallback(() => {
      if (
        overlay?.type ===
        'payment'
      ) {
        return;
      }

      setOverlay(null);
    }, [overlay]);

  const handleOverlayAction =
    useCallback(() => {
      if (
        overlay?.type ===
          'payment' &&
        overlay.redirectUrl
      ) {
        window.location.assign(
          overlay.redirectUrl
        );

        return;
      }

      setOverlay(null);
    }, [overlay]);

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">

      {/* ================================================================== */}
      {/* Theme toggle                                                       */}
      {/* ================================================================== */}

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={
          darkMode
            ? 'Switch to light mode'
            : 'Switch to dark mode'
        }
        className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
      >
        {darkMode ? (
          <Sun
            size={18}
          />
        ) : (
          <Moon
            size={18}
          />
        )}
      </button>

      {/* ================================================================== */}
      {/* Page container                                                      */}
      {/* ================================================================== */}

      <div className="w-full max-w-[920px] mx-auto">

        {/* ================================================================= */}
        {/* Main card                                                         */}
        {/* ================================================================= */}

        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">

          <div className="px-7 py-8 sm:px-10 sm:py-9">

            {/* ============================================================= */}
            {/* Brand                                                         */}
            {/* ============================================================= */}

            <div className="mb-7">

              <Link
                href="/"
                className="inline-flex flex-col items-start"
              >
                <SaMiLogo
                  size="lg"
                />

                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
                  AI-powered business
                  workspace
                </span>
              </Link>

            </div>

            {/* ============================================================= */}
            {/* Header                                                        */}
            {/* ============================================================= */}

            <div className="mb-7">

              <div className="flex items-start justify-between gap-5">

                <div>

                  <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
                    Choose your plan
                  </h1>

                  <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400">
                    Choose the plan that
                    fits your business.
                  </p>

                </div>

                <div className="hidden sm:flex h-9 px-3 rounded-full items-center justify-center bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 flex-shrink-0">

                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    Step 3 of 3
                  </span>

                </div>

              </div>

              {/* Mobile step */}

              <div className="mt-4 sm:hidden">

                <span className="inline-flex h-7 px-3 items-center rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  Step 3 of 3
                </span>

              </div>

            </div>

            {/* ============================================================= */}
            {/* Selected apps information                                     */}
            {/* ============================================================= */}

            <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">

              <div className="flex items-center justify-between gap-4">

                <div>

                  <p className="text-[12px] font-semibold text-gray-900 dark:text-white">
                    Your workspace
                  </p>

                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {
                      selectedAppCount
                    }{' '}
                    app
                    {
                      selectedAppCount !==
                      1
                        ? 's'
                        : ''
                    }{' '}
                    selected
                  </p>

                </div>

                <button
                  type="button"
                  onClick={
                    handleBack
                  }
                  disabled={
                    loading
                  }
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition disabled:opacity-50"
                >
                  Change apps
                </button>

              </div>

            </div>

            {/* ============================================================= */}
            {/* Multi-app notice                                               */}
            {/* ============================================================= */}

            {multipleApps && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">

                <div className="mt-0.5 flex-shrink-0">

                  <ShieldCheck
                    size={17}
                    className="text-blue-600 dark:text-blue-400"
                  />

                </div>

                <div>

                  <p className="text-[12px] font-semibold text-blue-800 dark:text-blue-300">
                    Standard plan required
                  </p>

                  <p className="mt-1 text-[11px] leading-relaxed text-blue-700 dark:text-blue-400">
                    You selected{' '}
                    {
                      selectedAppCount
                    }{' '}
                    apps. The Free plan
                    supports one app only,
                    so Standard is required
                    for this workspace.
                  </p>

                </div>

              </div>
            )}

            {/* ============================================================= */}
            {/* Plans                                                         */}
            {/* ============================================================= */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

              {PLANS.map(
                (plan) => {
                  const isDisabled =
                    plan.key ===
                      'free' &&
                    freeDisabled;

                  const isSelected =
                    effectivePlan ===
                    plan.key;

                  return (
                    <button
                      key={
                        plan.key
                      }
                      type="button"
                      onClick={() =>
                        selectPlan(
                          plan.key
                        )
                      }
                      disabled={
                        isDisabled ||
                        loading
                      }
                      aria-pressed={
                        isSelected
                      }
                      aria-label={`${
                        isSelected
                          ? 'Selected'
                          : 'Select'
                      } ${plan.name} plan`}
                      className={getPlanCardClass(
                        plan,
                        isSelected,
                        isDisabled
                      )}
                    >

                      {/* -------------------------------------------------- */}
                      {/* Popular badge                                       */}
                      {/* -------------------------------------------------- */}

                      {plan.key ===
                        'standard' && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shadow-md shadow-blue-500/30">
                          Most Popular
                        </div>
                      )}

                      {/* -------------------------------------------------- */}
                      {/* Selected indicator                                  */}
                      {/* -------------------------------------------------- */}

                      {isSelected && (
                        <div
                          className={`absolute top-3 right-3 h-6 w-6 rounded-full flex items-center justify-center shadow-md ${
                            plan.key ===
                            'custom'
                              ? 'bg-purple-600 shadow-purple-500/30'
                              : 'bg-blue-600 shadow-blue-500/30'
                          }`}
                        >
                          <Check
                            size={
                              14
                            }
                            strokeWidth={
                              3
                            }
                            className="text-white"
                          />
                        </div>
                      )}

                      {/* -------------------------------------------------- */}
                      {/* Plan heading                                        */}
                      {/* -------------------------------------------------- */}

                      <div className="flex items-center gap-2 mb-2">

                        {getPlanIcon(
                          plan.key
                        )}

                        <span className="font-semibold text-gray-900 dark:text-white">
                          {
                            plan.name
                          }
                        </span>

                      </div>

                      {/* -------------------------------------------------- */}
                      {/* Price                                                */}
                      {/* -------------------------------------------------- */}

                      <div className="mb-2">

                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                          {
                            plan.price
                          }
                        </span>

                        <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                          {
                            plan.period
                          }
                        </span>

                      </div>

                      {/* -------------------------------------------------- */}
                      {/* Description                                          */}
                      {/* -------------------------------------------------- */}

                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        {
                          plan.description
                        }
                      </p>

                      {/* -------------------------------------------------- */}
                      {/* Features                                             */}
                      {/* -------------------------------------------------- */}

                      <ul className="space-y-1.5">

                        {plan.features.map(
                          (
                            feature,
                            index
                          ) => (
                            <li
                              key={`${plan.key}-${index}`}
                              className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                            >

                              <Check
                                size={
                                  12
                                }
                                className={`mt-0.5 flex-shrink-0 ${
                                  plan.key ===
                                  'custom'
                                    ? 'text-purple-600'
                                    : 'text-blue-600'
                                }`}
                              />

                              <span>
                                {
                                  feature
                                }
                              </span>

                            </li>
                          )
                        )}

                      </ul>

                      {/* -------------------------------------------------- */}
                      {/* Free disabled                                      */}
                      {/* -------------------------------------------------- */}

                      {isDisabled && (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                          Free supports
                          one app only.
                        </p>
                      )}

                      {/* -------------------------------------------------- */}
                      {/* Required plan                                      */}
                      {/* -------------------------------------------------- */}

                      {plan.key ===
                        'standard' &&
                        multipleApps && (
                          <div className="mt-3 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                            Required for{' '}
                            {
                              selectedAppCount
                            }{' '}
                            apps
                          </div>
                        )}

                    </button>
                  );
                }
              )}

            </div>

            {/* ============================================================= */}
            {/* Current selection summary                                     */}
            {/* ============================================================= */}

            <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#15191e] px-4 py-3">

              <div className="flex items-center justify-between gap-4">

                <div>

                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 dark:text-gray-500">
                    Selected plan
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {
                      effectivePlanDefinition.name
                    }

                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      {
                        effectivePlanDefinition.price
                      }{' '}
                      {
                        effectivePlanDefinition.period
                      }
                    </span>
                  </p>

                </div>

                <div className="text-right">

                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Apps
                  </p>

                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {
                      selectedAppCount
                    }
                  </p>

                </div>

              </div>

            </div>

            {/* ============================================================= */}
            {/* Bottom actions                                                 */}
            {/* ============================================================= */}

            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

              <div className="text-[11px] text-gray-400 dark:text-gray-500 max-w-md">

                {multipleApps ? (
                  <span>
                    Standard plan is required
                    for multiple apps.
                  </span>
                ) : effectivePlan ===
                  'free' ? (
                  <span>
                    Free plan — no payment
                    required.
                  </span>
                ) : (
                  <span>
                    Your selected plan
                    includes a 15-day free
                    trial.
                  </span>
                )}

              </div>

              <div className="flex gap-3 sm:flex-shrink-0">

                {/* Back */}

                <button
                  type="button"
                  onClick={
                    handleBack
                  }
                  disabled={
                    loading
                  }
                  className="h-[44px] px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft
                    size={
                      15
                    }
                  />

                  Back
                </button>

                {/* Continue */}

                <button
                  type="button"
                  onClick={
                    handleCreateAccount
                  }
                  disabled={
                    loading ||
                    selectedAppCount ===
                      0
                  }
                  className="h-[44px] min-w-[180px] px-6 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >

                  {loading ? (
                    <>
                      <Loader2
                        size={
                          15
                        }
                        className="animate-spin"
                      />

                      Processing...
                    </>
                  ) : (
                    <>
                      {effectivePlan ===
                        'free'
                        ? 'Create Account'
                        : 'Start Free Trial'}

                      <ArrowRight
                        size={
                          15
                        }
                      />
                    </>
                  )}

                </button>

              </div>

            </div>

          </div>

        </section>

        {/* ================================================================= */}
        {/* Footer                                                            */}
        {/* ================================================================= */}

        <div className="mt-4 flex flex-wrap justify-end items-center gap-x-5 gap-y-2 px-1">

          <Link
            href="/login"
            className="text-[12px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition"
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

      {/* ================================================================== */}
      {/* Overlay                                                             */}
      {/* ================================================================== */}

      {overlay && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={
            overlay.type ===
            'payment'
              ? undefined
              : closeOverlay
          }
        >

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-overlay-title"
            aria-describedby="registration-overlay-message"
            className="w-full max-w-[400px] bg-white dark:bg-[#15191e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-7 relative"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            {/* ------------------------------------------------------------ */}
            {/* Close                                                         */}
            {/* ------------------------------------------------------------ */}

            {overlay.type !==
              'payment' && (
              <button
                type="button"
                onClick={
                  closeOverlay
                }
                aria-label="Close"
                className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <X
                  size={
                    17
                  }
                />
              </button>
            )}

            {/* ------------------------------------------------------------ */}
            {/* Icon                                                          */}
            {/* ------------------------------------------------------------ */}

            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                overlay.type ===
                'error'
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
                  size={
                    25
                  }
                  className="text-yellow-600 dark:text-yellow-400"
                />
              ) : overlay.type ===
                'error' ? (
                <AlertTriangle
                  size={
                    25
                  }
                  className="text-red-600 dark:text-red-400"
                />
              ) : (
                <Check
                  size={
                    25
                  }
                  className="text-green-600 dark:text-green-400"
                />
              )}

            </div>

            {/* ------------------------------------------------------------ */}
            {/* Title                                                         */}
            {/* ------------------------------------------------------------ */}

            <h2
              id="registration-overlay-title"
              className="mt-4 text-[19px] font-semibold text-gray-900 dark:text-white"
            >
              {
                overlay.title
              }
            </h2>

            {/* ------------------------------------------------------------ */}
            {/* Message                                                       */}
            {/* ------------------------------------------------------------ */}

            <p
              id="registration-overlay-message"
              className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400"
            >
              {
                overlay.message
              }
            </p>

            {/* ------------------------------------------------------------ */}
            {/* Payment action                                                */}
            {/* ------------------------------------------------------------ */}

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
                    size={
                      15
                    }
                  />
                </button>
              )}

            {/* ------------------------------------------------------------ */}
            {/* Normal action                                                 */}
            {/* ------------------------------------------------------------ */}

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
