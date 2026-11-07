
import { useState } from "react";

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
  saveRunnerSession,
  verifyRunnerOtp,
  type RunnerOtpPurpose,
} from "@/api";

import { useRunnerTheme } from "@/theme";

export default function VerifyRunnerScreen() {
  const { colors } = useRunnerTheme();

  const params = useLocalSearchParams<{
    challengeId?: string;
    destination?: string;
    purpose?: string;
  }>();

  const challengeId = String(
    params.challengeId || "",
  );

  const destination = String(
    params.destination || "your email address",
  );

  const purpose: RunnerOtpPurpose =
    params.purpose === "register" ? "register" : "login";

  const isRegistration = purpose === "register";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (!challengeId) {
      setError(
        "Your verification session is missing. Start again.",
      );
      return;
    }

    if (!/^[0-9]{6}$/.test(code)) {
      setError(
        "Enter the complete six-digit verification code.",
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await verifyRunnerOtp(
        challengeId,
        code,
      );

      await saveRunnerSession(result.sessionToken);

      // Only an Operations-approved Runner can enter the
      // operational app. Profile completeness is not approval.
      switch (result.nextStep) {
        case "app":
          router.replace("/(app)");
          break;

        case "status":
          router.replace({
            pathname: "/(app)/profile-setup",
            params: { mode: "status" },
          });
          break;

        case "onboarding":
        default:
          router.replace({
            pathname: "/(app)/profile-setup",
            params: { mode: "onboarding" },
          });
          break;
      }
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
        behavior={
          Platform.OS === "ios" ? "padding" : "height"
        }
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
            disabled={busy}
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
              style={[
                styles.eyebrow,
                { color: colors.blue },
              ]}
            >
              {isRegistration
                ? "REGISTRATION VERIFICATION"
                : "RUNNER SIGN IN"}
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              {isRegistration
                ? "Verify your email"
                : "Welcome back"}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted },
              ]}
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
                  style={[
                    styles.infoText,
                    { color: colors.text },
                  ]}
                >
                  Verifying your email creates your
                  Runner account. You will then complete
                  your category-specific onboarding and
                  document verification.
                </Text>
              </View>
            ) : null}

            <Text
              style={[
                styles.label,
                { color: colors.text },
              ]}
            >
              Verification code
            </Text>

            <TextInput
              value={code}
              onChangeText={(value) => {
                setCode(
                  value
                    .replace(/[^0-9]/g, "")
                    .slice(0, 6),
                );
                setError("");
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (code.length === 6 && !busy) {
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
                  style={[
                    styles.error,
                    { color: colors.red },
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void verify()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                busy && styles.disabled,
                pressed && !busy && styles.pressed,
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
              disabled={busy}
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
