import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: "none" }} />
        <Stack.Screen name="(app)" options={{ animation: "none" }} />
      </Stack>
    </>
  );
}