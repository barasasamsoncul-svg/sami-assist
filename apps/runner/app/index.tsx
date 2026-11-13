
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";

import SaMiLaunchAnimation from "../src/branding/SaMiLaunchAnimation";
import WelcomeScreen from "../src/screens/WelcomeScreen";

const BRAND_NAVY = "#000535";

export default function LaunchScreen() {
  const [showWelcome, setShowWelcome] = useState(false);

  if (showWelcome) {
    return (
      <WelcomeScreen
        onGetStarted={() => {
          Alert.alert(
            "Registration",
            "The new SaMi Runner registration flow will be connected here."
          );
        }}
        onSignIn={() => {
          Alert.alert(
            "Sign in",
            "The new SaMi Runner sign-in flow will be connected here."
          );
        }}
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
