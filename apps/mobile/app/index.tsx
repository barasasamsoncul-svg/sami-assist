import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { router } from "expo-router";

import {
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { dispatchGet } from "@/api";

const SESSION_KEY = "sami_errands_access_token";
const NAVY = "#000535";

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [welcomeReady, setWelcomeReady] = useState(false);

  useEffect(() => {
    let active = true;

    function openCustomerApp() {
      if (!active) return;

      router.replace("/(app)");

      requestAnimationFrame(() => {
        void SplashScreen.hideAsync().catch(
          () => undefined,
        );
      });
    }

    async function checkSession() {
      const savedToken = await SecureStore.getItemAsync(
        SESSION_KEY,
      ).catch(() => null);

      if (!active) return;

      if (!savedToken) {
        setWelcomeReady(true);
        return;
      }

      try {
        await dispatchGet("me");

        if (active) {
          openCustomerApp();
        }
      } catch {
        if (!active) return;

        const remainingToken =
          await SecureStore.getItemAsync(
            SESSION_KEY,
          ).catch(() => null);

        if (!active) return;

        if (remainingToken) {
          openCustomerApp();
        } else {
          setWelcomeReady(true);
        }
      }
    }

    void checkSession().catch(() => {
      if (active) {
        setWelcomeReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function hideNativeSplash() {
    void SplashScreen.hideAsync().catch(
      () => undefined,
    );
  }

  if (!welcomeReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: NAVY,
        }}
      />
    );
  }

  const primaryBackground = isDark ? "#FFFFFF" : NAVY;
  const primaryText = isDark ? NAVY : "#FFFFFF";

  const secondaryBackground = isDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(255,255,255,0.94)";

  const secondaryText = isDark ? "#FFFFFF" : NAVY;

  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      onLayout={hideNativeSplash}
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
        {/* SaMi wordmark anchored at the absolute top */}
        <View
  style={{
    position: "absolute",
    top: (StatusBar.currentHeight ?? 48) + 38,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  }}
>
  <Image
    source={require("../assets/sami-welcome-wordmark-transparent.png")}
    resizeMode="contain"
    accessibilityLabel="SaMi - Consider it done"
    style={{
      width: "90%",
      maxWidth: 460,
      aspectRatio: 852 / 382,
    }}
  />
</View>

        {/* Welcome buttons */}
        <View
          style={{
            position: "absolute",
            bottom: 105,
            width: "100%",
            alignItems: "center",
            paddingHorizontal: 28,
            gap: 14,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            onPress={() =>
              router.push("/(auth)/register")
            }
            style={({ pressed }) => ({
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              backgroundColor: primaryBackground,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: primaryText,
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
            onPress={() =>
              router.push("/(auth)/login")
            }
            style={({ pressed }) => ({
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              backgroundColor: secondaryBackground,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: secondaryText,
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