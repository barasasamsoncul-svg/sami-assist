
import { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  runnerRadii,
  runnerSpacing,
  runnerTouchTargets,
  runnerTypography,
  useRunnerTheme,
} from "@/theme";

/* =========================================================
   SETTINGS CATEGORY TYPES
========================================================= */

type SettingsCategory = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

type SettingsGroup = {
  title: string;
  items: SettingsCategory[];
};

/* =========================================================
   SETTINGS CATEGORIES
   Each category will have its own dedicated route and page.
========================================================= */

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "RUNNER SETUP",
    items: [
      {
        key: "vehicles",
        title: "Vehicles",
        description: "Your registered transport and vehicle details.",
        icon: "car-outline",
        route: "/(app)/settings/vehicles",
      },
      {
        key: "navigation",
        title: "Navigation",
        description: "Map display, routing and navigation preferences.",
        icon: "navigate-outline",
        route: "/(app)/settings/navigation",
      },
      {
        key: "sound-voice",
        title: "Sound & Voice",
        description: "Alert tones, spoken guidance and sound behaviour.",
        icon: "volume-high-outline",
        route: "/(app)/settings/sound-voice",
      },
      {
        key: "safety",
        title: "Safety",
        description: "Safety tools and emergency-related preferences.",
        icon: "shield-checkmark-outline",
        route: "/(app)/settings/safety",
      },
    ],
  },
  {
    title: "ACCOUNT & PROTECTION",
    items: [
      {
        key: "account",
        title: "Account",
        description: "Your Runner profile and account information.",
        icon: "person-outline",
        route: "/(app)/settings/account",
      },
      {
        key: "security",
        title: "Security",
        description: "Sign-in, passwords and account protection.",
        icon: "lock-closed-outline",
        route: "/(app)/settings/security",
      },
      {
        key: "privacy-data",
        title: "Privacy & Data",
        description: "Privacy choices and personal data controls.",
        icon: "shield-outline",
        route: "/(app)/settings/privacy-data",
      },
    ],
  },
  {
    title: "APP EXPERIENCE",
    items: [
      {
        key: "app-settings",
        title: "App Settings",
        description: "Appearance and general app behaviour.",
        icon: "options-outline",
        route: "/(app)/settings/app-settings",
      },
      {
        key: "communications",
        title: "Communications",
        description: "How SaMi sends updates and contacts you.",
        icon: "notifications-outline",
        route: "/(app)/settings/communications",
      },
      {
        key: "language-region",
        title: "Language & Region",
        description: "Language, country and regional formats.",
        icon: "globe-outline",
        route: "/(app)/settings/language-region",
      },
      {
        key: "accessibility",
        title: "Accessibility",
        description: "Text, contrast and interaction preferences.",
        icon: "accessibility-outline",
        route: "/(app)/settings/accessibility",
      },
    ],
  },
  {
    title: "INFORMATION",
    items: [
      {
        key: "about",
        title: "About",
        description: "SaMi Runner app information and legal details.",
        icon: "information-circle-outline",
        route: "/(app)/settings/about",
      },
    ],
  },
];

/* =========================================================
   SETTINGS LANDING SCREEN
========================================================= */

