import { useEffect } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StatusBar,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { dispatchGet } from "@/api";
import { colors } from "@/theme";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

export default function EntryScreen() {
  useEffect(() => {
    let active = true;

    dispatchGet<BootstrapStatus>("bootstrapStatus")
      .then(async (status) => {
        if (!active) return;

        if (!status.adminExists) {
          router.replace("/(auth)/setup-admin");
          return;
        }

        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
        } catch {
          if (active) router.replace("/(auth)/login");
        }
      })
      .catch(async () => {
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
        } catch {
          if (active) router.replace("/(auth)/login");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: colors.navy }}
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
          justifyContent: "center",
          gap: 14,
          backgroundColor: "rgba(4, 18, 48, 0.30)",
        }}
      >
        <Text
          style={{
            fontSize: 40,
            fontWeight: "900",
            color: "#FFFFFF",
            letterSpacing: -1,
          }}
        >
          SaMi
        </Text>

        <Text style={{ color: "#FFFFFF", fontSize: 15 }}>
          Everyday help, organised.
        </Text>

        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    </ImageBackground>
  );
}