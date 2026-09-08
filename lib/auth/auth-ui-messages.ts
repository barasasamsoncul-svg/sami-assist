import type {
  SaMiOverlayAction,
  SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

export type AuthOverlayMessage = {
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};

export type AuthOverlayMessageOptions = {
  fallback?: string;
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
  email?: string | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeCode(
  value?: string | null
): string {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase();
}

/* ============================================================
   TIME HELPERS
   ============================================================ */

function waitText(
  seconds?: number | null
): string {
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return 'a few minutes';
  }

  const minutes =
    Math.max(
      1,
      Math.ceil(
        seconds / 60
      )
    );

  return `${minutes} minute${
    minutes === 1
      ? ''
      : 's'
  }`;
}

function lockedText(
  value?: string | null
): string {
  if (!value) {
    return 'Please try again later.';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Please try again later.';
  }

  try {
    return `Try again after ${new Intl.DateTimeFormat(
      'en-KE',
      {
        dateStyle:
          'medium',

        timeStyle:
          'short',
      }
    ).format(date)}.`;
  } catch {
    return 'Please try again later.';
  }
}

/* ============================================================
   EMAIL VERIFICATION LINK
   ============================================================ */

function verificationHref(
  email?: string | null
): string {
  const normalizedEmail =
    typeof email ===
      'string'
      ? email
          .trim()
          .toLowerCase()
      : '';

  if (!normalizedEmail) {
    return '/verify-email';
  }

  const params =
    new URLSearchParams({
      email:
        normalizedEmail,
    });

  return `/verify-email?${params.toString()}`;
}

/* ============================================================
   AUTH UI MESSAGE
   ============================================================ */

export function getAuthOverlayMessage(
  code?: string | null,
  options:
    AuthOverlayMessageOptions = {}
): AuthOverlayMessage {
  const normalizedCode =
    normalizeCode(code);

  switch (
    normalizedCode
  ) {
    /* ========================================================
       REQUEST / INPUT
       ======================================================== */

    case 'INVALID_REQUEST':
      return {
        type: 'error',

        title:
          'Request could not be completed',

        message:
          options.fallback ||
          'The request was not valid. Please try again.',
      };

    case 'INVALID_EMAIL':
      return {
        type: 'warning',

        title:
          'Check your email address',

        message:
          'Enter a valid email address to continue.',
      };

    case 'MISSING_CREDENTIALS':
      return {
        type: 'warning',

        title:
          'Email and password required',

        message:
          'Enter your email address and password to continue.',
      };

    case 'PASSWORD_REQUIRED':
      return {
        type: 'warning',

        title:
          'Password required',

        message:
          'Enter your password to continue.',
      };

    /* ========================================================
       LOGIN
       ======================================================== */

    case 'INVALID_CREDENTIALS':
      return {
        type: 'error',

        title:
          'Login failed',

        message:
          'The email or password is incorrect. Check your details and try again.',

        primaryAction: {
          label:
            'Try again',
        },

        secondaryAction: {
          label:
            'Forgot password',

          href:
            '/forgot-password',
        },
      };

    case 'EMAIL_NOT_VERIFIED':
      return {
        type: 'warning',

        title:
          'Verify your email first',

        message:
          'Your account exists, but your email address still needs verification.',

        primaryAction: {
          label:
            'Verify email',

          href:
            verificationHref(
              options.email
            ),
        },
      };

    case 'LOGIN_RATE_LIMITED':
      return {
        type: 'warning',

        title:
          'Too many attempts',

        message:
          `For security, login has been paused for ${waitText(
            options.retryAfterSeconds
          )}.`,

        primaryAction: {
          label:
            'Reset password',

          href:
            '/forgot-password',
        },
      };

    case 'ACCOUNT_LOCKED':
      return {
        type: 'warning',

        title:
          'Account temporarily locked',

        message:
          `Too many failed login attempts. ${lockedText(
            options.lockedUntil
          )}`,

        primaryAction: {
          label:
            'Reset password',

          href:
            '/forgot-password',
        },
      };

    case 'ACCOUNT_UNAVAILABLE':
    case 'LOGIN_BLOCKED':
      return {
        type: 'warning',

        title:
          'Account unavailable',

        message:
          options.fallback ||
          'This account is not currently available for sign in.',
      };

    /* ========================================================
       EMAIL VERIFICATION
       ======================================================== */

    case 'EMAIL_VERIFIED':
      return {
        type: 'success',

        title:
          'Email verified',

        message:
          'Your email has been verified. You can now sign in.',

        primaryAction: {
          label:
            'Sign in',

          href:
            '/login',
        },
      };

    case 'ALREADY_VERIFIED':
    case 'EMAIL_ALREADY_VERIFIED':
      return {
        type: 'info',

        title:
          'Email already verified',

        message:
          'This email address has already been verified.',

        primaryAction: {
          label:
            'Sign in',

          href:
            '/login',
        },
      };

    case 'VERIFICATION_CODE_SENT':
      return {
        type: 'success',

        title:
          'Verification code sent',

        message:
          'A new verification code has been sent to your email address.',
      };

    case 'INVALID_VERIFICATION_CODE':
      return {
        type: 'error',

        title:
          'Invalid code',

        message:
          'The verification code is incorrect. Check it and try again.',
      };

    case 'VERIFICATION_CODE_EXPIRED':
      return {
        type: 'warning',

        title:
          'Code expired',

        message:
          'This verification code has expired. Request a new one to continue.',
      };

    case 'VERIFICATION_CODE_REQUIRED':
      return {
        type: 'warning',

        title:
          'Verification code required',

        message:
          'Enter the 6-digit verification code sent to your email.',
      };

    case 'VERIFICATION_FAILED':
      return {
        type: 'error',

        title:
          'Verification failed',

        message:
          options.fallback ||
          'Your email could not be verified. Request a new code and try again.',
      };

    /* ========================================================
       CHANGE PASSWORD
       ======================================================== */

    case 'CURRENT_PASSWORD_REQUIRED':
      return {
        type: 'warning',

        title:
          'Current password required',

        message:
          'Enter your current password before saving changes.',
      };

    case 'PASSWORD_WEAK':
      return {
        type: 'warning',

        title:
          'Use a stronger password',

        message:
          'Use at least 8 characters with uppercase, lowercase and a number.',
      };

    case 'PASSWORDS_DO_NOT_MATCH':
      return {
        type: 'warning',

        title:
          'Passwords do not match',

        message:
          'New password and confirmation password must be the same.',
      };

    case 'PASSWORD_REUSED':
      return {
        type: 'warning',

        title:
          'Choose a different password',

        message:
          'Your new password must be different from your current password.',
      };

    case 'CURRENT_PASSWORD_INCORRECT':
      return {
        type: 'error',

        title:
          'Current password is incorrect',

        message:
          'The current password you entered is not correct.',

        secondaryAction: {
          label:
            'Forgot password',

          href:
            '/forgot-password',
        },
      };

    case 'PASSWORD_CHANGED':
      return {
        type: 'success',

        title:
          'Password changed',

        message:
          'Your password has been changed successfully. Other sessions were signed out.',
      };

    case 'CHANGE_PASSWORD_ERROR':
      return {
        type: 'error',

        title:
          'Password could not be changed',

        message:
          options.fallback ||
          'We could not change your password. Please try again.',
      };

    /* ========================================================
       PASSWORD RESET
       ======================================================== */

    case 'RESET_LINK_SENT':
      return {
        type: 'success',

        title:
          'Check your email',

        /*
         * Keep this wording generic so the forgot-password flow
         * does not reveal whether an email address is registered.
         */
        message:
          'If the email exists, a password reset link has been sent.',
      };

    case 'RESET_TOKEN_REQUIRED':
      return {
        type: 'warning',

        title:
          'Reset link required',

        message:
          'Open the password reset link from your email to continue.',
      };

    case 'INVALID_RESET_TOKEN':
    case 'RESET_TOKEN_INVALID':
      return {
        type: 'error',

        title:
          'Reset link is invalid',

        message:
          'This password reset link is not valid. Request a new one to continue.',

        primaryAction: {
          label:
            'Request new link',

          href:
            '/forgot-password',
        },
      };

    case 'RESET_TOKEN_EXPIRED':
    case 'PASSWORD_RESET_EXPIRED':
      return {
        type: 'warning',

        title:
          'Reset link expired',

        message:
          'This password reset link has expired. Request a new one to continue.',

        primaryAction: {
          label:
            'Request new link',

          href:
            '/forgot-password',
        },
      };

    case 'PASSWORD_RESET_SUCCESS':
      return {
        type: 'success',

        title:
          'Password reset complete',

        message:
          'Your password has been reset. Sign in with your new password.',

        primaryAction: {
          label:
            'Sign in',

          href:
            '/login',
        },
      };

    case 'PASSWORD_RESET_ERROR':
      return {
        type: 'error',

        title:
          'Password could not be reset',

        message:
          options.fallback ||
          'We could not reset your password. Please request a new reset link and try again.',

        primaryAction: {
          label:
            'Request new link',

          href:
            '/forgot-password',
        },
      };

    /* ========================================================
       TWO-FACTOR LOGIN
       ======================================================== */

    case 'TWO_FACTOR_REQUIRED':
      return {
        type: 'info',

        title:
          'Verification required',

        message:
          'Enter your authenticator code to complete login.',
      };

    case 'INVALID_TWO_FACTOR_CODE':
      return {
        type: 'error',

        title:
          'Invalid verification code',

        message:
          'The code is incorrect. Try again or use a recovery code.',
      };

    case 'TWO_FACTOR_RATE_LIMITED':
      return {
        type: 'warning',

        title:
          'Too many verification attempts',

        message:
          `For security, verification has been paused for ${waitText(
            options.retryAfterSeconds
          )}.`,

        primaryAction: {
          label:
            'Back to login',

          href:
            '/login',
        },
      };

    /*
     * LOGIN_CHALLENGE_UNAVAILABLE deliberately has the same
     * user-facing message as an expired challenge.
     *
     * We do not tell the browser whether the challenge was:
     *
     * - expired
     * - revoked
     * - already used
     * - replaced
     * - otherwise unavailable
     */
    case 'LOGIN_CHALLENGE_UNAVAILABLE':
    case 'LOGIN_CHALLENGE_EXPIRED':
    case 'INVALID_LOGIN_CHALLENGE':
      return {
        type: 'warning',

        title:
          'Verification session expired',

        message:
          'Your login verification session is no longer available. Please sign in again.',

        primaryAction: {
          label:
            'Back to login',

          href:
            '/login',
        },
      };

    /* ========================================================
       TWO-FACTOR SETTINGS
       ======================================================== */

    case 'TWO_FACTOR_ENABLED':
      return {
        type: 'success',

        title:
          'Two-factor authentication enabled',

        message:
          'Your authenticator app is now protecting your SaMi account.',
      };

    case 'TWO_FACTOR_DISABLED':
      return {
        type: 'success',

        title:
          'Two-factor authentication disabled',

        message:
          'Authenticator verification has been removed from your account.',
      };

    case 'TWO_FACTOR_SETUP_FAILED':
      return {
        type: 'error',

        title:
          'Authenticator setup failed',

        message:
          options.fallback ||
          'Two-factor authentication could not be configured. Please try again.',
      };

    case 'RECOVERY_CODES_REGENERATED':
      return {
        type: 'success',

        title:
          'New recovery codes created',

        message:
          'Your previous unused recovery codes are no longer valid. Save the new codes somewhere secure.',
      };

    /* ========================================================
       SESSION
       ======================================================== */

    case 'LOGGED_OUT':
      return {
        type: 'info',

        title:
          'Logged out',

        message:
          'You have been safely signed out.',
      };

    case 'SESSION_EXPIRED':
    case 'UNAUTHENTICATED':
      return {
        type: 'warning',

        title:
          'Session expired',

        message:
          'Please sign in again to continue.',

        primaryAction: {
          label:
            'Sign in',

          href:
            '/login',
        },
      };

    case 'SESSION_REVOKED':
      return {
        type: 'success',

        title:
          'Session signed out',

        message:
          'The selected session has been signed out.',
      };

    case 'OTHER_SESSIONS_REVOKED':
      return {
        type: 'success',

        title:
          'Other sessions signed out',

        message:
          'Your other active SaMi sessions have been signed out.',
      };

    /* ========================================================
       DEFAULT
       ======================================================== */

    default:
      return {
        type: 'error',

        title:
          'Something went wrong',

        message:
          options.fallback ||
          'The request could not be completed. Please try again.',
      };
  }
}