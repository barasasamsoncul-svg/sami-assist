
import { Stack } from "expo-router";
import { StatusBar } from "react-native";

const NAVY = "#061B49";

export default function RootLayout() {
  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
      />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: NAVY },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: "none" }} />
        <Stack.Screen name="(app)" options={{ animation: "none" }} />
      </Stack>
    </>
  );
}
