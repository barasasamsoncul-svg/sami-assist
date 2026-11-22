import { useCallback, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import "@/location/runner-location-service";
import { RunnerThemeProvider, useRunnerTheme } from "@/theme";

const BRAND_NAVY = "#000535";

void SplashScreen.preventAutoHideAsync();

/** The sole app-level status-bar owner; it follows the persisted Runner theme. */
function RunnerRootNavigator() {
  const { mode } = useRunnerTheme();
  const hasHiddenSplash = useRef(false);

  const handleRootLayout = useCallback(() => {
    if (hasHiddenSplash.current) return;

    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync();
  }, []);

  const statusBarStyle = mode === "dark" ? "light-content" : "dark-content";
  const nativeStatusBarStyle = mode === "dark" ? "light" : "dark";

  return (
    <View style={styles.root} onLayout={handleRootLayout}>
      <StatusBar barStyle={statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: BRAND_NAVY,
          },
          statusBarStyle: nativeStatusBarStyle,
          animation: "none",
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RunnerThemeProvider>
        <RunnerRootNavigator />
      </RunnerThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_NAVY,
  },
});
