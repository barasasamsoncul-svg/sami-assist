'use client';

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  Mail,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type AdminAccount = {
  id: string;

  firstName: string;
  lastName: string;
  fullName: string;

  email: string;

  role: string;
  status: string;

  emailVerified: boolean;
  emailVerifiedAt: string | null;

  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
};

type PendingEmailChange = {
  email: string;
  expiresAt: string;
  createdAt: string;
  canResendInSeconds: number;
};

type ApiPayload = {
  success?: boolean;

  code?: string;

  error?: string;
  message?: string;

  account?: AdminAccount;

  pending?: PendingEmailChange | null;

  email?: string;
  expiresAt?: string;
  canResendInSeconds?: number;

  retryAfterSeconds?: number;

  sessionInvalidated?: boolean;

  next?: string;
};

type OverlayState = {
  open: boolean;

  type: SaMiOverlayType;

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

type SettingsCategory =
  | 'account'
  | 'security'
  | 'sessions'
  | 'preferences'
  | 'notifications'
  | 'platform';

type SettingsNavigationItem = {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: React.ElementType;
  available: boolean;
  group: 'personal' | 'platform';
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const EMAIL_CHANGE_CODE_LENGTH = 6;

const EMPTY_OVERLAY: OverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};

const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
  {
    id: 'account',
    label: 'My Account',
    description: 'Identity and primary email',
    icon: UserRound,
    available: true,
    group: 'personal',
  },

  {
    id: 'security',
    label: 'Security',
    description: 'Password and two-factor authentication',
    icon: ShieldCheck,
    available: false,
    group: 'personal',
  },

  {
    id: 'sessions',
    label: 'Sessions & Devices',
    description: 'Signed-in devices and sessions',
    icon: Laptop,
    available: false,
    group: 'personal',
  },

  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Personal administrator preferences',
    icon: Palette,
    available: false,
    group: 'personal',
  },

  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Administrator notification preferences',
    icon: Bell,
    available: false,
    group: 'personal',
  },

  {
    id: 'platform',
    label: 'Platform Settings',
    description: 'SaMi-wide platform configuration',
    icon: SlidersHorizontal,
    available: false,
    group: 'platform',
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value: string
) {
  const normalized =
    normalizeEmail(value);

  return (
    Boolean(normalized) &&
    normalized.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized
    )
  );
}

function normalizeCode(
  value: string
) {
  return value
    .replace(/\D/g, '')
    .slice(
      0,
      EMAIL_CHANGE_CODE_LENGTH
    );
}

function roleLabel(
  role: string
) {
  return role
    .split('_')
    .map(
      part =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function statusLabel(
  status: string
) {
  return status
    .split('_')
    .map(
      part =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return 'Not available';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}

function formatRemainingTime(
  seconds: number
) {
  const safeSeconds =
    Math.max(
      0,
      Math.ceil(seconds)
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const remainder =
    safeSeconds % 60;

  if (minutes <= 0) {
    return `${remainder}s`;
  }

  return `${minutes}:${String(
    remainder
  ).padStart(2, '0')}`;
}

/* ============================================================
   API RESPONSE
   ============================================================ */

async function readApiPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    const body =
      await response.json();

    if (
      body &&
      typeof body === 'object'
    ) {
      return body as ApiPayload;
    }
  } catch {
    // Ignore malformed/empty response.
  }

  return {};
}

/* ============================================================
   SMALL UI COMPONENTS
   ============================================================ */

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="
        overflow-hidden
        rounded-3xl
        border
        border-zinc-200
        bg-white
        shadow-sm

        dark:border-zinc-800
        dark:bg-zinc-900
      "
    >
      <div
        className="
          flex
          items-start
          gap-4

          border-b
          border-zinc-200

          p-6

          dark:border-zinc-800
        "
      >
        <div
          className="
            flex
            h-11
            w-11
            shrink-0
            items-center
            justify-center

            rounded-xl

            bg-zinc-100
            text-zinc-700

            dark:bg-zinc-800
            dark:text-zinc-200
          "
        >
          {icon}
        </div>

        <div>
          <h2
            className="
              text-base
              font-bold
              text-zinc-950

              dark:text-white
            "
          >
            {title}
          </h2>

          <p
            className="
              mt-1
              max-w-3xl
              text-sm
              leading-6
              text-zinc-500
            "
          >
            {description}
          </p>
        </div>
      </div>

      {children}
    </section>
  );
}

