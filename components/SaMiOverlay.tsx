'use client';

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export type SaMiOverlayType = "success" | "error" | "warning" | "info";
export type SaMiOverlayAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
};

type SaMiOverlayProps = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  children?: ReactNode;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
  onClose: () => void;
  onDismiss?: () => void;
  dismissOnBackdrop?: boolean;
};

const VISUALS: Record<SaMiOverlayType, { symbol: string; label: string }> = {
  success: { symbol: "✓", label: "Success" },
  error: { symbol: "!", label: "Error" },
  warning: { symbol: "!", label: "Warning" },
  info: { symbol: "i", label: "Information" },
};

function OverlayAction({
  action,
  primary,
  onClose,
}: {
  action: SaMiOverlayAction;
  primary: boolean;
  onClose: () => void;
}) {
  const className = [
    "sami-overlay-action",
    primary ? "sami-overlay-action--primary" : "sami-overlay-action--secondary",
    action.tone === "danger" ? "sami-overlay-action--danger" : "",
  ].filter(Boolean).join(" ");

  const handleClick = () => {
    onClose();
    action.onClick?.();
  };

  if (action.href) {
    return <Link href={action.href} className={className} onClick={onClose}>{action.label}</Link>;
  }

  return <button type="button" className={className} onClick={handleClick}>{action.label}</button>;
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
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dismiss = onDismiss ?? onClose;

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open, dismiss]);

  if (!open) return null;

  const visual = VISUALS[type];
  const content = (
    <div
      className="sami-overlay-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (dismissOnBackdrop && event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`sami-overlay-dialog sami-overlay-dialog--${type}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button type="button" className="sami-overlay-close" onClick={dismiss} aria-label="Close message">×</button>
        <div className={`sami-overlay-symbol sami-overlay-symbol--${type}`} aria-label={visual.label} role="img">
          {visual.symbol}
        </div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{message}</p>
        {children ? <div className="sami-overlay-extra">{children}</div> : null}
        {(primaryAction || secondaryAction) && (
          <div className="sami-overlay-actions">
            {secondaryAction ? <OverlayAction action={secondaryAction} primary={false} onClose={onClose} /> : null}
            {primaryAction ? <OverlayAction action={primaryAction} primary onClose={onClose} /> : null}
          </div>
        )}
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
