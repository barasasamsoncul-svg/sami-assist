
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { colors } from "@/theme";

export default function AuthLayout() {
  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.paper}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: "none",
        }}
      />
    </>
  );
}
