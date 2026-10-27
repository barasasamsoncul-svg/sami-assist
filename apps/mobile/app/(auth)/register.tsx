import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"customer" | "provider">("customer");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createAccount() {
    setBusy(true); setError("");
    try {
      await dispatchPost("register", { fullName: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, role });
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
            <Text style={common.subtitle}>Request errands as a customer, or apply to complete errands as a provider. Provider accounts need approval before accepting work.</Text>
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
            <View style={{ gap: 8 }}>
              <Text style={common.label}>Account type</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  ["customer", "Customer", "Request help"],
                  ["provider", "Errand provider", "Complete tasks"],
                ] as const).map(([value, title, subtitle]) => (
                  <Pressable key={value} onPress={() => setRole(value)} style={{
                    flex: 1, padding: 12, borderRadius: 13, borderWidth: 1,
                    borderColor: role === value ? colors.blue : colors.border,
                    backgroundColor: role === value ? colors.blueSoft : colors.white, gap: 5,
                  }}>
                    <Text style={{ color: colors.navy, fontSize: 13, fontWeight: "800" }}>{title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>{subtitle}</Text>
                  </Pressable>
                ))}
              </View>
              {role === "provider" ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>SaMi operations must review your provider application before you can accept jobs.</Text> : null}
            </View>
            <View>
              <Text style={common.label}>Password (at least 12 characters)</Text>
              <TextInput secureTextEntry textContentType="newPassword" placeholder="Choose a strong password" placeholderTextColor="#929BAD" value={password} onChangeText={setPassword} style={common.input} />
            </View>
            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable disabled={busy || fullName.trim().length < 2 || !email.trim() || password.length < 12} onPress={createAccount} style={[common.primaryButton, (busy || fullName.trim().length < 2 || !email.trim() || password.length < 12) && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>{role === "provider" ? "Apply as provider" : "Create account"}</Text>}
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
