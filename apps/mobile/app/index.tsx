
import { ImageBackground, Pressable, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";

const NAVY = "#061B49";
const GOLD = "#F1C66D";

export default function WelcomeScreen() {
  return (
    <ImageBackground
      source={require("../assets/sami-welcome-photo.png")}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: NAVY }}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(4, 15, 42, 0.25)",
          alignItems: "center",
        }}
      >
        {/* SaMi brand */}
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 96,
              fontWeight: "900",
              fontStyle: "italic",
              color: GOLD,
              letterSpacing: -5,
              transform: [{ rotate: "-12deg" }],
              textShadowColor: "rgba(0,0,0,0.35)",
              textShadowOffset: { width: 2, height: 4 },
              textShadowRadius: 8,
            }}
          >
            SaMi
          </Text>
        </View>

        {/* Welcome actions */}
        <View
          style={{
            position: "absolute",
            bottom: 185,
            width: "100%",
            alignItems: "center",
            paddingHorizontal: 28,
            gap: 14,
          }}
        >
          <Pressable
            onPress={() => router.push("/(auth)/register")}
            style={{
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: NAVY,
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Get started
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              width: "100%",
              maxWidth: 360,
              height: 58,
              borderRadius: 17,
              borderWidth: 1.5,
              borderColor: "rgba(255,255,255,0.85)",
              backgroundColor: "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}
