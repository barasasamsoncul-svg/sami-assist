import { useMemo } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Service = {
  id: string;
  category: string;
  illustration: ImageSourcePropType;
  title: string;
  keywords: string;
  color: string;
};

type Props = {
  isDark: boolean;
  searchQuery: string;
  onSelect: (category: string) => void;
};

const services: Service[] = [
  { id: "groceries", category: "groceries", illustration: require("../../assets/service-illustrations/groceries.png"), title: "Groceries", keywords: "food supermarket market shopping milk bread", color: "#D99A37" },
  { id: "food", category: "food_delivery", illustration: require("../../assets/service-illustrations/food.png"), title: "Food & Delivery", keywords: "restaurant meals takeaway lunch dinner", color: "#D97770" },
  { id: "pickup", category: "pickup_delivery", illustration: require("../../assets/service-illustrations/pickup.png"), title: "Pick Up & Drop Off", keywords: "parcel package collection courier send", color: "#6284C9" },
  { id: "bills", category: "bill_payments", illustration: require("../../assets/service-illustrations/bills.png"), title: "Bills & Payments", keywords: "pay bills utilities airtime electricity water", color: "#D8A14A" },
  { id: "laundry", category: "laundry_cleaning", illustration: require("../../assets/service-illustrations/laundry.png"), title: "Laundry & Dry Cleaning", keywords: "clothes washing ironing cleaning", color: "#6D9BCB" },
  { id: "documents", category: "documents_admin", illustration: require("../../assets/service-illustrations/documents.png"), title: "Documents & Government", keywords: "forms offices paperwork administration", color: "#7897CC" },
  { id: "clothing", category: "clothing_retail", illustration: require("../../assets/service-illustrations/clothing.png"), title: "Clothing & Returns", keywords: "clothes fashion retail exchange returns", color: "#C87EA0" },
  { id: "gifts", category: "shopping_gifts", illustration: require("../../assets/service-illustrations/gifts.png"), title: "Shopping & Gifts", keywords: "purchases presents gifts retail", color: "#C87EA0" },
  { id: "home", category: "home_services", illustration: require("../../assets/service-illustrations/home.png"), title: "Home Services", keywords: "house household repair plumbing electrician", color: "#5CA99B" },
  { id: "pharmacy", category: "pharmacy_health", illustration: require("../../assets/service-illustrations/pharmacy.png"), title: "Pharmacy & Health", keywords: "medicine pharmacy healthcare clinic drugs", color: "#59A985" },
  { id: "petcare", category: "pet_care", illustration: require("../../assets/service-illustrations/petcare.png"), title: "Pet Care", keywords: "pets animals dog cat supplies", color: "#D0A05A" },
  { id: "personal", category: "personal_errand", illustration: require("../../assets/service-illustrations/personal.png"), title: "Personal Assistance", keywords: "personal help assistance custom tasks", color: "#5CA995" },
  { id: "queues", category: "queue_appointments", illustration: require("../../assets/service-illustrations/queues.png"), title: "Queues & Appointments", keywords: "waiting bookings appointments line", color: "#5CA99B" },
  { id: "business", category: "business_support", illustration: require("../../assets/service-illustrations/business.png"), title: "Business Errands", keywords: "business office company work support", color: "#7193C8" },
  { id: "shopping", category: "shopping", illustration: require("../../assets/service-illustrations/shopping.png"), title: "Shopping & Essentials", keywords: "shopping essentials store purchases", color: "#D2A051" },
  { id: "other", category: "other", illustration: require("../../assets/service-illustrations/other.png"), title: "Custom Errand", keywords: "other different special request custom anything", color: "#7193C8" },
];

const darkIconColors: Record<string, string> = {
  groceries: "#E7C184",
  food: "#E9A09A",
  pickup: "#9BB5EA",
  bills: "#E7BE7E",
  laundry: "#A6C6E8",
  documents: "#AFC3E8",
  clothing: "#E0A4BE",
  gifts: "#E0A4BE",
  home: "#91C8BC",
  pharmacy: "#90CBA8",
  petcare: "#E5BD85",
  personal: "#91CCBE",
  queues: "#91C8BC",
  business: "#A5BCE3",
  shopping: "#E5BD85",
  other: "#A5BCE3",
};

const CARD_WIDTH = "48%";
const CARD_MIN_HEIGHT = 70;
const CARD_RADIUS = 16;
const ICON_TILE = 38;

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? {
        card: "#13243A",
        border: "#263D58",
        text: "#E5EDF8",
        muted: "#A8B8CD",
        emptyBg: "#111F33",
        accent: "#79AEFF",
      }
    : {
        card: "#FFFFFF",
        border: "#E6ECF4",
        text: "#1A2C44",
        muted: "#78869A",
        emptyBg: "#FFFFFF",
        accent: "#2463B8",
      };

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return services;

    return services.filter((service) =>
      `${service.title} ${service.keywords} ${service.category}`
        .toLowerCase()
        .includes(q),
    );
  }, [searchQuery]);

  if (filteredServices.length === 0) {
    return (
      <View
        style={{
          width: "100%",
          borderRadius: CARD_RADIUS,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.emptyBg,
          paddingVertical: 24,
          paddingHorizontal: 18,
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
              ? "rgba(121,174,255,0.12)"
              : "rgba(36,99,184,0.08)",
          }}
        >
          <Ionicons name="search-outline" size={20} color={palette.accent} />
        </View>

        <Text
          style={{
            color: palette.text,
            fontSize: 14,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          No errand matches “{searchQuery.trim()}”
        </Text>

        <Text
          style={{
            color: palette.muted,
            fontSize: 12.5,
            lineHeight: 18,
            textAlign: "center",
          }}
        >
          Try “groceries”, “food”, “parcel” or “pharmacy”.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        rowGap: 12,
      }}
    >
      {filteredServices.map((service) => {
        const iconColor = isDark
          ? darkIconColors[service.id] ?? service.color
          : service.color;

        return (
          <Pressable
            key={service.id}
            accessibilityRole="button"
            accessibilityLabel={`${service.title} errand`}
            onPress={() => onSelect(service.category)}
            style={({ pressed }) => ({
              width: CARD_WIDTH,
              minHeight: CARD_MIN_HEIGHT,
              borderRadius: CARD_RADIUS,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.card,
              paddingHorizontal: 11,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <View
              style={{
                width: ICON_TILE,
                height: ICON_TILE,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${iconColor}${isDark ? "2E" : "16"}`,
              }}
            >
              <Image
                source={service.illustration}
                resizeMode="contain"
                style={{ width: 36, height: 36 }}
              />
            </View>

            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: palette.text,
                fontSize: 12.5,
                lineHeight: 16.5,
                fontWeight: "600",
                letterSpacing: -0.1,
              }}
            >
              {service.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}