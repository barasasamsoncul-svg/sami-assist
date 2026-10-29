import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams } from "expo-router";
import { dispatchPost } from "@/api";

type AccountRole = "customer" | "provider";

const BLUE = "#2463B8";
const NAVY = "#173B67";
const INK = "#24364F";
const MUTED = "#6C7B91";
const BORDER = "#DCE5F2";
const PALE_BLUE = "#EAF1FC";

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole: AccountRole = params.role === "provider" ? "provider" : "customer";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AccountRole>(initialRole);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createAccount() {
    if (fullName.trim().length < 2 || !email.trim() || !phone.trim() || password.length < 12) {
      setError("Complete all fields and use a password of at least 12 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await dispatchPost("register", {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        role,
      });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account creation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function Field({
    label,
    icon,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    autoCapitalize,
    textContentType,
  }: {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    keyboardType?: "default" | "email-address" | "phone-pad";
    autoCapitalize?: "none" | "words";
    textContentType?: "name" | "emailAddress" | "telephoneNumber";
  }) {
    return (
      <View style={{ gap: 7 }}>
        <Text style={{ color: INK, fontSize: 12, fontWeight: "800", letterSpacing: 0.25 }}>{label.toUpperCase()}</Text>
        <View style={{
          minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11,
          paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
          backgroundColor: "#FBFCFF",
        }}>
          <Ionicons name={icon} size={19} color="#71839B" />
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#94A2B6"
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            textContentType={textContentType}
            style={{ flex: 1, color: NAVY, fontSize: 15, paddingVertical: 12 }}
          />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F7FB" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
          flexGrow: 1, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 30,
        }}>
          <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 22 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{
                width: 50, height: 50, borderRadius: 16, backgroundColor: NAVY,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900", letterSpacing: -1.4 }}>SaMi</Text>
                <View style={{
                  position: "absolute", bottom: 7, width: 22, height: 7,
                  borderBottomWidth: 2.5, borderColor: "#F0B64D",
                  borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
                }} />
              </View>
              <View style={{ gap: 3 }}>
                <Text style={{ color: NAVY, fontSize: 24, fontWeight: "900", letterSpacing: -1 }}>SaMi</Text>
                <Text style={{ color: MUTED, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 }}>ERRANDS, MADE EASIER</Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{
                alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7,
                paddingHorizontal: 11, paddingVertical: 7, borderRadius: 30, backgroundColor: PALE_BLUE,
              }}>
                <Ionicons name="sparkles-outline" size={14} color={BLUE} />
                <Text style={{ color: BLUE, fontSize: 10, fontWeight: "800", letterSpacing: 0.9 }}>GET STARTED WITH SAMI</Text>
              </View>
              <Text style={{ color: NAVY, fontSize: 32, lineHeight: 38, fontWeight: "900", letterSpacing: -1.1 }}>
                Your day,{"\n"}made easier.
              </Text>
              <Text style={{ color: MUTED, fontSize: 14, lineHeight: 22, maxWidth: 350 }}>
                Create your account to request everyday help or apply to complete errands in your community.
              </Text>
            </View>

            <View style={{
              backgroundColor: "#FFFFFF", borderRadius: 25, borderWidth: 1, borderColor: BORDER,
              padding: 19, gap: 17, shadowColor: NAVY, shadowOpacity: 0.05,
              shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2,
            }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: NAVY, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 }}>Create your account</Text>
                <Text style={{ color: MUTED, fontSize: 13, lineHeight: 19 }}>A few details and you’re ready to go.</Text>
              </View>

              <Field label="Full name" icon="person-outline" value={fullName} onChangeText={setFullName}
                placeholder="Enter your full name" autoCapitalize="words" textContentType="name" />
              <Field label="Email address" icon="mail-outline" value={email} onChangeText={setEmail}
                placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
              <Field label="Phone number" icon="call-outline" value={phone} onChangeText={setPhone}
                placeholder="07XX XXX XXX" keyboardType="phone-pad" textContentType="telephoneNumber" />

              <View style={{ gap: 9 }}>
                <Text style={{ color: INK, fontSize: 12, fontWeight: "800", letterSpacing: 0.25 }}>HOW WILL YOU USE SAMI?</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {([
                    { value: "customer" as const, title: "I need help", detail: "Request errands", icon: "bag-handle-outline" as const },
                    { value: "provider" as const, title: "I can help", detail: "Complete errands", icon: "bicycle-outline" as const },
                  ]).map((option) => {
                    const selected = role === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setRole(option.value)}
                        style={{
                          flex: 1, minHeight: 106, padding: 13, borderRadius: 16, gap: 8,
                          borderWidth: selected ? 1.5 : 1, borderColor: selected ? BLUE : BORDER,
                          backgroundColor: selected ? "#F1F6FF" : "#FFFFFF",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Ionicons name={option.icon} size={21} color={selected ? BLUE : MUTED} />
                          <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={18} color={selected ? BLUE : "#A8B3C2"} />
                        </View>
                        <View style={{ gap: 3 }}>
                          <Text style={{ color: NAVY, fontSize: 13, fontWeight: "850" }}>{option.title}</Text>
                          <Text style={{ color: MUTED, fontSize: 11, lineHeight: 15 }}>{option.detail}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {role === "provider" ? (
                  <View style={{ flexDirection: "row", gap: 7, alignItems: "flex-start", padding: 10, borderRadius: 12, backgroundColor: "#F5F7FB" }}>
                    <Ionicons name="information-circle-outline" size={17} color={BLUE} />
                    <Text style={{ flex: 1, color: MUTED, fontSize: 12, lineHeight: 18 }}>
                      Provider applications are reviewed by SaMi before you can accept errands.
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ gap: 7 }}>
                <Text style={{ color: INK, fontSize: 12, fontWeight: "800", letterSpacing: 0.25 }}>PASSWORD</Text>
                <View style={{
                  minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11,
                  paddingLeft: 14, paddingRight: 7, borderRadius: 14, borderWidth: 1,
                  borderColor: BORDER, backgroundColor: "#FBFCFF",
                }}>
                  <Ionicons name="lock-closed-outline" size={19} color="#71839B" />
                  <TextInput
                    accessibilityLabel="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 12 characters"
                    placeholderTextColor="#94A2B6"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    style={{ flex: 1, color: NAVY, fontSize: 15, paddingVertical: 12 }}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    hitSlop={10} onPress={() => setShowPassword((value) => !value)}
                    style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color="#71839B" />
                  </Pressable>
                </View>
                <Text style={{ color: MUTED, fontSize: 11, lineHeight: 16 }}>Use at least 12 characters to help protect your account.</Text>
              </View>

              {error ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#FFF0ED" }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
                  <Text style={{ flex: 1, color: "#9E2921", fontSize: 13, lineHeight: 19 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy || fullName.trim().length < 2 || !email.trim() || !phone.trim() || password.length < 12}
                onPress={createAccount}
                style={({ pressed }) => ({
                  minHeight: 55, borderRadius: 15, backgroundColor: pressed ? "#1C5299" : BLUE,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                  opacity: busy ? 0.75 : (!fullName.trim() || !email.trim() || !phone.trim() || password.length < 12 ? 0.55 : 1),
                })}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "850" }}>
                      {role === "provider" ? "Apply as an errand provider" : "Create account"}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>Already have an account?</Text>
                <Link href="/(auth)/login" style={{ color: BLUE, fontSize: 13, fontWeight: "800" }}>Sign in</Link>
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
              <Ionicons name="shield-checkmark-outline" size={15} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 11, fontWeight: "700" }}>Your Everyday Help Organised.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
