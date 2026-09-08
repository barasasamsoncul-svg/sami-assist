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
  showTagline?: boolean;
  markOnly?: boolean;
  showReflection?: boolean;
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
  showReflection: _showReflection,
  showBackground: _showBackground,
}: SaMiLogoProps) {
  const reactId = safeSvgId(useId());

  const width = SIZE_MAP[size];
  const taglineVisible = showTagline && !markOnly;

  // Dark Blue premium gradients
  const mainGradient = `sami-main-${reactId}`;
  const rimGradient = `sami-rim-${reactId}`;
  const highlightGradient = `sami-highlight-${reactId}`;
  const beamGradient = `sami-beam-${reactId}`;
  const accentGradient = `sami-accent-${reactId}`;
  const shadowGradient = `sami-shadow-${reactId}`;
  const glowGradient = `sami-glow-${reactId}`;
  const darkGlowGradient = `sami-dark-glow-${reactId}`;

  const logoGlow = `sami-logo-glow-${reactId}`;
  const beamGlow = `sami-beam-glow-${reactId}`;
  const shineGlow = `sami-shine-${reactId}`;
  const softGlow = `sami-soft-glow-${reactId}`;

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
            DARK BLUE PREMIUM GRADIENTS
           ===================================================== */}

        {/* Main gradient - deep navy to royal blue */}
        <linearGradient
          id={mainGradient}
          x1="150"
          y1="40"
          x2="850"
          y2="270"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4A7AFF" />
          <stop offset="25%" stopColor="#2B5CFF" />
          <stop offset="50%" stopColor="#1A3E8C" />
          <stop offset="75%" stopColor="#0F2B66" />
          <stop offset="100%" stopColor="#0A1A40" />
        </linearGradient>

        {/* Luminous rim gradient - lighter blue */}
        <linearGradient
          id={rimGradient}
          x1="160"
          y1="35"
          x2="860"
          y2="265"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6A9AFF" />
          <stop offset="25%" stopColor="#4A7AFF" />
          <stop offset="50%" stopColor="#2B5CFF" />
          <stop offset="75%" stopColor="#1A3E8C" />
          <stop offset="100%" stopColor="#0F2B66" />
        </linearGradient>

        {/* Inner glass highlight - subtle white */}
        <linearGradient
          id={highlightGradient}
          x1="200"
          y1="55"
          x2="800"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.40" />
          <stop offset="30%" stopColor="#B8D4FF" stopOpacity="0.25" />
          <stop offset="60%" stopColor="#80ACFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#4A7AFF" stopOpacity="0.05" />
        </linearGradient>

        {/* Subtle shadow gradient */}
        <linearGradient
          id={shadowGradient}
          x1="300"
          y1="250"
          x2="700"
          y2="80"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#000814" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#000814" stopOpacity="0" />
        </linearGradient>

        {/* Tagline beam - dark blue variant */}
        <linearGradient
          id={beamGradient}
          x1="40"
          y1="0"
          x2="960"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1A3E8C" stopOpacity="0" />
          <stop offset="10%" stopColor="#2B5CFF" stopOpacity="0.6" />
          <stop offset="40%" stopColor="#4A7AFF" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#2B5CFF" stopOpacity="0.8" />
          <stop offset="90%" stopColor="#1A3E8C" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0F2B66" stopOpacity="0" />
        </linearGradient>

        {/* =====================================================
            GLOW FILTERS
           ===================================================== */}

        {/* Soft ambient glow */}
        <filter
          id={softGlow}
          x="-40%"
          y="-80%"
          width="180%"
          height="260%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="18" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.05
              0 0 0 0 0.15
              0 0 0 0 0.40
              0 0 0 0.30 0
            "
            result="coloredGlow"
          />
          <feMerge>
            <feMergeNode in="coloredGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Main logo glow */}
        <filter
          id={logoGlow}
          x="-30%"
          y="-60%"
          width="160%"
          height="220%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.10
              0 0 0 0 0.25
              0 0 0 0 0.60
              0 0 0 0.50 0
            "
            result="coloredGlow"
          />
          <feMerge>
            <feMergeNode in="coloredGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Beam glow */}
        <filter
          id={beamGlow}
          x="-30%"
          y="-1500%"
          width="160%"
          height="3200%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="10" />
        </filter>

        {/* Shine glow */}
        <filter
          id={shineGlow}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="4" />
        </filter>

        {/* Background glow gradient */}
        <linearGradient
          id={glowGradient}
          x1="200"
          y1="50"
          x2="800"
          y2="250"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#2B5CFF" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#1A3E8C" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#0F2B66" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient
          id={darkGlowGradient}
          x1="0"
          y1="0"
          x2="1000"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1A3E8C" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#2B5CFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0F2B66" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* ====================================================== 
          AMBIENT BACKGROUND GLOW
         ====================================================== */}

      <ellipse
        cx="500"
        cy="155"
        rx="420"
        ry="120"
        fill={`url(#${glowGradient})`}
        filter={`url(#${softGlow})`}
        opacity="0.6"
      />

      {/* ====================================================== 
          SUBTLE SHADOW
         ====================================================== */}

      <g opacity="0.20">
        <path
          d="
            M 320 100
            C 290 78, 230 80, 195 100
            C 165 118, 162 148, 188 160
            C 216 172, 278 166, 302 180
            C 330 196, 320 230, 288 246
            C 252 264, 192 258, 162 236
          "
          fill="none"
          stroke={`url(#${shadowGradient})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* ====================================================== 
          SaMi WORDMARK - GLOW LAYER
         ====================================================== */}

      <g
        fill="none"
        stroke={`url(#${mainGradient})`}
        strokeWidth="68"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.30"
        filter={`url(#${logoGlow})`}
      >
        {/* S */}
        <path
          d="
            M 326 78
            C 294 54, 231 54, 195 75
            C 163 94, 160 124, 188 137
            C 216 150, 279 144, 304 159
            C 334 176, 323 212, 289 229
            C 251 248, 189 241, 158 217
          "
        />

        {/* a */}
        <path
          d="
            M 419 147
            C 391 126, 352 134, 338 166
            C 324 198, 341 228, 371 228
            C 402 228, 420 201, 425 168
            M 425 150
            L 410 226
          "
        />

        {/* M */}
        <path
          d="
            M 489 228
            L 521 78
            L 582 192
            L 674 77
            L 643 228
          "
        />

        {/* i */}
        <path
          d="
            M 713 146
            L 696 227
          "
        />

        <circle
          cx="727"
          cy="93"
          r="13"
          fill={`url(#${mainGradient})`}
          stroke="none"
        />
      </g>

      {/* ====================================================== 
          BRIGHT OUTER RIM
         ====================================================== */}

      <g
        fill="none"
        stroke={`url(#${rimGradient})`}
        strokeWidth="62"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      >
        {/* S */}
        <path
          d="
            M 326 78
            C 294 54, 231 54, 195 75
            C 163 94, 160 124, 188 137
            C 216 150, 279 144, 304 159
            C 334 176, 323 212, 289 229
            C 251 248, 189 241, 158 217
          "
        />

        {/* a */}
        <path
          d="
            M 419 147
            C 391 126, 352 134, 338 166
            C 324 198, 341 228, 371 228
            C 402 228, 420 201, 425 168
            M 425 150
            L 410 226
          "
        />

        {/* M */}
        <path
          d="
            M 489 228
            L 521 78
            L 582 192
            L 674 77
            L 643 228
          "
        />

        {/* i */}
        <path
          d="
            M 713 146
            L 696 227
          "
        />

        <circle
          cx="727"
          cy="93"
          r="15"
          fill={`url(#${rimGradient})`}
          stroke="none"
        />
      </g>

      {/* ====================================================== 
          MAIN WORDMARK BODY - DARK BLUE
         ====================================================== */}

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
            M 326 78
            C 294 54, 231 54, 195 75
            C 163 94, 160 124, 188 137
            C 216 150, 279 144, 304 159
            C 334 176, 323 212, 289 229
            C 251 248, 189 241, 158 217
          "
        />

        {/* a */}
        <path
          d="
            M 419 147
            C 391 126, 352 134, 338 166
            C 324 198, 341 228, 371 228
            C 402 228, 420 201, 425 168
            M 425 150
            L 410 226
          "
        />

        {/* M */}
        <path
          d="
            M 489 228
            L 521 78
            L 582 192
            L 674 77
            L 643 228
          "
        />

        {/* i */}
        <path
          d="
            M 713 146
            L 696 227
          "
        />

        <circle
          cx="727"
          cy="93"
          r="12"
          fill={`url(#${mainGradient})`}
          stroke="none"
        />
      </g>

      {/* ====================================================== 
          GLASS HIGHLIGHT
         ====================================================== */}

      <g
        fill="none"
        stroke={`url(#${highlightGradient})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.60"
      >
        <path
          d="
            M 319 74
            C 284 56, 229 60, 200 79
          "
        />

        <path
          d="
            M 353 153
            C 369 138, 396 139, 412 152
          "
        />

        <path
          d="
            M 525 84
            L 579 183
          "
        />

        <path
          d="
            M 671 84
            L 647 198
          "
        />

        <path
          d="
            M 718 153
            L 704 218
          "
        />
      </g>

      {/* ====================================================== 
          DECORATIVE SPARKLE / ACCENT DOTS
         ====================================================== */}

      <circle
        cx="170"
        cy="70"
        r="2.5"
        fill="#4A7AFF"
        opacity="0.5"
      />

      <circle
        cx="850"
        cy="240"
        r="2.5"
        fill="#1A3E8C"
        opacity="0.5"
      />

      <circle
        cx="870"
        cy="80"
        r="1.8"
        fill="#2B5CFF"
        opacity="0.3"
      />

      <circle
        cx="150"
        cy="230"
        r="1.8"
        fill="#0F2B66"
        opacity="0.3"
      />

      {/* ====================================================== 
          TAGLINE BEAM - DARK BLUE VARIANT
         ====================================================== */}

      {taglineVisible && (
        <g>
          {/* Wide glow */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="12"
            opacity="0.25"
            filter={`url(#${beamGlow})`}
          />

          {/* Secondary glow */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="5"
            opacity="0.40"
          />

          {/* Crisp beam */}
          <line
            x1="68"
            y1="163"
            x2="932"
            y2="163"
            stroke={`url(#${beamGradient})`}
            strokeWidth="1.4"
            opacity="1"
          />

          {/* Left flare */}
          <circle
            cx="135"
            cy="163"
            r="4.5"
            fill="#6A9AFF"
          />

          <circle
            cx="135"
            cy="163"
            r="14"
            fill="#2B5CFF"
            opacity="0.25"
            filter={`url(#${shineGlow})`}
          />

          {/* Right flare */}
          <circle
            cx="865"
            cy="163"
            r="4.5"
            fill="#1A3E8C"
          />

          <circle
            cx="865"
            cy="163"
            r="14"
            fill="#0F2B66"
            opacity="0.25"
            filter={`url(#${shineGlow})`}
          />

          {/* Dark micro-stroke for contrast */}
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
              Roboto,
              Arial,
              sans-serif
            "
            fontSize="23"
            fontWeight="600"
            letterSpacing="8.1"
            fill="#F9FCFF"
            stroke="#020814"
            strokeWidth="6"
            strokeOpacity="0.80"
            paintOrder="stroke fill"
          >
            AI POWERED BUSINESS WORKSPACE
          </text>
        </g>
      )}

      {/* ====================================================== 
          FINE DETAIL - GLASS SHINE OVERLAY
         ====================================================== */}

      <g opacity="0.06">
        <path
          d="
            M 180 120
            Q 350 100, 500 115
            Q 650 130, 820 110
          "
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}