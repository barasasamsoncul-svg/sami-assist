import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
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
const navy = "#061426";
const blue = "#1683FF";
const lightText = "#F7FAFF";

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(false);

  // The artwork already contains the SaMi wordmark, tagline and parcel handover.
  // Keep the welcome artwork on a rich navy field that reaches the system-bar edge.
  const availableImageHeight = Math.max(260, height - 150);
  const heroWidth = Math.min(width, 420, availableImageHeight * (420 / 469));
  const heroHeight = heroWidth * (469 / 420);

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
    // Match the native splash on the very first React frame to prevent a black/white flash.
    return (
      <View style={{ flex: 1, backgroundColor: navy }}>
        <StatusBar barStyle="light-content" backgroundColor={navy} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: navy }}>
      <StatusBar barStyle="light-content" backgroundColor={navy} />
      <View
        style={{
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 4,
          paddingBottom: 116,
        }}
      >
        <Image
          source={require("../assets/sami-welcome-design.jpg")}
          accessibilityLabel="SaMi welcome artwork showing a customer and an errand courier exchanging a parcel"
          resizeMode="contain"
          style={{ width: heroWidth, height: heroHeight }}
        />
      </View>

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 68, 
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 390, alignItems: "center" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() => router.push("/(auth)/choose-role")}
            style={({ pressed }) => ({
              width: "66%",
              minHeight: 46,
              borderRadius: 30,
              backgroundColor: pressed ? "#0869D7" : blue,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 12,
              shadowColor: "#1683FF",
              shadowOpacity: 0.27,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "800" }}>
              Get started
            </Text>
            <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({
              minHeight: 40,
              marginTop: 10,
              paddingHorizontal: 24,
              paddingVertical: 6,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "transparent",
            })}
          >
            <Text style={{ color: lightText, fontSize: 17, fontWeight: "600" }}>
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
