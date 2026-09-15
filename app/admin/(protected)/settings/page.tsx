'use client';

import {
  FormEvent,
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
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
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
   SAFE RESPONSE PARSER
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
    // Fall through.
  }

  return {};
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminSettingsPage() {
  const router =
    useRouter();

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
     SESSION FAILURE
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

              cache:
                'no-store',

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

              cache:
                'no-store',

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
          payload.pending || null;

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
     PENDING EXPIRY
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
     REQUEST / RESEND EMAIL CHANGE
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
                method:
                  'POST',

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

  /* ==========================================================
     REQUEST FORM
     ========================================================== */

  async function handleRequestSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    await requestEmailChange(
      newEmail,
      false
    );
  }

  /* ==========================================================
     RESEND
     ========================================================== */

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
          response.status >= 500
            ? 'error'
            : 'warning',

          'Email not changed',

          payload.error ||
            'SaMi could not verify the email change.'
        );

        return;
      }

      /*
       * The backend has now:
       *
       * - changed the primary administrator email
       * - verified the new email
       * - consumed the challenge
       * - revoked administrator sessions
       *
       * Do not attempt authenticated API requests after this.
       */

      setVerificationCode(
        ''
      );

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
        'SaMi could not contact the administrator service. Your email has not been confirmed by this screen. Please try again.'
      );
    } finally {
      setVerifying(false);
    }
  }

  /* ==========================================================
     CANCEL
     ========================================================== */

  async function performCancel() {
    if (
      cancelling
    ) {
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
        response.status ===
        401
      ) {
        handleAuthenticationFailure(
          payload
        );

        return;
      }

      if (!response.ok) {
        showOverlay(
          response.status >= 500
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
    if (
      cancelling
    ) {
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
     RETRY INITIAL LOAD
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
     LOADING
     ========================================================== */

  if (loading) {
    return (
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
      </div>
    );
  }

  /* ==========================================================
     LOAD ERROR
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

            p-6

            shadow-sm

            dark:border-red-950
            dark:bg-zinc-900

            sm:p-8
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

              bg-red-50
              text-red-600

              dark:bg-red-950/40
              dark:text-red-300
            "
          >
            <AlertTriangle
              className="
                h-6
                w-6
              "
            />
          </div>

          <h1
            className="
              mt-5
              text-2xl
              font-bold
              tracking-tight
              text-zinc-950

              dark:text-white
            "
          >
            Administrator settings unavailable
          </h1>

          <p
            className="
              mt-2
              max-w-xl
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

              dark:bg-white
              dark:text-zinc-950
              dark:hover:bg-zinc-200
            "
          >
            <RefreshCw
              className="
                h-4
                w-4
              "
            />

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
     PAGE
     ========================================================== */

  return (
    <>
      <div
        className="
          mx-auto
          w-full
          max-w-6xl
        "
      >
        {/* ====================================================
            HEADER
            ==================================================== */}

        <div
          className="
            flex
            flex-col
            gap-4

            sm:flex-row
            sm:items-end
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
                font-medium
                text-zinc-500
              "
            >
              <Settings
                className="
                  h-4
                  w-4
                "
              />

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
                max-w-2xl

                text-sm
                leading-6
                text-zinc-500
              "
            >
              Manage your Platform Administrator identity and
              authentication details.
            </p>
          </div>

          <div
            className="
              inline-flex
              w-fit
              items-center
              gap-2

              rounded-full

              border
              border-zinc-200

              bg-white

              px-3
              py-1.5

              text-xs
              font-semibold
              text-zinc-700

              shadow-sm

              dark:border-zinc-800
              dark:bg-zinc-900
              dark:text-zinc-300
            "
          >
            <ShieldCheck
              className="
                h-4
                w-4
              "
            />

            {roleLabel(
              account.role
            )}
          </div>
        </div>

        {/* ====================================================
            ACCOUNT SUMMARY
            ==================================================== */}

        <section
          className="
            mt-8

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
              flex-col
              gap-5

              border-b
              border-zinc-200

              p-6

              dark:border-zinc-800

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

                  bg-zinc-100

                  dark:bg-zinc-800
                "
              >
                <UserRound
                  className="
                    h-6
                    w-6
                  "
                />
              </div>

              <div className="min-w-0">
                <h2
                  className="
                    truncate
                    text-lg
                    font-bold
                    text-zinc-950

                    dark:text-white
                  "
                >
                  {account.fullName}
                </h2>

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
                  inline-flex
                  items-center

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
                {statusLabel(
                  account.status
                )}
              </span>

              {account.emailVerified ? (
                <span
                  className="
                    inline-flex
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
                  <BadgeCheck
                    className="
                      h-4
                      w-4
                    "
                  />

                  Verified
                </span>
              ) : (
                <span
                  className="
                    inline-flex
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
                  <AlertTriangle
                    className="
                      h-4
                      w-4
                    "
                  />

                  Unverified
                </span>
              )}
            </div>
          </div>

          <div
            className="
              grid

              divide-y
              divide-zinc-200

              dark:divide-zinc-800

              md:grid-cols-3
              md:divide-x
              md:divide-y-0
            "
          >
            <div className="p-5">
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wide
                  text-zinc-400
                "
              >
                Administrator role
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

            <div className="p-5">
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wide
                  text-zinc-400
                "
              >
                Email verified
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
                  ? formatDateTime(
                      account.emailVerifiedAt
                    )
                  : 'No'}
              </p>
            </div>

            <div className="p-5">
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
        </section>

        {/* ====================================================
            PRIMARY EMAIL
            ==================================================== */}

        <section
          className="
            mt-6

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

                dark:bg-zinc-800
              "
            >
              <Mail
                className="
                  h-5
                  w-5
                "
              />
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
                Primary email
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  leading-6
                  text-zinc-500
                "
              >
                Your primary email identifies your Platform
                Administrator account and is used when signing in.
              </p>
            </div>
          </div>

          <div className="p-6">
            {/* ================================================
                CURRENT EMAIL
                ================================================ */}

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
                </div>

                {account.emailVerified && (
                  <div
                    className="
                      inline-flex
                      w-fit
                      items-center
                      gap-1.5

                      text-xs
                      font-semibold
                      text-emerald-600

                      dark:text-emerald-300
                    "
                  >
                    <CheckCircle2
                      className="
                        h-4
                        w-4
                      "
                    />

                    Verified
                  </div>
                )}
              </div>
            </div>

            {/* ================================================
                NO PENDING CHANGE
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
                  New email address
                </label>

                <p
                  className="
                    mt-1
                    text-sm
                    leading-6
                    text-zinc-500
                  "
                >
                  We will send a 6-digit verification code to the
                  new address before changing your administrator
                  identity.
                </p>

                <div
                  className="
                    mt-4
                    flex
                    flex-col
                    gap-3

                    sm:flex-row
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
                      disabled={
                        requesting
                      }
                      onChange={event =>
                        setNewEmail(
                          event.target
                            .value
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
                      shrink-0
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
                      <ArrowRight
                        className="
                          h-4
                          w-4
                        "
                      />
                    )}

                    Send verification code
                  </button>
                </div>
              </form>
            )}

            {/* ================================================
                PENDING EMAIL CHANGE
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
                        <Clock3
                          className="
                            h-4
                            w-4
                          "
                        />

                        Pending verification
                      </div>

                      <p
                        className="
                          mt-2
                          text-sm
                          leading-6
                          text-zinc-500
                        "
                      >
                        A verification code was sent to:
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
                      disabled={
                        cancelling
                      }
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
                        <X
                          className="
                            h-4
                            w-4
                          "
                        />
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

                      sm:flex-row
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
                        disabled={
                          verifying
                        }
                        onChange={event =>
                          setVerificationCode(
                            normalizeCode(
                              event
                                .target
                                .value
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
                        verificationCode
                          .length !==
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
                        <BadgeCheck
                          className="
                            h-4
                            w-4
                          "
                        />
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
                    <div
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
                    </div>

                    <button
                      type="button"
                      disabled={
                        requesting ||
                        resendCooldown >
                          0
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
                        <RotateCcw
                          className="
                            h-4
                            w-4
                          "
                        />
                      )}

                      {resendCooldown >
                      0
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
        </section>

        {/* ====================================================
            SECURITY NOTICE
            ==================================================== */}

        <section
          className="
            mt-6

            rounded-3xl

            border
            border-zinc-200

            bg-white

            p-6

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

                bg-amber-50
                text-amber-600

                dark:bg-amber-950/40
                dark:text-amber-300
              "
            >
              <LockKeyhole
                className="
                  h-5
                  w-5
                "
              />
            </div>

            <div>
              <h2
                className="
                  text-sm
                  font-bold
                  text-zinc-950

                  dark:text-white
                "
              >
                Security after changing your email
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
                Your primary email is part of your Platform
                Administrator identity. After it is successfully
                changed, existing administrator sessions are
                invalidated and you must sign in again using the new
                email address.
              </p>
            </div>
          </div>
        </section>
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