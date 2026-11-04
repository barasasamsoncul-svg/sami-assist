import { useRef, useState } from "react";
import type { ComponentProps, RefObject } from "react";

import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardTypeOptions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  type TextInputProps,
  View,
  useColorScheme,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";

import { dispatchPost } from "@/api";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

type Palette = {
  background: string;
  surface: string;
  input: string;
  heading: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  icon: string;
  errorBackground: string;
  errorText: string;
  buttonText: string;
};

const LIGHT: Palette = {
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
  buttonText: "#FFFFFF",
};

const DARK: Palette = {
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
  buttonText: "#FFFFFF",
};

type FormFieldProps = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  fieldRef: RefObject<View | null>;
  inputRef: RefObject<TextInput | null>;
  onFocus: () => void;
  palette: Palette;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
};

function FormField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  fieldRef,
  inputRef,
  onFocus,
  palette,
  keyboardType = "default",
  autoCapitalize = "none",
  textContentType,
  returnKeyType = "next",
  onSubmitEditing,
}: FormFieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: palette.text,
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 0.45,
        }}
      >
        {label.toUpperCase()}
      </Text>

      <View
        ref={fieldRef}
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
          name={icon}
          size={20}
          color={palette.icon}
        />

        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
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
  );
}

function formatKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("254")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+254${digits.slice(1)}`;
  }

  return digits ? `+254${digits}` : "";
}

export default function RegisterScreen() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === "dark" ? DARK : LIGHT;
  const darkMode = colorScheme === "dark";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fullNameFieldRef = useRef<View>(null);
  const emailFieldRef = useRef<View>(null);
  const phoneFieldRef = useRef<View>(null);

  const fullNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);

  const {
    scrollRef,
    viewportRef,
    keyboardHeight,
    onFieldFocus,
    onScroll,
  } = useKeyboardAwareScroll();

  const phoneDigits = phone.replace(/\D/g, "");

  const validName = fullName.trim().length >= 2;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email.trim(),
  );

  const validPhone =
    phoneDigits.length >= 9 &&
    phoneDigits.length <= 12;

  const canSubmit =
    validName &&
    validEmail &&
    validPhone &&
    !busy;

  async function sendCode() {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!validName) {
      setError("Enter your full name.");
      return;
    }

    if (!validEmail) {
      setError("Enter a valid email address.");
      return;
    }

    if (!validPhone) {
      setError("Enter a valid Kenyan mobile number.");
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
        purpose: "register",
        fullName: cleanName,
        email: cleanEmail,
        phone: formatKenyanPhone(phone),
        channel: "email",
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
      setError(
        e instanceof Error
          ? e.message
          : "Could not send your verification code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
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
            justifyContent:
              keyboardHeight > 0 ? "flex-start" : "center",
            paddingHorizontal: 22,
            paddingTop: keyboardHeight > 0 ? 16 : 28,
            paddingBottom:
              keyboardHeight > 0
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

            {/* Registration card */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: palette.border,
                padding: 22,
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
                Create your account
              </Text>

              {/* Full name */}
              <FormField
                fieldRef={fullNameFieldRef}
                inputRef={fullNameInputRef}
                onFocus={() =>
                  onFieldFocus(fullNameFieldRef.current)
                }
                palette={palette}
                label="Full name"
                icon="person-outline"
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  setError("");
                }}
                placeholder="Enter your full name"
                autoCapitalize="words"
                textContentType="name"
                onSubmitEditing={() =>
                  emailInputRef.current?.focus()
                }
              />

              {/* Email */}
              <FormField
                fieldRef={emailFieldRef}
                inputRef={emailInputRef}
                onFocus={() =>
                  onFieldFocus(emailFieldRef.current)
                }
                palette={palette}
                label="Email address"
                icon="mail-outline"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError("");
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                onSubmitEditing={() =>
                  phoneInputRef.current?.focus()
                }
              />

              {/* Phone */}
              <FormField
                fieldRef={phoneFieldRef}
                inputRef={phoneInputRef}
                onFocus={() =>
                  onFieldFocus(phoneFieldRef.current)
                }
                palette={palette}
                label="Phone number"
                icon="call-outline"
                value={phone}
                onChangeText={(value) => {
                  setPhone(value);
                  setError("");
                }}
                placeholder="07XX XXX XXX"
                keyboardType="phone-pad"
                autoCapitalize="none"
                textContentType="telephoneNumber"
                returnKeyType="done"
                onSubmitEditing={sendCode}
              />

              {/* Validation feedback */}
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

              {/* Create account */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create account and send verification code"
                disabled={!canSubmit}
                onPress={sendCode}
                style={({ pressed }) => ({
                  minHeight: 58,
                  borderRadius: 17,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: !canSubmit
                    ? 0.50
                    : pressed
                      ? 0.86
                      : 1,
                })}
              >
                {busy ? (
                  <ActivityIndicator
                    color={palette.buttonText}
                  />
                ) : (
                  <>
                    <Text
                      style={{
                        color: palette.buttonText,
                        fontSize: 15,
                        fontWeight: "900",
                      }}
                    >
                      Create account
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color={palette.buttonText}
                    />
                  </>
                )}
              </Pressable>

              {/* Existing account */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
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
                  Already have an account?
                </Text>

                <Link
                  href="/(auth)/login"
                  style={{
                    color: palette.accent,
                    fontSize: 13,
                    fontWeight: "900",
                  }}
                >
                  Sign in
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