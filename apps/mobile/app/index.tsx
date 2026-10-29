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
  // A literal 6 cm inset would overlap the logo, artwork and actions on a phone.
  // Use a responsive inset capped at 22% of viewport height to preserve the full layout.
  const edgeOffset = Math.min(6 * 160 / 2.54, Math.max(44, Math.round(height * 0.22)));
  const availableHeroHeight = Math.max(96, height - edgeOffset * 2 - (compact ? 225 : 244));
  const heroWidth = Math.max(
    145,
    Math.min(width - 16, 420, availableHeroHeight / (301 / 440)),
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
          paddingTop: edgeOffset,
          paddingHorizontal: 16,
        }}
      >
        <Text
          accessibilityLabel="SaMi"
          style={{
            textAlign: "center",
            fontSize: compact ? 72 : 84,
            lineHeight: compact ? 80 : 94,
            fontWeight: "900",
            fontStyle: "italic",
            letterSpacing: -3.5,
            includeFontPadding: false,
          }}
        >
          <Text style={{ color: navy }}>Sa</Text><Text style={{ color: blue }}>Mi</Text>
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            alignSelf: "stretch",
            marginTop: compact ? 0 : 2,
            paddingLeft: Math.round(width * 0.49),
            color: "#D97732",
            fontSize: compact ? 17 : 20,
            lineHeight: compact ? 23 : 27,
            fontWeight: "900",
            fontStyle: "italic",
            letterSpacing: -0.25,
            textAlign: "left",
          }}
        >
          Consider it done.
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 8,
          paddingBottom: edgeOffset + 112,
        }}
      >
        <Image
          source={require("../assets/sami-errands-scene.jpg")}
          accessibilityLabel="3D illustration of a customer using a phone, a home location, an errand route, and a courier"
          resizeMode="contain"
          style={{ width: heroWidth, height: heroHeight }}
        />
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: edgeOffset,
          alignItems: "center",
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 390,
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
    </View>
  );
}
