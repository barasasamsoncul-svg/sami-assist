import { StatusBar } from "expo-status-bar";
import type {
  TextInputInstance,
} from "react-native";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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

import type {
  KeyboardTypeOptions,
  TextInputProps,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestRunnerRegistrationOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

/* =========================================================
   ASSETS
========================================================= */

const WORDMARK = require("../../assets/sami-wordmark.png");

/* =========================================================
   VALIDATION
========================================================= */

function isValidKenyanMobile(value: string): boolean {
  const trimmed = value.trim();

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    return false;
  }

  const digits = trimmed.replace(/\D/g, "");

  return (
    /^0[17]\d{8}$/.test(digits) ||
    /^254[17]\d{8}$/.test(digits) ||
    /^[17]\d{8}$/.test(digits)
  );
}

function isValidEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/* =========================================================
   FORM FIELD
   A consistent, accessible input used throughout the form.
========================================================= */

type RegistrationFieldProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useRunnerTheme>["colors"];
  inputRef: React.RefObject<TextInputInstance | null>;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  accessibilityHint?: string;
  maxLength?: number;
  editable?: boolean;
};

function RegistrationField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  colors,
  inputRef,
  keyboardType = "default",
  autoCapitalize = "none",
  autoComplete,
  textContentType,
  returnKeyType = "next",
  onSubmitEditing,
  accessibilityHint,
  maxLength,
  editable = true,
}: RegistrationFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label}
        <Text style={{ color: colors.red }}> *</Text>
      </Text>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderColor: focused
              ? colors.focus
              : colors.border,
            borderWidth: focused ? 1.5 : 1,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={focused ? colors.blue : colors.textMuted}
        />

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
          maxLength={maxLength}
          editable={editable}
          selectionColor={colors.focus}
          cursorColor={colors.focus}
          style={[
            styles.input,
            { color: colors.text },
          ]}
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint}
          onSubmitEditing={onSubmitEditing}
        />
      </View>
    </View>
  );
}

/* =========================================================
   RUNNER REGISTRATION
========================================================= */

export default function RunnerRegistrationScreen() {
  const {
    colors,
    mode,
    showOverlay,
  } = useRunnerTheme();

  const { height, width } = useWindowDimensions();

  const isDark = mode === "dark";
  const compact = height < 740;
  const narrow = width < 360;
  const wide = width >= 600;

  /* =======================================================
     FORM STATE
  ======================================================= */

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);

  /* =======================================================
     INPUT REFERENCES
  ======================================================= */

  const nameInputRef = useRef<TextInputInstance>(null);
