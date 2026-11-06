import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { saveRunnerSession, verifyRunnerOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

export default function VerifyRunnerScreen() {
  const { colors } = useRunnerTheme();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = useMemo(() => String(params.phone || ""), [params.phone]);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      return;
    }
    if (!phone) {
      setError("The phone number is missing. Start again.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await verifyRunnerOtp(phone, code);
      await saveRunnerSession(result.sessionToken);
      router.replace(
        result.profileComplete ? "/(app)" : "/(app)/profile-setup",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: colors.blueSoft }]}>
          <Ionicons name="chatbox-ellipses-outline" size={29} color={colors.blue} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          Verify your number
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Enter the six-digit code sent to {phone || "your phone"}.
        </Text>

        <TextInput
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
            setError("");
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
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
          accessibilityLabel="Six digit verification code"
        />

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>
            {error}
          </Text>
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
            <Text style={styles.primaryButtonText}>Verify and continue</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 30 },
  backButton: {
    height: 42,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    paddingBottom: 70,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { fontSize: 27, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 20 },
  codeInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 15,
    textAlign: "center",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 9,
    marginTop: 10,
  },
  error: { fontSize: 12, lineHeight: 18 },
  primaryButton: {
    minHeight: 53,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});