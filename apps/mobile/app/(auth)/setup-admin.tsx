import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type Status = { adminExists: boolean; tokenConfigured: boolean; setupAvailable: boolean };

export default function SetupAdminScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    dispatchGet<Status>("bootstrapStatus")
      .then((result) => { if (active) setStatus(result); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Administrator setup status could not be checked."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createAdministrator() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await dispatchPost<{ message: string }>(
        "bootstrap",
        { fullName: fullName.trim(), email: email.trim().toLowerCase(), password },
        { "x-admin-bootstrap-token": bootstrapToken },
      );
      setNotice(result.message || "Administrator account created.");
      setBootstrapToken("");
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Administrator setup failed.");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center" }]} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8, marginBottom: 10 }}>
            <Text style={{ color: colors.blue, fontSize: 14, fontWeight: "900", letterSpacing: 1.4 }}>SaMi · FIRST-TIME SETUP</Text>
            <Text style={common.title}>Create the administrator.</Text>
            <Text style={common.subtitle}>The first administrator can approve errand providers, assign requests and oversee service payments.</Text>
          </View>

          <View style={common.card}>
            {loading ? <ActivityIndicator color={colors.blue} /> : null}
            {status?.adminExists ? <Text style={{ color: colors.green, fontWeight: "800" }}>An administrator already exists. Sign in normally.</Text> : null}
            {!status?.tokenConfigured && !loading ? (
              <Text style={common.error}>The server has not configured ADMIN_BOOTSTRAP_TOKEN yet. Add a strong token of at least 32 characters to the SaMi Errands Vercel Preview environment and redeploy before completing this one-time setup.</Text>
            ) : null}
            <View>
              <Text style={common.label}>Administrator full name</Text>
              <TextInput value={fullName} onChangeText={setFullName} autoCapitalize="words" textContentType="name" placeholder="Full name" placeholderTextColor="#929BAD" style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Administrator email</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" placeholder="admin@example.com" placeholderTextColor="#929BAD" style={common.input} />
            </View>
            <View>
              <Text style={common.label}>Strong password (14+ characters)</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="Create a strong password" placeholderTextColor="#929BAD" style={common.input} />
            </View>
            <View>
              <Text style={common.label}>One-time server setup token</Text>
              <TextInput value={bootstrapToken} onChangeText={setBootstrapToken} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="ADMIN_BOOTSTRAP_TOKEN" placeholderTextColor="#929BAD" style={common.input} />
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>The token is sent once in a request header and is not saved in the app. It is not the administrator password.</Text>
            </View>
            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12 }}>{notice}</Text> : null}
            <Pressable
              disabled={busy || loading || !status?.setupAvailable || fullName.trim().length < 2 || !email.trim() || password.length < 14 || bootstrapToken.length < 32}
              onPress={createAdministrator}
              style={[common.primaryButton, (busy || loading || !status?.setupAvailable || fullName.trim().length < 2 || !email.trim() || password.length < 14 || bootstrapToken.length < 32) && { opacity: 0.5 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Create administrator account</Text>}
            </Pressable>
            {status?.adminExists ? <Link href="/(auth)/login" style={{ color: colors.blue, fontWeight: "800", textAlign: "center" }}>Go to sign in</Link> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
