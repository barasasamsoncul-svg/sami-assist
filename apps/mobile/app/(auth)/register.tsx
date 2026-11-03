
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
  text: string;
  heading: string;
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
  input: "#FBFCFF",
  text: "#24364F",
  heading: "#173B67",
  muted: "#6C7B91",
  border: "#DCE5F2",
  accent: "#2463B8",
  accentSoft: "#EAF1FC",
  accentText: "#214E8C",
  icon: "#71839B",
  errorBackground: "#FFF0ED",
  errorText: "#9E2921",
  buttonText: "#FFFFFF",
};

const DARK: Palette = {
  background: "#080F1D",
  surface: "#111C2E",
  input: "#0B1628",
  text: "#D7E1EF",
  heading: "#F2F6FC",
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
          letterSpacing: 0.35,
        }}
      >
        {label.toUpperCase()}
      </Text>

      <View
        ref={fieldRef}
        collapsable={false}
        style={{
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 15,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.input,
        }}
      >
        <Ionicons name={icon} size={20} color={palette.icon} />

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
            minHeight: 52,
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
    phoneDigits.length >= 9 && phoneDigits.length <= 12;

  const canSubmit = validName && validEmail && validPhone && !busy;

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
            justifyContent:
              keyboardHeight > 0 ? "flex-start" : "center",
            paddingHorizontal: 22,
            paddingTop: keyboardHeight > 0 ? 18 : 26,
            paddingBottom:
              keyboardHeight > 0
                ? Math.max(28, keyboardHeight + 20)
                : 26,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              gap: 22,
            }}
          >
            {/* Original SaMi wordmark */}
            <View style={{ gap: 17 }}>
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
                    name="sparkles-outline"
                    size={14}
                    color={palette.accent}
                  />
                  <Text
                    style={{
                      color: palette.accentText,
                      fontSize: 10,
                      fontWeight: "800",
                      letterSpacing: 0.9,
                    }}
                  >
                    YOUR EVERYDAY HELP, ORGANISED
                  </Text>
                </View>

                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 33,
                    lineHeight: 40,
                    fontWeight: "900",
                    letterSpacing: -1.1,
                  }}
                >
                  Your day,{"\n"}made easier.
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 14,
                    lineHeight: 22,
                    maxWidth: 360,
                  }}
                >
                  Create your SaMi account and let everyday errands
                  become easier to organise.
                </Text>
              </View>
            </View>

            {/* Customer registration form */}
            <View
              style={{
                backgroundColor: palette.surface,
                borderRadius: 25,
                borderWidth: 1,
                borderColor: palette.border,
                padding: 20,
                gap: 17,
                shadowColor: "#000000",
                shadowOpacity: darkMode ? 0.18 : 0.05,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
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
                  Create your account
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  Enter your details to get started with SaMi.
                </Text>
              </View>

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
                onSubmitEditing={() => emailInputRef.current?.focus()}
              />

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
                onSubmitEditing={() => phoneInputRef.current?.focus()}
              />

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

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  padding: 12,
                  borderRadius: 13,
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
                    lineHeight: 18,
                  }}
                >
                  We will send a six-digit verification code to your
                  email address.
                </Text>
              </View>

              {error ? (
                <View
                  accessibilityRole="alert"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: 12,
                    borderRadius: 13,
                    backgroundColor: palette.errorBackground,
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
                accessibilityLabel="Create account and send verification code"
                disabled={!canSubmit}
                onPress={sendCode}
                style={({ pressed }) => ({
                  minHeight: 56,
                  borderRadius: 16,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: !canSubmit ? 0.55 : pressed ? 0.85 : 1,
                })}
              >
                {busy ? (
                  <ActivityIndicator color={palette.buttonText} />
                ) : (
                  <>
                    <Text
                      style={{
                        color: palette.buttonText,
                        fontSize: 15,
                        fontWeight: "800",
                      }}
                    >
                      Create account
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={palette.buttonText}
                    />
                  </>
                )}
              </Pressable>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
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
                  Already have an account?
                </Text>

                <Link
                  href="/(auth)/login"
                  style={{
                    color: palette.accent,
                    fontSize: 13,
                    fontWeight: "800",
                  }}
                >
                  Sign in
                </Link>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                paddingBottom: 4,
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
                Your everyday help, organised.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
