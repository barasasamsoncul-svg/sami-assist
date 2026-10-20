'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';

export type SaMiOverlayType = 'success' | 'error' | 'warning' | 'info';

export type SaMiOverlayAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Optional — marks the action as destructive for styling (e.g. "Delete", "Discard"). */
  tone?: 'default' | 'danger';
};

type SaMiOverlayProps = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  /** Optional richer body (e.g. a list of validation errors). Rendered below `message`. */
  children?: React.ReactNode;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
  onClose: () => void;
  /** Fires when the user presses Escape or clicks the backdrop. Defaults to `onClose`. */
  onDismiss?: () => void;
  /** Dismiss when clicking the backdrop. Defaults to true. Set false for destructive confirmations. */
  dismissOnBackdrop?: boolean;
};

const VISUALS: Record<
  SaMiOverlayType,
  { Icon: typeof Info; iconBg: string; ring: string; dot: string }
> = {
  success: {
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    ring: 'ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  warning: {
    Icon: ShieldAlert,
    iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    ring: 'ring-amber-500/20',
    dot: 'bg-amber-500',
  },
  info: {
    Icon: Info,
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    ring: 'ring-blue-500/20',
    dot: 'bg-blue-500',
  },
  error: {
    Icon: AlertTriangle,
    iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
    ring: 'ring-red-500/20',
    dot: 'bg-red-500',
  },
};

function actionClass(primary: boolean, tone: SaMiOverlayAction['tone']): string {
  const base =
    'inline-flex h-11 flex-1 items-center justify-center rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';
  if (primary) {
    if (tone === 'danger') {
      return `${base} bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500`;
    }
    return `${base} bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-900 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white`;
  }
  if (tone === 'danger') {
    return `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-500 dark:border-red-900/60 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/40`;
  }
  return `${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800`;
}

function OverlayAction({
  action,
  primary,
  onClose,
}: {
  action: SaMiOverlayAction;
  primary: boolean;
  onClose: () => void;
}) {
  const className = actionClass(primary, action.tone);

  if (action.href) {
    return (
      <Link href={action.href} className={className} onClick={onClose}>
        {action.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        action.onClick?.();
        if (!action.onClick) onClose();
      }}
      className={className}
    >
      {action.label}
    </button>
  );
}

export default function SaMiOverlay({
  open,
  type,
  title,
  message,
  children,
  primaryAction,
  secondaryAction,
  onClose,
  onDismiss,
  dismissOnBackdrop = true,
}: SaMiOverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismiss = onDismiss ?? onClose;

  // Escape to dismiss + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

  // Focus the dialog (or first focusable inside) when it opens
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? node).focus();
  }, [open]);

  if (!open) return null;

  const { Icon, iconBg, ring, dot } = VISUALS[type];

  const content = (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 px-0 py-0 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out] sm:items-center sm:px-4 sm:py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] border border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none motion-safe:animate-[slideUp_180ms_ease-out] sm:max-w-md sm:rounded-[28px] sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-4 ${iconBg} ${ring}`}
          aria-hidden="true"
        >
          <Icon className="h-7 w-7" />
        </div>

        <h2
          id={titleId}
          className="mt-5 text-xl font-black tracking-tight text-slate-950 dark:text-white"
        >
          {title}
        </h2>

        <p
          id={descriptionId}
          className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400"
        >
          {message}
        </p>

        {children ? <div className="mt-4">{children}</div> : null}

        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
            {primaryAction && (
              <OverlayAction action={primaryAction} primary onClose={onClose} />
            )}
            {secondaryAction && (
              <OverlayAction action={secondaryAction} primary={false} onClose={onClose} />
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}