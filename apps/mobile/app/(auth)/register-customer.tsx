import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, Image, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
const BLUE = "#2463B8";
const NAVY = "#173B67";
const INK = "#24364F";
const MUTED = "#6C7B91";
const BORDER = "#DCE5F2";

export default function CustomerRegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sendCode() {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) { setError("Enter your full name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError("Enter a valid email address."); return; }
    if (!cleanPhone) { setError("Enter your Kenyan mobile number."); return; }
    setBusy(true); setError("");
    try {
      const result = await dispatchPost<{ challengeId: string; deliveryHint: string; channel: "email" }>(
        "requestOtp", { purpose: "register", fullName: cleanName, email: cleanEmail, phone: cleanPhone, channel: "email" }
      );
      router.push({ pathname: "/(auth)/verify", params: { challengeId: result.challengeId, purpose: "register", deliveryHint: result.deliveryHint, channel: result.channel } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your verification code.");
    } finally { setBusy(false); }
  }
  function Field({ label, icon, value, onChangeText, placeholder, keyboardType, autoCapitalize, textContentType }: {
    label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; value: string; onChangeText: (value: string) => void; placeholder: string;
    keyboardType?: "default" | "email-address" | "phone-pad"; autoCapitalize?: "none" | "words";
    textContentType?: "name" | "emailAddress" | "telephoneNumber";
  }) {
    return <View style={{ gap: 7 }}>
      <Text style={{ color: INK, fontSize: 12, fontWeight: "800", letterSpacing: 0.25 }}>{label.toUpperCase()}</Text>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FBFCFF" }}>
        <Ionicons name={icon} size={19} color="#71839B" />
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A2B6" keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} textContentType={textContentType} style={{ flex: 1, color: NAVY, fontSize: 15, paddingVertical: 12 }} />
      </View>
    </View>;
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30 }}>
        <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 22 }}>
          <Image
            source={require("../../assets/sami-welcome-wordmark-transparent.png")}
            style={{ width: 184, height: 52, alignSelf: "flex-start" }}
            resizeMode="contain"
            accessibilityLabel="SaMi - Consider it done"
          />
          <View style={{ gap: 10 }}>
            <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 30, backgroundColor: "#EAF1FC" }}>
              <Ionicons name="sparkles-outline" size={14} color={BLUE} />
              <Text style={{ color: BLUE, fontSize: 10, fontWeight: "800", letterSpacing: 0.9 }}>GET STARTED WITH SAMI</Text>
            </View>
            <Text style={{ color: NAVY, fontSize: 32, lineHeight: 38, fontWeight: "900", letterSpacing: -1.1 }}>Your day,{"\n"}made easier.</Text>
            <Text style={{ color: MUTED, fontSize: 14, lineHeight: 22, maxWidth: 350 }}>Create your customer account and we’ll email you a one-time code to verify your address.</Text>
          </View>
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 25, borderWidth: 1, borderColor: BORDER, padding: 19, gap: 17, shadowColor: NAVY, shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: NAVY, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 }}>Create your customer account</Text>
              <Text style={{ color: MUTED, fontSize: 13, lineHeight: 19 }}>No password required.</Text>
            </View>
            <Field label="Full name" icon="person-outline" value={fullName} onChangeText={setFullName} placeholder="Enter your full name" autoCapitalize="words" textContentType="name" />
            <Field label="Email address" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
            <Field label="Phone number" icon="call-outline" value={phone} onChangeText={setPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" textContentType="telephoneNumber" />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 11, borderRadius: 13, backgroundColor: "#EAF1FC" }}>
              <Ionicons name="mail-unread-outline" size={18} color={BLUE} />
              <Text style={{ flex: 1, color: "#214E8C", fontSize: 12, lineHeight: 18 }}>Email is currently the only available verification method.</Text>
            </View>
            {error ? <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#FFF0ED" }}>
              <Ionicons name="alert-circle-outline" size={18} color="#B42318" /><Text style={{ flex: 1, color: "#9E2921", fontSize: 13, lineHeight: 19 }}>{error}</Text>
            </View> : null}
            <Pressable accessibilityRole="button" disabled={busy || fullName.trim().length < 2 || !email.trim() || !phone.trim()} onPress={sendCode}
              style={({ pressed }) => ({ minHeight: 55, borderRadius: 15, backgroundColor: pressed ? "#1C5299" : BLUE, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, opacity: busy || fullName.trim().length < 2 || !email.trim() || !phone.trim() ? 0.55 : 1 })}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>Send verification code</Text><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></>}
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <Text style={{ color: MUTED, fontSize: 13 }}>Already have an account?</Text>
              <Link href="/(auth)/login" style={{ color: BLUE, fontSize: 13, fontWeight: "800" }}>Sign in</Link>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <Ionicons name="shield-checkmark-outline" size={15} color={MUTED} /><Text style={{ color: MUTED, fontSize: 11, fontWeight: "700" }}>Consider it done.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
