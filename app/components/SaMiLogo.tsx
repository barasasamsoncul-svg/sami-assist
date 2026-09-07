import React, { useId } from 'react';

type SaMiLogoSize = 'sm' | 'md' | 'lg' | 'xl';

type SaMiLogoProps = {
  size?: SaMiLogoSize;
  className?: string;
  showTagline?: boolean;
};

const sizeMap: Record<SaMiLogoSize, number> = {
  sm: 180,
  md: 240,
  lg: 320,
  xl: 420,
};

export default function SaMiLogo({
  size = 'lg',
  className = '',
  showTagline = true,
}: SaMiLogoProps) {
  const width = sizeMap[size];
  const id = useId().replace(/:/g, '');

  const cyanBluePink = `sami-grad-main-${id}`;
  const cyanBluePink2 = `sami-grad-main-2-${id}`;
  const beamGlow = `sami-beam-glow-${id}`;
  const markGlow = `sami-mark-glow-${id}`;
  const textGlow = `sami-text-glow-${id}`;
  const softBlur = `sami-soft-blur-${id}`;
  const beamBg = `sami-beam-bg-${id}`;
  const wordmarkGrad = `sami-wordmark-grad-${id}`;
  const floorFade = `sami-floor-fade-${id}`;

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      aria-label="SaMi logo"
      role="img"
      style={{ lineHeight: 0 }}
    >
      <svg
        width={width}
        viewBox="0 0 920 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={cyanBluePink} x1="250" y1="80" x2="610" y2="420" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#66F6FF" />
            <stop offset="42%" stopColor="#1F6BFF" />
            <stop offset="74%" stopColor="#4638FF" />
            <stop offset="100%" stopColor="#FF53D7" />
          </linearGradient>

          <linearGradient id={cyanBluePink2} x1="480" y1="120" x2="760" y2="390" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7DFFF7" />
            <stop offset="42%" stopColor="#3A7BFF" />
            <stop offset="78%" stopColor="#6047FF" />
            <stop offset="100%" stopColor="#FF66E1" />
          </linearGradient>

          <linearGradient id={wordmarkGrad} x1="300" y1="390" x2="680" y2="500" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7CF9FF" />
            <stop offset="40%" stopColor="#4B86FF" />
            <stop offset="75%" stopColor="#6552FF" />
            <stop offset="100%" stopColor="#D46BFF" />
          </linearGradient>

          <linearGradient id={beamBg} x1="170" y1="0" x2="750" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(15,23,42,0.08)" />
            <stop offset="50%" stopColor="rgba(15,23,42,0.18)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.08)" />
          </linearGradient>

          <linearGradient id={floorFade} x1="460" y1="380" x2="460" y2="545" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3D7CFF" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#3D7CFF" stopOpacity="0" />
          </linearGradient>

          <filter id={markGlow} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 1 0
              "
            />
          </filter>

          <filter id={beamGlow} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" result="blur" />
          </filter>

          <filter id={textGlow} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
          </filter>

          <filter id={softBlur} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="12" result="blur" />
          </filter>
        </defs>

        {/* subtle lower glow */}
        <ellipse
          cx="460"
          cy="470"
          rx="250"
          ry="36"
          fill="url(#floorFade)"
          opacity="0.9"
        />

        {/* glowing SM mark */}
        <g opacity="0.28" filter={`url(#${markGlow})`}>
          <text
            x="265"
            y="325"
            fontSize="320"
            fontWeight="900"
            fontStyle="italic"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            fill={`url(#${cyanBluePink})`}
            letterSpacing="-18"
          >
            S
          </text>

          <text
            x="470"
            y="325"
            fontSize="290"
            fontWeight="900"
            fontStyle="italic"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            fill={`url(#${cyanBluePink2})`}
            letterSpacing="-22"
          >
            M
          </text>
        </g>

        <g>
          <text
            x="265"
            y="325"
            fontSize="320"
            fontWeight="900"
            fontStyle="italic"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            fill={`url(#${cyanBluePink})`}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.4"
            letterSpacing="-18"
          >
            S
          </text>

          <text
            x="470"
            y="325"
            fontSize="290"
            fontWeight="900"
            fontStyle="italic"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            fill={`url(#${cyanBluePink2})`}
            stroke="rgba(255,255,255,0.48)"
            strokeWidth="1.2"
            letterSpacing="-22"
          >
            M
          </text>
        </g>

        {/* center beam */}
        {showTagline && (
          <g>
            <line
              x1="70"
              y1="270"
              x2="850"
              y2="270"
              stroke="#3E86FF"
              strokeWidth="4"
              opacity="0.95"
            />
            <line
              x1="70"
              y1="270"
              x2="850"
              y2="270"
              stroke="#5E5CFF"
              strokeWidth="2"
              opacity="0.8"
              filter={`url(#${beamGlow})`}
            />

            <circle cx="148" cy="270" r="5.5" fill="#A9F8FF" />
            <circle cx="772" cy="270" r="5.5" fill="#F08BFF" />

            <rect
              x="165"
              y="236"
              width="590"
              height="68"
              rx="22"
              fill="rgba(7,18,43,0.48)"
              stroke="rgba(79,137,255,0.7)"
              strokeWidth="1.4"
            />

            <rect
              x="165"
              y="236"
              width="590"
              height="68"
              rx="22"
              fill="transparent"
              stroke="rgba(92,186,255,0.45)"
              strokeWidth="5"
              filter={`url(#${beamGlow})`}
            />

            <text
              x="460"
              y="280"
              textAnchor="middle"
              fontSize="22"
              fontWeight="500"
              letterSpacing="8"
              fontFamily="Inter, Segoe UI, Arial, sans-serif"
              fill="rgba(255,255,255,0.96)"
            >
              AI-POWERED BUSINESS WORKSPACE
            </text>
          </g>
        )}

        {/* SaMi wordmark / reflection below */}
        <g>
          <text
            x="460"
            y="485"
            textAnchor="middle"
            fontSize="112"
            fontWeight="800"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            letterSpacing="-4"
            fill={`url(#${wordmarkGrad})`}
            opacity="0.38"
          >
            SaMi
          </text>

          <text
            x="460"
            y="485"
            textAnchor="middle"
            fontSize="112"
            fontWeight="800"
            fontFamily="Inter, Arial Black, Segoe UI, sans-serif"
            letterSpacing="-4"
            fill={`url(#${wordmarkGrad})`}
            opacity="0.18"
            filter={`url(#${softBlur})`}
          >
            SaMi
          </text>
        </g>
      </svg>
    </div>
  );
}