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
const orange = "#FF951C";
const lightText = "#F7FAFF";
const artworkRatio = 941 / 730;

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(false);
  const wordmarkSize = Math.max(58, Math.min(84, width * 0.21));
  const artworkWidth = Math.min(width, 480, height * 0.45 * artworkRatio);
  const artworkHeight = artworkWidth / artworkRatio;
  const compact = height < 720;

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
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: compact ? 10 : 24,
          paddingBottom: compact ? 8 : 18,
        }}
      >
        <View style={{ width: "82%", maxWidth: 330, alignItems: "center" }}>
          <Text
            accessibilityLabel="SaMi"
            style={{
              color: "#FFFFFF",
              fontSize: wordmarkSize,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: -4,
              lineHeight: wordmarkSize * 1.06,
              textAlign: "center",
            }}
          >
            Sa<Text style={{ color: blue }}>Mi</Text>
          </Text>
          <Text
            style={{
              alignSelf: "flex-end",
              marginTop: compact ? -3 : -6,
              marginRight: 3,
              color: orange,
              fontSize: compact ? 15 : 18,
              lineHeight: compact ? 19 : 23,
              fontWeight: "800",
              fontStyle: "italic",
            }}
          >
            Consider it done.
          </Text>
        </View>

        <Image
          source={require("../assets/sami-welcome-scene.jpg")}
          accessibilityLabel="A customer using her phone while an errand provider hands over a parcel"
          resizeMode="contain"
          style={{
            width: artworkWidth,
            height: artworkHeight,
          }}
        />

        <View
          style={{
            width: "100%",
            alignItems: "center",
            paddingHorizontal: 20,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() => router.push("/(auth)/choose-role")}
            style={({ pressed }) => ({
              width: "84%",
              maxWidth: 390,
              minHeight: compact ? 54 : 60,
              borderRadius: 36,
              backgroundColor: pressed ? "#0869D7" : blue,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 14,
              shadowColor: blue,
              shadowOpacity: 0.38,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 5 },
              elevation: 8,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontSize: compact ? 18 : 20, fontWeight: "800" }}>
              Get started
            </Text>
            <Ionicons name="arrow-forward" size={compact ? 23 : 25} color="#FFFFFF" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({
              minHeight: 48,
              marginTop: 8,
              paddingHorizontal: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "transparent",
            })}
          >
            <Text style={{ color: lightText, fontSize: 19, fontWeight: "600" }}>
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
