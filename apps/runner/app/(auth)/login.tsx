import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { requestRunnerOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^0[17][0-9]{8}$/.test(digits)) return "+254" + digits.slice(1);
  if (/^254[17][0-9]{8}$/.test(digits)) return "+" + digits;
  if (/^[17][0-9]{8}$/.test(digits)) return "+254" + digits;
  return null;
}

export default function RunnerLoginScreen() {
  const { colors } = useRunnerTheme();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function continueWithPhone() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Enter a valid Kenyan mobile number.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await requestRunnerOtp(normalized);
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: normalized },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A verification code could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Ionicons name="bicycle" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.brandName}>
            SaMi <Text style={styles.brandAccent}>Runner</Text>
          </Text>
          <Text style={styles.brandTagline}>CONSIDER IT DONE</Text>
        </View>

        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: colors.blue }]}>
            RUNNER APP
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Sign in to manage availability, receive errands and keep
            customers updated while you work.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>
            Mobile number
          </Text>
          <View
            style={[
              styles.phoneInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.countryCode, { color: colors.text }]}>
              +254
            </Text>
            <TextInput
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                setError("");
              }}
              placeholder="7XX XXX XXX"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={18}
              style={[styles.input, { color: colors.text }]}
              accessibilityLabel="Runner mobile number"
            />
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={continueWithPhone}
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
                <Text style={styles.primaryButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </>
            )}
          </Pressable>

          <Text style={[styles.helper, { color: colors.textMuted }]}>
            We will send a one-time code to verify your number.
          </Text>
        </View>

        <View style={styles.bottom}>
          <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.bottomText, { color: colors.textMuted }]}>
            Your Runner account is separate from your Customer account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: 25,
    paddingTop: 54,
    paddingBottom: 32,
    justifyContent: "space-between",
    gap: 35,
  },
  brand: { alignItems: "center", gap: 7 },
  logoMark: {
    height: 58,
    width: 58,
    borderRadius: 19,
    backgroundColor: "#000535",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  brandName: {
    color: "#000535",
    fontSize: 27,
    fontWeight: "900",
    fontStyle: "italic",
  },
  brandAccent: { color: "#2769C7" },
  brandTagline: {
    color: "#74839A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  intro: { gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  title: { fontSize: 31, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 22 },
  form: { gap: 13 },
  label: { fontSize: 13, fontWeight: "800" },
  phoneInput: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 11,
  },
  countryCode: { fontSize: 15, fontWeight: "800" },
  input: { flex: 1, fontSize: 16, minHeight: 54 },
  error: { fontSize: 12, lineHeight: 18 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  helper: { textAlign: "center", fontSize: 11, lineHeight: 17 },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  bottomText: { fontSize: 10, textAlign: "center" },
  disabled: { opacity: 0.55 },
});