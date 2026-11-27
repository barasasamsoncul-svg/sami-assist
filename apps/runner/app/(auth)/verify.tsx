import type { TextInputInstance } from "react-native";
import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  requestRunnerOtp,
  requestRunnerRegistrationOtp,
  saveRunnerSession,
} from "@/api";

import {
  cancelRunnerRegistration,
  confirmRunnerRegistration,
  verifyRunnerEmailOtp,
  type RunnerAuthenticatedSession,
  type RunnerCustomerConfirmationRequired,
  type RunnerOtpFlowResult,
} from "@/registration-api";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

const WORDMARK = require("../../assets/sami-wordmark.png");

const OTP_RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;
const CODE_AUTOSUBMIT_DELAY_MS = 180;
const SUCCESS_FLASH_MS = 280;

type VerificationStep = "email" | "confirm";

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

function firstParam(value?: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function VerifyRunnerScreen() {
   const { colors, showOverlay } = useRunnerTheme();

  const params = useLocalSearchParams<{
    challengeId?: string | string[];
    destination?: string | string[];
    purpose?: string | string[];
    fullName?: string | string[];
    email?: string | string[];
    phone?: string | string[];
  }>();

  const initialChallengeId =
    firstParam(params.challengeId).trim();

  const initialDestination =
    firstParam(params.destination) || "your email address";

  const purpose = firstParam(params.purpose);
  const isRegistration = purpose === "register";

  const fullName = firstParam(params.fullName).trim();
  const email = firstParam(params.email).trim().toLowerCase();
  const phone = firstParam(params.phone).trim();

  const [step, setStep] = useState<VerificationStep>("email");

  const [challengeId, setChallengeId] = useState(
    initialChallengeId,
  );

  const [destination, setDestination] = useState(
    initialDestination,
  );

  const [confirmationToken, setConfirmationToken] = useState("");

  const [customerMatch, setCustomerMatch] =
    useState<RunnerCustomerConfirmationRequired["customerMatch"] | null>(
      null,
    );

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  const [inputHasError, setInputHasError] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const [resendAvailableAt, setResendAvailableAt] = useState(
    () =>
      initialChallengeId
        ? Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000
        : Date.now(),
  );

  const [resendCountdown, setResendCountdown] = useState(
    initialChallengeId
      ? OTP_RESEND_COOLDOWN_SECONDS
      : 0,
  );

  const codeInputRef = useRef<TextInputInstance>(null);
  const mountedRef = useRef(true);

  const verificationInFlightRef = useRef(false);
  const confirmationInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);

  const autoSubmittedCodeRef = useRef<string | null>(null);

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (step !== "email") return;

    const timeout = setTimeout(() => {
      codeInputRef.current?.focus();
    }, 380);

    return () => clearTimeout(timeout);
  }, [step]);

  /* =========================================================
     ANDROID HARDWARE BACK
  ========================================================= */

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (busy || verified) {
          return true;
        }

        router.replace(
          isRegistration
            ? "/(auth)/register"
            : "/(auth)/login",
        );

        return true;
      },
    );

    return () => subscription.remove();
  }, [busy, verified, isRegistration]);

  /* =========================================================
     RESEND COUNTDOWN
  ========================================================= */

  useEffect(() => {
    function tick() {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );

      setResendCountdown(remaining);
    }

    tick();

    const interval = setInterval(tick, 500);

    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  /* =========================================================
     MISSING INITIAL CHALLENGE
  ========================================================= */

  useEffect(() => {
    if (initialChallengeId) return;

    showOverlay({
      type: "warning",
      title: "Verification session unavailable",
      message:
        "This screen has no active verification challenge. Request a new code to continue.",
      primaryAction: {
        label: "Understood",
      },
    });
  }, [initialChallengeId, showOverlay]);

  /* =========================================================
     GLOBAL HELP
  ========================================================= */

  function showHelp() {
    showOverlay({
      type: "info",
      title: "SaMi Runner Help",
      message:
        "Enter the six-digit code sent to your email address. If your verified contact matches an existing SaMi Customer account, we will show the account name and ask for your permission before creating a separate Runner account.",
      primaryAction: {
        label: "Got it",
      },
    });
  }

  /* =========================================================
     CUSTOMER CONFIRMATION
  ========================================================= */

  function applyCustomerConfirmation(
    result: RunnerCustomerConfirmationRequired,
  ) {
    setConfirmationToken(result.confirmationToken);
    setCustomerMatch(result.customerMatch);

    setCode("");
    setInputHasError(false);

    autoSubmittedCodeRef.current = null;
    setStep("confirm");

    showOverlay({
      type: "info",
      title: "Customer account found",
      message:
        result.message ||
        "We found an existing SaMi Customer account. Review the account details and choose whether to create a separate Runner account.",
      primaryAction: {
        label: "Review account",
      },
    });
  }

  /* =========================================================
     SESSION COMPLETION
  ========================================================= */

  async function completeSession(
    result: RunnerAuthenticatedSession,
  ) {
    if (
      typeof result.sessionToken !== "string" ||
      result.sessionToken.length < 40
    ) {
      throw new Error(
        "The server did not return a valid Runner session.",
      );
    }

    await saveRunnerSession(result.sessionToken);

    if (!mountedRef.current) return;

    setVerified(true);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, SUCCESS_FLASH_MS);
    });

    if (!mountedRef.current) return;

    router.dismissAll();

    // Only the agreed Runner destinations are used.
    // Restricted accounts remain within the Documents stage.
    switch (result.nextStep) {
      case "tasks":
      case "onboarding": {
        router.replace("/(auth)/tasks");
        return;
      }

      case "documents":
      case "status": {
        router.replace("/(auth)/documents");
        return;
      }

      case "dashboard":
      case "app": {
        router.replace("/(app)");
        return;
      }

      case "restricted": {
        router.replace("/(auth)/documents");
        return;
      }

      default: {
        showOverlay({
          type: "error",
          title: "Account destination unavailable",
          message:
            "Your verification succeeded, but SaMi could not determine the next step for your Runner account. Please try signing in again or contact SaMi Support.",
          primaryAction: {
            label: "Understood",
          },
        });
        return;
      }
    }
  }

  /* =========================================================
     OTP FLOW RESULT
  ========================================================= */

  async function handleFlowResult(
    result: RunnerOtpFlowResult,
  ): Promise<void> {
    if (result.flow === "authenticated") {
      await completeSession(result);
      return;
    }

    if (!isRegistration) {
      throw new Error(
        "This confirmation response is not valid for Runner sign in.",
      );
    }

    applyCustomerConfirmation(result);
  }

  /* =========================================================
     VERIFY EMAIL CODE
  ========================================================= */

  async function verifyCode() {
    if (
      verificationInFlightRef.current ||
      busy ||
      resending ||
      verified ||
      step !== "email"
    ) {
      return;
    }

    if (!challengeId) {
      showOverlay({
        type: "warning",
        title: "Verification session unavailable",
        message:
          "Your verification session is missing. Request a new code before continuing.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    if (!/^[0-9]{6}$/.test(code)) {
      setInputHasError(true);

      showOverlay({
        type: "warning",
        title: "Verification code required",
        message: "Enter the complete six-digit verification code.",
        primaryAction: {
          label: "Try again",
        },
      });

      return;
    }

    verificationInFlightRef.current = true;

    setBusy(true);
    setInputHasError(false);

    try {
      const result = await verifyRunnerEmailOtp(
        challengeId,
        code,
      );

      if (!mountedRef.current) return;

      await handleFlowResult(result);
    } catch (cause) {
      if (!mountedRef.current) return;

      setInputHasError(true);

      showOverlay({
        type: "error",
        title: "Verification failed",
        message:
          cause instanceof Error
            ? cause.message
            : "The verification code could not be verified. Please try again.",
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      verificationInFlightRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  /* =========================================================
     OTP AUTO-SUBMIT
  ========================================================= */

  useEffect(() => {
    if (step !== "email") return;
    if (code.length !== CODE_LENGTH) return;

    if (
      busy ||
      resending ||
      verified ||
      !challengeId
    ) {
      return;
    }

    const submissionKey = `${challengeId}:${code}`;

    if (autoSubmittedCodeRef.current === submissionKey) {
      return;
    }

    const timeout = setTimeout(() => {
      autoSubmittedCodeRef.current = submissionKey;
      void verifyCode();
    }, CODE_AUTOSUBMIT_DELAY_MS);

    return () => clearTimeout(timeout);

    // verifyCode intentionally uses the challenge and code
    // from the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    code,
    busy,
    resending,
    verified,
    challengeId,
    step,
  ]);

  /* =========================================================
     RESEND EMAIL CODE
  ========================================================= */

  async function resendCode() {
    if (
      resendInFlightRef.current ||
      verificationInFlightRef.current ||
      busy ||
      resending ||
      resendCountdown > 0 ||
      verified ||
      step !== "email"
    ) {
      return;
    }

    if (!email) {
      showOverlay({
        type: "warning",
        title: "Email address unavailable",
        message:
          "Your email address is missing. Go back and start again.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    if (isRegistration && (!fullName || !phone)) {
      showOverlay({
        type: "warning",
        title: "Registration details unavailable",
        message:
          "Your registration details are missing. Go back and complete registration again.",
        primaryAction: {
          label: "Understood",
        },
      });

      return;
    }

    resendInFlightRef.current = true;

    setResending(true);
    setInputHasError(false);

    try {
      const result = isRegistration
        ? await requestRunnerRegistrationOtp({
            fullName,
            email,
            phone,
          })
        : await requestRunnerOtp(email);

      if (
        !result?.ok ||
        (isRegistration && result.purpose !== "register") ||
        !result.challengeId ||
        !result.destination
      ) {
        throw new Error(
          "The server did not confirm a new verification challenge. Please try again.",
        );
      }

      if (!mountedRef.current) return;

      setChallengeId(result.challengeId);
      setDestination(result.destination);

      setCode("");
      setInputHasError(false);

      autoSubmittedCodeRef.current = null;

      setResendAvailableAt(
        Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      );

      showOverlay({
        type: "success",
        title: "Verification code sent",
        message:
          result.message ||
          `A new verification code has been sent to ${result.destination}.`,
        primaryAction: {
          label: "Got it",
        },
      });
    } catch (cause) {
      if (!mountedRef.current) return;

      const message =
        cause instanceof Error
          ? cause.message
          : "A new verification code could not be sent.";

      if (/maximum of five codes|hour/i.test(message)) {
        setResendAvailableAt(
          Date.now() + 60 * 60 * 1000,
        );
      } else if (
        /please wait|too many verification requests|429/i.test(message)
      ) {
        setResendAvailableAt(
          Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
        );
      }

      const rateLimited =
        /maximum of five codes|hour|please wait|too many verification requests|429/i.test(
          message,
        );

      showOverlay({
        type: rateLimited ? "warning" : "error",
        title: rateLimited
          ? "Please wait before trying again"
          : "Could not send a new code",
        message,
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      resendInFlightRef.current = false;

      if (mountedRef.current) {
        setResending(false);
      }
    }
  }

  /* =========================================================
     CREATE SEPARATE RUNNER ACCOUNT
     Only called after explicit Customer-match consent.
  ========================================================= */

  async function continueWithRunner() {
    if (
      confirmationInFlightRef.current ||
      busy ||
      !confirmationToken ||
      !customerMatch
    ) {
      return;
    }

    confirmationInFlightRef.current = true;

    setBusy(true);
    setInputHasError(false);

    try {
      const result = await confirmRunnerRegistration(
        confirmationToken,
      );

      if (!mountedRef.current) return;

      await completeSession(result);
    } catch (cause) {
      if (!mountedRef.current) return;

      showOverlay({
        type: "error",
        title: "Runner account could not be created",
        message:
          cause instanceof Error
            ? cause.message
            : "Your Runner account could not be created. Please try again.",
        primaryAction: {
          label: "Close",
        },
      });
    } finally {
      confirmationInFlightRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }

  /* =========================================================
     DECLINE CUSTOMER-MATCH REGISTRATION
  ========================================================= */

  async function declineRegistration() {
    if (busy || !isRegistration) return;

    setBusy(true);

    try {
      if (confirmationToken) {
        await cancelRunnerRegistration(confirmationToken);
      }
    } catch {
      if (mountedRef.current) {
        showOverlay({
          type: "warning",
          title: "Registration not completed",
          message:
            "Your Runner account has not been created. The pending confirmation could not be cancelled immediately and will expire automatically.",
          primaryAction: {
            label: "Understood",
          },
        });
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        router.replace("/(auth)/register");
      }
    }
  }

  /* =========================================================
     DISPLAY STATE
  ========================================================= */

  const resendLabel =
    resendCountdown > 0
      ? `Resend code in ${formatCountdown(resendCountdown)}`
      : "Resend code";

  const disabled = busy || resending || verified;

  const verifyDisabled =
    disabled ||
    !challengeId ||
    code.length !== CODE_LENGTH;

  const isConfirmation = step === "confirm";

  const eyebrow = isConfirmation
    ? "CUSTOMER ACCOUNT FOUND"
    : isRegistration
      ? "REGISTRATION VERIFICATION"
      : "RUNNER SIGN IN";

  const title = isConfirmation
    ? "Is this your account?"
    : isRegistration
      ? "Verify your email"
      : "Welcome back";

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
   

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}

          <View style={styles.header}>
            <Image
              source={WORDMARK}
              resizeMode="contain"
              style={styles.wordmark}
              accessibilityRole="image"
              accessibilityLabel="SaMi"
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="SaMi Runner Help"
              accessibilityHint="Opens SaMi Runner verification assistance"
              onPress={showHelp}
              hitSlop={8}
              style={({ pressed }) => [
                styles.helpButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Ionicons
                name="help-circle-outline"
                size={17}
                color={colors.blueAction}
              />

              <Text
                style={[
                  styles.helpText,
                  { color: colors.text },
                ]}
              >
                Help
              </Text>
            </Pressable>
          </View>

          {/* MAIN CONTENT */}

          <View style={styles.content}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: isConfirmation
                    ? colors.successSoft
                    : colors.blueSoft,
                },
              ]}
            >
              <Ionicons
                name={
                  isConfirmation
                    ? "person-circle-outline"
                    : isRegistration
                      ? "person-add-outline"
                      : "mail-open-outline"
                }
                size={30}
                color={
                  isConfirmation
                    ? colors.success
                    : colors.blueAction
                }
              />
            </View>

            <Text
              style={[
                styles.eyebrow,
                { color: colors.blueAction },
              ]}
            >
              {eyebrow}
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              {title}
            </Text>

            {/* CUSTOMER ACCOUNT CONFIRMATION */}

            {isConfirmation && customerMatch ? (
              <>
                <Text
                  style={[
                    styles.subtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  We found an existing SaMi Customer account
                  associated with your verified{" "}
                  {customerMatch.matchedBy}.
                </Text>

                <View
                  style={[
                    styles.customerCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.customerAvatar,
                      { backgroundColor: colors.blueSoft },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={24}
                      color={colors.blueAction}
                    />
                  </View>

                  <View style={styles.customerDetails}>
                    <Text
                      style={[
                        styles.customerLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      CUSTOMER ACCOUNT NAME
                    </Text>

                    <Text
                      style={[
                        styles.customerName,
                        { color: colors.text },
                      ]}
                    >
                      {customerMatch.fullName}
                    </Text>
                  </View>

                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.success}
                  />
                </View>

                <View
                  style={[
                    styles.infoBox,
                    { backgroundColor: colors.blueSoft },
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={19}
                    color={colors.blueAction}
                  />

                  <Text
                    style={[
                      styles.infoText,
                      { color: colors.text },
                    ]}
                  >
                    Your existing Customer account will remain
                    unchanged. Continuing creates a separate
                    Runner account with its own login and profile.
                  </Text>
                </View>

                <Text
                  style={[
                    styles.confirmQuestion,
                    { color: colors.text },
                  ]}
                >
                  Would you like to continue with Runner registration?
                </Text>
              </>
            ) : (
              <>
                {/* EMAIL VERIFICATION */}

                <Text
                  style={[
                    styles.subtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  Enter the six-digit code we sent to{" "}
                  <Text
                    style={[
                      styles.destination,
                      { color: colors.text },
                    ]}
                  >
                    {destination}
                  </Text>
                  .
                </Text>

                {isRegistration ? (
                  <View
                    style={[
                      styles.infoBox,
                      { backgroundColor: colors.blueSoft },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={colors.blueAction}
                    />

                    <Text
                      style={[
                        styles.infoText,
                        { color: colors.text },
                      ]}
                    >
                      Verifying your email does not automatically
                      connect or change a Customer account. If we
                      find an existing Customer account, we will
                      ask your permission before creating a separate
                      Runner account.
                    </Text>
                  </View>
                ) : null}

                <Text
                  style={[
                    styles.label,
                    { color: colors.text },
                  ]}
                >
                  Verification code
                </Text>

                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={(value) => {
                    setCode(
                      value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH),
                    );

                    setInputHasError(false);
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  editable={!disabled}
                  selectionColor={colors.blue}
                  cursorColor={colors.blue}
                  onSubmitEditing={() => {
                    if (
                      code.length === CODE_LENGTH &&
                      !busy &&
                      !resending &&
                      !verified
                    ) {
                      void verifyCode();
                    }
                  }}
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: verified
                        ? colors.success
                        : inputFocused
                          ? colors.blueAction
                          : inputHasError
                            ? colors.red
                            : colors.border,
                      color: colors.text,
                    },
                    (inputFocused || verified) &&
                      Platform.select({
                        ios: {
                          shadowColor: colors.blueAction,
                          shadowOpacity: 0.16,
                          shadowRadius: 8,
                          shadowOffset: {
                            width: 0,
                            height: 2,
                          },
                        },
                        android: { elevation: 2 },
                        default: {},
                      }),
                    disabled && styles.disabled,
                  ]}
                  accessibilityLabel="Six-digit verification code"
                />
              </>
            )}

            {/* CUSTOMER CONFIRMATION ACTIONS */}

            {isConfirmation ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy, disabled }}
                  disabled={disabled || !confirmationToken}
                  onPress={() => void continueWithRunner()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.blueAction },
                    disabled && styles.disabled,
                    pressed && !disabled && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onBlue} />
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: colors.onBlue },
                        ]}
                      >
                        Yes, continue with Runner
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={19}
                        color={colors.onBlue}
                      />
                    </>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => void declineRegistration()}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                    disabled && styles.disabled,
                    pressed && !disabled && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      { color: colors.text },
                    ]}
                  >
                    No, go back
                  </Text>
                </Pressable>

                <Text
                  style={[
                    styles.resendHint,
                    { color: colors.textMuted },
                  ]}
                >
                  Nothing will be changed in your Customer account.
                  You can decline without affecting it.
                </Text>
              </>
            ) : (
              <>
                {/* VERIFY ACTION */}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    verified
                      ? "Verified"
                      : isRegistration
                        ? "Verify email and continue"
                        : "Verify and sign in"
                  }
                  accessibilityHint="Submits your six-digit verification code"
                  accessibilityState={{
                    busy,
                    disabled: verifyDisabled,
                  }}
                  disabled={verifyDisabled}
                  onPress={() => void verifyCode()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.blueAction },
                    verifyDisabled && !verified && styles.disabled,
                    pressed && !verifyDisabled && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onBlue} />
                  ) : verified ? (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.onBlue}
                      />

                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: colors.onBlue },
                        ]}
                      >
                        Verified
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: colors.onBlue },
                        ]}
                      >
                        {isRegistration
                          ? "Verify email and continue"
                          : "Verify and continue"}
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={colors.onBlue}
                      />
                    </>
                  )}
                </Pressable>

                {/* RESEND CODE */}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={resendLabel}
                  disabled={
                    busy ||
                    resending ||
                    verified ||
                    resendCountdown > 0
                  }
                  hitSlop={8}
                  onPress={() => void resendCode()}
                  style={({ pressed }) => [
                    styles.resendButton,
                    (
                      busy ||
                      resending ||
                      verified ||
                      resendCountdown > 0
                    ) && styles.disabled,
                    pressed &&
                      !busy &&
                      !resending &&
                      !verified &&
                      resendCountdown === 0 &&
                      styles.pressed,
                  ]}
                >
                  {resending ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.blueAction}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.resendText,
                        { color: colors.blueAction },
                      ]}
                    >
                      {resendLabel}
                    </Text>
                  )}
                </Pressable>

                <Text
                  style={[
                    styles.resendHint,
                    { color: colors.textMuted },
                  ]}
                >
                  The server allows one request every 60 seconds
                  and up to five codes per email per hour.
                </Text>
              </>
            )}

            {/* CHANGE DETAILS */}

            {!isConfirmation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isRegistration
                    ? "Change registration details"
                    : "Use a different email address"
                }
                disabled={disabled}
                hitSlop={6}
                onPress={() =>
                  router.replace(
                    isRegistration
                      ? "/(auth)/register"
                      : "/(auth)/login",
                  )
                }
                style={({ pressed }) => [
                  styles.changeDetailsButton,
                  {
                    opacity: pressed
                      ? 0.6
                      : disabled
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.changeDetailsText,
                    { color: colors.blueAction },
                  ]}
                >
                  {isRegistration
                    ? "Change registration details"
                    : "Use a different email address"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: runnerSpacing.xl,
    paddingTop: runnerSpacing.sm,
    paddingBottom: runnerSpacing.xxxl,
  },

  header: {
    minHeight: runnerTouchTargets.minimum,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: runnerSpacing.sm,
  },

  wordmark: {
    width: 112,
    height: 42,
  },

  helpButton: {
    minHeight: runnerTouchTargets.minimum,
    paddingHorizontal: runnerSpacing.sm,
    borderRadius: runnerRadii.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: runnerSpacing.xxs,
  },

  helpText: {
    fontSize: runnerTypography.caption,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: runnerSpacing.md,
    paddingTop: runnerSpacing.xl,
    paddingBottom: runnerSpacing.xl,
  },

  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: runnerRadii.xl,
    alignItems: "center",
    justifyContent: "center",
  },

  eyebrow: {
    fontSize: runnerTypography.eyebrow,
    fontWeight: runnerTypography.fontWeight.heavy,
    letterSpacing: 1,
  },

  title: {
    fontSize: runnerTypography.heading,
    fontWeight: runnerTypography.fontWeight.heavy,
    letterSpacing: -0.5,
    lineHeight: Math.round(
      runnerTypography.heading * runnerTypography.lineHeight.compact,
    ),
  },

  subtitle: {
    fontSize: runnerTypography.bodySmall,
    lineHeight: Math.round(
      runnerTypography.bodySmall * runnerTypography.lineHeight.normal,
    ),
  },

  destination: {
    fontWeight: runnerTypography.fontWeight.heavy,
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: runnerRadii.md,
    padding: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  infoText: {
    flex: 1,
    fontSize: runnerTypography.bodySmall,
    lineHeight: Math.round(
      runnerTypography.bodySmall * runnerTypography.lineHeight.normal,
    ),
  },

  label: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
    marginTop: runnerSpacing.xxs,
  },

  codeInput: {
    minHeight: 72,
    borderWidth: 1.5,
    borderRadius: runnerRadii.lg,
    textAlign: "center",
    fontSize: runnerTypography.heading,
    fontWeight: runnerTypography.fontWeight.heavy,
    letterSpacing: 7,
    paddingHorizontal: runnerSpacing.sm,
    paddingVertical: runnerSpacing.md,
    marginTop: runnerSpacing.xxs,
  },

  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    padding: runnerSpacing.md,
    gap: runnerSpacing.sm,
  },

  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  customerDetails: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  customerLabel: {
    fontSize: runnerTypography.caption,
    fontWeight: runnerTypography.fontWeight.heavy,
    letterSpacing: 0.6,
  },

  customerName: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  confirmQuestion: {
    fontSize: runnerTypography.body,
    lineHeight: Math.round(
      runnerTypography.body * runnerTypography.lineHeight.normal,
    ),
    fontWeight: runnerTypography.fontWeight.bold,
    marginTop: runnerSpacing.xxs,
  },

  primaryButton: {
    minHeight: runnerTouchTargets.primary,
    borderRadius: runnerRadii.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: runnerSpacing.sm,
    paddingHorizontal: runnerSpacing.md,
    marginTop: runnerSpacing.xs,
  },

  primaryButtonText: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.heavy,
  },

  secondaryButton: {
    minHeight: runnerTouchTargets.comfortable,
    borderRadius: runnerRadii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.md,
  },

  secondaryButtonText: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  resendButton: {
    minHeight: runnerTouchTargets.minimum,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: runnerSpacing.sm,
  },

  resendText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.heavy,
  },

  resendHint: {
    fontSize: runnerTypography.caption,
    lineHeight: Math.round(
      runnerTypography.caption * runnerTypography.lineHeight.normal,
    ),
    textAlign: "center",
  },

  changeDetailsButton: {
    minHeight: runnerTouchTargets.minimum,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: runnerSpacing.xs,
    paddingHorizontal: runnerSpacing.md,
  },

  changeDetailsText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  disabled: {
    opacity: 0.55,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});