'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import TwoFactorSettings from './TwoFactorSettings';
import EmailTwoFactorSettings from './EmailTwoFactorSettings';

/* ============================================================
   TYPES
   ============================================================ */

type SecurityView =
  | 'home'
  | 'password'
  | 'verification'
  | 'authenticator'
  | 'email';

type OverlayState = {
  type:
    | 'success'
    | 'warning'
    | 'error';

  title:
    string;

  message:
    string;

  primaryAction?: {
    label:
      string;

    onClick:
      () => void;
  };

  secondaryAction?: {
    label:
      string;

    onClick:
      () => void;
  };
};

type PasswordResponse = {
  success?: boolean;

  code?: string;

  error?: string;

  message?: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const CHANGE_PASSWORD_ENDPOINT =
  '/api/auth/change-password';

const MIN_PASSWORD_LENGTH =
  8;

const MAX_PASSWORD_LENGTH =
  128;

/* ============================================================
   URL STATE
   ============================================================ */

function getSecurityViewFromUrl():
  SecurityView {
  if (
    typeof window ===
    'undefined'
  ) {
    return 'home';
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const value =
    params.get(
      'security'
    );

  switch (
    value
  ) {
    case 'password':
      return 'password';

    case 'verification':
      return 'verification';

    case 'authenticator':
      return 'authenticator';

    case 'email':
      return 'email';

    default:
      return 'home';
  }
}

function updateSecurityUrl(
  view:
    SecurityView
) {
  if (
    typeof window ===
    'undefined'
  ) {
    return;
  }

  const url =
    new URL(
      window.location.href
    );

  /*
   * Security always remains the active top-level
   * Settings category.
   */
  url.searchParams.set(
    'tab',
    'security'
  );

  if (
    view ===
    'home'
  ) {
    url.searchParams.delete(
      'security'
    );
  } else {
    url.searchParams.set(
      'security',
      view
    );
  }

  window.history.pushState(
    {},
    '',
    url
  );
}

/* ============================================================
   PASSWORD VALIDATION
   ============================================================ */

function getPasswordRequirements(
  password:
    string
) {
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
      /\d/.test(
        password
      ),
  };
}

function isPasswordValid(
  password:
    string
) {
  const requirements =
    getPasswordRequirements(
      password
    );

  return (
    requirements.length &&
    requirements.uppercase &&
    requirements.lowercase &&
    requirements.number
  );
}

/* ============================================================
   API MESSAGE
   ============================================================ */

function getApiMessage(
  payload:
    PasswordResponse | null,
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

/* ============================================================
   COMPONENT
   ============================================================ */

export default function SecuritySettings() {
  /* ==========================================================
     VIEW
     ========================================================== */

  const [
    view,
    setView,
  ] =
    useState<SecurityView>(
      'home'
    );

  /* ==========================================================
     PASSWORD
     ========================================================== */

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState('');

  const [
    newPassword,
    setNewPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showCurrentPassword,
    setShowCurrentPassword,
  ] =
    useState(
      false
    );

  const [
    showNewPassword,
    setShowNewPassword,
  ] =
    useState(
      false
    );

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(
      false
    );

  const [
    confirmPasswordError,
    setConfirmPasswordError,
  ] =
    useState<
      string | null
    >(null);

  const [
    submittingPassword,
    setSubmittingPassword,
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
    useState<
      OverlayState | null
    >(null);

  /* ==========================================================
     URL INITIALIZATION
     ========================================================== */

  useEffect(
    () => {
      const syncFromUrl =
        () => {
          setView(
            getSecurityViewFromUrl()
          );
        };

      syncFromUrl();

      window.addEventListener(
        'popstate',
        syncFromUrl
      );

      return () => {
        window.removeEventListener(
          'popstate',
          syncFromUrl
        );
      };
    },
    []
  );

  /* ==========================================================
     NAVIGATION
     ========================================================== */

  const navigate =
    useCallback(
      (
        next:
          SecurityView
      ) => {
        updateSecurityUrl(
          next
        );

        setView(
          next
        );

        window.scrollTo({
          top: 0,
          behavior:
            'smooth',
        });
      },
      []
    );

  const goBack =
    useCallback(
      () => {
        switch (
          view
        ) {
          case 'authenticator':
          case 'email':
            navigate(
              'verification'
            );
            return;

          case 'password':
          case 'verification':
            navigate(
              'home'
            );
            return;

          default:
            return;
        }
      },
      [
        navigate,
        view,
      ]
    );

  /* ==========================================================
     PASSWORD REQUIREMENTS
     ========================================================== */

  const passwordRequirements =
    useMemo(
      () =>
        getPasswordRequirements(
          newPassword
        ),
      [
        newPassword,
      ]
    );

  /* ==========================================================
     CHANGE PASSWORD
     ========================================================== */

  async function changePassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setConfirmPasswordError(
      null
    );

    /* --------------------------------------------------------
       CURRENT PASSWORD
       -------------------------------------------------------- */

    if (
      !currentPassword
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Current password required',

        message:
          'Enter your current password before changing it.',
      });

      return;
    }

    /* --------------------------------------------------------
       NEW PASSWORD
       -------------------------------------------------------- */

    if (
      !newPassword
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'New password required',

        message:
          'Enter the new password you want to use for your SaMi account.',
      });

      return;
    }

    if (
      newPassword.length >
      MAX_PASSWORD_LENGTH
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Password too long',

        message:
          `Your password must contain no more than ${MAX_PASSWORD_LENGTH} characters.`,
      });

      return;
    }

    if (
      !isPasswordValid(
        newPassword
      )
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Password requirements not met',

        message:
          'Your new password must contain at least 8 characters, an uppercase letter, a lowercase letter, and a number.',
      });

      return;
    }

    /* --------------------------------------------------------
       CONFIRMATION
       -------------------------------------------------------- */

    if (
      !confirmPassword
    ) {
      setConfirmPasswordError(
        'Confirm your new password.'
      );

      return;
    }

    if (
      confirmPassword !==
      newPassword
    ) {
      setConfirmPasswordError(
        'The passwords do not match.'
      );

      return;
    }

    /* --------------------------------------------------------
       SAME PASSWORD
       -------------------------------------------------------- */

    if (
      currentPassword ===
      newPassword
    ) {
      setOverlay({
        type:
          'warning',

        title:
          'Choose a different password',

        message:
          'Your new password must be different from your current password.',
      });

      return;
    }

    /* --------------------------------------------------------
       REQUEST
       -------------------------------------------------------- */

    setSubmittingPassword(
      true
    );

    try {
      const response =
        await fetch(
          CHANGE_PASSWORD_ENDPOINT,
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

                newPassword,

                confirmPassword,
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
          | PasswordResponse
          | null;

      /* ------------------------------------------------------
         SESSION EXPIRED
         ------------------------------------------------------ */

      if (
        response.status ===
          401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
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

        return;
      }

      /* ------------------------------------------------------
         FAILURE
         ------------------------------------------------------ */

      if (
        !response.ok ||
        !payload?.success
      ) {
        setOverlay({
          type:
            'error',

          title:
            'Password not changed',

          message:
            getApiMessage(
              payload,
              'SaMi could not change your password. Check your current password and try again.'
            ),
        });

        return;
      }

      /* ------------------------------------------------------
         SUCCESS
         ------------------------------------------------------ */

      setCurrentPassword(
        ''
      );

      setNewPassword(
        ''
      );

      setConfirmPassword(
        ''
      );

      setConfirmPasswordError(
        null
      );

      setOverlay({
        type:
          'success',

        title:
          'Password changed',

        message:
          payload.message ||
          'Your SaMi password has been changed successfully.',
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
      setSubmittingPassword(
        false
      );
    }
  }

  /* ==========================================================
     SCREEN TITLE
     ========================================================== */

  const header =
    useMemo(
      () => {
        switch (
          view
        ) {
          case 'password':
            return {
              title:
                'Password',

              description:
                'Change the password used to sign in to your SaMi account.',
            };

          case 'verification':
            return {
              title:
                'Verification',

              description:
                'Manage the methods SaMi can use to verify that a sign-in is really you.',
            };

          case 'authenticator':
            return {
              title:
                'Authenticator app',

              description:
                'Use time-based verification codes from your authenticator app.',
            };

          case 'email':
            return {
              title:
                'Email login codes',

              description:
                'Use one-time verification codes sent to your verified SaMi email.',
            };

          default:
            return {
              title:
                'Security',

              description:
                'Protect your SaMi account and manage how your identity is verified.',
            };
        }
      },
      [
        view,
      ]
    );

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {/* ======================================================
          PLATFORM OVERLAY
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

      <div className="mx-auto max-w-5xl">
        {/* ====================================================
            HEADER
           ==================================================== */}

        <div className="mb-6">
          <div className="flex items-start gap-3">
            {view !==
              'home' && (
              <button
                type="button"
                onClick={
                  goBack
                }
                aria-label="Back"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {view ===
                'home' ? (
                  <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                ) : null}

                <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                  {header.title}
                </h1>
              </div>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {header.description}
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            SECURITY HOME

            IMPORTANT:
            Only real implemented subsections appear here.
           ==================================================== */}

        {view ===
          'home' && (
          <div className="grid gap-4 md:grid-cols-2">
            <NavigationCard
              title="Password"
              description="Change your account password and review the password requirements SaMi enforces."
              icon={
                LockKeyhole
              }
              onClick={() =>
                navigate(
                  'password'
                )
              }
            />

            <NavigationCard
              title="Verification"
              description="Manage authenticator apps, email login codes, and your sign-in verification methods."
              icon={
                ShieldCheck
              }
              onClick={() =>
                navigate(
                  'verification'
                )
              }
            />
          </div>
        )}

        {/* ====================================================
            PASSWORD SCREEN
           ==================================================== */}

        {view ===
          'password' && (
          <div className="space-y-5">
            <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <LockKeyhole className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-base font-black text-slate-950 dark:text-white">
                    Change password
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    You will need your current password before SaMi can replace it.
                  </p>
                </div>
              </div>

              <form
                onSubmit={
                  changePassword
                }
                className="mt-6 max-w-xl space-y-5"
              >
                {/* CURRENT PASSWORD */}

                <PasswordField
                  label="Current password"
                  value={
                    currentPassword
                  }
                  onChange={
                    setCurrentPassword
                  }
                  visible={
                    showCurrentPassword
                  }
                  onToggleVisibility={() =>
                    setShowCurrentPassword(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                  autoComplete="current-password"
                  placeholder="Enter your current password"
                />

                {/* NEW PASSWORD */}

                <PasswordField
                  label="New password"
                  value={
                    newPassword
                  }
                  onChange={(
                    value
                  ) => {
                    setNewPassword(
                      value
                    );

                    if (
                      confirmPassword
                    ) {
                      setConfirmPasswordError(
                        value ===
                        confirmPassword
                          ? null
                          : 'The passwords do not match.'
                      );
                    }
                  }}
                  visible={
                    showNewPassword
                  }
                  onToggleVisibility={() =>
                    setShowNewPassword(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                  autoComplete="new-password"
                  placeholder="Create a new password"
                />

                {/* REQUIREMENTS */}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs font-black text-slate-700 dark:text-slate-300">
                    Password requirements
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Requirement
                      met={
                        passwordRequirements
                          .length
                      }
                    >
                      8–128 characters
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements
                          .uppercase
                      }
                    >
                      Uppercase letter
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements
                          .lowercase
                      }
                    >
                      Lowercase letter
                    </Requirement>

                    <Requirement
                      met={
                        passwordRequirements
                          .number
                      }
                    >
                      Number
                    </Requirement>
                  </div>
                </div>

                {/* CONFIRM PASSWORD */}

                <PasswordField
                  label="Confirm new password"
                  value={
                    confirmPassword
                  }
                  onChange={(
                    value
                  ) => {
                    setConfirmPassword(
                      value
                    );

                    if (
                      !value
                    ) {
                      setConfirmPasswordError(
                        null
                      );

                      return;
                    }

                    setConfirmPasswordError(
                      value ===
                      newPassword
                        ? null
                        : 'The passwords do not match.'
                    );
                  }}
                  visible={
                    showConfirmPassword
                  }
                  onToggleVisibility={() =>
                    setShowConfirmPassword(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  error={
                    confirmPasswordError
                  }
                />

                {/* ACTION */}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={
                      submittingPassword
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" />
                    )}

                    {submittingPassword
                      ? 'Changing password…'
                      : 'Change password'}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

                <div>
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">
                    Password security
                  </h3>

                  <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    Use a password you do not reuse on another service. SaMi never displays your stored password and password verification remains server-side.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ====================================================
            VERIFICATION INDEX

            REAL SUBSECTIONS ONLY.
           ==================================================== */}

        {view ===
          'verification' && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <NavigationCard
                title="Authenticator app"
                description="Use six-digit time-based codes generated by an authenticator app."
                icon={
                  Smartphone
                }
                onClick={() =>
                  navigate(
                    'authenticator'
                  )
                }
              />

              <NavigationCard
                title="Email login codes"
                description="Receive a one-time six-digit verification code at your verified SaMi email."
                icon={
                  Mail
                }
                onClick={() =>
                  navigate(
                    'email'
                  )
                }
              />
            </div>

            <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

                <div>
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">
                    Sign-in verification
                  </h3>

                  <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    You can enable more than one verification method. When both Authenticator and Email are active, SaMi can use your preferred method first while keeping the other available.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ====================================================
            AUTHENTICATOR SCREEN
           ==================================================== */}

        {view ===
          'authenticator' && (
          <TwoFactorSettings />
        )}

        {/* ====================================================
            EMAIL LOGIN CODE SCREEN
           ==================================================== */}

        {view ===
          'email' && (
          <EmailTwoFactorSettings />
        )}
      </div>
    </>
  );
}

/* ============================================================
   NAVIGATION CARD
   ============================================================ */

function NavigationCard({
  title,
  description,
  icon:
    Icon,
  onClick,
}: {
  title:
    string;

  description:
    string;

  icon:
    typeof ShieldCheck;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group flex min-h-[150px] w-full items-start gap-4 rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-900 sm:p-6"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-700 dark:bg-slate-900 dark:text-slate-400 dark:group-hover:bg-blue-950/40 dark:group-hover:text-blue-300">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-950 dark:text-white">
            {title}
          </h2>

          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-700 dark:group-hover:text-blue-400" />
        </div>

        <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </button>
  );
}

/* ============================================================
   PASSWORD FIELD
   ============================================================ */

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  autoComplete,
  placeholder,
  error,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string
    ) => void;

  visible:
    boolean;

  onToggleVisibility:
    () => void;

  autoComplete:
    string;

  placeholder:
    string;

  error?:
    string | null;
}) {
  return (
    <div>
      <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="relative mt-2">
        <input
          type={
            visible
              ? 'text'
              : 'password'
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
          autoComplete={
            autoComplete
          }
          placeholder={
            placeholder
          }
          aria-invalid={
            Boolean(
              error
            )
          }
          className={`h-12 w-full rounded-xl border bg-white px-4 pr-12 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 dark:bg-slate-950 dark:text-white ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10 dark:border-red-900'
              : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 dark:border-slate-800'
          }`}
        />

        <button
          type="button"
          onClick={
            onToggleVisibility
          }
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-white"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
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
    <div className="flex items-center gap-2">
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          met
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
        }`}
      >
        <Check className="h-3 w-3" />
      </div>

      <span
        className={`text-xs font-semibold ${
          met
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {children}
      </span>
    </div>
  );
}