
import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import {
  getRunnerMe,
  getRunnerSession,
} from "@/api";

export default function IndexScreen() {
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const token = await getRunnerSession();

        if (!active) return;

        if (!token) {
          router.replace("/(auth)/login");
          return;
        }

        try {
          await getRunnerMe();

          if (!active) return;

          router.replace("/(app)");
        } catch {
          if (!active) return;

          // A network failure should not automatically
          // sign out a Runner with a saved session.
          const remainingToken = await getRunnerSession();

          if (!active) return;

          router.replace(
            remainingToken
              ? "/(app)"
              : "/(auth)/login"
          );
        }
      } finally {
        if (active) {
          await SplashScreen.hideAsync().catch(
            () => undefined
          );
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000535",
    alignItems: "center",
    justifyContent: "center",
  },
});
