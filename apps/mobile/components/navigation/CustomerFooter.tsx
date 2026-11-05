import { ComponentProps } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type TabItem = {
  path: string;
  href: Href;
  label: string;
  icon: IoniconName;
  activeIcon: IoniconName;
};

const tabs: TabItem[] = [
  {
    path: "/",
    href: "/(app)",
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    path: "/errands",
    href: "/(app)/errands",
    label: "My Orders",
    icon: "receipt-outline",
    activeIcon: "receipt",
  },
  {
    path: "/messages",
    href: "/(app)/messages",
    label: "Messages",
    icon: "chatbubble-ellipses-outline",
    activeIcon: "chatbubble-ellipses",
  },
  {
    path: "/account",
    href: "/(app)/account",
    label: "Profile",
    icon: "person-outline",
    activeIcon: "person",
  },
];

const VISIBLE_PATHS = new Set(["/", "/errands", "/messages", "/account"]);

export default function CustomerFooter() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const palette = isDark
    ? {
        background: "#0E1B2D",
        border: "#20364F",
        muted: "#9AABC1",
        blue: "#83B4FF",
        selected: "#193552",
        create: "#2D73CC",
        createShadow: "#000000",
      }
    : {
        background: "#FFFFFF",
        border: "#E5EAF1",
        muted: "#78869A",
        blue: "#2463B8",
        selected: "#EAF1FC",
        create: "#2463B8",
        createShadow: "#102A4A",
      };

  // expo-router exposes the index as "/", but guard against "/index" and "/(app)".
  const currentPath =
    pathname === "/index" || pathname === "/(app)" || pathname === ""
      ? "/"
      : pathname;

  if (!VISIBLE_PATHS.has(currentPath)) {
    return null;
  }

  function renderTab(tab: TabItem) {
    const selected = tab.path === currentPath;

    return (
      <Pressable
        key={tab.path}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected }}
        onPress={() => {
          if (!selected) {
            router.replace(tab.href);
          }
        }}
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed }) => [
          styles.tabButton,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            selected && { backgroundColor: palette.selected },
          ]}
        >
          <Ionicons
            name={selected ? tab.activeIcon : tab.icon}
            size={22}
            color={selected ? palette.blue : palette.muted}
          />
        </View>

        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color: selected ? palette.blue : palette.muted,
              fontWeight: selected ? "800" : "600",
            },
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.footer,
        {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {renderTab(tabs[0])}
      {renderTab(tabs[1])}

      {/* Central create button */}
      <View style={styles.centerSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create an errand"
          accessibilityHint="Opens the new errand form"
          onPress={() => router.push("/(app)/request")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor: palette.create,
              borderColor: palette.background,
              opacity: pressed ? 0.86 : 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
              shadowColor: palette.createShadow,
              ...Platform.select({
                ios: {
                  shadowOpacity: isDark ? 0.5 : 0.18,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 5 },
                },
                android: { elevation: 6 },
                default: {},
              }),
            },
          ]}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>

      {renderTab(tabs[2])}
      {renderTab(tabs[3])}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  tabButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  tabLabel: {
    fontSize: 10.5,
    letterSpacing: 0.05,
  },

  centerSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    marginTop: -16,
  },
});