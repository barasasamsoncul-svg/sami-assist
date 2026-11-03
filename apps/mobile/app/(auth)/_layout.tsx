
import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

export default function AuthLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor =
    colorScheme === "dark" ? "#080F1D" : "#F4F7FC";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor,
        },
        animation: "fade_from_bottom",
      }}
    />
  );
}
