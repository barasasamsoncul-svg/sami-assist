import { Stack } from "expo-router";
import { Platform, StatusBar } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme";

const androidSafeAreaEdges: Array<"top" | "right" | "bottom" | "left"> = [
  "top",
  "right",
  "bottom",
  "left",
];

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.paper }}
        edges={Platform.OS === "android" ? androidSafeAreaEdges : []}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.paper },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
