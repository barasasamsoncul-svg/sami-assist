import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { requestRunnerOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

const BACK_SIZE = 44;

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
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const scrollOffsetRef = useRef(0);
  const mountedRef = useRef(true);

  const scrollEmailIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      const input = emailInputRef.current;
      const scroll = scrollRef.current;
      if (!input || !scroll) return;

      input.measureInWindow((_x, inputY) => {
        scroll.measureInWindow((_scrollX, scrollY) => {
          const distanceFromViewportTop = inputY - scrollY;
          const targetY =
            scrollOffsetRef.current + distanceFromViewportTop - 28;

          scroll.scrollTo({
            y: Math.max(0, targetY),
            animated: true,
          });
        });
      });
    });
  }, []);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      scrollEmailIntoView();
    });

    return () => subscription.remove();
  }, [scrollEmailIntoView]);

  useEffect(() => {
    if (!error) return;
    scrollEmailIntoView();
  }, [error, scrollEmailIntoView]);

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

      if (!mountedRef.current) return;

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
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't send your verification code. Please try again.",
      );
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
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

  const inputBorderColor = error
    ? colors.red
    : inputFocused
      ? colors.blue
      : colors.border;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.main}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
                disabled={busy}
                onPress={goToWelcome}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.6 : busy ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
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
              <View
                style={[
                  styles.logoMark,
                  { backgroundColor: colors.navy },
                ]}
              >
                <Ionicons name="bicycle" size={30} color="#FFFFFF" />
              </View>

              <Text
                style={[styles.brandName, { color: colors.navy }]}
              >
                SaMi{" "}
                <Text style={{ color: colors.blue }}>Runner</Text>
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
                  style={[styles.eyebrow, { color: colors.blue }]}
                >
                  WELCOME BACK
                </Text>
              </View>

              <Text style={[styles.title, { color: colors.text }]}>
                Sign in to your{"\n"}Runner account.
              </Text>

              <Text
                style={[styles.subtitle, { color: colors.textMuted }]}
              >
                Continue with the email address you used to register.
                We'll send you a secure code to verify your identity.
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
                  style={[styles.formTitle, { color: colors.text }]}
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
                    borderColor: inputBorderColor,
                  },
                  inputFocused &&
                    Platform.select({
                      ios: {
                        shadowColor: colors.blue,
                        shadowOpacity: 0.16,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                      },
                      android: { elevation: 1 },
                      default: {},
                    }),
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={inputFocused ? colors.blue : colors.textMuted}
                />

                <TextInput
                  ref={emailInputRef}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error) setError("");
                  }}
                  onFocus={() => {
                    setInputFocused(true);
                    scrollEmailIntoView();
                  }}
                  onBlur={() => setInputFocused(false)}
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
                  cursorColor={colors.blue}
                  style={[styles.input, { color: colors.text }]}
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
                    hitSlop={10}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.55 : busy ? 0.5 : 1,
                    })}
                  >
                    <Ionicons
                      name="close-circle"
                      size={19}
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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  busy ? "Sending verification code" : "Continue with email"
                }
                accessibilityHint="Sends a six-digit verification code to your email address"
                accessibilityState={{ busy, disabled: busy }}
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
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.primaryButtonText}>
                      Sending verification code…
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
                style={[styles.infoText, { color: colors.text }]}
              >
                Already registered but haven't completed your
                application? Sign in using the same email to continue
                where you left off or check your application status.
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
                accessibilityLabel="Create a Runner account"
                disabled={busy}
                onPress={openRegistration}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.registerButton,
                  { opacity: pressed ? 0.6 : busy ? 0.5 : 1 },
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
                SaMi Runner uses a separate account from SaMi Customer.
              </Text>
            </View>
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

  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 26,
  },

  main: { gap: 22 },

  topBar: {
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

  topBarLabel: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  topBarSpacer: { width: BACK_SIZE },

  brand: {
    alignItems: "center",
    gap: 7,
    paddingTop: 1,
  },

  logoMark: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  brandName: {
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.8,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.3,
  },

  intro: { gap: 11 },

  eyebrowWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 30,
  },

  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
    maxWidth: 330,
  },

  formCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },

  formHeading: { gap: 5 },

  formTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  formDescription: {
    fontSize: 12,
    lineHeight: 17,
  },

  emailInput: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 14,
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

  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  securityText: {
    fontSize: 11.5,
    fontWeight: "600",
    lineHeight: 16,
  },

  infoCard: {
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  footer: {
    marginTop: "auto",
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
    fontSize: 13,
  },

  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
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
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    flexShrink: 1,
  },

  disabled: { opacity: 0.6 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});