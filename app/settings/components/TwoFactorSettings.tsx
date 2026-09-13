'use client';

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type TwoFactorStatus = {
  enabled: boolean;
  authenticatorCount: number;
  recoveryCodeCount: number;
};

type SetupData = {
  authenticatorId: string;
  secret: string;
  otpAuthUrl: string;
  addingAdditionalAuthenticator: boolean;
};

type ApiResponse = {
  success?: boolean;

  code?: string;

  error?: string;

  message?: string;

  retryAfterSeconds?:
    | number
    | null;

  twoFactor?:
    TwoFactorStatus;

  setup?:
    SetupData;

  recoveryCodes?:
    string[];
};

type SecurityAction =
  | 'add-authenticator'
  | 'regenerate-recovery'
  | 'disable-two-factor'
  | null;

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

/* ============================================================
   CONSTANTS
   ============================================================ */

const STATUS_ENDPOINT =
  '/api/account/security/two-factor';

const SETUP_ENDPOINT =
  '/api/account/security/two-factor/setup';

const CONFIRM_ENDPOINT =
  '/api/account/security/two-factor/confirm';

const RECOVERY_ENDPOINT =
  '/api/account/security/two-factor/recovery-codes';

/* ============================================================
   HELPERS
   ============================================================ */

async function readApiResponse(
  response: Response
): Promise<ApiResponse> {
  try {
    return (
      await response.json()
    ) as ApiResponse;
  } catch {
    return {
      success: false,

      code:
        'INVALID_SERVER_RESPONSE',

      error:
        'SaMi returned an invalid server response.',
    };
  }
}

function formatRetryMessage(
  seconds: number
) {
  if (
    seconds <=
    60
  ) {
    return `${seconds} seconds`;
  }

  const minutes =
    Math.ceil(
      seconds / 60
    );

  return `${minutes} ${
    minutes === 1
      ? 'minute'
      : 'minutes'
  }`;
}

