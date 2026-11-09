import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import * as SplashScreen from "expo-splash-screen";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  getRunnerOnboarding,
  getRunnerSession,
} from "@/api";
import { getRunnerReviewFeedback } from "@/review";

function isDocumentSatisfied(
  reviewStatus: string | null | undefined,
) {
  return reviewStatus === "pending" || reviewStatus === "approved";
}

function getRunnerResumeRoute(
  data: Awaited<ReturnType<typeof getRunnerOnboarding>>,
) {
  const runner = data.runner;

  if (
    runner.accountStatus === "suspended" ||
    runner.accountStatus === "closed"
  ) {
    return {
      pathname: "/(app)/profile-setup" as const,
      params: { mode: "status" },
    };
  }

  if (
    data.onboardingStatus === "pending_review" ||
    runner.verificationStatus === "submitted"
  ) {
    return {
      pathname: "/(app)/profile-setup" as const,
      params: { mode: "status" },
    };
  }

  if (
    runner.accountStatus === "active" &&
    runner.verificationStatus === "approved"
  ) {
    return "/(app)" as const;
  }

  if (
    !runner.selectedCategories ||
    runner.selectedCategories.length === 0
  ) {
    return "/(auth)/tasks" as const;
  }

  const vehicleType = runner.vehicleType ?? "";
  const serviceArea = runner.serviceArea?.trim() ?? "";

  const needsRegistration = [
    "motorcycle",
    "car",
    "van",
  ].includes(vehicleType);

  const transportComplete =
    serviceArea.length >= 2 &&
    vehicleType.length > 0 &&
    (!needsRegistration ||
      Boolean(runner.vehicleRegistration?.trim()));

  if (!transportComplete) {
    return "/(auth)/transport" as const;
  }

  const requiredDocuments = data.requirements.filter(
    (requirement) => requirement.required,
  );

  if (requiredDocuments.length === 0) {
    return "/(auth)/documents" as const;
  }

  const missingDocument = requiredDocuments.some(
    (requirement) => {
      const uploadedDocument = data.documents.find(
        (document) =>
          document.requirementKey === requirement.key,
      );

      return !isDocumentSatisfied(
        uploadedDocument?.reviewStatus,
      );
    },
  );

  if (missingDocument) {
    return "/(auth)/documents" as const;
  }

  return "/(auth)/review" as const;
}

async function resolveRunnerResumeRoute(
  data: Awaited<ReturnType<typeof getRunnerOnboarding>>,
) {
  if (
    data.runner.verificationStatus === "rejected" ||
    data.onboardingStatus === "changes_required"
  ) {
    try {
      const feedback = await getRunnerReviewFeedback();

      if (
        feedback.applicationReview?.decision === "rejected"
      ) {
        return {
          pathname: "/(app)/profile-setup" as const,
          params: { mode: "status" },
        };
      }
    } catch {
      // Keep the normal onboarding route available if
      // review feedback cannot be reached temporarily.
    }
  }

  return getRunnerResumeRoute(data);
}

const NAVY = "#000535";
const BLUE = "#2769C7";
const BLUE_SOFT = "#9CC6FF";

