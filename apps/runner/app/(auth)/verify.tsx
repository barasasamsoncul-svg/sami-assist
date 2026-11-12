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

import { router, useLocalSearchParams } from "expo-router";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  requestRunnerOtp,
  requestRunnerRegistrationOtp,
  saveRunnerSession,
  verifyRunnerOtp,
} from "@/api";

import { useRunnerTheme } from "@/theme";

const OTP_RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;
const CODE_AUTOSUBMIT_DELAY_MS = 180;
const SUCCESS_FLASH_MS = 280;
const BACK_SIZE = 44;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function VerifyRunnerScreen() {
  const { colors, mode } = useRunnerTheme();
  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const params = useLocalSearchParams<{
    challengeId?: string | string[];
    destination?: string | string[];
    purpose?: string | string[];
    fullName?: string | string[];
    email?: string | string[];
    phone?: string | string[];
  }>();

  const firstParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";

  const initialChallengeId = firstParam(params.challengeId).trim();
  const initialDestination =
    firstParam(params.destination) || "your email address";
  const purpose = firstParam(params.purpose);
  const isRegistration = purpose === "register";

  const fullName = firstParam(params.fullName).trim();
  const email = firstParam(params.email).trim().toLowerCase();
  const phone = firstParam(params.phone).trim();

  const [challengeId, setChallengeId] = useState(initialChallengeId);
  const [destination, setDestination] = useState(initialDestination);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [inputFocused, setInputFocused] = useState(false);

  const [resendAvailableAt, setResendAvailableAt] = useState(
    () =>
      initialChallengeId
        ? Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000
        : Date.now(),
  );
  const [resendCountdown, setResendCountdown] = useState(
    initialChallengeId ? OTP_RESEND_COOLDOWN_SECONDS : 0,
  );

  const codeInputRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);
  const verificationInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);
  // Tracks automatic submissions only. Manual retries remain available after
  // transient network/server errors without creating an auto-submit loop.
  const autoSubmittedCodeRef = useRef<string | null>(null);

  // Autofocus so the OS one-time-code autofill prompt can fire immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      codeInputRef.current?.focus();
    }, 380);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // React Strict Mode runs an effect setup/cleanup cycle in development.
    // Re-arm the mounted flag on every setup so async results are not ignored.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Background-safe countdown: recomputed from a target timestamp every 500ms.
  useEffect(() => {
    function tick() {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );
      setResendCountdown(remaining);
    }

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  async function verify() {
    if (
      verificationInFlightRef.current ||
      busy ||
      resending ||
      verified
    ) {
      return;
    }

    if (!challengeId) {
      setError("Your verification session is missing. Request a new code.");
      return;
    }

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the complete six-digit verification code.");
      return;
    }

    // The in-flight ref prevents duplicate requests. A completed failed
    // request can be retried manually because network failures do not prove
    // that the OTP itself was invalid.
    verificationInFlightRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      // POST /api/runner/auth/verify-otp validates the challenge and six-digit
      // code, consumes the challenge once, and creates a Runner session.
      const result = await verifyRunnerOtp(challengeId, code);

      if (
        !result?.ok ||
        typeof result.sessionToken !== "string" ||
        result.sessionToken.length < 40 ||
        !result.runner?.id
      ) {
        throw new Error(
          "The verification server did not return a complete Runner session. Request a new code and try again.",
        );
      }

      // The backend issues a 32-byte base64url token (43 characters).
      // saveRunnerSession validates and stores it in Expo SecureStore.
      await saveRunnerSession(result.sessionToken);

      if (!mountedRef.current) return;

      setVerified(true);
      await new Promise((resolve) =>
        setTimeout(resolve, SUCCESS_FLASH_MS),
      );

      if (!mountedRef.current) return;

      // Replace the OTP route. The root session gate reads the newly saved
      // token and resolves the user's actual onboarding/account state.
      router.replace("/");
    } catch (cause) {
      if (!mountedRef.current) return;

      setError(
        cause instanceof Error
          ? cause.message
          : "The verification code could not be verified.",
      );
    } finally {
      verificationInFlightRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  // Auto-submit each completed six-digit code once. Manual submission is
  // still allowed after a failed request, including a temporary network error.
  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    if (busy || resending || verified || !challengeId) return;

    const submissionKey = `${challengeId}:${code}`;
    if (autoSubmittedCodeRef.current === submissionKey) return;

    const timeout = setTimeout(() => {
      autoSubmittedCodeRef.current = submissionKey;
      void verify();
    }, CODE_AUTOSUBMIT_DELAY_MS);

    return () => clearTimeout(timeout);
    // verify intentionally uses the challenge/code from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, busy, resending, verified, challengeId]);

  async function resendCode() {
    if (
      resendInFlightRef.current ||
      verificationInFlightRef.current ||
      busy ||
      resending ||
      resendCountdown > 0 ||
      verified
    ) {
      return;
    }

    if (!email) {
      setError(
        "Your email address is missing. Go back and start again.",
      );
      return;
    }

    if (isRegistration && (!fullName || !phone)) {
      setError(
        "Your registration details are missing. Go back and complete registration again.",
      );
      return;
    }

    resendInFlightRef.current = true;
    setResending(true);
    setError("");
    setNotice("");

    try {
      const result = isRegistration
        ? await requestRunnerRegistrationOtp({
            fullName,
            email,
            phone,
          })
        : await requestRunnerOtp(email);

      if (
        !result?.ok ||
        (isRegistration && result.purpose !== "register") ||
        !result.challengeId ||
        !result.destination
      ) {
        throw new Error(
          "The server did not confirm a new verification challenge. Please try again.",
        );
      }

      if (!mountedRef.current) return;

      setChallengeId(result.challengeId);
      setDestination(result.destination);
      autoSubmittedCodeRef.current = null;
      setCode("");
      setResendAvailableAt(
        Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      );

      setNotice(
        result.message || "A new verification code has been sent.",
      );

      // Refocus the input so the user can retype immediately.
      setTimeout(() => codeInputRef.current?.focus(), 200);
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "A new verification code could not be sent.";

      // Mirror the server's resend throttles locally after a 429 so a tap
      // cannot immediately repeat a request the server has already refused.
      if (/maximum of five codes|hour/i.test(message)) {
        setResendAvailableAt(Date.now() + 60 * 60 * 1000);
      } else if (/please wait|too many verification requests|429/i.test(message)) {
        setResendAvailableAt(
          Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
        );
      }

      setError(message);
    } finally {
      if (mountedRef.current) {
        setResending(false);
      }
      resendInFlightRef.current = false;
    }
  }

  const resendLabel =
    resendCountdown > 0
      ? `Resend code in ${formatCountdown(resendCountdown)}`
      : challengeId
        ? "Resend code"
        : "Request a verification code";

  const disabled = busy || resending || verified;
  const verifyDisabled = disabled || !challengeId || code.length !== CODE_LENGTH;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={disabled}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace(
                  isRegistration ? "/(auth)/register" : "/(auth)/login",
                );
              }
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : disabled ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={colors.text}
            />
          </Pressable>

          <View style={styles.content}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name={
                  isRegistration
                    ? "person-add-outline"
                    : "mail-open-outline"
                }
                size={29}
                color={actionBlue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: actionBlue }]}>
              {isRegistration
                ? "REGISTRATION VERIFICATION"
                : "RUNNER SIGN IN"}
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              {isRegistration ? "Verify your email" : "Welcome back"}
            </Text>

            <Text
              style={[styles.subtitle, { color: supportingText }]}
            >
              {isRegistration
                ? "Enter the six-digit code we sent to "
                : "Enter the six-digit sign-in code sent to "}

              <Text style={[styles.destination, { color: colors.text }]}>
                {destination}
              </Text>
              .
            </Text>

            {isRegistration ? (
              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={actionBlue}
                />

                <Text
                  style={[styles.infoText, { color: colors.text }]}
                >
                  Verifying your email creates your Runner account.
                  Next, choose one service: Pick Up & Deliver or Shop & Deliver.
                  Then complete your transport details and required documents.
                </Text>
              </View>
            ) : null}

            {!challengeId ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.noticeContainer,
                  { backgroundColor: colors.warningSoft },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={colors.warning}
                />
                <Text style={[styles.notice, { color: colors.text }]}>
                  This screen has no active verification challenge. Request a new code below.
                </Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.text }]}>
              Verification code
            </Text>

            <TextInput
              ref={codeInputRef}
              value={code}
              onChangeText={(value) => {
                setCode(
                  value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH),
                );
                setError("");
                setNotice("");
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              editable={!disabled}
              selectionColor={colors.blue}
              cursorColor={colors.blue}
              onSubmitEditing={() => {
                if (
                  code.length === CODE_LENGTH &&
                  !busy &&
                  !resending &&
                  !verified
                ) {
                  void verify();
                }
              }}
              style={[
                styles.codeInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: verified
                    ? actionBlue
                    : inputFocused
                      ? actionBlue
                      : error
                        ? colors.red
                        : colors.border,
                  color: colors.text,
                },
                (inputFocused || verified) &&
                  Platform.select({
                    ios: {
                      shadowColor: actionBlue,
                      shadowOpacity: 0.2,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                    },
                    android: { elevation: 2 },
                    default: {},
                  }),
                disabled && !verified && styles.disabled,
              ]}
              accessibilityLabel="Six-digit verification code"
            />

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
                  size={18}
                  color={colors.red}
                />

                <Text style={[styles.error, { color: colors.red }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            {notice ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                  styles.noticeContainer,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={actionBlue}
                />

                <Text style={[styles.notice, { color: colors.text }]}>
                  {notice}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                verified
                  ? "Verified"
                  : isRegistration
                    ? "Verify and create account"
                    : "Verify and continue"
              }
              accessibilityHint="Submits your six-digit code"
              accessibilityState={{ busy, disabled: verifyDisabled }}
              disabled={verifyDisabled}
              onPress={() => void verify()}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: buttonBlue,
                },
                verifyDisabled && !verified && styles.disabled,
                pressed && !verifyDisabled && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : verified ? (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#FFFFFF"
                  />
                  <Text style={styles.primaryButtonText}>Verified</Text>
                </>
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {isRegistration
                      ? "Verify and create account"
                      : "Verify and continue"}
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resendLabel}
              disabled={
                busy || resending || verified || resendCountdown > 0
              }
              hitSlop={8}
              onPress={() => void resendCode()}
              style={({ pressed }) => [
                styles.resendButton,
                (busy ||
                  resending ||
                  verified ||
                  resendCountdown > 0) &&
                  styles.disabled,
                pressed &&
                  !busy &&
                  !resending &&
                  !verified &&
                  resendCountdown === 0 &&
                  styles.pressed,
              ]}
            >
              {resending ? (
                <ActivityIndicator size="small" color={actionBlue} />
              ) : (
                <Text
                  style={[styles.resendText, { color: actionBlue }]}
                >
                  {resendLabel}
                </Text>
              )}
            </Pressable>

            <Text
              style={[
                styles.resendHint,
                { color: supportingText },
              ]}
            >
              The server allows one request every 60 seconds and up to five codes per email per hour.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isRegistration
                  ? "Change registration details"
                  : "Use a different email address"
              }
              disabled={disabled}
              hitSlop={6}
              onPress={() =>
                router.replace(
                  isRegistration
                    ? "/(auth)/register"
                    : "/(auth)/login",
                )
              }
              style={({ pressed }) => [
                styles.changeEmailButton,
                { opacity: pressed ? 0.6 : disabled ? 0.5 : 1 },
              ]}
            >
              <Text
                style={[styles.changeEmailText, { color: actionBlue }]}
              >
                {isRegistration
                  ? "Change registration details"
                  : "Use a different email address"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardContainer: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },

  backButton: {
    height: BACK_SIZE,
    width: BACK_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
    paddingTop: 24,
    paddingBottom: 28,
  },

  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 34,
  },

  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
  },

  destination: {
    fontWeight: "800",
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 13,
    padding: 13,
    gap: 10,
  },

  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 6,
  },

  codeInput: {
    minHeight: 66,
    borderWidth: 1.5,
    borderRadius: 16,
    textAlign: "center",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 8,
    paddingLeft: 8,
    paddingVertical: 12,
    marginTop: 2,
  },

  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },

  error: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  noticeContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },

  notice: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 6,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  resendButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  resendText: {
    fontSize: 13,
    fontWeight: "900",
  },

  resendHint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: -8,
  },

  changeEmailButton: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 2,
  },

  changeEmailText: {
    fontSize: 13,
    fontWeight: "800",
  },

  disabled: {
    opacity: 0.55,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});