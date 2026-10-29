import { useEffect } from "react";
import { Pressable, SafeAreaView, StatusBar, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = { adminExists: boolean; tokenConfigured: boolean; setupAvailable: boolean };

const blue = "#2463B8";
const navy = "#173B67";
const muted = "#718096";
const paper = "#F7F9FD";

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
          // Signed-out visitors stay on this welcome screen.
        }
      })
      .catch(() => {
        // Keep welcome actions usable if the network is temporarily unavailable.
      });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }}>
      <StatusBar barStyle="dark-content" backgroundColor={paper} />
      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 30, paddingBottom: 28 }}>
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Text style={{ color: navy, fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -3.2 }}>SaMi</Text>
          <View style={{ position: "absolute", width: 49, height: 13, top: 45, left: 28, borderBottomWidth: 3, borderColor: blue, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, transform: [{ rotate: "-4deg" }] }} />
        </View>

        <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
          <View style={{ width: 270, height: 270, alignItems: "center", justifyContent: "center" }}>
            <View style={{ position: "absolute", width: 238, height: 238, borderRadius: 119, backgroundColor: "#EAF1FC" }} />
            <View style={{ position: "absolute", width: 194, height: 194, borderRadius: 97, borderWidth: 1, borderColor: "#D5E3F8" }} />
            <View style={{ position: "absolute", top: 23, right: 27, width: 50, height: 50, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", transform: [{ rotate: "10deg" }], elevation: 3, shadowColor: navy, shadowOpacity: 0.08, shadowRadius: 8 }}>
              <Ionicons name="location" size={26} color={blue} />
            </View>
            <View style={{ position: "absolute", left: 18, top: 88, width: 55, height: 55, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-9deg" }], elevation: 3, shadowColor: navy, shadowOpacity: 0.08, shadowRadius: 8 }}>
              <Ionicons name="receipt-outline" size={26} color="#E39A36" />
            </View>
            <View style={{ position: "absolute", right: 13, bottom: 55, width: 57, height: 57, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", transform: [{ rotate: "8deg" }], elevation: 3, shadowColor: navy, shadowOpacity: 0.08, shadowRadius: 8 }}>
              <Ionicons name="bag-handle-outline" size={28} color="#2E9A78" />
            </View>
            <View style={{ width: 130, height: 148, borderRadius: 30, backgroundColor: navy, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }], elevation: 8, shadowColor: navy, shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } }}>
              <View style={{ width: 76, height: 76, borderRadius: 25, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="bicycle-outline" size={43} color={blue} />
              </View>
              <View style={{ marginTop: 13, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8DB8F4" }} />
                <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>ERRAND ON ITS WAY</Text>
              </View>
            </View>
            <View style={{ position: "absolute", left: 39, bottom: 27, width: 44, height: 44, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: navy, shadowOpacity: 0.08, shadowRadius: 8 }}>
              <Ionicons name="checkmark-circle" size={26} color={blue} />
            </View>
          </View>
          <Text style={{ marginTop: 3, color: navy, fontSize: 25, fontWeight: "900", letterSpacing: -0.7, textAlign: "center" }}>Your day, made easier.</Text>
          <Text style={{ marginTop: 9, color: muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 290 }}>
            Shopping, pick-ups, and everyday errands — handled with care.
          </Text>
        </View>

        <View style={{ width: "100%", maxWidth: 390, alignItems: "center", gap: 13 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/choose-role")}
            style={({ pressed }) => ({ width: "100%", minHeight: 57, borderRadius: 18, backgroundColor: pressed ? "#1D5297" : blue, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, shadowColor: navy, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 })}>
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>Get started</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({ minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 7, borderRadius: 14, backgroundColor: pressed ? "#EAF1FC" : "transparent", flexDirection: "row", gap: 6 })}>
            <Text style={{ color: navy, fontSize: 14, fontWeight: "700" }}>Already have an account?</Text>
            <Text style={{ color: blue, fontSize: 14, fontWeight: "900" }}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
