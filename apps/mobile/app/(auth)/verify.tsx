
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
import { router, useLocalSearchParams } from "expo-router";

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
  errorBackground: "#3B1D27",
  errorText: "#FFB8B4",
};

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    challengeId?: string;
    purpose?: string;
    deliveryHint?: string;
    channel?: string;
  }>();

  const challengeId =
    typeof params.challengeId === "string"
      ? params.challengeId
      : "";

  const purpose =
    params.purpose === "register" ? "register" : "login";

  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? DARK : LIGHT;
  const darkMode = colorScheme === "dark";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const codeFieldRef = useRef<View>(null);
  const codeInputRef = useRef<TextInput>(null);

  const {
    scrollRef,
    viewportRef,
    keyboardHeight,
    onFieldFocus,
    onScroll,
  } = useKeyboardAwareScroll();

  const compact = keyboardHeight > 0;
  const validCode = /^[0-9]{6}$/.test(code);

  async function verify() {
    if (!challengeId) {
      setError("Request a new verification code.");
      return;
    }

    if (!validCode) {
      setError("Enter the complete six-digit code.");
      return;
    }

    Keyboard.dismiss();
    setBusy(true);
    setError("");

    try {
      await dispatchPost("verifyOtp", {
        challengeId,
        code,
      });

      router.replace("/(app)");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verification failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    if (busy) return;

    router.replace(
      purpose === "register"
        ? "/(auth)/register"
        : "/(auth)/login",
    );
  }

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

            {/* Verification card */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: palette.border,
                padding: compact ? 20 : 22,
                gap: 22,
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
                Verify code
              </Text>

              {/* Six-digit code */}
              <View style={{ gap: 9 }}>
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 0.45,
                  }}
                >
                  VERIFICATION CODE
                </Text>

                <View
                  ref={codeFieldRef}
                  collapsable={false}
                >
                  <TextInput
                    ref={codeInputRef}
                    accessibilityLabel="Six-digit verification code"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    placeholder="000000"
                    placeholderTextColor={palette.muted}
                    value={code}
                    onChangeText={(value) => {
                      setCode(
                        value.replace(/[^0-9]/g, "").slice(0, 6),
                      );
                      setError("");
                    }}
                    onFocus={() =>
                      onFieldFocus(codeFieldRef.current)
                    }
                    style={{
                      minHeight: 66,
                      borderWidth: 1.5,
                      borderColor: validCode
                        ? palette.accent
                        : palette.border,
                      borderRadius: 16,
                      backgroundColor: palette.input,
                      color: palette.heading,
                      textAlign: "center",
                      fontSize: 27,
                      fontWeight: "900",
                      letterSpacing: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                    }}
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={verify}
                    editable={!busy}
                    selectTextOnFocus
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
                    padding: 13,
                    borderRadius: 14,
                    backgroundColor: palette.errorBackground,
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

              {/* Verify action */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Verify code and continue"
                disabled={busy || !validCode || !challengeId}
                onPress={verify}
                style={({ pressed }) => ({
                  minHeight: 58,
                  borderRadius: 17,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity:
                    busy || !validCode || !challengeId
                      ? 0.50
                      : pressed
                        ? 0.86
                        : 1,
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
                      Verify and continue
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              {/* Back navigation */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  purpose === "register"
                    ? "Back to registration"
                    : "Back to sign in"
                }
                disabled={busy}
                onPress={goBack}
                style={({ pressed }) => ({
                  minHeight: 46,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: busy ? 0.5 : pressed ? 0.65 : 1,
                })}
              >
                <Ionicons
                  name="arrow-back"
                  size={17}
                  color={palette.accent}
                />

                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 14,
                    fontWeight: "900",
                  }}
                >
                  {purpose === "register"
                    ? "Back to registration"
                    : "Back to sign in"}
                </Text>
              </Pressable>
            </View>

            {/* SaMi tagline */}
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
