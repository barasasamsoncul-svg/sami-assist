
import { useEffect, useState } from "react";

import {
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getRunnerMe,
  getRunnerSession,
} from "@/api";

const NAVY = "#000535";
const BLUE = "#2769C7";

export default function IndexScreen() {
  const [welcomeReady, setWelcomeReady] = useState(false);

  useEffect(() => {
    let active = true;

    function hideSplash() {
      requestAnimationFrame(() => {
        void SplashScreen.hideAsync().catch(
          () => undefined,
        );
      });
    }

    async function bootstrap() {
      const token = await getRunnerSession();

      if (!active) return;

      if (!token) {
        setWelcomeReady(true);
        return;
      }

      try {
        const result = await getRunnerMe();

        if (!active) return;

        const runner = result.runner;

        // Only an active, Operations-approved Runner may
        // enter the operational workspace.
        const approved =
          runner.accountStatus === "active" &&
          runner.verificationStatus === "approved";

        if (approved) {
          router.replace("/(app)");
        } else {
          // Submitted applications go to their review status.
          // Incomplete or rejected applications return to onboarding.
          router.replace({
            pathname: "/(app)/profile-setup",
            params: {
              mode:
                runner.verificationStatus === "submitted"
                  ? "status"
                  : "onboarding",
            },
          });
        }

        hideSplash();
      } catch {
        if (!active) return;

        // Never send a Runner into the operational workspace
        // when their approval status cannot be confirmed.
        // Preserve the session in case this is only a network issue.
        setWelcomeReady(true);
      }
    }

    void bootstrap().catch(() => {
      if (active) {
        setWelcomeReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function hideNativeSplash() {
    void SplashScreen.hideAsync().catch(
      () => undefined,
    );
  }

  function getStarted() {
    router.push("/(auth)/register");
  }

  function signIn() {
    router.push("/(auth)/login");
  }

  if (!welcomeReady) {
    return <View style={styles.loadingScreen} />;
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
        hidden={false}
      />

      <View style={styles.overlay} />

      <SafeAreaView
        edges={["top", "bottom"]}
        style={styles.safeArea}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <Text style={styles.brandName}>
              SaMi <Text style={styles.brandAccent}>Runner</Text>
            </Text>

            <Text style={styles.brandTagline}>
              CONSIDER IT DONE
            </Text>
          </View>

          <View style={styles.welcome}>
            <Text style={styles.eyebrow}>
              YOUR NEXT RUN STARTS HERE
            </Text>

            <Text style={styles.title}>
              Welcome to{"\n"}SaMi Runner
            </Text>

            <Text style={styles.subtitle}>
              Run errands, deliver with care and
              help customers in your community.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              onPress={getStarted}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Get started
              </Text>

              <Text style={styles.arrow}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              onPress={signIn}
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
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: NAVY,
  },

  background: {
    flex: 1,
    backgroundColor: NAVY,
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 5, 53, 0.48)",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 18,
  },

  brand: {
    alignItems: "center",
    gap: 5,
  },

  brandName: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
  },

  brandAccent: {
    color: "#9CC6FF",
  },

  brandTagline: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 3,
  },

  welcome: {
    gap: 13,
  },

  eyebrow: {
    color: "#9CC6FF",
    fontSize: 11,
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
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 330,
  },

  actions: {
    gap: 14,
  },

  primaryButton: {
    minHeight: 59,
    borderRadius: 17,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  arrow: {
    position: "absolute",
    right: 22,
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "700",
  },

  secondaryButton: {
    minHeight: 59,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(0, 5, 53, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  pressed: {
    opacity: 0.78,
  },

  footer: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 5,
  },
});
