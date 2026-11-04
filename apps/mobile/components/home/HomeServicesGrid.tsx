import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Service = {
  id: string;
  category: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
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
  { id: "groceries", category: "groceries", icon: "basket", title: "Groceries", keywords: "food supermarket market shopping", color: "#D99A37" },
  { id: "food", category: "food_delivery", icon: "fast-food", title: "Food & Delivery", keywords: "restaurant meals takeaway food", color: "#D97770" },
  { id: "pickup", category: "pickup_delivery", icon: "cube", title: "Pick Up & Drop Off", keywords: "parcel package collection delivery", color: "#6284C9" },
  { id: "bills", category: "bill_payments", icon: "receipt", title: "Bills & Payments", keywords: "pay bills utilities payments", color: "#D8A14A" },
  { id: "laundry", category: "laundry_cleaning", icon: "shirt", title: "Laundry & Dry Cleaning", keywords: "clothes washing ironing cleaning", color: "#6D9BCB" },
  { id: "documents", category: "documents_admin", icon: "document-text", title: "Documents & Government", keywords: "forms offices paperwork administration", color: "#7897CC" },
  { id: "clothing", category: "clothing_retail", icon: "pricetag", title: "Clothing & Returns", keywords: "clothes fashion retail exchange returns", color: "#C87EA0" },
  { id: "gifts", category: "shopping_gifts", icon: "gift", title: "Shopping & Gifts", keywords: "purchases presents gifts retail", color: "#C87EA0" },
  { id: "home", category: "home_services", icon: "home", title: "Home Services", keywords: "house household home tasks", color: "#5CA99B" },
  { id: "pharmacy", category: "pharmacy_health", icon: "medkit", title: "Pharmacy & Health", keywords: "medicine pharmacy healthcare collection", color: "#59A985" },
  { id: "petcare", category: "pet_care", icon: "paw", title: "Pet Care", keywords: "pets animals pet supplies", color: "#D0A05A" },
  { id: "personal", category: "personal_errand", icon: "person", title: "Personal Assistance", keywords: "personal help assistance tasks", color: "#5CA995" },
  { id: "queues", category: "queue_appointments", icon: "time", title: "Queues & Appointments", keywords: "waiting bookings appointments queue", color: "#5CA99B" },
  { id: "business", category: "business_support", icon: "briefcase", title: "Business Errands", keywords: "business office company work support", color: "#7193C8" },
  { id: "shopping", category: "shopping", icon: "cart", title: "Shopping & Essentials", keywords: "shopping essentials store purchases", color: "#D2A051" },
  { id: "other", category: "other", icon: "construct", title: "Custom Errand", keywords: "other different special request custom", color: "#7193C8" },
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

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? {
        text: "#E5EDF8",
        muted: "#A8B8CD",
        tile: "#13243A",
        border: "#263D58",
      }
    : {
        text: "#263A54",
        muted: "#78869A",
        tile: "#FFFFFF",
        border: "#E6ECF4",
      };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = services.filter((service) => {
    const searchableText = `${service.title} ${service.keywords}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  return (
    <View style={{ width: "100%" }}>
      <View
        style={{
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
            accessibilityLabel={service.title}
            onPress={() => onSelect(service.category)}
            style={({ pressed }) => ({
              width: "23%",
              minHeight: 90,
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 7,
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 17,
                backgroundColor: palette.tile,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={service.icon}
                size={29}
                color={isDark ? darkIconColors[service.id] : service.color}
              />
            </View>

            <Text
              numberOfLines={2}
              style={{
                width: "100%",
                minHeight: 28,
                color: palette.text,
                fontSize: 10.5,
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
