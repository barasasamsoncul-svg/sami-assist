import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import {
  getRunnerOnboarding,
  getRunnerSession,
} from "@/api";
import { useRunnerTheme } from "@/theme";

import SaMiLaunchAnimation from "../src/branding/SaMiLaunchAnimation";
import WelcomeScreen from "../src/screens/WelcomeScreen";

const BRAND_NAVY = "#000535";
const ANIMATION_FALLBACK_MS = 5000;

type LaunchStage =
  | "animation"
  | "restoring"
  | "welcome"
  | "error";

function firstParam(value?: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function LaunchScreen() {
  const { colors } = useRunnerTheme();
  const params = useLocalSearchParams<{
    signedOut?: string | string[];
  }>();

  // Explicit logout and in-app session expiry both return here with
  // signedOut=1. The animation still plays before Login is opened.
  const mustOpenLogin = firstParam(params.signedOut) === "1";

  const [stage, setStage] = useState<LaunchStage>("animation");
  const [errorMessage, setErrorMessage] = useState("");

  const mountedRef = useRef(true);
  const launchCompletedRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleGetStarted = useCallback(() => {
    router.push("/(auth)/register");
  }, []);

  const handleSignIn = useCallback(() => {
    router.push("/(auth)/login");
  }, []);

  const restoreRunnerSession = useCallback(async (): Promise<void> => {
    if (restoreInFlightRef.current) return;

    restoreInFlightRef.current = true;
    setErrorMessage("");

    let aSavedSessionExisted = false;

    try {
      // A deliberate sign-out or an in-app 401 must end at Login,
      // never restore a previous authenticated destination.
      if (mustOpenLogin) {
        if (mountedRef.current) {
          router.replace("/(auth)/login");
        }
        return;
      }

      const sessionToken = await getRunnerSession();

      if (!mountedRef.current) return;

      aSavedSessionExisted = Boolean(sessionToken);

      // A first-time install has no session and should see Welcome.
      if (!sessionToken) {
        setStage("welcome");
        return;
      }

      // The server's compliance resolver is authoritative. A valid
      // saved session resumes at its actual last required stage.
      const onboarding = await getRunnerOnboarding();

      if (!mountedRef.current) return;

      switch (onboarding.nextStep) {
        case "tasks":
          router.replace("/(auth)/tasks");
          return;

        case "documents":
          router.replace("/(auth)/documents");
          return;

        case "dashboard":
          router.replace("/(app)");
          return;

        case "restricted":
          // Suspended and closed accounts remain in Documents,
          // where the restricted-account state is displayed.
          router.replace("/(auth)/documents");
          return;

        default:
          throw new Error(
            "SaMi could not determine the next step for this Runner account.",
          );
      }
    } catch (error) {
      if (!mountedRef.current) return;

      console.warn(
        "[SaMi Runner Launch] Session restoration failed.",
        error,
      );

      // A protected API 401 clears the saved token. If a token
      // existed before the request and is now gone, the session
      // expired or was revoked: send the Runner to Login.
      if (aSavedSessionExisted) {
        try {
          const remainingSession = await getRunnerSession();

          if (!mountedRef.current) return;

          if (!remainingSession) {
            router.replace("/(auth)/login");
            return;
          }
        } catch (sessionError) {
          console.warn(
            "[SaMi Runner Launch] Could not recheck the saved session.",
            sessionError,
          );
        }
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We could not check your Runner account. Please try again.",
      );

      setStage("error");
    } finally {
      restoreInFlightRef.current = false;
    }
  }, [mustOpenLogin]);

  const handleAnimationComplete = useCallback(() => {
    if (launchCompletedRef.current) return;

    launchCompletedRef.current = true;
    setStage("restoring");

    // Session restoration starts only after the full launch animation.
    // The animation remains on screen while the server resolves the route.
    void restoreRunnerSession();
  }, [restoreRunnerSession]);

  const handleRetry = useCallback(() => {
    launchCompletedRef.current = false;
    setErrorMessage("");
    setStage("animation");
  }, []);

  // Fallback protects against an animation image that fails to report
  // its display event. It still preserves the animation-first flow.
  useEffect(() => {
    if (stage !== "animation") return;

    const fallbackTimer = setTimeout(() => {
      handleAnimationComplete();
    }, ANIMATION_FALLBACK_MS);

    return () => clearTimeout(fallbackTimer);
  }, [stage, handleAnimationComplete]);

  if (stage === "welcome") {
    return (
      <WelcomeScreen
        onGetStarted={handleGetStarted}
        onSignIn={handleSignIn}
      />
    );
  }

  if (stage === "animation" || stage === "restoring") {
    return (
      <View style={styles.launch}>
        <SaMiLaunchAnimation
          onComplete={handleAnimationComplete}
        />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.statusRoot,
        { backgroundColor: colors.paper },
      ]}
      edges={["top", "bottom"]}
    >
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: colors.warningSoft },
          ]}
        >
          <Text
            style={[
              styles.statusIconText,
              { color: colors.warning },
            ]}
          >
            !
          </Text>
        </View>

        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: colors.text },
          ]}
        >
          Unable to check your account
        </Text>

        <Text
          style={[
            styles.message,
            { color: colors.textMuted },
          ]}
        >
          {errorMessage ||
            "We could not verify your Runner session. Check your connection and try again."}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.blueAction,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={styles.primaryButtonText}>
            Try again
          </Text>
        </Pressable>
      </View>

      <Text
        style={[
          styles.brand,
          { color: colors.textMuted },
        ]}
      >
        SaMi Runner
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  launch: {
    flex: 1,
    backgroundColor: BRAND_NAVY,
  },

  statusRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  statusCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
    gap: 14,
  },

  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  statusIconText: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
  },

  title: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.4,
  },

  message: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
  },

  primaryButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  brand: {
    marginTop: 25,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
