'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

/* ============================================================
   ENDPOINTS
   ============================================================ */

const STATUS_ENDPOINT =
  '/api/account/security/email-two-factor';

const SETUP_ENDPOINT =
  '/api/account/security/email-two-factor/setup';

const CONFIRM_ENDPOINT =
  '/api/account/security/email-two-factor/confirm';

const RESEND_ENDPOINT =
  '/api/account/security/email-two-factor/resend';

const PREFERRED_ENDPOINT =
  '/api/account/security/two-factor/preferred';

/* ============================================================
   TYPES
   ============================================================ */

type TwoFactorMethod =
  | 'authenticator'
  | 'email';

type TwoFactorMethodStatus = {
  enabled: boolean;

  preferredMethod:
    | TwoFactorMethod
    | null;

  availableMethods:
    TwoFactorMethod[];

  authenticator: {
    enabled: boolean;
    count: number;
  };

  email: {
    enabled: boolean;
    verified: boolean;

    address:
      | string
      | null;

    maskedAddress:
      | string
      | null;

    enabledAt:
      | string
      | null;
  };

  recovery: {
    count: number;
    available: boolean;
  };
};

type SetupState = {
  setupToken: string;

  maskedEmail: string;

  expiresAt:
    | string
    | null;

  expiresInSeconds:
    number;

  resendCooldownSeconds:
    number;
};

type DisableStepUpState = {
  stepUpToken: string;

  maskedEmail: string;

  expiresAt:
    | string
    | null;

  expiresInSeconds:
    number;

  resendCooldownSeconds:
    number;
};

type ApiResponse = {
  success?: boolean;

  code?: string;

  error?: string;

  message?: string;

  retryAfterSeconds?:
    number;

  attemptsRemaining?:
    number | null;

  twoFactor?:
    TwoFactorMethodStatus;

  preferredMethod?:
    TwoFactorMethod | null;

  availableMethods?:
    TwoFactorMethod[];

  canChoosePreferredMethod?:
    boolean;

  recoveryCodes?:
    string[];

  setup?: {
    setupToken?: string;

    maskedEmail?: string;

    expiresAt?:
      string | null;

    expiresInSeconds?:
      number;

    resendCooldownSeconds?:
      number;
  };

  stepUp?: {
    stepUpToken?: string;

    maskedEmail?: string;

    expiresAt?:
      string | null;

    expiresInSeconds?:
      number;

    resendCooldownSeconds?:
      number;
  };
};

type ScreenMode =
  | 'overview'
  | 'enable-auth'
  | 'confirm-email'
  | 'disable-auth'
  | 'disable-email';

