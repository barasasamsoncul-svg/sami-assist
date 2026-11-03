
import { Stack, router, usePathname, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

type NavItem = {
  path: string;
  href: Href;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
};

const customerTabs: NavItem[] = [
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
    label: "My Errands",
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 1,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 13,
  },
  iconWrap: {
    width: 44,
    height: 29,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createTabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  createTabIcon: {
    width: 48,
    height: 38,
    marginTop: -14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  createTabLabel: {
    fontSize: 10,
    fontWeight: "900",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  activeTabLabel: {
    fontWeight: "900",
  },
});

export default function AppLayout() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const palette = isDark
    ? {
        background: "#080F1D",
        surface: "#111C2E",
        border: "#2A3A52",
        muted: "#AAB8CC",
        blue: "#79AEFF",
        accentSoft: "#142A49",
      }
    : {
        background: "#F4F7FC",
        surface: "#FFFFFF",
        border: "#DCE5F2",
        muted: "#6C7B91",
        blue: "#2463B8",
        accentSoft: "#EAF1FC",
      };

  const currentPath = pathname === "/index" ? "/" : pathname;

  const showTabBar = customerTabs.some(
    (tab) => tab.path === currentPath,
  );

  function renderTab(tab: NavItem) {
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
              backgroundColor: palette.accentSoft,
            },
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
            { color: palette.muted },
            selected && {
              color: palette.blue,
              fontWeight: "900",
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
      style={[
        styles.container,
        { backgroundColor: palette.background },
      ]}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: palette.background,
          },
          animation: "slide_from_right",
        }}
      />

      {showTabBar ? (
        <View
          accessibilityRole="tablist"
          style={[
            styles.tabBar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
            },
          ]}
        >
          {renderTab(customerTabs[0])}
          {renderTab(customerTabs[1])}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create an errand"
            onPress={() => router.push("/(app)/request")}
            style={styles.createTabButton}
          >
            <View
              style={[
                styles.createTabIcon,
                {
                  backgroundColor: palette.blue,
                  borderColor: palette.surface,
                },
              ]}
            >
              <Ionicons name="add" size={30} color="#FFFFFF" />
            </View>

            <Text
              style={[
                styles.createTabLabel,
                { color: palette.blue },
              ]}
            >
              Create
            </Text>
          </Pressable>

          {renderTab(customerTabs[2])}
          {renderTab(customerTabs[3])}
        </View>
      ) : null}
    </View>
  );
}
