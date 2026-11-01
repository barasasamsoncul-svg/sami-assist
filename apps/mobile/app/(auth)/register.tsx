import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type OtpChannel = "sms" | "whatsapp" | "email";
const channels: { value: OtpChannel; label: string }[] = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
];

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<OtpChannel>("sms");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const result = await dispatchPost<{
        challengeId: string; deliveryHint: string; channel: OtpChannel;
      }>("requestOtp", {
        purpose: "register",
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
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
      setError(e instanceof Error ? e.message : "Could not send the verification code.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || fullName.trim().length < 2 || !email.trim() || !phone.trim();

  return (
    <SafeAreaView style={common.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.blue, fontSize: 15, fontWeight: "900", letterSpacing: 1.4 }}>SaMi</Text>
            <Text style={common.title}>Create your account</Text>
            <Text style={common.subtitle}>Your everyday help, organised. Enter your details and choose where to receive your verification code.</Text>
          </View>

          <View style={common.card}>
            <View>
              <Text style={common.label}>Full name</Text>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                placeholder="Your full name"
                placeholderTextColor="#929BAD"
                value={fullName}
                onChangeText={setFullName}
                style={common.input}
                returnKeyType="next"
              />
            </View>
            <View>
              <Text style={common.label}>Phone number</Text>
              <TextInput
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="+254 7XX XXX XXX"
                placeholderTextColor="#929BAD"
                value={phone}
                onChangeText={setPhone}
                style={common.input}
                returnKeyType="next"
              />
            </View>
            <View>
              <Text style={common.label}>Email address</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor="#929BAD"
                value={email}
                onChangeText={setEmail}
                style={common.input}
                returnKeyType="done"
              />
            </View>

            <View style={{ gap: 9 }}>
              <Text style={common.label}>Send verification code by</Text>
              <View style={{ flexDirection: "row", gap: 7 }}>
                {channels.map((item) => {
                  const selected = channel === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setChannel(item.value)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: selected ? colors.navy : colors.border,
                        backgroundColor: selected ? colors.navy : colors.white,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                      }}
                    >
                      <Text style={{ color: selected ? colors.white : colors.ink, fontSize: 12, fontWeight: "800" }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                {channel === "email" ? "The code will be sent to your email address." : "The code will be sent to your Kenyan phone number."}
              </Text>
            </View>

            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={disabled} onPress={sendCode} style={[common.primaryButton, disabled && { opacity: 0.55 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Send verification code</Text>}
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
