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

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestRunnerRegistrationOtp } from "@/api";
import { useRunnerTheme } from "@/theme";

export default function RunnerRegistrationScreen() {
  const { colors } = useRunnerTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const normalizedName = fullName.trim().replace(/\s+/g, " ");
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();

  const validName =
    normalizedName.length >= 2 &&
    normalizedName.length <= 120;

  const validEmail =
    normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const validPhone = normalizedPhone.length >= 9;

  const canSubmit =
    validName &&
    validEmail &&
    validPhone &&
    !submitting;

  async function submitRegistration() {
    if (submitting) return;

    setError("");

    if (!validName) {
      setError("Enter your full name.");
      return;
    }

    if (!validEmail) {
      setError("Enter a valid email address.");
      return;
    }

    if (!validPhone) {
      setError("Enter your mobile phone number.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await requestRunnerRegistrationOtp({
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
      });

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
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration could not be started. Please try again.",
      );
    } finally {
      setSubmitting(false);
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
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={[
                styles.backButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={21}
                color={colors.text}
              />
            </Pressable>

            <View style={styles.brand}>
              <Text
                style={[
                  styles.brandName,
                  { color: colors.navy },
                ]}
              >
                SaMi{" "}
                <Text style={{ color: colors.blue }}>
                  Runner
                </Text>
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

            <Text
              style={[
                styles.eyebrow,
                { color: colors.blue },
              ]}
            >
              BECOME A SAMI RUNNER
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Create your account.
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted },
              ]}
            >
              Enter your details below to get started.
              We will verify your email before moving
              you to the next registration step.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Full name
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={colors.textMuted}
                />

                <TextInput
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setError("");
                  }}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={120}
                  editable={!submitting}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Email address
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
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
                  returnKeyType="next"
                  maxLength={254}
                  editable={!submitting}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
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

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Phone number
                <Text style={{ color: colors.red }}> *</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={19}
                  color={colors.textMuted}
                />

                <TextInput
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setError("");
                  }}
                  placeholder="+254 712 345 678"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  maxLength={24}
                  editable={!submitting}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Phone number"
                />
              </View>

              <Text
                style={[
                  styles.fieldHint,
                  { color: colors.textMuted },
                ]}
              >
                Use a Kenyan mobile number. You can enter
                it with or without the +254 prefix.
              </Text>
            </View>
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

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
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
                  <Text style={styles.submitButtonText}>
                    Submit
                  </Text>

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
                disabled={submitting}
                onPress={() =>
                  router.replace("/(auth)/login")
                }
              >
                <Text
                  style={[
                    styles.signInLink,
                    { color: colors.blue },
                  ]}
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
              Your details are used to create and manage
              your SaMi Runner account. Task selection
              and verification documents are completed
              in separate steps.
            </Text>
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
    paddingTop: 12,
    paddingBottom: 32,
    gap: 28,
  },

  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
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
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: {
    width: 42,
  },

  intro: {
    gap: 11,
  },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  title: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 21,
    maxWidth: 340,
  },

  form: {
    gap: 23,
  },

  fieldGroup: {
    gap: 9,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 12,
  },

  input: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 11,
    fontSize: 14,
  },

  fieldHint: {
    fontSize: 10,
    lineHeight: 16,
  },

  errorContainer: {
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  footer: {
    gap: 17,
    paddingTop: 2,
  },

  submitButton: {
    minHeight: 57,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  signInPrompt: {
    fontSize: 11,
  },

  signInLink: {
    fontSize: 11,
    fontWeight: "900",
  },

  footerNote: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.82,
  },
});