function FutureCategory({
  icon,
  title,
  description,
  category,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  category: string;
}) {
  return (
    <div
      className="
        rounded-3xl

        border
        border-zinc-200

        bg-white

        p-8

        shadow-sm

        dark:border-zinc-800
        dark:bg-zinc-900
      "
    >
      <div
        className="
          flex
          h-12
          w-12
          items-center
          justify-center

          rounded-2xl

          bg-zinc-100

          dark:bg-zinc-800
        "
      >
        {icon}
      </div>

      <h2
        className="
          mt-5
          text-xl
          font-bold
          tracking-tight
          text-zinc-950

          dark:text-white
        "
      >
        {title}
      </h2>

      <p
        className="
          mt-2
          max-w-2xl

          text-sm
          leading-6
          text-zinc-500
        "
      >
        {description}
      </p>

      <div
        className="
          mt-6

          rounded-2xl

          border
          border-dashed
          border-zinc-300

          bg-zinc-50

          p-5

          dark:border-zinc-700
          dark:bg-zinc-950
        "
      >
        <div
          className="
            flex
            items-start
            gap-3
          "
        >
          <Clock3
            className="
              mt-0.5
              h-5
              w-5
              shrink-0
              text-zinc-400
            "
          />

          <div>
            <p
              className="
                text-sm
                font-semibold
                text-zinc-800

                dark:text-zinc-200
              "
            >
              Not implemented yet
            </p>

            <p
              className="
                mt-1
                text-sm
                leading-6
                text-zinc-500
              "
            >
              This section is reserved for {category}. We will
              activate it when that SaMi architecture category is
              implemented rather than displaying placeholder
              controls that do not work.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminSettingsPage() {
  const router =
    useRouter();

  /* ==========================================================
     ACTIVE CATEGORY
     ========================================================== */

  const [
    activeCategory,
    setActiveCategory,
  ] =
    useState<SettingsCategory>(
      'account'
    );

  /* ==========================================================
     ACCOUNT
     ========================================================== */

  const [
    account,
    setAccount,
  ] =
    useState<AdminAccount | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    loadError,
    setLoadError,
  ] =
    useState<string | null>(
      null
    );

  /* ==========================================================
     EMAIL CHANGE
     ========================================================== */

  const [
    pending,
    setPending,
  ] =
    useState<PendingEmailChange | null>(
      null
    );

  const [
    newEmail,
    setNewEmail,
  ] =
    useState('');

  const [
    verificationCode,
    setVerificationCode,
  ] =
    useState('');

  const [
    requesting,
    setRequesting,
  ] =
    useState(false);

  const [
    verifying,
    setVerifying,
  ] =
    useState(false);

  const [
    cancelling,
    setCancelling,
  ] =
    useState(false);

  const [
    resendCooldown,
    setResendCooldown,
  ] =
    useState(0);

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>(
      EMPTY_OVERLAY
    );

  const closeOverlay =
    useCallback(() => {
      setOverlay(
        EMPTY_OVERLAY
      );
    }, []);

  const showOverlay =
    useCallback(
      (
        type: SaMiOverlayType,
        title: string,
        message: string
      ) => {
        setOverlay({
          open: true,
          type,
          title,
          message,
        });
      },
      []
    );

  /* ==========================================================
     AUTHENTICATION FAILURE
     ========================================================== */

  const handleAuthenticationFailure =
    useCallback(
      (
        payload?: ApiPayload
      ) => {
        setOverlay({
          open: true,

          type: 'warning',

          title:
            'Administrator session expired',

          message:
            payload?.error ||
            'Your administrator session is no longer active. Sign in again to continue.',

          primaryAction: {
            label:
              'Sign in again',

            onClick: () => {
              router.replace(
                '/admin/login'
              );
            },
          },
        });
      },
      [router]
    );

  /* ==========================================================
     LOAD ACCOUNT
     ========================================================== */

  const loadAccount =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/admin/account',
            {
              method: 'GET',

              cache: 'no-store',

              credentials:
                'same-origin',

              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        const payload =
          await readApiPayload(
            response
          );

        if (
          response.status === 401
        ) {
          handleAuthenticationFailure(
            payload
          );

          throw new Error(
            'ADMIN_UNAUTHENTICATED'
          );
        }

        if (
          !response.ok ||
          !payload.account
        ) {
          throw new Error(
            payload.error ||
              'SaMi could not load your administrator account.'
          );
        }

        setAccount(
          payload.account
        );
      },
      [
        handleAuthenticationFailure,
      ]
    );

  /* ==========================================================
     LOAD PENDING EMAIL CHANGE
     ========================================================== */

  const loadPendingEmailChange =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/admin/account/email-change',
            {
              method: 'GET',

              cache: 'no-store',

              credentials:
                'same-origin',

              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        const payload =
          await readApiPayload(
            response
          );

        if (
          response.status === 401
        ) {
          handleAuthenticationFailure(
            payload
          );

          throw new Error(
            'ADMIN_UNAUTHENTICATED'
          );
        }

        if (!response.ok) {
          throw new Error(
            payload.error ||
              'SaMi could not load your pending email change.'
          );
        }

        const nextPending =
          payload.pending ||
          null;

        setPending(
          nextPending
        );

        setResendCooldown(
          Math.max(
            0,
            Number(
              nextPending
                ?.canResendInSeconds ||
                0
            )
          )
        );
      },
      [
        handleAuthenticationFailure,
      ]
    );

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    let active =
      true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        await Promise.all([
          loadAccount(),
          loadPendingEmailChange(),
        ]);
      } catch (error) {
        if (!active) {
          return;
        }

        if (
          error instanceof Error &&
          error.message ===
            'ADMIN_UNAUTHENTICATED'
        ) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'SaMi could not load administrator settings.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    loadAccount,
    loadPendingEmailChange,
  ]);

  /* ==========================================================
     RESEND COUNTDOWN
     ========================================================== */

  useEffect(() => {
    if (
      resendCooldown <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setResendCooldown(
            current =>
              Math.max(
                0,
                current - 1
              )
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [resendCooldown]);

  /* ==========================================================
     EXPIRY
     ========================================================== */

  const pendingExpired =
    useMemo(() => {
      if (!pending) {
        return false;
      }

      const expires =
        new Date(
          pending.expiresAt
        ).getTime();

      if (
        Number.isNaN(expires)
      ) {
        return false;
      }

      return (
        expires <= Date.now()
      );
    }, [pending]);

  /* ==========================================================
     REQUEST EMAIL CHANGE
     ========================================================== */

  const requestEmailChange =
    useCallback(
      async (
        email: string,
        isResend = false
      ) => {
        if (requesting) {
          return;
        }

        const normalized =
          normalizeEmail(
            email
          );

        if (
          !isValidEmail(
            normalized
          )
        ) {
          showOverlay(
            'warning',
            'Check the email address',
            'Enter a valid email address before continuing.'
          );

          return;
        }

        if (
          account &&
          normalized ===
            normalizeEmail(
              account.email
            )
        ) {
          showOverlay(
            'info',
            'Email already in use',
            'This is already your current administrator email address.'
          );

          return;
        }

        setRequesting(true);

        try {
          const response =
            await fetch(
              '/api/admin/account/email-change/request',
              {
                method: 'POST',

                credentials:
                  'same-origin',

                headers: {
                  Accept:
                    'application/json',

                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    email:
                      normalized,
                  }),
              }
            );

          const payload =
            await readApiPayload(
              response
            );

          if (
            response.status ===
            401
          ) {
            handleAuthenticationFailure(
              payload
            );

            return;
          }

          if (!response.ok) {
            if (
              response.status ===
              429
            ) {
              const retryAfter =
                Math.max(
                  1,
                  Number(
                    payload.retryAfterSeconds ||
                      payload.canResendInSeconds ||
                      60
                  )
                );

              setResendCooldown(
                retryAfter
              );

              showOverlay(
                'info',
                'Please wait',
                `A verification code was recently requested. You can request another code in ${formatRemainingTime(
                  retryAfter
                )}.`
              );

              return;
            }

            showOverlay(
              response.status >=
                500
                ? 'error'
                : 'warning',

              isResend
                ? 'Code not resent'
                : 'Email change not started',

              payload.error ||
                'SaMi could not send the verification code.'
            );

            return;
          }

          const pendingEmail =
            payload.email ||
            normalized;

          const expiresAt =
            payload.expiresAt ||
            new Date(
              Date.now() +
                15 *
                  60 *
                  1000
            ).toISOString();

          const cooldown =
            Math.max(
              0,
              Number(
                payload.canResendInSeconds ??
                  60
              )
            );

          setPending({
            email:
              pendingEmail,

            expiresAt,

            createdAt:
              new Date().toISOString(),

            canResendInSeconds:
              cooldown,
          });

          setNewEmail(
            pendingEmail
          );

          setVerificationCode(
            ''
          );

          setResendCooldown(
            cooldown
          );

          showOverlay(
            'success',

            isResend
              ? 'New code sent'
              : 'Verification code sent',

            `Enter the 6-digit verification code sent to ${pendingEmail}.`
          );
        } catch (error) {
          console.error(
            '[Admin Settings] Email-change request failed:',
            error
          );

          showOverlay(
            'error',
            'Unable to send code',
            'SaMi could not contact the administrator service. Please try again.'
          );
        } finally {
          setRequesting(
            false
          );
        }
      },
      [
        account,
        handleAuthenticationFailure,
        requesting,
        showOverlay,
      ]
    );

  async function handleRequestSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await requestEmailChange(
      newEmail
    );
  }

  async function handleResend() {
    if (
      !pending ||
      resendCooldown > 0 ||
      requesting
    ) {
      return;
    }

    await requestEmailChange(
      pending.email,
      true
    );
  }

  /* ==========================================================
     VERIFY
     ========================================================== */

  async function handleVerify(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      verifying ||
      !pending
    ) {
      return;
    }

    const code =
      normalizeCode(
        verificationCode
      );

    if (
      code.length !==
      EMAIL_CHANGE_CODE_LENGTH
    ) {
      showOverlay(
        'warning',
        'Incomplete verification code',
        'Enter the complete 6-digit verification code.'
      );

      return;
    }

    setVerifying(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/email-change/verify',
          {
            method: 'POST',

            credentials:
              'same-origin',

            headers: {
              Accept:
                'application/json',

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code,
              }),
          }
        );

      const payload =
        await readApiPayload(
          response
        );

      if (
        response.status === 401
      ) {
        handleAuthenticationFailure(
          payload
        );

        return;
      }

      if (!response.ok) {
        if (
          response.status === 429
        ) {
          showOverlay(
            'warning',
            'Too many attempts',
            payload.error ||
              'Too many verification attempts. Wait before trying again.'
          );

          return;
        }

        if (
          payload.code ===
          'EMAIL_CHANGE_EXPIRED'
        ) {
          showOverlay(
            'warning',
            'Verification code expired',
            'This verification code has expired. Request a new code to continue.'
          );

          return;
        }

        if (
          payload.code ===
          'INVALID_EMAIL_CHANGE_CODE'
        ) {
          showOverlay(
            'warning',
            'Incorrect verification code',
            'The verification code is incorrect. Check the email and try again.'
          );

          return;
        }

        showOverlay(
          response.status >=
            500
            ? 'error'
            : 'warning',

          'Email not changed',

          payload.error ||
            'SaMi could not verify the email change.'
        );

        return;
      }

      setVerificationCode('');
      setPending(null);

      setOverlay({
        open: true,

        type: 'success',

        title:
          'Administrator email changed',

        message:
          payload.message ||
          `Your primary administrator email is now ${pending.email}. For security, sign in again using the new email address.`,

        primaryAction: {
          label:
            'Sign in with new email',

          onClick: () => {
            router.replace(
              payload.next ||
                '/admin/login?reason=email_changed'
            );

            router.refresh();
          },
        },
      });
    } catch (error) {
      console.error(
        '[Admin Settings] Email verification failed:',
        error
      );

      showOverlay(
        'error',
        'Verification unavailable',
        'SaMi could not contact the administrator service. Please try again.'
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ==========================================================
     CANCEL
     ========================================================== */

  async function performCancel() {
    if (cancelling) {
      return;
    }

    setCancelling(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/email-change',
          {
            method:
              'DELETE',

            credentials:
              'same-origin',

            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const payload =
        await readApiPayload(
          response
        );

      if (
        response.status === 401
      ) {
        handleAuthenticationFailure(
          payload
        );

        return;
      }

      if (!response.ok) {
        showOverlay(
          response.status >=
            500
            ? 'error'
            : 'warning',

          'Unable to cancel',

          payload.error ||
            'SaMi could not cancel the pending email change.'
        );

        return;
      }

      setPending(null);
      setNewEmail('');
      setVerificationCode('');
      setResendCooldown(0);

      showOverlay(
        'success',
        'Email change cancelled',
        'The pending administrator email change has been cancelled.'
      );
    } catch (error) {
      console.error(
        '[Admin Settings] Email-change cancellation failed:',
        error
      );

      showOverlay(
        'error',
        'Unable to cancel',
        'SaMi could not contact the administrator service. Please try again.'
      );
    } finally {
      setCancelling(false);
    }
  }

  function handleCancelRequest() {
    if (cancelling) {
      return;
    }

    setOverlay({
      open: true,

      type: 'warning',

      title:
        'Cancel email change?',

      message:
        'The current verification code will stop working and your existing administrator email will remain unchanged.',

      primaryAction: {
        label:
          'Cancel email change',

        onClick: () => {
          closeOverlay();

          void performCancel();
        },
      },

      secondaryAction: {
        label:
          'Keep change',

        onClick:
          closeOverlay,
      },
    });
  }

  /* ==========================================================
     RETRY
     ========================================================== */

  async function retryLoad() {
    setLoading(true);
    setLoadError(null);

    try {
      await Promise.all([
        loadAccount(),
        loadPendingEmailChange(),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'ADMIN_UNAUTHENTICATED'
      ) {
        return;
      }

      setLoadError(
        error instanceof Error
          ? error.message
          : 'SaMi could not load administrator settings.'
      );
    } finally {
      setLoading(false);
    }
  }

  /* ==========================================================
     CATEGORY CONTENT
     ========================================================== */

  function renderAccountSettings() {
    if (!account) {
      return null;
    }

    return (
      <div className="space-y-6">
        {/* ====================================================
            PROFILE / IDENTITY
            ==================================================== */}

        <SectionCard
          icon={
            <UserRound className="h-5 w-5" />
          }
          title="Administrator identity"
          description="Your identity within SaMi Platform Administration."
        >
          <div className="p-6">
            <div
              className="
                flex
                flex-col
                gap-5

                sm:flex-row
                sm:items-center
                sm:justify-between
              "
            >
              <div
                className="
                  flex
                  min-w-0
                  items-center
                  gap-4
                "
              >
                <div
                  className="
                    flex
                    h-14
                    w-14
                    shrink-0
                    items-center
                    justify-center

                    rounded-2xl

                    bg-zinc-950

                    text-lg
                    font-bold
                    text-white

                    dark:bg-white
                    dark:text-zinc-950
                  "
                >
                  {account.firstName
                    .charAt(0)
                    .toUpperCase()}

                  {account.lastName
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <h3
                    className="
                      truncate
                      text-lg
                      font-bold
                      text-zinc-950

                      dark:text-white
                    "
                  >
                    {account.fullName}
                  </h3>

                  <p
                    className="
                      mt-1
                      truncate
                      text-sm
                      text-zinc-500
                    "
                  >
                    {account.email}
                  </p>
                </div>
              </div>

              <div
                className="
                  flex
                  flex-wrap
                  gap-2
                "
              >
                <span
                  className="
                    rounded-full

                    bg-zinc-100

                    px-3
                    py-1.5

                    text-xs
                    font-semibold
                    text-zinc-700

                    dark:bg-zinc-800
                    dark:text-zinc-300
                  "
                >
                  {roleLabel(
                    account.role
                  )}
                </span>

                <span
                  className="
                    rounded-full

                    bg-emerald-50

                    px-3
                    py-1.5

                    text-xs
                    font-semibold
                    text-emerald-700

                    dark:bg-emerald-950/40
                    dark:text-emerald-300
                  "
                >
                  {statusLabel(
                    account.status
                  )}
                </span>
              </div>
            </div>

            <div
              className="
                mt-6

                grid

                overflow-hidden

                rounded-2xl

                border
                border-zinc-200

                divide-y
                divide-zinc-200

                dark:border-zinc-800
                dark:divide-zinc-800

                md:grid-cols-3
                md:divide-x
                md:divide-y-0
              "
            >
              <div className="p-4">
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                  "
                >
                  Role
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    font-semibold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {roleLabel(
                    account.role
                  )}
                </p>
              </div>

              <div className="p-4">
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                  "
                >
                  Email verification
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    font-semibold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {account.emailVerified
                    ? 'Verified'
                    : 'Not verified'}
                </p>
              </div>

              <div className="p-4">
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                  "
                >
                  Two-factor authentication
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    font-semibold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {account.twoFactorEnabled
                    ? 'Enabled'
                    : account.twoFactorRequired
                      ? 'Required'
                      : 'Not enabled'}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ====================================================
            PRIMARY EMAIL
            ==================================================== */}

        <SectionCard
          icon={
            <Mail className="h-5 w-5" />
          }
          title="Primary email"
          description="Your primary email identifies your Platform Administrator account and is used when signing in."
        >
          <div className="p-6">
            <div
              className="
                rounded-2xl

                border
                border-zinc-200

                bg-zinc-50

                p-4

                dark:border-zinc-800
                dark:bg-zinc-950
              "
            >
              <div
                className="
                  flex
                  flex-col
                  gap-3

                  sm:flex-row
                  sm:items-center
                  sm:justify-between
                "
              >
                <div className="min-w-0">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-wide
                      text-zinc-400
                    "
                  >
                    Current email
                  </p>

                  <p
                    className="
                      mt-1
                      break-all
                      text-sm
                      font-semibold
                      text-zinc-950

                      dark:text-white
                    "
                  >
                    {account.email}
                  </p>

                  {account.emailVerifiedAt && (
                    <p
                      className="
                        mt-1
                        text-xs
                        text-zinc-500
                      "
                    >
                      Verified{' '}
                      {formatDateTime(
                        account.emailVerifiedAt
                      )}
                    </p>
                  )}
                </div>

                {account.emailVerified ? (
                  <div
                    className="
                      inline-flex
                      w-fit
                      items-center
                      gap-1.5

                      rounded-full

                      bg-emerald-50

                      px-3
                      py-1.5

                      text-xs
                      font-semibold
                      text-emerald-700

                      dark:bg-emerald-950/40
                      dark:text-emerald-300
                    "
                  >
                    <BadgeCheck className="h-4 w-4" />

                    Verified
                  </div>
                ) : (
                  <div
                    className="
                      inline-flex
                      w-fit
                      items-center
                      gap-1.5

                      rounded-full

                      bg-amber-50

                      px-3
                      py-1.5

                      text-xs
                      font-semibold
                      text-amber-700

                      dark:bg-amber-950/40
                      dark:text-amber-300
                    "
                  >
                    <AlertTriangle className="h-4 w-4" />

                    Unverified
                  </div>
                )}
              </div>
            </div>

            {/* ================================================
                START CHANGE
                ================================================ */}

            {!pending && (
              <form
                onSubmit={
                  handleRequestSubmit
                }
                className="mt-6"
              >
                <label
                  htmlFor="admin-new-email"
                  className="
                    text-sm
                    font-semibold
                    text-zinc-800

                    dark:text-zinc-200
                  "
                >
                  Change primary email
                </label>

                <p
                  className="
                    mt-1
                    max-w-2xl
                    text-sm
                    leading-6
                    text-zinc-500
                  "
                >
                  Enter your new email address. SaMi will verify
                  ownership before changing your administrator
                  identity.
                </p>

                <div
                  className="
                    mt-4
                    flex
                    flex-col
                    gap-3

                    lg:flex-row
                  "
                >
                  <div
                    className="
                      relative
                      flex-1
                    "
                  >
                    <Mail
                      className="
                        pointer-events-none

                        absolute
                        left-4
                        top-1/2

                        h-5
                        w-5

                        -translate-y-1/2

                        text-zinc-400
                      "
                    />

                    <input
                      id="admin-new-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={254}
                      value={newEmail}
                      disabled={requesting}
                      onChange={event =>
                        setNewEmail(
                          event.target.value
                        )
                      }
                      placeholder="new@email.com"
                      className="
                        h-12
                        w-full

                        rounded-xl

                        border
                        border-zinc-300

                        bg-white

                        pl-12
                        pr-4

                        text-sm
                        text-zinc-950

                        outline-none

                        transition

                        placeholder:text-zinc-400

                        focus:border-zinc-950
                        focus:ring-2
                        focus:ring-zinc-950/10

                        disabled:cursor-not-allowed
                        disabled:opacity-60

                        dark:border-zinc-700
                        dark:bg-zinc-950
                        dark:text-white
                        dark:focus:border-white
                        dark:focus:ring-white/10
                      "
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      requesting ||
                      !newEmail.trim()
                    }
                    className="
                      inline-flex
                      h-12
                      items-center
                      justify-center
                      gap-2

                      rounded-xl

                      bg-zinc-950

                      px-5

                      text-sm
                      font-semibold
                      text-white

                      transition

                      hover:bg-zinc-800

                      disabled:cursor-not-allowed
                      disabled:opacity-50

                      dark:bg-white
                      dark:text-zinc-950
                      dark:hover:bg-zinc-200
                    "
                  >
                    {requesting ? (
                      <Loader2
                        className="
                          h-4
                          w-4
                          animate-spin
                        "
                      />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}

                    Send verification code
                  </button>
                </div>
              </form>
            )}

            {/* ================================================
                PENDING CHANGE
                ================================================ */}

            {pending && (
              <div
                className="
                  mt-6

                  overflow-hidden

                  rounded-2xl

                  border
                  border-zinc-200

                  dark:border-zinc-800
                "
              >
                <div
                  className="
                    bg-zinc-50

                    p-5

                    dark:bg-zinc-950
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      gap-4

                      sm:flex-row
                      sm:items-start
                      sm:justify-between
                    "
                  >
                    <div>
                      <div
                        className="
                          flex
                          items-center
                          gap-2

                          text-sm
                          font-semibold
                          text-zinc-950

                          dark:text-white
                        "
                      >
                        <Clock3 className="h-4 w-4" />

                        Pending verification
                      </div>

                      <p
                        className="
                          mt-2
                          text-sm
                          text-zinc-500
                        "
                      >
                        Verification code sent to
                      </p>

                      <p
                        className="
                          mt-1
                          break-all

                          text-sm
                          font-bold
                          text-zinc-950

                          dark:text-white
                        "
                      >
                        {pending.email}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={
                        handleCancelRequest
                      }
                      className="
                        inline-flex
                        h-10
                        items-center
                        justify-center
                        gap-2

                        rounded-xl

                        border
                        border-zinc-200

                        bg-white

                        px-4

                        text-sm
                        font-semibold
                        text-zinc-700

                        transition

                        hover:bg-zinc-100

                        disabled:cursor-not-allowed
                        disabled:opacity-50

                        dark:border-zinc-700
                        dark:bg-zinc-900
                        dark:text-zinc-300
                        dark:hover:bg-zinc-800
                      "
                    >
                      {cancelling ? (
                        <Loader2
                          className="
                            h-4
                            w-4
                            animate-spin
                          "
                        />
                      ) : (
                        <X className="h-4 w-4" />
                      )}

                      Cancel
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={
                    handleVerify
                  }
                  className="p-5"
                >
                  <label
                    htmlFor="admin-email-code"
                    className="
                      text-sm
                      font-semibold
                      text-zinc-800

                      dark:text-zinc-200
                    "
                  >
                    Verification code
                  </label>

                  <p
                    className="
                      mt-1
                      text-sm
                      leading-6
                      text-zinc-500
                    "
                  >
                    Enter the 6-digit code from the verification
                    email.
                  </p>

                  <div
                    className="
                      mt-4

                      flex
                      flex-col
                      gap-3

                      lg:flex-row
                    "
                  >
                    <div
                      className="
                        relative
                        max-w-xs
                        flex-1
                      "
                    >
                      <KeyRound
                        className="
                          pointer-events-none

                          absolute
                          left-4
                          top-1/2

                          h-5
                          w-5

                          -translate-y-1/2

                          text-zinc-400
                        "
                      />

                      <input
                        id="admin-email-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={
                          EMAIL_CHANGE_CODE_LENGTH
                        }
                        value={
                          verificationCode
                        }
                        disabled={verifying}
                        onChange={event =>
                          setVerificationCode(
                            normalizeCode(
                              event.target.value
                            )
                          )
                        }
                        placeholder="000000"
                        className="
                          h-12
                          w-full

                          rounded-xl

                          border
                          border-zinc-300

                          bg-white

                          pl-12
                          pr-4

                          font-mono
                          text-lg
                          font-bold
                          tracking-[0.25em]
                          text-zinc-950

                          outline-none

                          transition

                          placeholder:text-zinc-300

                          focus:border-zinc-950
                          focus:ring-2
                          focus:ring-zinc-950/10

                          disabled:cursor-not-allowed
                          disabled:opacity-60

                          dark:border-zinc-700
                          dark:bg-zinc-950
                          dark:text-white
                          dark:focus:border-white
                          dark:focus:ring-white/10
                        "
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        verifying ||
                        verificationCode.length !==
                          EMAIL_CHANGE_CODE_LENGTH
                      }
                      className="
                        inline-flex
                        h-12
                        items-center
                        justify-center
                        gap-2

                        rounded-xl

                        bg-zinc-950

                        px-5

                        text-sm
                        font-semibold
                        text-white

                        transition

                        hover:bg-zinc-800

                        disabled:cursor-not-allowed
                        disabled:opacity-50

                        dark:bg-white
                        dark:text-zinc-950
                        dark:hover:bg-zinc-200
                      "
                    >
                      {verifying ? (
                        <Loader2
                          className="
                            h-4
                            w-4
                            animate-spin
                          "
                        />
                      ) : (
                        <BadgeCheck className="h-4 w-4" />
                      )}

                      Verify and change email
                    </button>
                  </div>

                  <div
                    className="
                      mt-5

                      flex
                      flex-col
                      gap-3

                      border-t
                      border-zinc-200

                      pt-4

                      dark:border-zinc-800

                      sm:flex-row
                      sm:items-center
                      sm:justify-between
                    "
                  >
                    <p
                      className="
                        text-xs
                        text-zinc-500
                      "
                    >
                      {pendingExpired
                        ? 'This code may have expired. Request a new code.'
                        : `Code expires ${formatDateTime(
                            pending.expiresAt
                          )}.`}
                    </p>

                    <button
                      type="button"
                      disabled={
                        requesting ||
                        resendCooldown > 0
                      }
                      onClick={() =>
                        void handleResend()
                      }
                      className="
                        inline-flex
                        w-fit
                        items-center
                        gap-2

                        text-sm
                        font-semibold
                        text-zinc-700

                        transition

                        hover:text-zinc-950

                        disabled:cursor-not-allowed
                        disabled:text-zinc-400

                        dark:text-zinc-300
                        dark:hover:text-white
                        dark:disabled:text-zinc-600
                      "
                    >
                      {requesting ? (
                        <Loader2
                          className="
                            h-4
                            w-4
                            animate-spin
                          "
                        />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}

                      {resendCooldown > 0
                        ? `Resend in ${formatRemainingTime(
                            resendCooldown
                          )}`
                        : 'Resend code'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ====================================================
            SECURITY CONSEQUENCE
            ==================================================== */}

        <div
          className="
            flex
            items-start
            gap-4

            rounded-3xl

            border
            border-amber-200

            bg-amber-50/60

            p-5

            dark:border-amber-950
            dark:bg-amber-950/20
          "
        >
          <div
            className="
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center

              rounded-xl

              bg-amber-100
              text-amber-700

              dark:bg-amber-950
              dark:text-amber-300
            "
          >
            <LockKeyhole className="h-5 w-5" />
          </div>

          <div>
            <p
              className="
                text-sm
                font-bold
                text-amber-950

                dark:text-amber-100
              "
            >
              Primary email is security-sensitive
            </p>

            <p
              className="
                mt-1
                text-sm
                leading-6
                text-amber-800

                dark:text-amber-300
              "
            >
              After your administrator email is successfully
              changed, existing Platform Administrator sessions are
              invalidated. You must sign in again using the new
              address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderCategoryContent() {
    switch (activeCategory) {
      case 'account':
        return renderAccountSettings();

      case 'security':
        return (
          <FutureCategory
            icon={
              <ShieldCheck className="h-6 w-6" />
            }
            title="Security"
            description="Password management, two-factor authentication, recovery methods and administrator security activity will live here."
            category="Platform Admin Category 4 — Security"
          />
        );

      case 'sessions':
        return (
          <FutureCategory
            icon={
              <Laptop className="h-6 w-6" />
            }
            title="Sessions & Devices"
            description="Review administrator sessions, identify signed-in devices and revoke access from individual or all sessions."
            category="Platform Admin Category 3 — Sessions & Devices"
          />
        );

      case 'preferences':
        return (
          <FutureCategory
            icon={
              <Palette className="h-6 w-6" />
            }
            title="Preferences"
            description="Personal display, locale, date, time and other administrator workspace preferences will live here."
            category="administrator preferences"
          />
        );

      case 'notifications':
        return (
          <FutureCategory
            icon={
              <Bell className="h-6 w-6" />
            }
            title="Notifications"
            description="Control which operational and security notifications this administrator receives."
            category="Category 15 — Notifications"
          />
        );

      case 'platform':
        return (
          <FutureCategory
            icon={
              <SlidersHorizontal className="h-6 w-6" />
            }
            title="Platform Settings"
            description="Company-wide SaMi configuration belongs here and will be protected separately by Platform Administrator permissions."
            category="Category 25 — Platform Settings"
          />
        );

      default:
        return null;
    }
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (loading) {
    return (
      <>
        <div
          className="
            flex
            min-h-[60vh]
            items-center
            justify-center
          "
        >
          <div
            className="
              flex
              flex-col
              items-center
              gap-4
              text-center
            "
          >
            <div
              className="
                flex
                h-14
                w-14
                items-center
                justify-center

                rounded-2xl

                border
                border-zinc-200

                bg-white

                shadow-sm

                dark:border-zinc-800
                dark:bg-zinc-900
              "
            >
              <Loader2
                className="
                  h-6
                  w-6
                  animate-spin
                "
              />
            </div>

            <div>
              <p
                className="
                  text-sm
                  font-semibold
                  text-zinc-950

                  dark:text-white
                "
              >
                Loading administrator settings
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  text-zinc-500
                "
              >
                Verifying your account information.
              </p>
            </div>
          </div>
        </div>

        <SaMiOverlay
          open={overlay.open}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={closeOverlay}
        />
      </>
    );
  }

  /* ==========================================================
     LOAD FAILURE
     ========================================================== */

  if (
    loadError ||
    !account
  ) {
    return (
      <>
        <div
          className="
            mx-auto
            max-w-3xl

            rounded-3xl

            border
            border-red-200

            bg-white

            p-8

            shadow-sm

            dark:border-red-950
            dark:bg-zinc-900
          "
        >
          <AlertTriangle
            className="
              h-7
              w-7
              text-red-600
            "
          />

          <h1
            className="
              mt-5
              text-2xl
              font-bold
              text-zinc-950

              dark:text-white
            "
          >
            Administrator settings unavailable
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-zinc-500
            "
          >
            {loadError ||
              'SaMi could not load your administrator account.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void retryLoad()
            }
            className="
              mt-6
              inline-flex
              h-11
              items-center
              gap-2

              rounded-xl

              bg-zinc-950

              px-5

              text-sm
              font-semibold
              text-white

              dark:bg-white
              dark:text-zinc-950
            "
          >
            <RefreshCw className="h-4 w-4" />

            Try again
          </button>
        </div>

        <SaMiOverlay
          open={overlay.open}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={closeOverlay}
        />
      </>
    );
  }

  /* ==========================================================
     FULL SETTINGS LAYOUT
     ========================================================== */

  const personalNavigation =
    SETTINGS_NAVIGATION.filter(
      item =>
        item.group === 'personal'
    );

  const platformNavigation =
    SETTINGS_NAVIGATION.filter(
      item =>
        item.group === 'platform'
    );

  const activeItem =
    SETTINGS_NAVIGATION.find(
      item =>
        item.id === activeCategory
    );

  return (
    <>
      <div
        className="
          mx-auto
          w-full
          max-w-7xl
        "
      >
        {/* ====================================================
            HEADER
            ==================================================== */}

        <div>
          <div
            className="
              flex
              items-center
              gap-2

              text-sm
              font-medium
              text-zinc-500
            "
          >
            <Settings className="h-4 w-4" />

            Platform Administration
          </div>

          <h1
            className="
              mt-2
              text-3xl
              font-bold
              tracking-tight
              text-zinc-950

              dark:text-white
            "
          >
            Settings
          </h1>

          <p
            className="
              mt-2
              max-w-3xl

              text-sm
              leading-6
              text-zinc-500
            "
          >
            Manage your administrator account, security,
            preferences and authorized SaMi platform configuration.
          </p>
        </div>

        {/* ====================================================
            MOBILE CATEGORY SELECTOR
            ==================================================== */}

        <div
          className="
            mt-7
            lg:hidden
          "
        >
          <label
            htmlFor="admin-settings-category"
            className="
              mb-2
              block
              text-sm
              font-semibold
              text-zinc-700

              dark:text-zinc-300
            "
          >
            Settings category
          </label>

          <select
            id="admin-settings-category"
            value={activeCategory}
            onChange={event =>
              setActiveCategory(
                event.target
                  .value as SettingsCategory
              )
            }
            className="
              h-12
              w-full

              rounded-xl

              border
              border-zinc-300

              bg-white

              px-4

              text-sm
              font-semibold
              text-zinc-950

              outline-none

              dark:border-zinc-700
              dark:bg-zinc-900
              dark:text-white
            "
          >
            {SETTINGS_NAVIGATION.map(
              item => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.label}
                  {!item.available
                    ? ' — Coming later'
                    : ''}
                </option>
              )
            )}
          </select>
        </div>

        {/* ====================================================
            SETTINGS WORKSPACE
            ==================================================== */}

        <div
          className="
            mt-7

            grid
            gap-6

            lg:grid-cols-[280px_minmax(0,1fr)]
          "
        >
          {/* ==================================================
              CATEGORY NAVIGATION
              ================================================== */}

          <aside
            className="
              hidden

              lg:block
            "
          >
            <div
              className="
                sticky
                top-6

                overflow-hidden

                rounded-3xl

                border
                border-zinc-200

                bg-white

                shadow-sm

                dark:border-zinc-800
                dark:bg-zinc-900
              "
            >
              {/* ==============================================
                  ADMIN SUMMARY
                  ============================================== */}

              <div
                className="
                  border-b
                  border-zinc-200

                  p-5

                  dark:border-zinc-800
                "
              >
                <div
                  className="
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center

                    rounded-xl

                    bg-zinc-950

                    text-sm
                    font-bold
                    text-white

                    dark:bg-white
                    dark:text-zinc-950
                  "
                >
                  {account.firstName
                    .charAt(0)
                    .toUpperCase()}

                  {account.lastName
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <p
                  className="
                    mt-3
                    truncate
                    text-sm
                    font-bold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {account.fullName}
                </p>

                <p
                  className="
                    mt-1
                    truncate
                    text-xs
                    text-zinc-500
                  "
                >
                  {roleLabel(
                    account.role
                  )}
                </p>
              </div>

              {/* ==============================================
                  PERSONAL
                  ============================================== */}

              <div className="p-3">
                <p
                  className="
                    px-3
                    pb-2
                    pt-1

                    text-[11px]
                    font-bold
                    uppercase
                    tracking-[0.12em]
                    text-zinc-400
                  "
                >
                  Administrator
                </p>

                <div className="space-y-1">
                  {personalNavigation.map(
                    item => {
                      const Icon =
                        item.icon;

                      const active =
                        activeCategory ===
                        item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setActiveCategory(
                              item.id
                            )
                          }
                          className={`
                            flex
                            w-full
                            items-center
                            gap-3

                            rounded-xl

                            px-3
                            py-3

                            text-left

                            transition

                            ${
                              active
                                ? `
                                  bg-zinc-950
                                  text-white

                                  dark:bg-white
                                  dark:text-zinc-950
                                `
                                : `
                                  text-zinc-600

                                  hover:bg-zinc-100
                                  hover:text-zinc-950

                                  dark:text-zinc-400
                                  dark:hover:bg-zinc-800
                                  dark:hover:text-white
                                `
                            }
                          `}
                        >
                          <Icon
                            className="
                              h-5
                              w-5
                              shrink-0
                            "
                          />

                          <div
                            className="
                              min-w-0
                              flex-1
                            "
                          >
                            <div
                              className="
                                flex
                                items-center
                                gap-2
                              "
                            >
                              <span
                                className="
                                  truncate
                                  text-sm
                                  font-semibold
                                "
                              >
                                {item.label}
                              </span>

                              {!item.available && (
                                <span
                                  className={`
                                    rounded-full
                                    px-1.5
                                    py-0.5

                                    text-[9px]
                                    font-bold
                                    uppercase

                                    ${
                                      active
                                        ? `
                                          bg-white/15
                                          text-current
                                        `
                                        : `
                                          bg-zinc-100
                                          text-zinc-400

                                          dark:bg-zinc-800
                                        `
                                    }
                                  `}
                                >
                                  Later
                                </span>
                              )}
                            </div>

                            <p
                              className={`
                                mt-0.5
                                truncate
                                text-[11px]

                                ${
                                  active
                                    ? 'opacity-70'
                                    : 'text-zinc-400'
                                }
                              `}
                            >
                              {item.description}
                            </p>
                          </div>

                          {active && (
                            <ChevronRight
                              className="
                                h-4
                                w-4
                                shrink-0
                              "
                            />
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* ==============================================
                  PLATFORM
                  ============================================== */}

              <div
                className="
                  border-t
                  border-zinc-200

                  p-3

                  dark:border-zinc-800
                "
              >
                <p
                  className="
                    px-3
                    pb-2
                    pt-1

                    text-[11px]
                    font-bold
                    uppercase
                    tracking-[0.12em]
                    text-zinc-400
                  "
                >
                  SaMi Platform
                </p>

                {platformNavigation.map(
                  item => {
                    const Icon =
                      item.icon;

                    const active =
                      activeCategory ===
                      item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setActiveCategory(
                            item.id
                          )
                        }
                        className={`
                          flex
                          w-full
                          items-center
                          gap-3

                          rounded-xl

                          px-3
                          py-3

                          text-left

                          transition

                          ${
                            active
                              ? `
                                bg-zinc-950
                                text-white

                                dark:bg-white
                                dark:text-zinc-950
                              `
                              : `
                                text-zinc-600

                                hover:bg-zinc-100
                                hover:text-zinc-950

                                dark:text-zinc-400
                                dark:hover:bg-zinc-800
                                dark:hover:text-white
                              `
                          }
                        `}
                      >
                        <Icon
                          className="
                            h-5
                            w-5
                            shrink-0
                          "
                        />

                        <div
                          className="
                            min-w-0
                            flex-1
                          "
                        >
                          <div
                            className="
                              flex
                              items-center
                              gap-2
                            "
                          >
                            <span
                              className="
                                truncate
                                text-sm
                                font-semibold
                              "
                            >
                              {item.label}
                            </span>

                            {!item.available && (
                              <span
                                className={`
                                  rounded-full
                                  px-1.5
                                  py-0.5

                                  text-[9px]
                                  font-bold
                                  uppercase

                                  ${
                                    active
                                      ? `
                                        bg-white/15
                                      `
                                      : `
                                        bg-zinc-100
                                        text-zinc-400

                                        dark:bg-zinc-800
                                      `
                                  }
                                `}
                              >
                                Later
                              </span>
                            )}
                          </div>

                          <p
                            className={`
                              mt-0.5
                              truncate
                              text-[11px]

                              ${
                                active
                                  ? 'opacity-70'
                                  : 'text-zinc-400'
                              }
                            `}
                          >
                            {item.description}
                          </p>
                        </div>

                        {active && (
                          <ChevronRight
                            className="
                              h-4
                              w-4
                              shrink-0
                            "
                          />
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </aside>

          {/* ==================================================
              CONTENT
              ================================================== */}

          <main className="min-w-0">
            <div
              className="
                mb-5

                flex
                items-center
                justify-between
                gap-4
              "
            >
              <div>
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-wide
                    text-zinc-400
                  "
                >
                  Settings
                </p>

                <h2
                  className="
                    mt-1
                    text-xl
                    font-bold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {activeItem?.label}
                </h2>
              </div>

              {activeCategory ===
                'account' &&
                account.emailVerified && (
                  <div
                    className="
                      hidden
                      items-center
                      gap-2

                      rounded-full

                      bg-emerald-50

                      px-3
                      py-1.5

                      text-xs
                      font-semibold
                      text-emerald-700

                      dark:bg-emerald-950/40
                      dark:text-emerald-300

                      sm:flex
                    "
                  >
                    <CheckCircle2 className="h-4 w-4" />

                    Identity verified
                  </div>
                )}
            </div>

            {renderCategoryContent()}
          </main>
        </div>
      </div>

      {/* ======================================================
          SHARED SaMi OVERLAY
          ====================================================== */}

      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        primaryAction={
          overlay.primaryAction
        }
        secondaryAction={
          overlay.secondaryAction
        }
        onClose={closeOverlay}
      />
    </>
  );
}