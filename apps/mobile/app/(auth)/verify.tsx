import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { dispatchPost } from "@/api";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    challengeId?: string;
    purpose?: string;
    deliveryHint?: string;
    channel?: string;
  }>();
  const challengeId = typeof params.challengeId === "string" ? params.challengeId : "";
  const purpose = params.purpose === "register" ? "register" : "login";
  const deliveryHint = typeof params.deliveryHint === "string" ? params.deliveryHint : "your email address";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeFieldRef = useRef<View>(null);
  const { scrollRef, viewportRef, keyboardHeight, onFieldFocus, onScroll } =
    useKeyboardAwareScroll();

  async function verify() {
    if (!challengeId) {
      setError("This verification request is missing. Request a new code.");
      return;
    }
    if (!/^[0-9]{6}$/.test(code.trim())) {
      setError("Enter the six-digit verification code.");
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View ref={viewportRef} collapsable={false} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingTop: 22,
            paddingBottom: Math.max(30, keyboardHeight + 30),
            justifyContent: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 22 }}>
            <View style={{ gap: 8 }}>
              <Image
                source={require("../../assets/sami-welcome-wordmark-transparent.png")}
                style={{ width: 184, height: 52 }}
                resizeMode="contain"
                accessibilityLabel="SaMi - Consider it done"
              />
              <Text style={{ color: "#173B67", fontSize: 31, lineHeight: 38, fontWeight: "900", letterSpacing: -0.8 }}>Verify your email</Text>
              <Text style={{ color: "#69788D", fontSize: 14, lineHeight: 22 }}>Enter the six-digit code we sent to {deliveryHint}.</Text>
            </View>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, borderWidth: 1, borderColor: "#DCE5F2", padding: 20, gap: 16 }}>
              <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
                <View style={{ width: 58, height: 58, borderRadius: 19, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="mail-open-outline" size={27} color="#2463B8" />
                </View>
                <Text style={{ color: "#173B67", fontSize: 16, fontWeight: "800" }}>Check your inbox</Text>
                <Text style={{ color: "#69788D", fontSize: 12, textAlign: "center", lineHeight: 18 }}>The code expires in 10 minutes. Check your spam folder if needed.</Text>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#263E5E", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>VERIFICATION CODE</Text>
                <View ref={codeFieldRef} collapsable={false}>
                  <TextInput
                    accessibilityLabel="Six-digit verification code"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    placeholder="000000"
                    placeholderTextColor="#94A2B6"
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
                    onFocus={() => onFieldFocus(codeFieldRef.current)}
                    style={{ minHeight: 60, borderWidth: 1, borderColor: "#DCE5F2", borderRadius: 15, backgroundColor: "#FBFCFF", color: "#173B67", textAlign: "center", fontSize: 26, fontWeight: "800", letterSpacing: 10 }}
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={verify}
                    editable={!busy}
                  />
                </View>
              </View>

              {error ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#FFF0ED" }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
                  <Text style={{ flex: 1, color: "#9E2921", fontSize: 13, lineHeight: 19 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={verify}
                style={({ pressed }) => ({
                  minHeight: 55,
                  borderRadius: 15,
                  backgroundColor: pressed ? "#1C5299" : "#2463B8",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  opacity: disabled ? 0.55 : 1,
                })}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>Verify and continue</Text><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></>}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => router.replace(purpose === "register" ? "/(auth)/register-customer" : "/(auth)/login")}
                style={{ minHeight: 46, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#2463B8", fontSize: 14, fontWeight: "800" }}>Back</Text>
              </Pressable>
            </View>
            <Text style={{ color: "#8794A8", fontSize: 11, textAlign: "center", lineHeight: 17 }}>SaMi will never ask you to share your verification code with anyone.</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
