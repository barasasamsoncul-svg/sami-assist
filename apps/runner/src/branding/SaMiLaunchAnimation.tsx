
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

const COLORS = {
  navy: "#000535",
  white: "#FFFFFF",
  arrowStart: "#0879FF",
  arrowEnd: "#1746C5",
  orbitStart: "#0879FF",
  orbitEnd: "#40B5FF",
};

type SaMiLaunchAnimationProps = {
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function SaMiLaunchAnimation({
  onComplete,
  style,
}: SaMiLaunchAnimationProps) {
  // The wordmark remains stable once revealed.
  const wordOpacity = useRef(new Animated.Value(0)).current;

  // The A is progressively drawn, then filled.
  const arrowStroke = useRef(new Animated.Value(300)).current;
  const arrowFill = useRef(new Animated.Value(0)).current;

  // Orbital swooshes draw themselves around the A.
  const upperOrbit = useRef(new Animated.Value(240)).current;
  const lowerOrbit = useRef(new Animated.Value(220)).current;

  const taglineOpacity = useRef(new Animated.Value(0)).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(180),

      // Reveal S and Mi.
      Animated.timing(wordOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),

      // Draw the navigation-arrow A.
      Animated.timing(arrowStroke, {
        toValue: 0,
        duration: 850,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),

      // Fill the completed A.
      Animated.timing(arrowFill, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),

      // Draw the orbital identity around the A.
      Animated.parallel([
        Animated.timing(upperOrbit, {
          toValue: 0,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(lowerOrbit, {
          toValue: 0,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),

      // Reveal the tagline last.
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),

      Animated.delay(200),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        onCompleteRef.current?.();
      }
    });

    return () => {
      animation.stop();
    };
  }, [
    wordOpacity,
    arrowStroke,
    arrowFill,
    upperOrbit,
    lowerOrbit,
    taglineOpacity,
  ]);

  return (
    <View
      accessible
      accessibilityLabel="SaMi launch animation"
      style={[styles.container, style]}
    >
      <View style={styles.logoStage}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 440 210"
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient
              id="samiArrowGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop offset="0%" stopColor={COLORS.arrowStart} />
              <Stop offset="100%" stopColor={COLORS.arrowEnd} />
            </LinearGradient>

            <LinearGradient
              id="samiOrbitGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor={COLORS.orbitStart} />
              <Stop offset="100%" stopColor={COLORS.orbitEnd} />
            </LinearGradient>
          </Defs>

          {/* S, M and i remain separate from the animated A. */}
          <AnimatedGroup opacity={wordOpacity}>
            <SvgText
              x="20"
              y="120"
              fill={COLORS.white}
              fontSize="128"
              fontFamily="Arial"
              fontWeight="900"
              fontStyle="italic"
            >
              S
            </SvgText>

            <SvgText
              x="229"
              y="120"
              fill={COLORS.white}
              fontSize="126"
              fontFamily="Arial"
              fontWeight="900"
              fontStyle="italic"
            >
              M
            </SvgText>

            {/* Dotless i: the blue dot is drawn separately. */}
            <SvgText
              x="346"
              y="120"
              fill={COLORS.white}
              fontSize="117"
              fontFamily="Arial"
              fontWeight="900"
              fontStyle="italic"
            >
              ı
            </SvgText>

            <Circle
              cx="375"
              cy="28"
              r="8.5"
              fill={COLORS.arrowStart}
            />
          </AnimatedGroup>

          {/* The central SaMi navigation-arrow A. */}
          <AnimatedPath
            d="
              M 130 84
              L 212 33
              Q 220 28 215 39
              L 177 117
              Q 173 126 168 117
              L 162 96
              L 133 93
              Q 123 92 130 84
              Z
            "
            fill="url(#samiArrowGradient)"
            fillOpacity={arrowFill}
            stroke={COLORS.arrowStart}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="300"
            strokeDashoffset={arrowStroke}
          />

          {/* Upper orbital swoosh. */}
          <AnimatedPath
            d="
              M 160 45
              C 215 8 316 3 342 26
              C 353 35 353 47 342 57
            "
            fill="none"
            stroke="url(#samiOrbitGradient)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="240"
            strokeDashoffset={upperOrbit}
          />

          {/* Lower orbital swoosh. */}
          <AnimatedPath
            d="
              M 151 129
              C 124 150 140 165 184 166
              C 226 167 265 151 297 135
            "
            fill="none"
            stroke="url(#samiOrbitGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="220"
            strokeDashoffset={lowerOrbit}
          />

          {/* Brand tagline appears after the logo animation. */}
          <AnimatedGroup opacity={taglineOpacity}>
            <Path
              d="M 25 190 L 78 190"
              stroke={COLORS.orbitStart}
              strokeWidth="2"
              strokeLinecap="round"
            />

            <SvgText
              x="220"
              y="195"
              fill={COLORS.white}
              fontSize="17"
              fontFamily="Arial"
              fontWeight="700"
              fontStyle="italic"
              letterSpacing="4"
              textAnchor="middle"
            >
              CONSIDER IT DONE.
            </SvgText>

            <Path
              d="M 362 190 L 415 190"
              stroke={COLORS.orbitStart}
              strokeWidth="2"
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
    backgroundColor: COLORS.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  logoStage: {
    width: "100%",
    maxWidth: 440,
    aspectRatio: 440 / 210,
    alignSelf: "center",
  },
});
