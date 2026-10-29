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
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { colors } from "@/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (!email.trim() || !password) {
      setError("Enter your email address and password to continue.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await dispatchPost("login", {
        email: email.trim().toLowerCase(),
        password,
      });
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F6F7F3" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F7F3" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 28,
            justifyContent: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 26 }}>
            <View style={{ gap: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 17,
                    backgroundColor: "#153D32",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -1.5 }}>
                    SaMi
                  </Text>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 8,
                      width: 22,
                      height: 7,
                      borderBottomWidth: 2.5,
                      borderColor: "#F2B65D",
                      borderBottomLeftRadius: 20,
                      borderBottomRightRadius: 20,
                    }}
                  />
                </View>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: "#153D32", fontSize: 25, fontWeight: "900", letterSpacing: -1.1 }}>
                    SaMi
                  </Text>
                  <Text style={{ color: "#63766D", fontSize: 11, fontWeight: "800", letterSpacing: 1.15 }}>
                    ERRANDS, MADE EASIER
                  </Text>
                </View>
              </View>

              <View style={{ gap: 11 }}>
                <View
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 30,
                    backgroundColor: "#E7EEE7",
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#27825E" }} />
                  <Text style={{ color: "#285B45", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>
                    YOUR DAY, A LITTLE LIGHTER
                  </Text>
                </View>
                <Text
                  style={{
                    color: "#153D32",
                    fontSize: 35,
                    lineHeight: 41,
                    fontWeight: "900",
                    letterSpacing: -1.25,
                  }}
                >
                  Good to have{"\n"}you back.
                </Text>
                <Text style={{ color: "#65756D", fontSize: 15, lineHeight: 23, maxWidth: 330 }}>
                  Your everyday help, all in one place. Sign in to request an errand and keep everything moving.
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 26,
                borderWidth: 1,
                borderColor: "#E4E9E2",
                padding: 21,
                gap: 18,
                shadowColor: "#17392D",
                shadowOpacity: 0.055,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 9 },
                elevation: 2,
              }}
            >
              <View style={{ gap: 5 }}>
                <Text style={{ color: "#183C30", fontSize: 20, fontWeight: "850", letterSpacing: -0.45 }}>
                  Sign in
                </Text>
                <Text style={{ color: "#7A887F", fontSize: 13, lineHeight: 19 }}>
                  Enter your details to continue.
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#29463A", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>
                  EMAIL ADDRESS
                </Text>
                <View
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    paddingHorizontal: 14,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: "#DDE5DC",
                    backgroundColor: "#FBFCFA",
                  }}
                >
                  <Ionicons name="mail-outline" size={19} color="#74877B" />
                  <TextInput
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                    textContentType="emailAddress"
                    placeholder="you@example.com"
                    placeholderTextColor="#9AA69E"
                    value={email}
                    onChangeText={setEmail}
                    style={{ flex: 1, color: "#183C30", fontSize: 15, paddingVertical: 13 }}
                  />
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#29463A", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>
                  PASSWORD
                </Text>
                <View
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    paddingLeft: 14,
                    paddingRight: 8,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: "#DDE5DC",
                    backgroundColor: "#FBFCFA",
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={19} color="#74877B" />
                  <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={signIn}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    placeholder="Enter your password"
                    placeholderTextColor="#9AA69E"
                    value={password}
                    onChangeText={setPassword}
                    style={{ flex: 1, color: "#183C30", fontSize: 15, paddingVertical: 13 }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    hitSlop={10}
                    onPress={() => setShowPassword((value) => !value)}
                    style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color="#74877B" />
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View
                  accessibilityRole="alert"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    backgroundColor: "#FFF0ED",
                    borderRadius: 13,
                    padding: 12,
                  }}
                >
                  <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
                  <Text style={{ flex: 1, color: "#9E2921", fontSize: 13, lineHeight: 19 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={signIn}
                style={({ pressed }) => ({
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: pressed ? "#1B5B45" : "#176B4D",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: busy ? 0.75 : 1,
                  shadowColor: "#176B4D",
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
                    <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "850" }}>Sign in securely</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </Pressable>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
                <Text style={{ color: "#748278", fontSize: 13 }}>New to SaMi?</Text>
                <Link href="/(auth)/register" style={{ color: "#176B4D", fontSize: 13, fontWeight: "800" }}>
                  Create an account
                </Link>
              </View>
            </View>

            <View style={{ alignItems: "center", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#718277" />
                <Text style={{ color: "#718277", fontSize: 11, fontWeight: "700" }}>
                  Your account stays protected
                </Text>
              </View>
              <Text style={{ color: "#8A968D", fontSize: 11, textAlign: "center", lineHeight: 17 }}>
                Your Everyday Help Organised.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
