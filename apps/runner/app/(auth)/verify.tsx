
import { useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import {
  saveRunnerSession,
  verifyRunnerOtp,
} from "@/api";

import { useRunnerTheme } from "@/theme";

export default function VerifyRunnerScreen() {
  const { colors } = useRunnerTheme();

  const params = useLocalSearchParams<{
    challengeId?: string;
    destination?: string;
  }>();

  const challengeId = String(
    params.challengeId || ""
  );

  const destination = String(
    params.destination || "your email address"
  );

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (!challengeId) {
      setError(
        "Your verification session is missing. Start again."
      );
      return;
    }

    if (!/^[0-9]{6}$/.test(code)) {
      setError(
        "Enter the complete six-digit verification code."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await verifyRunnerOtp(
        challengeId,
        code
      );

      await saveRunnerSession(result.sessionToken);

      router.replace(
        result.profileComplete
          ? "/(app)"
          : "/(app)/profile-setup"
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The verification code could not be verified."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.paper },
      ]}
    >
      <Pressable
        accessibilityRole="button"
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
            name="mail-open-outline"
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
          EMAIL VERIFICATION
        </Text>

        <Text
          style={[
            styles.title,
            { color: colors.text },
          ]}
        >
          Check your email
        </Text>

        <Text
          style={[
            styles.subtitle,
            { color: colors.textMuted },
          ]}
        >
          Enter the six-digit code sent to{" "}
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

        <TextInput
          value={code}
          onChangeText={(value) => {
            setCode(
              value.replace(/[^0-9]/g, "").slice(0, 6)
            );
            setError("");
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={colors.textMuted}
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
          onPress={verify}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.blue },
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>
                Verify and continue
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
          onPress={() => router.replace("/(auth)/login")}
          style={styles.changeEmailButton}
        >
          <Text
            style={[
              styles.changeEmailText,
              { color: colors.blue },
            ]}
          >
            Use a different email address
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    paddingTop: 30,
  },

  backButton: {
    height: 42,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    gap: 17,
    paddingBottom: 60,
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

  codeInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 15,
    textAlign: "center",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 9,
    marginTop: 9,
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
    fontSize: 14,
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
});
