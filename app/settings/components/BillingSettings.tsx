'use client';

import {
  Ban,
  Check,
  CircleDollarSign,
  CreditCard,
  Loader2,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import StripeRecurringSetup from './StripeRecurringSetup';

type BillingPlan = {
  id: string;
  key:
    'free' |
    'standard' |
    'custom';
  name: string;
  description: string;
  currency: string;
  billingInterval: string;
  pricePerUserMonthly: number;
  priceSource: string;
  firstMonthFree: boolean;
  billingBasis: string;
  entitlements: {
    allBusinessApps: boolean;
    maxInstalledBusinessApps:
      number | null;
    users: {
      maxActiveInternalUsers:
        number | null;
    };
    ai: {
      enabled: boolean;
      monthlyQueriesPerUser: {
        mode: string;
        limit:
          number | null;
        unit: string;
        label?:
          string;
      };
    };
    automation: {
      enabled: boolean;
    };
    integrations: {
      enabled: boolean;
      customIntegrations: boolean;
    };
    developerApi: {
      enabled: boolean;
    };
    companies: {
      multiCompany: boolean;
    };
    customization: {
      enabled: boolean;
    };
    storage: {
      cloudHosted: boolean;
      allowance: {
        mode: string;
        limit:
          number | null;
        unit: string;
        label?:
          string;
      };
    };
  };
};

type BillingPayment = {
  id: string;
  provider:
    string | null;
  providerTransactionId:
    string | null;
  amount: number;
  currency: string;
  status: string;
  description:
    string | null;
  type:
    string | null;
  billingPurpose:
    string | null;
  paymentMethod:
    string | null;
  createdAt:
    string | null;
  updatedAt:
    string | null;
};

export type BillingState = {
  canManage: boolean;
  currency: string;
  billableUsers: number;
  subscription: {
    id: string;
    status: string;
    storedStatus: string;
    planKey:
      'free' |
      'standard' |
      'custom';
    planName: string;
    billingCycle:
      string | null;
    startedAt:
      string | null;
    trialEndsAt:
      string | null;
    currentPeriodStart:
      string | null;
    currentPeriodEnd:
      string | null;
    cancelledAt:
      string | null;
    cancellation: {
      requestedAt:
        string | null;
      effectiveAt:
        string | null;
      scheduled:
        boolean;
      ended:
        boolean;
    };
    scheduledPlan:
      | {
          key:
            string;
          name:
            string;
          effectiveAt:
            string | null;
          requestedAt:
            string | null;
        }
      | null;
    firstMonthFree: boolean;
    pricePerUserMonthly: number;
    monthlyAmount: number;
    paymentDue: boolean;
    amountDue: number;
  };
  plans:
    BillingPlan[];
  payments:
    BillingPayment[];
  billingProfile:
    | {
        provider:
          string;
        recurringStatus:
          string;
        providerCustomerId:
          string | null;
        providerSubscriptionId:
          string | null;
        providerPaymentMethodId:
          string | null;
        pricePerUserMonthly:
          number | null;
        seatQuantity:
          number | null;
      }
    | null;
  collection: {
    provider:
      string;
    providerName:
      string;
    configured:
      boolean;
    mode:
      string;
    automaticRecurring:
      boolean;
    capabilities: {
      checkout:
        boolean;
      savePaymentMethodWithoutCharge:
        boolean;
      automaticRecurring:
        boolean;
      variableRecurringAmount:
        boolean;
      updateRecurringQuantity:
        boolean;
      customerPortal:
        boolean;
      mpesaCheckout:
        boolean;
    };
    providerCatalog:
      Array<{
        key:
          string;
        name:
          string;
        configured:
          boolean;
        active:
          boolean;
        capabilities:
          Record<
            string,
            boolean
          >;
      }>;
    explanation:
      string;
  };
};

type BillingSetupState =
  | {
      provider:
        string;
      providerName:
        string;
      setupReference:
        string;
      clientSecret:
        string | null;
      redirectUrl:
        string | null;
      publicKey:
        string | null;
      chargedToday:
        boolean;
    }
  | null;

type MobileSection =
  | 'overview'
  | 'plans'
  | 'payments';

type OverlayAction = {
  label:
    string;
  onClick?:
    () => void;
};

type Overlay = {
  open: boolean;
  type:
    'success' |
    'error' |
    'warning' |
    'info';
  title: string;
  message: string;
  primaryAction?:
    OverlayAction;
  secondaryAction?:
    OverlayAction;
};

const CLOSED_OVERLAY:
  Overlay = {
    open:
      false,
    type:
      'info',
    title:
      '',
    message:
      '',
  };

function formatMoney(
  amount:
    number,
  currency:
    string,
) {
  return new Intl
    .NumberFormat(
      'en-KE',
      {
        style:
          'currency',
        currency,
        maximumFractionDigits:
          0,
      },
    )
    .format(
      amount,
    );
}

function formatDate(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return '—';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date
    .toLocaleString(
      undefined,
      {
        dateStyle:
          'medium',
        timeStyle:
          'short',
      },
    );
}

function titleCase(
  value:
    string,
) {
  return value
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      char =>
        char.toUpperCase(),
    );
}

