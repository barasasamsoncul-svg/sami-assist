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
};

type Props = {
  isDark: boolean;
  searchQuery: string;
  onSelect: (category: string) => void;
};

const services: Service[] = [
  {
    id: "groceries",
    category: "groceries",
    illustration: require("../../assets/service-illustrations/groceries.png"),
    title: "Groceries",
    keywords: "food supermarket market shopping milk bread",
  },
  {
    id: "food",
    category: "food_delivery",
    illustration: require("../../assets/service-illustrations/food.png"),
    title: "Food & Delivery",
    keywords: "restaurant meals takeaway lunch dinner",
  },
  {
    id: "pickup",
    category: "pickup_delivery",
    illustration: require("../../assets/service-illustrations/pickup.png"),
    title: "Pick Up & Drop Off",
    keywords: "parcel package collection courier send",
  },
  {
    id: "bills",
    category: "bill_payments",
    illustration: require("../../assets/service-illustrations/bills.png"),
    title: "Bills & Payments",
    keywords: "pay bills utilities airtime electricity water",
  },
  {
    id: "laundry",
    category: "laundry_cleaning",
    illustration: require("../../assets/service-illustrations/laundry.png"),
    title: "Laundry & Dry Cleaning",
    keywords: "clothes washing ironing cleaning",
  },
  {
    id: "documents",
    category: "documents_admin",
    illustration: require("../../assets/service-illustrations/documents.png"),
    title: "Documents & Government",
    keywords: "forms offices paperwork administration",
  },
  {
    id: "clothing",
    category: "clothing_retail",
    illustration: require("../../assets/service-illustrations/clothing.png"),
    title: "Clothing & Returns",
    keywords: "clothes fashion retail exchange returns",
  },
  {
    id: "gifts",
    category: "shopping_gifts",
    illustration: require("../../assets/service-illustrations/gifts.png"),
    title: "Shopping & Gifts",
    keywords: "purchases presents gifts retail",
  },
  {
    id: "home",
    category: "home_services",
    illustration: require("../../assets/service-illustrations/home.png"),
    title: "Home Services",
    keywords: "house household repair plumbing electrician",
  },
  {
    id: "pharmacy",
    category: "pharmacy_health",
    illustration: require("../../assets/service-illustrations/pharmacy.png"),
    title: "Pharmacy & Health",
    keywords: "medicine pharmacy healthcare clinic drugs",
  },
  {
    id: "petcare",
    category: "pet_care",
    illustration: require("../../assets/service-illustrations/petcare.png"),
    title: "Pet Care",
    keywords: "pets animals dog cat supplies",
  },
  {
    id: "personal",
    category: "personal_errand",
    illustration: require("../../assets/service-illustrations/personal.png"),
    title: "Personal Assistance",
    keywords: "personal help assistance custom tasks",
  },
  {
    id: "queues",
    category: "queue_appointments",
    illustration: require("../../assets/service-illustrations/queues.png"),
    title: "Queues & Appointments",
    keywords: "waiting bookings appointments line",
  },
  {
    id: "business",
    category: "business_support",
    illustration: require("../../assets/service-illustrations/business.png"),
    title: "Business Errands",
    keywords: "business office company work support",
  },
  {
    id: "shopping",
    category: "shopping",
    illustration: require("../../assets/service-illustrations/shopping.png"),
    title: "Shopping & Essentials",
    keywords: "shopping essentials store purchases",
  },
  {
    id: "other",
    category: "other",
    illustration: require("../../assets/service-illustrations/other.png"),
    title: "Custom Errand",
    keywords: "other different special request custom anything",
  },
];

const CARD_WIDTH = "48%";
const IMAGE_HEIGHT = 136;
const EMPTY_STATE_RADIUS = 16;

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? {
        text: "#E5EDF8",
        muted: "#A8B8CD",
        emptyBg: "#111F33",
        emptyBorder: "#263D58",
        accent: "#79AEFF",
      }
    : {
        text: "#1A2C44",
        muted: "#78869A",
        emptyBg: "#FFFFFF",
        emptyBorder: "#E6ECF4",
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
          borderRadius: EMPTY_STATE_RADIUS,
          borderWidth: 1,
          borderColor: palette.emptyBorder,
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
          <Ionicons
            name="search-outline"
            size={20}
            color={palette.accent}
          />
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
        rowGap: 16,
      }}
    >
      {filteredServices.map((service) => (
        <Pressable
          key={service.id}
          accessibilityRole="button"
          accessibilityLabel={`${service.title} errand`}
          onPress={() => onSelect(service.category)}
          style={({ pressed }) => ({
            width: CARD_WIDTH,
            alignItems: "center",
            justifyContent: "flex-start",
            paddingVertical: 2,
            gap: 7,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <Image
            source={service.illustration}
            resizeMode="contain"
            style={{
              width: "100%",
              height: IMAGE_HEIGHT,
            }}
          />

          <Text
            numberOfLines={2}
            style={{
              width: "100%",
              color: palette.text,
              fontSize: 13,
              lineHeight: 17,
              fontWeight: "600",
              letterSpacing: -0.1,
              textAlign: "center",
            }}
          >
            {service.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}