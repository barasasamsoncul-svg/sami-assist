'use client';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  getAuthOverlayMessage,
} from '@/lib/auth/auth-ui-messages';

/* ============================================================
   TYPES
   ============================================================ */

type PrimaryMethod =
  | 'authenticator'
  | 'email';

type VerificationMode =
  | PrimaryMethod
  | 'recovery';

type VerificationState = {
  methods:
    PrimaryMethod[];

  preferredMethod:
    PrimaryMethod | null;

  maskedEmail:
    string | null;

  recoveryAvailable:
    boolean;
};

type ApiResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  next?:
    string;

  retryAfterSeconds?:
    number | null;

  lockedUntil?:
    string | null;

  attemptsRemaining?:
    number | null;

  verification?:
    Partial<
      VerificationState
    >;

  maskedEmail?:
    string | null;

  expiresAt?:
    string | null;

  expiresInSeconds?:
    number | null;

  resendCooldownSeconds?:
    number | null;

  emailVerification?: {
    maskedEmail?:
      string | null;

    expiresAt?:
      string | null;

    expiresInSeconds?:
      number | null;

    resendCooldownSeconds?:
      number | null;
  };
};

/* ============================================================
   STORAGE
   ============================================================ */

const TWO_FACTOR_EMAIL_KEY =
  'sami_2fa_email';

const TWO_FACTOR_CHALLENGE_KEY =
  'sami_2fa_challenge';

const TWO_FACTOR_REMEMBER_KEY =
  'sami_2fa_remember';

const TWO_FACTOR_NEXT_KEY =
  'sami_2fa_next';

const TWO_FACTOR_VERIFICATION_KEY =
  'sami_2fa_verification';

const THEME_STORAGE_KEY =
  'sami_theme';

/* ============================================================
   ENDPOINTS
   ============================================================ */

const TWO_FACTOR_ENDPOINT =
  '/api/auth/login/2fa';

const EMAIL_SEND_ENDPOINT =
  '/api/auth/login/2fa/email/send';

/* ============================================================
   DEFAULT VERIFICATION

   This keeps compatibility with an older login client that may
   not yet store the complete verification object.
   ============================================================ */

const DEFAULT_VERIFICATION:
  VerificationState = {
    methods: [
      'authenticator',
    ],

    preferredMethod:
      'authenticator',

    maskedEmail:
      null,

    recoveryAvailable:
      true,
  };

/* ============================================================
   CODE NORMALIZATION
   ============================================================ */

