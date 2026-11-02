import { Pressable, SafeAreaView, ScrollView, StatusBar, Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export default function ChooseRoleScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: 18, paddingBottom: 28 }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", flex: 1, gap: 25 }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 8 }}>
            <Ionicons name="arrow-back" size={20} color="#173B67" />
            <Text style={{ color: "#173B67", fontSize: 14, fontWeight: "700" }}>Back</Text>
          </Pressable>

          <View style={{ gap: 10 }}>
            <Image source={require("../../assets/sami-welcome-wordmark-transparent.png")} style={{ width: 184, height: 52 }} resizeMode="contain" accessibilityLabel="SaMi - Consider it done" />
            <Text style={{ color: "#173B67", fontSize: 32, lineHeight: 38, fontWeight: "900", letterSpacing: -1 }}>
              How would you like{"\n"}to use SaMi?
            </Text>
            <Text style={{ color: "#69788D", fontSize: 14, lineHeight: 22 }}>
              Choose what brings you here. We’ll take you to the right place.
            </Text>
          </View>

          <View style={{ gap: 13 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/register-customer")}
              style={({ pressed }) => ({ backgroundColor: pressed ? "#F0F5FE" : "#FFFFFF", borderWidth: 1.5, borderColor: "#DCE5F2", borderRadius: 22, padding: 19, flexDirection: "row", alignItems: "center", gap: 15 })}>
              <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="bag-handle-outline" size={26} color="#2463B8" />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: "#173B67", fontSize: 17, fontWeight: "800" }}>I need help</Text>
                <Text style={{ color: "#69788D", fontSize: 13, lineHeight: 19 }}>Request pickups, purchases and everyday errands.</Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color="#2463B8" />
            </Pressable>

            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(auth)/register", params: { role: "provider" } })}
              style={({ pressed }) => ({ backgroundColor: pressed ? "#F0F5FE" : "#FFFFFF", borderWidth: 1.5, borderColor: "#DCE5F2", borderRadius: 22, padding: 19, flexDirection: "row", alignItems: "center", gap: 15 })}>
              <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="bicycle-outline" size={26} color="#2463B8" />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: "#173B67", fontSize: 17, fontWeight: "800" }}>I want to complete errands</Text>
                <Text style={{ color: "#69788D", fontSize: 13, lineHeight: 19 }}>Join as a provider and earn by helping people.</Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color="#2463B8" />
            </Pressable>
          </View>

          <View style={{ marginTop: "auto", alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#71839B", fontSize: 12 }}>Already registered?</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/login")} style={{ padding: 8 }}>
              <Text style={{ color: "#2463B8", fontSize: 14, fontWeight: "800" }}>Sign in to SaMi</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
