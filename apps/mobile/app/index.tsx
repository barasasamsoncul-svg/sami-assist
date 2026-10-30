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
const sceneSourceWidth = 420;
const sceneSourceHeight = 469;
const sceneCropTop = 165;

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const [showWelcome, setShowWelcome] = useState(false);
  const compact = height < 740;
  const logoSize = Math.max(56, Math.min(82, width * 0.205));

  // The source illustration contains an old wordmark at its top. Crop that area
  // out and display only the customer/provider scene; branding is native text.
  const sceneWidth = Math.min(width * 1.12, height * 0.43 * sceneSourceWidth / (sceneSourceHeight - sceneCropTop));
  const sceneHeight = sceneWidth * (sceneSourceHeight - sceneCropTop) / sceneSourceWidth;
  const fullImageHeight = sceneWidth * sceneSourceHeight / sceneSourceWidth;
  const cropOffset = sceneWidth * sceneCropTop / sceneSourceWidth;

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
          minHeight: 0,
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: compact ? 10 : 18,
          paddingBottom: compact ? 4 : 10,
        }}
      >
        <View style={{ width: "84%", maxWidth: 340, alignItems: "center" }}>
          <Text
            accessibilityLabel="SaMi"
            style={{
              color: "#FFFFFF",
              fontSize: logoSize,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: -4.2,
              lineHeight: logoSize * 1.02,
              textAlign: "center",
            }}
          >
            Sa<Text style={{ color: blue }}>Mi</Text>
          </Text>
          <Text
            style={{
              alignSelf: "flex-end",
              marginTop: -5,
              marginRight: 2,
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

        <View
          style={{
            width: "100%",
            height: sceneHeight,
            overflow: "hidden",
            backgroundColor: navy,
          }}
        >
          <Image
            source={require("../assets/sami-welcome-design.jpg")}
            accessibilityLabel="Customer using a phone while an errand provider hands over a parcel"
            resizeMode="stretch"
            style={{
              position: "absolute",
              width: sceneWidth,
              height: fullImageHeight,
              left: (width - sceneWidth) / 2,
              top: -cropOffset,
            }}
          />
        </View>

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
              minHeight: compact ? 56 : 62,
              borderRadius: 38,
              backgroundColor: pressed ? "#0869D7" : blue,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 14,
              shadowColor: blue,
              shadowOpacity: 0.42,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 5 },
              elevation: 8,
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
              minHeight: 50,
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
