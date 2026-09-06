'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';

export type SaMiOverlayType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export type SaMiOverlayAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type SaMiOverlayProps = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
  onClose: () => void;
};

function getStyles(type: SaMiOverlayType) {
  if (type === 'success') {
    return {
      icon: CheckCircle2,
      iconWrap:
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      ring: 'ring-emerald-200 dark:ring-emerald-900/60',
    };
  }

  if (type === 'warning') {
    return {
      icon: ShieldAlert,
      iconWrap:
        'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      ring: 'ring-amber-200 dark:ring-amber-900/60',
    };
  }

  if (type === 'info') {
    return {
      icon: Info,
      iconWrap:
        'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
      ring: 'ring-blue-200 dark:ring-blue-900/60',
    };
  }

  return {
    icon: AlertTriangle,
    iconWrap:
      'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
    ring: 'ring-red-200 dark:ring-red-900/60',
  };
}

function ActionButton({
  action,
  variant,
}: {
  action: SaMiOverlayAction;
  variant: 'primary' | 'secondary';
}) {
  const className =
    variant === 'primary'
      ? 'inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
      : 'inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800';

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export default function SaMiOverlay({
  open,
  type,
  title,
  message,
  primaryAction,
  secondaryAction,
  onClose,
}: SaMiOverlayProps) {
  if (!open) return null;

  const styles = getStyles(type);
  const Icon = styles.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div
        className={[
          'relative w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl ring-1 dark:bg-slate-900',
          styles.ring,
        ].join(' ')}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className={[
            'flex h-14 w-14 items-center justify-center rounded-2xl',
            styles.iconWrap,
          ].join(' ')}
        >
          <Icon className="h-7 w-7" />
        </div>

        <h2 className="mt-5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {message}
        </p>

        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {primaryAction && (
              <ActionButton action={primaryAction} variant="primary" />
            )}

            {secondaryAction && (
              <ActionButton action={secondaryAction} variant="secondary" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
