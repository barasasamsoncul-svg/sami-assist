import { Stack } from "expo-router";
import { useRunnerTheme } from "@/theme";

export default function RunnerAppLayout() {
  const { colors } = useRunnerTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,

        // Fade is right for a map-first app — a slide over the live map
        // would feel like the map itself is sliding.
        animation: "fade",
        animationDuration: 220,

        // Match the theme so there's no white flash during transitions.
        // Without this, the OS background renders for ~80ms before the
        // screen mounts — very visible when leaving the map dashboard.
        contentStyle: { backgroundColor: colors.paper },

        // Screen readers should focus the new screen's content, not
        // the navigation shell. Each screen's first focusable element
        // becomes the initial focus target.
        statusBarStyle: colors.paper === "#080F1D" ? "light" : "dark",
      }}
    />
  );
}