import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
} from "react-native";

/**
 * Keeps the focused form field visible when the on-screen keyboard opens.
 * Works with Android resize behaviour and the iOS keyboard overlay without
 * requiring a third-party keyboard package.
 */
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);
  const focusedField = useRef<View | null>(null);
  const keyboardTopY = useRef<number | null>(null);
  const keyboardHeightRef = useRef(0);
  const scrollY = useRef(0);
  const scrollPositionBeforeKeyboard = useRef<number | null>(null);
  const autoScrolledForKeyboard = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const adjustFocusedField = useCallback(() => {
    const field = focusedField.current;
    if (!field || keyboardTopY.current === null) return;

    requestAnimationFrame(() => {
      field.measureInWindow((_x, fieldY, _width, fieldHeight) => {
        viewportRef.current?.measureInWindow(
          (_viewportX, viewportY, _viewportWidth, viewportHeight) => {
            const scroll = scrollRef.current;
            if (!scroll) return;

            const viewportBottom = viewportY + viewportHeight;
            const reportedKeyboardTop = keyboardTopY.current;
            const visibleBottom =
              reportedKeyboardTop !== null && reportedKeyboardTop > viewportY
                ? Math.min(viewportBottom, reportedKeyboardTop)
                : viewportBottom - keyboardHeightRef.current;

            const bottomOverflow = fieldY + fieldHeight + 16 - visibleBottom;
            const topOverflow = viewportY + 12 - fieldY;
            const adjustment =
              bottomOverflow > 0
                ? bottomOverflow
                : topOverflow > 0
                  ? -topOverflow
                  : 0;

            if (adjustment === 0) return;

            const targetY = Math.max(0, scrollY.current + adjustment);
            scrollY.current = targetY;
            autoScrolledForKeyboard.current = true;
            scroll.scrollTo({ y: targetY, animated: true });
          },
        );
      });
    });
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      if (keyboardTopY.current === null) {
        scrollPositionBeforeKeyboard.current = scrollY.current;
      }

      keyboardTopY.current = event.endCoordinates.screenY;
      keyboardHeightRef.current = event.endCoordinates.height;
      setKeyboardHeight(event.endCoordinates.height);

      requestAnimationFrame(() => {
        requestAnimationFrame(adjustFocusedField);
      });
    });

    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTopY.current = null;
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);

      const previousPosition = scrollPositionBeforeKeyboard.current;
      const shouldRestore = autoScrolledForKeyboard.current;
      scrollPositionBeforeKeyboard.current = null;
      autoScrolledForKeyboard.current = false;

      if (shouldRestore && previousPosition !== null) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({
              y: previousPosition,
              animated: true,
            });
            scrollY.current = previousPosition;
          });
        });
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [adjustFocusedField]);

  const onFieldFocus = useCallback(
    (field: View | null) => {
      focusedField.current = field;
      adjustFocusedField();
    },
    [adjustFocusedField],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  return {
    scrollRef,
    viewportRef,
    keyboardHeight,
    onFieldFocus,
    onScroll,
  };
}
