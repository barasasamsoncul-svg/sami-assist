
import {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from "react";

import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { dispatchGet } from "@/api";

type IconName = ComponentProps<typeof Ionicons>["name"];

type User = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url?: string | null;
};

type Service = {
  id: string;
  category: string;
  icon: IconName;
  title: string;
  keywords: string;
  color: string;
  lightBg: string;
  darkBg: string;
};

const NAVY = "#000535";
const BLUE = "#2463B8";

const customerServices: Service[] = [
  {
    id: "groceries",
    category: "groceries",
    icon: "basket",
    title: "Groceries",
    keywords: "food supermarket market shopping",
    color: "#E49A22",
    lightBg: "#FFF1D8",
    darkBg: "#49371D",
  },
  {
    id: "food",
    category: "food_delivery",
    icon: "fast-food",
    title: "Food & Delivery",
    keywords: "restaurant meals takeaway food",
    color: "#E87970",
    lightBg: "#FFF0ED",
    darkBg: "#472B2C",
  },
  {
    id: "pickup",
    category: "pickup_delivery",
    icon: "cube",
    title: "Pick Up & Drop Off",
    keywords: "parcel package collection delivery",
    color: "#5879C5",
    lightBg: "#EAF0FF",
    darkBg: "#29395B",
  },
  {
    id: "bills",
    category: "bill_payments",
    icon: "receipt",
    title: "Bills & Payments",
    keywords: "pay bills utilities payments",
    color: "#E8A12B",
    lightBg: "#FFF3DF",
    darkBg: "#48371F",
  },
  {
    id: "laundry",
    category: "laundry_cleaning",
    icon: "shirt",
    title: "Laundry & Dry Cleaning",
    keywords: "clothes washing ironing cleaning",
    color: "#5489C9",
    lightBg: "#EAF2FC",
    darkBg: "#293D58",
  },
  {
    id: "documents",
    category: "documents_admin",
    icon: "document-text",
    title: "Documents & Government",
    keywords: "forms offices paperwork administration",
    color: "#6084C2",
    lightBg: "#EBF1FA",
    darkBg: "#2C3A56",
  },
  {
    id: "gifts",
    category: "shopping_gifts",
    icon: "gift",
    title: "Shopping & Gifts",
    keywords: "purchases presents gifts retail",
    color: "#D66F9A",
    lightBg: "#FCECF3",
    darkBg: "#462D3F",
  },
  {
    id: "home",
    category: "home_services",
    icon: "home",
    title: "Home Services",
    keywords: "house household home tasks",
    color: "#398F83",
    lightBg: "#E8F5F1",
    darkBg: "#25443E",
  },
  {
    id: "pharmacy",
    category: "pharmacy_health",
    icon: "medkit",
    title: "Pharmacy & Health",
    keywords: "medicine pharmacy healthcare collection",
    color: "#31966F",
    lightBg: "#E8F6EE",
    darkBg: "#254637",
  },
  {
    id: "petcare",
    category: "pet_care",
    icon: "paw",
    title: "Pet Care",
    keywords: "pets animals pet supplies",
    color: "#D99A40",
    lightBg: "#FFF2E1",
    darkBg: "#453621",
  },
  {
    id: "personal",
    category: "personal_errand",
    icon: "person",
    title: "Personal Assistance",
    keywords: "personal help assistance tasks",
    color: "#319B82",
    lightBg: "#E7F6F1",
    darkBg: "#25443C",
  },
  {
    id: "other",
    category: "other",
    icon: "construct",
    title: "Custom Errand",
    keywords: "other different special request custom",
    color: "#507AB8",
    lightBg: "#EAF0FA",
    darkBg: "#2B3B55",
  },
  {
    id: "shopping",
    category: "shopping",
    icon: "cart",
    title: "Shopping & Essentials",
    keywords: "shopping essentials store purchases",
    color: "#DA982C",
    lightBg: "#FFF2DF",
    darkBg: "#46371F",
  },
  {
    id: "clothing",
    category: "clothing_retail",
    icon: "pricetag",
    title: "Clothing & Returns",
    keywords: "clothes fashion retail exchange returns",
    color: "#D66F9A",
    lightBg: "#FCECF3",
    darkBg: "#462D3F",
  },
  {
    id: "queues",
    category: "queue_appointments",
    icon: "time",
    title: "Queues & Appointments",
    keywords: "waiting bookings appointments queue",
    color: "#398F83",
    lightBg: "#E8F5F1",
    darkBg: "#25443E",
  },
  {
    id: "business",
    category: "business_support",
    icon: "briefcase",
    title: "Business Errands",
    keywords: "business office company work support",
    color: "#507AB8",
    lightBg: "#EAF0FA",
    darkBg: "#2B3B55",
  },
];

