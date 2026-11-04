import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

import HomeHeader from "../../components/home/HomeHeader";
import HomeSearch from "../../components/home/HomeSearch";
import HomePromoHero from "../../components/home/HomePromoHero";
import HomeServicesGrid from "../../components/home/HomeServicesGrid";

type User = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "customer";
  avatar_url?: string | null;
};

const NAVY = "#000535";
const BLUE = "#2463B8";

export default function HomeScreen() {
  const isDark = useColorScheme() === "dark";
  const palette = isDark
    ? { background: "#080F1D", heading: "#F4F7FF", muted: "#AAB8CC", blue: "#79AEFF" }
    : { background: "#F7F8FA", heading: NAVY, muted: "#78869A", blue: BLUE };

  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const loadHome = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await dispatchGet<{ user: User }>("me");
      setUser(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your SaMi home screen could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "there";

  function openService(category: string) {
    const serviceRoutes: Record<string, string> = {
      groceries: "/(app)/services/groceries",
      food_delivery: "/(app)/services/food",
      pickup_delivery: "/(app)/services/pickup",
      bill_payments: "/(app)/services/bills",
      laundry_cleaning: "/(app)/services/laundry",
      documents_admin: "/(app)/services/documents",
      clothing_retail: "/(app)/services/clothing",
      shopping_gifts: "/(app)/services/gifts",
      home_services: "/(app)/services/home",
      pharmacy_health: "/(app)/services/pharmacy",
      pet_care: "/(app)/services/petcare",
      queue_appointments: "/(app)/services/queues",
      personal_errand: "/(app)/services/personal",
      business_support: "/(app)/services/business",
      shopping: "/(app)/services/shopping",
      other: "/(app)/services/other",
    };
    const destination = serviceRoutes[category];
    if (destination) router.push(destination as never);
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <StatusBar
        translucent={false}
        backgroundColor={palette.background}
        barStyle={isDark ? "light-content" : "dark-content"}
      />
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 8 }}>
        <View style={{ marginBottom: 15 }}>
          <HomeHeader
            firstName={firstName}
            avatarUri={user?.avatar_url}
            locationLabel="Set your location"
            unreadNotifications={0}
            isDark={isDark}
            onNotificationsPress={() => router.push("/(app)/notifications")}
            onProfilePress={() => router.push("/(app)/account")}
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <HomeSearch value={searchQuery} onChangeText={setSearchQuery} isDark={isDark} />
        </View>

        <View style={{ marginBottom: 19 }}>
          <HomePromoHero
            isDark={isDark}
            title={"Big or small,\nwe run your errands."}
            subtitle="Save time. Live more."
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 2, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={busy} onRefresh={loadHome} tintColor={palette.blue} />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <HomeServicesGrid isDark={isDark} searchQuery={searchQuery} onSelect={openService} />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{
                color: isDark ? "#FFB8B8" : "#B42318",
                backgroundColor: isDark ? "#3B2028" : "#FDECEC",
                borderRadius: 12,
                padding: 12,
                lineHeight: 19,
                marginTop: 15,
              }}
            >
              {error}
            </Text>
          ) : null}
          {busy && !user ? <ActivityIndicator color={palette.blue} style={{ marginTop: 18 }} /> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