export default function IndexScreen() {
  const params = useLocalSearchParams<{
    signedOut?: string | string[];
  }>();
  const insets = useSafeAreaInsets();

  const forceWelcome =
    params.signedOut === "1" ||
    (Array.isArray(params.signedOut) &&
      params.signedOut[0] === "1");

  const [welcomeReady, setWelcomeReady] = useState(forceWelcome);

  // Entrance animations
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeY = useRef(new Animated.Value(14)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    let active = true;

    if (forceWelcome) {
      setWelcomeReady(true);

      return () => {
        active = false;
      };
    }

    setWelcomeReady(false);

    async function bootstrap() {
      const token = await getRunnerSession();

      if (!active) return;

      if (!token) {
        setWelcomeReady(true);
        return;
      }

      try {
        const onboarding = await getRunnerOnboarding();

        if (!active) return;

        const destination =
          await resolveRunnerResumeRoute(onboarding);

        if (!active) return;

        router.replace(destination);

        requestAnimationFrame(() => {
          void SplashScreen.hideAsync().catch(
            () => undefined,
          );
        });
      } catch (cause) {
        if (!active) return;

        if (__DEV__) {
          console.error(
            "[SaMi Runner] Startup onboarding check failed.",
            cause instanceof Error
              ? cause.message
              : "unknown error",
          );
        }

        // Preserve the Runner session when the network is
        // temporarily unavailable. Never assume approval.
        setWelcomeReady(true);
      }
    }

    void bootstrap().catch((cause) => {
      if (!active) return;

      if (__DEV__) {
        console.error(
          "[SaMi Runner] Startup failed.",
          cause instanceof Error
            ? cause.message
            : "unknown error",
        );
      }

      setWelcomeReady(true);
    });

    return () => {
      active = false;
    };
  }, [forceWelcome]);

  // Once the welcome screen is ready, play the entrance animations
  // in sequence: brand → welcome copy → actions.
  useEffect(() => {
    if (!welcomeReady) return;

    Animated.sequence([
      Animated.timing(brandOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(welcomeOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(welcomeY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(actionsY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [
    welcomeReady,
    brandOpacity,
    welcomeOpacity,
    welcomeY,
    actionsOpacity,
    actionsY,
  ]);

  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const getStarted = useCallback(() => {
    router.replace("/(auth)/register");
  }, []);

  const signIn = useCallback(() => {
    router.replace("/(auth)/login");
  }, []);

  if (!welcomeReady) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={NAVY}
        />
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Checking your session"
          style={styles.loadingInner}
        >
          <ActivityIndicator size="large" color={BLUE_SOFT} />
        </View>
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("../assets/welcome-background.png")}
      resizeMode="cover"
      style={styles.background}
      onLayout={hideNativeSplash}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <View style={styles.overlay} />

      <SafeAreaView
        edges={["top", "bottom"]}
        style={styles.safeArea}
      >
        <View
          style={[
            styles.content,
            { paddingBottom: insets.bottom + 20 },
          ]}
        >
          {/* Brand */}
          <Animated.View
            style={[styles.brand, { opacity: brandOpacity }]}
          >
            <Text style={styles.brandName}>
              SaMi{" "}
              <Text style={styles.brandAccent}>Runner</Text>
            </Text>
            <Text style={styles.brandTagline}>
              CONSIDER IT DONE
            </Text>
          </Animated.View>

          {/* Welcome copy */}
          <Animated.View
            style={[
              styles.welcome,
              {
                opacity: welcomeOpacity,
                transform: [{ translateY: welcomeY }],
              },
            ]}
          >
            <Text style={styles.eyebrow}>
              YOUR NEXT RUN STARTS HERE
            </Text>

            <Text
              accessibilityRole="header"
              style={styles.title}
            >
              Welcome to{"\n"}SaMi Runner
            </Text>

            <Text style={styles.subtitle}>
              Run errands, deliver with care and help customers in
              your community.
            </Text>
          </Animated.View>

          {/* Actions */}
          <Animated.View
            style={[
              styles.actions,
              {
                opacity: actionsOpacity,
                transform: [{ translateY: actionsY }],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              accessibilityHint="Opens the Runner registration form"
              onPress={getStarted}
              hitSlop={4}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Get started
              </Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color="#FFFFFF"
                style={styles.arrowIcon}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityHint="Sign in to an existing Runner account"
              onPress={signIn}
              hitSlop={4}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                Sign in
              </Text>
            </Pressable>

            <Text style={styles.footer}>
              SaMi Runner · Consider it done.
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingInner: {
    alignItems: "center",
    justifyContent: "center",
  },

  background: {
    flex: 1,
    backgroundColor: NAVY,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 5, 53, 0.52)",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 18,
  },

  // Brand
  brand: {
    alignItems: "center",
    gap: 6,
  },

  brandName: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
  },

  brandAccent: {
    color: BLUE_SOFT,
  },

  brandTagline: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 2.8,
    opacity: 0.92,
  },

  // Welcome copy
  welcome: {
    gap: 14,
  },

  eyebrow: {
    color: BLUE_SOFT,
    fontSize: 11.5,
    fontWeight: "900",
    letterSpacing: 1.8,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 37,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: -1,
  },

  subtitle: {
    color: "#F0F3FA",
    fontSize: 15.5,
    lineHeight: 24,
    maxWidth: 330,
  },

  // Actions
  actions: {
    gap: 14,
  },

  primaryButton: {
    minHeight: 60,
    borderRadius: 17,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.1,
  },

  arrowIcon: {
    position: "absolute",
    right: 20,
  },

  secondaryButton: {
    minHeight: 60,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0, 5, 53, 0.32)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.1,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },

  footer: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    letterSpacing: 0.1,
  },
});