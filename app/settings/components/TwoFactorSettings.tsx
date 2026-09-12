'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
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

type NoticeState = {
  type:
    | 'success'
    | 'error'
    | 'warning';

  message:
    string;
};

type SecurityAction =
  | 'add-authenticator'
  | 'regenerate-recovery'
  | 'disable-two-factor'
  | null;

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
  response:
    Response
): Promise<ApiResponse> {
  try {
    return (
      await response.json()
    ) as ApiResponse;
  } catch {
    return {
      success:
        false,

      code:
        'INVALID_SERVER_RESPONSE',

      error:
        'SaMi returned an invalid server response.',
    };
  }
}

function formatRetryMessage(
  seconds:
    number
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
    minutes ===
    1
      ? 'minute'
      : 'minutes'
  }`;
}

function cleanAuthenticatorCode(
  value:
    string
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
     SECURITY ACTION
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
     SETUP
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

  const [
    codesCopied,
    setCodesCopied,
  ] =
    useState(
      false
    );

  /* ==========================================================
     REQUEST STATE
     ========================================================== */

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  const [
    notice,
    setNotice,
  ] =
    useState<NoticeState | null>(
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
     SESSION FAILURE
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

        router.replace(
          '/login?reason=session_expired'
        );

        router.refresh();

        return true;
      },
      [
        router,
      ]
    );

  /* ==========================================================
     ERROR
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

        setNotice({
          type:
            'error',

          message,
        });
      },
      []
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
            throw new Error(
              data.error ||
                'SaMi could not load two-factor authentication settings.'
            );
          }

          setStatus(
            data.twoFactor
          );

          if (
            manual
          ) {
            setNotice({
              type:
                'success',

              message:
                'Security status refreshed.',
            });
          }
        } catch (
          error
        ) {
          setNotice({
            type:
              'error',

            message:
              error instanceof
              Error
                ? error.message
                : 'SaMi could not load two-factor authentication settings.',
          });
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
     RESET SENSITIVE FORM VALUES
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

    /*
     * The pending server-side authenticator is harmless.
     *
     * Starting another setup later automatically revokes the
     * unfinished pending setup.
     */
    setSetup(
      null
    );

    setSetupCode(
      ''
    );

    clearVerificationFields();
  }

  /* ==========================================================
     START AUTHENTICATOR SETUP
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
      setNotice({
        type:
          'error',

        message:
          'Enter your current password.',
      });

      return;
    }

    if (
      requiresExistingTwoFactor &&
      !existingTwoFactorCode
    ) {
      setNotice({
        type:
          'error',

        message:
          'Enter your current authenticator or recovery code.',
      });

      return;
    }

    setSubmitting(
      true
    );

    setNotice(
      null
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

      /*
       * Do not keep the user's password or old 2FA code in
       * component state after step-up succeeds.
       */
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

      setNotice({
        type:
          'success',

        message:
          'Authenticator setup started. Add SaMi to your authenticator app, then verify the 6-digit code.',
      });
    } catch {
      setNotice({
        type:
          'error',

        message:
          'SaMi could not connect to the server.',
      });
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
      setNotice({
        type:
          'error',

        message:
          'Enter the 6-digit code shown by your authenticator app.',
      });

      return;
    }

    setSubmitting(
      true
    );

    setNotice(
      null
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

      setCodesCopied(
        false
      );

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Two-factor authentication is now configured.',
      });
    } catch {
      setNotice({
        type:
          'error',

        message:
          'SaMi could not connect to the server.',
      });
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
      setNotice({
        type:
          'error',

        message:
          'Enter your current password.',
      });

      return;
    }

    if (
      !existingTwoFactorCode
    ) {
      setNotice({
        type:
          'error',

        message:
          'Enter your current authenticator or recovery code.',
      });

      return;
    }

    setSubmitting(
      true
    );

    setNotice(
      null
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

      setCodesCopied(
        false
      );

      setAction(
        null
      );

      clearVerificationFields();

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'New recovery codes have been generated.',
      });
    } catch {
      setNotice({
        type:
          'error',

        message:
          'SaMi could not connect to the server.',
      });
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     DISABLE 2FA
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
      setNotice({
        type:
          'error',

        message:
          'Enter your current password.',
      });

      return;
    }

    if (
      !existingTwoFactorCode
    ) {
      setNotice({
        type:
          'error',

        message:
          'Enter your current authenticator or recovery code.',
      });

      return;
    }

    setSubmitting(
      true
    );

    setNotice(
      null
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
          'SaMi could not disable two-factor authentication.'
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Two-factor authentication has been disabled.',
      });
    } catch {
      setNotice({
        type:
          'error',

        message:
          'SaMi could not connect to the server.',
      });
    } finally {
      setSubmitting(
        false
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

      setCodesCopied(
        true
      );

      setNotice({
        type:
          'success',

        message:
          'Recovery codes copied. Store them somewhere private and secure.',
      });
    } catch {
      setCodesCopied(
        false
      );

      setNotice({
        type:
          'error',

        message:
          'Your browser could not copy the recovery codes automatically.',
      });
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
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border border-slate-200 dark:border-slate-800">

        <div className="text-center">

          <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

          <p className="mt-3 text-xs font-black text-slate-700 dark:text-slate-200">
            Loading two-factor authentication
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <div className="space-y-5">

      {/* ======================================================
          HEADER
          ====================================================== */}

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
                Two-factor authentication
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
              Require an authenticator code or one-time recovery code after your password when signing in.
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

      {/* ======================================================
          NOTICE
          ====================================================== */}

      {notice && (
        <Notice
          notice={
            notice
          }
          onDismiss={() =>
            setNotice(
              null
            )
          }
        />
      )}

      {/* ======================================================
          RECOVERY CODES — SHOW ONCE
          ====================================================== */}

      {recoveryCodes.length >
        0 && (
        <RecoveryCodesPanel
          codes={
            recoveryCodes
          }
          copied={
            codesCopied
          }
          onCopy={() =>
            void copyRecoveryCodes()
          }
          onDownload={
            downloadRecoveryCodes
          }
          onDone={() => {
            setRecoveryCodes(
              []
            );

            setCodesCopied(
              false
            );

            setNotice({
              type:
                'success',

              message:
                'Recovery codes hidden. SaMi will not display this plaintext set again.',
            });
          }}
        />
      )}

      {/* ======================================================
          ACTIVE SETUP
          ====================================================== */}

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
          onConfirm={() =>
            void confirmSetup()
          }
          onCancel={
            cancelSetup
          }
        />
      )}

      {/* ======================================================
          STATUS CARDS
          ====================================================== */}

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
                description="Active authenticator apps protecting this account."
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
                description="Unused one-time recovery codes remaining."
              />
            </div>
          ) : (
            <div className="rounded-[22px] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">

              <div className="flex items-start gap-3">

                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

                <div className="flex-1">

                  <p className="text-sm font-black text-blue-950 dark:text-blue-200">
                    Add another layer of protection
                  </p>

                  <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
                    After 2FA is enabled, signing in requires your password and a code from your authenticator app or one of your recovery codes.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setAction(
                        'add-authenticator'
                      );

                      setNotice(
                        null
                      );
                    }}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700"
                  >
                    <ShieldCheck className="h-4 w-4" />

                    Enable two-factor authentication
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ======================================================
          ENABLED ACTIONS
          ====================================================== */}

      {enabled &&
        !setup && (
        <div className="grid gap-3">

          <ActionCard
            icon={
              Plus
            }
            title="Add authenticator"
            description="Connect another authenticator app. Confirming it will generate a fresh recovery-code set."
            actionLabel="Add authenticator"
            onAction={() => {
              setAction(
                'add-authenticator'
              );

              setNotice(
                null
              );
            }}
          />

          <ActionCard
            icon={
              KeyRound
            }
            title="Generate new recovery codes"
            description="Replace every unused recovery code with a new set. Previous unused codes will immediately stop working."
            actionLabel="Generate new codes"
            onAction={() => {
              setAction(
                'regenerate-recovery'
              );

              setNotice(
                null
              );
            }}
          />

          <ActionCard
            icon={
              Trash2
            }
            title="Disable two-factor authentication"
            description="Remove authenticator protection and revoke your unused recovery codes. Other signed-in devices will also be signed out."
            actionLabel="Disable 2FA"
            danger
            onAction={() => {
              setAction(
                'disable-two-factor'
              );

              setNotice(
                null
              );
            }}
          />
        </div>
      )}

      {/* ======================================================
          STEP-UP ACTION FORM
          ====================================================== */}

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

      {/* ======================================================
          SECURITY NOTE
          ====================================================== */}

      <div className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">

        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

        <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
          SaMi stores authenticator secrets encrypted and stores recovery codes only as cryptographic hashes. Plain recovery codes are displayed only when a new set is created.
        </p>
      </div>
    </div>
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

      {configuration.danger && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">

          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          <p className="text-[10px] font-semibold leading-4">
            Disabling 2FA lowers account protection and signs out your other active devices.
          </p>
        </div>
      )}

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

        {/* CURRENT 2FA */}

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
              You can use your current 6-digit authenticator code or an unused SaMi recovery code.
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

  onConfirm:
    () => void;

  onCancel:
    () => void;
}) {
  const [
    copied,
    setCopied,
  ] =
    useState(
      false
    );

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(
        setup.secret
      );

      setCopied(
        true
      );
    } catch {
      setCopied(
        false
      );
    }
  }

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
              Add SaMi to Google Authenticator, Microsoft Authenticator, Authy or another TOTP-compatible authenticator.
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
          On mobile, you can try opening the authenticator link directly. Otherwise choose manual setup in your authenticator app and enter the secret below.
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
            onClick={() =>
              void copySecret()
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}

            {copied
              ? 'Secret copied'
              : 'Copy secret'}
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

        <p className="mt-3 text-[9px] leading-4 text-amber-600 dark:text-amber-400">
          Do not share this secret. Anyone who has it can generate your authenticator codes.
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

        <div className="mt-4">

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
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-lg font-black tracking-[0.35em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

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
              : 'Verify and enable 2FA'}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   RECOVERY CODES
   ============================================================ */

function RecoveryCodesPanel({
  codes,
  copied,
  onCopy,
  onDownload,
  onDone,
}: {
  codes:
    string[];

  copied:
    boolean;

  onCopy:
    () => void;

  onDownload:
    () => void;

  onDone:
    () => void;
}) {
  return (
    <div className="rounded-[24px] border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/70 dark:bg-amber-950/20">

      <div className="flex items-start gap-3">

        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />

        <div>

          <h4 className="text-sm font-black text-amber-950 dark:text-amber-200">
            Save your recovery codes now
          </h4>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-700 dark:text-amber-300">
            These codes are shown only for this newly generated set. Each code works once and can be used if you cannot access your authenticator.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">

        {codes.map(
          (
            code,
            index
          ) => (
            <div
              key={`${code}-${index}`}
              className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-mono text-xs font-black tracking-[0.08em] text-slate-900 dark:border-amber-900/50 dark:bg-slate-950 dark:text-white"
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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}

          {copied
            ? 'Copied'
            : 'Copy codes'}
        </button>

        <button
          type="button"
          onClick={
            onDownload
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          <Download className="h-4 w-4" />

          Save text file
        </button>

        <button
          type="button"
          onClick={
            onDone
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-black text-white transition hover:bg-amber-700 sm:ml-auto"
        >
          <CheckCircle2 className="h-4 w-4" />

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
   NOTICE
   ============================================================ */

function Notice({
  notice,
  onDismiss,
}: {
  notice:
    NoticeState;

  onDismiss:
    () => void;
}) {
  const success =
    notice.type ===
    'success';

  const warning =
    notice.type ===
    'warning';

  return (
    <div
      role={
        success
          ? 'status'
          : 'alert'
      }
      className={`flex items-start gap-3 rounded-[18px] border px-4 py-3 ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
          : warning
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
      }`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}

      <p className="flex-1 text-xs font-semibold leading-5">
        {notice.message}
      </p>

      <button
        type="button"
        onClick={
          onDismiss
        }
        aria-label="Dismiss message"
        className="opacity-60 transition hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
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
          'Generate new recovery codes',

        description:
          'Verify your identity before replacing your current unused recovery codes.',

        button:
          'Generate new codes',

        danger:
          false,
      };

    case 'disable-two-factor':
      return {
        title:
          'Disable two-factor authentication',

        description:
          'Verify your identity before removing two-factor protection from this SaMi account.',

        button:
          'Disable 2FA',

        danger:
          true,
      };

    default:
      return {
        title:
          'Authenticator verification',

        description:
          'Verify your identity before starting authenticator setup.',

        button:
          'Continue setup',

        danger:
          false,
      };
  }
}