export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const isDark = systemScheme === "dark";

  const palette = isDark
    ? {
        background: "#080F1D",
        heading: "#F4F7FF",
        text: "#D8E2F1",
        muted: "#AAB8CC",
        border: "#293951",
        input: "#172337",
        hero: "#152B43",
        heroCircle: "#244766",
        blue: "#79AEFF",
        avatar: "#223D5E",
      }
    : {
        background: "#F7F8FA",
        heading: NAVY,
        text: "#24344C",
        muted: "#78869A",
        border: "#E5EAF1",
        input: "#F0F2F5",
        hero: "#E4F2EA",
        heroCircle: "#D0E9DA",
        blue: BLUE,
        avatar: "#EAF1FC",
      };

  const [user, setUser] = useState<User | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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

  // Search filters only the service grid.
  const filteredServices = customerServices.filter((service) =>
    (
      service.title +
      " " +
      service.keywords
    )
      .toLowerCase()
      .includes(serviceSearch.trim().toLowerCase()),
  );

  function startCustomerRequest(category: string) {
    const serviceRoutes: Record<string, string> = {
      shopping: "/(app)/services/shopping",
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
      other: "/(app)/services/other",
    };

    const destination = serviceRoutes[category];

    if (destination) {
      router.push(destination as never);
    }
  }

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
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 15,
          paddingTop: 8,
          paddingBottom: 28,
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
        {/* Header. Its left edge aligns with the search field below. */}
        <View
          style={{
            minHeight: 50,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 13,
          }}
        >
          <Image
            source={require("../../assets/sami-welcome-wordmark-transparent.png")}
            resizeMode="contain"
            accessibilityLabel="SaMi"
            style={{
              width: 112,
              height: 48,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            {/* Notifications, immediately before the profile photo */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() =>
                router.push("/(app)/notifications")
              }
              style={{
                width: 34,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={25}
                color={palette.heading}
              />

              {unreadNotifications > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 1,
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

            {/* Circular user photo */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => router.push("/(app)/account")}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
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
                    width: 40,
                    height: 40,
                  }}
                />
              ) : (
                <Text
                  style={{
                    color: palette.blue,
                    fontSize: 16,
                    fontWeight: "900",
                  }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Search bar */}
        <View
          style={{
            height: 46,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            borderRadius: 15,
            backgroundColor: palette.input,
            marginBottom: 15,
          }}
        >
          <Ionicons
            name="search-outline"
            size={20}
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
              height: 46,
              color: palette.heading,
              fontSize: 13,
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
                size={19}
                color={palette.muted}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Hero banner */}
        <View
          style={{
            minHeight: 112,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 17,
            backgroundColor: palette.hero,
            paddingLeft: 16,
            paddingRight: 8,
            overflow: "hidden",
            marginBottom: 19,
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              gap: 7,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: palette.heading,
                fontSize: 17,
                lineHeight: 21,
                fontWeight: "900",
                letterSpacing: -0.35,
              }}
            >
              Big or small,{"\n"}we run your errands.
            </Text>

            <Text
              style={{
                color: palette.muted,
                fontSize: 11,
                lineHeight: 16,
                fontWeight: "600",
              }}
            >
              Save time. Live more.
            </Text>
          </View>

          {/* Illustration area */}
          <View
            style={{
              width: 120,
              height: 108,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                position: "absolute",
                right: 8,
                top: 9,
                width: 87,
                height: 87,
                borderRadius: 44,
                backgroundColor: palette.heroCircle,
              }}
            />

            <Ionicons
              name="person"
              size={76}
              color={palette.blue}
              style={{
                marginTop: 15,
              }}
            />

            <View
              style={{
                position: "absolute",
                right: 5,
                bottom: 5,
                width: 39,
                height: 39,
                borderRadius: 13,
                backgroundColor: isDark ? "#254D45" : "#D0EDE0",
                borderWidth: 2,
                borderColor: palette.hero,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="bag-handle"
                size={23}
                color={isDark ? "#70D2B5" : "#278B75"}
              />
            </View>
          </View>
        </View>

        {/* Large service icons: four columns, all 16 categories */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            rowGap: 19,
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
                minHeight: 94,
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 7,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 15,
                  backgroundColor: isDark
                    ? service.darkBg
                    : service.lightBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={service.icon}
                  size={31}
                  color={service.color}
                />
              </View>

              <Text
                numberOfLines={2}
                style={{
                  width: "100%",
                  minHeight: 29,
                  color: palette.text,
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {service.title}
              </Text>
            </Pressable>
          ))}
        </View>

        {filteredServices.length === 0 ? (
          <Text
            style={{
              color: palette.muted,
              fontSize: 13,
              textAlign: "center",
              paddingVertical: 28,
            }}
          >
            No matching service found.
          </Text>
        ) : null}

        {error ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: isDark ? "#FFB8B8" : "#B42318",
              backgroundColor: isDark ? "#3B2028" : "#FDECEC",
              borderRadius: 12,
              padding: 12,
              lineHeight: 19,
              marginTop: 14,
            }}
          >
            {error}
          </Text>
        ) : null}

        {busy && !user ? (
          <ActivityIndicator
            color={palette.blue}
            style={{ marginTop: 14 }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
