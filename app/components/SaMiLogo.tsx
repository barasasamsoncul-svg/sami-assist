'use client';

import { useId } from 'react';

export type SaMiLogoSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'hero';

export type SaMiLogoProps = {
  size?: SaMiLogoSize;
  className?: string;

  /**
   * Displays:
   * AI POWERED BUSINESS WORKSPACE
   * through the horizontal center of the SaMi wordmark.
   */
  showTagline?: boolean;

  /**
   * Compatibility prop.
   * In the current identity, SaMi itself is the mark.
   * markOnly=true simply removes the tagline.
   */
  markOnly?: boolean;

  /**
   * Retained so older SaMi pages do not break.
   * The approved identity deliberately has no reflection.
   */
  showReflection?: boolean;

  /**
   * Retained so older SaMi pages do not break.
   * The logo itself always remains transparent.
   */
  showBackground?: boolean;
};

const SIZE_MAP: Record<SaMiLogoSize, number> = {
  xs: 110,
  sm: 150,
  md: 210,
  lg: 290,
  xl: 400,
  hero: 560,
};

function safeSvgId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export default function SaMiLogo({
  size = 'md',
  className = '',
  showTagline = true,
  markOnly = false,

  // Intentionally retained for backwards compatibility.
  // The approved SaMi identity does not render either.
  showReflection: _showReflection,
  showBackground: _showBackground,
}: SaMiLogoProps) {
  const reactId = safeSvgId(useId());

  const width = SIZE_MAP[size];

  const taglineVisible =
    showTagline && !markOnly;

  const mainGradient = `sami-main-${reactId}`;
  const rimGradient = `sami-rim-${reactId}`;
  const highlightGradient = `sami-highlight-${reactId}`;
  const beamGradient = `sami-beam-${reactId}`;

  const logoGlow = `sami-logo-glow-${reactId}`;
  const beamGlow = `sami-beam-glow-${reactId}`;
  const shineGlow = `sami-shine-${reactId}`;

  const titleId = `sami-title-${reactId}`;

  return (
    <svg
      viewBox="0 0 1000 310"
      width={width}
      height="auto"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={titleId}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      style={{
        display: 'block',
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      <title id={titleId}>
        {taglineVisible
          ? 'SaMi — AI Powered Business Workspace'
          : 'SaMi'}
      </title>

      <defs>
        {/* =====================================================
            MAIN SaMi GRADIENT
           ===================================================== */}

        <linearGradient
          id={mainGradient}
          x1="170"
          y1="55"
          x2="840"
          y2="255"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="#DFFFFF"
          />

          <stop
            offset="7%"
            stopColor="#8BFAFF"
          />

          <stop
            offset="23%"
            stopColor="#36DDFF"
          />

          <stop
            offset="42%"
            stopColor="#188BFF"
          />

          <stop
            offset="61%"
            stopColor="#3157FF"
          />

          <stop
            offset="78%"
            stopColor="#7144FF"
          />

          <stop
            offset="91%"
            stopColor="#B54CFF"
          />

          <stop
            offset="100%"
            stopColor="#F06FFF"
          />
        </linearGradient>

        {/* Fine luminous outside rim */}
        <linearGradient
          id={rimGradient}
          x1="160"
          y1="40"
          x2="850"
          y2="250"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="#FFFFFF"
          />

          <stop
            offset="18%"
            stopColor="#D6FFFF"
          />

          <stop
            offset="46%"
            stopColor="#70C7FF"
          />

          <stop
            offset="73%"
            stopColor="#837EFF"
          />

          <stop
            offset="100%"
            stopColor="#FFD0FF"
          />
        </linearGradient>

        {/* Narrow inner glass highlight */}
        <linearGradient
          id={highlightGradient}
          x1="220"
          y1="62"
          x2="820"
          y2="225"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="#FFFFFF"
            stopOpacity="0.96"
          />

          <stop
            offset="22%"
            stopColor="#D9FFFF"
            stopOpacity="0.7"
          />

          <stop
            offset="48%"
            stopColor="#97D8FF"
            stopOpacity="0.36"
          />

          <stop
            offset="70%"
            stopColor="#ACAAFF"
            stopOpacity="0.42"
          />

          <stop
            offset="100%"
            stopColor="#FFE1FF"
            stopOpacity="0.85"
          />
        </linearGradient>

        {/* =====================================================
            TAGLINE / CENTER BEAM
           ===================================================== */}

        <linearGradient
          id={beamGradient}
          x1="45"
          y1="0"
          x2="955"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="#16CFFF"
            stopOpacity="0"
          />

          <stop
            offset="10%"
            stopColor="#27DFFF"
            stopOpacity="0.9"
          />

          <stop
            offset="30%"
            stopColor="#3FB8FF"
          />

          <stop
            offset="52%"
            stopColor="#5386FF"
          />

          <stop
            offset="73%"
            stopColor="#755DFF"
          />

          <stop
            offset="90%"
            stopColor="#D45AFF"
            stopOpacity="0.9"
          />

          <stop
            offset="100%"
            stopColor="#ED6AFF"
            stopOpacity="0"
          />
        </linearGradient>

        {/* =====================================================
            GLOW
           ===================================================== */}

        <filter
          id={logoGlow}
          x="-35%"
          y="-65%"
          width="170%"
          height="230%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            stdDeviation="14"
            result="blur"
          />

          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.07
              0 0 0 0 0.45
              0 0 0 0 1
              0 0 0 0.52 0
            "
            result="coloredGlow"
          />

          <feMerge>
            <feMergeNode in="coloredGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter
          id={beamGlow}
          x="-30%"
          y="-1200%"
          width="160%"
          height="2500%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            stdDeviation="9"
          />
        </filter>

        <filter
          id={shineGlow}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            stdDeviation="5"
          />
        </filter>
      </defs>

      {/* ======================================================
          SaMi CUSTOM WORDMARK
          
          This is no longer font-dependent.
          The letterforms are drawn as custom paths.
         ====================================================== */}

      {/* broad atmospheric glow */}
      <g
        fill="none"
        stroke={`url(#${mainGradient})`}
        strokeWidth="66"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.28"
        filter={`url(#${logoGlow})`}
      >
        {/* S */}
        <path
          d="
            M 326 76
            C 294 52, 231 52, 195 73
            C 163 92, 160 122, 188 135
            C 216 148, 279 142, 304 157
            C 334 174, 323 210, 289 227
            C 251 246, 189 239, 158 215
          "
        />

        {/* a */}
        <path
          d="
            M 419 145
            C 391 124, 352 132, 338 164
            C 324 196, 341 226, 371 226
            C 402 226, 420 199, 425 166
            M 425 148
            L 410 224
          "
        />

        {/* M */}
        <path
          d="
            M 489 226
            L 521 76
            L 582 190
            L 674 75
            L 643 226
          "
        />

        {/* i */}
        <path
          d="
            M 713 144
            L 696 225
          "
        />

        <circle
          cx="727"
          cy="91"
          r="13"
          fill={`url(#${mainGradient})`}
          stroke="none"
        />
      </g>

      {/* bright outer rim */}
      <g
        fill="none"
        stroke={`url(#${rimGradient})`}
        strokeWidth="62"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.78"
      >
        {/* S */}
        <path
          d="
            M 326 76
            C 294 52, 231 52, 195 73
            C 163 92, 160 122, 188 135
            C 216 148, 279 142, 304 157
            C 334 174, 323 210, 289 227
            C 251 246, 189 239, 158 215
          "
        />

        {/* a */}
        <path
          d="
            M 419 145
            C 391 124, 352 132, 338 164
            C 324 196, 341 226, 371 226
            C 402 226, 420 199, 425 166
            M 425 148
            L 410 224
          "
        />

        {/* M */}
        <path
          d="
            M 489 226
            L 521 76
            L 582 190
            L 674 75
            L 643 226
          "
        />

        {/* i */}
        <path
          d="
            M 713 144
            L 696 225
          "
        />

        <circle
          cx="727"
          cy="91"
          r="15"
          fill={`url(#${rimGradient})`}
          stroke="none"
        />
      </g>

      {/* main body */}
      <g
        fill="none"
        stroke={`url(#${mainGradient})`}
        strokeWidth="56"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* S */}
        <path
          d="
            M 326 76
            C 294 52, 231 52, 195 73
            C 163 92, 160 122, 188 135
            C 216 148, 279 142, 304 157
            C 334 174, 323 210, 289 227
            C 251 246, 189 239, 158 215
          "
        />

        {/* a */}
        <path
          d="
            M 419 145
            C 391 124, 352 132, 338 164
            C 324 196, 341 226, 371 226
            C 402 226, 420 199, 425 166
            M 425 148
            L 410 224
          "
        />

        {/* M */}
        <path
          d="
            M 489 226
            L 521 76
            L 582 190
            L 674 75
            L 643 226
          "
        />

        {/* i */}
        <path
          d="
            M 713 144
            L 696 225
          "
        />

        <circle
          cx="727"
          cy="91"
          r="12"
          fill={`url(#${mainGradient})`}
          stroke="none"
        />
      </g>

      {/* slim glass highlight over the wordmark */}
      <g
        fill="none"
        stroke={`url(#${highlightGradient})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      >
        <path
          d="
            M 319 72
            C 284 54, 229 58, 200 77
          "
        />

        <path
          d="
            M 353 151
            C 369 136, 396 137, 412 150
          "
        />

        <path
          d="
            M 525 82
            L 579 181
          "
        />

        <path
          d="
            M 671 82
            L 647 196
          "
        />

        <path
          d="
            M 718 151
            L 704 216
          "
        />
      </g>

      {/* ======================================================
          CENTER TAGLINE
          
          No pill.
          No box.
          No frame.
          It passes directly through SaMi.
         ====================================================== */}

      {taglineVisible && (
        <g>
          {/* wide glow */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="11"
            opacity="0.32"
            filter={`url(#${beamGlow})`}
          />

          {/* secondary glow */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="4"
            opacity="0.55"
          />

          {/* crisp beam */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="1.4"
            opacity="1"
          />

          {/* left flare */}
          <circle
            cx="135"
            cy="163"
            r="4.2"
            fill="#DFFFFF"
          />

          <circle
            cx="135"
            cy="163"
            r="12"
            fill="#42DEFF"
            opacity="0.34"
            filter={`url(#${shineGlow})`}
          />

          {/* right flare */}
          <circle
            cx="865"
            cy="163"
            r="4.2"
            fill="#FFE6FF"
          />

          <circle
            cx="865"
            cy="163"
            r="12"
            fill="#C95DFF"
            opacity="0.34"
            filter={`url(#${shineGlow})`}
          />

          {/* dark micro-stroke lets tagline cross any theme */}
          <text
            x="500"
            y="171"
            textAnchor="middle"
            fontFamily="
              Inter,
              ui-sans-serif,
              system-ui,
              -apple-system,
              BlinkMacSystemFont,
              'Segoe UI',
              Arial,
              sans-serif
            "
            fontSize="23"
            fontWeight="600"
            letterSpacing="8.1"
            fill="#F9FCFF"
            stroke="#07101E"
            strokeWidth="7"
            strokeOpacity="0.84"
            paintOrder="stroke fill"
          >
            AI POWERED BUSINESS WORKSPACE
          </text>
        </g>
      )}
    </svg>
  );
}