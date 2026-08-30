
'use client';

import React from 'react';

type SaMiLogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface SaMiLogoProps {
  size?: SaMiLogoSize;
  className?: string;
  ariaLabel?: string;
}

const sizeStyles: Record<
  SaMiLogoSize,
  {
    text: string;
    gap: string;
    dot: string;
  }
> = {
  sm: {
    text: 'text-[20px]',
    gap: 'gap-[1px]',
    dot: 'h-[4px] w-[4px]',
  },
  md: {
    text: 'text-[25px]',
    gap: 'gap-[1px]',
    dot: 'h-[5px] w-[5px]',
  },
  lg: {
    text: 'text-[36px]',
    gap: 'gap-[2px]',
    dot: 'h-[6px] w-[6px]',
  },
  xl: {
    text: 'text-[48px]',
    gap: 'gap-[2px]',
    dot: 'h-[7px] w-[7px]',
  },
};

export default function SaMiLogo({
  size = 'md',
  className = '',
  ariaLabel = 'SaMi',
}: SaMiLogoProps) {
  const styles = sizeStyles[size];

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`
        inline-flex
        items-baseline
        ${styles.gap}
        ${styles.text}
        font-black
        italic
        tracking-[-0.075em]
        leading-none
        select-none
        whitespace-nowrap
        antialiased
        ${className}
      `}
    >
      {/* Sa */}
      <span
        className="
          text-blue-700
          dark:text-blue-500
          transition-colors
        "
      >
        Sa
      </span>

      {/* Mi */}
      <span
        className="
          text-gray-950
          dark:text-white
          transition-colors
        "
      >
        Mi
      </span>

      {/* Brand accent */}
      <span
        aria-hidden="true"
        className={`
          ${styles.dot}
          ml-[2px]
          mb-[2px]
          rounded-full
          bg-blue-600
          dark:bg-blue-500
          flex-shrink-0
        `}
      />
    </span>
  );
}