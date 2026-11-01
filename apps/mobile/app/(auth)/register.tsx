
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type OtpChannel = "email";

const NAVY = "#071D55";
const BLUE = "#3478E5";
const MUTED = "#778197";
const BORDER = "#DCE2EC";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const channel: OtpChannel = "email";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function formatKenyanPhone(value: string) {
    const digits = value.replace(/\D/g, "");

    if (digits.startsWith("254")) {
      return `+${digits}`;
    }

    if (digits.startsWith("0")) {
      return `+254${digits.slice(1)}`;
    }

    return `+254${digits}`;
  }

  async function sendCode() {
    setBusy(true);
    setError("");

    try {
      const result = await dispatchPost<{
        challengeId: string;
        deliveryHint: string;
        channel: OtpChannel;
      }>("requestOtp", {
        purpose: "register",
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: formatKenyanPhone(phone),
        channel,
      });

      router.push({
        pathname: "/(auth)/verify",
        params: {
          challengeId: result.challengeId,
          purpose: "register",
          deliveryHint: result.deliveryHint,
          channel: result.channel,
        },
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not send the verification code."
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy ||
    fullName.trim().length < 2 ||
    !email.trim() ||
    phone.replace(/\D/g, "").length < 9;

  return (
    <SafeAreaView
      style={[common.screen, styles.screen]}
    >
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* BRAND */}
          <View style={styles.header}>
            <Image
              source={require("../../assets/sami-welcome-wordmark-transparent.png")}
              style={styles.wordmark}
              resizeMode="contain"
              accessibilityLabel="SaMi - Consider it done"
            />
          </View>

          {/* INTRODUCTION */}
          <View style={styles.intro}>
            <Text style={styles.title}>
              Create your account
            </Text>

            <Text style={styles.subtitle}>
              Get started with SaMi and request any
              errand, anytime.
            </Text>
          </View>

          {/* REGISTRATION FORM */}
          <View style={styles.form}>

            {/* FULL NAME */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>♙</Text>

              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                placeholder="Full name"
                placeholderTextColor="#929BAD"
                value={fullName}
                onChangeText={setFullName}
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            {/* PHONE NUMBER */}
            <View style={styles.phoneContainer}>
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇰🇪</Text>
                <Text style={styles.countryText}>+254</Text>
                <Text style={styles.dropdown}>⌄</Text>
              </View>

              <View style={styles.phoneDivider} />

              <TextInput
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="Phone number"
                placeholderTextColor="#929BAD"
                value={phone}
                onChangeText={setPhone}
                style={styles.phoneInput}
                returnKeyType="next"
                maxLength={12}
              />
            </View>

            {/* EMAIL */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputIcon}>✉</Text>

              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="Email address"
                placeholderTextColor="#929BAD"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                returnKeyType="done"
              />
            </View>

            {/* EMAIL VERIFICATION */}
            <View style={styles.verification}>
              <Text style={styles.verificationTitle}>
                Email verification
              </Text>

              <View style={styles.emailNotice}>
                <View style={styles.emailIconCircle}>
                  <Text style={styles.emailIcon}>✉</Text>
                </View>

                <View style={styles.emailNoticeText}>
                  <Text style={styles.emailNoticeHeading}>
                    Verify your email address
                  </Text>

                  <Text style={styles.emailNoticeDescription}>
                    We'll send your six-digit verification
                    code to the email address above.
                  </Text>
                </View>
              </View>
            </View>

            {/* ERROR */}
            {error ? (
              <Text
                accessibilityRole="alert"
                style={styles.error}
              >
                {error}
              </Text>
            ) : null}

            {/* CREATE ACCOUNT */}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={sendCode}
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && styles.disabledButton,
                pressed && !disabled && styles.pressedButton,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Send verification code
                  </Text>

                  <Text style={styles.buttonArrow}>→</Text>
                </>
              )}
            </Pressable>

            {/* SIGN IN */}
            <View style={styles.signIn}>
              <Text style={styles.signInText}>
                Already registered?
              </Text>

              <Link
                href="/(auth)/login"
                style={styles.signInLink}
              >
                Sign in
              </Link>
            </View>
          </View>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8F9FC",
  },

  keyboard: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 25,
    paddingTop: 28,
    paddingBottom: 28,
  },

  header: {
    marginBottom: 42,
    alignItems: "flex-start",
  },

  wordmark: {
    width: 165,
    height: 76,
  },

  intro: {
    marginBottom: 34,
    gap: 10,
  },

  title: {
    color: NAVY,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },

  subtitle: {
    color: MUTED,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 330,
  },

  form: {
    gap: 19,
  },

  inputContainer: {
    height: 66,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },

  inputIcon: {
    color: NAVY,
    fontSize: 24,
    width: 38,
    fontWeight: "600",
  },

  input: {
    flex: 1,
    height: "100%",
    color: NAVY,
    fontSize: 16,
    fontWeight: "500",
  },

  phoneContainer: {
    height: 66,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },

  countryCode: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 7,
  },

  flag: {
    fontSize: 23,
  },

  countryText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
  },

  dropdown: {
    color: MUTED,
    fontSize: 19,
  },

  phoneDivider: {
    height: 42,
    width: 1,
    backgroundColor: BORDER,
  },

  phoneInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 15,
    color: NAVY,
    fontSize: 16,
    fontWeight: "500",
  },

  verification: {
    marginTop: 7,
    gap: 12,
  },

  verificationTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
  },

  emailNotice: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  emailIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#EDF3FF",
    justifyContent: "center",
    alignItems: "center",
  },

  emailIcon: {
    fontSize: 21,
    color: BLUE,
  },

  emailNoticeText: {
    flex: 1,
    gap: 4,
  },

  emailNoticeHeading: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },

  emailNoticeDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },

  error: {
    color: "#D32F2F",
    fontSize: 13,
    lineHeight: 19,
  },

  primaryButton: {
    height: 66,
    borderRadius: 35,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    marginTop: 7,
    gap: 16,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonArrow: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "400",
  },

  disabledButton: {
    opacity: 0.5,
  },

  pressedButton: {
    opacity: 0.85,
  },

  signIn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },

  signInText: {
    color: MUTED,
    fontSize: 14,
  },

  signInLink: {
    color: BLUE,
    fontSize: 14,
    fontWeight: "800",
  },

  bottomSpace: {
    flexGrow: 1,
    minHeight: 20,
  },
});
