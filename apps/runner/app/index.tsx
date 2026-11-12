
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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

/* =========================================================
   BRAND SYSTEM

   This is a branded entry screen. Its appearance deliberately
   remains navy regardless of the selected application theme.
========================================================= */

const NAVY = "#000535";
const BLUE = "#2769C7";
const BLUE_LIGHT = "#A8CCFF";
const WHITE = "#FFFFFF";

/* =========================================================
   ONBOARDING ROUTING

   Preserve the existing backend-driven onboarding decisions.
========================================================= */

function isDocumentSatisfied(
  reviewStatus: string | null | undefined,
): boolean {
  return (
    reviewStatus === "pending" ||
    reviewStatus === "approved"
  );
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
      // Preserve normal onboarding navigation if review
      // feedback cannot temporarily be retrieved.
    }
  }

  return getRunnerResumeRoute(data);
}

/* =========================================================
   ANIMATED ROUTE VISUAL

   One distinctive visual element representing movement
   and delivery. No permanent map or unnecessary widgets.
========================================================= */

type RouteVisualProps = {
  size: number;
  rotation: Animated.Value;
  glowOpacity: Animated.Value;
  glowScale: Animated.Value;
  entranceOpacity: Animated.Value;
  entranceY: Animated.Value;
  entranceScale: Animated.Value;
};

function RouteVisual({
  size,
  rotation,
  glowOpacity,
  glowScale,
  entranceOpacity,
  entranceY,
  entranceScale,
}: RouteVisualProps) {
  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      accessible={false}
      style={[
        styles.visualStage,
        {
          width: size,
          height: size,
          opacity: entranceOpacity,
          transform: [
            { translateY: entranceY },
            { scale: entranceScale },
          ],
        },
      ]}
    >
      {/* Outer route boundary */}
      <View style={styles.outerOrbit} />

      {/* Secondary route ring */}
      <View style={styles.innerOrbit} />

      {/* Subtle animated light behind the brand symbol */}
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Moving route indicator */}
      <Animated.View
        style={[
          styles.rotatingOrbit,
          {
            transform: [{ rotate }],
          },
        ]}
      >
        <View style={styles.orbitNode} />
      </Animated.View>

      {/* Main navigation symbol */}
      <View style={styles.brandCore}>
        <View style={styles.brandCoreInner}>
          <Ionicons
            name="navigate"
            size={48}
            color={NAVY}
          />
        </View>
      </View>

      {/* Small route markers */}
      <View style={styles.routeMarkerStart}>
        <View style={styles.routeMarkerStartDot} />
      </View>

      <View style={styles.routeMarkerEnd}>
        <Ionicons
          name="checkmark"
          size={12}
          color={WHITE}
        />
      </View>
    </Animated.View>
  );
}

/* =========================================================
   MAIN SCREEN
========================================================= */

