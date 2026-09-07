'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';

export type SaMiOverlayType = 'success' | 'error' | 'warning' | 'info';

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

function visual(type: SaMiOverlayType) {
  if (type === 'success') {
    return {
      Icon: CheckCircle2,
      icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }

  if (type === 'warning') {
    return {
      Icon: ShieldAlert,
      icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    };
  }

  if (type === 'info') {
    return {
      Icon: Info,
      icon: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    };
  }

  return {
    Icon: AlertTriangle,
    icon: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
  };
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
  const className = primary
    ? 'inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
    : 'inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800';

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
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
  primaryAction,
  secondaryAction,
  onClose,
}: SaMiOverlayProps) {
  if (!open) return null;

  const { Icon, icon } = visual(type);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sami-overlay-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${icon}`}>
          <Icon className="h-7 w-7" />
        </div>

        <h2 id="sami-overlay-title" className="mt-5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {message}
        </p>

        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
}
