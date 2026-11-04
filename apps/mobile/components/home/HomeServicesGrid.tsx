
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Service = {
  id: string;
  category: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  keywords: string;
  color: string;
  lightBg: string;
  darkBg: string;
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
    id: "other",
    category: "other",
    icon: "construct",
    title: "Custom Errand",
    keywords: "other different special request custom",
    color: "#507AB8",
    lightBg: "#EAF0FA",
    darkBg: "#2B3B55",
  },
];

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? {
        text: "#E2E9F4",
        muted: "#AAB8CC",
      }
    : {
        text: "#24344C",
        muted: "#78869A",
      };

  const filteredServices = services.filter((service) => {
    const searchableText =
      `${service.title} ${service.keywords}`.toLowerCase();

    return searchableText.includes(
      searchQuery.trim().toLowerCase(),
    );
  });

  return (
    <View
      style={{
        width: "100%",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 23,
        }}
      >
        {filteredServices.map((service) => (
          <Pressable
            key={service.id}
            accessibilityRole="button"
            accessibilityLabel={service.title}
            onPress={() => onSelect(service.category)}
            style={({ pressed }) => ({
              width: "23.5%",
              minHeight: 103,
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 17,
                backgroundColor: isDark
                  ? service.darkBg
                  : service.lightBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={service.icon}
                size={35}
                color={service.color}
              />
            </View>

            <Text
              numberOfLines={2}
              style={{
                width: "100%",
                minHeight: 30,
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
    </View>
  );
}
