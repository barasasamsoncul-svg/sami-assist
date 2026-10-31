import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  Animated,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

const SESSION_KEY = "sami_errands_access_token";
const navy = "#04142D";
const blue = "#1683FF";
const lightText = "#F7FAFF";

export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(true);
  const compact = height < 700;
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandLift = useRef(new Animated.Value(18)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(brandLift, {
          toValue: 0,
          duration: 720,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(actionsOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [actionsOpacity, brandLift, brandOpacity]);

  useEffect(() => {
    let active = true;

    async function decideInitialRoute() {
      const savedToken = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
      if (!active) return;

      if (savedToken) {
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
          return;
        } catch {
          const remainingToken = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
          if (!active) return;
          if (remainingToken) {
            router.replace("/(app)");
            return;
          }
        }
      }

      if (active) setShowWelcome(true);

      try {
        const status = await dispatchGet<BootstrapStatus>("bootstrapStatus");
        if (active && !status.adminExists) {
          router.replace("/(auth)/setup-admin");
        }
      } catch {
        // Keep the welcome actions usable while the network is unavailable.
      }
    }

    void decideInitialRoute().catch(() => {
      if (active) setShowWelcome(true);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!showWelcome) {
    return <View style={{ flex: 1, backgroundColor: navy }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: navy, overflow: "hidden" }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Image
        source={require("../assets/sami-welcome-photo.jpg")}
        accessible={false}
        resizeMode="cover"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(3, 14, 32, 0.20)",
        }}
      />

      <Animated.View
        style={{
          position: "absolute",
          top: compact ? 76 : 96,
          left: 0,
          right: 0,
          alignItems: "center",
          paddingHorizontal: 24,
          opacity: brandOpacity,
          transform: [{ translateY: brandLift }],
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: compact ? 54 : 64,
            lineHeight: compact ? 62 : 72,
            fontWeight: "900",
            fontStyle: "italic",
            letterSpacing: -2.5,
            textShadowColor: "rgba(0, 10, 28, 0.72)",
            textShadowOffset: { width: 0, height: 3 },
            textShadowRadius: 12,
          }}
        >
          SaMi
        </Text>
        <Text
          style={{
            marginTop: 2,
            color: "#FFFFFF",
            fontSize: compact ? 16 : 18,
            fontWeight: "700",
            letterSpacing: 1.0,
            textShadowColor: "rgba(0, 10, 28, 0.82)",
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 8,
          }}
        >
          Consider it done.
        </Text>
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: compact ? 24 : 34,
          width: "100%",
          alignItems: "center",
          paddingHorizontal: 20,
          opacity: actionsOpacity,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started"
          onPress={() => router.push("/(auth)/choose-role")}
          style={({ pressed }) => ({
            width: "84%",
            maxWidth: 390,
            minHeight: compact ? 56 : 64,
            borderRadius: 40,
            backgroundColor: pressed ? "#0869D7" : blue,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 14,
            shadowColor: blue,
            shadowOpacity: 0.46,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <Text style={{ color: "#FFFFFF", fontSize: compact ? 18 : 20, fontWeight: "800" }}>
            Get started
          </Text>
          <Ionicons name="arrow-forward" size={compact ? 24 : 26} color="#FFFFFF" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          onPress={() => router.push("/(auth)/login")}
          style={({ pressed }) => ({
            minHeight: 52,
            marginTop: 6,
            paddingHorizontal: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "transparent",
          })}
        >
          <Text style={{ color: lightText, fontSize: 19, fontWeight: "600" }}>Sign in</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
