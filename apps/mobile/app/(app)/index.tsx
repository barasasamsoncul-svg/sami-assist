
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  DimensionValue,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { apiRequest } from "@/api";

import HomeHeader from "../../components/home/HomeHeader";
import HomeSearch from "../../components/home/HomeSearch";
import HomePromoHero from "../../components/home/HomePromoHero";
import HomeServicesGrid from "../../components/home/HomeServicesGrid";

type User = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
};

type ProfileResponse = {
  profile: User;
};

const NAVY = "#000535";
const BLUE = "#2463B8";

const SPACE = {
  screenX: 20,
  section: 22,
  header: 18,
  bottom: 32,
};

const SERVICE_ROUTES: Record<string, string> = {
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

function usePalette() {
  const isDark = useColorScheme() === "dark";

  return useMemo(
    () =>
      isDark
        ? {
            isDark,
            background: "#080F1D",
            surface: "#111A2C",
            border: "#1E2A40",
            heading: "#F4F7FF",
            muted: "#AAB8CC",
            blue: "#79AEFF",
            dangerText: "#FFB8B8",
            dangerBg: "#3B2028",
          }
        : {
            isDark,
            background: "#F7F8FA",
            surface: "#FFFFFF",
            border: "#E6E9EF",
            heading: NAVY,
            muted: "#78869A",
            blue: BLUE,
            dangerText: "#B42318",
            dangerBg: "#FDECEC",
          },
    [isDark],
  );
}

function SkeletonBlock({
  width,
  height,
  radius = 10,
  color,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  color: string;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: color,
      }}
    />
  );
}

function HomeGridSkeleton({ surface }: { surface: string }) {
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <SkeletonBlock width="48%" height={92} radius={18} color={surface} />
        <SkeletonBlock width="48%" height={92} radius={18} color={surface} />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <SkeletonBlock width="48%" height={92} radius={18} color={surface} />
        <SkeletonBlock width="48%" height={92} radius={18} color={surface} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const hasLoadedOnce = useRef(false);

  const loadHome = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      // This endpoint returns the signed avatar URL as well as
      // the customer's current name and contact information.
      const result = await apiRequest<ProfileResponse>(
        "/api/customer/profile",
      );

      if (!result.profile) {
        throw new Error(
          "Your customer profile could not be loaded.",
        );
      }

      setUser(result.profile);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your SaMi home screen could not be loaded.",
      );
    } finally {
      setBusy(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  // Refresh when returning from Account or Personal Profile.
  // This also obtains a fresh signed URL after an avatar change.
  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome]),
  );

  const firstName = useMemo(() => {
    const trimmed = user?.full_name?.trim();

    return trimmed
      ? trimmed.split(/\s+/)[0]
      : "there";
  }, [user?.full_name]);

  const openService = useCallback((category: string) => {
    const destination = SERVICE_ROUTES[category];

    if (destination) {
      router.push(destination as never);
    }
  }, []);

  const showSkeleton =
    !hasLoadedOnce.current && !user && busy;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
    >
      <StatusBar
        translucent={false}
        backgroundColor={palette.background}
        barStyle={
          palette.isDark
            ? "light-content"
            : "dark-content"
        }
      />

      {/* Header stays pinned. */}
      <View
        style={{
          paddingHorizontal: SPACE.screenX,
          paddingTop: 8,
          paddingBottom: SPACE.header,
        }}
      >
        <HomeHeader
          firstName={firstName}
          avatarUri={user?.avatar_url}
          locationLabel="Set your location"
          unreadNotifications={0}
          isDark={palette.isDark}
          onNotificationsPress={() =>
            router.push("/(app)/notifications")
          }
          onProfilePress={() =>
            router.push("/(app)/account")
          }
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: SPACE.screenX,
          paddingBottom: insets.bottom + SPACE.bottom,
          gap: SPACE.section,
        }}
        refreshControl={
          <RefreshControl
            refreshing={busy && hasLoadedOnce.current}
            onRefresh={loadHome}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <HomeSearch
          value={searchQuery}
          onChangeText={setSearchQuery}
          isDark={palette.isDark}
        />

        <HomePromoHero
          isDark={palette.isDark}
          title={"Big or small,\nwe run your errands."}
          subtitle="Save time. Live more."
        />

        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: palette.heading,
              fontSize: 18,
              fontWeight: "700",
              letterSpacing: -0.2,
            }}
          >
            What do you need today?
          </Text>

          <Text
            style={{
              color: palette.muted,
              fontSize: 13,
            }}
          >
            Tap a service to start your errand
          </Text>
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: palette.dangerBg,
              borderRadius: 14,
              padding: 14,
              gap: 10,
            }}
          >
            <Text
              style={{
                color: palette.dangerText,
                fontSize: 14,
                lineHeight: 19,
              }}
            >
              {error}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading your home screen"
              onPress={loadHome}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: palette.blue,
              }}
            >
              <Text
                style={{
                  color: palette.isDark
                    ? "#06101F"
                    : "#FFFFFF",
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {showSkeleton ? (
          <HomeGridSkeleton surface={palette.surface} />
        ) : (
          <HomeServicesGrid
            isDark={palette.isDark}
            searchQuery={searchQuery}
            onSelect={openService}
          />
        )}

        {busy && !user && hasLoadedOnce.current ? (
          <ActivityIndicator
            color={palette.blue}
            style={{ marginTop: 8 }}
          />
        ) : null}

        <Text
          style={{
            color: palette.muted,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 18,
          }}
        >
          Verified runners · Upfront pricing · Live tracking
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
