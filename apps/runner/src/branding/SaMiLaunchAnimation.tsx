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

// The bundled launch GIF contains nine frames at approximately 220ms each.
const ANIMATION_DURATION_MS = 9 * 220;
const FINAL_HOLD_MS = 350;

const SAMI_ANIMATION = require("../../assets/sami-launch-animation.gif");

type SaMiLaunchAnimationProps = {
  onComplete?: () => void;
  isPlaying?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function SaMiLaunchAnimation({
  onComplete,
  isPlaying = true,
  style,
}: SaMiLaunchAnimationProps) {
  const { width } = useWindowDimensions();

  const imageRef = useRef<React.ElementRef<typeof Image> | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const hasStarted = useRef(false);
  const hasCompleted = useRef(false);

  const playbackTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimers = useCallback(() => {
    if (playbackTimer.current) {
      clearTimeout(playbackTimer.current);
      playbackTimer.current = null;
    }

    if (completionTimer.current) {
      clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }
  }, []);

  const stopImage = useCallback(() => {
    const image = imageRef.current;

    if (image) {
      void Promise.resolve(image.stopAnimating()).catch(() => undefined);
    }
  }, []);

  const finishAnimation = useCallback(() => {
    if (hasCompleted.current) return;

    hasCompleted.current = true;
    onCompleteRef.current?.();
  }, []);

  const handleAnimationDisplayed = useCallback(() => {
    if (!isPlayingRef.current || hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    const image = imageRef.current;

    if (!image) {
      finishAnimation();
      return;
    }

    // Disable automatic looping and start playback explicitly. The image is
    // stopped after one complete nine-frame sequence, then held on its final
    // frame before session restoration begins.
    void Promise.resolve(image.startAnimating()).catch(() => {
      finishAnimation();
    });

    playbackTimer.current = setTimeout(() => {
      stopImage();
      playbackTimer.current = null;

      completionTimer.current = setTimeout(() => {
        completionTimer.current = null;
        finishAnimation();
      }, FINAL_HOLD_MS);
    }, ANIMATION_DURATION_MS);
  }, [finishAnimation, stopImage]);

  useEffect(() => {
    if (isPlaying) return;

    clearTimers();
    stopImage();
  }, [isPlaying, clearTimers, stopImage]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopImage();
    };
  }, [clearTimers, stopImage]);

  const animationSize = Math.min(width * 0.88, 350);

  return (
    <View style={[styles.container, style]}>
      <Image
        ref={imageRef}
        source={SAMI_ANIMATION}
        style={{
          width: animationSize,
          height: animationSize,
        }}
        contentFit="contain"
        autoplay={false}
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