function planHighlights(
  plan:
    BillingPlan,
) {
  const ai =
    plan.entitlements
      .ai
      .monthlyQueriesPerUser;

  return [
    plan.entitlements
      .allBusinessApps
      ? 'All business apps'
      : `Up to ${plan.entitlements.maxInstalledBusinessApps ?? 1} business app`,
    ai.mode ===
      'fixed'
      ? `${Number(
          ai.limit ||
          0,
        ).toLocaleString()} AI queries/user/month`
      : ai.label ||
        'Advanced AI allowance',
    plan.entitlements
      .users
      .maxActiveInternalUsers ===
      null
      ? 'Unlimited plan seats billed per active user'
      : `Up to ${plan.entitlements.users.maxActiveInternalUsers} active internal user`,
    plan.entitlements
      .companies
      .multiCompany
      ? 'Multi-company'
      : 'Single company',
    plan.entitlements
      .developerApi
      .enabled
      ? 'External API'
      : 'No external API',
    plan.entitlements
      .customization
      .enabled
      ? 'Custom workspace capability'
      : 'Standard configuration',
    'Cloud hosted',
  ];
}

export default function BillingSettings({
  initialState,
}: {
  initialState:
    BillingState;
}) {
  const [
    state,
    setState,
  ] =
    useState(
      initialState,
    );

  const [
    mobileSection,
    setMobileSection,
  ] =
    useState<MobileSection>(
      'overview',
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    planBusy,
    setPlanBusy,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState(
      CLOSED_OVERLAY,
    );

  const [
    setup,
    setSetup,
  ] =
    useState<BillingSetupState>(
      null,
    );

  const automaticSetupStarted =
    useRef(
      false,
    );

  const automaticBillingActive =
    Boolean(
      !state.subscription
        .cancellation
        .scheduled &&
      !state.subscription
        .cancellation
        .ended &&
      state.billingProfile &&
      [
        'trialing',
        'active',
      ].includes(
        state.billingProfile
          .recurringStatus,
      ),
    );

  useEffect(
    () => {
      const params =
        new URLSearchParams(
          window.location.search,
        );

      if (
        params.get(
          'setup',
        ) !==
          '1' ||
        automaticSetupStarted
          .current ||
        !state.canManage ||
        !state.collection
          .configured ||
        !state.collection
          .capabilities
          .savePaymentMethodWithoutCharge ||
        automaticBillingActive
      ) {
        return;
      }

      automaticSetupStarted
        .current =
        true;

      void startAutomaticBilling();

      const clean =
        new URL(
          window.location.href,
        );

      clean.searchParams
        .delete(
          'setup',
        );

      window.history
        .replaceState(
          {},
          '',
          `${clean.pathname}${clean.search}${clean.hash}`,
        );
    },
    [
      automaticBillingActive,
      state.canManage,
      state.collection
        .configured,
      state.collection
        .capabilities
        .savePaymentMethodWithoutCharge,
    ],
  );


  useEffect(
    () => {
      const params =
        new URLSearchParams(
          window.location.search,
        );

      if (
        params.get(
          'billing_setup',
        ) !==
          'return'
      ) {
        return;
      }

      let cancelled =
        false;

      async function completeReturnedSetup() {
        try {
          const response =
            await fetch(
              '/api/workspace/billing/setup',
              {
                method:
                  'POST',
                credentials:
                  'same-origin',
                cache:
                  'no-store',
                headers: {
                  Accept:
                    'application/json',
                  'Content-Type':
                    'application/json',
                },
                body:
                  JSON.stringify({
                    action:
                      'complete',
                  }),
              },
            );

          const data =
            await response.json() as {
              success?:
                boolean;
              error?:
                string;
            };

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
              'Automatic billing setup could not be completed.',
            );
          }

          if (
            !cancelled
          ) {
            await refresh();

            show(
              'success',
              'Automatic billing ready',
              'Your payment method is authorized. SaMi will use the current seat count and server-configured plan price for future billing.',
            );

            const clean =
              new URL(
                window.location.href,
              );

            clean.searchParams
              .delete(
                'billing_setup',
              );

            window.history
              .replaceState(
                {},
                '',
                `${clean.pathname}${clean.search}${clean.hash}`,
              );
          }
        } catch (
          error
        ) {
          if (
            !cancelled
          ) {
            show(
              'error',
              'Billing setup incomplete',
              error instanceof
                Error
                ? error.message
                : 'SaMi could not finish automatic billing setup.',
            );
          }
        }
      }

      void completeReturnedSetup();

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  async function startAutomaticBilling() {
    if (
      busy ||
      !state.canManage
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/billing/setup',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'start',
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          setup?:
            BillingSetupState;
        };

      if (
        !response.ok ||
        !data.success ||
        !data.setup
      ) {
        throw new Error(
          data.error ||
          'Automatic billing setup could not be started.',
        );
      }

      setSetup(
        data.setup,
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Automatic billing unavailable',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not start automatic billing setup.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function completeAutomaticBilling() {
    const response =
      await fetch(
        '/api/workspace/billing/setup',
        {
          method:
            'POST',
          credentials:
            'same-origin',
          cache:
            'no-store',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify({
              action:
                'complete',
            }),
        },
      );

    const data =
      await response.json() as {
        success?:
          boolean;
        error?:
          string;
      };

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        'Automatic billing setup could not be completed.',
      );
    }

    setSetup(
      null,
    );

    await refresh();

    show(
      'success',
      'Automatic billing ready',
      'No charge was made today. SaMi will bill after the free month using the live seat count and server-configured price.',
    );
  }


  function show(
    type:
      Overlay['type'],
    title:
      string,
    message:
      string,
  ) {
    setOverlay({
      open:
        true,
      type,
      title,
      message,
    });
  }

  async function refresh() {
    const response =
      await fetch(
        '/api/workspace/billing',
        {
          credentials:
            'same-origin',
          cache:
            'no-store',
        },
      );

    const data =
      await response.json() as {
        success?:
          boolean;
        error?:
          string;
        billing?:
          BillingState;
      };

    if (
      !response.ok ||
      !data.success ||
      !data.billing
    ) {
      throw new Error(
        data.error ||
        'Billing could not be refreshed.',
      );
    }

    setState(
      data.billing,
    );
  }

  async function changePlan(
    targetPlan:
      BillingPlan['key'],
  ) {
    if (
      !state.canManage ||
      planBusy
    ) {
      return;
    }

    setPlanBusy(
      targetPlan,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/billing',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'change_plan',
                targetPlan,
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          blockers?:
            string[];
          planChange?: {
            mode?:
              string;
            currentPlan?:
              string;
            targetPlan?:
              string;
            effectiveAt?:
              string | null;
            billingSetupRecommended?:
              boolean;
            paymentRequired?:
              boolean;
          };
        };

      if (
        !response.ok ||
        !data.success ||
        !data.planChange
      ) {
        const blockerText =
          Array.isArray(
            data.blockers,
          ) &&
          data.blockers.length >
            0
            ? data.blockers.join(
                ' ',
              )
            : '';

        throw new Error(
          blockerText ||
          data.error ||
          'SaMi could not change the subscription plan.',
        );
      }

      await refresh();

      if (
        data.planChange
          .mode ===
          'scheduled'
      ) {
        show(
          'success',
          'Plan change scheduled',
          `The plan will change at the current paid-period boundary${data.planChange.effectiveAt ? ` on ${formatDate(data.planChange.effectiveAt)}` : ''}.`,
        );
      } else if (
        data.planChange
          .paymentRequired
      ) {
        setMobileSection(
          'overview',
        );

        show(
          'info',
          'Plan changed — payment required',
          'This workspace has already used its paid-plan free month. The new paid plan will become entitled after payment.',
        );
      } else if (
        data.planChange
          .billingSetupRecommended
      ) {
        setMobileSection(
          'overview',
        );

        show(
          'success',
          'Paid plan started',
          'Your first paid-plan month is free. Set up automatic billing in Overview so future renewal can run securely.',
        );
      } else {
        show(
          'success',
          'Plan changed',
          'SaMi updated the workspace subscription and re-evaluated its plan entitlements.',
        );
      }
    } catch (
      error
    ) {
      show(
        'error',
        'Plan change blocked',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not change the subscription plan.',
      );
    } finally {
      setPlanBusy(
        null,
      );
    }
  }


  async function checkout() {
    if (
      busy ||
      !state.canManage
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/billing',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'checkout',
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          checkoutUrl?:
            string | null;
          checkout?: {
            checkoutUrl?:
              string | null;
          };
        };

      const checkoutUrl =
        data.checkout
          ?.checkoutUrl ||
        data.checkoutUrl ||
        null;

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          checkoutUrl
        ) {
          window.location.assign(
            checkoutUrl,
          );
          return;
        }

        throw new Error(
          data.error ||
          'Checkout could not be started.',
        );
      }

      if (
        !checkoutUrl
      ) {
        throw new Error(
          'The billing provider did not return a checkout URL.',
        );
      }

      window.location.assign(
        checkoutUrl,
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Payment could not start',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not start billing checkout.',
      );

      try {
        await refresh();
      } catch {
        // Preserve the original payment error.
      }
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <div className="space-y-4">

      <div className="sticky top-[68px] z-20 -mx-1 overflow-x-auto bg-[var(--sami-canvas)] px-1 py-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-1 shadow-[var(--sami-shadow-sm)]">
          {([
            [
              'overview',
              'Overview',
            ],
            [
              'plans',
              'Plans',
            ],
            [
              'payments',
              'Payments',
            ],
          ] as const).map(
            (
              [
                key,
                label,
              ],
            ) => (
              <button
                key={
                  key
                }
                type="button"
                onClick={() =>
                  setMobileSection(
                    key,
                  )
                }
                className={[
                  'h-8 rounded-lg px-3 text-[11px] font-black transition',
                  mobileSection ===
                    key
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'text-slate-500',
                ].join(
                  ' ',
                )}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>


      <section
        className={[
          'space-y-4',
          mobileSection ===
            'overview'
            ? ''
            : 'hidden lg:block',
        ].join(
          ' ',
        )}
      >
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <CreditCard className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
                  Current subscription
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {state.subscription
                    .planName}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {titleCase(
                    state.subscription
                      .status,
                  )} · {state.billableUsers} active billable user{state.billableUsers ===
                    1
                    ? ''
                    : 's'}
                </p>
              </div>
            </div>

            <span className={[
              'w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
              state.subscription
                .paymentDue
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
            ].join(
              ' ',
            )}>
              {state.subscription
                .paymentDue
                ? 'Payment due'
                : 'Current'}
            </span>
          </div>

          {state.subscription
            .scheduledPlan && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/20 dark:bg-violet-500/10">
              <p className="text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Plan change scheduled
              </p>
              <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/80">
                {state.subscription.scheduledPlan.name}
                {state.subscription.scheduledPlan.effectiveAt
                  ? ` from ${formatDate(
                      state.subscription.scheduledPlan.effectiveAt,
                    )}`
                  : ''}
                . Your current plan remains entitled until then.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--sami-border)] p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Per user / month
              </p>
              <p className="mt-1 text-lg font-black">
                {formatMoney(
                  state.subscription
                    .pricePerUserMonthly,
                  state.currency,
                )}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--sami-border)] p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Current monthly bill
              </p>
              <p className="mt-1 text-lg font-black">
                {formatMoney(
                  state.subscription
                    .monthlyAmount,
                  state.currency,
                )}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--sami-border)] p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Due now
              </p>
              <p className="mt-1 text-lg font-black">
                {formatMoney(
                  state.subscription
                    .amountDue,
                  state.currency,
                )}
              </p>
            </div>
          </div>

          {state.subscription
            .paymentDue &&
            state.canManage && (
            <button
              type="button"
              onClick={
                checkout
              }
              disabled={
                busy
              }
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
            >
              {busy
                ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )
                : (
                  <CircleDollarSign className="h-4 w-4" />
                )}
              Pay {formatMoney(
                state.subscription
                  .amountDue,
                state.currency,
              )} with {state.collection.providerName}
            </button>
          )}

          {!state.canManage && (
            <p className="mt-4 text-xs text-slate-500">
              You have read-only billing access. A billing manager or workspace owner can make payments.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex items-center gap-2 text-xs font-black">
              <Users className="h-4 w-4 text-slate-400" />
              Billing basis
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              SaMi bills paid plans per active internal user. The next checkout is recalculated from the live seat count.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex items-center gap-2 text-xs font-black">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              Collection policy
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {state.collection
                .explanation}
            </p>

            {!state.collection
              .configured && (
              <p className="mt-2 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                Billing collection is unavailable until {state.collection.providerName} credentials are configured.
              </p>
            )}

            {state.subscription.planKey !==
              'free' &&
              state.canManage &&
              state.collection
                .configured &&
              state.collection.capabilities
                .savePaymentMethodWithoutCharge &&
              !automaticBillingActive && (
              <button
                type="button"
                onClick={
                  startAutomaticBilling
                }
                disabled={
                  busy
                }
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-black disabled:opacity-50"
              >
                {busy && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Set up automatic billing
              </button>
            )}

            {automaticBillingActive && (
              <p className="mt-3 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                Automatic billing is configured with {state.billingProfile?.provider || state.collection.providerName}.
              </p>
            )}
          </div>
        </div>

        {setup &&
          setup.provider ===
            'stripe' &&
          setup.clientSecret &&
          setup.publicKey && (
          <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-500/20 dark:bg-[#11141a]">
            <div className="mb-4">
              <p className="text-xs font-black">
                Set up automatic billing
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Securely save a payment method with {setup.providerName}. No subscription charge is made today.
              </p>
            </div>

            <StripeRecurringSetup
              publicKey={
                setup.publicKey
              }
              clientSecret={
                setup.clientSecret
              }
              onCompleted={
                completeAutomaticBilling
              }
              onError={message =>
                show(
                  'error',
                  'Payment method not saved',
                  message,
                )
              }
            />

            <button
              type="button"
              onClick={() =>
                setSetup(
                  null,
                )
              }
              className="mt-3 h-9 w-full rounded-xl border border-[var(--sami-border)] text-[11px] font-bold text-slate-500"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <p className="text-xs font-black">
            Billing dates
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Trial ends
              </p>
              <p className="mt-1 text-xs font-bold">
                {formatDate(
                  state.subscription
                    .trialEndsAt,
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Current period ends
              </p>
              <p className="mt-1 text-xs font-bold">
                {formatDate(
                  state.subscription
                    .currentPeriodEnd,
                )}
              </p>
            </div>
          </div>
        </div>
      </section>


      <section
        className={[
          'space-y-3',
          mobileSection ===
            'plans'
            ? ''
            : 'hidden lg:block',
        ].join(
          ' ',
        )}
      >
        <div>
          <h2 className="text-sm font-black">
            SaMi plans
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Paid plans include the first calendar month free. Prices shown are the same server-authoritative values used for billing.
          </p>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          {state.plans.map(
            plan => {
              const current =
                plan.key ===
                state.subscription
                  .planKey;

              return (
                <article
                  key={
                    plan.key
                  }
                  className={[
                    'rounded-2xl border bg-[var(--sami-surface)] p-4',
                    current
                      ? 'border-blue-400 ring-2 ring-blue-500/10'
                      : 'border-[var(--sami-border)]',
                  ].join(
                    ' ',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-xl font-black">
                        {formatMoney(
                          plan.pricePerUserMonthly,
                          plan.currency,
                        )}
                        <span className="text-[10px] font-semibold text-slate-400">
                          {' '}/ user / month
                        </span>
                      </p>
                    </div>

                    {current && (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                        Current
                      </span>
                    )}
                  </div>

                  {plan.firstMonthFree && (
                    <p className="mt-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      First calendar month free
                    </p>
                  )}

                  <div className="mt-4 space-y-2">
                    {planHighlights(
                      plan,
                    ).map(
                      item => (
                        <div
                          key={
                            item
                          }
                          className="flex items-start gap-2 text-[11px] text-slate-500"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span>
                            {item}
                          </span>
                        </div>
                      ),
                    )}
                  </div>

                  {plan.key ===
                    'custom' && (
                    <div className="mt-4 rounded-xl border border-[var(--sami-border)] p-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        Custom-only
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Multi-company, external API and customization capability.
                      </p>
                    </div>
                  )}

                  {state.canManage &&
                    !current &&
                    !state.subscription
                      .scheduledPlan && (
                    <button
                      type="button"
                      onClick={() =>
                        changePlan(
                          plan.key,
                        )
                      }
                      disabled={
                        planBusy !==
                        null
                      }
                      className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-black transition hover:bg-[var(--sami-surface-soft)] disabled:opacity-50"
                    >
                      {planBusy ===
                        plan.key && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {state.subscription
                        .status ===
                        'active' &&
                      state.subscription
                        .planKey !==
                        'free'
                        ? 'Change at renewal'
                        : `Switch to ${plan.name}`}
                    </button>
                  )}
                </article>
              );
            },
          )}
        </div>
      </section>


      <section
        className={[
          'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]',
          mobileSection ===
            'payments'
            ? ''
            : 'hidden lg:block',
        ].join(
          ' ',
        )}
      >
        <div className="border-b border-[var(--sami-border)] p-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-black">
              Payment history
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Subscription payment history across SaMi billing providers.
          </p>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {state.payments.length ===
            0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No payments have been recorded yet.
            </div>
          )}

          {state.payments.map(
            payment => (
              <div
                key={
                  payment.id
                }
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-black">
                    {payment.description ||
                    'SaMi subscription payment'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatDate(
                      payment.createdAt,
                    )}
                    {payment.paymentMethod
                      ? ` · ${payment.paymentMethod}`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                  <p className="text-xs font-black">
                    {formatMoney(
                      payment.amount,
                      payment.currency,
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {titleCase(
                      payment.status,
                    )}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      </section>


      <SaMiOverlay
        open={
          overlay.open
        }
        type={
          overlay.type
        }
        title={
          overlay.title
        }
        message={
          overlay.message
        }
        onClose={() =>
          setOverlay(
            CLOSED_OVERLAY,
          )
        }
      />

    </div>
  );
}
