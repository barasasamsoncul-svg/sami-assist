import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type OtpChannel = "email";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const channel: OtpChannel = "email";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const result = await dispatchPost<{
        challengeId: string; deliveryHint: string; channel: OtpChannel;
      }>("requestOtp", {
        purpose: "login",
        identifier: identifier.trim(),
        channel,
      });
      router.push({
        pathname: "/(auth)/verify",
        params: {
          challengeId: result.challengeId,
          purpose: "login",
          deliveryHint: result.deliveryHint,
          channel: result.channel,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the verification code.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !identifier.trim();

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.blue, fontSize: 15, fontWeight: "900", letterSpacing: 1.4 }}>SaMi</Text>
            <Text style={common.title}>Welcome back</Text>
            <Text style={common.subtitle}>Sign in securely with a one-time verification code. No password required.</Text>
          </View>

          <View style={common.card}>
            <View>
              <Text style={common.label}>Email address or phone number</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                placeholder="Email or 07XX XXX XXX"
                placeholderTextColor="#929BAD"
                value={identifier}
                onChangeText={setIdentifier}
                style={common.input}
                returnKeyType="done"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={common.label}>Verification method</Text>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                Email is currently the only available verification method. We’ll send the code to the email address linked to your account.
              </Text>
            </View>

            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={disabled} onPress={sendCode} style={[common.primaryButton, disabled && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Send verification code</Text>}
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <Text style={{ color: colors.muted }}>New to SaMi?</Text>
              <Link href="/(auth)/register" style={{ color: colors.blue, fontWeight: "800" }}>Create an account</Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
