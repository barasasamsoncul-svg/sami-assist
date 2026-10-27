import { useEffect } from "react";
import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

export default function EntryScreen() {
  useEffect(() => {
    let active = true;
    dispatchGet<BootstrapStatus>("bootstrapStatus")
      .then(async (status) => {
        if (!active) return;
        if (!status.adminExists) {
          router.replace("/(auth)/setup-admin");
          return;
        }
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
        } catch {
          if (active) router.replace("/(auth)/login");
        }
      })
      .catch(async () => {
        // A transient setup-status problem should not block existing users from signing in.
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
        } catch {
          if (active) router.replace("/(auth)/login");
        }
      });
    return () => { active = false; };
  }, []);
  return (
    <SafeAreaView style={common.screen}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <Text style={{ fontSize: 40, fontWeight: "900", color: colors.navy, letterSpacing: -1 }}>SaMi</Text>
        <Text style={common.subtitle}>Everyday help, organised.</Text>
        <ActivityIndicator size="small" color={colors.blue} />
      </View>
    </SafeAreaView>
  );
}
