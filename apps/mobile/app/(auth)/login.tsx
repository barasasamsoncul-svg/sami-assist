
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

const LIGHT = {
  background: "#F4F7FC",
  surface: "#FFFFFF",
  input: "#FBFCFF",
  heading: "#173B67",
  text: "#24364F",
  muted: "#6C7B91",
  border: "#DCE5F2",
  accent: "#2463B8",
  accentSoft: "#EAF1FC",
  accentText: "#214E8C",
  icon: "#71839B",
  errorBackground: "#FFF0ED",
  errorText: "#9E2921",
};

const DARK = {
  background: "#080F1D",
  surface: "#111C2E",
  input: "#0B1628",
  heading: "#F2F6FC",
  text: "#D7E1EF",
  muted: "#AAB8CC",
  border: "#2A3A52",
  accent: "#79AEFF",
  accentSoft: "#142A49",
  accentText: "#C3DBFF",
  icon: "#9FB0C7",
  errorBackground: "#3B1D27",
  errorText: "#FFB8B4",
};

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? DARK : LIGHT;
  const darkMode = colorScheme === "dark";

  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const identifierFieldRef = useRef<View>(null);
  const identifierInputRef = useRef<TextInput>(null);

  const {
    scrollRef,
    viewportRef,
    keyboardHeight,
    onFieldFocus,
    onScroll,
  } = useKeyboardAwareScroll();

  const compact = keyboardHeight > 0;

  async function sendCode() {
    const value = identifier.trim();
    const isEmail = value.includes("@");

    if (!value) {
      setError("Enter your email address or Kenyan phone number.");
      return;
    }

    if (
      isEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    if (!isEmail && value.replace(/\D/g, "").length < 9) {
      setError("Enter a valid Kenyan phone number.");
      return;
    }

    Keyboard.dismiss();
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
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
    >
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={palette.background}
      />

      <View
        ref={viewportRef}
        collapsable={false}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: compact ? "flex-start" : "center",
            paddingHorizontal: 24,
            paddingTop: compact ? 12 : 24,
            paddingBottom: 30,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              gap: compact ? 16 : 26,
            }}
          >
            {/* Original SaMi wordmark */}
            <View style={{ gap: compact ? 12 : 21 }}>
              <Image
                source={require("../../assets/sami-welcome-wordmark-transparent.png")}
                style={{
                  width: 190,
                  height: 58,
                  alignSelf: "flex-start",
                }}
                resizeMode="contain"
                accessibilityLabel="SaMi - Consider it done"
              />

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
                    backgroundColor: palette.accentSoft,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: palette.accent,
                    }}
                  />
                  <Text
                    style={{
                      color: palette.accentText,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 1,
                    }}
                  >
                    YOUR DAY, A LITTLE LIGHTER
                  </Text>
                </View>

                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 34,
                    lineHeight: 41,
                    fontWeight: "900",
                    letterSpacing: -1.1,
                  }}
                >
                  Good to have{"\n"}you back.
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 14,
                    lineHeight: 22,
                    maxWidth: 360,
                  }}
                >
                  Sign in securely using a one-time verification code.
                  No password needed.
                </Text>
              </View>
            </View>

            {/* Sign-in card */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 25,
                borderWidth: 1,
                borderColor: palette.border,
                padding: compact ? 18 : 21,
                gap: compact ? 15 : 18,
                shadowColor: "#000000",
                shadowOpacity: darkMode ? 0.18 : 0.05,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 9 },
                elevation: 2,
              }}
            >
              <View style={{ gap: 5 }}>
                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 21,
                    fontWeight: "900",
                    letterSpacing: -0.45,
                  }}
                >
                  Sign in
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  Enter the email address or Kenyan phone number
                  linked to your SaMi account.
                </Text>
              </View>

              {/* Email or phone input */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 0.3,
                  }}
                >
                  EMAIL ADDRESS OR PHONE NUMBER
                </Text>

                <View
                  ref={identifierFieldRef}
                  collapsable={false}
                  style={{
                    minHeight: 56,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    paddingHorizontal: 14,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.input,
                  }}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={21}
                    color={palette.icon}
                  />

                  <TextInput
                    ref={identifierInputRef}
                    accessibilityLabel="Email address or phone number"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="go"
                    onSubmitEditing={sendCode}
                    textContentType="username"
                    placeholder="you@example.com or 07XX XXX XXX"
                    placeholderTextColor={palette.muted}
                    value={identifier}
                    onChangeText={(value) => {
                      setIdentifier(value);
                      setError("");
                    }}
                    onFocus={() =>
                      onFieldFocus(identifierFieldRef.current)
                    }
                    style={{
                      flex: 1,
                      minHeight: 52,
                      color: palette.heading,
                      fontSize: 15,
                      paddingVertical: 13,
                    }}
                  />
                </View>
              </View>

              {/* Verification information */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 9,
                  padding: 13,
                  borderRadius: 14,
                  backgroundColor: palette.accentSoft,
                }}
              >
                <Ionicons
                  name="mail-unread-outline"
                  size={19}
                  color={palette.accent}
                />

                <Text
                  style={{
                    flex: 1,
                    color: palette.accentText,
                    fontSize: 12,
                    lineHeight: 19,
                  }}
                >
                  Your verification code is delivered to the email
                  address registered to your SaMi account.
                </Text>
              </View>

              {error ? (
                <View
                  accessibilityRole="alert"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    backgroundColor: palette.errorBackground,
                    borderRadius: 13,
                    padding: 12,
                  }}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#D0443C"
                  />

                  <Text
                    style={{
                      flex: 1,
                      color: palette.errorText,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {error}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send verification code"
                disabled={disabled}
                onPress={sendCode}
                style={({ pressed }) => ({
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
                  shadowColor: palette.accent,
                  shadowOpacity: darkMode ? 0.08 : 0.17,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 2,
                })}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 15,
                        fontWeight: "800",
                      }}
                    >
                      Send verification code
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 13,
                  }}
                >
                  New to SaMi?
                </Text>

                <Link
                  href="/(auth)/register"
                  style={{
                    color: palette.accent,
                    fontSize: 13,
                    fontWeight: "800",
                  }}
                >
                  Create an account
                </Link>
              </View>
            </View>

            {/* Security footer */}
            <View
              style={{
                alignItems: "center",
                gap: 8,
                paddingBottom: 4,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color={palette.muted}
                />
                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  Your account stays protected
                </Text>
              </View>

              <Text
                style={{
                  color: palette.muted,
                  fontSize: 11,
                  textAlign: "center",
                  lineHeight: 17,
                }}
              >
                Consider it done.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
