
import React, { useState } from "react";
import {
  Image,
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const NAVY = "#000535";
const WHITE = "#FFFFFF";
const ACCENT = "#25A9FF";

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
  const { width, height } = useWindowDimensions();

  const compact = height < 780;
  const narrow = width < 360;

  return (
    <ImageBackground
      source={BACKGROUND}
      resizeMode="cover"
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View
        pointerEvents="none"
        style={styles.backgroundTint}
      />

      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "bottom"]}
      >
        <View style={[
          styles.content,
          narrow && styles.contentNarrow,
        ]}>
          {/* BRAND HEADER */}
          <View style={styles.header}>
            <Image
              source={WORDMARK}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="SaMi"
              style={[
                styles.wordmark,
                narrow && styles.wordmarkNarrow,
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Help"
              accessibilityHint="Opens SaMi Runner help information"
              onPress={() => setHelpVisible(true)}
              hitSlop={8}
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

          {/* MAIN MESSAGE — KEPT IN THE DARK SKY */}
          <View style={[
            styles.hero,
            compact && styles.heroCompact,
          ]}>
            <View style={styles.appLabel}>
              <Text style={styles.appLabelText}>
                SaMi Runner
              </Text>
            </View>

            <Text
              accessibilityRole="header"
              style={[
                styles.heading,
                compact && styles.headingCompact,
                narrow && styles.headingNarrow,
              ]}
            >
              Make every{"\n"}task count
              <Text style={styles.headingAccent}>.</Text>
            </Text>

            <Text style={[
              styles.description,
              compact && styles.descriptionCompact,
              narrow && styles.descriptionNarrow,
            ]}>
              Shop, pick up, assist and complete
              everyday tasks for your community
              with SaMi.
            </Text>
          </View>

          {/* FLEXIBLE SPACE KEEPS ACTIONS AT THE BOTTOM */}
          <View style={styles.spacer} />

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
          <View
            style={styles.modalCard}
            accessibilityRole="summary"
          >
            <Text style={styles.modalTitle}>
              SaMi Runner Help
            </Text>

            <Text style={styles.modalDescription}>
              New to SaMi Runner? Select Get started
              to begin registration.
              {"\n\n"}
              Already registered? Select Sign in
              to access your account.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => setHelpVisible(false)}
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.pressed,
              ]}
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

  backgroundImage: {
    width: "100%",
    height: "100%",
  },

  backgroundTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 5, 53, 0.07)",
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    paddingHorizontal: 25,
    paddingTop: 7,
    paddingBottom: 10,
  },

  contentNarrow: {
    paddingHorizontal: 21,
  },

  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  wordmark: {
    width: 150,
    height: 63,
  },

  wordmarkNarrow: {
    width: 137,
  },

  helpButton: {
    minHeight: 43,
    paddingHorizontal: 13,
    borderWidth: 1.3,
    borderColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  helpQuestion: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },

  helpText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "700",
  },

  hero: {
    alignItems: "flex-start",
    marginTop: 22,
    maxWidth: 350,
  },

  heroCompact: {
    marginTop: 17,
  },

  appLabel: {
    backgroundColor: "rgba(0, 91, 199, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(87, 180, 255, 0.5)",
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 7,
    marginBottom: 17,
  },

  appLabelText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.35,
  },

  heading: {
    color: WHITE,
    fontSize: 40,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: -1.1,
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 2 },
  },

  headingCompact: {
    fontSize: 36,
    lineHeight: 41,
  },

  headingNarrow: {
    fontSize: 35,
    lineHeight: 40,
  },

  headingAccent: {
    color: ACCENT,
  },

  description: {
    color: "#F0F3FF",
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: "500",
    marginTop: 13,
    maxWidth: 335,
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },

  descriptionCompact: {
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 11,
  },

  descriptionNarrow: {
    fontSize: 14,
    lineHeight: 21,
  },

  spacer: {
    flex: 1,
    minHeight: 20,
  },

  actions: {
    width: "100%",
    gap: 13,
    paddingBottom: 7,
  },

  primaryButton: {
    width: "100%",
    minHeight: 59,
    borderRadius: 17,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    position: "relative",
    elevation: 4,
  },

  primaryButtonText: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  arrow: {
    position: "absolute",
    right: 21,
    color: NAVY,
    fontSize: 25,
    fontWeight: "600",
  },

  secondaryButton: {
    width: "100%",
    minHeight: 57,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: WHITE,
    backgroundColor: "rgba(0, 5, 53, 0.48)",
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
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
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
    color: "#E3E9FA",
    fontSize: 15,
    lineHeight: 24,
  },

  modalButton: {
    minHeight: 48,
    backgroundColor: WHITE,
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