export default function IndexScreen() {
  const params = useLocalSearchParams<{
    signedOut?: string | string[];
  }>();

  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const compact = height < 720;

  const visualSize = compact ? 164 : 204;

  const forceWelcome =
    params.signedOut === "1" ||
    (Array.isArray(params.signedOut) &&
      params.signedOut[0] === "1");

  const [welcomeReady, setWelcomeReady] =
    useState(forceWelcome);

  const [reduceMotion, setReduceMotion] =
    useState(false);

  /* -------------------------------------------------------
     ENTRANCE ANIMATION VALUES
  ------------------------------------------------------- */

  const brandOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const brandScale = useRef(
    new Animated.Value(0.94),
  ).current;

  const visualOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const visualY = useRef(
    new Animated.Value(16),
  ).current;

  const visualScale = useRef(
    new Animated.Value(0.94),
  ).current;

  const copyOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const copyY = useRef(
    new Animated.Value(14),
  ).current;

  const actionsOpacity = useRef(
    new Animated.Value(0),
  ).current;

  const actionsY = useRef(
    new Animated.Value(16),
  ).current;

  /* -------------------------------------------------------
     AMBIENT ANIMATION VALUES
  ------------------------------------------------------- */

  const orbitRotation = useRef(
    new Animated.Value(0),
  ).current;

  const glowOpacity = useRef(
    new Animated.Value(0.28),
  ).current;

  const glowScale = useRef(
    new Animated.Value(0.96),
  ).current;

  const arrowPosition = useRef(
    new Animated.Value(0),
  ).current;

  /* -------------------------------------------------------
     ACCESSIBILITY: REDUCED MOTION
  ------------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {
        // Keep standard motion when the platform preference
        // cannot be retrieved.
      });

    const subscription =
      AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReduceMotion,
      );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  /* -------------------------------------------------------
     SESSION AND ONBOARDING RESTORATION

     No change to existing API contracts or route decisions.
  ------------------------------------------------------- */

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

        // Preserve the session during temporary API failure.
        // Never assume the runner has been approved.
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

  /* -------------------------------------------------------
     ENTRANCE AND AMBIENT ANIMATIONS

     The entrance animation is staged:
     brand -> visual -> copy -> actions.

     Ambient motion remains subtle and stops when the screen
     unmounts or the user enables reduced motion.
  ------------------------------------------------------- */

  useEffect(() => {
    if (!welcomeReady) return;

    if (reduceMotion) {
      brandOpacity.setValue(1);
      brandScale.setValue(1);

      visualOpacity.setValue(1);
      visualY.setValue(0);
      visualScale.setValue(1);

      copyOpacity.setValue(1);
      copyY.setValue(0);

      actionsOpacity.setValue(1);
      actionsY.setValue(0);

      glowOpacity.setValue(0.28);
      glowScale.setValue(1);
      orbitRotation.setValue(0);
      arrowPosition.setValue(0);

      return;
    }

    const entrance = Animated.stagger(110, [
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(brandScale, {
          toValue: 1,
          damping: 19,
          stiffness: 180,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(visualOpacity, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(visualY, {
          toValue: 0,
          damping: 20,
          stiffness: 145,
          mass: 0.85,
          useNativeDriver: true,
        }),

        Animated.spring(visualScale, {
          toValue: 1,
          damping: 18,
          stiffness: 150,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(copyOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(copyY, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(actionsY, {
          toValue: 0,
          damping: 18,
          stiffness: 170,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),
    ]);

    const orbit = Animated.loop(
      Animated.timing(orbitRotation, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const breathing = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.48,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),

          Animated.timing(glowScale, {
            toValue: 1.045,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),

        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.28,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),

          Animated.timing(glowScale, {
            toValue: 0.96,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const arrowNudge = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowPosition, {
          toValue: 4,
          duration: 550,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(arrowPosition, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    entrance.start();
    orbit.start();
    breathing.start();
    arrowNudge.start();

    return () => {
      entrance.stop();
      orbit.stop();
      breathing.stop();
      arrowNudge.stop();
    };
  }, [
    welcomeReady,
    reduceMotion,
    brandOpacity,
    brandScale,
    visualOpacity,
    visualY,
    visualScale,
    copyOpacity,
    copyY,
    actionsOpacity,
    actionsY,
    orbitRotation,
    glowOpacity,
    glowScale,
    arrowPosition,
  ]);

  /* -------------------------------------------------------
     NAVIGATION
  ------------------------------------------------------- */

  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(
      () => undefined,
    );
  }, []);

  const getStarted = useCallback(() => {
    router.replace("/(auth)/register");
  }, []);

  const signIn = useCallback(() => {
    router.replace("/(auth)/login");
  }, []);

  /* -------------------------------------------------------
     SESSION RESTORE STATE
  ------------------------------------------------------- */

  if (!welcomeReady) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={NAVY}
          translucent={false}
        />

        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Checking your SaMi Runner session"
          style={styles.loadingInner}
        >
          <View style={styles.loadingMark}>
            <Ionicons
              name="navigate"
              size={27}
              color={WHITE}
            />
          </View>

          <ActivityIndicator
            size="small"
            color={BLUE_LIGHT}
            style={styles.loadingIndicator}
          />

          <Text style={styles.loadingText}>
            Preparing your workspace
          </Text>
        </View>
      </View>
    );
  }

  /* -------------------------------------------------------
     WELCOME SCREEN
  ------------------------------------------------------- */

  return (
    <ImageBackground
      source={require("../assets/welcome-background.png")}
      resizeMode="cover"
      style={styles.background}
      onLayout={hideNativeSplash}
    >
      <StatusBar
        translucent={false}
        backgroundColor={NAVY}
        barStyle="light-content"
        hidden={false}
      />

      {/* Consistent brand contrast over changing backgrounds */}
      <View style={styles.overlay} />

      <SafeAreaView
        edges={["top", "bottom"]}
        style={styles.safeArea}
      >
        <View
          style={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 12,
              paddingTop: compact ? 12 : 20,
            },
          ]}
        >
          {/* BRAND HEADER */}

          <Animated.View
            style={[
              styles.brandRow,
              {
                opacity: brandOpacity,
                transform: [{ scale: brandScale }],
              },
            ]}
          >
            <View style={styles.brandMark}>
              <Ionicons
                name="navigate"
                size={23}
                color={WHITE}
              />
            </View>

            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>
                SaMi{" "}
                <Text style={styles.brandAccent}>
                  Runner
                </Text>
              </Text>

              <Text style={styles.brandTagline}>
                CONSIDER IT DONE
              </Text>
            </View>
          </Animated.View>

          {/* MAIN HERO */}

          <View
            style={[
              styles.hero,
              { gap: compact ? 14 : 22 },
            ]}
          >
            <RouteVisual
              size={visualSize}
              rotation={orbitRotation}
              glowOpacity={glowOpacity}
              glowScale={glowScale}
              entranceOpacity={visualOpacity}
              entranceY={visualY}
              entranceScale={visualScale}
            />

            <Animated.View
              style={[
                styles.heroCopy,
                {
                  opacity: copyOpacity,
                  transform: [{ translateY: copyY }],
                },
              ]}
            >
              <Text style={styles.eyebrow}>
                YOUR NEXT RUN STARTS HERE
              </Text>

              <Text
                accessibilityRole="header"
                style={[
                  styles.title,
                  compact && styles.titleCompact,
                ]}
              >
                Make every{"\n"}run count.
              </Text>

              <Text style={styles.subtitle}>
                Pick up. Shop. Deliver. Help your community
                and build your earnings with SaMi.
              </Text>
            </Animated.View>
          </View>

          {/* PRIMARY ACTIONS */}

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
              accessibilityHint="Opens the SaMi Runner registration form"
              onPress={getStarted}
              hitSlop={4}
              android_ripple={{
                color: "rgba(255,255,255,0.18)",
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Get started
              </Text>

              <Animated.View
                style={{
                  position: "absolute",
                  right: 21,
                  transform: [
                    { translateX: arrowPosition },
                  ],
                }}
              >
                <Ionicons
                  name="arrow-forward"
                  size={21}
                  color={WHITE}
                />
              </Animated.View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityHint="Sign in to an existing SaMi Runner account"
              onPress={signIn}
              hitSlop={4}
              android_ripple={{
                color: "rgba(255,255,255,0.12)",
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
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

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  /* Loading */

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

  loadingMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingIndicator: {
    marginTop: 22,
  },

  loadingText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 13,
  },

  /* Background */

  background: {
    flex: 1,
    backgroundColor: NAVY,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,5,53,0.72)",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 25,
  },

  /* Brand */

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },

  brandCopy: {
    gap: 3,
  },

  brandName: {
    color: WHITE,
    fontSize: 23,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.7,
  },

  brandAccent: {
    color: BLUE_LIGHT,
  },

  brandTagline: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.2,
    opacity: 0.86,
  },

  /* Hero */

  hero: {
    width: "100%",
    alignItems: "center",
  },

  visualStage: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  outerOrbit: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },

  innerOrbit: {
    position: "absolute",
    width: "76%",
    height: "76%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(168,204,255,0.24)",
  },

  glow: {
    position: "absolute",
    width: "67%",
    height: "67%",
    borderRadius: 999,
    backgroundColor: "#2769C7",
  },

  rotatingOrbit: {
    position: "absolute",
    width: "88%",
    height: "88%",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(168,204,255,0.45)",
    borderTopColor: "rgba(168,204,255,0.08)",
    borderRightColor: "rgba(168,204,255,0.16)",
  },

  orbitNode: {
    position: "absolute",
    top: -5,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: BLUE,
  },

  brandCore: {
    width: 106,
    height: 106,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },

  brandCoreInner: {
    width: 78,
    height: 78,
    borderRadius: 27,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 7,
  },

  routeMarkerStart: {
    position: "absolute",
    left: "9%",
    top: "63%",
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(39,105,199,0.75)",
  },

  routeMarkerStartDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: WHITE,
  },

  routeMarkerEnd: {
    position: "absolute",
    right: "9%",
    bottom: "17%",
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "#168B55",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
  },

  /* Hero copy */

  heroCopy: {
    width: "100%",
    gap: 12,
  },

  eyebrow: {
    color: BLUE_LIGHT,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.7,
  },

  title: {
    color: WHITE,
    fontSize: 39,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: -1.25,
  },

  titleCompact: {
    fontSize: 34,
    lineHeight: 40,
  },

  subtitle: {
    color: "#F4F6FC",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    maxWidth: 340,
  },

  /* Actions */

  actions: {
    gap: 12,
  },

  primaryButton: {
    minHeight: 61,
    borderRadius: 17,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },

  primaryButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.1,
  },

  secondaryButton: {
    minHeight: 57,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.78)",
    backgroundColor: "rgba(0,5,53,0.34)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  secondaryButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
  },

  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },

  footer: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 5,
    letterSpacing: 0.2,
  },
});
