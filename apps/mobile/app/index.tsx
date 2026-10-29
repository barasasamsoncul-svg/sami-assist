import { useEffect } from "react";
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

const blue = "#2463B8";
const navy = "#173B67";
const paper = "#F8FAFD";

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const compact = height < 720 || width < 360;
  const heroWidth = Math.min(width - 40, 400);

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
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }}>
      <StatusBar barStyle="dark-content" backgroundColor={paper} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View
          style={{
            flexGrow: 1,
            minHeight: Math.max(height - 32, compact ? 590 : 650),
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: compact ? 18 : 28,
            paddingBottom: compact ? 16 : 24,
          }}
        >
          <View
            accessibilityLabel="SaMi"
            style={{
              width: 160,
              height: 72,
              alignItems: "center",
              justifyContent: "flex-start",
              position: "relative",
            }}
          >
            <Text
              style={{
                width: 160,
                textAlign: "center",
                color: navy,
                fontSize: 54,
                lineHeight: 64,
                fontWeight: "900",
                fontStyle: "italic",
                letterSpacing: -3.2,
                includeFontPadding: false,
              }}
            >
              SaMi
            </Text>
            <View
              style={{
                position: "absolute",
                top: 48,
                left: 55,
                width: 61,
                height: 15,
                borderBottomWidth: 4,
                borderColor: blue,
                borderBottomLeftRadius: 42,
                borderBottomRightRadius: 42,
              }}
            />
          </View>

          <View
            style={{
              width: "100%",
              alignItems: "center",
              marginTop: 18,
              marginBottom: 10,
            }}
          >
            <Image
              source={require("../assets/sami-errands-hero.jpg")}
              accessibilityLabel="A customer requesting an errand, a home location, a request checklist, and a SaMi errand courier"
              resizeMode="contain"
              style={{
                width: heroWidth,
                aspectRatio: 400 / 327,
                maxWidth: 400,
              }}
            />
            <Text
              style={{
                marginTop: compact ? 6 : 12,
                color: navy,
                fontSize: 24,
                lineHeight: 32,
                fontWeight: "800",
                letterSpacing: -0.5,
                textAlign: "center",
              }}
            >
              Consider it done.
            </Text>
          </View>

          <View
            style={{
              width: "100%",
              maxWidth: 390,
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              onPress={() => router.push("/(auth)/choose-role")}
              style={({ pressed }) => ({
                width: "100%",
                minHeight: 58,
                borderRadius: 18,
                backgroundColor: pressed ? "#1D5297" : blue,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                shadowColor: navy,
                shadowOpacity: 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 5 },
                elevation: 3,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>
                Get started
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              onPress={() => router.push("/(auth)/login")}
              style={({ pressed }) => ({
                minHeight: 46,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: pressed ? "#EAF1FC" : "transparent",
              })}
            >
              <Text style={{ color: navy, fontSize: 15, fontWeight: "800" }}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
