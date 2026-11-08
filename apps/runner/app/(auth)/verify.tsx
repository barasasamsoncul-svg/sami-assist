import { useEffect, useState } from "react";

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

import {
  router,
  useLocalSearchParams,
} from "expo-router";

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

export default function VerifyRunnerScreen() {
  const { colors } = useRunnerTheme();

  const params = useLocalSearchParams<{
    challengeId?: string;
    destination?: string;
    purpose?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  }>();

  const initialChallengeId = String(params.challengeId || "");

  const initialDestination = String(
    params.destination || "your email address",
  );

  const isRegistration = params.purpose === "register";

  const fullName = String(params.fullName || "").trim();
  const email = String(params.email || "").trim().toLowerCase();
  const phone = String(params.phone || "").trim();

  const [challengeId, setChallengeId] = useState(
    initialChallengeId,
  );

  const [destination, setDestination] = useState(
    initialDestination,
  );

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [resendCountdown, setResendCountdown] = useState(
    OTP_RESEND_COOLDOWN_SECONDS,
  );

  useEffect(() => {
    if (resendCountdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setResendCountdown((remaining) =>
        Math.max(0, remaining - 1),
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCountdown]);

  async function verify() {
    if (busy || resending) {
      return;
    }

    if (!challengeId) {
      setError("Your verification session is missing. Start again.");
      return;
    }

    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the complete six-digit verification code.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await verifyRunnerOtp(challengeId, code);

      if (!result.sessionToken) {
        throw new Error(
          "The verification server did not return a valid session.",
        );
      }

      await saveRunnerSession(result.sessionToken);

      // Clear the authentication navigation history.
      // The saved session remains intact.
      router.dismissAll();

      // The startup resolver checks the server and sends the
      // Runner to the correct onboarding step, status screen
      // or approved Runner dashboard.
      router.replace("/");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The verification code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (
      busy ||
      resending ||
      resendCountdown > 0
    ) {
      return;
    }

    if (!email) {
      setError(
        "Your email address is missing. Go back and start again.",
      );
      return;
    }

    if (
      isRegistration &&
      (!fullName || !phone)
    ) {
      setError(
        "Your registration details are missing. Go back and complete registration again.",
      );
      return;
    }

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

      if (!result.challengeId) {
        throw new Error(
          "A new verification session could not be created.",
        );
      }

      setChallengeId(result.challengeId);

      if (result.destination) {
        setDestination(result.destination);
      }

      setCode("");
      setResendCountdown(OTP_RESEND_COOLDOWN_SECONDS);

      setNotice(
        result.message || "A new verification code has been sent.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A new verification code could not be sent.",
      );
    } finally {
      setResending(false);
    }
  }

  const resendLabel =
    resendCountdown > 0
      ? `Resend code in 00:${String(
          resendCountdown,
        ).padStart(2, "0")}`
      : "Resend code";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
      <StatusBar
        barStyle={
          colors.paper === "#080F1D"
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={busy || resending}
            onPress={() => router.back()}
            style={styles.backButton}
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
                color={colors.blue}
              />
            </View>

            <Text
              style={[styles.eyebrow, { color: colors.blue }]}
            >
              {isRegistration
                ? "REGISTRATION VERIFICATION"
                : "RUNNER SIGN IN"}
            </Text>

            <Text
              style={[styles.title, { color: colors.text }]}
            >
              {isRegistration
                ? "Verify your email"
                : "Welcome back"}
            </Text>

            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
            >
              {isRegistration
                ? "Enter the six-digit code we sent to "
                : "Enter the six-digit sign-in code sent to "}

              <Text
                style={[
                  styles.destination,
                  { color: colors.text },
                ]}
              >
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
                  color={colors.blue}
                />

                <Text
                  style={[styles.infoText, { color: colors.text }]}
                >
                  Verifying your email creates your Runner account.
                  You will then complete your task selection,
                  transport details and document verification.
                </Text>
              </View>
            ) : null}

            <Text
              style={[styles.label, { color: colors.text }]}
            >
              Verification code
            </Text>

            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(
                  value.replace(/[^0-9]/g, "").slice(0, 6),
                );
                setError("");
                setNotice("");
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              editable={!busy && !resending}
              onSubmitEditing={() => {
                if (code.length === 6 && !busy && !resending) {
                  void verify();
                }
              }}
              style={[
                styles.codeInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
                (busy || resending) && styles.disabled,
              ]}
              accessibilityLabel="Six digit email verification code"
            />

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
                  size={18}
                  color={colors.red}
                />

                <Text
                  style={[styles.error, { color: colors.red }]}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {notice ? (
              <View
                style={[
                  styles.noticeContainer,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={colors.blue}
                />

                <Text
                  style={[styles.notice, { color: colors.text }]}
                >
                  {notice}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy || resending}
              onPress={() => void verify()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                (busy || resending) && styles.disabled,
                pressed &&
                  !busy &&
                  !resending &&
                  styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
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
                busy ||
                resending ||
                resendCountdown > 0
              }
              onPress={() => void resendCode()}
              style={({ pressed }) => [
                styles.resendButton,
                (busy ||
                  resending ||
                  resendCountdown > 0) &&
                  styles.disabled,
                pressed &&
                  !busy &&
                  !resending &&
                  resendCountdown === 0 &&
                  styles.pressed,
              ]}
            >
              {resending ? (
                <ActivityIndicator
                  size="small"
                  color={colors.blue}
                />
              ) : (
                <Text
                  style={[
                    styles.resendText,
                    { color: colors.blue },
                  ]}
                >
                  {resendLabel}
                </Text>
              )}
            </Pressable>

            <Text
              style={[
                styles.resendHint,
                { color: colors.textMuted },
              ]}
            >
              You can request up to five codes per hour.
            </Text>

            <Pressable
              accessibilityRole="button"
              disabled={busy || resending}
              onPress={() =>
                router.replace(
                  isRegistration
                    ? "/(auth)/register"
                    : "/(auth)/login",
                )
              }
              style={styles.changeEmailButton}
            >
              <Text
                style={[
                  styles.changeEmailText,
                  { color: colors.blue },
                ]}
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
  safeArea: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  backButton: {
    height: 42,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
    paddingTop: 30,
    paddingBottom: 30,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 21,
  },
  destination: {
    fontWeight: "800",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 13,
    padding: 12,
    gap: 9,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  codeInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 15,
    textAlign: "center",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 9,
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 9,
  },
  error: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  noticeContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    gap: 9,
  },
  notice: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 55,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  resendButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  resendText: {
    fontSize: 12,
    fontWeight: "900",
  },
  resendHint: {
    fontSize: 10,
    textAlign: "center",
    marginTop: -12,
  },
  changeEmailButton: {
    alignItems: "center",
    padding: 12,
  },
  changeEmailText: {
    fontSize: 12,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.82,
  },
});