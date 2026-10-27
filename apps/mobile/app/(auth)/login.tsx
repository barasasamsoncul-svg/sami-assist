import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setBusy(true); setError("");
    try {
      await dispatchPost("login", { email: email.trim().toLowerCase(), password });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center", paddingTop: 34 }]}>
          <View style={{ gap: 8, marginBottom: 14 }}>
            <Text style={{ color: colors.blue, fontSize: 14, fontWeight: "900", letterSpacing: 1.4 }}>SaMi</Text>
            <Text style={common.title}>Get things done.</Text>
            <Text style={common.subtitle}>Sign in to request help, follow progress, and manage your errands.</Text>
          </View>
          <View style={common.card}>
            <View>
              <Text style={common.label}>Email address</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor="#929BAD" value={email} onChangeText={setEmail} style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Password</Text>
              <TextInput secureTextEntry textContentType="password" placeholder="Your password" placeholderTextColor="#929BAD" value={password} onChangeText={setPassword} style={common.input} />
            </View>
            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password} onPress={signIn} style={[common.primaryButton, (busy || !email.trim() || !password) && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Sign in</Text>}
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <Text style={{ color: colors.muted }}>New to SaMi?</Text>
              <Link href="/(auth)/register" style={{ color: colors.blue, fontWeight: "800" }}>Create an account</Link>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 18 }}>Your account and errands are protected by SaMi's server-side access controls.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
