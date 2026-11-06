import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";

import { getRunnerSession } from "@/api";
import { useRunnerTheme } from "@/theme";

export default function IndexScreen() {
  const { colors } = useRunnerTheme();

  useEffect(() => {
    let active = true;

    void getRunnerSession().then((token) => {
      if (!active) return;
      router.replace(token ? "/(app)" : "/(auth)/login");
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.navy,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="large" color="#FFFFFF" />
    </View>
  );
}