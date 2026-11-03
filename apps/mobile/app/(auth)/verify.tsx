
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

  const deliveryHint =
    typeof params.deliveryHint === "string"
      ? params.deliveryHint
      : "your registered email address";

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
      setError(
        "This verification request is missing or expired. Please return and request a new code.",
      );
      return;
    }

    if (!validCode) {
      setError("Enter the complete six-digit verification code.");
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
          : "Verification failed. Check your code and try again.",
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
            paddingHorizontal: 22,
            paddingTop: compact ? 14 : 26,
            paddingBottom: compact ? 28 : 30,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              gap: compact ? 17 : 25,
            }}
          >
            {/* Original SaMi wordmark */}
            <View style={{ gap: compact ? 12 : 19 }}>
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

              <View style={{ gap: 10 }}>
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
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={palette.accent}
                  />
                  <Text
                    style={{
                      color: palette.accentText,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 1,
                    }}
                  >
                    SECURE ACCOUNT VERIFICATION
                  </Text>
                </View>

                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 33,
                    lineHeight: 40,
                    fontWeight: "900",
                    letterSpacing: -1,
                  }}
                >
                  Verify your{"\n"}email address.
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 14,
                    lineHeight: 22,
                    maxWidth: 370,
                  }}
                >
                  Enter the six-digit verification code sent to{" "}
                  <Text
                    style={{
                      color: palette.heading,
                      fontWeight: "800",
                    }}
                  >
                    {deliveryHint}
                  </Text>
                  .
                </Text>
              </View>
            </View>

            {/* Verification card */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 25,
                borderWidth: 1,
                borderColor: palette.border,
                padding: compact ? 18 : 21,
                gap: compact ? 16 : 19,
                shadowColor: "#000000",
                shadowOpacity: darkMode ? 0.18 : 0.05,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 9 },
                elevation: 2,
              }}
            >
              {/* Email illustration */}
              <View
                style={{
                  alignItems: "center",
                  gap: 9,
                  paddingVertical: compact ? 2 : 8,
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 21,
                    backgroundColor: palette.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="mail-open-outline"
                    size={29}
                    color={palette.accent}
                  />
                </View>

                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 19,
                    fontWeight: "900",
                    letterSpacing: -0.35,
                  }}
                >
                  Check your inbox
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 12,
                    lineHeight: 19,
                    textAlign: "center",
                    maxWidth: 300,
                  }}
                >
                  Your one-time code is valid for a limited time.
                  Check your spam folder if you cannot find the email.
                </Text>
              </View>

              {/* OTP input */}
              <View style={{ gap: 9 }}>
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 0.35,
                  }}
                >
                  SIX-DIGIT VERIFICATION CODE
                </Text>

                <View
                  ref={codeFieldRef}
                  collapsable={false}
                >
                  <TextInput
                    ref={codeInputRef}
                    accessibilityLabel="Six-digit verification code"
                    accessibilityHint="Enter the six-digit code sent to your email"
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
                      minHeight: 64,
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
                      letterSpacing: 9,
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

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {code.length} of 6 digits entered
                </Text>
              </View>

              {/* Error feedback */}
              {error ? (
                <View
                  accessibilityRole="alert"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 9,
                    padding: 12,
                    borderRadius: 13,
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
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: palette.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 9,
                  opacity:
                    busy || !validCode || !challengeId
                      ? 0.55
                      : pressed
                        ? 0.85
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
                        fontWeight: "800",
                      }}
                    >
                      Verify and continue
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </Pressable>

              {/* Return to the correct authentication screen */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  purpose === "register"
                    ? "Return to registration"
                    : "Return to sign in"
                }
                disabled={busy}
                onPress={goBack}
                style={({ pressed }) => ({
                  minHeight: 48,
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
                    fontWeight: "800",
                  }}
                >
                  {purpose === "register"
                    ? "Back to registration"
                    : "Back to sign in"}
                </Text>
              </Pressable>
            </View>

            {/* Security footer */}
            <View
              style={{
                alignItems: "center",
                gap: 7,
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
                  name="lock-closed-outline"
                  size={14}
                  color={palette.muted}
                />

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  Your verification stays private and secure.
                </Text>
              </View>

              <Text
                style={{
                  color: palette.muted,
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                SaMi — Consider it done.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
