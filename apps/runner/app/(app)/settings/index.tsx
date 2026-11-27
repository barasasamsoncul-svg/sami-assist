
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

type SettingsCategory = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

type SettingsGroup = {
  title: string;
  items: SettingsCategory[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "RUNNER SETUP",
    items: [
      {
        key: "vehicles",
        title: "Vehicles",
        icon: "car-outline",
        route: "/(app)/settings/vehicles",
      },
      {
        key: "navigation",
        title: "Navigation",
        icon: "navigate-outline",
        route: "/(app)/settings/navigation",
      },
      {
        key: "sound-voice",
        title: "Sound & Voice",
        icon: "volume-high-outline",
        route: "/(app)/settings/sound-voice",
      },
      {
        key: "safety",
        title: "Safety",
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
        icon: "person-outline",
        route: "/(app)/settings/account",
      },
      {
        key: "security",
        title: "Security",
        icon: "lock-closed-outline",
        route: "/(app)/settings/security",
      },
      {
        key: "privacy-data",
        title: "Privacy & Data",
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
        icon: "options-outline",
        route: "/(app)/settings/app-settings",
      },
      {
        key: "communications",
        title: "Communications",
        icon: "notifications-outline",
        route: "/(app)/settings/communications",
      },
      {
        key: "language-region",
        title: "Language & Region",
        icon: "globe-outline",
        route: "/(app)/settings/language-region",
      },
    ],
  },
  {
    title: "INFORMATION",
    items: [
      {
        key: "about",
        title: "About",
        icon: "information-circle-outline",
        route: "/(app)/settings/about",
      },
    ],
  },
];

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
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
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
              color="#00061D"
            />
          </Pressable>

          <Text
            style={[
              styles.headerTitle,
              { color: colors.text },
            ]}
          >
            Settings
          </Text>
        </View>

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

              <View style={styles.groupItems}>
                {group.items.map((item, index) => (
                  <View key={item.key}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      onPress={() => openCategory(item.route)}
                      style={({ pressed }) => [
                        styles.categoryRow,
                        {
                          backgroundColor: pressed
                            ? colors.pressed
                            : "transparent",
                        },
                      ]}
                    >
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

                      <Text
                        style={[
                          styles.categoryTitle,
                          { color: colors.text },
                        ]}
                      >
                        {item.title}
                      </Text>

                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color="#00061D"
                      />
                    </Pressable>

                    {index < group.items.length - 1 ? (
                      <View
                        style={[
                          styles.separator,
                          { backgroundColor: colors.divider },
                        ]}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

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

  headerTitle: {
    fontSize: runnerTypography.heading,
    fontWeight: runnerTypography.fontWeight.bold,
    lineHeight: 32,
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

  groupItems: {
    width: "100%",
  },

  categoryRow: {
    minHeight: runnerTouchTargets.comfortable + runnerSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: runnerSpacing.xs,
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

  categoryTitle: {
    flex: 1,
    fontSize: runnerTypography.body,
    fontWeight: runnerTypography.fontWeight.semibold,
  },

  separator: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});
