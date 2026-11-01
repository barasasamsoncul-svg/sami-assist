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
import { router, useLocalSearchParams } from "expo-router";
import { dispatchPost } from "@/api";

const NAVY = "#000535";
const BLUE = "#3478E5";
const MUTED = "#778197";
const BORDER = "#DCE2EC";
const PAGE = "#F7F8FC";

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    challengeId?: string;
    purpose?: string;
    deliveryHint?: string;
    channel?: string;
  }>();

  const challengeId =
    typeof params.challengeId === "string" ? params.challengeId : "";

  const purpose = params.purpose === "register" ? "register" : "login";

  const deliveryHint =
    typeof params.deliveryHint === "string"
      ? params.deliveryHint
      : "your email address";

  const channel =
    typeof params.channel === "string" ? params.channel : "email";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);
  const codeFieldRef = useRef<View | null>(null);
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

              // Keep the current page position if the code field is visible.
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

  async function verify() {
    if (!challengeId) {
      setError(
        "This verification request is missing. Go back and request a new code."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      await dispatchPost("verifyOtp", {
        challengeId,
        code: code.trim(),
      });

      router.replace("/(app)");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Code verification failed."
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy || code.trim().length !== 6 || !challengeId;

  const channelLabel = channel === "email" ? "email" : channel;

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
          <View style={styles.content}>
            {/* INTRODUCTION */}
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>

              <Text style={styles.title}>Verify your account</Text>

              <Text style={styles.subtitle}>
                One more step to access your SaMi account. Enter the
                verification code we sent to:
              </Text>

              <Text style={styles.deliveryAddress}>
                {deliveryHint}
              </Text>
            </View>

            {/* VERIFICATION FORM */}
            <View style={styles.form}>
              <View style={styles.codeCard}>
                <View style={styles.codeIconCircle}>
                  <Text style={styles.codeIcon}>✉</Text>
                </View>

                <Text style={styles.codeHeading}>
                  Enter verification code
                </Text>

                <Text style={styles.codeDescription}>
                  Enter the six-digit code sent via {channelLabel}.
                </Text>

                {/* FOCUSED FIELD MEASUREMENT AREA */}
                <View
                  ref={codeFieldRef}
                  collapsable={false}
                  style={styles.codeInputWrapper}
                >
                  <TextInput
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    placeholder="000000"
                    placeholderTextColor="#B3BBCB"
                    value={code}
                    onChangeText={(value) =>
                      setCode(value.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                    onFocus={() =>
                      handleInputFocus(codeFieldRef.current)
                    }
                    style={styles.codeInput}
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={verify}
                    editable={!busy}
                    accessibilityLabel="Six-digit verification code"
                  />
                </View>

                <Text style={styles.expiry}>
                  Codes expire after 10 minutes.
                </Text>
              </View>

              {/* ERROR */}
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}

              {/* VERIFY BUTTON */}
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={verify}
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
                      Verify and continue
                    </Text>

                    <Text style={styles.buttonArrow}>→</Text>
                  </>
                )}
              </Pressable>

              {/* BACK BUTTON */}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  router.replace(
                    purpose === "register"
                      ? "/(auth)/register"
                      : "/(auth)/login"
                  )
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            </View>

            <View style={styles.bottomNote}>
              <Text style={styles.bottomNoteText}>
                Your account security matters to us.
              </Text>
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
    paddingTop: 36,
  },

  content: {
    flexGrow: 1,
  },

  intro: {
    gap: 10,
    marginBottom: 35,
  },

  eyebrow: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },

  title: {
    color: NAVY,
    fontSize: 31,
    fontWeight: "800",
    letterSpacing: -0.8,
  },

  subtitle: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 24,
  },

  deliveryAddress: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  form: {
    gap: 18,
  },

  codeCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: "center",
  },

  codeIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#EDF3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  codeIcon: {
    color: BLUE,
    fontSize: 25,
  },

  codeHeading: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "800",
  },

  codeDescription: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },

  codeInputWrapper: {
    width: "100%",
  },

  codeInput: {
    width: "100%",
    height: 70,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    marginTop: 22,
    color: NAVY,
    textAlign: "center",
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: 10,
    paddingLeft: 10,
  },

  expiry: {
    color: MUTED,
    fontSize: 12,
    marginTop: 13,
    textAlign: "center",
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
    paddingHorizontal: 24,
    gap: 14,
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

  secondaryButton: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  secondaryButtonText: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "700",
  },

  bottomNote: {
    alignItems: "center",
    marginTop: 30,
    paddingVertical: 12,
  },

  bottomNoteText: {
    color: MUTED,
    fontSize: 12,
  },
});