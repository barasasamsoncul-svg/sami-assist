
import React, { useCallback, useState } from "react";

import {
  StyleSheet,
  View,
} from "react-native";

import { router } from "expo-router";

import SaMiLaunchAnimation from "../src/branding/SaMiLaunchAnimation";
import WelcomeScreen from "../src/screens/WelcomeScreen";

const BRAND_NAVY = "#000535";

export default function LaunchScreen() {
  const [showWelcome, setShowWelcome] = useState(false);

  const handleGetStarted = useCallback(() => {
    router.push("/(auth)/register");
  }, []);

  const handleSignIn = useCallback(() => {
    router.push("/(auth)/login");
  }, []);

  if (showWelcome) {
    return (
      <WelcomeScreen
        onGetStarted={handleGetStarted}
        onSignIn={handleSignIn}
      />
    );
  }

  return (
    <View style={styles.launch}>
      <SaMiLaunchAnimation
        onComplete={() => setShowWelcome(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  launch: {
    flex: 1,
    backgroundColor: BRAND_NAVY,
  },
});
