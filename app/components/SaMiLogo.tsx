'use client';

import { useId } from 'react';

type SaMiLogoSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | 'hero';

type SaMiLogoProps = {
  size?: SaMiLogoSize;
  className?: string;
  markOnly?: boolean;
  showTagline?: boolean;
  showReflection?: boolean;
  showBackground?: boolean;
};

const SIZE_MAP: Record<SaMiLogoSize, number> = {
  xs: 30,
  sm: 42,
  md: 64,
  lg: 96,
  xl: 140,
  '2xl': 200,
  hero: 300,
};

export default function SaMiLogo({
  size = 'md',
  className = '',
  markOnly = false,
  showTagline = true,
  showReflection = true,
  showBackground = true,
}: SaMiLogoProps) {
  const uid = useId().replace(/:/g, '');
  const height = SIZE_MAP[size];

  const ids = {
    sGradient: `sGradient-${uid}`,
    mGradient: `mGradient-${uid}`,
    cyanHighlight: `cyanHighlight-${uid}`,
    purpleHighlight: `purpleHighlight-${uid}`,
    depth: `depth-${uid}`,
    reflection: `reflection-${uid}`,
    beam: `beam-${uid}`,
    floor: `floor-${uid}`,
    logoGlow: `logoGlow-${uid}`,
    beamGlow: `beamGlow-${uid}`,
    textGlow: `textGlow-${uid}`,
    reflectionBlur: `reflectionBlur-${uid}`,
  };

  if (markOnly) {
    return (
      <svg
        viewBox="0 0 520 500"
        height={height}
        width={height}
        className={className}
        role="img"
        aria-label="SaMi"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient
            id={ids.sGradient}
            x1="95"
            y1="30"
            x2="360"
            y2="465"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#6EF2FF" />
            <stop offset="18%" stopColor="#21C7FF" />
            <stop offset="42%" stopColor="#1377FF" />
            <stop offset="65%" stopColor="#253BFF" />
            <stop offset="82%" stopColor="#6230FF" />
            <stop offset="100%" stopColor="#DE45FF" />
          </linearGradient>

          <linearGradient
            id={ids.mGradient}
            x1="270"
            y1="140"
            x2="470"
            y2="420"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#35D7FF" />
            <stop offset="34%" stopColor="#1B6DFF" />
            <stop offset="67%" stopColor="#4332FF" />
            <stop offset="100%" stopColor="#DB49FF" />
          </linearGradient>

          <linearGradient
            id={ids.cyanHighlight}
            x1="100"
            y1="50"
            x2="290"
            y2="260"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="15%" stopColor="#BDF8FF" />
            <stop offset="55%" stopColor="#44DFFF" />
            <stop offset="100%" stopColor="#44DFFF" stopOpacity="0" />
          </linearGradient>

          <linearGradient
            id={ids.depth}
            x1="150"
            y1="120"
            x2="420"
            y2="440"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#001130" stopOpacity="0" />
            <stop offset="55%" stopColor="#061641" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.72" />
          </linearGradient>

          <filter
            id={ids.logoGlow}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="12"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                0 0 0 0 0.05
                0 0 0 0 0.38
                0 0 0 0 1
                0 0 0 0.70 0
              "
              result="blueGlow"
            />
            <feMerge>
              <feMergeNode in="blueGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${ids.logoGlow})`}>
          <path
            d="
              M 324 77
              C 284 40 220 37 173 62
              C 126 87 98 127 99 170
              C 100 209 122 238 162 258
              C 188 271 220 279 245 291
              C 268 302 279 316 278 332
              C 276 354 257 374 229 381
              C 197 390 165 377 143 349
              L 84 396
              C 119 447 173 470 229 463
              C 292 455 343 414 355 359
              C 366 307 341 265 290 239
              C 268 228 239 218 211 208
              C 184 198 171 187 170 171
              C 168 150 188 130 215 125
              C 243 119 270 130 286 154
              Z
            "
            fill={`url(#${ids.sGradient})`}
          />

          <path
            d="
              M 285 281
              L 356 218
              L 404 261
              L 470 193
              L 470 414
              L 408 414
              L 408 309
              L 405 309
              L 358 358
              L 316 320
              L 285 348
              Z
            "
            fill={`url(#${ids.mGradient})`}
          />

          <path
            d="
              M 325 77
              C 283 46 224 47 181 70
              C 143 90 116 122 106 156
            "
            fill="none"
            stroke={`url(#${ids.cyanHighlight})`}
            strokeWidth="9"
            strokeLinecap="round"
            opacity="0.92"
          />

          <path
            d="
              M 356 218
              L 404 261
              L 470 193
            "
            fill="none"
            stroke="#B7F5FF"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />

          <path
            d="
              M 84 396
              C 119 447 173 470 229 463
              C 292 455 343 414 355 359
              C 358 345 358 331 355 317
              C 342 373 294 419 233 427
              C 179 434 130 414 103 378
              Z
            "
            fill={`url(#${ids.depth})`}
          />

          <path
            d="
              M 408 309
              L 470 245
              L 470 414
              L 408 414
              Z
            "
            fill={`url(#${ids.depth})`}
            opacity="0.75"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 1200 900"
      height={height}
      width="auto"
      className={className}
      role="img"
      aria-label="SaMi — AI-powered business workspace"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        maxWidth: '100%',
        overflow: 'visible',
      }}
    >
      <defs>
        {/* S MATERIAL */}
        <linearGradient
          id={ids.sGradient}
          x1="275"
          y1="100"
          x2="720"
          y2="690"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#73F4FF" />
          <stop offset="15%" stopColor="#29D7FF" />
          <stop offset="36%" stopColor="#1385FF" />
          <stop offset="58%" stopColor="#273CFF" />
          <stop offset="78%" stopColor="#6E31FF" />
          <stop offset="100%" stopColor="#ED51FF" />
        </linearGradient>

        {/* M MATERIAL */}
        <linearGradient
          id={ids.mGradient}
          x1="600"
          y1="185"
          x2="915"
          y2="635"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#45E5FF" />
          <stop offset="25%" stopColor="#168EFF" />
          <stop offset="52%" stopColor="#283CFF" />
          <stop offset="76%" stopColor="#7134FF" />
          <stop offset="100%" stopColor="#E74EFF" />
        </linearGradient>

        {/* CYAN GLASS HIGHLIGHT */}
        <linearGradient
          id={ids.cyanHighlight}
          x1="350"
          y1="100"
          x2="710"
          y2="430"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="11%" stopColor="#C9FCFF" />
          <stop offset="31%" stopColor="#5EE8FF" />
          <stop offset="58%" stopColor="#1DA8FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#1DA8FF" stopOpacity="0" />
        </linearGradient>

        <linearGradient
          id={ids.purpleHighlight}
          x1="705"
          y1="210"
          x2="950"
          y2="560"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E6FBFF" />
          <stop offset="28%" stopColor="#7DDEFF" />
          <stop offset="60%" stopColor="#8E6DFF" />
          <stop offset="100%" stopColor="#FF78EE" />
        </linearGradient>

        {/* LOWER DEPTH */}
        <linearGradient
          id={ids.depth}
          x1="420"
          y1="240"
          x2="800"
          y2="710"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#00112E" stopOpacity="0" />
          <stop offset="45%" stopColor="#001132" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#01040E" stopOpacity="0.78" />
        </linearGradient>

        {/* BEAM */}
        <linearGradient
          id={ids.beam}
          x1="80"
          y1="0"
          x2="1120"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#165BFF" stopOpacity="0" />
          <stop offset="10%" stopColor="#436FFF" stopOpacity="0.55" />
          <stop offset="25%" stopColor="#3DBFFF" />
          <stop offset="46%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#DCF5FF" />
          <stop offset="75%" stopColor="#785CFF" />
          <stop offset="90%" stopColor="#4D58FF" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#4D58FF" stopOpacity="0" />
        </linearGradient>

        {/* REFLECTION */}
        <linearGradient
          id={ids.reflection}
          x1="0"
          y1="655"
          x2="0"
          y2="850"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#BDF5FF" stopOpacity="0.55" />
          <stop offset="20%" stopColor="#54A4FF" stopOpacity="0.38" />
          <stop offset="52%" stopColor="#5962FF" stopOpacity="0.22" />
          <stop offset="77%" stopColor="#9344FF" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>

        <radialGradient
          id={ids.floor}
          cx="50%"
          cy="50%"
          r="50%"
        >
          <stop offset="0%" stopColor="#219CFF" stopOpacity="0.38" />
          <stop offset="35%" stopColor="#2159FF" stopOpacity="0.2" />
          <stop offset="70%" stopColor="#5B21FF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* LOGO GLOW */}
        <filter
          id={ids.logoGlow}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation="14"
            result="blur"
          />

          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0 0 0 0 0.03
              0 0 0 0 0.44
              0 0 0 0 1
              0 0 0 0.82 0
            "
            result="blueGlow"
          />

          <feMerge>
            <feMergeNode in="blueGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* BEAM GLOW */}
        <filter
          id={ids.beamGlow}
          x="-40%"
          y="-900%"
          width="180%"
          height="1900%"
        >
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* TEXT GLOW */}
        <filter
          id={ids.textGlow}
          x="-20%"
          y="-100%"
          width="140%"
          height="300%"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation="2"
            result="blur"
          />

          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* REFLECTION BLUR */}
        <filter
          id={ids.reflectionBlur}
          x="-30%"
          y="-30%"
          width="160%"
          height="180%"
        >
          <feGaussianBlur stdDeviation="3.3" />
        </filter>
      </defs>

      {/* =========================================================
          PERMANENT BACKGROUND
          Not affected by Tailwind / dark / light themes
         ========================================================= */}

      {showBackground && (
        <>
          <rect
            x="0"
            y="0"
            width="1200"
            height="900"
            rx="42"
            fill="#020716"
          />

          <radialGradient id={`bgGlow-${uid}`}>
            <stop offset="0%" stopColor="#062862" stopOpacity="0.5" />
            <stop offset="48%" stopColor="#061A3A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#020716" stopOpacity="0" />
          </radialGradient>

          <ellipse
            cx="600"
            cy="410"
            rx="445"
            ry="420"
            fill={`url(#bgGlow-${uid})`}
          />
        </>
      )}

      {/* floor lighting */}
      <ellipse
        cx="600"
        cy="695"
        rx="390"
        ry="92"
        fill={`url(#${ids.floor})`}
      />

      {/* =========================================================
          THE SM MARK
         ========================================================= */}

      <g filter={`url(#${ids.logoGlow})`}>
        {/* S */}
        <path
          d="
            M 703 143

            C 652 93
              573 79
              503 97

            C 426 116
              367 170
              354 235

            C 343 292
              371 341
              425 372

            C 454 389
              490 401
              530 415

            L 573 431

            C 606 443
              620 463
              615 486

            C 608 519
              579 548
              539 557

            C 494 567
              448 549
              420 511

            L 331 577

            C 373 645
              446 681
              525 673

            C 608 665
              681 611
              704 540

            C 726 471
              698 404
              633 366

            C 605 349
              567 335
              529 322

            L 475 303

            C 442 291
              425 275
              427 250

            C 430 219
              461 194
              501 190

            C 543 186
              582 206
              604 240

            Z
          "
          fill={`url(#${ids.sGradient})`}
        />

        {/* S internal dimensional shading */}
        <path
          d="
            M 331 577

            C 373 645
              446 681
              525 673

            C 608 665
              681 611
              704 540

            C 711 517
              713 496
              710 476

            C 691 550
              634 605
              561 620

            C 481 637
              406 606
              362 553

            Z
          "
          fill={`url(#${ids.depth})`}
          opacity="0.82"
        />

        {/* S upper glass rim */}
        <path
          d="
            M 700 145

            C 647 102
              575 94
              511 109

            C 442 126
              390 172
              369 227
          "
          fill="none"
          stroke={`url(#${ids.cyanHighlight})`}
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.95"
        />

        {/* subtle S inner edge */}
        <path
          d="
            M 604 240

            C 582 206
              543 186
              501 190

            C 461 194
              430 219
              427 250
          "
          fill="none"
          stroke="#D7FBFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />

        {/* M */}
        <path
          d="
            M 610 444

            L 721 342

            L 794 406

            L 920 275

            L 920 642

            L 826 642

            L 826 438

            L 796 468

            L 720 548

            L 653 487

            L 610 528

            Z
          "
          fill={`url(#${ids.mGradient})`}
        />

        {/* M dark dimensional plane */}
        <path
          d="
            M 826 438

            L 920 339

            L 920 642

            L 826 642

            Z
          "
          fill={`url(#${ids.depth})`}
          opacity="0.72"
        />

        {/* M bright top edges */}
        <path
          d="
            M 721 342

            L 794 406

            L 920 275
          "
          fill="none"
          stroke={`url(#${ids.purpleHighlight})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.92"
        />

        {/* right vertical glass edge */}
        <path
          d="
            M 920 275
            L 920 642
          "
          fill="none"
          stroke="#A5F4FF"
          strokeWidth="3"
          opacity="0.58"
        />
      </g>

      {/* =========================================================
          HORIZONTAL BRAND LINE THROUGH CENTER
         ========================================================= */}

      {showTagline && (
        <g>
          {/* wide glow */}
          <line
            x1="115"
            y1="470"
            x2="1085"
            y2="470"
            stroke={`url(#${ids.beam})`}
            strokeWidth="6"
            opacity="0.7"
            filter={`url(#${ids.beamGlow})`}
          />

          {/* sharp beam */}
          <line
            x1="105"
            y1="470"
            x2="1095"
            y2="470"
            stroke={`url(#${ids.beam})`}
            strokeWidth="2"
          />

          {/* secondary lower line */}
          <line
            x1="215"
            y1="503"
            x2="985"
            y2="503"
            stroke={`url(#${ids.beam})`}
            strokeWidth="1"
            opacity="0.42"
          />

          {/* center glass bar */}
          <rect
            x="215"
            y="441"
            width="770"
            height="58"
            rx="4"
            fill="#020C20"
            fillOpacity="0.84"
            stroke="#458BFF"
            strokeOpacity="0.36"
          />

          {/* left flare */}
          <circle
            cx="185"
            cy="470"
            r="3"
            fill="#FFFFFF"
            filter={`url(#${ids.beamGlow})`}
          />

          <ellipse
            cx="185"
            cy="470"
            rx="27"
            ry="4"
            fill="#5574FF"
            opacity="0.45"
          />

          {/* right flare */}
          <circle
            cx="1015"
            cy="470"
            r="3"
            fill="#FFFFFF"
            filter={`url(#${ids.beamGlow})`}
          />

          <ellipse
            cx="1015"
            cy="470"
            rx="27"
            ry="4"
            fill="#8255FF"
            opacity="0.44"
          />

          {/* TAGLINE */}
          <text
            x="600"
            y="480"
            textAnchor="middle"
            fill="#F6FAFF"
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontSize="27"
            fontWeight="450"
            letterSpacing="11"
            filter={`url(#${ids.textGlow})`}
          >
            AI-POWERED BUSINESS WORKSPACE
          </text>
        </g>
      )}

      {/* =========================================================
          FLOOR GLOW
         ========================================================= */}

      <ellipse
        cx="606"
        cy="663"
        rx="220"
        ry="28"
        fill="#1B92FF"
        opacity="0.18"
        filter={`url(#${ids.beamGlow})`}
      />

      <ellipse
        cx="770"
        cy="666"
        rx="105"
        ry="20"
        fill="#883CFF"
        opacity="0.12"
        filter={`url(#${ids.beamGlow})`}
      />

      {/* =========================================================
          SaMi REFLECTION
         ========================================================= */}

      {showReflection && (
        <g
          opacity="0.72"
          filter={`url(#${ids.reflectionBlur})`}
        >
          <text
            x="602"
            y="800"
            textAnchor="middle"
            fill={`url(#${ids.reflection})`}
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontSize="155"
            fontWeight="700"
            letterSpacing="-7"
          >
            SaMi
          </text>

          {/* second ghost reflection */}
          <text
            x="602"
            y="830"
            textAnchor="middle"
            fill="#4963FF"
            fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
            fontSize="150"
            fontWeight="700"
            letterSpacing="-7"
            opacity="0.07"
          >
            SaMi
          </text>
        </g>
      )}
    </svg>
  );
}