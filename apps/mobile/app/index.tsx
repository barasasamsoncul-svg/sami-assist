import { useEffect } from "react";
import { Pressable, SafeAreaView, ScrollView, StatusBar, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = { adminExists: boolean; tokenConfigured: boolean; setupAvailable: boolean };

const blue = "#2463B8";
const navy = "#173B67";
const muted = "#69788D";
const border = "#E1E8F2";
const paper = "#F6F8FC";

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

  const services = [
    { icon: "basket-outline" as const, label: "Shopping" },
    { icon: "cube-outline" as const, label: "Pick-ups" },
    { icon: "receipt-outline" as const, label: "Bill errands" },
    { icon: "sparkles-outline" as const, label: "And more" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }}>
      <StatusBar barStyle="dark-content" backgroundColor={paper} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: navy, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.8 }}>SaMi</Text>
            <View style={{ position: "absolute", bottom: 7, width: 21, height: 6, borderBottomWidth: 2.2, borderColor: "#8DB8F4", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }} />
          </View>
          <View style={{ gap: 3 }}>
            <Text style={{ color: navy, fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.1 }}>SaMi</Text>
            <Text style={{ color: muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.05 }}>ERRANDS, MADE EASIER</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="shield-checkmark-outline" size={19} color={blue} />
          </View>
        </View>

        <View style={{ marginTop: 34, borderRadius: 28, padding: 22, backgroundColor: navy, overflow: "hidden" }}>
          <View style={{ position: "absolute", width: 180, height: 180, borderRadius: 90, right: -62, top: -62, backgroundColor: "#28558C" }} />
          <View style={{ position: "absolute", width: 100, height: 100, borderRadius: 50, right: 7, bottom: -55, borderWidth: 1, borderColor: "#5276A4" }} />
          <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 30, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#294D7A" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8DB8F4" }} />
            <Text style={{ color: "#DCE9FB", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>YOUR DAY, WITH A HAND</Text>
          </View>
          <Text style={{ marginTop: 20, color: "#FFFFFF", fontSize: 36, lineHeight: 41, fontWeight: "900", letterSpacing: -1.2 }}>
            More time for{"\n"}what matters.
          </Text>
          <Text style={{ marginTop: 12, color: "#D5E2F4", fontSize: 14, lineHeight: 22, maxWidth: 300 }}>
            From shopping and pick-ups to everyday tasks, get reliable help without the extra running around.
          </Text>
          <View style={{ marginTop: 23, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFFFFF", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 }}>
            <Ionicons name="checkmark-circle" size={18} color={blue} />
            <Text style={{ color: navy, fontSize: 12, fontWeight: "800" }}>One app. All kinds of errands.</Text>
          </View>
        </View>

        <View style={{ marginTop: 25, gap: 13 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: navy, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 }}>Everyday help starts here</Text>
            <Text style={{ color: muted, fontSize: 13, lineHeight: 19 }}>Choose a task, share the details, and follow it through in SaMi.</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 9 }}>
            {services.map((service) => (
              <View key={service.label} style={{ flex: 1, minWidth: 0, minHeight: 83, borderRadius: 17, borderWidth: 1, borderColor: border, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 11, gap: 9 }}>
                <View style={{ width: 35, height: 35, borderRadius: 12, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={service.icon} size={18} color={blue} />
                </View>
                <Text numberOfLines={1} style={{ color: navy, fontSize: 10, fontWeight: "800" }}>{service.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 25 }} />

        <View style={{ marginTop: 28, gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/choose-role")}
            style={({ pressed }) => ({ minHeight: 56, borderRadius: 17, backgroundColor: pressed ? "#1D5297" : blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, shadowColor: navy, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 })}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "900" }}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/login")}
            style={({ pressed }) => ({ minHeight: 53, borderRadius: 17, backgroundColor: pressed ? "#EAF1FC" : "#FFFFFF", borderWidth: 1, borderColor: border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}>
            <Ionicons name="log-in-outline" size={18} color={blue} />
            <Text style={{ color: navy, fontSize: 14, fontWeight: "800" }}>I already have an account · Sign in</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 16, color: "#8290A4", fontSize: 10, fontWeight: "600", textAlign: "center" }}>
          Everyday errands, organised around you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
