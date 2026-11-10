import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestRunnerRegistrationOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

const BACK_SIZE = 44;

export default function RunnerRegistrationScreen() {
  const { colors } = useRunnerTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<
    "name" | "email" | "phone" | null
  >(null);

  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();

  const validName =
    normalizedName.length >= 2 && normalizedName.length <= 120;

  const validEmail =
    normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const validPhone = normalizedPhone.length >= 9;

  const canSubmit =
    validName && validEmail && validPhone && !submitting;

  function glow(focused: boolean) {
    if (!focused) return {};
    return Platform.select({
      ios: {
        shadowColor: colors.blue,
        shadowOpacity: 0.16,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1 },
      default: {},
    });
  }

  async function submitRegistration() {
    if (submitting) return;

    setError("");

    if (!validName) {
      setError("Enter your full name.");
      nameRef.current?.focus();
      return;
    }

    if (!validEmail) {
      setError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }

    if (!validPhone) {
      setError("Enter your mobile phone number.");
      phoneRef.current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const result = await requestRunnerRegistrationOtp({
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (!mountedRef.current) return;

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
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration could not be started. Please try again.",
      );
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  const isDarkPaper = colors.paper === "#080F1D";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              disabled={submitting}
              onPress={() => router.back()}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.6 : submitting ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={colors.text}
              />
            </Pressable>

            <View style={styles.brand}>
              <Text
                style={[styles.brandName, { color: colors.navy }]}
              >
                SaMi <Text style={{ color: colors.blue }}>Runner</Text>
              </Text>

              <Text
                style={[
                  styles.brandTagline,
                  { color: colors.textMuted },
                ]}
              >
                CONSIDER IT DONE
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          {/* Intro */}
          <View style={styles.intro}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="person-add-outline"
                size={27}
                color={colors.blue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: colors.blue }]}>
              BECOME A SAMI RUNNER
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Create your account.
            </Text>

            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
            >
              Enter your details below to get started. We will verify
              your email before moving you to the next registration
              step.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Full name
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      focusedField === "name"
                        ? colors.blue
                        : colors.border,
                  },
                  glow(focusedField === "name"),
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={
                    focusedField === "name"
                      ? colors.blue
                      : colors.textMuted
                  }
                />

                <TextInput
                  ref={nameRef}
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setError("");
                  }}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  blurOnSubmit={false}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={120}
                  editable={!submitting}
                  selectionColor={colors.blue}
                  cursorColor={colors.blue}
                  style={[styles.input, { color: colors.text }]}
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Email address
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      focusedField === "email"
                        ? colors.blue
                        : colors.border,
                  },
                  glow(focusedField === "email"),
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={
                    focusedField === "email"
                      ? colors.blue
                      : colors.textMuted
                  }
                />

                <TextInput
                  ref={emailRef}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError("");
                  }}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  blurOnSubmit={false}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  maxLength={254}
                  editable={!submitting}
                  selectionColor={colors.blue}
                  cursorColor={colors.blue}
                  style={[styles.input, { color: colors.text }]}
                  accessibilityLabel="Email address"
                />
              </View>

              <Text
                style={[
                  styles.fieldHint,
                  { color: colors.textMuted },
                ]}
              >
                Your email will receive the verification code.
              </Text>
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Phone number
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      focusedField === "phone"
                        ? colors.blue
                        : colors.border,
                  },
                  glow(focusedField === "phone"),
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={19}
                  color={
                    focusedField === "phone"
                      ? colors.blue
                      : colors.textMuted
                  }
                />

                <TextInput
                  ref={phoneRef}
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setError("");
                  }}
                  onFocus={() => setFocusedField("phone")}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={() => {
                    if (canSubmit) void submitRegistration();
                  }}
                  placeholder="+254 712 345 678"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  maxLength={24}
                  editable={!submitting}
                  selectionColor={colors.blue}
                  cursorColor={colors.blue}
                  style={[styles.input, { color: colors.text }]}
                  accessibilityLabel="Phone number"
                />
              </View>

              <Text
                style={[
                  styles.fieldHint,
                  { color: colors.textMuted },
                ]}
              >
                Use a Kenyan mobile number. You can enter it with or
                without the +254 prefix.
              </Text>
            </View>
          </View>

          {/* Error */}
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
                name="alert-circle-outline"
                size={19}
                color={colors.red}
              />

              <Text
                style={[styles.errorText, { color: colors.red }]}
              >
                {error}
              </Text>
            </View>
          ) : null}

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit registration"
              accessibilityHint="Sends a verification code to your email address"
              accessibilityState={{ busy: submitting, disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={() => void submitRegistration()}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.blue },
                !canSubmit && styles.disabled,
                pressed && canSubmit && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Submit</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>

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
                accessibilityLabel="Sign in to an existing Runner account"
                disabled={submitting}
                hitSlop={10}
                onPress={() => router.replace("/(auth)/login")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : submitting ? 0.5 : 1,
                })}
              >
                <Text
                  style={[styles.signInLink, { color: colors.blue }]}
                >
                  Sign in
                </Text>
              </Pressable>
            </View>

            <Text
              style={[
                styles.footerNote,
                { color: colors.textMuted },
              ]}
            >
              Your details are used to create and manage your SaMi
              Runner account. Task selection and verification documents
              are completed in separate steps.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardContainer: { flex: 1 },
  scroll: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 22,
  },

  // Header
  header: {
    minHeight: BACK_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    alignItems: "center",
    gap: 3,
  },

  brandName: {
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: { width: BACK_SIZE },

  // Intro
  intro: { gap: 10 },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
    maxWidth: 340,
  },

  // Form
  form: { gap: 22 },

  fieldGroup: { gap: 9 },

  label: {
    fontSize: 13,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 10,
    fontSize: 15,
  },

  fieldHint: {
    fontSize: 11.5,
    lineHeight: 17,
  },

  // Error
  errorContainer: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  // Footer
  footer: {
    gap: 17,
    paddingTop: 2,
  },

  submitButton: {
    minHeight: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  signInPrompt: {
    fontSize: 13,
  },

  signInLink: {
    fontSize: 13,
    fontWeight: "900",
  },

  footerNote: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  disabled: { opacity: 0.45 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});