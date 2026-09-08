'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Crown,
  CreditCard,
  Loader2,
  LockKeyhole,
  Moon,
  Package,
  ShieldCheck,
  Sparkles,
  Sun,
  LucideIcon,
  Users,
  Zap,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { SAMI_APPS } from '@/lib/sami-apps';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ACCOUNT_STORAGE_KEY =
  'sami_account_form';

const APPS_STORAGE_KEY =
  'sami_selected_apps';

const PLAN_STORAGE_KEY =
  'sami_selected_plan';

const VERIFICATION_EMAIL_STORAGE_KEY =
  'sami_verification_email';

const THEME_STORAGE_KEY =
  'sami_theme';

const REGISTER_ENDPOINT =
  '/api/auth/register';

const VERIFY_EMAIL_ROUTE =
  '/verify-email';

/* ============================================================
   TYPES
   ============================================================ */

type PlanKey =
  | 'free'
  | 'standard'
  | 'custom';

type OverlayState = {
  type:
    | 'error'
    | 'warning'
    | 'success'
    | 'info';

  title: string;
  message: string;

  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };

  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
};

type PlanDefinition = {
  key: PlanKey;

  name: string;

  price: string;

  period: string;

  description: string;

  icon: LucideIcon;

  accent: string;

  iconClass: string;

  selectedClass: string;

  badgeClass: string;

  features: string[];

  highlighted?: boolean;
};

type RegisterResponse = {
  success?: boolean;

  code?: string;

  message?: string;

  error?: string;

  email?: string;

  requiresPayment?: boolean;

  verificationRequired?: boolean;

  next?: string;

  pesapalOrder?: {
    redirectUrl?: string;
    orderTrackingId?: string;
  } | null;
};

/* ============================================================
   PLAN DEFINITIONS
   ============================================================ */

const PLANS: PlanDefinition[] = [
  {
    key: 'free',

    name: 'Free',

    price: 'Free',

    period: 'forever',

    description:
      'Start small and experience the SaMi workspace.',

    icon: Sparkles,

    accent:
      'from-slate-500 to-slate-700',

    iconClass:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',

    selectedClass:
      'border-slate-700 ring-slate-500/15 dark:border-slate-300',

    badgeClass:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',

    features: [
      '1 business app',
      'Unlimited workspace users',
      '100 SaMi AI queries / month',
      'Core SaMi workspace',
      'Basic support',
    ],
  },

  {
    key: 'standard',

    name: 'Standard',

    price: 'KES 2,000',

    period: '/ month',

    description:
      'The complete SaMi workspace for growing businesses.',

    icon: Crown,

    accent:
      'from-blue-600 to-indigo-600',

    iconClass:
      'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',

    selectedClass:
      'border-blue-500 ring-blue-500/15 dark:border-blue-500',

    badgeClass:
      'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',

    highlighted: true,

    features: [
      'All selected business apps',
      'Unlimited workspace users',
      '1,000 SaMi AI queries / month',
      'Cross-app SaMi AI context',
      'Priority support',
    ],
  },

  {
    key: 'custom',

    name: 'Custom',

    price: 'KES 3,340',

    period: '/ month',

    description:
      'Advanced capabilities for larger or specialized businesses.',

    icon: Zap,

    accent:
      'from-violet-600 to-purple-700',

    iconClass:
      'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',

    selectedClass:
      'border-violet-500 ring-violet-500/15 dark:border-violet-500',

    badgeClass:
      'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',

    features: [
      'All business apps',
      'Advanced SaMi AI usage',
      'Custom integrations',
      'Dedicated support',
      'Enterprise service options',
    ],
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

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

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const validAppKeys =
      new Set(
        SAMI_APPS.map(
          (app) => app.key
        )
      );

    return [
      ...new Set(
        parsed.filter(
          (
            value
          ): value is string =>
            typeof value ===
              'string' &&
            validAppKeys.has(
              value
            )
        )
      ),
    ];
  } catch {
    return [];
  }
}

