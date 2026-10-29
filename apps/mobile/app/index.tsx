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
  const compact = height < 580 || width < 360;
  const heroWidth = Math.min(
    width - 32,
    390,
    Math.max(220, (height - 285) * 1.46),
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

      try {
        const status = await dispatchGet<BootstrapStatus>("bootstrapStatus");
        if (!active) return;
        if (!status.adminExists) {
          router.replace("/(auth)/setup-admin");
          return;
        }
      } catch {
        // The welcome actions remain available if the network is temporarily unavailable.
      }

      if (active) setShowWelcome(true);
    }

    void decideInitialRoute().catch(() => {
      if (active) setShowWelcome(true);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!showWelcome) {
    // Do not flash the welcome screen for returning users while their session is checked.
    return <View style={{ flex: 1, backgroundColor: paper }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: paper }}>
      <View
        style={{
          flex: 1,
          minHeight: Math.max(height - 56, 400),
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingTop: compact ? 8 : 12,
          paddingBottom: compact ? 8 : 12,
        }}
      >
        <View
          accessibilityLabel="SaMi"
          style={{
            width: 160,
            height: 62,
            alignItems: "center",
            position: "relative",
          }}
        >
          <Text
            style={{
              width: 160,
              textAlign: "center",
              color: navy,
              fontSize: 52,
              lineHeight: 60,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: -3.2,
              includeFontPadding: false,
            }}
          >
            SaMi
          </Text>
          <View
            style={{
              position: "absolute",
              top: 45,
              left: 52,
              width: 63,
              height: 12,
              borderBottomWidth: 3.5,
              borderColor: blue,
              borderBottomLeftRadius: 42,
              borderBottomRightRadius: 42,
              transform: [{ rotate: "-2deg" }],
            }}
          />
        </View>

        <View
          style={{
            width: "100%",
            alignItems: "center",
            marginTop: compact ? 8 : 14,
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
              marginTop: compact ? 2 : 7,
              color: navy,
              fontSize: compact ? 23 : 25,
              lineHeight: compact ? 29 : 32,
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
            width: "100%",
            maxWidth: 390,
            alignItems: "center",
            marginTop: compact ? 12 : 20,
            gap: 3,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() => router.push("/(auth)/choose-role")}
            style={({ pressed }) => ({
              width: "100%",
              minHeight: 56,
              borderRadius: 17,
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
            <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>
              Get started
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({
              minHeight: 42,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 20,
              paddingVertical: 6,
              borderRadius: 14,
              backgroundColor: pressed ? "#EAF1FC" : "transparent",
            })}
          >
            <Text style={{ color: navy, fontSize: 15, fontWeight: "800" }}>
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