const emailInputRef = useRef<TextInputInstance>(null);
const phoneInputRef = useRef<TextInputInstance>(null);

  /* =======================================================
     LIFECYCLE AND SUBMISSION PROTECTION
  ======================================================= */

  const mountedRef = useRef(true);
  const submittingRef = useRef(false);

  /* =======================================================
     ENTRANCE ANIMATION
  ======================================================= */

  const entrance = useRef(
    new Animated.Value(0),
  ).current;

  const normalizedName = normalizeFullName(fullName);
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();

  const validName =
    normalizedName.length >= 2 &&
    normalizedName.length <= 120;

  const validEmail = isValidEmail(normalizedEmail);

  const validPhone = isValidKenyanMobile(normalizedPhone);

  // Keep the action available so attempted invalid submissions
  // can receive feedback through the global overlay.
  const canSubmit = !submitting;

  /* =======================================================
     MOUNTED STATE
  ======================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      submittingRef.current = false;
    };
  }, []);

  /* =======================================================
     ENTRANCE ANIMATION
     Respects the device's reduced-motion preference.
  ======================================================= */

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!active) return;

        if (reduceMotion) {
          entrance.setValue(1);
          return;
        }

        Animated.timing(entrance, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        if (active) {
          entrance.setValue(1);
        }
      });

    return () => {
      active = false;
      entrance.stopAnimation();
    };
  }, [entrance]);

  /* =======================================================
     GLOBAL HELP
     The application-level overlay is mounted by the
     RunnerThemeProvider, not by this screen.
  ======================================================= */

  const handleHelp = useCallback(() => {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message:
        "Create a Runner account using your name, email address and phone number. We will verify your email before you continue with Runner setup. Already registered? Use Sign in instead.",
      primaryAction: {
        label: "Got it",
      },
    });
  }, [showOverlay]);

  /* =======================================================
     GLOBAL VALIDATION FEEDBACK
  ======================================================= */

  const validateForm = useCallback((): boolean => {
    if (!validName) {
      Keyboard.dismiss();

      showOverlay({
        type: "warning",
        title: "Check your name",
        message:
          "Enter your full name using at least two characters.",
        primaryAction: {
          label: "Got it",
        },
      });

      return false;
    }

    if (!validEmail) {
      Keyboard.dismiss();

      showOverlay({
        type: "warning",
        title: "Check your email",
        message:
          "Enter a valid email address before continuing.",
        primaryAction: {
          label: "Got it",
        },
      });

      return false;
    }

    if (!validPhone) {
      Keyboard.dismiss();

      showOverlay({
        type: "warning",
        title: "Check your phone number",
        message:
          "Enter a valid Kenyan mobile number, such as 0712 345 678.",
        primaryAction: {
          label: "Got it",
        },
      });

      return false;
    }

    return true;
  }, [
    validName,
    validEmail,
    validPhone,
    showOverlay,
  ]);

  /* =======================================================
     REGISTRATION SUBMISSION

     Uses the existing Runner registration OTP API.
     Does not create or modify a Customer account.
  ======================================================= */

  const submitRegistration = useCallback(async () => {
    if (submittingRef.current) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    submittingRef.current = true;

    setSubmitting(true);

    Keyboard.dismiss();

    try {
      const result = await requestRunnerRegistrationOtp({
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (
        !result?.ok ||
        result.purpose !== "register" ||
        !result.challengeId?.trim() ||
        !result.destination?.trim()
      ) {
        throw new Error(
          "The registration verification request was not confirmed. Please try again.",
        );
      }

      if (!mountedRef.current) {
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: {
          challengeId: result.challengeId,
          destination: result.destination,
          purpose: "register",
          fullName: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
        },
      });
    } catch (cause) {
      if (!mountedRef.current) {
        return;
      }

      const message =
        cause instanceof Error
          ? cause.message
          : "Registration could not be started. Please try again.";

      showOverlay({
        type: "error",
        title: "Registration could not start",
        message,
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      submittingRef.current = false;

      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [
    validateForm,
    normalizedName,
    normalizedEmail,
    normalizedPhone,
    showOverlay,
  ]);

  /* =======================================================
     ANIMATION VALUES
  ======================================================= */

  const entranceTranslateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
      <StatusBar
  style={mode === "dark" ? "light" : "dark"}
  hidden={false}
/>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        enabled={Platform.OS === "ios"}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: wide ? 36 : narrow ? 20 : 24,
              paddingTop: compact ? 7 : 13,
              paddingBottom: compact ? 22 : 30,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: entrance,
                transform: [
                  { translateY: entranceTranslateY },
                ],
              },
            ]}
          >
            {/* =================================================
                BRAND HEADER
                Compact transparent logo on the left.
                Help control on the right.
            ================================================= */}

            <View style={styles.header}>
              <Image
                source={WORDMARK}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="SaMi"
                style={[
                  styles.wordmark,
                  narrow && styles.wordmarkNarrow,
                ]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Help"
                accessibilityHint="Opens general SaMi Runner registration help"
                onPress={handleHelp}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.helpButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={19}
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

            {/* =================================================
                INTRODUCTION
            ================================================= */}

            <View
              style={[
                styles.intro,
                { gap: compact ? 9 : 12 },
              ]}
            >
              <View
                style={[
                  styles.eyebrowContainer,
                  {
                    backgroundColor: colors.blueSoft,
                  },
                ]}
              >
                <View
                  style={[
                    styles.eyebrowDot,
                    {
                      backgroundColor: colors.blue,
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.eyebrow,
                    { color: colors.blue },
                  ]}
                >
                  RUNNER REGISTRATION
                </Text>
              </View>

              <Text
                accessibilityRole="header"
                style={[
                  styles.title,
                  {
                    color: colors.text,
                    fontSize: compact ? 28 : 32,
                    lineHeight: compact ? 35 : 40,
                  },
                ]}
              >
                Create your{"\n"}Runner account.
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Start with your contact details. We will
                verify your email before you continue
                with Runner setup.
              </Text>
            </View>

            {/* =================================================
                REGISTRATION FORM
            ================================================= */}

            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.form,
                  { gap: compact ? 16 : 20 },
                ]}
              >
                {/* FULL NAME */}

                <RegistrationField
                  label="Full name"
                  icon="person-outline"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  colors={colors}
                  inputRef={nameInputRef}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={120}
                  editable={!submitting}
                  accessibilityHint="Enter your first and last name"
                  onSubmitEditing={() =>
                    emailInputRef.current?.focus()
                  }
                />

                {/* EMAIL ADDRESS */}

                <RegistrationField
                  label="Email address"
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  colors={colors}
                  inputRef={emailInputRef}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  maxLength={254}
                  editable={!submitting}
                  accessibilityHint="Enter the email address where your verification code will be sent"
                  onSubmitEditing={() =>
                    phoneInputRef.current?.focus()
                  }
                />

                <Text
                  style={[
                    styles.fieldHint,
                    { color: colors.textMuted },
                  ]}
                >
                  Your email will be verified with a
                  one-time code.
                </Text>

                {/* PHONE NUMBER */}

                <RegistrationField
                  label="Phone number"
                  icon="call-outline"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+254 712 345 678"
                  colors={colors}
                  inputRef={phoneInputRef}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  maxLength={24}
                  editable={!submitting}
                  accessibilityHint="Enter a Kenyan mobile number"
                  onSubmitEditing={() =>
                    void submitRegistration()
                  }
                />

                <Text
                  style={[
                    styles.fieldHint,
                    { color: colors.textMuted },
                  ]}
                >
                  Use a Kenyan mobile number. You can enter
                  0712 345 678 or +254 712 345 678.
                </Text>
              </View>

              {/* =================================================
                  SUBMIT
              ================================================= */}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue to email verification"
                accessibilityHint="Validates your details and sends an email verification code"
                accessibilityState={{
                  disabled: !canSubmit,
                  busy: submitting,
                }}
                disabled={!canSubmit}
                onPress={() => void submitRegistration()}
                hitSlop={3}
                style={({ pressed }) => [
                  styles.submitButton,
                  {
                    backgroundColor: colors.blueAction,
                  },
                  !canSubmit && styles.disabled,
                  pressed && canSubmit && styles.pressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator
                    color={colors.onBlue}
                  />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.submitButtonText,
                        { color: colors.onBlue },
                      ]}
                    >
                      Continue to verification
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color={colors.onBlue}
                    />
                  </>
                )}
              </Pressable>

              {/* =================================================
                  EXISTING RUNNER ACCOUNT
              ================================================= */}

              <View style={styles.signInRow}>
                <Text
                  style={[
                    styles.signInPrompt,
                    { color: colors.textMuted },
                  ]}
                >
                  Already have a Runner account?
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in"
                  disabled={submitting}
                  hitSlop={8}
                  onPress={() =>
                    router.replace("/(auth)/login")
                  }
                >
                  <Text
                    style={[
                      styles.signInLink,
                      { color: colors.blue },
                    ]}
                  >
                    Sign in
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* =================================================
                ONBOARDING INFORMATION
            ================================================= */}

            <View style={styles.footerInformation}>
              <View
                style={[
                  styles.footerIcon,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color={colors.blue}
                />
              </View>

              <Text
                style={[
                  styles.footerNote,
                  { color: colors.textMuted },
                ]}
              >
                After email verification, choose your Runner
                service: Pick Up & Deliver or Shop & Deliver.
                Then complete your transport details and
                required documents.
              </Text>
            </View>

            {/* =================================================
                BRAND FOOTER
            ================================================= */}

            <Text
              style={[
                styles.brandFooter,
                { color: colors.muted },
              ]}
            >
              SaMi Runner · Consider it done.
            </Text>
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

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },

  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 25,
  },

  /* HEADER */

  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  wordmark: {
    width: 112,
    height: 43,
  },

  wordmarkNarrow: {
    width: 100,
    height: 40,
  },

  helpButton: {
    minHeight: 41,
    paddingHorizontal: 13,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  helpText: {
    fontSize: 13,
    fontWeight: "700",
  },

  /* INTRODUCTION */

  intro: {
    alignItems: "flex-start",
  },

  eyebrowContainer: {
    minHeight: 28,
    paddingHorizontal: 11,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  title: {
    fontWeight: "900",
    letterSpacing: -0.9,
  },

  subtitle: {
    maxWidth: 380,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
  },

  /* FORM CARD */

  formCard: {
    width: "100%",
    padding: 21,
    borderWidth: 1,
    borderRadius: 23,
    gap: 20,
  },

  form: {
    width: "100%",
  },

  fieldGroup: {
    gap: 8,
  },

  label: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  inputContainer: {
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 12,
  },

  input: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "500",
  },

  fieldHint: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: -11,
    marginBottom: 1,
  },

  /* PRIMARY ACTION */

  submitButton: {
    minHeight: 57,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },

  submitButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.48,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },

  /* SIGN-IN LINK */

  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  signInPrompt: {
    fontSize: 12,
  },

  signInLink: {
    fontSize: 12,
    fontWeight: "900",
  },

  /* FOOTER INFORMATION */

  footerInformation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 3,
  },

  footerIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  footerNote: {
    flex: 1,
    fontSize: 11,
    lineHeight: 18,
  },

  brandFooter: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.25,
    marginTop: -8,
    paddingBottom: 4,
  },
});
