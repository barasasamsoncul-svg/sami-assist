import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
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
const blue = "#2463B8";
const navy = "#173B67";
const paper = "#F8FAFD";

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(false);
  const compact = height < 650 || width < 360;
  const heroWidth = Math.max(
    200,
    Math.min(width - 16, 420, ((height - 385) / (301 / 440))),
  );
  const heroHeight = heroWidth * (301 / 440);

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
          // A 401 removes the saved token in the API client. A connection failure does not.
          const remainingToken = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
          if (!active) return;
          if (remainingToken) {
            router.replace("/(app)");
            return;
          }
        }
      }

      // Show the signed-out welcome screen immediately; setup verification must not
      // block first paint and leave visitors staring at a blank screen.
      if (active) setShowWelcome(true);

      // Keep first-run administrator setup behavior, but resolve it in the background.
      try {
        const status = await dispatchGet<BootstrapStatus>("bootstrapStatus");
        if (active && !status.adminExists) {
          router.replace("/(auth)/setup-admin");
        }
      } catch {
        // The welcome actions remain usable if the network is temporarily unavailable.
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
    // Only returning sessions wait here for local token and session verification.
    return <View style={{ flex: 1, backgroundColor: paper }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: paper }}>
      <View
        style={{
          alignItems: "center",
          paddingTop: compact ? 6 : 12,
          height: compact ? 82 : 96,
          justifyContent: "flex-start",
        }}
      >
        <View
          accessibilityLabel="SaMi"
          style={{
            width: 230,
            height: 82,
            alignItems: "center",
            position: "relative",
          }}
        >
          <Text
            style={{
              width: 230,
              textAlign: "center",
              color: navy,
              fontSize: compact ? 62 : 70,
              lineHeight: compact ? 72 : 80,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: -4,
              includeFontPadding: false,
            }}
          >
            SaMi
          </Text>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: compact ? 60 : 66,
              left: compact ? 89 : 88,
              width: 48,
              height: 15,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                top: -15,
                left: 0,
                width: 48,
                height: 30,
                borderWidth: 3,
                borderColor: blue,
                borderRadius: 24,
              }}
            />
          </View>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 8,
          paddingBottom: 150,
        }}
      >
        <Image
          source={require("../assets/sami-errands-scene.jpg")}
          accessibilityLabel="3D illustration of a customer using a phone, a home location, an errand route, and a courier"
          resizeMode="contain"
          style={{ width: heroWidth, height: heroHeight }}
        />
        <Text
          style={{
            marginTop: compact ? 2 : 8,
            color: navy,
            fontSize: compact ? 25 : 29,
            lineHeight: compact ? 31 : 37,
            fontWeight: "900",
            letterSpacing: -0.5,
            textAlign: "center",
          }}
        >
          Consider it done.
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 86,
          maxWidth: 390,
          alignSelf: "center",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started"
          onPress={() => router.push("/(auth)/choose-role")}
          style={({ pressed }) => ({
            width: "100%",
            minHeight: 62,
            borderRadius: 18,
            backgroundColor: pressed ? "#1D5297" : blue,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 10,
            shadowColor: navy,
            shadowOpacity: 0.14,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "900" }}>
            Get started
          </Text>
          <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          onPress={() => router.push("/(auth)/login")}
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 22,
            paddingVertical: 6,
            borderRadius: 14,
            backgroundColor: pressed ? "#EAF1FC" : "transparent",
          })}
        >
          <Text style={{ color: navy, fontSize: 17, fontWeight: "800" }}>
            Sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