function readAccountForm():
  | Record<string, unknown>
  | null {
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

    const parsed: unknown =
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

function readSavedPlan():
  | PlanKey
  | null {
  if (
    typeof window === 'undefined'
  ) {
    return null;
  }

  try {
    const value =
      sessionStorage.getItem(
        PLAN_STORAGE_KEY
      );

    return isPlanKey(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function savePlan(
  plan: PlanKey
) {
  if (
    typeof window === 'undefined'
  ) {
    return;
  }

  try {
    sessionStorage.setItem(
      PLAN_STORAGE_KEY,
      plan
    );
  } catch {
    // Plan selection can still
    // continue without persistence.
  }
}

function getAppNames(
  keys: string[]
) {
  const keySet =
    new Set(keys);

  return SAMI_APPS.filter(
    (app) =>
      keySet.has(
        app.key
      )
  ).map(
    (app) => ({
      key: app.key,
      name: app.name,
    })
  );
}

/* ============================================================
   PAGE
   ============================================================ */

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
    selectedApps,
    setSelectedApps,
  ] = useState<string[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    overlay,
    setOverlay,
  ] = useState<OverlayState | null>(
    null
  );

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(() => {
    try {
      const storedTheme =
        localStorage.getItem(
          THEME_STORAGE_KEY
        );

      const systemDark =
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches ?? false;

      const useDark =
        storedTheme === 'dark' ||
        (!storedTheme &&
          systemDark);

      setDarkMode(useDark);

      document.documentElement.classList.toggle(
        'dark',
        useDark
      );
    } catch {
      // Theme remains usable even
      // when local storage is blocked.
    }
  }, []);

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
            // Ignore theme storage failure.
          }

          return next;
        }
      );
    }, []);

  /* ==========================================================
     RESTORE ONBOARDING
     ========================================================== */

  useEffect(() => {
    const apps =
      readSelectedApps();

    const savedPlan =
      readSavedPlan();

    setSelectedApps(apps);

    /*
     * Free may only be selected
     * when exactly one app is used.
     */
    if (apps.length > 1) {
      if (
        savedPlan === 'custom'
      ) {
        setSelectedPlan(
          'custom'
        );
      } else {
        setSelectedPlan(
          'standard'
        );
      }

      return;
    }

    if (savedPlan) {
      setSelectedPlan(
        savedPlan
      );
    }
  }, []);

  /* ==========================================================
     DERIVED DATA
     ========================================================== */

  const selectedAppCount =
    selectedApps.length;

  const multipleApps =
    selectedAppCount > 1;

  const freeDisabled =
    multipleApps;

  /*
   * Prevent stale Free state from
   * ever reaching the registration API
   * when multiple apps are selected.
   */
  const effectivePlan: PlanKey =
    multipleApps &&
    selectedPlan === 'free'
      ? 'standard'
      : selectedPlan;

  const effectivePlanDefinition =
    useMemo(
      () =>
        PLANS.find(
          (plan) =>
            plan.key ===
            effectivePlan
        ) ?? PLANS[0],
      [effectivePlan]
    );

  const selectedAppDetails =
    useMemo(
      () =>
        getAppNames(
          selectedApps
        ),
      [selectedApps]
    );

  /* ==========================================================
     SELECT PLAN
     ========================================================== */

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
          setOverlay({
            type: 'info',

            title:
              'Free supports one app',

            message:
              `You currently have ${selectedAppCount} apps selected. Choose Standard or Custom, or go back and keep one app to use Free.`,

            primaryAction: {
              label:
                'Change apps',

              onClick: () => {
                setOverlay(null);

                router.push(
                  '/select-apps'
                );
              },
            },

            secondaryAction: {
              label:
                'Use Standard',

              onClick: () => {
                setOverlay(null);

                setSelectedPlan(
                  'standard'
                );

                savePlan(
                  'standard'
                );
              },
            },
          });

          return;
        }

        setSelectedPlan(plan);

        savePlan(plan);
      },
      [
        loading,
        multipleApps,
        selectedAppCount,
        router,
      ]
    );

  /* ==========================================================
     BACK
     ========================================================== */

  const handleBack =
    useCallback(() => {
      if (loading) {
        return;
      }

      savePlan(
        effectivePlan
      );

      router.push(
        '/select-apps'
      );
    }, [
      loading,
      effectivePlan,
      router,
    ]);

  /* ==========================================================
     ACCOUNT CREATION
     ========================================================== */

  const handleCreateAccount =
    useCallback(async () => {
      if (loading) {
        return;
      }

      setOverlay(null);

      /* ------------------------------------------------------
         Retrieve onboarding data
         ------------------------------------------------------ */

      const accountForm =
        readAccountForm();

      const apps =
        readSelectedApps();

      /* ------------------------------------------------------
         Account state
         ------------------------------------------------------ */

      if (!accountForm) {
        setOverlay({
          type: 'error',

          title:
            'Registration information missing',

          message:
            'Your registration information is no longer available. Return to account creation to continue.',

          primaryAction: {
            label:
              'Return to registration',

            href: '/register',
          },
        });

        return;
      }

      const email =
        typeof accountForm.email ===
          'string'
          ? accountForm.email
              .trim()
              .toLowerCase()
          : '';

      const firstName =
        typeof accountForm.firstName ===
          'string'
          ? accountForm.firstName.trim()
          : '';

      const lastName =
        typeof accountForm.lastName ===
          'string'
          ? accountForm.lastName.trim()
          : '';

      const businessName =
        typeof accountForm.businessName ===
          'string'
          ? accountForm.businessName.trim()
          : '';

      if (
        !email ||
        !firstName ||
        !lastName ||
        !businessName
      ) {
        setOverlay({
          type: 'error',

          title:
            'Account information incomplete',

          message:
            'Some required registration information is missing. Return to the account step and review your details.',

          primaryAction: {
            label:
              'Review account',

            href: '/register',
          },
        });

        return;
      }

      /* ------------------------------------------------------
         Apps
         ------------------------------------------------------ */

      if (apps.length === 0) {
        setOverlay({
          type: 'warning',

          title:
            'No apps selected',

          message:
            'Choose at least one business app before creating your SaMi workspace.',

          primaryAction: {
            label:
              'Choose apps',

            href: '/select-apps',
          },
        });

        return;
      }

      /* ------------------------------------------------------
         Final plan
         ------------------------------------------------------ */

      let finalPlan =
        effectivePlan;

      if (
        apps.length > 1 &&
        finalPlan === 'free'
      ) {
        finalPlan =
          'standard';
      }

      if (
        !isPlanKey(
          finalPlan
        )
      ) {
        setOverlay({
          type: 'error',

          title:
            'Plan could not be verified',

          message:
            'Select a valid SaMi plan and try again.',
        });

        return;
      }

      savePlan(
        finalPlan
      );

      setLoading(true);

      /* ------------------------------------------------------
         Request
         ------------------------------------------------------ */

      try {
        const payload = {
          ...accountForm,

          email,

          firstName,

          lastName,

          businessName,

          plan:
            finalPlan,

          selectedApps:
            apps,
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

              credentials:
                'include',

              cache:
                'no-store',

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

        let data:
          | RegisterResponse
          | null = null;

        try {
          data =
            (await response.json()) as RegisterResponse;
        } catch {
          data = null;
        }

        /* ----------------------------------------------------
           Error response
           ---------------------------------------------------- */

        if (!response.ok) {
          const code =
            data?.code;

          if (
            code ===
              'EMAIL_ALREADY_EXISTS' ||
            code ===
              'ACCOUNT_EXISTS'
          ) {
            setOverlay({
              type: 'warning',

              title:
                'Account already exists',

              message:
                data?.message ||
                data?.error ||
                'A SaMi account already exists for this email address.',

              primaryAction: {
                label:
                  'Sign in',

                href:
                  `/login?email=${encodeURIComponent(
                    email
                  )}`,
              },

              secondaryAction: {
                label:
                  'Use another email',

                href:
                  '/register',
              },
            });

            return;
          }

          if (
            code ===
            'INVALID_PLAN'
          ) {
            setOverlay({
              type: 'error',

              title:
                'Plan unavailable',

              message:
                data?.message ||
                data?.error ||
                'This plan is not currently available. Choose another plan and try again.',
            });

            return;
          }

          if (
            code ===
              'RATE_LIMITED' ||
            code ===
              'REGISTRATION_RATE_LIMITED'
          ) {
            setOverlay({
              type: 'warning',

              title:
                'Too many attempts',

              message:
                data?.message ||
                data?.error ||
                'Too many registration attempts were made. Please wait a little and try again.',
            });

            return;
          }

          setOverlay({
            type: 'error',

            title:
              'Account could not be created',

            message:
              data?.error ||
              data?.message ||
              'SaMi could not create your account. Please try again.',
          });

          return;
        }

        /* ----------------------------------------------------
           Paid plan
           ---------------------------------------------------- */

        if (
          data?.requiresPayment
        ) {
          const redirectUrl =
            data.pesapalOrder
              ?.redirectUrl;

          if (!redirectUrl) {
            setOverlay({
              type: 'error',

              title:
                'Payment could not be started',

              message:
                'Your account registration reached the payment stage, but SaMi did not receive a payment link. Please try again.',
            });

            return;
          }

          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              email
            );
          } catch {
            // Server retains authoritative state.
          }

          setOverlay({
            type: 'info',

            title:
              'Continue to secure payment',

            message:
              data.message ||
              `Your ${effectivePlanDefinition.name} workspace is ready for the payment step.`,

            primaryAction: {
              label:
                'Continue to PesaPal',

              onClick: () => {
                window.location.assign(
                  redirectUrl
                );
              },
            },

            secondaryAction: {
              label:
                'Not now',

              onClick: () =>
                setOverlay(null),
            },
          });

          return;
        }

        /* ----------------------------------------------------
           Successful registration
           ---------------------------------------------------- */

        if (data?.success) {
          try {
            sessionStorage.setItem(
              VERIFICATION_EMAIL_STORAGE_KEY,
              data.email ||
                email
            );

            /*
             * The password/account wizard data
             * is no longer needed after the server
             * has successfully accepted registration.
             */
            sessionStorage.removeItem(
              ACCOUNT_STORAGE_KEY
            );

            sessionStorage.removeItem(
              APPS_STORAGE_KEY
            );

            sessionStorage.removeItem(
              PLAN_STORAGE_KEY
            );
          } catch {
            // Verification can still proceed.
          }

          const verificationNeeded =
            data.verificationRequired !==
            false;

          if (
            verificationNeeded
          ) {
            setOverlay({
              type: 'success',

              title:
                'Account created',

              message:
                data.message ||
                `Your SaMi workspace has been created. Check ${email} for the verification code.`,

              primaryAction: {
                label:
                  'Verify email',

                onClick: () => {
                  router.replace(
                    VERIFY_EMAIL_ROUTE
                  );
                },
              },
            });

            return;
          }

          /*
           * Some authentication providers may
           * already have verified the identity.
           */
          const nextRoute =
            typeof data.next ===
              'string' &&
            data.next.startsWith('/') &&
            !data.next.startsWith('//')
              ? data.next
              : '/dashboard';

          setOverlay({
            type: 'success',

            title:
              'Workspace created',

            message:
              data.message ||
              'Your SaMi workspace is ready.',

            primaryAction: {
              label:
                'Open workspace',

              onClick: () => {
                router.replace(
                  nextRoute
                );

                router.refresh();
              },
            },
          });

          return;
        }

        /* ----------------------------------------------------
           Unexpected successful HTTP response
           ---------------------------------------------------- */

        setOverlay({
          type: 'error',

          title:
            'Registration incomplete',

          message:
            data?.message ||
            'SaMi received an incomplete registration response. Please try again.',
        });
      } catch {
        setOverlay({
          type: 'error',

          title:
            'Could not reach SaMi',

          message:
            'Check your internet connection and try creating your workspace again.',
        });
      } finally {
        setLoading(false);
      }
    }, [
      loading,
      effectivePlan,
      effectivePlanDefinition.name,
      router,
    ]);

  /* ==========================================================
     CTA LABEL
     ========================================================== */

  const primaryActionLabel =
    effectivePlan === 'free'
      ? 'Create Workspace'
      : 'Create & Continue';

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={overlay.type}
          title={
            overlay.title
          }
          message={
            overlay.message
          }
          primaryAction={
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={() =>
            setOverlay(null)
          }
        />
      )}

      <main className="relative min-h-screen overflow-x-hidden bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            BACKGROUND
           ==================================================== */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-blue-500/[0.06] blur-[120px] dark:bg-blue-500/[0.09]" />

          <div className="absolute -bottom-56 right-[-170px] h-[620px] w-[620px] rounded-full bg-violet-500/[0.06] blur-[120px] dark:bg-violet-500/[0.08]" />
        </div>

        {/* ====================================================
            THEME
           ==================================================== */}

        <button
          type="button"
          onClick={
            toggleTheme
          }
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* ====================================================
            CONTENT

            Bottom padding allows for permanent
            action dock.
           ==================================================== */}

        <div className="relative mx-auto w-full max-w-[1280px] px-4 pb-36 pt-7 sm:px-6 lg:px-8">

          {/* ==================================================
              LOGO
             ================================================== */}

          <header className="pr-12">
            <Link
              href="/"
              aria-label="SaMi home"
              className="inline-block max-w-full"
            >
              {/* FULL APPROVED LOGO */}
              <SaMiLogo
                size="lg"
                className="max-w-full"
              />
            </Link>
          </header>

          {/* ==================================================
              PROGRESS
             ================================================== */}

          <div className="mt-7 flex items-center gap-3">
            <OnboardingStep
              number="1"
              label="Account"
              completed
            />

            <div className="h-px flex-1 bg-emerald-300 dark:bg-emerald-900" />

            <OnboardingStep
              number="2"
              label="Apps"
              completed
            />

            <div className="h-px flex-1 bg-blue-300 dark:bg-blue-900" />

            <OnboardingStep
              number="3"
              label="Plan"
              active
            />
          </div>

          {/* ==================================================
              HEADING
             ================================================== */}

          <section className="mt-8">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Step 3 of 3
            </p>

            <h1 className="mt-2 text-[30px] font-black tracking-[-0.035em] sm:text-[36px]">
              Choose your SaMi plan
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Select the plan that fits
              your workspace. SaMi will
              validate your apps, plan and
              account before creating the
              workspace.
            </p>
          </section>

          {/* ==================================================
              SELECTED APPS
             ================================================== */}

          <section className="mt-7 rounded-[24px] border border-slate-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                  <h2 className="text-sm font-black">
                    Your apps
                  </h2>
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedAppCount}{' '}
                  {selectedAppCount === 1
                    ? 'business app'
                    : 'business apps'}{' '}
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
                className="self-start text-xs font-bold text-blue-600 transition hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300 sm:self-auto"
              >
                Change apps
              </button>
            </div>

            {selectedAppDetails.length >
              0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedAppDetails
                  .slice(0, 8)
                  .map(
                    (app) => (
                      <span
                        key={
                          app.key
                        }
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {
                          app.name
                        }
                      </span>
                    )
                  )}

                {selectedAppDetails.length >
                  8 && (
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    +
                    {selectedAppDetails.length -
                      8}{' '}
                    more
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ==================================================
              MULTI APP NOTICE
             ================================================== */}

          {multipleApps && (
            <section className="mt-4 flex items-start gap-3 rounded-[20px] border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

              <div>
                <p className="text-xs font-black text-blue-800 dark:text-blue-300">
                  Standard or Custom required
                </p>

                <p className="mt-1 text-[11px] leading-5 text-blue-700 dark:text-blue-400">
                  You selected{' '}
                  {selectedAppCount}{' '}
                  apps. Free supports one
                  business app, so SaMi has
                  selected Standard unless
                  you choose Custom.
                </p>
              </div>
            </section>
          )}

          {/* ==================================================
              PLANS
             ================================================== */}

          <section className="mt-7 grid gap-5 md:grid-cols-3">
            {PLANS.map(
              (plan) => {
                const Icon =
                  plan.icon;

                const disabled =
                  plan.key ===
                    'free' &&
                  freeDisabled;

                const selected =
                  effectivePlan ===
                  plan.key;

                return (
                  <button
                    key={
                      plan.key
                    }
                    type="button"
                    disabled={
                      loading
                    }
                    onClick={() =>
                      selectPlan(
                        plan.key
                      )
                    }
                    aria-pressed={
                      selected
                    }
                    aria-disabled={
                      disabled
                    }
                    className={`
                      group relative
                      flex min-h-[430px]
                      flex-col
                      overflow-hidden
                      rounded-[28px]
                      border
                      bg-white
                      p-6
                      text-left
                      shadow-[0_10px_35px_rgba(15,23,42,0.05)]
                      transition
                      duration-200
                      focus:outline-none
                      focus:ring-4
                      focus:ring-blue-500/10
                      disabled:cursor-wait
                      dark:bg-slate-900
                      ${
                        selected
                          ? `${plan.selectedClass} ring-2 shadow-[0_18px_45px_rgba(15,23,42,0.10)]`
                          : 'border-slate-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)] dark:border-slate-800 dark:hover:border-slate-700'
                      }
                      ${
                        disabled
                          ? 'opacity-65'
                          : ''
                      }
                    `}
                  >
                    {/* Top gradient */}

                    <div
                      aria-hidden="true"
                      className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${plan.accent}`}
                    />

                    {/* Popular */}

                    {plan.highlighted && (
                      <div className="absolute right-4 top-4 rounded-full bg-blue-600 px-3 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-sm">
                        Recommended
                      </div>
                    )}

                    {/* Selected */}

                    {selected && (
                      <div className="absolute right-4 top-14 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                        <Check
                          className="h-4 w-4"
                          strokeWidth={
                            3
                          }
                        />
                      </div>
                    )}

                    {/* Icon */}

                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${plan.iconClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Name */}

                    <h2 className="mt-5 text-lg font-black tracking-tight">
                      {
                        plan.name
                      }
                    </h2>

                    <p className="mt-2 min-h-[44px] text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {
                        plan.description
                      }
                    </p>

                    {/* Price */}

                    <div className="mt-6">
                      <span className="text-[28px] font-black tracking-[-0.035em]">
                        {
                          plan.price
                        }
                      </span>

                      <span className="ml-1 text-xs font-medium text-slate-400">
                        {
                          plan.period
                        }
                      </span>
                    </div>

                    {/* Features */}

                    <ul className="mt-6 space-y-3">
                      {plan.features.map(
                        (
                          feature
                        ) => (
                          <li
                            key={
                              feature
                            }
                            className="flex items-start gap-2.5 text-xs leading-5 text-slate-600 dark:text-slate-300"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                              <Check className="h-3 w-3" />
                            </span>

                            <span>
                              {
                                feature
                              }
                            </span>
                          </li>
                        )
                      )}
                    </ul>

                    {/* Card bottom */}

                    <div className="mt-auto pt-6">
                      {disabled ? (
                        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-center text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          Reduce selection to
                          one app to use Free
                        </div>
                      ) : selected ? (
                        <div
                          className={`rounded-xl px-3 py-2.5 text-center text-[10px] font-black ${plan.badgeClass}`}
                        >
                          Selected plan
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 transition group-hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-800/70">
                          Select{' '}
                          {plan.name}
                        </div>
                      )}
                    </div>
                  </button>
                );
              }
            )}
          </section>

          {/* ==================================================
              SAMI CORE
             ================================================== */}

          <section className="relative mt-7 overflow-hidden rounded-[24px] border border-indigo-200/80 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 px-5 py-5 dark:border-indigo-900/60 dark:from-blue-950/30 dark:via-indigo-950/25 dark:to-violet-950/30">
            <div
              aria-hidden="true"
              className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl"
            />

            <div className="relative flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                <Bot className="h-5 w-5" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black">
                    SaMi AI is part of the platform
                  </h2>

                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-700 dark:bg-white/10 dark:text-indigo-300">
                    Core
                  </span>
                </div>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Your plan determines AI
                  usage and available
                  capabilities. Installed
                  business apps can extend
                  SaMi AI with additional
                  tools and workspace
                  context.
                </p>
              </div>
            </div>
          </section>

          {/* ==================================================
              SECURITY / BILLING NOTE
             ================================================== */}

          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoCard
              icon={
                ShieldCheck
              }
              title="Secure setup"
              description="Account and workspace configuration are validated by SaMi before activation."
            />

            <InfoCard
              icon={
                CreditCard
              }
              title="Payment"
              description="If payment is required, SaMi securely redirects you to PesaPal."
            />

            <InfoCard
              icon={
                LockKeyhole
              }
              title="Private workspace"
              description="Your business workspace and access remain separated from other SaMi tenants."
            />
          </section>

          {/* ==================================================
              FOOTER
             ================================================== */}

          <footer className="mt-6 flex flex-wrap justify-end gap-x-5 gap-y-2 pb-4 text-[11px] text-slate-400">
            <Link
              href="/help"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Help
            </Link>

            <Link
              href="/terms"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Terms
            </Link>

            <Link
              href="/privacy"
              className="transition hover:text-slate-700 dark:hover:text-slate-200"
            >
              Privacy
            </Link>
          </footer>
        </div>

        {/* ====================================================
            ALWAYS-VISIBLE FINAL ACTION DOCK
           ==================================================== */}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/92 px-4 py-3 shadow-[0_-15px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b0f18]/94">
          <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3">

            {/* Back */}

            <button
              type="button"
              onClick={
                handleBack
              }
              disabled={
                loading
              }
              aria-label="Back to app selection"
              className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />

              <span className="hidden sm:inline">
                Back
              </span>
            </button>

            {/* Selected plan */}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {
                      effectivePlanDefinition.name
                    }{' '}
                    plan
                  </p>

                  <p className="hidden truncate text-[11px] text-slate-500 dark:text-slate-400 sm:block">
                    {
                      effectivePlanDefinition.price
                    }{' '}
                    {
                      effectivePlanDefinition.period
                    }{' '}
                    ·{' '}
                    {
                      selectedAppCount
                    }{' '}
                    {selectedAppCount ===
                    1
                      ? 'app'
                      : 'apps'}
                  </p>
                </div>
              </div>
            </div>

            {/* Create */}

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
              className="flex h-12 min-w-[148px] shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[205px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  <span className="hidden sm:inline">
                    Creating workspace...
                  </span>

                  <span className="sm:hidden">
                    Creating...
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">
                    {
                      primaryActionLabel
                    }
                  </span>

                  <span className="sm:hidden">
                    Continue
                  </span>

                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   ONBOARDING STEP
   ============================================================ */

function OnboardingStep({
  number,
  label,
  active = false,
  completed = false,
}: {
  number: string;
  label: string;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
          completed
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {completed ? (
          <Check className="h-4 w-4" />
        ) : (
          number
        )}
      </span>

      <span
        className={`hidden text-xs font-bold sm:block ${
          active
            ? 'text-slate-950 dark:text-white'
            : completed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ============================================================
   INFO CARD
   ============================================================ */

function InfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <Icon className="h-4 w-4 text-slate-400" />

      <p className="mt-3 text-xs font-black">
        {title}
      </p>

      <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}