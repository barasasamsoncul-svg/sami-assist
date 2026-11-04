
import { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { dispatchGet } from "@/api";

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

const customerServices = [
  {
    id: "groceries",
    category: "groceries",
    icon: "basket-outline",
    title: "Groceries",
    keywords: "food supermarket market shopping",
    color: "#D99528",
    lightBg: "#FFF1D8",
    darkBg: "#3D301D",
  },
  {
    id: "food",
    category: "food_delivery",
    icon: "fast-food-outline",
    title: "Food & Delivery",
    keywords: "restaurant meals takeaway food",
    color: "#E87970",
    lightBg: "#FFF0ED",
    darkBg: "#3D2729",
  },
  {
    id: "pickup",
    category: "pickup_delivery",
    icon: "cube-outline",
    title: "Pick Up & Drop Off",
    keywords: "parcel package collection delivery",
    color: "#5879C5",
    lightBg: "#EAF0FF",
    darkBg: "#253352",
  },
  {
    id: "bills",
    category: "bill_payments",
    icon: "receipt-outline",
    title: "Bills & Payments",
    keywords: "pay bills utilities payments",
    color: "#D99A2B",
    lightBg: "#FFF3DF",
    darkBg: "#3C301F",
  },
  {
    id: "laundry",
    category: "laundry_cleaning",
    icon: "shirt-outline",
    title: "Laundry & Dry Cleaning",
    keywords: "clothes washing ironing cleaning",
    color: "#5489C9",
    lightBg: "#EAF2FC",
    darkBg: "#25354C",
  },
  {
    id: "documents",
    category: "documents_admin",
    icon: "document-text-outline",
    title: "Documents & Government",
    keywords: "forms offices paperwork administration",
    color: "#5B80B8",
    lightBg: "#EBF1FA",
    darkBg: "#28354A",
  },
  {
    id: "gifts",
    category: "shopping_gifts",
    icon: "gift-outline",
    title: "Shopping & Gifts",
    keywords: "purchases presents gifts retail",
    color: "#D66F9A",
    lightBg: "#FCECF3",
    darkBg: "#3B2938",
  },
  {
    id: "home",
    category: "home_services",
    icon: "home-outline",
    title: "Home Services",
    keywords: "house household home tasks",
    color: "#398F83",
    lightBg: "#E8F5F1",
    darkBg: "#213B37",
  },
  {
    id: "pharmacy",
    category: "pharmacy_health",
    icon: "medkit-outline",
    title: "Pharmacy & Health",
    keywords: "medicine pharmacy healthcare collection",
    color: "#31966F",
    lightBg: "#E8F6EE",
    darkBg: "#203B30",
  },
  {
    id: "petcare",
    category: "pet_care",
    icon: "paw-outline",
    title: "Pet Care",
    keywords: "pets animals pet supplies",
    color: "#D99A40",
    lightBg: "#FFF2E1",
    darkBg: "#3A3022",
  },
  {
    id: "personal",
    category: "personal_errand",
    icon: "person-outline",
    title: "Personal Assistance",
    keywords: "personal help assistance tasks",
    color: "#319B82",
    lightBg: "#E7F6F1",
    darkBg: "#203B36",
  },
  {
    id: "other",
    category: "other",
    icon: "add-circle-outline",
    title: "Custom Errand",
    keywords: "other different special request",
    color: "#507AB8",
    lightBg: "#EAF0FA",
    darkBg: "#25334A",
  },
] as const;

export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const isDark = systemScheme === "dark";

  const palette = isDark
    ? {
        background: "#080F1D",
        surface: "#111C2E",
        heading: "#F4F7FF",
        text: "#D8E2F1",
        muted: "#AAB8CC",
        border: "#293951",
        input: "#142238",
        hero: "#142A43",
        heroArtwork: "#203F60",
        blue: "#79AEFF",
        avatar: "#223D5E",
      }
    : {
        background: "#F7F8FA",
        surface: "#FFFFFF",
        heading: NAVY,
        text: "#24344C",
        muted: "#78869A",
        border: "#E5EAF1",
        input: "#F0F2F5",
        hero: "#EAF2FB",
        heroArtwork: "#D6E6F8",
        blue: BLUE,
        avatar: "#EAF1FC",
      };

  const [user, setUser] = useState<User | null>(null);
  const [unreadNotifications, setUnreadNotifications] =
    useState(0);
  const [serviceSearch, setServiceSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      const result = await dispatchGet<{ user: User }>("me");
      setUser(result.user);

      dispatchGet<{ unread: number }>("notifications")
        .then((data) =>
          setUnreadNotifications(Number(data.unread || 0)),
        )
        .catch(() => setUnreadNotifications(0));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your SaMi home screen could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName =
    user?.full_name?.trim().split(/\s+/)[0] || "there";

  const filteredServices = customerServices.filter(
    (service) => {
      const searchableText = (
        service.title +
        " " +
        service.keywords
      ).toLowerCase();

      return searchableText.includes(
        serviceSearch.trim().toLowerCase(),
      );
    },
  );

  function startCustomerRequest(category: string) {
    const serviceRoutes: Record<string, string> = {
      groceries: "/(app)/services/groceries",
      food_delivery: "/(app)/services/food",
      pickup_delivery: "/(app)/services/pickup",
      bill_payments: "/(app)/services/bills",
      laundry_cleaning: "/(app)/services/laundry",
      documents_admin: "/(app)/services/documents",
      shopping_gifts: "/(app)/services/gifts",
      home_services: "/(app)/services/home",
      pharmacy_health: "/(app)/services/pharmacy",
      pet_care: "/(app)/services/petcare",
      personal_errand: "/(app)/services/personal",
      other: "/(app)/services/other",
    };

    const destination = serviceRoutes[category];

    if (destination) {
      router.push(destination as never);
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={palette.background}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 15,
          paddingTop: 7,
          paddingBottom: 24,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={load}
            tintColor={palette.blue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Image
            source={require("../../assets/sami-welcome-wordmark-transparent.png")}
            resizeMode="contain"
            accessibilityLabel="SaMi"
            style={{
              width: 105,
              height: 47,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() =>
                router.push("/(app)/notifications")
              }
              style={{
                width: 34,
                height: 38,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={23}
                color={palette.heading}
              />

              {unreadNotifications > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 2,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: "#E34D59",
                    borderWidth: 1.5,
                    borderColor: palette.background,
                  }}
                />
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() =>
                router.push("/(app)/account")
              }
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: "hidden",
                borderWidth: 1.5,
                borderColor: palette.border,
                backgroundColor: palette.avatar,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  resizeMode="cover"
                  style={{
                    width: 36,
                    height: 36,
                  }}
                />
              ) : (
                <Text
                  style={{
                    color: palette.blue,
                    fontSize: 15,
                    fontWeight: "900",
                  }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Service search - affects only the icons below */}
        <View
          style={{
            height: 43,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 13,
            borderRadius: 14,
            backgroundColor: palette.input,
          }}
        >
          <Ionicons
            name="search-outline"
            size={19}
            color={palette.muted}
          />

          <TextInput
            value={serviceSearch}
            onChangeText={setServiceSearch}
            placeholder="What can we do for you today?"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={{
              flex: 1,
              height: 43,
              color: palette.heading,
              fontSize: 12,
            }}
            accessibilityLabel="Search errand services"
          />

          {serviceSearch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setServiceSearch("")}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={palette.muted}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Small hero banner */}
        <View
          style={{
            minHeight: 103,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 17,
            backgroundColor: palette.hero,
            paddingLeft: 15,
            paddingRight: 8,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              gap: 6,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: palette.heading,
                fontSize: 16,
                lineHeight: 20,
                fontWeight: "900",
                letterSpacing: -0.3,
              }}
            >
              Big or small,{"\n"}we run your errands.
            </Text>

            <Text
              style={{
                color: palette.muted,
                fontSize: 10,
                lineHeight: 15,
                fontWeight: "600",
              }}
            >
              Save time. Live more.
            </Text>
          </View>

          <View
            style={{
              width: 112,
              height: 96,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                position: "absolute",
                right: 9,
                top: 8,
                width: 78,
                height: 78,
                borderRadius: 39,
                backgroundColor: palette.heroArtwork,
              }}
            />

            <Ionicons
              name="person-outline"
              size={54}
              color={palette.blue}
              style={{
                marginTop: 7,
              }}
            />

            <View
              style={{
                position: "absolute",
                right: 8,
                bottom: 8,
                width: 34,
                height: 34,
                borderRadius: 12,
                backgroundColor: isDark
                  ? "#1D584E"
                  : "#D9F1E9",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: palette.hero,
              }}
            >
              <Ionicons
                name="bag-handle-outline"
                size={19}
                color={isDark ? "#63D1B4" : "#278B75"}
              />
            </View>

            <View
              style={{
                position: "absolute",
                left: 8,
                bottom: 9,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: "#E7AD4D",
              }}
            />
          </View>
        </View>

        {/* Four-column service icon grid */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: 15,
            paddingTop: 2,
          }}
        >
          {filteredServices.map((service) => (
            <Pressable
              key={service.id}
              accessibilityRole="button"
              accessibilityLabel={service.title}
              onPress={() =>
                startCustomerRequest(service.category)
              }
              style={({ pressed }) => ({
                width: "23.5%",
                minHeight: 78,
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 6,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: isDark
                    ? service.darkBg
                    : service.lightBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={service.icon}
                  size={22}
                  color={service.color}
                />
              </View>

              <Text
                numberOfLines={2}
                style={{
                  width: "100%",
                  minHeight: 27,
                  color: palette.text,
                  fontSize: 10,
                  lineHeight: 13,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {service.title}
              </Text>
            </Pressable>
          ))}

          {filteredServices.length === 0 ? (
            <Text
              style={{
                width: "100%",
                color: palette.muted,
                fontSize: 12,
                textAlign: "center",
                paddingVertical: 20,
              }}
            >
              No matching service found.
            </Text>
          ) : null}
        </View>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: isDark ? "#FFB8B8" : "#B42318",
              backgroundColor: isDark ? "#3B2028" : "#FDECEC",
              borderRadius: 12,
              padding: 12,
              lineHeight: 19,
            }}
          >
            {error}
          </Text>
        ) : null}

        {busy && !user ? (
          <ActivityIndicator color={palette.blue} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
