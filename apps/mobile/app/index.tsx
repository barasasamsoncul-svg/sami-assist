import { useEffect } from "react";
import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

export default function EntryScreen() {
  useEffect(() => {
    let active = true;
    dispatchGet("me")
      .then(() => { if (active) router.replace("/(app)"); })
      .catch(() => { if (active) router.replace("/(auth)/login"); });
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
