'use client';

import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Link from 'next/link';

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type OverlayState = {
  open:
    boolean;

  type:
    SaMiOverlayType;

  title:
    string;

  message:
    string;
};

type CompleteIdentityResponse = {
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
    number;

  admin?: {
    id?:
      string;

    email?:
      string;

    firstName?:
      string;

    lastName?:
      string;

    fullName?:
      string;

    role?:
      string;

    status?:
      string;

    emailVerified?:
      boolean;

    twoFactorRequired?:
      boolean;

    twoFactorEnabled?:
      boolean;
  };
};

type PasswordRequirements = {
  length:
    boolean;

  uppercase:
    boolean;

  lowercase:
    boolean;

  number:
    boolean;

  symbol:
    boolean;

  noWhitespace:
    boolean;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MIN_PASSWORD_LENGTH =
  12;

const MAX_PASSWORD_LENGTH =
  128;

/* ============================================================
   HELPERS
   ============================================================ */

function evaluatePassword(
  password:
    string
): PasswordRequirements {
  return {
    length:
      password.length >=
        MIN_PASSWORD_LENGTH &&
      password.length <=
        MAX_PASSWORD_LENGTH,

    uppercase:
      /[A-Z]/.test(
        password
      ),

    lowercase:
      /[a-z]/.test(
        password
      ),

    number:
      /[0-9]/.test(
        password
      ),

    symbol:
      /[^A-Za-z0-9]/.test(
        password
      ),

    noWhitespace:
      !/\s/.test(
        password
      ),
  };
}

function isPasswordValid(
  requirements:
    PasswordRequirements
): boolean {
  return Object
    .values(
      requirements
    )
    .every(
      Boolean
    );
}

function cleanSetupTokenFromUrl() {
  try {
    const url =
      new URL(
        window.location.href
      );

    url.searchParams.delete(
      'token'
    );

    const replacement =
      `${url.pathname}${url.search}${url.hash}`;

    window.history.replaceState(
      {},
      '',
      replacement
    );
  } catch {
    /*
     * URL cleanup is defense-in-depth.
     *
     * Failure here must not destroy the in-memory setup token.
     */
  }
}

/* ============================================================
   PASSWORD REQUIREMENT
   ============================================================ */

function Requirement({
  met,
  children,
}: {
  met:
    boolean;

  children:
    React.ReactNode;
}) {
  return (
    <div
      className={[
        'flex items-center gap-2 text-xs font-medium transition',
        met
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-500 dark:text-slate-400',
      ].join(
        ' '
      )}
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
          met
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500',
        ].join(
          ' '
        )}
      >
        {met ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </span>

      <span>
        {children}
      </span>
    </div>
  );
}

/* ============================================================
   MAIN CLIENT
   ============================================================ */

function AdminCompleteIdentityContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    setupToken,
    setSetupToken,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    completed,
    setCompleted,
  ] =
    useState(false);

  const [
    tokenReady,
    setTokenReady,
  ] =
    useState(false);

  const [
    fieldError,
    setFieldError,
  ] =
    useState('');

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open:
        false,

      type:
        'error',

      title:
        '',

      message:
        '',
    });

  const passwordRequirements =
    useMemo(
      () =>
        evaluatePassword(
          password
        ),
      [
        password,
      ]
    );

  const passwordValid =
    isPasswordValid(
      passwordRequirements
    );

  const passwordsMatch =
    Boolean(
      password &&
      confirmPassword &&
      password ===
        confirmPassword
    );

  /* ==========================================================
     TOKEN CAPTURE + URL CLEANUP

     Capture once into memory, then immediately remove it from
     the address bar.

     This reduces accidental leakage through:
     - copied URLs
     - screenshots
     - browser history display
     - referrer propagation

     The API still receives the in-memory token over POST.
     ========================================================== */

  useEffect(
    () => {
      const token =
        searchParams
          .get(
            'token'
          )
          ?.trim() ||
        '';

      setSetupToken(
        token
      );

      setTokenReady(
        true
      );

      if (
        token
      ) {
        cleanSetupTokenFromUrl();
      }
    },
    [
      searchParams,
    ]
  );

  /* ==========================================================
     OVERLAY
     ========================================================== */

  function showOverlay(
    type:
      SaMiOverlayType,
    title:
      string,
    message:
      string
  ) {
    setOverlay({
      open:
        true,

      type,

      title,

      message,
    });
  }

  function closeOverlay() {
    /*
     * After successful account activation the overlay should not
     * simply reveal an already-completed form.
     */
    if (
      completed
    ) {
      router.replace(
        '/admin/login?reason=account_ready'
      );

      return;
    }

    setOverlay(
      current => ({
        ...current,
        open:
          false,
      })
    );
  }

  /* ==========================================================
     SUBMIT
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting ||
      completed
    ) {
      return;
    }

    setFieldError('');

    if (
      !setupToken
    ) {
      showOverlay(
        'error',
        'Setup link unavailable',
        'This administrator setup link is invalid or has expired.'
      );

      return;
    }

    if (
      !password
    ) {
      setFieldError(
        'Enter your new administrator password.'
      );

      return;
    }

    if (
      !passwordValid
    ) {
      setFieldError(
        'Your password does not yet meet all administrator security requirements.'
      );

      return;
    }

    if (
      !confirmPassword
    ) {
      setFieldError(
        'Confirm your new administrator password.'
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setFieldError(
        'The passwords do not match.'
      );

      return;
    }

    setSubmitting(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/complete-identity',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            cache:
              'no-store',

            credentials:
              'same-origin',

            body:
              JSON.stringify({
                token:
                  setupToken,

                password,

                confirmPassword,
              }),
          }
        );

      let data:
        CompleteIdentityResponse;

      try {
        data =
          await response.json();
      } catch {
        data = {
          success:
            false,

          code:
            'INVALID_SERVER_RESPONSE',

          error:
            'SaMi returned an invalid response.',
        };
      }

      /* ======================================================
         SUCCESS
         ====================================================== */

      if (
        response.ok &&
        data.success
      ) {
        /*
         * Destroy the credential from React state as soon as the
         * server has consumed it.
         */
        setSetupToken(
          ''
        );

        setPassword(
          ''
        );

        setConfirmPassword(
          ''
        );

        setCompleted(
          true
        );

        showOverlay(
          'success',
          'Administrator account ready',
          'Your Platform Administrator identity is now active. Sign in with your new password to continue with the required security setup.'
        );

        return;
      }

      /* ======================================================
         RATE LIMIT
         ====================================================== */

      if (
        response.status ===
          429 ||
        data.code ===
          'SETUP_RATE_LIMITED'
      ) {
        const retryAfter =
          Math.max(
            1,
            Number(
              data.retryAfterSeconds ||
              response.headers.get(
                'Retry-After'
              ) ||
              60
            )
          );

        showOverlay(
          'warning',
          'Too many attempts',
          `Administrator setup has been temporarily limited. Try again in about ${retryAfter} seconds.`
        );

        return;
      }

      /* ======================================================
         INVALID PASSWORD
         ====================================================== */

      if (
        data.code ===
          'INVALID_PASSWORD'
      ) {
        setFieldError(
          data.error ||
            'Your password does not meet the administrator security requirements.'
        );

        return;
      }

      if (
        data.code ===
          'PASSWORD_MISMATCH'
      ) {
        setFieldError(
          'The passwords do not match.'
        );

        return;
      }

      /* ======================================================
         TOKEN FAILURE
         ====================================================== */

      if (
        data.code ===
          'SETUP_TOKEN_INVALID' ||
        data.code ===
          'INVALID_TOKEN'
      ) {
        setSetupToken(
          ''
        );

        showOverlay(
          'error',
          'Setup link expired',
          'This administrator setup link is invalid, expired, or has already been used.'
        );

        return;
      }

      /* ======================================================
         SERVICE FAILURE
         ====================================================== */

      if (
        response.status ===
          503 ||
        data.code ===
          'SERVICE_TEMPORARILY_UNAVAILABLE'
      ) {
        showOverlay(
          'warning',
          'SaMi is temporarily unavailable',
          'Your administrator setup could not be completed right now. Your setup link has not necessarily been consumed, so you can retry shortly.'
        );

        return;
      }

      /* ======================================================
         GENERAL FAILURE
         ====================================================== */

      showOverlay(
        'error',
        'Setup could not be completed',
        data.error ||
          'SaMi could not complete your administrator account setup.'
      );
    } catch (
      error
    ) {
      console.error(
        '[Admin Complete Identity] Request failed:',
        error instanceof
          Error
          ? error.message
          : 'Unknown client request error'
      );

      showOverlay(
        'error',
        'Connection problem',
        'SaMi could not reach the authentication service. Check your connection and try again.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     INVALID TOKEN SCREEN
     ========================================================== */

  const missingToken =
    tokenReady &&
    !setupToken &&
    !completed;

  return (
    <>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
          <div className="grid w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20 lg:grid-cols-[0.9fr_1.1fr]">

            {/* =================================================
                BRAND / SECURITY PANEL
                ================================================= */}

            <section className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-950 p-10 text-white dark:border-slate-800 lg:flex lg:flex-col lg:justify-between">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.16),transparent_35%)]"
              />

              <div className="relative z-10">
                <SaMiLogo
                  size="lg"
                  showTagline
                  showBackground={false}
                />

                <div className="mt-16 max-w-md">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <ShieldCheck className="h-7 w-7 text-blue-300" />
                  </div>

                  <h1 className="mt-6 text-3xl font-black tracking-tight">
                    Secure your Platform Administrator identity
                  </h1>

                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    Your email ownership has been confirmed. Create the password that will protect your SaMi Platform Administrator identity.
                  </p>
                </div>
              </div>

              <div className="relative z-10 space-y-4">
                <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />

                  <div>
                    <p className="text-sm font-bold">
                      Strong administrator credentials
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Platform Administrator passwords use stricter requirements than standard workspace accounts.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />

                  <div>
                    <p className="text-sm font-bold">
                      One-time setup
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      This setup credential expires and can only activate your administrator identity once.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================
                FORM PANEL
                ================================================= */}

            <section className="p-6 sm:p-10 lg:p-12">
              <div className="mx-auto w-full max-w-lg">
                <div className="mb-8 lg:hidden">
                  <SaMiLogo
                    size="md"
                    showTagline
                    showBackground={false}
                  />
                </div>

                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Platform Administrator
                  </div>

                  <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                    Complete your account
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Create your administrator password. After this step, you will sign in normally and continue with the required security setup.
                  </p>
                </div>

                {!tokenReady ? (
                  <div className="flex min-h-72 items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-400" />

                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        Preparing secure setup…
                      </p>
                    </div>
                  </div>
                ) : missingToken ? (
                  <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/20">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
                      <X className="h-6 w-6" />
                    </div>

                    <h3 className="mt-5 text-lg font-black text-slate-950 dark:text-white">
                      Setup link unavailable
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      This administrator setup link is missing, expired, or has already been used.
                    </p>

                    <Link
                      href="/admin/login"
                      className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      Return to administrator sign in
                    </Link>
                  </div>
                ) : (
                  <form
                    onSubmit={
                      handleSubmit
                    }
                    className="mt-8 space-y-6"
                  >
                    {/* PASSWORD */}

                    <div>
                      <label
                        htmlFor="admin-password"
                        className="text-sm font-bold text-slate-700 dark:text-slate-200"
                      >
                        New administrator password
                      </label>

                      <div className="relative mt-2">
                        <input
                          id="admin-password"
                          type={
                            showPassword
                              ? 'text'
                              : 'password'
                          }
                          autoComplete="new-password"
                          value={
                            password
                          }
                          onChange={event => {
                            setPassword(
                              event.target.value
                            );

                            if (
                              fieldError
                            ) {
                              setFieldError(
                                ''
                              );
                            }
                          }}
                          maxLength={
                            MAX_PASSWORD_LENGTH
                          }
                          disabled={
                            submitting ||
                            completed
                          }
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400"
                          placeholder="Create a secure password"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(
                              current =>
                                !current
                            )
                          }
                          disabled={
                            submitting ||
                            completed
                          }
                          aria-label={
                            showPassword
                              ? 'Hide password'
                              : 'Show password'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* REQUIREMENTS */}

                    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 sm:grid-cols-2">
                      <Requirement
                        met={
                          passwordRequirements.length
                        }
                      >
                        12–128 characters
                      </Requirement>

                      <Requirement
                        met={
                          passwordRequirements.uppercase
                        }
                      >
                        Uppercase letter
                      </Requirement>

                      <Requirement
                        met={
                          passwordRequirements.lowercase
                        }
                      >
                        Lowercase letter
                      </Requirement>

                      <Requirement
                        met={
                          passwordRequirements.number
                        }
                      >
                        Number
                      </Requirement>

                      <Requirement
                        met={
                          passwordRequirements.symbol
                        }
                      >
                        Symbol
                      </Requirement>

                      <Requirement
                        met={
                          passwordRequirements.noWhitespace
                        }
                      >
                        No spaces
                      </Requirement>
                    </div>

                    {/* CONFIRM */}

                    <div>
                      <label
                        htmlFor="admin-password-confirm"
                        className="text-sm font-bold text-slate-700 dark:text-slate-200"
                      >
                        Confirm password
                      </label>

                      <div className="relative mt-2">
                        <input
                          id="admin-password-confirm"
                          type={
                            showConfirmPassword
                              ? 'text'
                              : 'password'
                          }
                          autoComplete="new-password"
                          value={
                            confirmPassword
                          }
                          onChange={event => {
                            setConfirmPassword(
                              event.target.value
                            );

                            if (
                              fieldError
                            ) {
                              setFieldError(
                                ''
                              );
                            }
                          }}
                          maxLength={
                            MAX_PASSWORD_LENGTH
                          }
                          disabled={
                            submitting ||
                            completed
                          }
                          className={[
                            'h-12 w-full rounded-2xl border bg-white px-4 pr-12 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 dark:text-white',
                            confirmPassword &&
                            !passwordsMatch
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10 dark:border-red-800'
                              : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-400',
                          ].join(
                            ' '
                          )}
                          placeholder="Repeat your password"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(
                              current =>
                                !current
                            )
                          }
                          disabled={
                            submitting ||
                            completed
                          }
                          aria-label={
                            showConfirmPassword
                              ? 'Hide confirmation password'
                              : 'Show confirmation password'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>

                      {confirmPassword && (
                        <p
                          className={[
                            'mt-2 text-xs font-semibold',
                            passwordsMatch
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400',
                          ].join(
                            ' '
                          )}
                        >
                          {passwordsMatch
                            ? 'Passwords match.'
                            : 'Passwords do not match.'}
                        </p>
                      )}
                    </div>

                    {/* FIELD ERROR */}

                    {fieldError && (
                      <div
                        role="alert"
                        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                      >
                        {fieldError}
                      </div>
                    )}

                    {/* SUBMIT */}

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        completed ||
                        !passwordValid ||
                        !passwordsMatch
                      }
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Securing account…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          Complete administrator setup
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-center">
                      <Link
                        href="/admin/login"
                        className="text-sm font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                      >
                        Return to administrator sign in
                      </Link>
                    </div>
                  </form>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

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
        onClose={
          closeOverlay
        }
        primaryAction={
          completed
            ? {
                label:
                  'Continue to sign in',

                onClick: () => {
                  router.replace(
                    '/admin/login?reason=account_ready'
                  );
                },
              }
            : undefined
        }
        secondaryAction={
          completed
            ? undefined
            : overlay.type ===
                'error' &&
              !setupToken
              ? {
                  label:
                    'Administrator sign in',

                  href:
                    '/admin/login',
                }
              : undefined
        }
      />
    </>
  );
}

/* ============================================================
   SUSPENSE FALLBACK

   useSearchParams() requires a Suspense boundary for production
   builds.
   ============================================================ */

function AdminCompleteIdentityFallback() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-center">
            <SaMiLogo
              size="md"
              showTagline
              showBackground={false}
            />
          </div>

          <Loader2 className="mx-auto mt-8 h-7 w-7 animate-spin text-slate-400" />

          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Preparing secure administrator setup…
          </p>
        </div>
      </div>
    </main>
  );
}

export default function AdminCompleteIdentityPage() {
  return (
    <Suspense
      fallback={
        <AdminCompleteIdentityFallback />
      }
    >
      <AdminCompleteIdentityContent />
    </Suspense>
  );
}