function cleanAuthenticatorCode(
  value: string
) {
  return value
    .replace(
      /\D/g,
      ''
    )
    .slice(
      0,
      6
    );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function TwoFactorSettings() {
  const router =
    useRouter();

  /* ==========================================================
     STATUS
     ========================================================== */

  const [
    status,
    setStatus,
  ] =
    useState<TwoFactorStatus | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false
    );

  /* ==========================================================
     ACTION
     ========================================================== */

  const [
    action,
    setAction,
  ] =
    useState<SecurityAction>(
      null
    );

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState('');

  const [
    existingTwoFactorCode,
    setExistingTwoFactorCode,
  ] =
    useState('');

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false
    );

  /* ==========================================================
     AUTHENTICATOR SETUP
     ========================================================== */

  const [
    setup,
    setSetup,
  ] =
    useState<SetupData | null>(
      null
    );

  const [
    setupCode,
    setSetupCode,
  ] =
    useState('');

  /* ==========================================================
     RECOVERY CODES
     ========================================================== */

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] =
    useState<string[]>(
      []
    );

  /* ==========================================================
     REQUEST
     ========================================================== */

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState | null>(
      null
    );

  /* ==========================================================
     DERIVED
     ========================================================== */

  const enabled =
    status?.enabled ===
    true;

  const requiresExistingTwoFactor =
    enabled ||
    (
      status
        ?.authenticatorCount ??
      0
    ) >
      0;

  const recoveryCodesText =
    useMemo(
      () =>
        recoveryCodes.join(
          '\n'
        ),
      [
        recoveryCodes,
      ]
    );

  /* ==========================================================
     OVERLAY HELPERS
     ========================================================== */

  const showError =
    useCallback(
      (
        title: string,
        message: string
      ) => {
        setOverlay({
          type:
            'error',

          title,

          message,
        });
      },
      []
    );

  const showWarning =
    useCallback(
      (
        title: string,
        message: string
      ) => {
        setOverlay({
          type:
            'warning',

          title,

          message,
        });
      },
      []
    );

  const showSuccess =
    useCallback(
      (
        title: string,
        message: string
      ) => {
        setOverlay({
          type:
            'success',

          title,

          message,
        });
      },
      []
    );

  /* ==========================================================
     UNAUTHENTICATED
     ========================================================== */

  const handleUnauthenticated =
    useCallback(
      (
        response:
          ApiResponse
      ) => {
        if (
          response.code !==
          'UNAUTHENTICATED'
        ) {
          return false;
        }

        setOverlay({
          type:
            'warning',

          title:
            'Session expired',

          message:
            'Your SaMi session has expired. Sign in again to continue.',

          primaryAction: {
            label:
              'Sign in',

            onClick:
              () => {
                setOverlay(
                  null
                );

                router.replace(
                  '/login?reason=session_expired'
                );

                router.refresh();
              },
          },
        });

        return true;
      },
      [
        router,
      ]
    );

  /* ==========================================================
     API ERROR
     ========================================================== */

  const showApiError =
    useCallback(
      (
        response:
          ApiResponse,

        fallback:
          string
      ) => {
        let message =
          response.error ||
          response.message ||
          fallback;

        if (
          typeof response
            .retryAfterSeconds ===
            'number' &&
          response
            .retryAfterSeconds >
            0
        ) {
          message +=
            ` Try again in ${formatRetryMessage(
              response
                .retryAfterSeconds
            )}.`;
        }

        showError(
          'Security action failed',
          message
        );
      },
      [
        showError,
      ]
    );

  /* ==========================================================
     LOAD STATUS
     ========================================================== */

  const loadStatus =
    useCallback(
      async (
        manual =
          false
      ) => {
        if (
          manual
        ) {
          setRefreshing(
            true
          );
        } else {
          setLoading(
            true
          );
        }

        try {
          const response =
            await fetch(
              STATUS_ENDPOINT,
              {
                method:
                  'GET',

                headers: {
                  Accept:
                    'application/json',
                },

                credentials:
                  'same-origin',

                cache:
                  'no-store',
              }
            );

          const data =
            await readApiResponse(
              response
            );

          if (
            handleUnauthenticated(
              data
            )
          ) {
            return;
          }

          if (
            !response.ok ||
            !data.success ||
            !data.twoFactor
          ) {
            showApiError(
              data,
              'SaMi could not load your authenticator settings.'
            );

            return;
          }

          setStatus(
            data.twoFactor
          );

          if (
            manual
          ) {
            showSuccess(
              'Security status refreshed',
              'Your authenticator and recovery-code status is up to date.'
            );
          }
        } catch {
          showError(
            'Could not load security settings',
            'SaMi could not connect to the server. Check your connection and try again.'
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        handleUnauthenticated,
        showApiError,
        showError,
        showSuccess,
      ]
    );

  useEffect(
    () => {
      void loadStatus();
    },
    [
      loadStatus,
    ]
  );

  /* ==========================================================
     CLEAR FORM
     ========================================================== */

  function clearVerificationFields() {
    setCurrentPassword(
      ''
    );

    setExistingTwoFactorCode(
      ''
    );

    setShowPassword(
      false
    );
  }

  function closeAction() {
    if (
      submitting
    ) {
      return;
    }

    setAction(
      null
    );

    clearVerificationFields();
  }

  function cancelSetup() {
    if (
      submitting
    ) {
      return;
    }

    setSetup(
      null
    );

    setSetupCode(
      ''
    );

    clearVerificationFields();
  }

  /* ==========================================================
     OPEN ACTIONS
     ========================================================== */

  function openAddAuthenticator() {
    setOverlay(
      null
    );

    setAction(
      'add-authenticator'
    );

    clearVerificationFields();
  }

  function requestRecoveryRegeneration() {
    setOverlay({
      type:
        'warning',

      title:
        'Generate new recovery codes?',

      message:
        'Generating a new set will immediately invalidate every unused recovery code from your current set.',

      primaryAction: {
        label:
          'Continue',

        onClick:
          () => {
            setOverlay(
              null
            );

            setAction(
              'regenerate-recovery'
            );

            clearVerificationFields();
          },
      },

      secondaryAction: {
        label:
          'Cancel',

        onClick:
          () => {
            setOverlay(
              null
            );
          },
      },
    });
  }

  function requestDisableTwoFactor() {
    setOverlay({
      type:
        'warning',

      title:
        'Disable authenticator protection?',

      message:
        'Authenticator verification will stop protecting your account, unused recovery codes will be revoked, and your other active SaMi sessions will be signed out.',

      primaryAction: {
        label:
          'Continue',

        onClick:
          () => {
            setOverlay(
              null
            );

            setAction(
              'disable-two-factor'
            );

            clearVerificationFields();
          },
      },

      secondaryAction: {
        label:
          'Cancel',

        onClick:
          () => {
            setOverlay(
              null
            );
          },
      },
    });
  }

  /* ==========================================================
     START SETUP
     ========================================================== */

  async function startSetup() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !currentPassword
    ) {
      showWarning(
        'Current password required',
        'Enter your current password before starting authenticator setup.'
      );

      return;
    }

    if (
      requiresExistingTwoFactor &&
      !existingTwoFactorCode
    ) {
      showWarning(
        'Verification code required',
        'Enter your current authenticator code or an unused recovery code before adding another authenticator.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          SETUP_ENDPOINT,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                currentPassword,

                twoFactorCode:
                  requiresExistingTwoFactor
                    ? existingTwoFactorCode
                    : undefined,
              }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        handleUnauthenticated(
          data
        )
      ) {
        return;
      }

      if (
        !response.ok ||
        !data.success ||
        !data.setup
      ) {
        showApiError(
          data,
          'SaMi could not start authenticator setup.'
        );

        return;
      }

      clearVerificationFields();

      setAction(
        null
      );

      setSetup(
        data.setup
      );

      setSetupCode(
        ''
      );

      showSuccess(
        'Authenticator setup started',
        'Add SaMi to your authenticator app using the displayed setup details, then enter the current 6-digit code.'
      );
    } catch {
      showError(
        'Could not start authenticator setup',
        'SaMi could not connect to the server. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     CONFIRM SETUP
     ========================================================== */

  async function confirmSetup() {
    if (
      submitting ||
      !setup
    ) {
      return;
    }

    if (
      !/^\d{6}$/.test(
        setupCode
      )
    ) {
      showWarning(
        'Enter the authenticator code',
        'Enter the current 6-digit code generated by your authenticator app.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          CONFIRM_ENDPOINT,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                authenticatorId:
                  setup.authenticatorId,

                code:
                  setupCode,
              }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        handleUnauthenticated(
          data
        )
      ) {
        return;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        showApiError(
          data,
          'SaMi could not confirm your authenticator.'
        );

        return;
      }

      if (
        data.twoFactor
      ) {
        setStatus(
          data.twoFactor
        );
      } else {
        await loadStatus();
      }

      setSetup(
        null
      );

      setSetupCode(
        ''
      );

      setRecoveryCodes(
        Array.isArray(
          data.recoveryCodes
        )
          ? data.recoveryCodes
          : []
      );

      showSuccess(
        setup.addingAdditionalAuthenticator
          ? 'Authenticator added'
          : 'Two-factor authentication enabled',

        Array.isArray(
          data.recoveryCodes
        ) &&
        data.recoveryCodes.length >
          0
          ? 'Your authenticator is active. Save the recovery codes shown on this screen before leaving.'
          : 'Your authenticator is now active.'
      );
    } catch {
      showError(
        'Could not confirm authenticator',
        'SaMi could not connect to the server. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     REGENERATE RECOVERY CODES
     ========================================================== */

  async function regenerateRecoveryCodes() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !currentPassword
    ) {
      showWarning(
        'Current password required',
        'Enter your current password before generating new recovery codes.'
      );

      return;
    }

    if (
      !existingTwoFactorCode
    ) {
      showWarning(
        'Verification code required',
        'Enter your current authenticator code or an unused recovery code.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          RECOVERY_ENDPOINT,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                currentPassword,

                twoFactorCode:
                  existingTwoFactorCode,
              }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        handleUnauthenticated(
          data
        )
      ) {
        return;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        showApiError(
          data,
          'SaMi could not generate new recovery codes.'
        );

        return;
      }

      if (
        data.twoFactor
      ) {
        setStatus(
          data.twoFactor
        );
      }

      setRecoveryCodes(
        Array.isArray(
          data.recoveryCodes
        )
          ? data.recoveryCodes
          : []
      );

      setAction(
        null
      );

      clearVerificationFields();

      showSuccess(
        'Recovery codes regenerated',
        'Your previous unused recovery codes no longer work. Save the new recovery codes shown on this screen.'
      );
    } catch {
      showError(
        'Could not generate recovery codes',
        'SaMi could not connect to the server. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     DISABLE AUTHENTICATOR 2FA
     ========================================================== */

  async function disableTwoFactor() {
    if (
      submitting
    ) {
      return;
    }

    if (
      !currentPassword
    ) {
      showWarning(
        'Current password required',
        'Enter your current password before disabling authenticator protection.'
      );

      return;
    }

    if (
      !existingTwoFactorCode
    ) {
      showWarning(
        'Verification code required',
        'Enter your current authenticator code or an unused recovery code.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          STATUS_ENDPOINT,
          {
            method:
              'DELETE',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                currentPassword,

                twoFactorCode:
                  existingTwoFactorCode,
              }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        handleUnauthenticated(
          data
        )
      ) {
        return;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        showApiError(
          data,
          'SaMi could not disable authenticator protection.'
        );

        return;
      }

      if (
        data.twoFactor
      ) {
        setStatus(
          data.twoFactor
        );
      } else {
        await loadStatus();
      }

      setAction(
        null
      );

      setSetup(
        null
      );

      setSetupCode(
        ''
      );

      setRecoveryCodes(
        []
      );

      clearVerificationFields();

      showSuccess(
        'Authenticator protection disabled',
        data.message ||
          'Authenticator-based two-factor verification has been disabled. Your other active sessions were signed out.'
      );
    } catch {
      showError(
        'Could not disable authenticator protection',
        'SaMi could not connect to the server. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     COPY SETUP SECRET
     ========================================================== */

  async function copySetupSecret() {
    if (
      !setup
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        setup.secret
      );

      showSuccess(
        'Authenticator secret copied',
        'The manual authenticator setup secret has been copied to your clipboard.'
      );
    } catch {
      showError(
        'Could not copy secret',
        'Your browser could not copy the authenticator secret automatically.'
      );
    }
  }

  /* ==========================================================
     COPY RECOVERY CODES
     ========================================================== */

  async function copyRecoveryCodes() {
    if (
      recoveryCodes.length ===
      0
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        recoveryCodesText
      );

      showSuccess(
        'Recovery codes copied',
        'Store the copied recovery codes somewhere private and secure.'
      );
    } catch {
      showError(
        'Could not copy recovery codes',
        'Your browser could not copy the recovery codes automatically.'
      );
    }
  }

  /* ==========================================================
     DOWNLOAD RECOVERY CODES
     ========================================================== */

  function downloadRecoveryCodes() {
    if (
      recoveryCodes.length ===
      0
    ) {
      return;
    }

    try {
      const content = [
        'SaMi Recovery Codes',
        '',
        'Keep these codes private.',
        'Each code can be used only once.',
        'Generating a new set invalidates unused codes from this set.',
        '',
        ...recoveryCodes,
        '',
      ].join(
        '\n'
      );

      const blob =
        new Blob(
          [
            content,
          ],
          {
            type:
              'text/plain;charset=utf-8',
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          'a'
        );

      anchor.href =
        url;

      anchor.download =
        'sami-recovery-codes.txt';

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(
        url
      );

      showSuccess(
        'Recovery codes saved',
        'A text file containing your recovery codes has been created. Store it somewhere private and secure.'
      );
    } catch {
      showError(
        'Could not save recovery codes',
        'SaMi could not create the recovery-code text file.'
      );
    }
  }

  /* ==========================================================
     RECOVERY CODES DONE
     ========================================================== */

  function hideRecoveryCodes() {
    setRecoveryCodes(
      []
    );

    showSuccess(
      'Recovery codes hidden',
      'SaMi will not display that plaintext recovery-code set again.'
    );
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <>
        {overlay && (
          <SaMiOverlay
            open
            type={
              overlay.type
            }
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
              setOverlay(
                null
              )
            }
          />
        )}

        <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border border-slate-200 dark:border-slate-800">

          <div className="text-center">

            <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

            <p className="mt-3 text-xs font-black text-slate-700 dark:text-slate-200">
              Loading authenticator settings
            </p>
          </div>
        </div>
      </>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {/* ======================================================
          GLOBAL FEEDBACK OVERLAY
          ====================================================== */}

      {overlay && (
        <SaMiOverlay
          open
          type={
            overlay.type
          }
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
            setOverlay(
              null
            )
          }
        />
      )}

      <div className="space-y-5">

        {/* ====================================================
            STATUS HEADER
            ==================================================== */}

        <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">

          <div className="flex items-start gap-4">

            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                enabled
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>

              <div className="flex flex-wrap items-center gap-2">

                <h3 className="text-sm font-black text-slate-950 dark:text-white">
                  Authenticator app
                </h3>

                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
                    enabled
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {enabled
                    ? 'Enabled'
                    : 'Disabled'}
                </span>
              </div>

              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                Use a TOTP-compatible authenticator app as a second verification step during sign-in.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadStatus(
                true
              )
            }
            disabled={
              refreshing ||
              submitting
            }
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />

            Refresh
          </button>
        </div>

        {/* ====================================================
            RECOVERY CODES
            ==================================================== */}

        {recoveryCodes.length >
          0 && (
          <RecoveryCodesPanel
            codes={
              recoveryCodes
            }
            onCopy={() =>
              void copyRecoveryCodes()
            }
            onDownload={
              downloadRecoveryCodes
            }
            onDone={
              hideRecoveryCodes
            }
          />
        )}

        {/* ====================================================
            ACTIVE SETUP
            ==================================================== */}

        {setup && (
          <AuthenticatorSetupPanel
            setup={
              setup
            }
            code={
              setupCode
            }
            submitting={
              submitting
            }
            onCodeChange={
              setSetupCode
            }
            onCopySecret={() =>
              void copySetupSecret()
            }
            onConfirm={() =>
              void confirmSetup()
            }
            onCancel={
              cancelSetup
            }
          />
        )}

        {/* ====================================================
            CURRENT STATUS
            ==================================================== */}

        {!setup && (
          <>
            {enabled ? (
              <div className="grid gap-3 sm:grid-cols-2">

                <SecurityInfoCard
                  icon={
                    Smartphone
                  }
                  label="Authenticators"
                  value={
                    String(
                      status
                        ?.authenticatorCount ??
                        0
                    )
                  }
                  description="Active authenticator apps currently protecting this account."
                />

                <SecurityInfoCard
                  icon={
                    KeyRound
                  }
                  label="Recovery codes"
                  value={
                    String(
                      status
                        ?.recoveryCodeCount ??
                        0
                    )
                  }
                  description="Unused one-time recovery codes currently available."
                />
              </div>
            ) : (
              <div className="rounded-[22px] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">

                <div className="flex items-start gap-3">

                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

                  <div className="flex-1">

                    <p className="text-sm font-black text-blue-950 dark:text-blue-200">
                      Authenticator protection is off
                    </p>

                    <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
                      Enable an authenticator app to require a rotating verification code after your password during sign-in.
                    </p>

                    <button
                      type="button"
                      onClick={
                        openAddAuthenticator
                      }
                      className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700"
                    >
                      <ShieldCheck className="h-4 w-4" />

                      Enable authenticator
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ====================================================
            ENABLED ACTIONS
            ==================================================== */}

        {enabled &&
          !setup && (
          <div className="grid gap-3">

            <ActionCard
              icon={
                Plus
              }
              title="Add authenticator"
              description="Connect another authenticator app to this SaMi account."
              actionLabel="Add authenticator"
              onAction={
                openAddAuthenticator
              }
            />

            <ActionCard
              icon={
                KeyRound
              }
              title="Generate new recovery codes"
              description="Create a fresh recovery-code set. Existing unused recovery codes will stop working."
              actionLabel="Generate codes"
              onAction={
                requestRecoveryRegeneration
              }
            />

            <ActionCard
              icon={
                Trash2
              }
              title="Disable authenticator"
              description="Remove authenticator-based two-factor protection from this account."
              actionLabel="Disable"
              danger
              onAction={
                requestDisableTwoFactor
              }
            />
          </div>
        )}

        {/* ====================================================
            REAUTHENTICATION
            ==================================================== */}

        {action &&
          !setup && (
          <SecurityActionPanel
            action={
              action
            }
            currentPassword={
              currentPassword
            }
            twoFactorCode={
              existingTwoFactorCode
            }
            showPassword={
              showPassword
            }
            requireTwoFactor={
              requiresExistingTwoFactor
            }
            submitting={
              submitting
            }
            onPasswordChange={
              setCurrentPassword
            }
            onTwoFactorCodeChange={
              setExistingTwoFactorCode
            }
            onTogglePassword={() =>
              setShowPassword(
                (
                  current
                ) =>
                  !current
              )
            }
            onCancel={
              closeAction
            }
            onSubmit={() => {
              if (
                action ===
                'add-authenticator'
              ) {
                void startSetup();

                return;
              }

              if (
                action ===
                'regenerate-recovery'
              ) {
                void regenerateRecoveryCodes();

                return;
              }

              if (
                action ===
                'disable-two-factor'
              ) {
                void disableTwoFactor();
              }
            }}
          />
        )}

        {/* ====================================================
            STATIC SECURITY GUIDANCE
            ==================================================== */}

        <div className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">

          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            Authenticator secrets are encrypted before storage. Recovery codes are stored as cryptographic hashes and plaintext recovery codes are displayed only when a new set is created.
          </p>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   SECURITY ACTION PANEL
   ============================================================ */

function SecurityActionPanel({
  action,
  currentPassword,
  twoFactorCode,
  showPassword,
  requireTwoFactor,
  submitting,
  onPasswordChange,
  onTwoFactorCodeChange,
  onTogglePassword,
  onCancel,
  onSubmit,
}: {
  action:
    Exclude<
      SecurityAction,
      null
    >;

  currentPassword:
    string;

  twoFactorCode:
    string;

  showPassword:
    boolean;

  requireTwoFactor:
    boolean;

  submitting:
    boolean;

  onPasswordChange:
    (
      value:
        string
    ) => void;

  onTwoFactorCodeChange:
    (
      value:
        string
    ) => void;

  onTogglePassword:
    () => void;

  onCancel:
    () => void;

  onSubmit:
    () => void;
}) {
  const configuration =
    getActionConfiguration(
      action
    );

  return (
    <div
      className={`rounded-[22px] border p-5 ${
        configuration.danger
          ? 'border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/15'
          : 'border-blue-200 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/15'
      }`}
    >

      <div className="flex items-start justify-between gap-4">

        <div>

          <h4 className="text-sm font-black text-slate-950 dark:text-white">
            {configuration.title}
          </h4>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            {configuration.description}
          </p>
        </div>

        <button
          type="button"
          aria-label="Cancel"
          onClick={
            onCancel
          }
          disabled={
            submitting
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-4">

        {/* CURRENT PASSWORD */}

        <div>

          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            Current password
          </label>

          <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

            <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={
                currentPassword
              }
              onChange={(
                event
              ) =>
                onPasswordChange(
                  event.target.value
                )
              }
              autoComplete="current-password"
              maxLength={
                128
              }
              disabled={
                submitting
              }
              className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none disabled:opacity-60"
            />

            <button
              type="button"
              onClick={
                onTogglePassword
              }
              disabled={
                submitting
              }
              aria-label={
                showPassword
                  ? 'Hide password'
                  : 'Show password'
              }
              className="text-slate-400 transition hover:text-slate-700 disabled:opacity-50 dark:hover:text-white"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* CURRENT SECOND FACTOR */}

        {requireTwoFactor && (
          <div>

            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              Current authenticator or recovery code
            </label>

            <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

              <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />

              <input
                type="text"
                value={
                  twoFactorCode
                }
                onChange={(
                  event
                ) =>
                  onTwoFactorCodeChange(
                    event.target.value
                  )
                }
                autoComplete="one-time-code"
                maxLength={
                  64
                }
                disabled={
                  submitting
                }
                placeholder="Authenticator or recovery code"
                className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
            </div>

            <p className="mt-1.5 text-[9px] leading-4 text-slate-400">
              Use the current 6-digit authenticator code or one unused SaMi recovery code.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

        <button
          type="button"
          onClick={
            onCancel
          }
          disabled={
            submitting
          }
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={
            onSubmit
          }
          disabled={
            submitting
          }
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            configuration.danger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : configuration.danger ? (
            <Trash2 className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}

          {submitting
            ? 'Verifying...'
            : configuration.button}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   AUTHENTICATOR SETUP PANEL
   ============================================================ */

function AuthenticatorSetupPanel({
  setup,
  code,
  submitting,
  onCodeChange,
  onCopySecret,
  onConfirm,
  onCancel,
}: {
  setup:
    SetupData;

  code:
    string;

  submitting:
    boolean;

  onCodeChange:
    (
      value:
        string
    ) => void;

  onCopySecret:
    () => void;

  onConfirm:
    () => void;

  onCancel:
    () => void;
}) {
  return (
    <div className="rounded-[24px] border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/60 dark:bg-blue-950/15">

      <div className="flex items-start justify-between gap-4">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Smartphone className="h-4 w-4" />
          </div>

          <div>

            <h4 className="text-sm font-black text-slate-950 dark:text-white">
              {setup.addingAdditionalAuthenticator
                ? 'Add authenticator'
                : 'Set up authenticator'}
            </h4>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Add SaMi to a TOTP-compatible authenticator, then verify the current code.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={
            onCancel
          }
          disabled={
            submitting
          }
          aria-label="Cancel authenticator setup"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* STEP 1 */}

      <div className="mt-5 rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">

        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400">
          Step 1
        </p>

        <p className="mt-2 text-xs font-black text-slate-900 dark:text-white">
          Add SaMi to your authenticator
        </p>

        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          Open the authenticator link where supported or choose manual setup and enter the secret below.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">

          <a
            href={
              setup.otpAuthUrl
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />

            Open authenticator
          </a>

          <button
            type="button"
            onClick={
              onCopySecret
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Copy className="h-4 w-4" />

            Copy secret
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-950">

          <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
            Manual setup secret
          </p>

          <p className="mt-2 break-all font-mono text-xs font-black tracking-[0.08em] text-slate-900 dark:text-white">
            {setup.secret}
          </p>
        </div>

        <p className="mt-3 text-[9px] leading-4 text-slate-500 dark:text-slate-400">
          Keep this setup secret private. Anyone who obtains it can generate valid authenticator codes.
        </p>
      </div>

      {/* STEP 2 */}

      <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">

        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400">
          Step 2
        </p>

        <p className="mt-2 text-xs font-black text-slate-900 dark:text-white">
          Verify your authenticator
        </p>

        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          Enter the current 6-digit code generated for SaMi.
        </p>

        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={
            code
          }
          onChange={(
            event
          ) =>
            onCodeChange(
              cleanAuthenticatorCode(
                event.target.value
              )
            )
          }
          maxLength={
            6
          }
          disabled={
            submitting
          }
          placeholder="000000"
          className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-lg font-black tracking-[0.35em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
        />

        <button
          type="button"
          onClick={
            onConfirm
          }
          disabled={
            submitting ||
            code.length !==
              6
          }
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}

          {submitting
            ? 'Verifying authenticator...'
            : setup.addingAdditionalAuthenticator
              ? 'Verify and add authenticator'
              : 'Verify and enable authenticator'}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   RECOVERY CODES PANEL
   ============================================================ */

function RecoveryCodesPanel({
  codes,
  onCopy,
  onDownload,
  onDone,
}: {
  codes:
    string[];

  onCopy:
    () => void;

  onDownload:
    () => void;

  onDone:
    () => void;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/40">

      <div>

        <p className="text-sm font-black text-slate-950 dark:text-white">
          Recovery codes
        </p>

        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
          Store these codes securely. Each code works once and can be used when your authenticator is unavailable.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">

        {codes.map(
          (
            code,
            index
          ) => (
            <div
              key={`${code}-${index}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs font-black tracking-[0.08em] text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            >
              {code}
            </div>
          )
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">

        <button
          type="button"
          onClick={
            onCopy
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Copy className="h-4 w-4" />

          Copy codes
        </button>

        <button
          type="button"
          onClick={
            onDownload
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />

          Save text file
        </button>

        <button
          type="button"
          onClick={
            onDone
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700 sm:ml-auto"
        >
          <Check className="h-4 w-4" />

          I&apos;ve saved them
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   ACTION CARD
   ============================================================ */

function ActionCard({
  icon:
    Icon,
  title,
  description,
  actionLabel,
  danger = false,
  onAction,
}: {
  icon:
    typeof ShieldCheck;

  title:
    string;

  description:
    string;

  actionLabel:
    string;

  danger?:
    boolean;

  onAction:
    () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center">

      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          danger
            ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">

        <p className="text-xs font-black text-slate-900 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <button
        type="button"
        onClick={
          onAction
        }
        className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl border px-3 text-[10px] font-black transition ${
          danger
            ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/30'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

/* ============================================================
   INFO CARD
   ============================================================ */

function SecurityInfoCard({
  icon:
    Icon,
  label,
  value,
  description,
}: {
  icon:
    typeof ShieldCheck;

  label:
    string;

  value:
    string;

  description:
    string;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 p-4 dark:border-slate-800">

      <div className="flex items-center gap-3">

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </div>

        <div>

          <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
            {label}
          </p>

          <p className="mt-0.5 text-lg font-black text-slate-950 dark:text-white">
            {value}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

/* ============================================================
   ACTION CONFIGURATION
   ============================================================ */

function getActionConfiguration(
  action:
    Exclude<
      SecurityAction,
      null
    >
) {
  switch (
    action
  ) {
    case 'regenerate-recovery':
      return {
        title:
          'Verify your identity',

        description:
          'Confirm your identity before replacing your current recovery-code set.',

        button:
          'Generate new codes',

        danger:
          false,
      };

    case 'disable-two-factor':
      return {
        title:
          'Verify your identity',

        description:
          'Confirm your identity before disabling authenticator protection.',

        button:
          'Disable authenticator',

        danger:
          true,
      };

    default:
      return {
        title:
          'Verify your identity',

        description:
          'Confirm your identity before starting authenticator setup.',

        button:
          'Continue setup',

        danger:
          false,
      };
  }
}