
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
  input: "#F8FAFE",
  heading: "#071A3D",
  text: "#24364F",
  muted: "#78869B",
  border: "#E1E8F2",
  accent: "#174A91",
  accentSoft: "#EDF3FC",
  accentText: "#174A91",
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

    if (
      !isEmail &&
      value.replace(/\D/g, "").length < 9
    ) {
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
        identifier: isEmail
          ? value.toLowerCase()
          : value,
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
        barStyle={
          darkMode ? "light-content" : "dark-content"
        }
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
            paddingHorizontal: 22,
            paddingTop: compact ? 16 : 28,
            paddingBottom: compact
              ? Math.max(30, keyboardHeight + 20)
              : 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              gap: 26,
            }}
          >
            {/* SaMi brand */}
            <View
              style={{
                alignItems: "center",
                paddingVertical: 2,
              }}
            >
              <Image
                source={require("../../assets/sami-welcome-wordmark-transparent.png")}
                style={{
                  width: 190,
                  height: 62,
                }}
                resizeMode="contain"
                accessibilityLabel="SaMi - Consider it done"
              />
            </View>

            {/* Sign-in card */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: palette.border,
                padding: compact ? 20 : 22,
                gap: 21,
                shadowColor: "#000000",
                shadowOpacity: darkMode ? 0.20 : 0.055,
                shadowRadius: 24,
                shadowOffset: {
                  width: 0,
                  height: 10,
                },
                elevation: 3,
              }}
            >
              {/* Heading */}
              <Text
                style={{
                  color: palette.heading,
                  fontSize: 25,
                  fontWeight: "900",
                  letterSpacing: -0.8,
                }}
              >
                Sign in
              </Text>

              {/* Email or phone */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 0.45,
                  }}
                >
                  EMAIL ADDRESS OR PHONE NUMBER
                </Text>

                <View
                  ref={identifierFieldRef}
                  collapsable={false}
                  style={{
                    minHeight: 58,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    borderRadius: 16,
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
                      minHeight: 54,
                      color: palette.heading,
                      fontSize: 15,
                      paddingVertical: 12,
                    }}
                  />
                </View>
              </View>

              {/* Error feedback */}
              {error ? (
                <View
                  accessibilityRole="alert"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 9,
                    backgroundColor: palette.errorBackground,
                    borderRadius: 14,
                    padding: 13,
                  }}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={19}
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

              {/* Sign-in action */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send verification code"
                disabled={disabled}
                onPress={sendCode}
                style={({ pressed }) => ({
                  minHeight: 58,
                  borderRadius: 17,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: disabled
                    ? 0.50
                    : pressed
                      ? 0.86
                      : 1,
                  shadowColor: palette.accent,
                  shadowOpacity: darkMode ? 0.08 : 0.14,
                  shadowRadius: 10,
                  shadowOffset: {
                    width: 0,
                    height: 5,
                  },
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
                        fontWeight: "900",
                      }}
                    >
                      Send verification code
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              {/* Registration link */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  flexWrap: "wrap",
                  paddingTop: 2,
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
                    fontWeight: "900",
                  }}
                >
                  Create an account
                </Link>
              </View>
            </View>

            {/* Official SaMi tagline */}
            <View
              style={{
                alignItems: "center",
                paddingTop: 2,
                paddingBottom: 5,
              }}
            >
              <Text
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  fontWeight: "800",
                  letterSpacing: 0.5,
                }}
              >
                SaMi. Consider it done.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
