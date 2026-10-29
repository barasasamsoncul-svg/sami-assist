import { useEffect } from "react";
import { Pressable, SafeAreaView, ScrollView, StatusBar, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = { adminExists: boolean; tokenConfigured: boolean; setupAvailable: boolean };

export default function WelcomeScreen() {
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
          // Signed-out visitors stay on the welcome screen and choose their next step.
        }
      })
      .catch(() => {
        // Keep welcome actions available even when bootstrap status is temporarily unavailable.
      });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F7FB" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 30, justifyContent: "space-between" }}>
        <View style={{ flex: 1, width: "100%", maxWidth: 460, alignSelf: "center", justifyContent: "center", gap: 30 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 58, height: 58, borderRadius: 19, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#173B67", fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.5 }}>SaMi</Text>
              <View style={{ position: "absolute", bottom: 8, width: 24, height: 7, borderBottomWidth: 2.5, borderColor: "#2463B8", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ color: "#173B67", fontSize: 28, fontWeight: "900", letterSpacing: -1.1 }}>SaMi</Text>
              <Text style={{ color: "#69788D", fontSize: 10, fontWeight: "800", letterSpacing: 1.25 }}>YOUR EVERYDAY HELP ORGANISED</Text>
            </View>
          </View>

          <View style={{ gap: 15 }}>
            <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#EAF1FC", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 30 }}>
              <Ionicons name="sparkles-outline" size={15} color="#2463B8" />
              <Text style={{ color: "#2463B8", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 }}>YOUR EVERYDAY HELP ORGANISED</Text>
            </View>
            <Text style={{ color: "#173B67", fontSize: 39, lineHeight: 45, fontWeight: "900", letterSpacing: -1.5 }}>
              More time for{"\n"}what matters.
            </Text>
            <Text style={{ color: "#69788D", fontSize: 16, lineHeight: 25, maxWidth: 340 }}>
              From everyday pickups to getting things done, SaMi connects you with help when you need it.
            </Text>
          </View>

          <View style={{ gap: 13 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/choose-role")}
              style={({ pressed }) => ({ minHeight: 60, borderRadius: 17, backgroundColor: pressed ? "#1D5297" : "#2463B8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 })}>
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>Get started</Text>
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/login")}
              style={({ pressed }) => ({ minHeight: 56, borderRadius: 17, backgroundColor: pressed ? "#E3ECFA" : "#FFFFFF", borderWidth: 1, borderColor: "#DCE5F2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 })}>
              <Ionicons name="log-in-outline" size={19} color="#2463B8" />
              <Text style={{ color: "#173B67", fontSize: 15, fontWeight: "800" }}>I already have an account · Sign in</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#71839B" />
            <Text style={{ color: "#71839B", fontSize: 11, fontWeight: "700" }}>A simpler way to get everyday errands done.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
