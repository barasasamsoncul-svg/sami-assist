import type { SaMiOverlayAction, SaMiOverlayType } from '@/app/components/SaMiOverlay';

export type AuthOverlayMessage = {
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};

type Options = {
  fallback?: string;
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
  email?: string | null;
};

function waitText(seconds?: number | null) {
  if (!seconds) return 'a few minutes';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function lockedText(value?: string | null) {
  if (!value) return 'Please try again later.';
  try {
    return `Try again after ${new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))}.`;
  } catch {
    return 'Please try again later.';
  }
}

export function getAuthOverlayMessage(code?: string | null, options: Options = {}): AuthOverlayMessage {
  switch (String(code || '').toUpperCase()) {
    case 'INVALID_EMAIL':
      return { type: 'warning', title: 'Check your email address', message: 'Enter a valid email address to continue.' };
    case 'PASSWORD_REQUIRED':
      return { type: 'warning', title: 'Password required', message: 'Enter your password to continue.' };
    case 'INVALID_CREDENTIALS':
      return {
        type: 'error',
        title: 'Login failed',
        message: 'The email or password is incorrect. Check your details and try again.',
        primaryAction: { label: 'Try again' },
        secondaryAction: { label: 'Forgot password', href: '/forgot-password' },
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        type: 'warning',
        title: 'Verify your email first',
        message: 'Your account exists, but your email address still needs verification.',
        primaryAction: {
          label: 'Verify email',
          href: options.email ? `/verify-email?email=${encodeURIComponent(options.email)}` : '/verify-email',
        },
      };
    case 'LOGIN_RATE_LIMITED':
      return {
        type: 'warning',
        title: 'Too many attempts',
        message: `For security, login has been paused for ${waitText(options.retryAfterSeconds)}.`,
        primaryAction: { label: 'Reset password', href: '/forgot-password' },
      };
    case 'ACCOUNT_LOCKED':
      return {
        type: 'warning',
        title: 'Account temporarily locked',
        message: `Too many failed login attempts. ${lockedText(options.lockedUntil)}`,
        primaryAction: { label: 'Reset password', href: '/forgot-password' },
      };
    case 'EMAIL_VERIFIED':
      return { type: 'success', title: 'Email verified', message: 'Your email has been verified. You can now sign in.' };
    case 'VERIFICATION_CODE_SENT':
      return { type: 'success', title: 'Verification code sent', message: 'A new verification code has been sent to your email address.' };
    case 'INVALID_VERIFICATION_CODE':
      return { type: 'error', title: 'Invalid code', message: 'The verification code is incorrect. Check it and try again.' };
    case 'VERIFICATION_CODE_EXPIRED':
      return { type: 'warning', title: 'Code expired', message: 'This verification code has expired. Request a new one to continue.' };
    case 'CURRENT_PASSWORD_REQUIRED':
      return { type: 'warning', title: 'Current password required', message: 'Enter your current password before saving changes.' };
    case 'PASSWORD_WEAK':
      return { type: 'warning', title: 'Use a stronger password', message: 'Use at least 8 characters with uppercase, lowercase and a number.' };
    case 'PASSWORDS_DO_NOT_MATCH':
      return { type: 'warning', title: 'Passwords do not match', message: 'New password and confirmation password must be the same.' };
    case 'PASSWORD_REUSED':
      return { type: 'warning', title: 'Choose a different password', message: 'Your new password must be different from your current password.' };
    case 'CURRENT_PASSWORD_INCORRECT':
      return {
        type: 'error',
        title: 'Current password is incorrect',
        message: 'The current password you entered is not correct.',
        secondaryAction: { label: 'Forgot password', href: '/forgot-password' },
      };
    case 'PASSWORD_CHANGED':
      return { type: 'success', title: 'Password changed', message: 'Your password has been changed successfully. Other sessions were signed out.' };
    case 'RESET_LINK_SENT':
      return { type: 'success', title: 'Check your email', message: 'If the email exists, a password reset link has been sent.' };
    case 'PASSWORD_RESET_SUCCESS':
      return { type: 'success', title: 'Password reset complete', message: 'Your password has been reset. Sign in with your new password.' };
    case 'TWO_FACTOR_REQUIRED':
      return { type: 'info', title: 'Verification required', message: 'Enter your authenticator code to complete login.' };
    case 'INVALID_TWO_FACTOR_CODE':
      return { type: 'error', title: 'Invalid verification code', message: 'The code is incorrect. Try again or use a recovery code.' };
    case 'LOGIN_CHALLENGE_EXPIRED':
      return {
        type: 'warning',
        title: 'Verification expired',
        message: 'Your login verification session has expired. Please sign in again.',
        primaryAction: { label: 'Back to login', href: '/login' },
      };
    case 'LOGGED_OUT':
      return { type: 'info', title: 'Logged out', message: 'You have been safely signed out.' };
    case 'SESSION_EXPIRED':
      return { type: 'warning', title: 'Session expired', message: 'Please sign in again to continue.' };
    default:
      return {
        type: 'error',
        title: 'Something went wrong',
        message: options.fallback || 'The request could not be completed. Please try again.',
      };
  }
}
