import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { dispatchPost } from "@/api";

type OtpChannel = "email";

const NAVY = "#000535";
const BLUE = "#3478E5";
const MUTED = "#778197";
const BORDER = "#DCE2EC";
const PAGE = "#F7F8FC";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const channel: OtpChannel = "email";

  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);

  const fullNameFieldRef = useRef<View | null>(null);
  const phoneFieldRef = useRef<View | null>(null);
  const emailFieldRef = useRef<View | null>(null);

  const focusedField = useRef<View | null>(null);

  const keyboardTopY = useRef<number | null>(null);
  const keyboardHeightRef = useRef(0);
  const scrollY = useRef(0);
  const scrollPositionBeforeKeyboard = useRef<number | null>(null);
  const autoScrolledForKeyboard = useRef(false);

  const adjustFocusedInput = useCallback(() => {
    const field = focusedField.current;

    if (!field || keyboardTopY.current === null) {
      return;
    }

    requestAnimationFrame(() => {
      field.measureInWindow(
        (_x: number, fieldY: number, _width: number, fieldHeight: number) => {
          viewportRef.current?.measureInWindow(
            (
              _viewportX: number,
              viewportY: number,
              _viewportWidth: number,
              viewportHeight: number
            ) => {
              if (!scrollRef.current) return;

              const viewportBottom = viewportY + viewportHeight;

              const reportedKeyboardTop = keyboardTopY.current;

              const keyboardTop =
                reportedKeyboardTop !== null && reportedKeyboardTop > viewportY
                  ? reportedKeyboardTop
                  : viewportBottom - keyboardHeightRef.current;

              const visibleBottom = Math.min(
                viewportBottom,
                keyboardTop
              );

              const fieldBottom = fieldY + fieldHeight;

              const bottomOverflow = fieldBottom + 16 - visibleBottom;
              const topOverflow = viewportY + 12 - fieldY;

              let adjustment = 0;

              if (bottomOverflow > 0) {
                adjustment = bottomOverflow;
              } else if (topOverflow > 0) {
                adjustment = -topOverflow;
              }

              // Do not move the page when the focused field is visible.
              if (adjustment === 0) return;

              const targetY = Math.max(0, scrollY.current + adjustment);

              scrollY.current = targetY;
              autoScrolledForKeyboard.current = true;

              scrollRef.current.scrollTo({
                y: targetY,
                animated: true,
              });
            }
          );
        }
      );
    });
  }, []);

  useEffect(() => {
    const keyboardShow = Keyboard.addListener(
      "keyboardDidShow",
      (event) => {
        if (keyboardTopY.current === null) {
          scrollPositionBeforeKeyboard.current = scrollY.current;
        }

        keyboardTopY.current = event.endCoordinates.screenY;
        keyboardHeightRef.current = event.endCoordinates.height;

        setKeyboardHeight(event.endCoordinates.height);

        // Allow the keyboard inset and viewport layout to update first.
        requestAnimationFrame(() => {
          requestAnimationFrame(adjustFocusedInput);
        });
      }
    );

    const keyboardHide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTopY.current = null;
      keyboardHeightRef.current = 0;

      setKeyboardHeight(0);

      const previousPosition = scrollPositionBeforeKeyboard.current;
      const shouldRestore = autoScrolledForKeyboard.current;

      scrollPositionBeforeKeyboard.current = null;
      autoScrolledForKeyboard.current = false;

      if (shouldRestore && previousPosition !== null) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({
              y: previousPosition,
              animated: true,
            });

            scrollY.current = previousPosition;
          });
        });
      }
    });

    return () => {
      keyboardShow.remove();
      keyboardHide.remove();
    };
  }, [adjustFocusedInput]);

  function handleInputFocus(field: View | null) {
    focusedField.current = field;
    adjustFocusedInput();
  }

  function formatKenyanPhone(value: string) {
    const digits = value.replace(/\D/g, "");

    if (digits.startsWith("254")) {
      return `+${digits}`;
    }

    if (digits.startsWith("0")) {
      return `+254${digits.slice(1)}`;
    }

    return `+254${digits}`;
  }

  async function sendCode() {
    setBusy(true);
    setError("");

    try {
      const result = await dispatchPost<{
        challengeId: string;
        deliveryHint: string;
        channel: OtpChannel;
      }>("requestOtp", {
        purpose: "register",
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: formatKenyanPhone(phone),
        channel,
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
          : "Could not send the verification code."
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy ||
    fullName.trim().length < 2 ||
    !email.trim() ||
    phone.replace(/\D/g, "").length < 9;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar backgroundColor={NAVY} barStyle="light-content" />

      {/* BRAND HEADER */}
      <View style={styles.brandHeader}>
        <Image
          source={require("../../assets/sami-welcome-wordmark-transparent.png")}
          style={styles.wordmark}
          resizeMode="contain"
          accessibilityLabel="SaMi - Consider it done"
        />
      </View>

      <View
        ref={viewportRef}
        collapsable={false}
        style={styles.keyboard}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(32, keyboardHeight + 32) },
          ]}
        >
          {/* INTRODUCTION */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>WELCOME TO SAMI</Text>

            <Text style={styles.title}>Create your account</Text>

            <Text style={styles.subtitle}>
              Get started with SaMi and request any errand, anytime.
            </Text>
          </View>

          {/* REGISTRATION FORM */}
          <View style={styles.form}>
            {/* FULL NAME */}
            <View
              ref={fullNameFieldRef}
              collapsable={false}
              style={styles.inputContainer}
            >
              <Text style={styles.inputIcon}>♙</Text>

              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                placeholder="Full name"
                placeholderTextColor="#929BAD"
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => handleInputFocus(fullNameFieldRef.current)}
                style={styles.input}
                returnKeyType="next"
                
              />
            </View>

            {/* PHONE NUMBER */}
            <View
              ref={phoneFieldRef}
              collapsable={false}
              style={styles.phoneContainer}
            >
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇰🇪</Text>
                <Text style={styles.countryText}>+254</Text>
                <Text style={styles.dropdown}>⌄</Text>
              </View>

              <View style={styles.phoneDivider} />

              <TextInput
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="Phone number"
                placeholderTextColor="#929BAD"
                value={phone}
                onChangeText={setPhone}
                onFocus={() => handleInputFocus(phoneFieldRef.current)}
                style={styles.phoneInput}
                returnKeyType="next"
                maxLength={12}
              />
            </View>

            {/* EMAIL */}
            <View
              ref={emailFieldRef}
              collapsable={false}
              style={styles.inputContainer}
            >
              <Text style={styles.inputIcon}>✉</Text>

              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="Email address"
                placeholderTextColor="#929BAD"
                value={email}
                onChangeText={setEmail}
                onFocus={() => handleInputFocus(emailFieldRef.current)}
                style={styles.input}
                returnKeyType="done"
              />
            </View>

            {/* EMAIL VERIFICATION */}
            <View style={styles.verification}>
              <Text style={styles.verificationTitle}>
                Email verification
              </Text>

              <View style={styles.emailNotice}>
                <View style={styles.emailIconCircle}>
                  <Text style={styles.emailIcon}>✉</Text>
                </View>

                <View style={styles.emailNoticeText}>
                  <Text style={styles.emailNoticeHeading}>
                    Verify your email address
                  </Text>

                  <Text style={styles.emailNoticeDescription}>
                    We&apos;ll send your six-digit verification code to the
                    email address above.
                  </Text>
                </View>
              </View>
            </View>

            {/* ERROR */}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {/* CREATE ACCOUNT */}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={sendCode}
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && styles.disabledButton,
                pressed && !disabled && styles.pressedButton,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Send verification code
                  </Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </>
              )}
            </Pressable>

            {/* SIGN IN */}
            <View style={styles.signIn}>
              <Text style={styles.signInText}>Already registered?</Text>

              <Link href="/(auth)/login" style={styles.signInLink}>
                Sign in
              </Link>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE,
  },

  brandHeader: {
    minHeight: 150,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  wordmark: {
    width: 224,
    height: 104,
  },

  keyboard: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 25,
    paddingTop: 30,
  },

  intro: {
    marginBottom: 28,
    gap: 9,
  },

  eyebrow: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },

  title: {
    color: NAVY,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },

  subtitle: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 330,
  },

  form: {
    gap: 17,
  },

  inputContainer: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },

  inputIcon: {
    color: NAVY,
    fontSize: 23,
    width: 38,
    fontWeight: "600",
  },

  input: {
    flex: 1,
    minHeight: 62,
    color: NAVY,
    fontSize: 16,
    fontWeight: "500",
  },

  phoneContainer: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },

  countryCode: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 7,
  },

  flag: {
    fontSize: 22,
  },

  countryText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
  },

  dropdown: {
    color: MUTED,
    fontSize: 19,
  },

  phoneDivider: {
    height: 40,
    width: 1,
    backgroundColor: BORDER,
  },

  phoneInput: {
    flex: 1,
    minHeight: 62,
    paddingHorizontal: 15,
    color: NAVY,
    fontSize: 16,
    fontWeight: "500",
  },

  verification: {
    marginTop: 5,
    gap: 11,
  },

  verificationTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
  },

  emailNotice: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  emailIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EDF3FF",
    justifyContent: "center",
    alignItems: "center",
  },

  emailIcon: {
    fontSize: 21,
    color: BLUE,
  },

  emailNoticeText: {
    flex: 1,
    gap: 4,
  },

  emailNoticeHeading: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },

  emailNoticeDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },

  error: {
    color: "#D32F2F",
    fontSize: 13,
    lineHeight: 20,
  },

  primaryButton: {
    minHeight: 64,
    borderRadius: 32,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    marginTop: 4,
    gap: 16,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonArrow: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "400",
  },

  disabledButton: {
    opacity: 0.5,
  },

  pressedButton: {
    opacity: 0.85,
  },

  signIn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
    paddingVertical: 6,
  },

  signInText: {
    color: MUTED,
    fontSize: 14,
  },

  signInLink: {
    color: BLUE,
    fontSize: 14,
    fontWeight: "800",
  },
});