'use client';

import React from 'react';

type SaMiLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const SIZE_MAP: Record<NonNullable<SaMiLogoProps['size']>, { width: number; height: number }> = {
  sm: { width: 170, height: 72 },
  md: { width: 220, height: 92 },
  lg: { width: 290, height: 118 },
  xl: { width: 360, height: 146 },
};

export default function SaMiLogo({
  size = 'lg',
  className = '',
}: SaMiLogoProps) {
  const { width, height } = SIZE_MAP[size];

  return (
    <div
      className={className}
      aria-label="SaMi logo"
      role="img"
      style={{
        width,
        height,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 620 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          overflow: 'visible',
          display: 'block',
        }}
      >
        <defs>
          <linearGradient id="samiMainGradient" x1="80" y1="40" x2="520" y2="170" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e9f7ff" />
            <stop offset="18%" stopColor="#8ae7ff" />
            <stop offset="42%" stopColor="#3fb6ff" />
            <stop offset="70%" stopColor="#6b7dff" />
            <stop offset="100%" stopColor="#d7dcff" />
          </linearGradient>

          <linearGradient id="samiReflectionGradient" x1="120" y1="120" x2="520" y2="220" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#d8eeff" stopOpacity="0.24" />
            <stop offset="50%" stopColor="#89cbff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
          </linearGradient>

          <linearGradient id="taglineGradient" x1="120" y1="0" x2="500" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#dff8ff" />
            <stop offset="50%" stopColor="#72d3ff" />
            <stop offset="100%" stopColor="#dff8ff" />
          </linearGradient>

          <filter id="mainGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feColorMatrix
              in="blur1"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0.72
                0 0 1 0 1
                0 0 0 0.55 0
              "
            />
          </filter>

          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="blur2" />
          </filter>

          <filter id="reflectionBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>

        {/* Main SaMi glow */}
        <text
          x="310"
          y="112"
          textAnchor="middle"
          fontSize="112"
          fontWeight="700"
          fontStyle="italic"
          fontFamily="Inter, Segoe UI, Arial, sans-serif"
          letterSpacing="-4"
          fill="#79d8ff"
          opacity="0.55"
          filter="url(#mainGlow)"
        >
          SaMi
        </text>

        {/* Main SaMi */}
        <text
          x="310"
          y="112"
          textAnchor="middle"
          fontSize="112"
          fontWeight="700"
          fontStyle="italic"
          fontFamily="Inter, Segoe UI, Arial, sans-serif"
          letterSpacing="-4"
          fill="url(#samiMainGradient)"
        >
          SaMi
        </text>

        {/* Reflection / translucent echo */}
        <text
          x="312"
          y="165"
          textAnchor="middle"
          fontSize="86"
          fontWeight="700"
          fontStyle="italic"
          fontFamily="Inter, Segoe UI, Arial, sans-serif"
          letterSpacing="-3"
          fill="url(#samiReflectionGradient)"
          opacity="0.55"
          filter="url(#reflectionBlur)"
        >
          SaMi
        </text>

        {/* Tagline crossing the center */}
        <g transform="translate(0,0)">
          <line
            x1="98"
            y1="121"
            x2="212"
            y2="121"
            stroke="url(#taglineGradient)"
            strokeOpacity="0.65"
            strokeWidth="1.2"
          />
          <line
            x1="410"
            y1="121"
            x2="522"
            y2="121"
            stroke="url(#taglineGradient)"
            strokeOpacity="0.65"
            strokeWidth="1.2"
          />

          <text
            x="310"
            y="126"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fontFamily="Inter, Segoe UI, Arial, sans-serif"
            letterSpacing="4.4"
            fill="#bfeeff"
            opacity="0.92"
            filter="url(#softGlow)"
          >
            AI POWERED BUSINESS WORKSPACE
          </text>
        </g>
      </svg>
    </div>
  );
}