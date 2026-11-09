import { Stack } from "expo-router";
import { useRunnerTheme } from "@/theme";

export default function RunnerAuthLayout() {
  const { colors } = useRunnerTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,

        // Fade matches the (app) group so crossing the auth boundary
        // between screens feels like one product, not two.
        animation: "fade",
        animationDuration: 220,

        // Prevents a white flash during transitions in dark mode.
        // Register and Login both use colors.paper as their root, so
        // matching here means the fade is invisible on the background.
        contentStyle: { backgroundColor: colors.paper },

        // Stable status bar style during transitions.
        statusBarStyle: colors.paper === "#080F1D" ? "light" : "dark",

        // Auth flow has hard navigation guards (verification calls
        // router.dismissAll() before replacing, register→verify chains
        // through OTP state). A swipe-back mid-flow would land on a
        // screen whose state assumes the previous step succeeded.
        gestureEnabled: false,
      }}
    />
  );
}