export default function RunnerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useRunnerTheme();

  const openCategory = useCallback((route: string) => {
    router.push(route as never);
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(app)" as never);
  }, []);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.paper },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + runnerSpacing.md,
            paddingBottom: insets.bottom + runnerSpacing.xxxl,
          },
        ]}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to dashboard"
            onPress={goBack}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.icon}
            />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text
              style={[
                styles.brandLabel,
                { color: colors.textSubtle },
              ]}
            >
              SaMi Runner
            </Text>

            <Text
              style={[
                styles.headerTitle,
                { color: colors.text },
              ]}
            >
              Settings
            </Text>
          </View>
        </View>

        {/* INTRODUCTION */}

        <View style={styles.introduction}>
          <Text
            style={[
              styles.introTitle,
              { color: colors.text },
            ]}
          >
            Make SaMi work your way
          </Text>

          <Text
            style={[
              styles.introDescription,
              { color: colors.textMuted },
            ]}
          >
            Manage your runner setup, account, preferences
            and how the app works.
          </Text>
        </View>

        {/* SETTINGS GROUPS */}

        <View style={styles.groups}>
          {SETTINGS_GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text
                style={[
                  styles.groupTitle,
                  { color: colors.textSubtle },
                ]}
              >
                {group.title}
              </Text>

              <View
                style={[
                  styles.groupCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {group.items.map((item, index) => (
                  <View key={item.key}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      accessibilityHint={item.description}
                      onPress={() => openCategory(item.route)}
                      style={({ pressed }) => [
                        styles.categoryRow,
                        {
                          backgroundColor: pressed
                            ? colors.pressed
                            : colors.surface,
                        },
                      ]}
                    >
                      {/* CATEGORY ICON */}

                      <View
                        style={[
                          styles.categoryIcon,
                          {
                            backgroundColor: colors.blueSoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={colors.blue}
                        />
                      </View>

                      {/* CATEGORY INFORMATION */}

                      <View style={styles.categoryCopy}>
                        <Text
                          style={[
                            styles.categoryTitle,
                            { color: colors.text },
                          ]}
                        >
                          {item.title}
                        </Text>

                        <Text
                          style={[
                            styles.categoryDescription,
                            { color: colors.textMuted },
                          ]}
                        >
                          {item.description}
                        </Text>
                      </View>

                      {/* NAVIGATION INDICATOR */}

                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={colors.textSubtle}
                      />
                    </Pressable>

                    {index < group.items.length - 1 ? (
                      <View
                        style={[
                          styles.separator,
                          {
                            backgroundColor: colors.divider,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text
            style={[
              styles.footerText,
              { color: colors.textSubtle },
            ]}
          >
            SaMi Runner
          </Text>

          <Text
            style={[
              styles.footerCaption,
              { color: colors.textMuted },
            ]}
          >
            Consider it done.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* =========================================================
   STYLES
   Layout values come from the shared theme tokens.
   Colours are supplied by useRunnerTheme().
========================================================= */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  content: {
    paddingHorizontal: runnerSpacing.lg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: runnerSpacing.md,
    marginBottom: runnerSpacing.xxl,
  },

  backButton: {
    width: runnerTouchTargets.minimum,
    height: runnerTouchTargets.minimum,
    borderRadius: runnerRadii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  brandLabel: {
    fontSize: runnerTypography.caption,
    fontWeight: runnerTypography.fontWeight.semibold,
    letterSpacing: 0.3,
  },

  headerTitle: {
    fontSize: runnerTypography.heading,
    fontWeight: runnerTypography.fontWeight.bold,
    lineHeight: 32,
  },

  introduction: {
    gap: runnerSpacing.xs,
    marginBottom: runnerSpacing.xxl,
  },

  introTitle: {
    fontSize: runnerTypography.title,
    fontWeight: runnerTypography.fontWeight.bold,
  },

  introDescription: {
    fontSize: runnerTypography.body,
    lineHeight: runnerTypography.body * runnerTypography.lineHeight.normal,
  },

  groups: {
    gap: runnerSpacing.xl,
  },

  group: {
    gap: runnerSpacing.sm,
  },

  groupTitle: {
    fontSize: runnerTypography.eyebrow,
    fontWeight: runnerTypography.fontWeight.bold,
    letterSpacing: 0.9,
  },

  groupCard: {
    borderWidth: 1,
    borderRadius: runnerRadii.lg,
    overflow: "hidden",
  },

  categoryRow: {
    minHeight: runnerTouchTargets.comfortable + runnerSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: runnerSpacing.md,
    paddingVertical: runnerSpacing.sm,
    gap: runnerSpacing.md,
  },

  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: runnerRadii.md,
    alignItems: "center",
    justifyContent: "center",
  },

  categoryCopy: {
    flex: 1,
    gap: runnerSpacing.xxs,
  },

  categoryTitle: {
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  categoryDescription: {
    fontSize: runnerTypography.caption,
    lineHeight:
      runnerTypography.caption * runnerTypography.lineHeight.normal,
  },

  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44 + runnerSpacing.md,
    marginRight: runnerSpacing.md,
  },

  footer: {
    alignItems: "center",
    gap: runnerSpacing.xxs,
    marginTop: runnerSpacing.xxxl,
  },

  footerText: {
    fontSize: runnerTypography.bodySmall,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  footerCaption: {
    fontSize: runnerTypography.caption,
  },
});
