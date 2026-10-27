import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createAccount() {
    setBusy(true); setError("");
    try {
      await dispatchPost("register", { fullName: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, role: "customer" });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account creation failed.");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={{ gap: 8, marginBottom: 10 }}>
            <Text style={{ color: colors.blue, fontSize: 14, fontWeight: "900", letterSpacing: 1.4 }}>SaMi</Text>
            <Text style={common.title}>Create your account.</Text>
            <Text style={common.subtitle}>Start with a customer account. Provider onboarding can be completed separately.</Text>
          </View>
          <View style={common.card}>
            <View>
              <Text style={common.label}>Full name</Text>
              <TextInput autoCapitalize="words" textContentType="name" placeholder="Your full name" placeholderTextColor="#929BAD" value={fullName} onChangeText={setFullName} style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Email address</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor="#929BAD" value={email} onChangeText={setEmail} style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Phone number</Text>
              <TextInput keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="07XXXXXXXX" placeholderTextColor="#929BAD" value={phone} onChangeText={setPhone} style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Password (at least 12 characters)</Text>
              <TextInput secureTextEntry textContentType="newPassword" placeholder="Choose a strong password" placeholderTextColor="#929BAD" value={password} onChangeText={setPassword} style={common.input} />
            </View>
            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable disabled={busy || fullName.trim().length < 2 || !email.trim() || password.length < 12} onPress={createAccount} style={[common.primaryButton, (busy || fullName.trim().length < 2 || !email.trim() || password.length < 12) && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Create account</Text>}
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Text style={{ color: colors.muted }}>Already registered?</Text>
              <Link href="/(auth)/login" style={{ color: colors.blue, fontWeight: "800" }}>Sign in</Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
