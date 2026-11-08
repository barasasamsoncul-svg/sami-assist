import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { requestRunnerOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export default function RunnerLoginScreen() {
  const { colors } = useRunnerTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function continueWithEmail() {
    if (busy) return;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setError("Enter the email address associated with your Runner account.");
      emailInputRef.current?.focus();
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address, for example you@example.com.");
      emailInputRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    setBusy(true);
    setError("");

    try {
      const result = await requestRunnerOtp(normalizedEmail);

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
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't send your verification code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openRegistration() {
    if (busy) return;
    Keyboard.dismiss();
    router.push("/(auth)/register");
  }

  function goToWelcome() {
    if (busy) return;
    Keyboard.dismiss();
    router.replace("/");
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.main}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
                disabled={busy}
                onPress={goToWelcome}
                hitSlop={10}
                style={[
                  styles.backButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  busy && styles.disabled,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={21}
                  color={colors.text}
                />
              </Pressable>

              <Text
                style={[
                  styles.topBarLabel,
                  { color: colors.textMuted },
                ]}
              >
                RUNNER ACCOUNT
              </Text>

              <View style={styles.topBarSpacer} />
            </View>

            <View style={styles.brand}>
              <View style={styles.logoMark}>
                <Ionicons
                  name="bicycle"
                  size={30}
                  color="#FFFFFF"
                />
              </View>

              <Text style={styles.brandName}>
                SaMi <Text style={styles.brandAccent}>Runner</Text>
              </Text>

              <Text style={styles.brandTagline}>
                CONSIDER IT DONE
              </Text>
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
                style={[
                  styles.title,
                  { color: colors.text },
                ]}
              >
                Sign in to your{"\n"}Runner account.
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textMuted },
                ]}
              >
                Continue with the email address you used
                to register. We'll send you a secure code
                to verify your identity.
              </Text>
            </View>

            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.formHeading}>
                <Text
                  style={[
                    styles.formTitle,
                    { color: colors.text },
                  ]}
                >
                  Your email address
                </Text>

                <Text
                  style={[
                    styles.formDescription,
                    { color: colors.textMuted },
                  ]}
                >
                  Enter your registered email.
                </Text>
              </View>

              <View
                style={[
                  styles.emailInput,
                  {
                    backgroundColor: colors.paper,
                    borderColor: error
                      ? colors.red
                      : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={colors.textMuted}
                />

                <TextInput
                  ref={emailInputRef}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error) setError("");
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={() => void continueWithEmail()}
                  maxLength={254}
                  editable={!busy}
                  selectionColor={colors.blue}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Runner email address"
                  accessibilityHint="Enter the email address associated with your Runner account."
                />

                {email.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear email address"
                    disabled={busy}
                    onPress={() => {
                      setEmail("");
                      setError("");
                      emailInputRef.current?.focus();
                    }}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={19}
                      color={colors.muted}
                    />
                  </Pressable>
                ) : null}
              </View>

              {error ? (
                <View
                  accessibilityRole="alert"
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
                accessibilityLabel="Continue with email"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void continueWithEmail()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.blue },
                  pressed && !busy && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                {busy ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      Sending verification code...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      Continue with email
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              <View style={styles.securityNote}>
                <Ionicons
                  name="lock-closed-outline"
                  size={15}
                  color={colors.success}
                />
                <Text
                  style={[
                    styles.securityText,
                    { color: colors.textMuted },
                  ]}
                >
                  Secure sign-in. No password required.
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.blue}
              />

              <Text
                style={[
                  styles.infoText,
                  { color: colors.text },
                ]}
              >
                Already registered but haven't completed
                your application? Sign in using the same
                email to continue where you left off or
                check your application status.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.registerPrompt}>
              <Text
                style={[
                  styles.footerText,
                  { color: colors.textMuted },
                ]}
              >
                New to SaMi Runner?
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={openRegistration}
                hitSlop={8}
                style={styles.registerButton}
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
                name="shield-checkmark-outline"
                size={15}
                color={colors.textMuted}
              />

              <Text
                style={[
                  styles.footerSecurityText,
                  { color: colors.textMuted },
                ]}
              >
                SaMi Runner uses a separate account from
                SaMi Customer.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
    paddingHorizontal: 23,
    paddingTop: 10,
    paddingBottom: 24,
    justifyContent: "space-between",
    gap: 30,
  },

  main: {
    gap: 27,
  },

  topBar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  topBarLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  topBarSpacer: {
    width: 40,
  },

  brand: {
    alignItems: "center",
    gap: 7,
    paddingTop: 1,
  },

  logoMark: {
    width: 59,
    height: 59,
    borderRadius: 19,
    backgroundColor: "#000535",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  brandName: {
    color: "#000535",
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },

  brandAccent: {
    color: "#2769C7",
  },

  brandTagline: {
    color: "#74839A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.3,
  },

  intro: {
    gap: 11,
  },

  eyebrowWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 30,
  },

  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  eyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "900",
    letterSpacing: -1,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 21,
    maxWidth: 330,
  },

  formCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 17,
    gap: 15,
  },

  formHeading: {
    gap: 5,
  },

  formTitle: {
    fontSize: 14,
    fontWeight: "900",
  },

  formDescription: {
    fontSize: 11,
    lineHeight: 17,
  },

  emailInput: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    minHeight: 54,
    paddingVertical: 9,
    fontSize: 14,
  },

  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 11,
    padding: 11,
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  primaryButton: {
    minHeight: 53,
    borderRadius: 13,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  securityText: {
    fontSize: 10,
    fontWeight: "600",
  },

  infoCard: {
    padding: 13,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  infoText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 16,
  },

  footer: {
    gap: 18,
  },

  registerPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  footerText: {
    fontSize: 11,
  },

  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
  },

  registerText: {
    fontSize: 11,
    fontWeight: "900",
  },

  footerSecurity: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  footerSecurityText: {
    fontSize: 9,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.65,
  },

  pressed: {
    opacity: 0.85,
  },
});