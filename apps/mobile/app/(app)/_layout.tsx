
import { Stack } from "expo-router";
import { View, useColorScheme } from "react-native";

import CustomerFooter from "../../components/navigation/CustomerFooter";

export default function CustomerAppLayout() {
  const isDark = useColorScheme() === "dark";

  const backgroundColor = isDark
    ? "#080F1D"
    : "#F7F8FA";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
      }}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor,
          },
          animation: "slide_from_right",
        }}
      />

      <CustomerFooter />
    </View>
  );
}
