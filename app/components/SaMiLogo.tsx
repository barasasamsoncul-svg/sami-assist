'use client';

import { useId } from 'react';

type SaMiLogoProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
};

const SIZE_MAP = {
  xs: 110,
  sm: 150,
  md: 210,
  lg: 290,
  xl: 380,
  hero: 520,
};

export default function SaMiLogo({
  size = 'md',
  className = '',
}: SaMiLogoProps) {
  const uid = useId().replace(/:/g, '');
  const width = SIZE_MAP[size];

  const mainGradient = `sami-main-${uid}`;
  const edgeGradient = `sami-edge-${uid}`;
  const glow = `sami-glow-${uid}`;
  const beamGlow = `sami-beam-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 1000 360"
      width={width}
      height="auto"
      className={className}
      role="img"
      aria-label="SaMi — AI Powered Business Workspace"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        overflow: 'visible',
      }}
    >
      <defs>
        {/* Main SaMi material */}
        <linearGradient
          id={mainGradient}
          x1="180"
          y1="40"
          x2="820"
          y2="300"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8AF7FF" />
          <stop offset="18%" stopColor="#35D7FF" />
          <stop offset="40%" stopColor="#1789FF" />
          <stop offset="62%" stopColor="#3653FF" />
          <stop offset="82%" stopColor="#7740FF" />
          <stop offset="100%" stopColor="#E95CFF" />
        </linearGradient>

        {/* Fine bright edge */}
        <linearGradient
          id={edgeGradient}
          x1="160"
          y1="60"
          x2="840"
          y2="280"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E8FFFF" />
          <stop offset="35%" stopColor="#6FE8FF" />
          <stop offset="70%" stopColor="#6D8BFF" />
          <stop offset="100%" stopColor="#FFB4FF" />
        </linearGradient>

        {/* SaMi glow */}
        <filter
          id={glow}
          x="-40%"
          y="-50%"
          width="180%"
          height="200%"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation="9"
            result="blur"
          />

          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.10
              0 0 0 0 0.47
              0 0 0 0 1
              0 0 0 0.65 0
            "
            result="blueGlow"
          />

          <feMerge>
            <feMergeNode in="blueGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Horizontal beam glow */}
        <filter
          id={beamGlow}
          x="-40%"
          y="-500%"
          width="180%"
          height="1000%"
        >
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* =====================================================
          ONLY IDENTITY:
          LARGE ITALIC SaMi
         ===================================================== */}

      <g filter={`url(#${glow})`}>
        <text
          x="500"
          y="270"
          textAnchor="middle"
          fill={`url(#${mainGradient})`}
          stroke={`url(#${edgeGradient})`}
          strokeWidth="2.3"
          paintOrder="stroke fill"
          fontFamily="Inter, Arial, Helvetica, sans-serif"
          fontSize="280"
          fontWeight="800"
          fontStyle="italic"
          letterSpacing="-20"
        >
          SaMi
        </text>
      </g>

      {/* =====================================================
          TAGLINE PASSES THROUGH CENTER
          NO BOX
          NO CAPSULE
          NO FRAME
         ===================================================== */}

      {/* soft horizontal glow */}
      <line
        x1="55"
        y1="190"
        x2="945"
        y2="190"
        stroke="#3384FF"
        strokeWidth="6"
        opacity="0.40"
        filter={`url(#${beamGlow})`}
      />

      {/* sharp horizontal line */}
      <line
        x1="60"
        y1="190"
        x2="940"
        y2="190"
        stroke="url(#sami-line)"
        strokeWidth="1.5"
        opacity="0.9"
      />

      <defs>
        <linearGradient
          id="sami-line"
          x1="60"
          y1="190"
          x2="940"
          y2="190"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#24CBFF" stopOpacity="0" />
          <stop offset="16%" stopColor="#24CBFF" />
          <stop offset="50%" stopColor="#5380FF" />
          <stop offset="84%" stopColor="#B84EFF" />
          <stop offset="100%" stopColor="#B84EFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* center tagline */}
      <text
        x="500"
        y="198"
        textAnchor="middle"
        fill="#F5FAFF"
        fontFamily="Inter, Arial, Helvetica, sans-serif"
        fontSize="24"
        fontWeight="500"
        letterSpacing="9"
        paintOrder="stroke"
        stroke="#07101F"
        strokeWidth="6"
        strokeOpacity="0.88"
      >
        AI POWERED BUSINESS WORKSPACE
      </text>
    </svg>
  );
}