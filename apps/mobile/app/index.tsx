import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { router } from "expo-router";

import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { dispatchGet } from "@/api";

const SESSION_KEY = "sami_errands_access_token";
const NAVY = "#000535";

type User = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "customer" | "runner";
  avatar_url?: string | null;
};

/**
 * Detects an auth failure from whatever shape your API client throws.
 * Handles a thrown string, an Error with a message, or an object with
 * a `status` / `statusCode` field.
 */
function isAuthError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "string") {
    const m = error.toLowerCase();
    return (
      m.includes("401") ||
      m.includes("unauthorized") ||
      m.includes("forbidden")
    );
  }

  if (typeof error === "object" && error !== null) {
    const e = error as {
      status?: number;
      statusCode?: number;
      message?: string;
    };
    if (e.status === 401 || e.status === 403) return true;
    if (e.statusCode === 401 || e.statusCode === 403) return true;
    if (typeof e.message === "string") {
      const m = e.message.toLowerCase();
      return (
        m.includes("401") ||
        m.includes("unauthorized") ||
        m.includes("forbidden")
      );
    }
  }

  return false;
}

export default function WelcomeScreen() {
  const isDark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();

  const [welcomeReady, setWelcomeReady] = useState(false);

  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslate = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    let active = true;

    function openCustomerApp() {
      if (!active) return;
      router.replace("/(app)");
      requestAnimationFrame(() => {
        void SplashScreen.hideAsync().catch(() => undefined);
      });
    }

    async function checkSession() {
      const savedToken = await SecureStore.getItemAsync(SESSION_KEY).catch(
        () => null,
      );

      if (!active) return;

      if (!savedToken) {
        setWelcomeReady(true);
        return;
      }

      try {
        await dispatchGet<{ user: User }>("me");
        if (active) openCustomerApp();
      } catch (error) {
        if (!active) return;

        if (isAuthError(error)) {
          // Stale token — clear it so the next open starts clean.
          await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
          if (!active) return;
          setWelcomeReady(true);
        } else {
          // Network or server glitch — don't strand a signed-in user.
          openCustomerApp();
        }
      }
    }

    void checkSession().catch(() => {
      if (active) setWelcomeReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  // Entrance motion — runs after the page is actually mounted.
  useEffect(() => {
    if (!welcomeReady) return;

    Animated.parallel([
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionsOpacity, {
        toValue: 1,
        duration: 500,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionsTranslate, {
        toValue: 0,
        duration: 500,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [welcomeReady, wordmarkOpacity, actionsOpacity, actionsTranslate]);

  function hideNativeSplash() {
    void SplashScreen.hideAsync().catch(() => undefined);
  }

  if (!welcomeReady) {
    // Native splash is still covering this — show solid navy so there is no flash.
    return <View style={{ flex: 1, backgroundColor: NAVY }} />;
  }

  const primaryBackground = isDark ? "#FFFFFF" : NAVY;
  const primaryText = isDark ? NAVY : "#FFFFFF";

  const secondaryBackground = isDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(255,255,255,0.92)";
  const secondaryText = isDark ? "#FFFFFF" : NAVY;

  const wordmarkTop = insets.top + 20;
  const actionsBottom = insets.bottom + 28;

  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      onLayout={hideNativeSplash}
      style={{ flex: 1, backgroundColor: NAVY }}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Top scrim — keeps the wordmark readable over any photo */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,5,53,0.55)", "rgba(0,5,53,0)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: wordmarkTop + 100,
        }}
      />

      {/* Bottom scrim — guarantees contrast for the CTA block */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(0,5,53,0)",
          "rgba(0,5,53,0.55)",
          "rgba(0,5,53,0.92)",
        ]}
        locations={[0, 0.55, 1]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 360,
        }}
      />

      {/* Wordmark */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: wordmarkTop,
          left: 0,
          right: 0,
          alignItems: "center",
          opacity: wordmarkOpacity,
        }}
      >
        <Image
          source={require("../assets/sami-welcome-wordmark-transparent.png")}
          style={{ width: 200, height: 66 }}
          resizeMode="contain"
          accessibilityLabel="SaMi — Consider it done"
        />
      </Animated.View>

      {/* Actions */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: actionsBottom,
          left: 0,
          right: 0,
          alignItems: "center",
          paddingHorizontal: 24,
          gap: 12,
          opacity: actionsOpacity,
          transform: [{ translateY: actionsTranslate }],
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 22,
            lineHeight: 28,
            fontWeight: "800",
            letterSpacing: -0.4,
            textAlign: "center",
            marginBottom: 4,
            textShadowColor: "rgba(0,5,53,0.4)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 6,
          }}
        >
          Consider it done.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started"
          accessibilityHint="Create your SaMi account"
          onPress={() => router.push("/(auth)/register")}
          style={({ pressed }) => ({
            width: "100%",
            maxWidth: 380,
            height: 58,
            borderRadius: 17,
            backgroundColor: primaryBackground,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text
            style={{
              color: primaryText,
              fontSize: 16,
              fontWeight: "800",
              letterSpacing: -0.2,
            }}
          >
            Get started
          </Text>
          <Ionicons name="arrow-forward" size={18} color={primaryText} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityHint="Sign in to your existing SaMi account"
          onPress={() => router.push("/(auth)/login")}
          style={({ pressed }) => ({
            width: "100%",
            maxWidth: 380,
            height: 58,
            borderRadius: 17,
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.85)",
            backgroundColor: secondaryBackground,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Text
            style={{
              color: secondaryText,
              fontSize: 16,
              fontWeight: "800",
              letterSpacing: -0.2,
            }}
          >
            Sign in
          </Text>
        </Pressable>

        <Text
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize: 11.5,
            lineHeight: 16,
            textAlign: "center",
            marginTop: 6,
            maxWidth: 320,
          }}
        >
          By continuing you agree to SaMi&apos;s{" "}
          <Text
            style={{ color: "#FFFFFF", textDecorationLine: "underline" }}
          >
            Terms
          </Text>{" "}
          and{" "}
          <Text
            style={{ color: "#FFFFFF", textDecorationLine: "underline" }}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </Animated.View>
    </ImageBackground>
  );
}