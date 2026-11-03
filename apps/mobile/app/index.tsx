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

const SESSION_KEY = "sami_errands_access_token";
const NAVY = "#000535";

export default function WelcomeScreen() {
  useEffect(() => {
    let active = true;

    async function decideInitialRoute() {
      const savedToken = await SecureStore.getItemAsync(
        SESSION_KEY,
      ).catch(() => null);

      if (!active || !savedToken) return;

      try {
        // Verify an existing session before opening the customer app.
        await dispatchGet("me");

        if (active) {
          router.replace("/(app)");
        }
      } catch {
        // If the session cannot be verified, leave the welcome
        // screen visible with Get started and Sign in.
        // Do not delete the saved token during a network failure.
      }
    }

    void decideInitialRoute().catch(() => {
      // Keep the welcome screen available if startup checks fail.
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      style={{
        flex: 1,
        backgroundColor: NAVY,
      }}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <View
        style={{
          flex: 1,
          alignItems: "center",
        }}
      >
        {/* Original SaMi wordmark PNG — preserved */}
        <Image
          source={require("../assets/sami-welcome-wordmark-transparent.png")}
          resizeMode="contain"
          accessibilityLabel="SaMi - Consider it done"
          style={{
            position: "absolute",
            top: 150,
            width: "88%",
            maxWidth: 460,
            aspectRatio: 852 / 382,
          }}
        />

        {/* Welcome actions: exactly two */}
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
            onPress={() => router.push("/(auth)/register")}
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
