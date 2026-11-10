import { Stack } from "expo-router";
import { useRunnerTheme } from "@/theme";

export default function RunnerAuthLayout() {
  const { colors } = useRunnerTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 220,
        contentStyle: {
          backgroundColor: colors.paper,
        },
        statusBarStyle:
          colors.paper === "#080F1D" ? "light" : "dark",
        gestureEnabled: false,
      }}
    />
  );
}