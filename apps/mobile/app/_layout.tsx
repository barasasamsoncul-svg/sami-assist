import { Stack, usePathname } from "expo-router";
import { Platform, StatusBar } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme";

const androidSafeAreaEdges: Array<"top" | "right" | "bottom" | "left"> = [
  "top",
  "right",
  "bottom",
  "left",
];

const welcomeNavy = "#04142D";

export default function RootLayout() {
  const pathname = usePathname();
  const isWelcome = pathname === "/";
  const shellBackground = isWelcome ? welcomeNavy : colors.paper;

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isWelcome ? "light-content" : "dark-content"}
        backgroundColor={shellBackground}
        translucent={false}
      />
      <SafeAreaView
        style={{ flex: 1, backgroundColor: shellBackground }}
        edges={Platform.OS === "android" && !isWelcome ? androidSafeAreaEdges : []}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: shellBackground },
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
