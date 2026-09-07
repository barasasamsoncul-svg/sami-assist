import React, { useId } from 'react';

type SaMiLogoSize = 'sm' | 'md' | 'lg' | 'hero' | number;

type SaMiLogoProps = {
  size?: SaMiLogoSize;
  className?: string;
  markOnly?: boolean;
  showTagline?: boolean;
  showReflection?: boolean;
  showBackground?: boolean;
};

function resolveWidth(size: SaMiLogoSize): number {
  if (typeof size === 'number') return size;

  switch (size) {
    case 'sm':
      return 140;
    case 'md':
      return 220;
    case 'lg':
      return 320;
    case 'hero':
      return 560;
    default:
      return 220;
  }
}

export default function SaMiLogo({
  size = 'lg',
  className = '',
  markOnly = false,
  showTagline = true,
  showReflection = true,
  showBackground = true,
}: SaMiLogoProps) {
  const width = resolveWidth(size);
  const id = useId();

  const bgGradient = `sami-bg-${id}`;
  const radialGlow = `sami-radial-${id}`;
  const markGradientA = `sami-mark-a-${id}`;
  const markGradientB = `sami-mark-b-${id}`;
  const textGradient = `sami-text-${id}`;
  const barGradient = `sami-bar-${id}`;
  const lineGradient = `sami-line-${id}`;
  const glowFilter = `sami-glow-${id}`;
  const softGlowFilter = `sami-soft-glow-${id}`;
  const blurFilter = `sami-blur-${id}`;

  const renderTagline = !markOnly && showTagline;
  const renderReflection = !markOnly && showReflection;
  const renderBackground = showBackground;

  return (
    <svg
      viewBox="0 0 1200 760"
      width={width}
      height="auto"
      className={className}
      role="img"
      aria-label="SaMi logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bgGradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="45%" stopColor="#031540" />
          <stop offset="75%" stopColor="#040d2a" />
          <stop offset="100%" stopColor="#01040f" />
        </linearGradient>

        <radialGradient id={radialGlow} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#123dff" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#123dff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#123dff" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={markGradientA} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#69f0ff" />
          <stop offset="40%" stopColor="#1781ff" />
          <stop offset="72%" stopColor="#2146ff" />
          <stop offset="100%" stopColor="#ff5cff" />
        </linearGradient>

        <linearGradient id={markGradientB} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff7bff" />
          <stop offset="35%" stopColor="#6a5cff" />
          <stop offset="70%" stopColor="#2b7cff" />
          <stop offset="100%" stopColor="#8cf7ff" />
        </linearGradient>

        <linearGradient id={textGradient} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5ce9ff" />
          <stop offset="50%" stopColor="#7a7cff" />
          <stop offset="100%" stopColor="#d48cff" />
        </linearGradient>

        <linearGradient id={barGradient} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#07152f" stopOpacity="0.92" />
          <stop offset="50%" stopColor="#0a1840" stopOpacity="0.82" />
          <stop offset="100%" stopColor="#081027" stopOpacity="0.92" />
        </linearGradient>

        <linearGradient id={lineGradient} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3bbcff" />
          <stop offset="50%" stopColor="#4d79ff" />
          <stop offset="100%" stopColor="#cc63ff" />
        </linearGradient>

        <filter
          id={glowFilter}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="8" result="blur1" />
          <feColorMatrix
            in="blur1"
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 1.3 0
            "
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter
          id={softGlowFilter}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="18" result="blur1" />
          <feColorMatrix
            in="blur1"
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 0.8 0
            "
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter
          id={blurFilter}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {renderBackground && (
        <>
          <rect width="1200" height="760" fill={`url(#${bgGradient})`} />
          <rect width="1200" height="760" fill={`url(#${radialGlow})`} />
          <ellipse
            cx="600"
            cy="640"
            rx="320"
            ry="44"
            fill="#1b7fff"
            opacity="0.35"
            filter={`url(#${blurFilter})`}
          />
          <ellipse
            cx="600"
            cy="685"
            rx="500"
            ry="60"
            fill="#142455"
            opacity="0.35"
            filter={`url(#${blurFilter})`}
          />
        </>
      )}

      {/* Main SM mark */}
      <g filter={`url(#${softGlowFilter})`}>
        <text
          x="405"
          y="500"
          fontSize="410"
          fontWeight="700"
          fontFamily="Inter, Segoe UI, Arial, sans-serif"
          fill={`url(#${markGradientA})`}
          stroke="#b9ffff"
          strokeOpacity="0.75"
          strokeWidth="2"
          textAnchor="middle"
        >
          S
        </text>

        <text
          x="760"
          y="505"
          fontSize="365"
          fontWeight="700"
          fontFamily="Inter, Segoe UI, Arial, sans-serif"
          fill={`url(#${markGradientB})`}
          stroke="#ffe3ff"
          strokeOpacity="0.7"
          strokeWidth="2"
          textAnchor="middle"
        >
          M
        </text>
      </g>

      {/* Strong center beam */}
      {renderTagline && (
        <>
          <line
            x1="30"
            y1="348"
            x2="1170"
            y2="348"
            stroke={`url(#${lineGradient})`}
            strokeWidth="3"
            opacity="0.95"
            filter={`url(#${glowFilter})`}
          />
          <circle
            cx="210"
            cy="348"
            r="7"
            fill="#8df7ff"
            filter={`url(#${glowFilter})`}
          />
          <circle
            cx="988"
            cy="348"
            r="7"
            fill="#d68cff"
            filter={`url(#${glowFilter})`}
          />

          <g filter={`url(#${glowFilter})`}>
            <rect
              x="225"
              y="323"
              width="750"
              height="52"
              rx="24"
              fill={`url(#${barGradient})`}
              stroke="url(#sami-line-${id})"
              strokeOpacity="0.8"
            />
          </g>

          <text
            x="600"
            y="354"
            textAnchor="middle"
            fontSize="28"
            fontWeight="400"
            letterSpacing="10"
            fontFamily="Inter, Segoe UI, Arial, sans-serif"
            fill="#f8fafc"
            opacity="0.98"
          >
            AI-POWERED BUSINESS WORKSPACE
          </text>
        </>
      )}

      {/* SaMi text below */}
      {renderReflection && (
        <>
          <g filter={`url(#${softGlowFilter})`}>
            <text
              x="600"
              y="675"
              textAnchor="middle"
              fontSize="120"
              fontWeight="700"
              fontFamily="Inter, Segoe UI, Arial, sans-serif"
              fill={`url(#${textGradient})`}
              opacity="0.85"
            >
              SaMi
            </text>
          </g>

          <g opacity="0.18" transform="translate(0, 720) scale(1, -0.25)">
            <text
              x="600"
              y="0"
              textAnchor="middle"
              fontSize="120"
              fontWeight="700"
              fontFamily="Inter, Segoe UI, Arial, sans-serif"
              fill={`url(#${textGradient})`}
              filter={`url(#${blurFilter})`}
            >
              SaMi
            </text>
          </g>
        </>
      )}
    </svg>
  );
}