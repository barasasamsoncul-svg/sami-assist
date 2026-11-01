import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    challengeId?: string;
    purpose?: string;
    deliveryHint?: string;
    channel?: string;
  }>();
  const challengeId = typeof params.challengeId === "string" ? params.challengeId : "";
  const purpose = params.purpose === "register" ? "register" : "login";
  const deliveryHint = typeof params.deliveryHint === "string" ? params.deliveryHint : "your selected contact";
  const channel = typeof params.channel === "string" ? params.channel : "selected channel";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    if (!challengeId) {
      setError("This verification request is missing. Go back and request a new code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await dispatchPost("verifyOtp", { challengeId, code: code.trim() });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Code verification failed.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || code.trim().length !== 6 || !challengeId;

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.blue, fontSize: 15, fontWeight: "900", letterSpacing: 1.4 }}>SaMi</Text>
            <Text style={common.title}>Verify your account</Text>
            <Text style={common.subtitle}>Enter the six-digit code sent to {deliveryHint} by {channel}.</Text>
          </View>

          <View style={common.card}>
            <View>
              <Text style={common.label}>Verification code</Text>
              <TextInput
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                placeholder="000000"
                placeholderTextColor="#929BAD"
                value={code}
                onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
                style={[common.input, { textAlign: "center", fontSize: 25, fontWeight: "800", letterSpacing: 9 }]}
                maxLength={6}
                returnKeyType="done"
              />
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8, textAlign: "center" }}>
                Codes expire after 10 minutes.
              </Text>
            </View>

            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={disabled} onPress={verify} style={[common.primaryButton, disabled && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Verify and continue</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace(purpose === "register" ? "/(auth)/register" : "/(auth)/login")} style={common.secondaryButton}>
              <Text style={common.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
