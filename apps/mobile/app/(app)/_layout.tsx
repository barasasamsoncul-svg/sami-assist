import { Stack, router, usePathname, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { dispatchGet } from "@/api";
import { colors } from "@/theme";

type Role = "customer" | "provider" | "admin";
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type NavItem = { path: string; href: Href; label: string; icon: string; activeIcon?: IoniconName };

const customerTabs: NavItem[] = [
  { path: "/", href: "/(app)", label: "Home", icon: "home-outline", activeIcon: "home" },
  { path: "/errands", href: "/(app)/errands", label: "My Errands", icon: "receipt-outline", activeIcon: "receipt" },
  { path: "/messages", href: "/(app)/messages", label: "Messages", icon: "chatbubble-ellipses-outline", activeIcon: "chatbubble-ellipses" },
  { path: "/account", href: "/(app)/account", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

const providerTabs: NavItem[] = [
  { path: "/", href: "/(app)", label: "Home", icon: "⌂" },
  { path: "/errands", href: "/(app)/errands", label: "Errands", icon: "▤" },
  { path: "/payments", href: "/(app)/payments", label: "Earnings", icon: "▱" },
  { path: "/account", href: "/(app)/account", label: "Account", icon: "●" },
];

const adminTabs: NavItem[] = [
  { path: "/", href: "/(app)", label: "Overview", icon: "⌂" },
  { path: "/errands", href: "/(app)/errands", label: "Errands", icon: "▤" },
  { path: "/operations", href: "/(app)/operations", label: "Operations", icon: "⌘" },
  { path: "/account", href: "/(app)/account", label: "Account", icon: "●" },
];

export default function AppLayout() {
  const pathname = usePathname();
  const [role, setRole] = useState<Role>("customer");

  useEffect(() => {
    let active = true;
    dispatchGet<{ user: { role: Role } }>("me")
      .then(({ user }) => { if (active && user?.role) setRole(user.role); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const tabs = role === "provider" ? providerTabs : role === "admin" ? adminTabs : customerTabs;
  const currentPath = pathname === "/index" ? "/" : pathname;
  const showTabBar = tabs.some((tab) => tab.path === currentPath);

  return (
    <View style={styles.container}>
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
        animation: "slide_from_right",
      }} />
      {showTabBar ? (
        <View accessibilityRole="tablist" style={styles.tabBar}>
          {role === "customer" ? (
            <>
              {tabs.filter((tab) => tab.path === "/" || tab.path === "/errands").map((tab) => {
                const selected = tab.path === currentPath;
                return (
                  <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { if (!selected) router.replace(tab.href); }} style={styles.tabButton}>
                    <View style={[styles.iconWrap, selected && styles.activeIconWrap]}>
                      <Ionicons name={(selected ? tab.activeIcon || tab.icon : tab.icon) as IoniconName} size={22} color={selected ? colors.blue : colors.muted} />
                    </View>
                    <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.activeTabLabel]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" accessibilityLabel="Create an errand" onPress={() => router.push("/(app)/request")} style={styles.createTabButton}>
                <View style={styles.createTabIcon}><Ionicons name="add" size={30} color={colors.white} /></View>
                <Text style={styles.createTabLabel}>Create</Text>
              </Pressable>
              {tabs.filter((tab) => tab.path === "/messages" || tab.path === "/account").map((tab) => {
                const selected = tab.path === currentPath;
                return (
                  <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { if (!selected) router.replace(tab.href); }} style={styles.tabButton}>
                    <View style={[styles.iconWrap, selected && styles.activeIconWrap]}>
                      <Ionicons name={(selected ? tab.activeIcon || tab.icon : tab.icon) as IoniconName} size={22} color={selected ? colors.blue : colors.muted} />
                    </View>
                    <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.activeTabLabel]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </>
          ) : tabs.map((tab) => {
            const selected = tab.path === currentPath;
            return (
              <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { if (!selected) router.replace(tab.href); }} style={styles.tabButton}>
                <View style={[styles.iconWrap, selected && styles.activeIconWrap]}>
                  <Text style={[styles.tabIcon, selected && styles.activeTabIcon]}>{tab.icon}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.activeTabLabel]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  tabBar: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 5,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  activeIconWrap: { backgroundColor: "#EAF1FC" },
  tabIcon: { color: colors.muted, fontSize: 20, lineHeight: 24, fontWeight: "800" },
  activeTabIcon: { color: colors.blue },
  createTabButton: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 2 },
  createTabIcon: { width: 48, height: 38, marginTop: -14, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.white },
  createTabLabel: { color: colors.blue, fontSize: 10, fontWeight: "900" },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.1 },
  activeTabLabel: { color: colors.blue, fontWeight: "900" },
});
