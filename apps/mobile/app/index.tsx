
import {
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

const NAVY = "#000535";

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
          backgroundColor: "rgba(0, 5, 35, 0.20)",
          alignItems: "center",
        }}
      >
        {/* Original SaMi logo and tagline */}
        <Image
          source={require("../assets/sami-welcome-wordmark-transparent.png")}
          resizeMode="contain"
          style={{
            position: "absolute",
            top: 150,
            width: "88%",
            aspectRatio: 852 / 382,
          }}
        />

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
              borderColor: "#FFFFFF",
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
