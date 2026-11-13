
import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Image } from "expo-image";

const BRAND_NAVY = "#000535";

// Nine frames at 220ms each.
const ANIMATION_DURATION_MS = 9 * 220;

// Give the completed logo a deliberate final hold.
const FINAL_HOLD_MS = 350;

const SAMI_ANIMATION = require("../../assets/sami-launch-animation.gif");

type SaMiLaunchAnimationProps = {
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function SaMiLaunchAnimation({
  onComplete,
  style,
}: SaMiLaunchAnimationProps) {
  const { width } = useWindowDimensions();

  const hasStarted = useRef(false);

  const completionTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const handleAnimationDisplayed = useCallback(() => {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    completionTimer.current = setTimeout(() => {
      onCompleteRef.current?.();
    }, ANIMATION_DURATION_MS + FINAL_HOLD_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
    };
  }, []);

  const animationSize = Math.min(width * 0.88, 350);

  return (
    <View style={[styles.container, style]}>
      <Image
        source={SAMI_ANIMATION}
        style={{
          width: animationSize,
          height: animationSize,
        }}
        contentFit="contain"
        autoplay
        cachePolicy="memory-disk"
        onDisplay={handleAnimationDisplayed}
        accessibilityLabel="SaMi animated brand logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
