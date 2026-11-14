
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import type { ReactNode } from "react";

/* =========================================================
   OVERLAY TYPES
========================================================= */

export type SaMiOverlayType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "confirmation";

export type SaMiOverlayAction = {
  label: string;
  onClick?: () => void;
  tone?: "default" | "danger";
};

export type SaMiOverlayTheme = {
  brandNavy: string;
  blueAction: string;
  onBlue: string;
  blue: string;
  blueSoft: string;
  border: string;
  borderStrong: string;
  overlay: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  red: string;
  dangerSoft: string;
  surfaceRaised: string;
};

/* =========================================================
   COMPONENT PROPS
========================================================= */

type SaMiOverlayProps = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  theme: SaMiOverlayTheme;
  children?: ReactNode;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
  onClose: () => void;
  onDismiss?: () => void;
  dismissOnBackdrop?: boolean;
};

/* =========================================================
   SAMI OVERLAY
   Shared native overlay for SaMi applications.

   - Slides up from the bottom.
   - Uses deep navy as its main background.
   - Uses white title and message text.
   - Uses the calling application's theme for state
     colours, borders and actions.
========================================================= */

export function SaMiOverlay({
  open,
  type,
  title,
  message,
  theme,
  children,
  primaryAction,
  secondaryAction,
  onClose,
  onDismiss,
  dismissOnBackdrop = true,
}: SaMiOverlayProps) {
  const { height } = useWindowDimensions();

  const [mounted, setMounted] = useState(open);

  const translateY = useRef(
    new Animated.Value(height),
  ).current;

  /* =======================================================
     DISMISS HANDLER
  ======================================================= */

  const dismiss = useCallback(() => {
    if (onDismiss) {
      onDismiss();
    } else {
      onClose();
    }
  }, [onClose, onDismiss]);

  /* =======================================================
     OPENING ANIMATION
  ======================================================= */

  useEffect(() => {
    if (!open) {
      return;
    }

    setMounted(true);

    translateY.stopAnimation();
    translateY.setValue(height);

    const frame = requestAnimationFrame(() => {
      Animated.spring(translateY, {
        toValue: 0,
        damping: 24,
        stiffness: 190,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [open, height, translateY]);

  /* =======================================================
     CLOSING ANIMATION
  ======================================================= */

  useEffect(() => {
    if (open || !mounted) {
      return;
    }

    translateY.stopAnimation();

    Animated.timing(translateY, {
      toValue: height,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [open, mounted, height, translateY]);

  /* =======================================================
     STATE PRESENTATION
  ======================================================= */

  const state = {
    success: {
      label: "SUCCESS",
      symbol: "✓",
      color: theme.success,
      softColor: theme.successSoft,
    },

    error: {
      label: "ERROR",
      symbol: "!",
      color: theme.red,
      softColor: theme.dangerSoft,
    },

    warning: {
      label: "WARNING",
      symbol: "!",
      color: theme.warning,
      softColor: theme.warningSoft,
    },

    info: {
      label: "INFORMATION",
      symbol: "i",
      color: theme.blue,
      softColor: theme.blueSoft,
    },

    confirmation: {
      label: "CONFIRMATION",
      symbol: "?",
      color: theme.blue,
      softColor: theme.blueSoft,
    },
  }[type];

  /* =======================================================
     ACTION HANDLING
  ======================================================= */

  const runAction = (action: SaMiOverlayAction) => {
    dismiss();
    action.onClick?.();
  };

  /* =======================================================
     ACTION BUTTON
  ======================================================= */

  const renderAction = (
    action: SaMiOverlayAction,
    primary: boolean,
  ) => {
    const danger = action.tone === "danger";

    const backgroundColor = danger
      ? theme.red
      : primary
        ? theme.blueAction
        : theme.surfaceRaised;

    const textColor =
      primary && !danger
        ? theme.onBlue
        : "#FFFFFF";

    return (
      <Pressable
        key={action.label}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => runAction(action)}
        style={({ pressed }) => [
          styles.actionButton,
          {
            backgroundColor,
            borderColor: primary
              ? backgroundColor
              : theme.borderStrong,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.actionText,
            { color: textColor },
          ]}
        >
          {action.label}
        </Text>
      </Pressable>
    );
  };

  /* =======================================================
     VISIBILITY
  ======================================================= */

  if (!mounted) {
    return null;
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent={Platform.OS === "android"}
      navigationBarTranslucent={Platform.OS === "android"}
      onRequestClose={dismiss}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss overlay"
          onPress={
            dismissOnBackdrop ? dismiss : undefined
          }
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.overlay,
            },
          ]}
        />

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.brandNavy,
              borderColor: theme.borderStrong,
              maxHeight: height * 0.88,
              transform: [
                {
                  translateY,
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: theme.borderStrong,
              },
            ]}
          />

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* HEADER */}

            <View style={styles.header}>
              <View
                style={[
                  styles.stateBadge,
                  {
                    backgroundColor: state.softColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stateSymbol,
                    {
                      color: state.color,
                    },
                  ]}
                >
                  {state.symbol}
                </Text>

                <Text
                  style={[
                    styles.stateLabel,
                    {
                      color: state.color,
                    },
                  ]}
                >
                  {state.label}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={dismiss}
                hitSlop={12}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>
                  ×
                </Text>
              </Pressable>
            </View>

            {/* TITLE */}

            <Text style={styles.title}>
              {title}
            </Text>

            {/* MESSAGE */}

            <Text style={styles.message}>
              {message}
            </Text>

            {/* OPTIONAL CONTENT */}

            {children ? (
              <View style={styles.children}>
                {children}
              </View>
            ) : null}

            {/* ACTIONS */}

            {primaryAction || secondaryAction ? (
              <View style={styles.actions}>
                {primaryAction
                  ? renderAction(primaryAction, true)
                  : null}

                {secondaryAction
                  ? renderAction(secondaryAction, false)
                  : null}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  sheet: {
    width: "100%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 5,
    marginTop: 11,
    marginBottom: 8,
    opacity: 0.8,
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom:
      Platform.OS === "ios" ? 34 : 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
  },

  stateSymbol: {
    fontSize: 15,
    fontWeight: "800",
  },

  stateLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },

  closeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },

  closeText: {
    color: "#FFFFFF",
    fontSize: 29,
    lineHeight: 32,
    fontWeight: "300",
  },

  title: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 9,
  },

  message: {
    color: "#FFFFFF",
    opacity: 0.88,
    fontSize: 15,
    lineHeight: 23,
  },

  children: {
    marginTop: 18,
  },

  actions: {
    marginTop: 24,
    gap: 11,
  },

  actionButton: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
  },

  actionText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