function cleanSixDigitCode(
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

function cleanRecoveryCode(
  value:
    string
) {
  return value
    .replace(
      /[\r\n\t]/g,
      ''
    )
    .slice(
      0,
      64
    );
}

/* ============================================================
   SAFE REDIRECT
   ============================================================ */

function safeNextPath(
  value?:
    string | null
) {
  if (
    !value ||
    !value.startsWith(
      '/'
    ) ||
    value.startsWith(
      '//'
    ) ||
    value.startsWith(
      '/api/'
    )
  ) {
    return '/dashboard';
  }

  if (
    /^\/(?:login|register|forgot-password|reset-password|verify-email)(?:\/|$|\?)/i.test(
      value
    )
  ) {
    return '/dashboard';
  }

  return value;
}

/* ============================================================
   VERIFICATION STATE
   ============================================================ */

function parseVerificationState(
  value:
    string | null
): VerificationState {
  if (
    !value
  ) {
    return (
      DEFAULT_VERIFICATION
    );
  }

  try {
    const parsed =
      JSON.parse(
        value
      ) as Partial<
        VerificationState
      >;

    const methods =
      Array.isArray(
        parsed.methods
      )
        ? parsed.methods.filter(
            (
              method
            ): method is
              PrimaryMethod =>
              method ===
                'authenticator' ||
              method ===
                'email'
          )
        : [];

    const preferredMethod =
      parsed.preferredMethod ===
        'authenticator' ||
      parsed.preferredMethod ===
        'email'
        ? parsed.preferredMethod
        : null;

    return {
      methods,

      preferredMethod,

      maskedEmail:
        typeof parsed.maskedEmail ===
        'string'
          ? parsed.maskedEmail
          : null,

      recoveryAvailable:
        parsed.recoveryAvailable ===
        true,
    };
  } catch {
    return (
      DEFAULT_VERIFICATION
    );
  }
}

function chooseInitialMode(
  verification:
    VerificationState
): VerificationMode {
  if (
    verification.preferredMethod &&
    verification.methods.includes(
      verification.preferredMethod
    )
  ) {
    return (
      verification
        .preferredMethod
    );
  }

  if (
    verification.methods.includes(
      'authenticator'
    )
  ) {
    return 'authenticator';
  }

  if (
    verification.methods.includes(
      'email'
    )
  ) {
    return 'email';
  }

  return 'recovery';
}

/* ============================================================
   STORAGE CLEANUP
   ============================================================ */

function clearChallengeStorage() {
  try {
    sessionStorage.removeItem(
      TWO_FACTOR_EMAIL_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_CHALLENGE_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_REMEMBER_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_NEXT_KEY
    );

    sessionStorage.removeItem(
      TWO_FACTOR_VERIFICATION_KEY
    );
  } catch {
    // Temporary authentication storage may be unavailable.
  }
}

/* ============================================================
   TIME
   ============================================================ */

function formatSeconds(
  seconds:
    number
) {
  const minutes =
    Math.floor(
      seconds /
        60
    );

  const remainingSeconds =
    seconds %
    60;

  if (
    minutes >
    0
  ) {
    return `${minutes}:${String(
      remainingSeconds
    ).padStart(
      2,
      '0'
    )}`;
  }

  return `${remainingSeconds}s`;
}

/* ============================================================
   PAGE
   ============================================================ */

export default function TwoFactorLoginClient() {
  const router =
    useRouter();

  const automaticEmailStarted =
    useRef(
      false
    );

  const [
    email,
    setEmail,
  ] = useState(
    ''
  );

  const [
    challengeToken,
    setChallengeToken,
  ] = useState(
    ''
  );

  const [
    rememberMe,
    setRememberMe,
  ] = useState(
    false
  );

  const [
    intendedNext,
    setIntendedNext,
  ] = useState(
    '/dashboard'
  );

  const [
    verification,
    setVerification,
  ] = useState<
    VerificationState
  >(
    DEFAULT_VERIFICATION
  );

  const [
    mode,
    setMode,
  ] = useState<
    VerificationMode
  >(
    'authenticator'
  );

  const [
    code,
    setCode,
  ] = useState(
    ''
  );

  const [
    codeError,
    setCodeError,
  ] = useState<
    string | null
  >(
    null
  );

  const [
    submitting,
    setSubmitting,
  ] = useState(
    false
  );

  const [
    sendingEmail,
    setSendingEmail,
  ] = useState(
    false
  );

  const [
    emailCodeSent,
    setEmailCodeSent,
  ] = useState(
    false
  );

  const [
    resendSeconds,
    setResendSeconds,
  ] = useState(
    0
  );

  const [
    darkMode,
    setDarkMode,
  ] = useState(
    false
  );

  const [
    ready,
    setReady,
  ] = useState(
    false
  );

  const [
    overlay,
    setOverlay,
  ] = useState<
    ReturnType<
      typeof getAuthOverlayMessage
    > | null
  >(
    null
  );

  /* ==========================================================
     THEME
     ========================================================== */

  useEffect(
    () => {
      try {
        const stored =
          localStorage.getItem(
            THEME_STORAGE_KEY
          );

        const systemDark =
          window.matchMedia?.(
            '(prefers-color-scheme: dark)'
          ).matches ??
          false;

        const useDark =
          stored ===
            'dark' ||
          (
            !stored &&
            systemDark
          );

        setDarkMode(
          useDark
        );

        document.documentElement.classList.toggle(
          'dark',
          useDark
        );
      } catch {
        // The page remains usable without stored theme data.
      }
    },
    []
  );

  const toggleTheme =
    useCallback(
      () => {
        setDarkMode(
          (
            current
          ) => {
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
              // Ignore theme persistence failure.
            }

            return next;
          }
        );
      },
      []
    );

  /* ==========================================================
     RESTORE LOGIN CHALLENGE
     ========================================================== */

  useEffect(
    () => {
      try {
        const storedEmail =
          sessionStorage.getItem(
            TWO_FACTOR_EMAIL_KEY
          ) ||
          '';

        const storedChallenge =
          sessionStorage.getItem(
            TWO_FACTOR_CHALLENGE_KEY
          ) ||
          '';

        const storedRemember =
          sessionStorage.getItem(
            TWO_FACTOR_REMEMBER_KEY
          ) ===
          'true';

        const storedNext =
          safeNextPath(
            sessionStorage.getItem(
              TWO_FACTOR_NEXT_KEY
            )
          );

        const storedVerification =
          parseVerificationState(
            sessionStorage.getItem(
              TWO_FACTOR_VERIFICATION_KEY
            )
          );

        setEmail(
          storedEmail
        );

        setChallengeToken(
          storedChallenge
        );

        setRememberMe(
          storedRemember
        );

        setIntendedNext(
          storedNext
        );

        setVerification(
          storedVerification
        );

        setMode(
          chooseInitialMode(
            storedVerification
          )
        );

        if (
          !storedEmail ||
          !storedChallenge
        ) {
          setOverlay(
            getAuthOverlayMessage(
              'LOGIN_CHALLENGE_EXPIRED'
            )
          );
        }
      } catch {
        setOverlay(
          getAuthOverlayMessage(
            'LOGIN_CHALLENGE_EXPIRED'
          )
        );
      } finally {
        setReady(
          true
        );
      }
    },
    []
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
     AVAILABLE METHODS
     ========================================================== */

  const availableModes =
    useMemo<
      VerificationMode[]
    >(
      () => {
        const methods:
          VerificationMode[] = [
            ...verification.methods,
          ];

        if (
          verification
            .recoveryAvailable
        ) {
          methods.push(
            'recovery'
          );
        }

        return methods;
      },
      [
        verification,
      ]
    );

  /* ==========================================================
     CODE DISPLAY
     ========================================================== */

  const displayCode =
    useMemo(
      () => {
        if (
          mode ===
          'recovery'
        ) {
          return cleanRecoveryCode(
            code
          );
        }

        return cleanSixDigitCode(
          code
        );
      },
      [
        code,
        mode,
      ]
    );

  /* ==========================================================
     UPDATE VERIFICATION STATE
     ========================================================== */

  const applyVerificationState =
    useCallback(
      (
        next?:
          Partial<
            VerificationState
          >
      ) => {
        if (
          !next
        ) {
          return;
        }

        setVerification(
          (
            current
          ) => {
            const merged:
              VerificationState = {
                methods:
                  Array.isArray(
                    next.methods
                  )
                    ? next.methods
                    : current.methods,

                preferredMethod:
                  next.preferredMethod ===
                  undefined
                    ? current.preferredMethod
                    : next.preferredMethod,

                maskedEmail:
                  next.maskedEmail ===
                  undefined
                    ? current.maskedEmail
                    : next.maskedEmail,

                recoveryAvailable:
                  next.recoveryAvailable ===
                  undefined
                    ? current.recoveryAvailable
                    : next.recoveryAvailable,
              };

            try {
              sessionStorage.setItem(
                TWO_FACTOR_VERIFICATION_KEY,
                JSON.stringify(
                  merged
                )
              );
            } catch {
              // Keep the server state in memory.
            }

            return merged;
          }
        );
      },
      []
    );

  /* ==========================================================
     INPUT
     ========================================================== */

  function updateCode(
    value:
      string
  ) {
    const nextCode =
      mode ===
      'recovery'
        ? cleanRecoveryCode(
            value
          )
        : cleanSixDigitCode(
            value
          );

    setCode(
      nextCode
    );

    if (
      codeError
    ) {
      setCodeError(
        null
      );
    }
  }

  /* ==========================================================
     SEND EMAIL CODE
     ========================================================== */

  const sendEmailCode =
    useCallback(
      async (
        automatic =
          false
      ) => {
        if (
          !email ||
          !challengeToken ||
          sendingEmail ||
          resendSeconds >
            0
        ) {
          return;
        }

        setSendingEmail(
          true
        );

        setCodeError(
          null
        );

        if (
          !automatic
        ) {
          setOverlay(
            null
          );
        }

        try {
          const response =
            await fetch(
              EMAIL_SEND_ENDPOINT,
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
                  'include',

                cache:
                  'no-store',

                body:
                  JSON.stringify({
                    email,

                    challengeToken,
                  }),
              }
            );

          let data:
            ApiResponse;

          try {
            data =
              (
                await response.json()
              ) as ApiResponse;
          } catch {
            data = {
              success:
                false,

              code:
                'EMAIL_TWO_FACTOR_SEND_ERROR',

              error:
                'SaMi could not process the email-code response.',
            };
          }

          if (
            !response.ok ||
            !data.success
          ) {
            const retryAfterSeconds =
              Math.max(
                0,
                Number(
                  data.retryAfterSeconds ||
                  0
                )
              );

            if (
              retryAfterSeconds >
              0
            ) {
              setResendSeconds(
                retryAfterSeconds
              );
            }

            if (
              data.code ===
              'LOGIN_CHALLENGE_EXPIRED'
            ) {
              clearChallengeStorage();
            }

            if (
              data.code ===
                'EMAIL_TWO_FACTOR_NOT_AVAILABLE' ||
              data.code ===
                'TWO_FACTOR_METHOD_NOT_AVAILABLE'
            ) {
              setVerification(
                (
                  current
                ) => {
                  const methods =
                    current.methods.filter(
                      (
                        method
                      ) =>
                        method !==
                        'email'
                    );

                  const next:
                    VerificationState = {
                      ...current,

                      methods,

                      preferredMethod:
                        current.preferredMethod ===
                        'email'
                          ? (
                              methods[0] ||
                              null
                            )
                          : current.preferredMethod,
                    };

                  try {
                    sessionStorage.setItem(
                      TWO_FACTOR_VERIFICATION_KEY,
                      JSON.stringify(
                        next
                      )
                    );
                  } catch {
                    // Keep the updated state in memory.
                  }

                  return next;
                }
              );

              if (
                verification.methods.includes(
                  'authenticator'
                )
              ) {
                setMode(
                  'authenticator'
                );
              } else if (
                verification
                  .recoveryAvailable
              ) {
                setMode(
                  'recovery'
                );
              }
            }

            setOverlay(
              getAuthOverlayMessage(
                data.code ||
                  'EMAIL_TWO_FACTOR_SEND_ERROR',
                {
                  fallback:
                    data.error ||
                    data.message ||
                    'SaMi could not send the login verification code.',

                  retryAfterSeconds:
                    data.retryAfterSeconds,

                  lockedUntil:
                    data.lockedUntil,

                  email,
                }
              )
            );

            return;
          }

          const emailVerification =
            data.emailVerification;

          const maskedEmail =
            emailVerification
              ?.maskedEmail ||
            data.maskedEmail ||
            verification
              .maskedEmail ||
            null;

          if (
            maskedEmail
          ) {
            applyVerificationState({
              maskedEmail,
            });
          }

          const cooldown =
            Math.max(
              0,
              Number(
                emailVerification
                  ?.resendCooldownSeconds ||
                data.resendCooldownSeconds ||
                60
              )
            );

          setEmailCodeSent(
            true
          );

          setResendSeconds(
            cooldown
          );
        } catch {
          setOverlay(
            getAuthOverlayMessage(
              'EMAIL_TWO_FACTOR_SEND_ERROR',
              {
                fallback:
                  'SaMi could not connect to the server. Check your connection and try again.',
              }
            )
          );
        } finally {
          setSendingEmail(
            false
          );
        }
      },
      [
        applyVerificationState,
        challengeToken,
        email,
        resendSeconds,
        sendingEmail,
        verification,
      ]
    );

  /* ==========================================================
     AUTOMATIC EMAIL DELIVERY

     Email is automatically sent only when it is the selected
     initial method.

     The ref prevents React development-mode effects from
     sending twice.
     ========================================================== */

  useEffect(
    () => {
      if (
        !ready ||
        mode !==
          'email' ||
        !verification.methods.includes(
          'email'
        ) ||
        emailCodeSent ||
        automaticEmailStarted
          .current ||
        !email ||
        !challengeToken
      ) {
        return;
      }

      automaticEmailStarted
        .current =
        true;

      void sendEmailCode(
        true
      );
    },
    [
      challengeToken,
      email,
      emailCodeSent,
      mode,
      ready,
      sendEmailCode,
      verification.methods,
    ]
  );

  /* ==========================================================
     CHANGE METHOD
     ========================================================== */

  function changeMode(
    nextMode:
      VerificationMode
  ) {
    if (
      submitting ||
      sendingEmail ||
      nextMode ===
        mode ||
      !availableModes.includes(
        nextMode
      )
    ) {
      return;
    }

    setMode(
      nextMode
    );

    setCode(
      ''
    );

    setCodeError(
      null
    );

    setOverlay(
      null
    );
  }

  /* ==========================================================
     CANCEL
     ========================================================== */

  function handleCancel() {
    if (
      submitting ||
      sendingEmail
    ) {
      return;
    }

    clearChallengeStorage();

    router.replace(
      '/login'
    );
  }

  /* ==========================================================
     VERIFY
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<
        HTMLFormElement
      >
  ) {
    event.preventDefault();

    if (
      submitting ||
      sendingEmail ||
      !email ||
      !challengeToken
    ) {
      return;
    }

    const normalizedCode =
      mode ===
      'recovery'
        ? cleanRecoveryCode(
            code
          ).trim()
        : cleanSixDigitCode(
            code
          );

    if (
      mode !==
        'recovery' &&
      normalizedCode.length !==
        6
    ) {
      setCodeError(
        'Enter the complete 6-digit verification code.'
      );

      return;
    }

    if (
      mode ===
        'recovery' &&
      !normalizedCode
    ) {
      setCodeError(
        'Enter one of your unused recovery codes.'
      );

      return;
    }

    setSubmitting(
      true
    );

    setOverlay(
      null
    );

    setCodeError(
      null
    );

    try {
      const response =
        await fetch(
          TWO_FACTOR_ENDPOINT,
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
              'include',

            cache:
              'no-store',

            body:
              JSON.stringify({
                email,

                challengeToken,

                method:
                  mode,

                code:
                  normalizedCode,

                rememberMe,
              }),
          }
        );

      let data:
        ApiResponse;

      try {
        data =
          (
            await response.json()
          ) as ApiResponse;
      } catch {
        data = {
          success:
            false,

          code:
            'TWO_FACTOR_LOGIN_ERROR',

          error:
            'SaMi could not process the verification response.',
        };
      }

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          data.code ===
          'LOGIN_CHALLENGE_EXPIRED'
        ) {
          clearChallengeStorage();
        }

        if (
          data.verification
        ) {
          applyVerificationState(
            data.verification
          );
        }

        setOverlay(
          getAuthOverlayMessage(
            data.code ||
              'TWO_FACTOR_LOGIN_ERROR',
            {
              fallback:
                data.error ||
                data.message ||
                'SaMi could not complete two-factor verification.',

              retryAfterSeconds:
                data.retryAfterSeconds,

              lockedUntil:
                data.lockedUntil,

              email,
            }
          )
        );

        return;
      }

      clearChallengeStorage();

      setCode(
        ''
      );

      const destination =
        safeNextPath(
          data.next ||
          intendedNext
        );

      router.replace(
        destination
      );

      router.refresh();
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'TWO_FACTOR_LOGIN_ERROR',
          {
            fallback:
              'SaMi could not connect to the server. Check your connection and try again.',
          }
        )
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     METHOD CONTENT
     ========================================================== */

  const methodContent = {
    authenticator: {
      icon:
        Smartphone,

      label:
        'Authenticator',

      fieldLabel:
        '6-digit authenticator code',

      help:
        'Open your authenticator app and enter the current code for SaMi.',

      placeholder:
        '000000',
    },

    email: {
      icon:
        Mail,

      label:
        'Email',

      fieldLabel:
        '6-digit email code',

      help:
        `Enter the code sent to ${
          verification.maskedEmail ||
          'your verified email'
        }.`,

      placeholder:
        '000000',
    },

    recovery: {
      icon:
        KeyRound,

      label:
        'Recovery',

      fieldLabel:
        'Recovery code',

      help:
        'Use one unused recovery code saved when two-factor authentication was enabled.',

      placeholder:
        'Enter recovery code',
    },
  } as const;

  const selectedContent =
    methodContent[
      mode
    ];

  const methodGridClass =
    availableModes.length ===
      3
      ? 'grid-cols-3'
      : availableModes.length ===
          2
        ? 'grid-cols-2'
        : 'grid-cols-1';

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

      <main className="relative min-h-screen overflow-hidden bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            BACKGROUND
           ==================================================== */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -left-52 -top-52 h-[600px] w-[600px] rounded-full bg-blue-500/[0.07] blur-[120px] dark:bg-blue-500/[0.10]" />

          <div className="absolute -bottom-56 right-[-170px] h-[620px] w-[620px] rounded-full bg-violet-500/[0.06] blur-[120px] dark:bg-violet-500/[0.09]" />
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
          className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:text-white sm:right-6 sm:top-6"
        >
          {darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* ====================================================
            PAGE
           ==================================================== */}

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1100px] items-center justify-center px-4 py-7 sm:px-6">

          <div className="grid w-full max-w-[930px] items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                BRAND
               ================================================= */}

            <section className="hidden lg:block">

              <Link
                href="/"
                aria-label="SaMi home"
                className="inline-block max-w-full"
              >
                <SaMiLogo
                  size="xl"
                  className="max-w-full"
                />
              </Link>

              <div className="mt-10 max-w-[390px]">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <ShieldCheck className="h-6 w-6" />
                </div>

                <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-[-0.04em]">
                  One more step
                  <br />
                  to your workspace.
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Complete your preferred
                  verification method to
                  securely continue to SaMi.
                </p>

                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <LockKeyhole className="h-4 w-4" />

                  Protected sign-in
                </div>
              </div>
            </section>

            {/* =================================================
                VERIFICATION CARD
               ================================================= */}

            <section className="w-full">

              <div className="mb-7 lg:hidden">

                <Link
                  href="/"
                  aria-label="SaMi home"
                  className="inline-block max-w-full"
                >
                  <SaMiLogo
                    size="lg"
                    className="max-w-full"
                  />
                </Link>
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 dark:border-slate-800 dark:bg-[#0d111a]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]">

                {/* =============================================
                    HEADER
                   ============================================= */}

                <div className="flex items-start gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <ShieldCheck className="h-6 w-6" />
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                      Secure sign-in
                    </p>

                    <h2 className="mt-1 text-[27px] font-black tracking-[-0.035em]">
                      Two-factor verification
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Choose an available
                      verification method.
                    </p>
                  </div>
                </div>

                {/* =============================================
                    ACCOUNT
                   ============================================= */}

                {email && (
                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                      <LockKeyhole className="h-3.5 w-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Signing in as
                      </p>

                      <p className="truncate text-xs font-bold">
                        {email}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={
                        handleCancel
                      }
                      disabled={
                        submitting ||
                        sendingEmail
                      }
                      className="text-[10px] font-bold text-blue-600 transition hover:text-blue-700 disabled:opacity-50 dark:text-blue-400"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* =============================================
                    METHOD SWITCH
                   ============================================= */}

                <div
                  className={`mt-5 grid gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950 ${methodGridClass}`}
                >
                  {availableModes.map(
                    (
                      availableMode
                    ) => {
                      const content =
                        methodContent[
                          availableMode
                        ];

                      const MethodIcon =
                        content.icon;

                      return (
                        <button
                          key={
                            availableMode
                          }
                          type="button"
                          onClick={() =>
                            changeMode(
                              availableMode
                            )
                          }
                          disabled={
                            submitting ||
                            sendingEmail
                          }
                          className={`flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-[10px] font-black transition ${
                            mode ===
                            availableMode
                              ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          <MethodIcon className="h-3.5 w-3.5" />

                          {content.label}
                        </button>
                      );
                    }
                  )}
                </div>

                {/* =============================================
                    EMAIL DELIVERY
                   ============================================= */}

                {mode ===
                  'email' && (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">

                    <div className="min-w-0">

                      <p className="text-[10px] font-black text-blue-700 dark:text-blue-300">
                        {sendingEmail
                          ? 'Sending code...'
                          : emailCodeSent
                            ? 'Code sent'
                            : 'Email verification'}
                      </p>

                      <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {verification.maskedEmail ||
                          'Your verified account email'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void sendEmailCode(
                          false
                        )
                      }
                      disabled={
                        sendingEmail ||
                        submitting ||
                        resendSeconds >
                          0
                      }
                      className="ml-3 inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-blue-400"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          sendingEmail
                            ? 'animate-spin'
                            : ''
                        }`}
                      />

                      {resendSeconds >
                      0
                        ? `Resend in ${formatSeconds(
                            resendSeconds
                          )}`
                        : emailCodeSent
                          ? 'Resend code'
                          : 'Send code'}
                    </button>
                  </div>
                )}

                {/* =============================================
                    FORM
                   ============================================= */}

                <form
                  onSubmit={
                    handleSubmit
                  }
                  noValidate
                  className="mt-5"
                >

                  <label
                    htmlFor="two-factor-code"
                    className="text-[12px] font-bold text-slate-700 dark:text-slate-200"
                  >
                    {
                      selectedContent
                        .fieldLabel
                    }
                  </label>

                  <input
                    id="two-factor-code"
                    type="text"
                    inputMode={
                      mode ===
                      'recovery'
                        ? 'text'
                        : 'numeric'
                    }
                    autoComplete={
                      mode ===
                      'recovery'
                        ? 'off'
                        : 'one-time-code'
                    }
                    autoCapitalize="none"
                    spellCheck={
                      false
                    }
                    maxLength={
                      mode ===
                      'recovery'
                        ? 64
                        : 6
                    }
                    value={
                      displayCode
                    }
                    onChange={(
                      event
                    ) =>
                      updateCode(
                        event
                          .target
                          .value
                      )
                    }
                    autoFocus
                    disabled={
                      submitting ||
                      sendingEmail ||
                      !ready ||
                      !email ||
                      !challengeToken
                    }
                    placeholder={
                      selectedContent
                        .placeholder
                    }
                    aria-invalid={
                      Boolean(
                        codeError
                      )
                    }
                    aria-describedby={
                      codeError
                        ? 'two-factor-code-error'
                        : 'two-factor-code-help'
                    }
                    className={`mt-2 w-full rounded-2xl border bg-white px-4 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 ${
                      mode ===
                      'recovery'
                        ? 'h-12 text-sm font-bold tracking-wide'
                        : 'h-[66px] text-center text-[28px] font-black tracking-[0.35em]'
                    } ${
                      codeError
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-500'
                    }`}
                  />

                  {codeError ? (
                    <p
                      id="two-factor-code-error"
                      role="alert"
                      className="mt-1.5 text-xs font-medium text-red-500"
                    >
                      {codeError}
                    </p>
                  ) : (
                    <p
                      id="two-factor-code-help"
                      className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400"
                    >
                      {
                        selectedContent
                          .help
                      }
                    </p>
                  )}

                  {/* ===========================================
                      SUBMIT
                     =========================================== */}

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      sendingEmail ||
                      !ready ||
                      !email ||
                      !challengeToken
                    }
                    aria-busy={
                      submitting
                    }
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.997] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />

                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify and continue

                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* =============================================
                    SECURITY NOTE
                   ============================================= */}

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">

                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                  <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    SaMi will never ask you
                    to share your authenticator
                    secret, email verification
                    code, or unused recovery
                    codes outside this secure
                    sign-in flow.
                  </p>
                </div>

                {/* =============================================
                    CANCEL
                   ============================================= */}

                <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">

                  <button
                    type="button"
                    onClick={
                      handleCancel
                    }
                    disabled={
                      submitting ||
                      sendingEmail
                    }
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />

                    Back to sign in
                  </button>
                </div>
              </div>

              {/* ===============================================
                  FOOTER
                 =============================================== */}

              <div className="mt-4 flex justify-center gap-4 text-[10px] text-slate-400">

                <Link
                  href="/help"
                  className="transition hover:text-slate-700 dark:hover:text-white"
                >
                  Help
                </Link>

                <Link
                  href="/privacy"
                  className="transition hover:text-slate-700 dark:hover:text-white"
                >
                  Privacy
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}