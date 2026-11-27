import type { TextInputInstance } from "react-native";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { requestRunnerOtp } from "@/api";
import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

/* =========================================================
   CONSTANTS AND VALIDATION
========================================================= */

const WORDMARK = require("../../assets/sami-wordmark.png");

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/* =========================================================
   SCREEN
========================================================= */

export default function RunnerLoginScreen() {
  const {
    colors,
    showOverlay,
  } = useRunnerTheme();

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const compact = height < 720;
  const wide = width >= 600;

  const actionBlue = colors.blueAction;
  const supportingText = colors.textMuted;
  const actionText = colors.onBlue;

  /* -------------------------------------------------------
     REFERENCES
  ------------------------------------------------------- */

  const emailInputRef = useRef<TextInputInstance>(null);

  const mountedRef = useRef(true);
  const submitLockRef = useRef(false);

  /* -------------------------------------------------------
     FORM STATE
  ------------------------------------------------------- */

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasEmailError, setHasEmailError] = useState(false);

  /* -------------------------------------------------------
     ACCESSIBILITY MOTION PREFERENCE
  ------------------------------------------------------- */

  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription =
      AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReduceMotion,
      );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  /* -------------------------------------------------------
     ENTRANCE ANIMATIONS
  ------------------------------------------------------- */

  const heroOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const heroY = useRef(
    new Animated.Value(12),
  ).current;

  const formOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const formY = useRef(
    new Animated.Value(14),
  ).current;

  const footerOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const footerY = useRef(
    new Animated.Value(8),
  ).current;

  useEffect(() => {
    if (reduceMotion) {
      heroOpacity.setValue(1);
      heroY.setValue(0);

      formOpacity.setValue(1);
      formY.setValue(0);

      footerOpacity.setValue(1);
      footerY.setValue(0);

      return;
    }

    const entrance = Animated.stagger(90, [
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(heroY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(formY, {
          toValue: 0,
          damping: 20,
          stiffness: 170,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(footerY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    entrance.start();

    return () => {
      entrance.stop();
    };
  }, [
    reduceMotion,
    heroOpacity,
    heroY,
    formOpacity,
    formY,
    footerOpacity,
    footerY,
  ]);

  /* -------------------------------------------------------
     GLOBAL NOTIFICATIONS
     All notices use the application-level overlay.
  ------------------------------------------------------- */

  function showHelp(): void {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message:
        "Enter the email address registered to your SaMi Runner account. SaMi will send a secure verification code to that email. If you can no longer access your registered email, contact SaMi Support for assistance.",
    });
  }

  function showEmailRequired(): void {
    showOverlay({
      type: "warning",
      title: "Email address required",
      message:
        "Enter the email address associated with your SaMi Runner account to continue.",
    });
  }

  function showInvalidEmail(): void {
    showOverlay({
      type: "warning",
      title: "Check your email address",
      message:
        "Enter a valid email address, for example name@example.com.",
    });
  }

  function showLoginError(message: string): void {
    showOverlay({
      type: "error",
      title: "Sign-in unavailable",
      message,
    });
  }

  /* -------------------------------------------------------
     SUBMIT LOGIN REQUEST
  ------------------------------------------------------- */

  async function continueWithEmail(): Promise<void> {
    if (submitLockRef.current || busy) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setHasEmailError(true);
      showEmailRequired();
      emailInputRef.current?.focus();
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setHasEmailError(true);
      showInvalidEmail();
      emailInputRef.current?.focus();
      return;
    }

    submitLockRef.current = true;

    Keyboard.dismiss();

    setBusy(true);
    setHasEmailError(false);

    try {
      const result = await requestRunnerOtp(normalizedEmail);

      if (!mountedRef.current) {
        return;
      }

      if (
        !result.ok ||
        !result.challengeId ||
        !result.destination
      ) {
        throw new Error(
          result.message ||
            "We couldn't create your verification request. Please try again.",
        );
      }

      router.push({
        pathname: "/(auth)/verify",
        params: {
          purpose: "login",
          challengeId: result.challengeId,
          destination: result.destination,
          email: normalizedEmail,
        },
      });
    } catch (cause) {
      if (!mountedRef.current) {
        return;
      }

      const message =
        cause instanceof Error
          ? cause.message
          : "We couldn't send your verification code. Please try again.";

      showLoginError(message);
    } finally {
      submitLockRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  /* -------------------------------------------------------
     NAVIGATION
  ------------------------------------------------------- */

  function openRegistration(): void {
    if (busy || submitLockRef.current) {
      return;
    }

    Keyboard.dismiss();
    router.push("/(auth)/register");
  }

  function clearEmail(): void {
    if (busy) {
      return;
    }

    setEmail("");
    setHasEmailError(false);

    emailInputRef.current?.focus();
  }

  /* -------------------------------------------------------
     LAYOUT
  ------------------------------------------------------- */

  const horizontalPadding = wide ? 36 : runnerSpacing.lg;

  const inputBorderColor = hasEmailError
    ? colors.red
    : colors.border;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        enabled={Platform.OS === "ios"}
        behavior="padding"
        keyboardVerticalOffset={8}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: compact
                ? runnerSpacing.xs
                : runnerSpacing.md,
              paddingBottom:
                Math.max(insets.bottom, runnerSpacing.sm) +
                runnerSpacing.lg,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}

          <Animated.View
            style={[
              styles.hero,
              {
                opacity: heroOpacity,
                transform: [{ translateY: heroY }],
              },
            ]}
          >
            <View style={styles.topBar}>
              <Image
                source={WORDMARK}
                style={styles.wordmark}
                resizeMode="contain"
                accessible
                accessibilityLabel="SaMi"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Help"
                accessibilityHint="Opens SaMi Runner sign-in assistance"
                onPress={showHelp}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.helpButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={17}
                  color={colors.blue}
                />

                <Text
                  style={[
                    styles.helpText,
                    { color: colors.text },
                  ]}
                >
                  Help
                </Text>
              </Pressable>
            </View>

            {/* INTRODUCTION */}

            <View style={styles.intro}>
              <View
                style={[
                  styles.eyebrowWrap,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <View
                  style={[
                    styles.eyebrowDot,
                    { backgroundColor: colors.blue },
                  ]}
                />

                <Text
                  style={[
                    styles.eyebrow,
                    { color: colors.blue },
                  ]}
                >
                  WELCOME BACK
                </Text>
              </View>

              <Text
                accessibilityRole="header"
                style={[
                  styles.title,
                  { color: colors.text },
                  compact && styles.titleCompact,
                ]}
              >
                Good to have{"\n"}you back.
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: supportingText },
                ]}
              >
                Sign in with the email address registered to
                your SaMi Runner account. We'll send you a
                secure verification code.
              </Text>
            </View>
          </Animated.View>

          {/* LOGIN FORM */}

          <Animated.View
            style={[
              styles.formCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: formOpacity,
                transform: [{ translateY: formY }],
              },
            ]}
          >
            <View style={styles.formHeading}>
              <View style={styles.formTitleRow}>
                <Text
                  style={[
                    styles.formTitle,
                    { color: colors.text },
                  ]}
                >
                  Email address
                </Text>

                <Text
                  style={[
                    styles.requiredLabel,
                    { color: supportingText },
                  ]}
                >
                  REQUIRED
                </Text>
              </View>

              <Text
                style={[
                  styles.formDescription,
                  { color: supportingText },
                ]}
              >
                Use the email you registered with.
              </Text>
            </View>

            <View
              style={[
                styles.emailInput,
                {
                  backgroundColor: colors.paper,
                  borderColor: inputBorderColor,
                },
                hasEmailError && styles.emailInputError,
              ]}
            >
              <View
                style={[
                  styles.inputIconWrap,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={colors.blue}
                />
              </View>

              <TextInput
                ref={emailInputRef}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);

                  if (hasEmailError) {
                    setHasEmailError(false);
                  }
                }}
                placeholder="name@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  void continueWithEmail();
                }}
                maxLength={254}
                editable={!busy}
                selectionColor={colors.blue}
                cursorColor={colors.blue}
                underlineColorAndroid="transparent"
                style={[
                  styles.input,
                  { color: colors.text },
                ]}
                accessibilityLabel="Runner email address"
                accessibilityHint="Enter the email address associated with your Runner account"
              />

              {email.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear email address"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={clearEmail}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.clearButton,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                >
                  <Ionicons
                    name="close-circle"
                    size={21}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            {/* PRIMARY ACTION */}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                busy
                  ? "Sending verification code"
                  : "Continue with email"
              }
              accessibilityHint="Sends a six-digit verification code to your registered email address"
              accessibilityState={{
                busy,
                disabled: busy,
              }}
              disabled={busy}
              onPress={() => {
                void continueWithEmail();
              }}
              android_ripple={{
                color: "rgba(255,255,255,0.16)",
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: actionBlue },
                pressed && !busy && styles.buttonPressed,
                busy && styles.disabled,
              ]}
            >
              {busy ? (
                <>
                  <ActivityIndicator
                    color={actionText}
                    size="small"
                  />

                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: actionText },
                    ]}
                  >
                    Sending verification code…
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: actionText },
                    ]}
                  >
                    Continue with email
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={actionText}
                  />
                </>
              )}
            </Pressable>

            <View style={styles.securityNote}>
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={colors.success}
              />

              <Text
                style={[
                  styles.securityText,
                  { color: supportingText },
                ]}
              >
                Secure sign-in. No password required.
              </Text>
            </View>
          </Animated.View>

          {/* FOOTER */}

          <Animated.View
            style={[
              styles.footer,
              {
                opacity: footerOpacity,
                transform: [{ translateY: footerY }],
              },
            ]}
          >
            <View style={styles.registerPrompt}>
              <Text
                style={[
                  styles.footerText,
                  { color: supportingText },
                ]}
              >
                New to SaMi Runner?
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a Runner account"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={openRegistration}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.registerButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.registerText,
                    { color: colors.blue },
                  ]}
                >
                  Create an account
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={15}
                  color={colors.blue}
                />
              </Pressable>
            </View>

            <View style={styles.footerSecurity}>
              <Ionicons
                name="lock-closed-outline"
                size={14}
                color={supportingText}
              />

              <Text
                style={[
                  styles.footerSecurityText,
                  { color: supportingText },
                ]}
              >
                Runner uses a separate account from SaMi Customer.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  scroll: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    gap: runnerSpacing.lg,
  },

  hero: {
    gap: runnerSpacing.xl,
  },

  topBar: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
  },

  wordmark: {
    width: 112,
    height: 43,
  },

  helpButton: {
    minWidth: 76,
    minHeight: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    borderWidth: 1,
    paddingHorizontal: runnerSpacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xs,
  },

  helpText: {
    fontSize: runnerTypography.caption,
    fontWeight: "800",
  },

  intro: {
    gap: runnerSpacing.md,
  },

  eyebrowWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.xs,
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.xs,
    borderRadius: runnerRadii.pill,
  },

  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: runnerRadii.pill,
  },

  eyebrow: {
    fontSize: runnerTypography.caption,
    fontWeight: "900",
    letterSpacing: 1,
  },

  title: {
    fontSize: 35,
    lineHeight: 43,
    fontWeight: "900",
    letterSpacing: -1,
  },

  titleCompact: {
    fontSize: 31,
    lineHeight: 38,
  },

  subtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 23,
    fontWeight: "500",
    maxWidth: 390,
  },

  formCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.xl,
    padding: runnerSpacing.lg,
    gap: runnerSpacing.lg,
    shadowColor: "#00061D",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },

  formHeading: {
    gap: runnerSpacing.xs,
  },

  formTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
  },

  formTitle: {
    fontSize: runnerTypography.body,
    fontWeight: "900",
  },

  requiredLabel: {
    fontSize: runnerTypography.caption,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  formDescription: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: 21,
    fontWeight: "500",
  },

  emailInput: {
    minHeight: runnerTouchTargets.comfortable,
    borderWidth: 1.4,
    borderRadius: runnerRadii.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  emailInputError: {
    borderWidth: 1.6,
  },

  inputIconWrap: {
    width: 42,
    height: 42,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    flex: 1,
    minHeight: runnerTouchTargets.comfortable,
    paddingVertical: runnerSpacing.sm,
    paddingHorizontal: 0,
    fontSize: runnerTypography.body,
    fontWeight: "600",
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  clearButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.lg,
    paddingHorizontal: runnerSpacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: runnerSpacing.sm,
    overflow: "hidden",
  },

  primaryButtonText: {
    fontSize: runnerTypography.body,
    fontWeight: "900",
    letterSpacing: 0.05,
  },

  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },

  disabled: {
    opacity: 0.65,
  },

  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.sm,
  },

  securityText: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
    fontWeight: "600",
  },

  footer: {
    marginTop: "auto",
    paddingTop: runnerSpacing.xs,
    gap: runnerSpacing.md,
  },

  registerPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: runnerSpacing.xs,
  },

  footerText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "500",
  },

  registerButton: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.xs,
    paddingHorizontal: runnerSpacing.xxs,
  },

  registerText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: "900",
  },

  footerSecurity: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: runnerSpacing.xs,
  },

  footerSecurityText: {
    fontSize: runnerTypography.caption,
    lineHeight: 19,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "center",
  },
});