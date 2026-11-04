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
  { id: "groceries", category: "groceries", icon: "basket", title: "Groceries", keywords: "food supermarket market shopping", color: "#D69A37" },
  { id: "food", category: "food_delivery", icon: "fast-food", title: "Food & Delivery", keywords: "restaurant meals takeaway food", color: "#D87570" },
  { id: "pickup", category: "pickup_delivery", icon: "cube", title: "Pick Up & Drop Off", keywords: "parcel package collection delivery", color: "#6386CC" },
  { id: "bills", category: "bill_payments", icon: "receipt", title: "Bills & Payments", keywords: "pay bills utilities payments", color: "#D6A044" },
  { id: "laundry", category: "laundry_cleaning", icon: "shirt", title: "Laundry & Dry Cleaning", keywords: "clothes washing ironing cleaning", color: "#6396C8" },
  { id: "documents", category: "documents_admin", icon: "document-text", title: "Documents & Government", keywords: "forms offices paperwork administration", color: "#718FC8" },
  { id: "clothing", category: "clothing_retail", icon: "pricetag", title: "Clothing & Returns", keywords: "clothes fashion retail exchange returns", color: "#C4779C" },
  { id: "gifts", category: "shopping_gifts", icon: "gift", title: "Shopping & Gifts", keywords: "purchases presents gifts retail", color: "#C4779C" },
  { id: "home", category: "home_services", icon: "home", title: "Home Services", keywords: "house household home tasks", color: "#55A393" },
  { id: "pharmacy", category: "pharmacy_health", icon: "medkit", title: "Pharmacy & Health", keywords: "medicine pharmacy healthcare collection", color: "#4F9E7C" },
  { id: "petcare", category: "pet_care", icon: "paw", title: "Pet Care", keywords: "pets animals pet supplies", color: "#C9944D" },
  { id: "personal", category: "personal_errand", icon: "person", title: "Personal Assistance", keywords: "personal help assistance tasks", color: "#4F9E8A" },
  { id: "queues", category: "queue_appointments", icon: "time", title: "Queues & Appointments", keywords: "waiting bookings appointments queue", color: "#4F9E8A" },
  { id: "business", category: "business_support", icon: "briefcase", title: "Business Errands", keywords: "business office company work support", color: "#6386BC" },
  { id: "shopping", category: "shopping", icon: "cart", title: "Shopping & Essentials", keywords: "shopping essentials store purchases", color: "#C9944D" },
  { id: "other", category: "other", icon: "construct", title: "Custom Errand", keywords: "other different special request custom", color: "#6386BC" },
];

const darkIconColors: Record<string, string> = {
  groceries: "#E7C184", food: "#E9A09A", pickup: "#9BB5EA", bills: "#E7BE7E",
  laundry: "#A6C6E8", documents: "#AFC3E8", clothing: "#E0A4BE", gifts: "#E0A4BE",
  home: "#91C8BC", pharmacy: "#90CBA8", petcare: "#E5BD85", personal: "#91CCBE",
  queues: "#91C8BC", business: "#A5BCE3", shopping: "#E5BD85", other: "#A5BCE3",
};

const tints: Record<string, string> = {
  groceries: "#FFF4DF", food: "#FCE9E7", pickup: "#EAF0FF", bills: "#FFF3DC",
  laundry: "#EAF3FC", documents: "#EDF1FC", clothing: "#F9EAF2", gifts: "#F9EAF2",
  home: "#E6F4F0", pharmacy: "#E5F3EC", petcare: "#F8EFDF", personal: "#E5F3EF",
  queues: "#E5F3EF", business: "#EAF0FA", shopping: "#F8EFDF", other: "#EAF0FA",
};

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? { text: "#EAF1FB", muted: "#A8B8CD", tile: "#172A42", border: "#2A405A" }
    : { text: "#263A54", muted: "#78869A", tile: "#FFFFFF", border: "#E9EDF3" };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = services.filter((service) =>
    `${service.title} ${service.keywords}`.toLowerCase().includes(normalizedQuery),
  );

  return (
    <View style={{ width: "100%" }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 17,
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
              minHeight: 105,
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              opacity: pressed ? 0.84 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View
              style={{
                width: 66,
                height: 66,
                maxWidth: "100%",
                borderRadius: 20,
                backgroundColor: isDark ? palette.tile : palette.tile,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#1C3555",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0 : 0.055,
                shadowRadius: 7,
                elevation: isDark ? 0 : 1,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: isDark ? "#203852" : tints[service.id],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={service.icon}
                  size={31}
                  color={isDark ? darkIconColors[service.id] : service.color}
                />
              </View>
            </View>
            <Text
              numberOfLines={2}
              style={{
                width: "100%",
                minHeight: 29,
                color: palette.text,
                fontSize: 10.7,
                lineHeight: 14,
                fontWeight: "700",
                letterSpacing: -0.12,
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
