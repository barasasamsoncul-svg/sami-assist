
import { Stack } from "expo-router";
import { StatusBar, View } from "react-native";

import * as SplashScreen from "expo-splash-screen";

import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  RunnerThemeProvider,
  useRunnerTheme,
} from "@/theme";

void SplashScreen.preventAutoHideAsync().catch(
  () => undefined,
);

function RunnerRootNavigator() {
  const { colors, mode } = useRunnerTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
      }}
    >
      <StatusBar
        barStyle={
          mode === "dark" ? "light-content" : "dark-content"
        }
        backgroundColor={colors.paper}
        translucent={false}
        hidden={false}
      />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.paper,
          },
          animation: "fade",
          animationDuration: 200,
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