type OverlayState = {
  type:
    | 'success'
    | 'warning'
    | 'error';

  title: string;

  message: string;

  primaryAction?: {
    label: string;
    onClick: () => void;
  };

  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

/* ============================================================
   HELPERS
   ============================================================ */

function getSafeErrorMessage(
  payload:
    ApiResponse | null,
  fallback:
    string
) {
  if (
    payload?.error &&
    typeof payload.error ===
      'string'
  ) {
    return payload.error;
  }

  if (
    payload?.message &&
    typeof payload.message ===
      'string'
  ) {
    return payload.message;
  }

  return fallback;
}

function normalizeSetup(
  payload:
    ApiResponse
): SetupState | null {
  const setup =
    payload.setup;

  if (
    !setup ||
    typeof setup.setupToken !==
      'string' ||
    !setup.setupToken.trim()
  ) {
    return null;
  }

  return {
    setupToken:
      setup.setupToken.trim(),

    maskedEmail:
      typeof setup.maskedEmail ===
        'string'
        ? setup.maskedEmail
        : 'your verified email',

    expiresAt:
      typeof setup.expiresAt ===
        'string'
        ? setup.expiresAt
        : null,

    expiresInSeconds:
      typeof setup
        .expiresInSeconds ===
        'number'
        ? setup
            .expiresInSeconds
        : 600,

    resendCooldownSeconds:
      typeof setup
        .resendCooldownSeconds ===
        'number'
        ? setup
            .resendCooldownSeconds
        : 60,
  };
}

function normalizeStepUp(
  payload:
    ApiResponse
): DisableStepUpState | null {
  const stepUp =
    payload.stepUp;

  if (
    !stepUp ||
    typeof stepUp.stepUpToken !==
      'string' ||
    !stepUp.stepUpToken.trim()
  ) {
    return null;
  }

  return {
    stepUpToken:
      stepUp
        .stepUpToken
        .trim(),

    maskedEmail:
      typeof stepUp
        .maskedEmail ===
        'string'
        ? stepUp.maskedEmail
        : 'your verified email',

    expiresAt:
      typeof stepUp
        .expiresAt ===
        'string'
        ? stepUp.expiresAt
        : null,

    expiresInSeconds:
      typeof stepUp
        .expiresInSeconds ===
        'number'
        ? stepUp
            .expiresInSeconds
        : 600,

    resendCooldownSeconds:
      typeof stepUp
        .resendCooldownSeconds ===
        'number'
        ? stepUp
            .resendCooldownSeconds
        : 60,
  };
}

function formatMethod(
  method:
    TwoFactorMethod | null
) {
  if (
    method ===
    'authenticator'
  ) {
    return 'Authenticator app';
  }

  if (
    method ===
    'email'
  ) {
    return 'Email';
  }

  return 'None';
}

function downloadRecoveryCodes(
  codes:
    string[]
) {
  const content = [
    'SaMi Recovery Codes',
    '',
    'Keep these codes somewhere safe.',
    'Each recovery code can be used only once.',
    '',
    ...codes,
    '',
    'SaMi — AI Powered Business Workspace',
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

/* ============================================================
   COMPONENT
   ============================================================ */

export default function EmailTwoFactorSettings() {
  /* ==========================================================
     STATUS
     ========================================================== */

  const [
    status,
    setStatus,
  ] =
    useState<
      TwoFactorMethodStatus | null
    >(null);

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
     SCREEN
     ========================================================== */

  const [
    mode,
    setMode,
  ] =
    useState<ScreenMode>(
      'overview'
    );

  /* ==========================================================
     ENABLE FORM
     ========================================================== */

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
    setup,
    setSetup,
  ] =
    useState<
      SetupState | null
    >(null);

  const [
    confirmationCode,
    setConfirmationCode,
  ] =
    useState('');

  const [
    confirmationCodeError,
    setConfirmationCodeError,
  ] =
    useState<
      string | null
    >(null);

  /* ==========================================================
     DISABLE FORM
     ========================================================== */

  const [
    disablePassword,
    setDisablePassword,
  ] =
    useState('');

  const [
    disableTwoFactorCode,
    setDisableTwoFactorCode,
  ] =
    useState('');

  const [
    disableEmailCode,
    setDisableEmailCode,
  ] =
    useState('');

  const [
    disableStepUp,
    setDisableStepUp,
  ] =
    useState<
      DisableStepUpState | null
    >(null);

  const [
    disableEmailCodeError,
    setDisableEmailCodeError,
  ] =
    useState<
      string | null
    >(null);

  /* ==========================================================
     RECOVERY CODES
     ========================================================== */

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] =
    useState<
      string[]
    >([]);

  /* ==========================================================
     SUBMIT STATE
     ========================================================== */

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  const [
    resending,
    setResending,
  ] =
    useState(
      false
    );

  const [
    changingPreferred,
    setChangingPreferred,
  ] =
    useState(
      false
    );

  /* ==========================================================
     COOLDOWN
     ========================================================== */

  const [
    resendSeconds,
    setResendSeconds,
  ] =
    useState(
      0
    );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<
      OverlayState | null
    >(null);

  /* ==========================================================
     DERIVED
     ========================================================== */

  const emailEnabled =
    status?.email
      .enabled ===
    true;

  const emailVerified =
    status?.email
      .verified ===
    true;

  const authenticatorEnabled =
    status
      ?.authenticator
      .enabled ===
    true;

  const canChoosePreferred =
    (
      status
        ?.availableMethods
        ?.length ||
      0
    ) >
    1;

  const isEmailPreferred =
    status
      ?.preferredMethod ===
    'email';

  const maskedEmail =
    status
      ?.email
      .maskedAddress ||
    setup
      ?.maskedEmail ||
    'your verified email';

  const disableCanUseAuthenticator =
    authenticatorEnabled;

  /* ==========================================================
     RESET FORMS
     ========================================================== */

  const resetEnableFlow =
    useCallback(
      () => {
        setCurrentPassword(
          ''
        );

        setExistingTwoFactorCode(
          ''
        );

        setSetup(
          null
        );

        setConfirmationCode(
          ''
        );

        setConfirmationCodeError(
          null
        );

        setResendSeconds(
          0
        );

        setMode(
          'overview'
        );
      },
      []
    );

  const resetDisableFlow =
    useCallback(
      () => {
        setDisablePassword(
          ''
        );

        setDisableTwoFactorCode(
          ''
        );

        setDisableEmailCode(
          ''
        );

        setDisableEmailCodeError(
          null
        );

        setDisableStepUp(
          null
        );

        setMode(
          'overview'
        );
      },
      []
    );

  /* ==========================================================
     SESSION EXPIRED
     ========================================================== */

  const handleUnauthenticated =
    useCallback(
      () => {
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

            onClick: () => {
              window.location.href =
                '/login?reason=session_expired';
            },
          },
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

                credentials:
                  'include',

                cache:
                  'no-store',

                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          const payload =
            (
              await response
                .json()
                .catch(
                  () =>
                    null
                )
            ) as
              | ApiResponse
              | null;

          if (
            response.status ===
            401 ||
            payload?.code ===
              'UNAUTHENTICATED'
          ) {
            handleUnauthenticated();

            return;
          }

          if (
            !response.ok ||
            !payload
              ?.twoFactor
          ) {
            setOverlay({
              type:
                'error',

              title:
                'Could not load email verification',

              message:
                getSafeErrorMessage(
                  payload,
                  'SaMi could not load your email verification settings.'
                ),
            });

            return;
          }

          setStatus(
            payload.twoFactor
          );

          if (
            manual
          ) {
            setOverlay({
              type:
                'success',

              title:
                'Security status refreshed',

              message:
                'SaMi refreshed your email verification settings.',
            });
          }
        } catch {
          setOverlay({
            type:
              'error',

            title:
              'Connection problem',

            message:
              'SaMi could not connect to the server. Check your connection and try again.',
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
     RESEND COUNTDOWN
     ========================================================== */

  useEffect(
    () => {
      if (
        resendSeconds <=
        0
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            setResendSeconds(
              (
                current
              ) =>
                Math.max(
                  0,
                  current -
                    1
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
    },
    [
      resendSeconds,
    ]
  );

  /* ==========================================================
     BEGIN ENABLE
     ========================================================== */

  async function startEnableFlow(
    event:
      React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !currentPassword
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Current password required',

        message:
          'Enter your current password before enabling email verification.',
      });

      return;
    }

    if (
      authenticatorEnabled &&
      !existingTwoFactorCode
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Verification required',

        message:
          'Enter your current authenticator code or an unused recovery code.',
      });

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

            credentials:
              'include',

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
                currentPassword,

                twoFactorCode:
                  existingTwoFactorCode ||
                  undefined,
              }),
          }
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () =>
                null
            )
        ) as
          | ApiResponse
          | null;

      if (
        response.status ===
        401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        handleUnauthenticated();

        return;
      }

      if (
        !response.ok ||
        !payload
      ) {
        setOverlay({
          type:
            'error',

          title:
            'Could not start email verification',

          message:
            getSafeErrorMessage(
              payload,
              'SaMi could not start email verification.'
            ),
        });

        return;
      }

      const nextSetup =
        normalizeSetup(
          payload
        );

      if (
        !nextSetup
      ) {
        setOverlay({
          type:
            'error',

          title:
            'Invalid security response',

          message:
            'SaMi started the request but did not receive a valid verification context.',
        });

        return;
      }

      setSetup(
        nextSetup
      );

      setCurrentPassword(
        ''
      );

      setExistingTwoFactorCode(
        ''
      );

      setConfirmationCode(
        ''
      );

      setConfirmationCodeError(
        null
      );

      setResendSeconds(
        nextSetup
          .resendCooldownSeconds
      );

      setMode(
        'confirm-email'
      );

      setOverlay({
        type:
          'success',

        title:
          'Verification code sent',

        message:
          `SaMi sent a six-digit verification code to ${nextSetup.maskedEmail}.`,
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Connection problem',

        message:
          'SaMi could not connect to the server. Check your connection and try again.',
      });
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     CONFIRM ENABLE
     ========================================================== */

  async function confirmEnable(
    event:
      React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setConfirmationCodeError(
      null
    );

    if (
      !/^\d{6}$/.test(
        confirmationCode
      )
    ) {
      setConfirmationCodeError(
        'Enter the six-digit code sent to your email.'
      );

      return;
    }

    if (
      !setup
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Setup expired',

        message:
          'Start email verification again to receive a new code.',
      });

      resetEnableFlow();

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

            credentials:
              'include',

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
                setupToken:
                  setup.setupToken,

                code:
                  confirmationCode,
              }),
          }
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () =>
                null
            )
        ) as
          | ApiResponse
          | null;

      if (
        response.status ===
        401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        handleUnauthenticated();

        return;
      }

      if (
        !response.ok ||
        !payload
      ) {
        if (
          payload
            ?.code ===
            'INVALID_EMAIL_TWO_FACTOR_CODE'
        ) {
          setConfirmationCodeError(
            payload.error ||
              'The verification code is incorrect.'
          );

          return;
        }

        setOverlay({
          type:
            'error',

          title:
            'Email verification failed',

          message:
            getSafeErrorMessage(
              payload,
              'SaMi could not verify the email security code.'
            ),
        });

        return;
      }

      if (
        payload.twoFactor
      ) {
        setStatus(
          payload.twoFactor
        );
      } else {
        await loadStatus();
      }

      const nextRecoveryCodes =
        Array.isArray(
          payload.recoveryCodes
        )
          ? payload
              .recoveryCodes
              .filter(
                (
                  item
                ): item is string =>
                  typeof item ===
                    'string' &&
                  Boolean(
                    item.trim()
                  )
              )
          : [];

      setRecoveryCodes(
        nextRecoveryCodes
      );

      setSetup(
        null
      );

      setConfirmationCode(
        ''
      );

      setConfirmationCodeError(
        null
      );

      setMode(
        'overview'
      );

      setOverlay({
        type:
          'success',

        title:
          'Email verification enabled',

        message:
          nextRecoveryCodes.length >
          0
            ? 'Email login verification is now enabled. Save your recovery codes before leaving this screen.'
            : 'Email login verification is now enabled.',
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Connection problem',

        message:
          'SaMi could not connect to the server. Check your connection and try again.',
      });
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     RESEND ENABLE CODE
     ========================================================== */

  async function resendEnableCode() {
    if (
      !setup ||
      resending ||
      resendSeconds >
        0
    ) {
      return;
    }

    setResending(
      true
    );

    try {
      const response =
        await fetch(
          RESEND_ENDPOINT,
          {
            method:
              'POST',

            credentials:
              'include',

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
                setupToken:
                  setup.setupToken,
              }),
          }
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () =>
                null
            )
        ) as
          | ApiResponse
          | null;

      if (
        response.status ===
        401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        handleUnauthenticated();

        return;
      }

      if (
        !response.ok ||
        !payload
      ) {
        if (
          typeof payload
            ?.retryAfterSeconds ===
            'number'
        ) {
          setResendSeconds(
            payload
              .retryAfterSeconds
          );
        }

        setOverlay({
          type:
            'error',

          title:
            'Could not resend code',

          message:
            getSafeErrorMessage(
              payload,
              'SaMi could not send another verification code.'
            ),
        });

        return;
      }

      const nextSetup =
        normalizeSetup(
          payload
        );

      if (
        nextSetup
      ) {
        setSetup(
          nextSetup
        );

        setResendSeconds(
          nextSetup
            .resendCooldownSeconds
        );
      }

      setOverlay({
        type:
          'success',

        title:
          'New code sent',

        message:
          `SaMi sent a new verification code to ${
            nextSetup
              ?.maskedEmail ||
            setup
              .maskedEmail
          }.`,
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Connection problem',

        message:
          'SaMi could not connect to the server. Check your connection and try again.',
      });
    } finally {
      setResending(
        false
      );
    }
  }

  /* ==========================================================
     BEGIN DISABLE
     ========================================================== */

  function requestDisable() {
    setOverlay({
      type:
        'warning',

      title:
        'Disable email verification?',

      message:
        authenticatorEnabled
          ? 'Email will no longer be available as a sign-in verification method. Your authenticator will remain active.'
          : 'Email is currently your active sign-in verification method. Disabling it will remove two-factor protection unless another method is enabled.',

      primaryAction: {
        label:
          'Continue',

        onClick: () => {
          setOverlay(
            null
          );

          setMode(
            'disable-auth'
          );
        },
      },

      secondaryAction: {
        label:
          'Cancel',

        onClick: () =>
          setOverlay(
            null
          ),
      },
    });
  }

  /* ==========================================================
     DISABLE EMAIL
     ========================================================== */

  async function disableEmail(
    event:
      React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setDisableEmailCodeError(
      null
    );

    if (
      !disablePassword
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Current password required',

        message:
          'Enter your current password before changing this security method.',
      });

      return;
    }

    if (
      mode ===
        'disable-email' &&
      !/^\d{6}$/.test(
        disableEmailCode
      )
    ) {
      setDisableEmailCodeError(
        'Enter the six-digit security code sent to your email.'
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

            credentials:
              'include',

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
                currentPassword:
                  disablePassword,

                twoFactorCode:
                  disableTwoFactorCode ||
                  undefined,

                emailCode:
                  mode ===
                  'disable-email'
                    ? disableEmailCode
                    : undefined,

                stepUpToken:
                  disableStepUp
                    ?.stepUpToken,
              }),
          }
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () =>
                null
            )
        ) as
          | ApiResponse
          | null;

      if (
        response.status ===
        401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        handleUnauthenticated();

        return;
      }

      /* ======================================================
         SERVER REQUIRES EMAIL STEP-UP
         ====================================================== */

      if (
        response.status ===
          428 &&
        payload?.code ===
          'EMAIL_SECURITY_STEP_UP_REQUIRED'
      ) {
        const stepUp =
          normalizeStepUp(
            payload
          );

        if (
          !stepUp
        ) {
          setOverlay({
            type:
              'error',

            title:
              'Invalid security response',

            message:
              'SaMi could not create the email security verification step.',
          });

          return;
        }

        setDisableStepUp(
          stepUp
        );

        setDisableEmailCode(
          ''
        );

        setDisableEmailCodeError(
          null
        );

        setMode(
          'disable-email'
        );

        setOverlay({
          type:
            'success',

          title:
            'Security code sent',

          message:
            `SaMi sent a six-digit security code to ${stepUp.maskedEmail}.`,
        });

        return;
      }

      if (
        !response.ok ||
        !payload
      ) {
        if (
          payload?.code ===
            'INVALID_EMAIL_SECURITY_CODE'
        ) {
          setDisableEmailCodeError(
            payload.error ||
              'The security code is incorrect.'
          );

          return;
        }

        setOverlay({
          type:
            'error',

          title:
            'Could not disable email verification',

          message:
            getSafeErrorMessage(
              payload,
              'SaMi could not disable email verification.'
            ),
        });

        return;
      }

      if (
        payload.twoFactor
      ) {
        setStatus(
          payload.twoFactor
        );
      } else {
        await loadStatus();
      }

      setRecoveryCodes(
        []
      );

      resetDisableFlow();

      setOverlay({
        type:
          'success',

        title:
          'Email verification disabled',

        message:
          payload.message ||
          'Email login verification has been disabled.',
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Connection problem',

        message:
          'SaMi could not connect to the server. Check your connection and try again.',
      });
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     PREFERRED METHOD
     ========================================================== */

  async function makeEmailPreferred() {
    if (
      !emailEnabled ||
      !canChoosePreferred ||
      isEmailPreferred ||
      changingPreferred
    ) {
      return;
    }

    setChangingPreferred(
      true
    );

    try {
      const response =
        await fetch(
          PREFERRED_ENDPOINT,
          {
            method:
              'PATCH',

            credentials:
              'include',

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
                method:
                  'email',
              }),
          }
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () =>
                null
            )
        ) as
          | ApiResponse
          | null;

      if (
        response.status ===
        401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        handleUnauthenticated();

        return;
      }

      if (
        !response.ok ||
        !payload
      ) {
        setOverlay({
          type:
            'error',

          title:
            'Could not change preferred method',

          message:
            getSafeErrorMessage(
              payload,
              'SaMi could not update your preferred sign-in verification method.'
            ),
        });

        return;
      }

      if (
        payload.twoFactor
      ) {
        setStatus(
          payload.twoFactor
        );
      } else {
        await loadStatus();
      }

      setOverlay({
        type:
          'success',

        title:
          'Preferred method updated',

        message:
          'Email is now your preferred sign-in verification method.',
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Connection problem',

        message:
          'SaMi could not connect to the server. Check your connection and try again.',
      });
    } finally {
      setChangingPreferred(
        false
      );
    }
  }

  /* ==========================================================
     RECOVERY CODE ACTIONS
     ========================================================== */

  async function copyRecoveryCodes() {
    if (
      recoveryCodes.length ===
      0
    ) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          recoveryCodes.join(
            '\n'
          )
        );

      setOverlay({
        type:
          'success',

        title:
          'Recovery codes copied',

        message:
          'Your recovery codes were copied to the clipboard.',
      });
    } catch {
      setOverlay({
        type:
          'error',

        title:
          'Could not copy codes',

        message:
          'SaMi could not copy the recovery codes. Save them manually before leaving this screen.',
      });
    }
  }

  function saveRecoveryCodes() {
    if (
      recoveryCodes.length ===
      0
    ) {
      return;
    }

    downloadRecoveryCodes(
      recoveryCodes
    );

    setOverlay({
      type:
        'success',

      title:
        'Recovery codes saved',

      message:
        'SaMi created a text file containing your recovery codes.',
    });
  }

  /* ==========================================================
     STATUS LABEL
     ========================================================== */

  const statusLabel =
    useMemo(
      () =>
        emailEnabled
          ? 'Enabled'
          : 'Not enabled',
      [
        emailEnabled,
      ]
    );

  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading email verification…
        </div>
      </div>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

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

      <div className="mx-auto max-w-4xl space-y-6">
        {/* ====================================================
            HEADER
           ==================================================== */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
                <Mail className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  Email login codes
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Verify SaMi sign-ins with a one-time code sent to your verified email.
                </p>
              </div>
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
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />

            Refresh
          </button>
        </div>

        {/* ====================================================
            STATUS CARD
           ==================================================== */}

        <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  emailEnabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {emailEnabled ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">
                    Email verification
                  </h3>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                      emailEnabled
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {statusLabel}
                  </span>

                  {isEmailPreferred && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      Preferred
                    </span>
                  )}
                </div>

                <p className="mt-2 break-all text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {status
                    ?.email
                    .address ||
                    'No email available'}
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {emailVerified
                    ? 'Your account email is verified and can be used for security codes.'
                    : 'Your account email must be verified before Email 2FA can be enabled.'}
                </p>
              </div>
            </div>
          </div>

          {/* ==================================================
              OVERVIEW ACTIONS
             ================================================== */}

          {mode ===
            'overview' && (
            <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
              {!emailEnabled ? (
                <button
                  type="button"
                  onClick={() =>
                    setMode(
                      'enable-auth'
                    )
                  }
                  disabled={
                    !emailVerified
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  Enable email verification
                </button>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {canChoosePreferred &&
                    !isEmailPreferred && (
                      <button
                        type="button"
                        onClick={
                          makeEmailPreferred
                        }
                        disabled={
                          changingPreferred
                        }
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {changingPreferred ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}

                        Make preferred
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={
                      requestDisable
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 text-sm font-bold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Disable email verification
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ====================================================
            ENABLE — REAUTHENTICATION
           ==================================================== */}

        {mode ===
          'enable-auth' && (
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div>
              <h3 className="text-base font-black text-slate-950 dark:text-white">
                Confirm your identity
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                SaMi verifies sensitive security changes before sending the setup code.
              </p>
            </div>

            <form
              onSubmit={
                startEnableFlow
              }
              className="mt-5 max-w-xl space-y-4"
            >
              <Field
                label="Current password"
                type="password"
                value={
                  currentPassword
                }
                onChange={
                  setCurrentPassword
                }
                autoComplete="current-password"
                placeholder="Enter your current password"
              />

              {authenticatorEnabled && (
                <Field
                  label="Authenticator or recovery code"
                  value={
                    existingTwoFactorCode
                  }
                  onChange={
                    setExistingTwoFactorCode
                  }
                  autoComplete="one-time-code"
                  placeholder="6-digit authenticator or recovery code"
                  hint="Your account already has authenticator protection, so SaMi requires that existing factor too."
                />
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="submit"
                  disabled={
                    submitting
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}

                  Send verification code
                </button>

                <button
                  type="button"
                  onClick={
                    resetEnableFlow
                  }
                  disabled={
                    submitting
                  }
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ====================================================
            ENABLE — EMAIL CONFIRMATION
           ==================================================== */}

        {mode ===
          'confirm-email' &&
          setup && (
            <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <KeyRound className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">
                    Enter your email code
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    SaMi sent a six-digit code to{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {setup.maskedEmail}
                    </span>
                    .
                  </p>
                </div>
              </div>

              <form
                onSubmit={
                  confirmEnable
                }
                className="mt-5 max-w-xl space-y-4"
              >
                <Field
                  label="Verification code"
                  value={
                    confirmationCode
                  }
                  onChange={(
                    value
                  ) => {
                    setConfirmationCode(
                      value
                        .replace(
                          /\D/g,
                          ''
                        )
                        .slice(
                          0,
                          6
                        )
                    );

                    setConfirmationCodeError(
                      null
                    );
                  }}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="000000"
                  error={
                    confirmationCodeError
                  }
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      confirmationCode
                        .length !==
                        6
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}

                    Confirm and enable
                  </button>

                  <button
                    type="button"
                    onClick={
                      resendEnableCode
                    }
                    disabled={
                      resending ||
                      resendSeconds >
                        0
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    {resending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}

                    {resendSeconds >
                    0
                      ? `Resend in ${resendSeconds}s`
                      : 'Resend code'}
                  </button>

                  <button
                    type="button"
                    onClick={
                      resetEnableFlow
                    }
                    disabled={
                      submitting
                    }
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

        {/* ====================================================
            DISABLE — PASSWORD / OPTIONAL AUTHENTICATOR
           ==================================================== */}

        {mode ===
          'disable-auth' && (
          <section className="rounded-[22px] border border-red-200 bg-white p-5 shadow-sm dark:border-red-900/50 dark:bg-slate-950">
            <h3 className="text-base font-black text-slate-950 dark:text-white">
              Disable email verification
            </h3>

            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Confirm your identity before SaMi changes this security method.
            </p>

            <form
              onSubmit={
                disableEmail
              }
              className="mt-5 max-w-xl space-y-4"
            >
              <Field
                label="Current password"
                type="password"
                value={
                  disablePassword
                }
                onChange={
                  setDisablePassword
                }
                autoComplete="current-password"
                placeholder="Enter your current password"
              />

              {disableCanUseAuthenticator && (
                <Field
                  label="Authenticator or recovery code"
                  value={
                    disableTwoFactorCode
                  }
                  onChange={
                    setDisableTwoFactorCode
                  }
                  autoComplete="one-time-code"
                  placeholder="Optional"
                  hint="Enter this to verify immediately. If left blank, SaMi will send a security code to your email."
                />
              )}

              {!disableCanUseAuthenticator && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  SaMi will send a security code to {maskedEmail} before disabling Email 2FA.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    submitting
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}

                  Continue
                </button>

                <button
                  type="button"
                  onClick={
                    resetDisableFlow
                  }
                  disabled={
                    submitting
                  }
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ====================================================
            DISABLE — EMAIL STEP-UP
           ==================================================== */}

        {mode ===
          'disable-email' &&
          disableStepUp && (
            <section className="rounded-[22px] border border-red-200 bg-white p-5 shadow-sm dark:border-red-900/50 dark:bg-slate-950">
              <h3 className="text-base font-black text-slate-950 dark:text-white">
                Confirm by email
              </h3>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter the six-digit security code sent to{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {disableStepUp.maskedEmail}
                </span>
                .
              </p>

              <form
                onSubmit={
                  disableEmail
                }
                className="mt-5 max-w-xl space-y-4"
              >
                <Field
                  label="Security code"
                  value={
                    disableEmailCode
                  }
                  onChange={(
                    value
                  ) => {
                    setDisableEmailCode(
                      value
                        .replace(
                          /\D/g,
                          ''
                        )
                        .slice(
                          0,
                          6
                        )
                    );

                    setDisableEmailCodeError(
                      null
                    );
                  }}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="000000"
                  error={
                    disableEmailCodeError
                  }
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      disableEmailCode
                        .length !==
                        6
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}

                    Disable email verification
                  </button>

                  <button
                    type="button"
                    onClick={
                      resetDisableFlow
                    }
                    disabled={
                      submitting
                    }
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

        {/* ====================================================
            CURRENT METHOD SUMMARY
           ==================================================== */}

        {status && (
          <section className="grid gap-4 sm:grid-cols-3">
            <InfoCard
              title="Email"
              value={
                emailEnabled
                  ? 'Enabled'
                  : 'Disabled'
              }
              detail={
                status.email
                  .maskedAddress ||
                'No verified email'
              }
            />

            <InfoCard
              title="Authenticator"
              value={
                authenticatorEnabled
                  ? 'Enabled'
                  : 'Disabled'
              }
              detail={
                authenticatorEnabled
                  ? `${status.authenticator.count} active`
                  : 'Not configured'
              }
            />

            <InfoCard
              title="Preferred"
              value={
                formatMethod(
                  status
                    .preferredMethod
                )
              }
              detail={
                canChoosePreferred
                  ? 'Used first during sign-in'
                  : 'Automatically selected'
              }
            />
          </section>
        )}

        {/* ====================================================
            RECOVERY CODES CREATED DURING FIRST 2FA ENABLEMENT
           ==================================================== */}

        {recoveryCodes.length >
          0 && (
          <section className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <KeyRound className="h-5 w-5" />
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">
                  Save your recovery codes
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  These are shown only when a new set is created. Each code can be used once if you cannot access your normal verification method.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map(
                (
                  code
                ) => (
                  <div
                    key={
                      code
                    }
                    className="rounded-xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm font-bold tracking-[0.08em] text-slate-900 dark:border-amber-900/50 dark:bg-slate-950 dark:text-white"
                  >
                    {code}
                  </div>
                )
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={
                  copyRecoveryCodes
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-amber-950/30"
              >
                <Copy className="h-4 w-4" />
                Copy codes
              </button>

              <button
                type="button"
                onClick={
                  saveRecoveryCodes
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-amber-950/30"
              >
                <Download className="h-4 w-4" />
                Save codes
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecoveryCodes(
                    []
                  );

                  setOverlay({
                    type:
                      'success',

                    title:
                      'Recovery codes hidden',

                    message:
                      'SaMi has hidden the plaintext recovery codes from this screen.',
                  });
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Check className="h-4 w-4" />
                I’ve saved them
              </button>
            </div>
          </section>
        )}

        {/* ====================================================
            SECURITY EXPLANATION
           ==================================================== */}

        <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">
                How SaMi email verification works
              </h3>

              <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                SaMi sends a six-digit one-time code only after the account has passed the required authentication step. The raw code is never stored in the database, codes expire automatically, failed attempts are limited, and a successfully verified code cannot be reused.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ============================================================
   FIELD
   ============================================================ */

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  hint,
  error,
}: {
  label: string;

  value: string;

  onChange:
    (
      value:
        string
    ) => void;

  type?:
    'text' |
    'password';

  placeholder?:
    string;

  autoComplete?:
    string;

  inputMode?:
    React.HTMLAttributes<HTMLInputElement>['inputMode'];

  hint?:
    string;

  error?:
    string | null;
}) {
  return (
    <div>
      <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type={
          type
        }
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
        placeholder={
          placeholder
        }
        autoComplete={
          autoComplete
        }
        inputMode={
          inputMode
        }
        aria-invalid={
          Boolean(
            error
          )
        }
        className={`mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 dark:bg-slate-950 dark:text-white ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10 dark:border-red-900'
            : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-800'
        }`}
      />

      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================
   INFO CARD
   ============================================================ */

function InfoCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>

      <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
        {value}
      </p>

      <p className="mt-1 break-all text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}