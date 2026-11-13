
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedGroup = Animated.createAnimatedComponent(G);

const NAVY = "#000535";
const WHITE = "#FFFFFF";
const BLUE = "#078BFF";
const CYAN = "#43D9FF";

// Actual SaMi letter geometry traced from the supplied GIF.
const LOGO_S =
  "M 143,164 138,160 129,157 113,156 112,157 106,157 102,159 99,159 89,165 86,168 82,176 82,180 81,181 82,182 83,190 85,193 90,197 108,204 112,209 111,213 107,217 98,220 88,219 82,217 76,213 74,213 70,216 62,226 65,229 74,233 83,234 84,235 98,235 99,234 105,234 106,233 109,233 115,231 125,225 131,218 134,210 134,204 131,197 128,194 121,190 113,188 104,184 100,180 100,176 104,171 113,168 122,169 125,171 127,171 131,174 133,174 139,169 Z";

const LOGO_M =
  "M 325,157 307,157 290,175 270,199 268,195 266,182 265,181 265,178 264,177 264,174 263,173 263,170 260,161 258,159 246,159 242,161 239,164 235,172 215,232 234,232 235,231 237,221 243,204 243,201 248,188 250,190 250,194 251,195 252,205 253,206 253,210 254,211 254,215 255,216 255,221 256,223 268,223 276,215 296,191 297,192 296,198 292,208 292,211 285,232 299,232 300,231 303,231 309,213 309,210 314,195 317,181 Z";

const LOGO_I =
  "M 345,179 343,178 329,178 327,182 327,185 325,189 325,192 323,196 323,199 317,217 314,232 328,232 333,230 334,224 336,220 336,217 338,213 339,206 341,202 342,195 345,187 Z";

const LOGO_I_DOT =
  "M 350,154 343,153 338,155 333,161 333,167 336,170 339,170 340,171 341,170 345,170 350,167 353,161 353,159 Z";

// The SaMi navigation-arrow A.
const LOGO_A =
  "M 219,161 213,162 148,189 139,194 139,200 141,201 172,203 174,205 174,237 178,243 181,242 189,233 198,214 204,205 207,196 213,188 222,166 Z";

// Orbital paths follow the original animation's sweeping motion.
const UPPER_ORBIT =
  "M 143,140 C 181,118 226,104 267,101 C 296,99 320,108 334,126";

const LOWER_ORBIT =
  "M 128,234 C 132,250 147,260 171,261 C 216,263 264,245 294,225";

