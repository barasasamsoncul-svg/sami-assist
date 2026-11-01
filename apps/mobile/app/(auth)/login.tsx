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
const PAGE = "#FFFFFF";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const channel: OtpChannel = "email";

  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);
  const identifierFieldRef = useRef<View | null>(null);
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

              // Do not scroll if the focused input is already visible.
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

  async function sendCode() {
    setBusy(true);
    setError("");

    try {
      const result = await dispatchPost<{
        challengeId: string;
        deliveryHint: string;
        channel: OtpChannel;
      }>("requestOtp", {
        purpose: "login",
        identifier: identifier.trim(),
        channel,
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
          : "Could not send the verification code."
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !identifier.trim();

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar backgroundColor={PAGE} barStyle="dark-content" />

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
            { paddingBottom: Math.max(36, keyboardHeight + 36) },
          ]}
        >
          {/* INTRODUCTION */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>

            <Text style={styles.title}>Sign in to SaMi</Text>

            <Text style={styles.subtitle}>
              Your everyday help is just a step away. Enter your account
              details to continue.
            </Text>
          </View>

          {/* LOGIN FORM */}
          <View style={styles.form}>
            {/* ACCOUNT IDENTIFIER */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Email address or phone number
              </Text>

              <View
                ref={identifierFieldRef}
                collapsable={false}
                style={styles.inputContainer}
              >
                <Text style={styles.inputIcon}>✉</Text>

                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  placeholder="Enter your email or phone"
                  placeholderTextColor="#929BAD"
                  value={identifier}
                  onChangeText={setIdentifier}
                  onFocus={() =>
                    handleInputFocus(identifierFieldRef.current)
                  }
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* EMAIL VERIFICATION NOTICE */}
            <View style={styles.verification}>
              <Text style={styles.verificationTitle}>Secure sign in</Text>

              <View style={styles.emailNotice}>
                <View style={styles.emailIconCircle}>
                  <Text style={styles.emailIcon}>✉</Text>
                </View>

                <View style={styles.emailNoticeText}>
                  <Text style={styles.emailNoticeHeading}>
                    Password-free access
                  </Text>

                  <Text style={styles.emailNoticeDescription}>
                    We&apos;ll send a six-digit verification code to the
                    email address linked to your account.
                  </Text>
                </View>
              </View>
            </View>

            {/* ERROR MESSAGE */}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {/* SIGN IN BUTTON */}
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

            {/* CREATE ACCOUNT */}
            <View style={styles.signUp}>
              <Text style={styles.signUpText}>New to SaMi?</Text>

              <Link href="/(auth)/register" style={styles.signUpLink}>
                Create an account
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
    minHeight: 104,
    backgroundColor: PAGE,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    paddingHorizontal: 25,
    paddingTop: 8,
    paddingBottom: 0,
  },

  wordmark: {
    width: 184,
    height: 78,
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
    paddingTop: 22,
    paddingBottom: 28,
  },

  intro: {
    marginBottom: 26,
    gap: 10,
  },

  eyebrow: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },

  title: {
    color: NAVY,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.9,
  },

  subtitle: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 330,
  },

  form: {
    gap: 24,
  },

  fieldGroup: {
    gap: 11,
  },

  fieldLabel: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "700",
  },

  inputContainer: {
    minHeight: 66,
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
    fontSize: 22,
    width: 38,
    fontWeight: "600",
  },

  input: {
    flex: 1,
    minHeight: 64,
    color: NAVY,
    fontSize: 16,
    fontWeight: "500",
  },

  verification: {
    gap: 12,
    marginTop: 3,
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
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  emailIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#EDF3FF",
    justifyContent: "center",
    alignItems: "center",
  },

  emailIcon: {
    fontSize: 22,
    color: BLUE,
  },

  emailNoticeText: {
    flex: 1,
    gap: 5,
  },

  emailNoticeHeading: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },

  emailNoticeDescription: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
  },

  error: {
    color: "#D32F2F",
    fontSize: 13,
    lineHeight: 20,
  },

  primaryButton: {
    minHeight: 66,
    borderRadius: 34,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    marginTop: 5,
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

  signUp: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
  },

  signUpText: {
    color: MUTED,
    fontSize: 14,
  },

  signUpLink: {
    color: BLUE,
    fontSize: 14,
    fontWeight: "800",
  },
});