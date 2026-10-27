import type { MouseEventHandler } from "react";
import SaMiLogo from "@/components/SaMiLogo";
import { useId } from "react";

type BrandMarkProps = { size?: "small" | "default" | "large" };

export function BrandMark({ size = "default" }: BrandMarkProps) {
  const gradientId = "sami-mark-gradient-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <svg viewBox="140 35 220 230" fill="none" focusable="false" role="presentation">
        <defs>
          <linearGradient id={gradientId} x1="160" y1="54" x2="326" y2="248" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="0.45" stopColor="#E3ECFF" />
            <stop offset="1" stopColor="#B8D4FF" />
          </linearGradient>
        </defs>
        <path
          d="M 326 78 C 294 54 231 54 195 75 C 163 94 160 124 188 137 C 216 150 279 144 304 159 C 334 176 323 212 289 229 C 251 248 189 241 158 217"
          stroke={`url(#${gradientId})`}
          strokeWidth="32"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
    <a
      className={[`brand`, compact ? "brand--compact" : "", className].filter(Boolean).join(" ")}
      href={href}
      onClick={onClick}
      aria-label="SaMi home"
    >
      <span className="brand-logo-wide" aria-hidden="true">
        <SaMiLogo size={compact ? "xs" : "sm"} showTagline={false} markOnly />
      </span>
      <BrandMark />
    </a>
  );
}
