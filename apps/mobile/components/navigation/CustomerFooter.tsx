
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabItem = {
  path: string;
  href: Href;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
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
    path: "/account",
    href: "/(app)/account",
    label: "Profile",
    icon: "person-outline",
    activeIcon: "person",
  },
];

export default function CustomerFooter() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const palette = isDark
    ? {
        background: "#111C2E",
        border: "#293951",
        muted: "#AAB8CC",
        blue: "#79AEFF",
        selected: "#1B3150",
        create: "#2463B8",
      }
    : {
        background: "#FFFFFF",
        border: "#E5EAF1",
        muted: "#78869A",
        blue: "#2463B8",
        selected: "#EAF1FC",
        create: "#2463B8",
      };

  const currentPath = pathname === "/index" ? "/" : pathname;

  const visiblePaths = ["/", "/errands", "/account"];

  if (!visiblePaths.includes(currentPath)) {
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
        style={styles.tabButton}
      >
        <View
          style={[
            styles.iconWrap,
            selected && {
              backgroundColor: palette.selected,
            },
          ]}
        >
          <Ionicons
            name={selected ? tab.activeIcon : tab.icon}
            size={23}
            color={selected ? palette.blue : palette.muted}
          />
        </View>

        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color: selected ? palette.blue : palette.muted,
              fontWeight: selected ? "900" : "600",
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
          paddingBottom: Math.max(insets.bottom, 7),
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
          onPress={() => router.push("/(app)/request")}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor: palette.create,
              borderColor: palette.background,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons
            name="add"
            size={30}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      {/* Reserved navigation position: Messages is not shown */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.tabButton}
      />

      {renderTab(tabs[2])}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 5,
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
    width: 42,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.1,
  },

  centerSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  createButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    marginTop: -12,
  },
});
