'use client';

import { useId } from 'react';

type SaMiLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

type SaMiLogoProps = {
  size?: SaMiLogoSize;
  className?: string;
  showTagline?: boolean;
  markOnly?: boolean;
  showReflection?: boolean;
  showBackground?: boolean;
};

const SIZE_MAP: Record<SaMiLogoSize, number> = {
  xs: 105,
  sm: 145,
  md: 205,
  lg: 285,
  xl: 390,
  hero: 540,
};

export default function SaMiLogo({
  size = 'md',
  className = '',
  showTagline = true,
  markOnly = false,
}: SaMiLogoProps) {
  const uid = useId().replace(/:/g, '');
  const width = SIZE_MAP[size];
  const taglineVisible = showTagline && !markOnly;

  const mainGradient = `sami-main-${uid}`;
  const rimGradient = `sami-rim-${uid}`;
  const beamGradient = `sami-beam-${uid}`;
  const glow = `sami-glow-${uid}`;
  const beamGlow = `sami-beam-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 1000 280"
      width={width}
      height="auto"
      className={className}
      role="img"
      aria-label="SaMi — AI Powered Business Workspace"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient
          id={mainGradient}
          x1="130"
          y1="36"
          x2="870"
          y2="236"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#D9FEFF" />
          <stop offset="10%" stopColor="#67F1FF" />
          <stop offset="30%" stopColor="#24C7FF" />
          <stop offset="52%" stopColor="#1678FF" />
          <stop offset="72%" stopColor="#4C47FF" />
          <stop offset="87%" stopColor="#8C3DFF" />
          <stop offset="100%" stopColor="#F05BFF" />
        </linearGradient>

        <linearGradient
          id={rimGradient}
          x1="170"
          y1="45"
          x2="860"
          y2="220"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="24%" stopColor="#BDFBFF" />
          <stop offset="55%" stopColor="#70B6FF" />
          <stop offset="100%" stopColor="#FFC7FF" />
        </linearGradient>

        <linearGradient
          id={beamGradient}
          x1="40"
          y1="0"
          x2="960"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#2B9EFF" stopOpacity="0" />
          <stop offset="12%" stopColor="#2EDAFF" />
          <stop offset="48%" stopColor="#4F89FF" />
          <stop offset="76%" stopColor="#795AFF" />
          <stop offset="90%" stopColor="#D04DFF" />
          <stop offset="100%" stopColor="#D04DFF" stopOpacity="0" />
        </linearGradient>

        <filter id={glow} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.05
              0 0 0 0 0.45
              0 0 0 0 1
              0 0 0 0.60 0
            "
            result="blueGlow"
          />
          <feMerge>
            <feMergeNode in="blueGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={beamGlow} x="-30%" y="-1000%" width="160%" height="2100%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <g filter={`url(#${glow})`}>
        <text
          x="500"
          y="218"
          textAnchor="middle"
          fill={`url(#${mainGradient})`}
          stroke={`url(#${rimGradient})`}
          strokeWidth="2.4"
          paintOrder="stroke fill"
          fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
          fontSize="245"
          fontWeight="850"
          fontStyle="italic"
          letterSpacing="-18"
        >
          SaMi
        </text>
      </g>

      {taglineVisible && (
        <g>
          <line
            x1="45"
            y1="154"
            x2="955"
            y2="154"
            stroke={`url(#${beamGradient})`}
            strokeWidth="7"
            opacity="0.32"
            filter={`url(#${beamGlow})`}
          />

          <line
            x1="45"
            y1="154"
            x2="955"
            y2="154"
            stroke={`url(#${beamGradient})`}
            strokeWidth="1.5"
            opacity="0.98"
          />

          <circle cx="135" cy="154" r="3.2" fill="#E9FFFF" />
          <circle cx="865" cy="154" r="3.2" fill="#FFE7FF" />

          <text
            x="500"
            y="162"
            textAnchor="middle"
            fill="#F7FBFF"
            stroke="#050B18"
            strokeWidth="7"
            strokeOpacity="0.82"
            paintOrder="stroke fill"
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
            fontSize="23"
            fontWeight="500"
            letterSpacing="8.5"
          >
            AI POWERED BUSINESS WORKSPACE
          </text>
        </g>
      )}
    </svg>
  );
}
