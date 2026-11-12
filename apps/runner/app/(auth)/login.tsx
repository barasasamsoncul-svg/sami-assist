
import { useEffect, useRef, useState } from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
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
import { useRunnerTheme } from "@/theme";

/* =========================================================
   EMAIL VALIDATION
========================================================= */

const BACK_SIZE = 46;

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
  const { colors, mode } = useRunnerTheme();

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const compact = height < 720;
  const wide = width >= 600;

  /* -------------------------------------------------------
     THEME TOKENS

     Supports the upgraded theme system while remaining
     compatible with the existing palette during migration.
  ------------------------------------------------------- */

  const theme = colors as typeof colors & {
    brandNavy?: string;
    blueAction?: string;
    onBlue?: string;
    borderStrong?: string;
  };

  const brandNavy = theme.brandNavy ?? "#000535";

  const actionBlue =
    theme.blueAction ??
    (mode === "dark" ? "#1D5DAD" : colors.blue);

  const supportingText =
    mode === "dark" ? colors.textMuted : "#46566B";

  const actionText = theme.onBlue ?? "#FFFFFF";

  /* -------------------------------------------------------
     REFERENCES
  ------------------------------------------------------- */

  const emailInputRef = useRef<TextInput | null>(null);

  const mountedRef = useRef(true);
  const submitLockRef = useRef(false);

  /* -------------------------------------------------------
     FORM STATE
  ------------------------------------------------------- */

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

     Only opacity and transform are animated.

     The TextInput itself is never animated or remounted.
     No animation runs in response to focus or typing.
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
     SUBMIT LOGIN REQUEST

     Prevents duplicate requests even when the user taps
     the button repeatedly before React updates busy state.
  ------------------------------------------------------- */

  async function continueWithEmail(): Promise<void> {
    if (submitLockRef.current || busy) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setError(
        "Enter the email address associated with your Runner account.",
      );

      emailInputRef.current?.focus();
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError(
        "Enter a valid email address, for example you@example.com.",
      );

      emailInputRef.current?.focus();
      return;
    }

    submitLockRef.current = true;

    // Dismiss only after validation succeeds.
    // Android uses its native resize configuration.
    Keyboard.dismiss();

    setBusy(true);
    setError("");

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

      // Preserve the server-issued challenge and destination.
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

      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't send your verification code. Please try again.",
      );
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

  function goToWelcome(): void {
    if (busy || submitLockRef.current) {
      return;
    }

    Keyboard.dismiss();
    router.replace("/");
  }

  function clearEmail(): void {
    if (busy) return;

    setEmail("");
    setError("");

    // Keep the existing native input mounted.
    emailInputRef.current?.focus();
  }

  /* -------------------------------------------------------
     LAYOUT
  ------------------------------------------------------- */

  const horizontalPadding = wide ? 36 : 22;

  const inputBorderColor = error
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
      <StatusBar
        barStyle={
          mode === "dark" ? "light-content" : "dark-content"
        }
        backgroundColor={colors.paper}
        translucent={false}
        hidden={false}
      />

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
              paddingTop: compact ? 8 : 16,
              paddingBottom:
                Math.max(insets.bottom, 12) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          {/* =================================================
              HEADER AND INTRODUCTION
          ================================================= */}

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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
                accessibilityHint="Returns to the SaMi Runner welcome screen"
                accessibilityState={{
                  disabled: busy,
                }}
                disabled={busy}
                onPress={goToWelcome}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={colors.text}
                />
              </Pressable>

              <View style={styles.topBarLabelWrap}>
                <Text
                  style={[
                    styles.topBarLabel,
                    { color: supportingText },
                  ]}
                >
                  RUNNER ACCOUNT
                </Text>
              </View>

              <View style={styles.topBarSpacer} />
            </View>

            <View style={styles.brandRow}>
              <View
                style={[
                  styles.logoMark,
                  { backgroundColor: brandNavy },
                ]}
              >
                <Ionicons
                  name="navigate"
                  size={26}
                  color="#FFFFFF"
                />
              </View>

              <View style={styles.brandCopy}>
                <Text
                  style={[
                    styles.brandName,
                    { color: colors.text },
                  ]}
                >
                  SaMi{" "}
                  <Text style={{ color: colors.blue }}>
                    Runner
                  </Text>
                </Text>

                <Text
                  style={[
                    styles.brandTagline,
                    { color: supportingText },
                  ]}
                >
                  CONSIDER IT DONE
                </Text>
              </View>
            </View>

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

          {/* =================================================
              LOGIN FORM

              The TextInput is deliberately stable:
              no onFocus/onBlur state, no changing wrappers,
              no conditional remounting while typing.
          ================================================= */}

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
                error && styles.emailInputError,
              ]}
            >
              <View
                style={[
                  styles.inputIconWrap,
                  {
                    backgroundColor: colors.blueSoft,
                  },
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

                  if (error) {
                    setError("");
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
                  accessibilityState={{
                    disabled: busy,
                  }}
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

            {error ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  styles.errorContainer,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={19}
                  color={colors.red}
                />

                <Text
                  style={[
                    styles.errorText,
                    { color: colors.red },
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}

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
                {
                  backgroundColor: actionBlue,
                },
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

          {/* =================================================
              APPLICATION INFORMATION
          ================================================= */}

          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.blueSoft },
            ]}
          >
            <View style={styles.infoIcon}>
              <Ionicons
                name="information-circle"
                size={21}
                color={colors.blue}
              />
            </View>

            <View style={styles.infoCopy}>
              <Text
                style={[
                  styles.infoTitle,
                  { color: colors.text },
                ]}
              >
                Already applied?
              </Text>

              <Text
                style={[
                  styles.infoText,
                  { color: supportingText },
                ]}
              >
                Use the same email to continue your
                application or check your verification status.
              </Text>
            </View>
          </View>

          {/* =================================================
              FOOTER
          ================================================= */}

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
                accessibilityState={{
                  disabled: busy,
                }}
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
    gap: 19,
  },

  /* Header and introduction */

  hero: {
    gap: 25,
  },

  topBar: {
    minHeight: BACK_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  topBarLabelWrap: {
    flex: 1,
    alignItems: "center",
  },

  topBarLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
  },

  topBarSpacer: {
    width: BACK_SIZE,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  logoMark: {
    width: 51,
    height: 51,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000535",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 3,
  },

  brandCopy: {
    gap: 4,
  },

  brandName: {
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },

  brandTagline: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
  },

  intro: {
    gap: 12,
  },

  eyebrowWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },

  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  title: {
    fontSize: 35,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -1.25,
  },

  titleCompact: {
    fontSize: 31,
    lineHeight: 37,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    maxWidth: 390,
  },

  /* Login card */

  formCard: {
    borderWidth: 1,
    borderRadius: 21,
    padding: 18,
    gap: 17,

    shadowColor: "#000535",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.055,
    shadowRadius: 12,
    elevation: 2,
  },

  formHeading: {
    gap: 6,
  },

  formTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  formTitle: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  requiredLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  formDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },

  emailInput: {
    minHeight: 64,
    borderWidth: 1.4,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 11,
  },

  emailInputError: {
    borderWidth: 1.6,
  },

  inputIconWrap: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 15,
    fontWeight: "600",
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  clearButton: {
    width: 35,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Error */

  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 13,
    padding: 12,
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: "600",
  },

  /* Primary action */

  primaryButton: {
    minHeight: 61,
    borderRadius: 16,
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 11,
    overflow: "hidden",
  },

  primaryButtonText: {
    fontSize: 15,
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
    gap: 8,
  },

  securityText: {
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
  },

  /* Application guidance */

  infoCard: {
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },

  infoIcon: {
    paddingTop: 1,
  },

  infoCopy: {
    flex: 1,
    gap: 4,
  },

  infoTitle: {
    fontSize: 12.5,
    fontWeight: "900",
  },

  infoText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },

  /* Footer */

  footer: {
    marginTop: "auto",
    paddingTop: 5,
    gap: 14,
  },

  registerPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  footerText: {
    fontSize: 13,
    fontWeight: "500",
  },

  registerButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 3,
  },

  registerText: {
    fontSize: 13,
    fontWeight: "900",
  },

  footerSecurity: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  footerSecurityText: {
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "center",
  },
});
