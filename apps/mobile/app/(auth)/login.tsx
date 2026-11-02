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
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const identifierFieldRef = useRef<View>(null);
  const { scrollRef, viewportRef, keyboardHeight, onFieldFocus, onScroll } =
    useKeyboardAwareScroll();

  async function sendCode() {
    const value = identifier.trim();
    const isEmail = value.includes("@");
    if (!value) {
      setError("Enter your email address or Kenyan phone number.");
      return;
    }
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isEmail && value.replace(/\D/g, "").length < 9) {
      setError("Enter a valid Kenyan phone number.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await dispatchPost<{
        challengeId: string;
        deliveryHint: string;
        channel: "email";
      }>("requestOtp", {
        purpose: "login",
        identifier: isEmail ? value.toLowerCase() : value,
        channel: "email",
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
      setError(
        e instanceof Error
          ? e.message
          : "Could not send your verification code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !identifier.trim();

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
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: Math.max(28, keyboardHeight + 28),
            justifyContent: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 26 }}>
            <View style={{ gap: 22 }}>
              <Image
                source={require("../../assets/sami-welcome-wordmark-transparent.png")}
                style={{ width: 184, height: 52, alignSelf: "flex-start" }}
                resizeMode="contain"
                accessibilityLabel="SaMi - Consider it done"
              />
              <View style={{ gap: 11 }}>
                <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 30, backgroundColor: "#EAF1FC" }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#2463B8" }} />
                  <Text style={{ color: "#214E8C", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>YOUR DAY, A LITTLE LIGHTER</Text>
                </View>
                <Text style={{ color: "#173B67", fontSize: 35, lineHeight: 41, fontWeight: "900", letterSpacing: -1.25 }}>Good to have{"\n"}you back.</Text>
                <Text style={{ color: "#69788D", fontSize: 15, lineHeight: 23, maxWidth: 350 }}>Sign in securely with a one-time code sent to the email address linked to your SaMi account. No password needed.</Text>
              </View>
            </View>

            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 26, borderWidth: 1, borderColor: "#DCE5F2", padding: 21, gap: 18, shadowColor: "#173B67", shadowOpacity: 0.055, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 2 }}>
              <View style={{ gap: 5 }}>
                <Text style={{ color: "#173B67", fontSize: 20, fontWeight: "800", letterSpacing: -0.45 }}>Sign in</Text>
                <Text style={{ color: "#69788D", fontSize: 13, lineHeight: 19 }}>Enter the email address or Kenyan phone number linked to your account.</Text>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#263E5E", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>EMAIL ADDRESS OR PHONE NUMBER</Text>
                <View
                  ref={identifierFieldRef}
                  collapsable={false}
                  style={{ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: "#DCE5F2", backgroundColor: "#FBFCFF" }}
                >
                  <Ionicons name="person-circle-outline" size={19} color="#71839B" />
                  <TextInput
                    accessibilityLabel="Email address or phone number"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="go"
                    onSubmitEditing={sendCode}
                    textContentType="username"
                    placeholder="you@example.com or 07XX XXX XXX"
                    placeholderTextColor="#94A2B6"
                    value={identifier}
                    onChangeText={setIdentifier}
                    onFocus={() => onFieldFocus(identifierFieldRef.current)}
                    style={{ flex: 1, color: "#173B67", fontSize: 15, paddingVertical: 13 }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#EAF1FC" }}>
                <Ionicons name="mail-unread-outline" size={18} color="#2463B8" />
                <Text style={{ flex: 1, color: "#214E8C", fontSize: 12, lineHeight: 18 }}>Your verification code is always delivered to the email address registered to your account.</Text>
              </View>

              {error ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF0ED", borderRadius: 13, padding: 12 }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
                  <Text style={{ flex: 1, color: "#9E2921", fontSize: 13, lineHeight: 19 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={sendCode}
                style={({ pressed }) => ({
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: pressed ? "#1D5297" : "#2463B8",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: disabled ? 0.65 : 1,
                  shadowColor: "#2463B8",
                  shadowOpacity: 0.17,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 2,
                })}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>Send verification code</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
                <Text style={{ color: "#748278", fontSize: 13 }}>New to SaMi?</Text>
                <Link href="/(auth)/choose-role" style={{ color: "#2463B8", fontSize: 13, fontWeight: "800" }}>Create an account</Link>
              </View>
            </View>

            <View style={{ alignItems: "center", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#71839B" />
                <Text style={{ color: "#71839B", fontSize: 11, fontWeight: "700" }}>Your account stays protected</Text>
              </View>
              <Text style={{ color: "#8794A8", fontSize: 11, textAlign: "center", lineHeight: 17 }}>Consider it done.</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
