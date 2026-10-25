import type { MouseEventHandler } from "react";

type BrandMarkProps = { size?: "small" | "default" | "large" };

export function BrandMark({ size = "default" }: BrandMarkProps) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" focusable="false">
        <path d="M31.6 13.7c-2.8-3.1-10.8-3.5-14.7-.2-3.8 3.2-1.8 7.4 3 8.9l7.5 2.3c4.7 1.4 6.6 5.2 3 9.2-3.5 3.8-11.4 3.5-15-.1" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32.2" cy="13.2" r="3.4" fill="#F4BB4B" />
        <circle cx="15.2" cy="34" r="2.6" fill="#A7E6D8" />
      </svg>
    </span>
  );
}

type BrandProps = {
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
  compact?: boolean;
};

export default function Brand({ href = "/", onClick, className = "", compact = false }: BrandProps) {
  return (
    <a className={[`brand`, compact ? "brand--compact" : "", className].filter(Boolean).join(" ")} href={href} onClick={onClick} aria-label="SaMi Errands home">
      <BrandMark />
      <span className="brand-lockup">
        <span className="brand-name">SaMi</span>
        <span className="brand-product">ERRANDS</span>
      </span>
    </a>
  );
}
