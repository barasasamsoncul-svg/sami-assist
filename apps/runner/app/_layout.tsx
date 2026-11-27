import { useCallback, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import "@/location/runner-location-service";
import { RunnerThemeProvider, useRunnerTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync();

/**
 * The only status-bar owner in SaMi Runner.
 * It follows the persisted Runner appearance preference.
 */
function RunnerRootNavigator() {
  const { mode, colors } = useRunnerTheme();
  const hasHiddenSplash = useRef(false);

  const handleRootLayout = useCallback(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.paper },
      ]}
      onLayout={handleRootLayout}
    >
      <StatusBar
        hidden={false}
        barStyle={
          mode === "dark"
            ? "light-content"
            : "dark-content"
        }
      />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.paper,
          },
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
  },
});