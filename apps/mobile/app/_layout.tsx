import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

void SplashScreen.preventAutoHideAsync().catch(
  () => undefined,
);

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#000535",
        },
        animation: "fade",
      }}
    />
  );
}