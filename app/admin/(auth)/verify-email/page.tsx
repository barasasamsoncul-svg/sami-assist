'use client';

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

/* ============================================================
   TYPES
   ============================================================ */

type VerifyEmailResponse = {
  success?: boolean;

  code?: string;

  verified?: boolean;

  alreadyVerified?: boolean;

  message?: string;

  error?: string;

  next?: string;

  retryAfterSeconds?: number | null;

  admin?: {
    id?: string;

    email?: string;

    firstName?: string;

    lastName?: string;

    fullName?: string;

    role?: string;

    status?: string;

    emailVerified?: boolean;

    emailVerifiedAt?: string | null;
  } | null;
};

type ResendVerificationResponse = {
  success?: boolean;

  code?: string;

  message?: string;

  error?: string;

  retryAfterSeconds?: number | null;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const CODE_LENGTH =
  6;

const DEFAULT_RESEND_COOLDOWN_SECONDS =
  60;

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value:
    string
): string {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value:
    string
): boolean {
  const email =
    normalizeEmail(
      value
    );

  return (
    email.length >
      0 &&
    email.length <=
      254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

function normalizeCode(
  value:
    string
): string {
  return value
    .replace(
      /\D/g,
      ''
    )
    .slice(
      0,
      CODE_LENGTH
    );
}

function formatCountdown(
  seconds:
    number
): string {
  if (
    seconds <=
    0
  ) {
    return 'Resend code';
  }

  return `Resend in ${seconds}s`;
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminVerifyEmailPage() {
  const [
    email,
    setEmail,
  ] =
    useState(
      ''
    );

  const [
    digits,
    setDigits,
  ] =
    useState<
      string[]
    >(
      Array(
        CODE_LENGTH
      ).fill(
        ''
      )
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );

  const [
    resendLoading,
    setResendLoading,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    verified,
    setVerified,
  ] =
    useState(
      false
    );

  const [
    nextUrl,
    setNextUrl,
  ] =
    useState(
      '/admin/login?verified=1'
    );

  const [
    resendCooldown,
    setResendCooldown,
  ] =
    useState(
      0
    );

  const inputRefs =
    useRef<
      Array<
        HTMLInputElement | null
      >
    >(
      []
    );

  /* ==========================================================
     QUERY EMAIL
     ========================================================== */

  useEffect(
    () => {
      const params =
        new URLSearchParams(
          window
            .location
            .search
        );

      const queryEmail =
        normalizeEmail(
          params.get(
            'email'
          ) ||
            ''
        );

      if (
        queryEmail
      ) {
        setEmail(
          queryEmail
        );
      }

      /*
       * The first verification code is normally sent by
       * provisioning/login logic.
       *
       * We don't automatically resend on page mount because
       * refreshes could otherwise create repeated emails.
       */
    },
    []
  );

  /* ==========================================================
     RESEND COUNTDOWN
     ========================================================== */

  useEffect(
    () => {
      if (
        resendCooldown <=
        0
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            setResendCooldown(
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
      resendCooldown,
    ]
  );

  /* ==========================================================
     CODE
     ========================================================== */

  const code =
    useMemo(
      () =>
        digits.join(
          ''
        ),
      [
        digits,
      ]
    );

  const codeComplete =
    code.length ===
    CODE_LENGTH;

  /* ==========================================================
     INPUT MANAGEMENT
     ========================================================== */

  function updateDigit(
    index:
      number,
    value:
      string
  ) {
    const clean =
      normalizeCode(
        value
      );

    const next =
      [
        ...digits,
      ];

    if (
      clean.length >
      1
    ) {
      const characters =
        clean.split(
          ''
        );

      for (
        let offset =
          0;
        offset <
        characters.length;
        offset +=
          1
      ) {
        const targetIndex =
          index +
          offset;

        if (
          targetIndex >=
          CODE_LENGTH
        ) {
          break;
        }

        next[
          targetIndex
        ] =
          characters[
            offset
          ];
      }

      setDigits(
        next
      );

      const focusIndex =
        Math.min(
          index +
            characters.length,
          CODE_LENGTH -
            1
        );

      requestAnimationFrame(
        () => {
          inputRefs
            .current[
              focusIndex
            ]
            ?.focus();
        }
      );

      return;
    }

    next[
      index
    ] =
      clean;

    setDigits(
      next
    );

    if (
      clean &&
      index <
        CODE_LENGTH -
          1
    ) {
      requestAnimationFrame(
        () => {
          inputRefs
            .current[
              index +
                1
            ]
            ?.focus();
        }
      );
    }
  }

  function handleDigitKeyDown(
    event:
      KeyboardEvent<HTMLInputElement>,
    index:
      number
  ) {
    if (
      event.key ===
        'Backspace' &&
      !digits[
        index
      ] &&
      index >
        0
    ) {
      event.preventDefault();

      const next =
        [
          ...digits,
        ];

      next[
        index -
          1
      ] =
        '';

      setDigits(
        next
      );

      requestAnimationFrame(
        () => {
          inputRefs
            .current[
              index -
                1
            ]
            ?.focus();
        }
      );
    }

    if (
      event.key ===
        'ArrowLeft' &&
      index >
        0
    ) {
      event.preventDefault();

      inputRefs
        .current[
          index -
            1
        ]
        ?.focus();
    }

    if (
      event.key ===
        'ArrowRight' &&
      index <
        CODE_LENGTH -
          1
    ) {
      event.preventDefault();

      inputRefs
        .current[
          index +
            1
        ]
        ?.focus();
    }
  }

  function handlePaste(
    value:
      string
  ) {
    const clean =
      normalizeCode(
        value
      );

    if (
      !clean
    ) {
      return;
    }

    const next =
      Array(
        CODE_LENGTH
      ).fill(
        ''
      );

    clean
      .split(
        ''
      )
      .forEach(
        (
          character,
          index
        ) => {
          if (
            index <
            CODE_LENGTH
          ) {
            next[
              index
            ] =
              character;
          }
        }
      );

    setDigits(
      next
    );

    const lastIndex =
      Math.min(
        clean.length,
        CODE_LENGTH
      ) -
      1;

    if (
      lastIndex >=
      0
    ) {
      requestAnimationFrame(
        () => {
          inputRefs
            .current[
              lastIndex
            ]
            ?.focus();
        }
      );
    }
  }

  /* ==========================================================
     VERIFY
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      loading ||
      verified
    ) {
      return;
    }

    setError(
      null
    );

    setMessage(
      null
    );

    const normalizedEmail =
      normalizeEmail(
        email
      );

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      setError(
        'Enter the administrator email address used for this verification.'
      );

      return;
    }

    if (
      !codeComplete
    ) {
      setError(
        'Enter the complete 6-digit verification code.'
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/verify-email',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                email:
                  normalizedEmail,

                code,
              }),
          }
        );

      const data =
        (
          await response.json()
        ) as
          VerifyEmailResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          response.status ===
            429 &&
          typeof data.retryAfterSeconds ===
            'number'
        ) {
          setResendCooldown(
            Math.max(
              resendCooldown,
              data.retryAfterSeconds
            )
          );
        }

        setError(
          data.error ||
            'SaMi could not verify this email address.'
        );

        return;
      }

      setVerified(
        true
      );

      setMessage(
        data.alreadyVerified
          ? 'This administrator email address is already verified.'
          : 'Administrator email verified successfully.'
      );

      if (
        data.next
      ) {
        setNextUrl(
          data.next
        );
      }
    } catch (
      requestError
    ) {
      console.error(
        '[Admin Verify Email] Verification request failed:',
        requestError
      );

      setError(
        'Unable to reach SaMi. Check your connection and try again.'
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* ==========================================================
     RESEND
     ========================================================== */

  async function handleResend() {
    if (
      resendLoading ||
      resendCooldown >
        0 ||
      verified
    ) {
      return;
    }

    setError(
      null
    );

    setMessage(
      null
    );

    const normalizedEmail =
      normalizeEmail(
        email
      );

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      setError(
        'Enter a valid administrator email address before requesting another code.'
      );

      return;
    }

    setResendLoading(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/resend-verification',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                email:
                  normalizedEmail,
              }),
          }
        );

      const data =
        (
          await response.json()
        ) as
          ResendVerificationResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
            'SaMi could not process the verification request.'
        );

        return;
      }

      const serverCooldown =
        typeof data.retryAfterSeconds ===
          'number' &&
        data.retryAfterSeconds >
          0
          ? Math.ceil(
              data.retryAfterSeconds
            )
          : DEFAULT_RESEND_COOLDOWN_SECONDS;

      setResendCooldown(
        serverCooldown
      );

      setDigits(
        Array(
          CODE_LENGTH
        ).fill(
          ''
        )
      );

      setMessage(
        data.message ||
          'If an eligible administrator account exists for that email, SaMi will send a new verification code.'
      );

      requestAnimationFrame(
        () => {
          inputRefs
            .current[0]
            ?.focus();
        }
      );
    } catch (
      requestError
    ) {
      console.error(
        '[Admin Verify Email] Resend request failed:',
        requestError
      );

      setError(
        'Unable to reach SaMi. Check your connection and try again.'
      );
    } finally {
      setResendLoading(
        false
      );
    }
  }

  /* ==========================================================
     VERIFIED SCREEN
     ========================================================== */

  if (
    verified
  ) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-160px] h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl" />

          <div className="absolute bottom-[-180px] right-[-120px] h-[360px] w-[360px] rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <section className="relative z-10 w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <SaMiLogo
              size="md"
              showTagline={false}
              showReflection={false}
              showBackground={false}
              className="max-w-[220px]"
            />

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5" />

              Platform Administration
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/85 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>

            <div className="mt-5 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Email verified
              </h1>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {message ||
                  'Your administrator email address has been verified successfully.'}
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />

                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Identity confirmed
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Email verification confirms ownership of your administrator email. Administrative access still depends on your account status and security requirements.
                  </p>
                </div>
              </div>
            </div>

            <Link
              href={nextUrl}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              Continue to admin login
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-600">
            SaMi — AI Powered Business Workspace
          </p>
        </section>
      </main>
    );
  }

  /* ==========================================================
     FORM
     ========================================================== */

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-160px] h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-3xl" />

        <div className="absolute bottom-[-180px] right-[-120px] h-[360px] w-[360px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <section className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <SaMiLogo
            size="md"
            showTagline={false}
            showReflection={false}
            showBackground={false}
            className="max-w-[220px]"
          />

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" />

            Platform Administration
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/85 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Verify administrator email
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Enter the six-digit security code sent to the administrator email address.
            </p>
          </div>

          {error ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

              <span>
                {error}
              </span>
            </div>
          ) : null}

          {message ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

              <span>
                {message}
              </span>
            </div>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Administrator email
              </label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(
                    event
                  ) => {
                    setEmail(
                      event
                        .target
                        .value
                    );

                    setError(
                      null
                    );
                  }}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="admin@example.com"
                  disabled={
                    loading ||
                    resendLoading
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-zinc-300">
                  Verification code
                </label>

                <span className="text-xs text-zinc-600">
                  6 digits
                </span>
              </div>

              <div
                className="grid grid-cols-6 gap-2 sm:gap-3"
                onPaste={(
                  event
                ) => {
                  event.preventDefault();

                  handlePaste(
                    event
                      .clipboardData
                      .getData(
                        'text'
                      )
                  );
                }}
              >
                {digits.map(
                  (
                    digit,
                    index
                  ) => (
                    <input
                      key={
                        index
                      }
                      ref={(
                        element
                      ) => {
                        inputRefs.current[
                          index
                        ] =
                          element;
                      }}
                      type="text"
                      value={
                        digit
                      }
                      onChange={(
                        event
                      ) => {
                        updateDigit(
                          index,
                          event
                            .target
                            .value
                        );

                        setError(
                          null
                        );
                      }}
                      onKeyDown={(
                        event
                      ) =>
                        handleDigitKeyDown(
                          event,
                          index
                        )
                      }
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      autoComplete={
                        index ===
                        0
                          ? 'one-time-code'
                          : 'off'
                      }
                      aria-label={`Verification code digit ${
                        index +
                        1
                      }`}
                      disabled={
                        loading ||
                        resendLoading
                      }
                      className="h-14 min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 text-center text-xl font-semibold text-white outline-none transition focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-16 sm:text-2xl"
                    />
                  )
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={
                loading ||
                resendLoading ||
                !codeComplete ||
                !isValidEmail(
                  email
                )
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />

                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />

                  Verify email
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-zinc-800 pt-5">
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-zinc-500">
                Didn&apos;t receive the code?
              </p>

              <button
                type="button"
                onClick={
                  handleResend
                }
                disabled={
                  resendLoading ||
                  loading ||
                  resendCooldown >
                    0 ||
                  !isValidEmail(
                    email
                  )
                }
                className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 transition hover:text-blue-300 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {resendLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}

                {resendLoading
                  ? 'Sending...'
                  : formatCountdown(
                      resendCooldown
                    )}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />

              <p className="text-xs leading-5 text-zinc-500">
                Verification codes expire after 15 minutes. Never share an administrator verification code with anyone.
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />

              Back to admin login
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          SaMi — AI Powered Business Workspace
        </p>
      </section>
    </main>
  );
}