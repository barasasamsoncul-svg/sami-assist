
import React, { useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

const NAVY = "#000535";
const WHITE = "#FFFFFF";

const BACKGROUND = require("../../assets/welcome-background.png");
const WORDMARK = require("../../assets/sami-wordmark.png");

type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export default function WelcomeScreen({
  onGetStarted,
  onSignIn,
}: WelcomeScreenProps) {
  const [helpVisible, setHelpVisible] = useState(false);
  const { height } = useWindowDimensions();

  const compact = height < 760;

  return (
    <ImageBackground
      source={BACKGROUND}
      resizeMode="cover"
      style={styles.background}
    >
      {/* Subtle navy treatment keeps the text readable. */}
      <View pointerEvents="none" style={styles.backgroundOverlay} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* BRAND HEADER */}
          <View style={styles.header}>
            <Image
              source={WORDMARK}
              resizeMode="contain"
              accessibilityLabel="SaMi"
              style={styles.wordmark}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open help"
              onPress={() => setHelpVisible(true)}
              style={({ pressed }) => [
                styles.helpButton,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.helpIcon}>
                <Text style={styles.helpQuestion}>?</Text>
              </View>

              <Text style={styles.helpText}>Help</Text>
            </Pressable>
          </View>

          {/* WELCOME MESSAGE */}
          <View style={[
            styles.hero,
            compact && styles.heroCompact,
          ]}>
            <View style={styles.appLabel}>
              <Text style={styles.appLabelText}>
                SaMi Runner
              </Text>
            </View>

            <Text style={[
              styles.heading,
              compact && styles.headingCompact,
            ]}>
              Make every{"\n"}task count
              <Text style={styles.headingAccent}>.</Text>
            </Text>

            <Text style={[
              styles.description,
              compact && styles.descriptionCompact,
            ]}>
              Shop, pick up, assist and complete
              everyday tasks for your community
              with SaMi.
            </Text>
          </View>

          {/* PRIMARY ACTIONS */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              onPress={onGetStarted}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Get started
              </Text>

              <Text style={styles.arrow}>→</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              onPress={onSignIn}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* HELP DIALOG */}
      <Modal
        visible={helpVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setHelpVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              SaMi Runner Help
            </Text>

            <Text style={styles.modalDescription}>
              New to SaMi Runner? Choose Get started
              to begin your registration.
              {"\n\n"}
              Already have an account? Choose Sign in
              to access your Runner account.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => setHelpVisible(false)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: NAVY,
  },

  backgroundOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 5, 53, 0.12)",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    paddingHorizontal: 25,
    paddingTop: 12,
    paddingBottom: 15,
    justifyContent: "space-between",
  },

  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  wordmark: {
    width: 158,
    height: 68,
  },

  helpButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  helpIcon: {
    width: 21,
    height: 21,
    borderWidth: 1.4,
    borderColor: WHITE,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },

  helpQuestion: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "700",
  },

  helpText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "700",
  },

  hero: {
    marginTop: 32,
    marginBottom: 20,
    alignItems: "flex-start",
  },

  heroCompact: {
    marginTop: 20,
  },

  appLabel: {
    backgroundColor: "rgba(0,5,53,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 17,
    paddingVertical: 8,
    borderRadius: 24,
    marginBottom: 23,
  },

  appLabelText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  heading: {
    color: WHITE,
    fontSize: 43,
    lineHeight: 49,
    fontWeight: "900",
    letterSpacing: -1.2,
  },

  headingCompact: {
    fontSize: 37,
    lineHeight: 43,
  },

  headingAccent: {
    color: "#268BFF",
  },

  description: {
    color: WHITE,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "500",
    marginTop: 19,
    maxWidth: 345,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },

  descriptionCompact: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 15,
  },

  actions: {
    width: "100%",
    gap: 14,
    paddingBottom: 10,
  },

  primaryButton: {
    height: 60,
    borderRadius: 17,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    position: "relative",
    elevation: 5,
  },

  primaryButtonText: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "800",
  },

  arrow: {
    position: "absolute",
    right: 22,
    color: NAVY,
    fontSize: 25,
    fontWeight: "600",
  },

  secondaryButton: {
    height: 58,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: WHITE,
    backgroundColor: "rgba(0,5,53,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "700",
  },

  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  modalCard: {
    width: "100%",
    maxWidth: 390,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 22,
    padding: 25,
  },

  modalTitle: {
    color: WHITE,
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 14,
  },

  modalDescription: {
    color: "#E3E7F2",
    fontSize: 15,
    lineHeight: 24,
  },

  modalButton: {
    backgroundColor: WHITE,
    height: 48,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 23,
  },

  modalButtonText: {
    color: NAVY,
    fontWeight: "800",
    fontSize: 15,
  },
});
