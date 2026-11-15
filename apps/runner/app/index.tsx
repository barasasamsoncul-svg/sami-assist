
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

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

export default function LaunchScreen() {
  const { colors } = useRunnerTheme();

  const [stage, setStage] = useState<LaunchStage>("animation");
  const [errorMessage, setErrorMessage] = useState("");

  const launchCompleted = useRef(false);

  const handleGetStarted = useCallback(() => {
    router.push("/(auth)/register");
  }, []);

  const handleSignIn = useCallback(() => {
    router.push("/(auth)/login");
  }, []);

  const restoreRunnerSession = useCallback(async (): Promise<void> => {
    setStage("restoring");
    setErrorMessage("");

    try {
      const sessionToken = await getRunnerSession();

      if (!sessionToken) {
        setStage("welcome");
        return;
      }

      const onboarding = await getRunnerOnboarding();

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
          // Restrictions remain within the existing Documents stage.
          router.replace("/(auth)/documents");
          return;

        default:
          throw new Error(
            "SaMi could not determine the next step for this Runner account.",
          );
      }
    } catch (error) {
      console.warn(
        "[SaMi Runner Launch] Session restoration failed.",
        error,
      );

      // An authenticated 401 clears the expired local token
      // in the API layer. Only then should Welcome be shown.
      // Network and server errors must not log the Runner out.
      try {
        const remainingSession = await getRunnerSession();

        if (!remainingSession) {
          setStage("welcome");
          return;
        }
      } catch (sessionError) {
        console.warn(
          "[SaMi Runner Launch] Could not recheck the saved session.",
          sessionError,
        );
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We could not check your Runner account. Please try again.",
      );

      setStage("error");
    }
  }, []);

  const handleAnimationComplete = useCallback(() => {
    if (launchCompleted.current) {
      return;
    }

    launchCompleted.current = true;

    void restoreRunnerSession();
  }, [restoreRunnerSession]);

  const handleRetry = useCallback(() => {
    void restoreRunnerSession();
  }, [restoreRunnerSession]);

  // Prevent a broken or unavailable animation asset from
  // leaving the Runner app permanently stuck at launch.
  useEffect(() => {
    if (stage !== "animation") {
      return;
    }

    const fallbackTimer = setTimeout(() => {
      handleAnimationComplete();
    }, ANIMATION_FALLBACK_MS);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [stage, handleAnimationComplete]);

  if (stage === "welcome") {
    return (
      <WelcomeScreen
        onGetStarted={handleGetStarted}
        onSignIn={handleSignIn}
      />
    );
  }

  if (stage === "animation") {
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
        {stage === "restoring" ? (
          <>
            <ActivityIndicator
              size="large"
              color={colors.blue}
              style={styles.loader}
            />

            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Checking your account
            </Text>

            <Text
              style={[
                styles.message,
                { color: colors.textMuted },
              ]}
            >
              Please wait while SaMi checks your Runner
              session and onboarding progress.
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}
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

  loader: {
    marginVertical: 8,
  },

  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
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
