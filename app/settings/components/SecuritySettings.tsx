'use client';

import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

import TwoFactorSettings from './TwoFactorSettings';
import EmailTwoFactorSettings from './EmailTwoFactorSettings';
import SessionsSettings from './SessionsSettings';
import SecurityActivitySettings from './SecurityActivitySettings';

type SecurityView =
  | 'overview'
  | 'password'
  | 'two-factor'
  | 'authenticator'
  | 'email'
  | 'sessions'
  | 'activity';

type OverlayState = {
  type: SaMiOverlayType;
  title: string;
  message: string;
};

type PasswordResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  retryAfterSeconds?: number | null;
};

type SecuritySettingsProps = {
  onBack?: () => void;
};

const CHANGE_PASSWORD_ENDPOINT =
  '/api/auth/change-password';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function getPasswordRequirements(
  password: string
) {
  return {
    length:
      password.length >=
        MIN_PASSWORD_LENGTH &&
      password.length <=
        MAX_PASSWORD_LENGTH,

    uppercase:
      /[A-Z]/.test(password),

    lowercase:
      /[a-z]/.test(password),

    number:
      /\d/.test(password),
  };
}

function isPasswordValid(
  password: string
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

function getApiMessage(
  payload:
    | PasswordResponse
    | null,
  fallback: string
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

export default function SecuritySettings({
  onBack,
}: SecuritySettingsProps) {
  const [
    view,
    setView,
  ] =
    useState<SecurityView>(
      'overview'
    );

  const [
    currentPassword,
    setCurrentPassword,
  ] = useState('');

  const [
    newPassword,
    setNewPassword,
  ] = useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('');

  const [
    showCurrentPassword,
    setShowCurrentPassword,
  ] = useState(false);

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [
    confirmPasswordError,
    setConfirmPasswordError,
  ] = useState<
    string | null
  >(null);

  const [
    submittingPassword,
    setSubmittingPassword,
  ] = useState(false);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState | null>(
      null
    );

  const passwordRequirements =
    useMemo(
      () =>
        getPasswordRequirements(
          newPassword
        ),
      [newPassword]
    );

  function navigate(
    next: SecurityView
  ) {
    setView(next);

    if (
      typeof window !==
      'undefined'
    ) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }

  function goBack() {
    switch (view) {
      case 'authenticator':
      case 'email':
        navigate(
          'two-factor'
        );
        return;

      case 'password':
      case 'two-factor':
      case 'sessions':
      case 'activity':
        navigate(
          'overview'
        );
        return;

      case 'overview':
      default:
        onBack?.();
    }
  }

  async function changePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submittingPassword
    ) {
      return;
    }

    setConfirmPasswordError(
      null
    );

    if (
      !currentPassword
    ) {
      setOverlay({
        type: 'warning',
        title:
          'Current password required',
        message:
          'Enter your current password before changing it.',
      });

      return;
    }

    if (
      !newPassword
    ) {
      setOverlay({
        type: 'warning',
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
        type: 'warning',
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
        type: 'warning',
        title:
          'Password requirements not met',
        message:
          'Your new password must contain 8–128 characters, an uppercase letter, a lowercase letter, and a number.',
      });

      return;
    }

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

    if (
      currentPassword ===
      newPassword
    ) {
      setOverlay({
        type: 'warning',
        title:
          'Choose a different password',
        message:
          'Your new password must be different from your current password.',
      });

      return;
    }

    setSubmittingPassword(
      true
    );

    try {
      const response =
        await fetch(
          CHANGE_PASSWORD_ENDPOINT,
          {
            method: 'POST',

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
              () => null
            )
        ) as
          | PasswordResponse
          | null;

      if (
        response.status ===
          401 &&
        payload?.code ===
          'UNAUTHENTICATED'
      ) {
        setOverlay({
          type: 'warning',
          title:
            'Session expired',
          message:
            'Your SaMi session has expired. Sign in again to continue.',
        });

        return;
      }

      if (
        response.status ===
        429
      ) {
        setOverlay({
          type: 'warning',
          title:
            'Too many attempts',
          message:
            getApiMessage(
              payload,
              'Too many password attempts. Wait before trying again.'
            ),
        });

        return;
      }

      if (
        !response.ok ||
        !payload?.success
      ) {
        setOverlay({
          type: 'error',
          title:
            'Password not changed',
          message:
            getApiMessage(
              payload,
              'SaMi could not change your password.'
            ),
        });

        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setConfirmPasswordError(
        null
      );

      setShowCurrentPassword(
        false
      );

      setShowNewPassword(
        false
      );

      setShowConfirmPassword(
        false
      );

      setOverlay({
        type: 'success',
        title:
          'Password changed',
        message:
          payload.message ||
          'Your password has been changed successfully. Other signed-in sessions have been secured according to your account security policy.',
      });
    } catch {
      setOverlay({
        type: 'error',
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

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5">
          <button
            type="button"
            onClick={
              goBack
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-xs font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Back
          </button>
        </div>

        {view ===
          'overview' && (
          <SecurityOverview
            onPassword={() =>
              navigate(
                'password'
              )
            }
            onTwoFactor={() =>
              navigate(
                'two-factor'
              )
            }
            onSessions={() =>
              navigate(
                'sessions'
              )
            }
            onActivity={() =>
              navigate(
                'activity'
              )
            }
          />
        )}

        {view ===
          'password' && (
          <PasswordView
            currentPassword={
              currentPassword
            }
            newPassword={
              newPassword
            }
            confirmPassword={
              confirmPassword
            }
            showCurrentPassword={
              showCurrentPassword
            }
            showNewPassword={
              showNewPassword
            }
            showConfirmPassword={
              showConfirmPassword
            }
            confirmPasswordError={
              confirmPasswordError
            }
            passwordRequirements={
              passwordRequirements
            }
            submitting={
              submittingPassword
            }
            onCurrentPassword={
              setCurrentPassword
            }
            onNewPassword={
              value => {
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
              }
            }
            onConfirmPassword={
              value => {
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
              }
            }
            onToggleCurrent={() =>
              setShowCurrentPassword(
                current =>
                  !current
              )
            }
            onToggleNew={() =>
              setShowNewPassword(
                current =>
                  !current
              )
            }
            onToggleConfirm={() =>
              setShowConfirmPassword(
                current =>
                  !current
              )
            }
            onSubmit={
              changePassword
            }
          />
        )}

        {view ===
          'two-factor' && (
          <TwoFactorOverview
            onAuthenticator={() =>
              navigate(
                'authenticator'
              )
            }
            onEmail={() =>
              navigate(
                'email'
              )
            }
          />
        )}

        {view ===
          'authenticator' && (
          <TwoFactorSettings />
        )}

        {view ===
          'email' && (
          <EmailTwoFactorSettings />
        )}

        {view ===
          'sessions' && (
          <SessionsSettings />
        )}

        {view ===
          'activity' && (
          <SecurityActivitySettings />
        )}
      </div>

      <SaMiOverlay
        open={
          Boolean(
            overlay
          )
        }
        type={
          overlay?.type ||
          'info'
        }
        title={
          overlay?.title ||
          ''
        }
        message={
          overlay?.message ||
          ''
        }
        onClose={() =>
          setOverlay(
            null
          )
        }
      />
    </>
  );
}

function SecurityOverview({
  onPassword,
  onTwoFactor,
  onSessions,
  onActivity,
}: {
  onPassword:
    () => void;

  onTwoFactor:
    () => void;

  onSessions:
    () => void;

  onActivity:
    () => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <SecurityRow
        title="Password"
        description="Change the password used to sign in to your account"
        icon={
          LockKeyhole
        }
        onClick={
          onPassword
        }
      />

      <SecurityRow
        title="Two-factor authentication"
        description="Protect sign-ins with an authenticator app or email verification"
        icon={
          ShieldCheck
        }
        onClick={
          onTwoFactor
        }
      />

      <SecurityRow
        title="Sessions & devices"
        description="Review devices signed in to your account and revoke access"
        icon={
          Laptop
        }
        onClick={
          onSessions
        }
      />

      <SecurityRow
        title="Security activity"
        description="Review sign-ins and important security changes"
        icon={
          History
        }
        onClick={
          onActivity
        }
        last
      />
    </section>
  );
}

function SecurityRow({
  title,
  description,
  icon:
    Icon,
  onClick,
  last = false,
}: {
  title: string;
  description: string;
  icon:
    typeof ShieldCheck;
  onClick:
    () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
        last
          ? ''
          : 'border-b border-slate-100 dark:border-slate-800'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950/40 dark:group-hover:text-blue-300">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-slate-950 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
    </button>
  );
}

function TwoFactorOverview({
  onAuthenticator,
  onEmail,
}: {
  onAuthenticator:
    () => void;

  onEmail:
    () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SecurityRow
          title="Authenticator app"
          description="Scan a QR code with an authenticator app and use rotating verification codes"
          icon={
            Smartphone
          }
          onClick={
            onAuthenticator
          }
        />

        <SecurityRow
          title="Email verification"
          description="Receive one-time verification codes at your verified email address"
          icon={
            Mail
          }
          onClick={
            onEmail
          }
          last
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Sign-in verification
            </p>

            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              You can configure supported verification methods for stronger account protection. Recovery options are managed with your authenticator security setup.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PasswordView({
  currentPassword,
  newPassword,
  confirmPassword,
  showCurrentPassword,
  showNewPassword,
  showConfirmPassword,
  confirmPasswordError,
  passwordRequirements,
  submitting,
  onCurrentPassword,
  onNewPassword,
  onConfirmPassword,
  onToggleCurrent,
  onToggleNew,
  onToggleConfirm,
  onSubmit,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;

  showCurrentPassword:
    boolean;

  showNewPassword:
    boolean;

  showConfirmPassword:
    boolean;

  confirmPasswordError:
    string | null;

  passwordRequirements:
    ReturnType<
      typeof getPasswordRequirements
    >;

  submitting:
    boolean;

  onCurrentPassword:
    (
      value: string
    ) => void;

  onNewPassword:
    (
      value: string
    ) => void;

  onConfirmPassword:
    (
      value: string
    ) => void;

  onToggleCurrent:
    () => void;

  onToggleNew:
    () => void;

  onToggleConfirm:
    () => void;

  onSubmit:
    (
      event: FormEvent<HTMLFormElement>
    ) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <form
        onSubmit={
          onSubmit
        }
        className="max-w-xl space-y-5"
      >
        <PasswordField
          label="Current password"
          value={
            currentPassword
          }
          onChange={
            onCurrentPassword
          }
          visible={
            showCurrentPassword
          }
          onToggleVisibility={
            onToggleCurrent
          }
          autoComplete="current-password"
          placeholder="Enter your current password"
        />

        <PasswordField
          label="New password"
          value={
            newPassword
          }
          onChange={
            onNewPassword
          }
          visible={
            showNewPassword
          }
          onToggleVisibility={
            onToggleNew
          }
          autoComplete="new-password"
          placeholder="Create a new password"
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs font-black text-slate-700 dark:text-slate-300">
            Password requirements
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Requirement
              met={
                passwordRequirements.length
              }
            >
              8–128 characters
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
          </div>
        </div>

        <PasswordField
          label="Confirm new password"
          value={
            confirmPassword
          }
          onChange={
            onConfirmPassword
          }
          visible={
            showConfirmPassword
          }
          onToggleVisibility={
            onToggleConfirm
          }
          autoComplete="new-password"
          placeholder="Repeat your new password"
          error={
            confirmPasswordError
          }
        />

        <div className="pt-1">
          <button
            type="submit"
            disabled={
              submitting
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}

            {submitting
              ? 'Changing password...'
              : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}

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
  label: string;
  value: string;

  onChange:
    (
      value: string
    ) => void;

  visible: boolean;

  onToggleVisibility:
    () => void;

  autoComplete: string;
  placeholder: string;

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
          onChange={
            event =>
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
          maxLength={
            MAX_PASSWORD_LENGTH
          }
          aria-invalid={
            Boolean(error)
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

function Requirement({
  met,
  children,
}: {
  met: boolean;
  children: ReactNode;
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