
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

export default function RunnerLoginScreen() {
  const { colors } = useRunnerTheme();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function continueWithEmail() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await requestRunnerOtp(
        normalizedEmail
      );

      router.push({
        pathname: "/(auth)/verify",
        params: {
          challengeId: result.challengeId,
          destination: result.destination,
        },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "A verification code could not be sent."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.screen,
        { backgroundColor: colors.paper },
      ]}
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Ionicons
              name="bicycle"
              size={28}
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
          <Text
            style={[
              styles.eyebrow,
              { color: colors.blue },
            ]}
          >
            RUNNER APP
          </Text>

          <Text
            style={[
              styles.title,
              { color: colors.text },
            ]}
          >
            Welcome back
          </Text>

          <Text
            style={[
              styles.subtitle,
              { color: colors.textMuted },
            ]}
          >
            Sign in to manage your availability,
            receive errands and keep customers
            updated while you work.
          </Text>
        </View>

        <View style={styles.form}>
          <Text
            style={[
              styles.label,
              { color: colors.text },
            ]}
          >
            Email address
          </Text>

          <View
            style={[
              styles.emailInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={colors.textMuted}
            />

            <TextInput
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError("");
              }}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={continueWithEmail}
              maxLength={254}
              style={[
                styles.input,
                { color: colors.text },
              ]}
              accessibilityLabel="Runner email address"
            />
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
            disabled={busy || !email.trim()}
            onPress={continueWithEmail}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              (busy || !email.trim()) && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  Continue
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color="#FFFFFF"
                />
              </>
            )}
          </Pressable>

          <Text
            style={[
              styles.helper,
              { color: colors.textMuted },
            ]}
          >
            We'll send a six-digit verification
            code to your email address.
          </Text>
        </View>

        <View style={styles.bottom}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={colors.textMuted}
          />

          <Text
            style={[
              styles.bottomText,
              { color: colors.textMuted },
            ]}
          >
            Your Runner account is separate
            from your Customer account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    padding: 25,
    paddingTop: 54,
    paddingBottom: 32,
    justifyContent: "space-between",
    gap: 35,
  },

  brand: {
    alignItems: "center",
    gap: 7,
  },

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

  brandAccent: {
    color: "#2769C7",
  },

  brandTagline: {
    color: "#74839A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.5,
  },

  intro: {
    gap: 10,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  title: {
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 22,
  },

  form: {
    gap: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
  },

  emailInput: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 11,
  },

  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 54,
    paddingVertical: 10,
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
    minHeight: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  helper: {
    textAlign: "center",
    fontSize: 11,
    lineHeight: 18,
  },

  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  bottomText: {
    fontSize: 10,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.85,
  },
});