type SaMiLaunchAnimationProps = {
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function SaMiLaunchAnimation({
  onComplete,
  style,
}: SaMiLaunchAnimationProps) {
  const wordOpacity = useRef(new Animated.Value(0)).current;

  const arrowDraw = useRef(new Animated.Value(250)).current;
  const arrowFill = useRef(new Animated.Value(0)).current;
  const arrowGlow = useRef(new Animated.Value(0)).current;

  const upperDraw = useRef(new Animated.Value(220)).current;
  const upperGlow = useRef(new Animated.Value(0)).current;

  const lowerDraw = useRef(new Animated.Value(190)).current;
  const lowerGlow = useRef(new Animated.Value(0)).current;

  const arrowTipOpacity = useRef(new Animated.Value(0)).current;
  const upperTipOpacity = useRef(new Animated.Value(0)).current;
  const lowerTipOpacity = useRef(new Animated.Value(0)).current;

  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineLine = useRef(new Animated.Value(0)).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let active = true;

    const animate = Animated.sequence([
      // 1. Reveal S and Mi independently of the A.
      Animated.delay(120),

      Animated.timing(wordOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),

      // 2. The navigation-arrow A draws into the open space.
      Animated.parallel([
        Animated.timing(arrowDraw, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),

        Animated.sequence([
          Animated.timing(arrowGlow, {
            toValue: 1,
            duration: 360,
            useNativeDriver: false,
          }),
          Animated.timing(arrowGlow, {
            toValue: 0.55,
            duration: 260,
            useNativeDriver: false,
          }),
        ]),
      ]),

      Animated.parallel([
        Animated.timing(arrowFill, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(arrowTipOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
      ]),

      // 3. Upper orbit sweeps across the logo.
      Animated.parallel([
        Animated.timing(upperDraw, {
          toValue: 0,
          duration: 630,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(upperGlow, {
          toValue: 1,
          duration: 450,
          useNativeDriver: false,
        }),
        Animated.timing(upperTipOpacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: false,
        }),
      ]),

      // 4. Lower orbit follows and completes the identity.
      Animated.parallel([
        Animated.timing(lowerDraw, {
          toValue: 0,
          duration: 590,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(lowerGlow, {
          toValue: 1,
          duration: 450,
          useNativeDriver: false,
        }),
        Animated.timing(lowerTipOpacity, {
          toValue: 1,
          duration: 480,
          useNativeDriver: false,
        }),
      ]),

      // 5. Reveal the tagline only after the full logo is formed.
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(taglineLine, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),

      Animated.delay(350),
    ]);

    animate.start(({ finished }) => {
      if (finished && active) {
        onCompleteRef.current?.();
      }
    });

    return () => {
      active = false;
      animate.stop();
    };
  }, [
    wordOpacity,
    arrowDraw,
    arrowFill,
    arrowGlow,
    upperDraw,
    upperGlow,
    lowerDraw,
    lowerGlow,
    arrowTipOpacity,
    upperTipOpacity,
    lowerTipOpacity,
    taglineOpacity,
    taglineLine,
  ]);

  return (
    <View
      accessible
      accessibilityLabel="SaMi animated brand introduction"
      style={[styles.container, style]}
    >
      <View style={styles.logoStage}>
        <Svg
          width="100%"
          height="100%"
          viewBox="25 90 362 210"
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient
              id="samiArrowFill"
              x1="0%"
              y1="100%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor="#0068E8" />
              <Stop offset="48%" stopColor="#087BFF" />
              <Stop offset="100%" stopColor="#56DBFF" />
            </LinearGradient>

            <LinearGradient
              id="samiOrbit"
              x1="0%"
              y1="100%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor="#0476F8" />
              <Stop offset="50%" stopColor="#0AA9FF" />
              <Stop offset="100%" stopColor="#8CEBFF" />
            </LinearGradient>
          </Defs>

          {/* S and Mi: exact letter outlines from the reference. */}
          <AnimatedGroup opacity={wordOpacity}>
            {/* Soft white halo */}
            <G
              fill="none"
              stroke={WHITE}
              strokeWidth="5"
              opacity={0.13}
            >
              <Path d={LOGO_S} />
              <Path d={LOGO_M} />
              <Path d={LOGO_I} />
              <Path d={LOGO_I_DOT} />
            </G>

            {/* Crisp wordmark */}
            <G fill={WHITE}>
              <Path d={LOGO_S} />
              <Path d={LOGO_M} />
              <Path d={LOGO_I} />
              <Path d={LOGO_I_DOT} />
            </G>
          </AnimatedGroup>

          {/* A: broad blue light underneath the arrow. */}
          <AnimatedPath
            d={LOGO_A}
            fill="none"
            stroke={BLUE}
            strokeWidth={20}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[250, 250]}
            strokeDashoffset={arrowDraw}
            opacity={arrowGlow}
          />

          {/* A: inner luminous edge. */}
          <AnimatedPath
            d={LOGO_A}
            fill="none"
            stroke={CYAN}
            strokeWidth={8}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[250, 250]}
            strokeDashoffset={arrowDraw}
            opacity={arrowGlow}
          />

          {/* A: completed navigation arrow. */}
          <AnimatedPath
            d={LOGO_A}
            fill="url(#samiArrowFill)"
            fillOpacity={arrowFill}
            stroke={CYAN}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[250, 250]}
            strokeDashoffset={arrowDraw}
          />

          {/* Light at the navigation arrow's leading point. */}
          <AnimatedGroup opacity={arrowTipOpacity}>
            <Circle
              cx="219"
              cy="163"
              r="9"
              fill={BLUE}
              opacity={0.3}
            />
            <Circle
              cx="219"
              cy="163"
              r="3.5"
              fill="#FFFFFF"
            />
          </AnimatedGroup>

          {/* Upper orbit: expanding glow. */}
          <AnimatedPath
            d={UPPER_ORBIT}
            fill="none"
            stroke={BLUE}
            strokeWidth={17}
            strokeLinecap="round"
            strokeDasharray={[220, 220]}
            strokeDashoffset={upperDraw}
            opacity={0.28}
          />

          <AnimatedPath
            d={UPPER_ORBIT}
            fill="none"
            stroke="url(#samiOrbit)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={[220, 220]}
            strokeDashoffset={upperDraw}
            opacity={upperGlow}
          />

          <AnimatedPath
            d={UPPER_ORBIT}
            fill="none"
            stroke="#A6EDFF"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={[220, 220]}
            strokeDashoffset={upperDraw}
            opacity={upperGlow}
          />

          <AnimatedGroup opacity={upperTipOpacity}>
            <Circle cx="334" cy="126" r="10" fill={BLUE} opacity={0.28} />
            <Circle cx="334" cy="126" r="3.5" fill="#FFFFFF" />
          </AnimatedGroup>

          {/* Lower orbit: the second sweep completes the loop. */}
          <AnimatedPath
            d={LOWER_ORBIT}
            fill="none"
            stroke={BLUE}
            strokeWidth={19}
            strokeLinecap="round"
            strokeDasharray={[190, 190]}
            strokeDashoffset={lowerDraw}
            opacity={0.3}
          />

          <AnimatedPath
            d={LOWER_ORBIT}
            fill="none"
            stroke="url(#samiOrbit)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={[190, 190]}
            strokeDashoffset={lowerDraw}
            opacity={lowerGlow}
          />

          <AnimatedPath
            d={LOWER_ORBIT}
            fill="none"
            stroke="#A6EDFF"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={[190, 190]}
            strokeDashoffset={lowerDraw}
            opacity={lowerGlow}
          />

          <AnimatedGroup opacity={lowerTipOpacity}>
            <Circle cx="128" cy="234" r="10" fill={BLUE} opacity={0.28} />
            <Circle cx="128" cy="234" r="3.5" fill="#FFFFFF" />
          </AnimatedGroup>

          {/* Tagline: always part of the completed animated identity. */}
          <AnimatedGroup opacity={taglineOpacity}>
            <Path
              d="M 36 282 L 74 282"
              stroke={CYAN}
              strokeWidth={1.6}
              strokeLinecap="round"
            />

            <SvgText
              x="206"
              y="288"
              fill={WHITE}
              fontSize={14.5}
              fontFamily="Arial"
              fontWeight="700"
              fontStyle="italic"
              letterSpacing={3.2}
              textAnchor="middle"
            >
              CONSIDER IT DONE.
            </SvgText>

            <Path
              d="M 338 282 L 378 282"
              stroke={CYAN}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </AnimatedGroup>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  logoStage: {
    width: "100%",
    maxWidth: 440,
    aspectRatio: 362 / 210,
    alignSelf: "center",
  },
});
