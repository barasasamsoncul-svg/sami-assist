import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import {
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

const SESSION_KEY = "sami_errands_access_token";
const NAVY = "#000535";

export default function WelcomeScreen() {
  useEffect(() => {
    let active = true;

    async function decideInitialRoute() {
      const savedToken = await SecureStore.getItemAsync(SESSION_KEY).catch(
        () => null,
      );
      if (!active) return;

      if (savedToken) {
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
          return;
        } catch {
          const remainingToken = await SecureStore.getItemAsync(
            SESSION_KEY,
          ).catch(() => null);
          if (!active) return;
          if (remainingToken) {
            router.replace("/(app)");
            return;
          }
        }
      }

      try {
        const status = await dispatchGet<BootstrapStatus>("bootstrapStatus");
        if (active && !status.adminExists) {
          router.replace("/(auth)/setup-admin");
        }
      } catch {
        // Keep the welcome actions available while the network is unavailable.
      }
    }

    void decideInitialRoute().catch(() => {
      // The welcome screen remains usable when startup checks cannot reach the API.
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: NAVY }}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 5, 35, 0.20)",
          alignItems: "center",
        }}
      >
        {/* Original SaMi wordmark and tagline */}
        <Image
          source={require("../assets/sami-welcome-wordmark-transparent.png")}
          resizeMode="contain"
          accessibilityLabel="SaMi - Consider it done"
          style={{
            position: "absolute",
            top: 150,
            width: "88%",
            aspectRatio: 852 / 382,
          }}
        />

        {/* Welcome actions */}
        <View
          style={{
            position: "absolute",
            bottom: 185,
            width: "100%",
            alignItems: "center",
            paddingHorizontal: 28,
            gap: 14,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() => router.push("/(auth)/choose-role")}
            style={{
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: NAVY,
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Get started
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => router.push("/(auth)/login")}
            style={{
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              backgroundColor: "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}
