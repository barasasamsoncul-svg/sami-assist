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
  const { width, height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(true);
  const compact = height < 700;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroLift = useRef(new Animated.Value(18)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  // Preserve the full original illustration and its embedded SaMi branding.
  // The matching blurred layer fills the viewport so the artwork has no frame.
  const heroHeight = Math.min(height * 0.64, width * (469 / 420));

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(heroLift, {
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
  }, [actionsOpacity, heroLift, heroOpacity]);

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
      <StatusBar barStyle="light-content" backgroundColor={navy} translucent={false} />

      <Image
        source={require("../assets/sami-welcome-design.jpg")}
        accessible={false}
        blurRadius={28}
        resizeMode="cover"
        style={{
          position: "absolute",
          top: -height * 0.12,
          left: -width * 0.18,
          width: width * 1.36,
          height: height * 1.24,
          opacity: 0.42,
        }}
      />

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: compact ? 0 : 8,
          paddingBottom: compact ? 4 : 12,
        }}
      >
        <Animated.View
          style={{
            width,
            height: heroHeight,
            alignItems: "center",
            justifyContent: "center",
            opacity: heroOpacity,
            transform: [{ translateY: heroLift }],
          }}
        >
          <Image
            source={require("../assets/sami-welcome-design.jpg")}
            accessibilityLabel="SaMi. Consider it done. A customer and an errand provider completing a delivery."
            resizeMode="contain"
            style={{ width, height: heroHeight }}
          />
        </Animated.View>

        <Animated.View
          style={{
            width: "100%",
            alignItems: "center",
            paddingHorizontal: 20,
            marginTop: "auto",
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
    </View>
  );
}
