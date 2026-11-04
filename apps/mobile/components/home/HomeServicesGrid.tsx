import { Image, Pressable, Text, View } from "react-native";

type Service = {
  id: string;
  category: string;
  title: string;
  keywords: string;
  imageCell: number;
};

type Props = {
  isDark: boolean;
  searchQuery: string;
  onSelect: (category: string) => void;
};

const CATEGORY_SPRITES = [
  require("../../assets/category-row-1.webp"),
  require("../../assets/category-row-2.webp"),
  require("../../assets/category-row-3.webp"),
  require("../../assets/category-row-4.webp"),
] as const;

const services: Service[] = [
  { id: "groceries", category: "groceries", title: "Groceries", keywords: "food supermarket market shopping", imageCell: 0 },
  { id: "food", category: "food_delivery", title: "Food & Delivery", keywords: "restaurant meals takeaway food", imageCell: 1 },
  { id: "pickup", category: "pickup_delivery", title: "Pick Up & Drop Off", keywords: "parcel package collection delivery", imageCell: 2 },
  { id: "bills", category: "bill_payments", title: "Bills & Payments", keywords: "pay bills utilities payments", imageCell: 3 },
  { id: "laundry", category: "laundry_cleaning", title: "Laundry & Dry Cleaning", keywords: "clothes washing ironing cleaning", imageCell: 4 },
  { id: "documents", category: "documents_admin", title: "Documents & Government", keywords: "forms offices paperwork administration", imageCell: 5 },
  { id: "clothing", category: "clothing_retail", title: "Clothing & Returns", keywords: "clothes fashion retail exchange returns", imageCell: 6 },
  { id: "gifts", category: "shopping_gifts", title: "Shopping & Gifts", keywords: "purchases presents gifts retail", imageCell: 7 },
  { id: "home", category: "home_services", title: "Home Services", keywords: "house household home tasks", imageCell: 8 },
  { id: "pharmacy", category: "pharmacy_health", title: "Pharmacy & Health", keywords: "medicine pharmacy healthcare collection", imageCell: 9 },
  { id: "petcare", category: "pet_care", title: "Pet Care", keywords: "pets animals pet supplies", imageCell: 10 },
  { id: "personal", category: "personal_errand", title: "Personal Assistance", keywords: "personal help assistance tasks", imageCell: 11 },
  { id: "queues", category: "queue_appointments", title: "Queues & Appointments", keywords: "waiting bookings appointments queue", imageCell: 12 },
  { id: "business", category: "business_support", title: "Business Errands", keywords: "business office company work support", imageCell: 13 },
  { id: "shopping", category: "shopping", title: "Shopping & Essentials", keywords: "shopping essentials store purchases", imageCell: 14 },
  { id: "other", category: "other", title: "Custom Errand", keywords: "other different special request custom", imageCell: 15 },
];

export default function HomeServicesGrid({
  isDark,
  searchQuery,
  onSelect,
}: Props) {
  const palette = isDark
    ? {
        text: "#EEF4FC",
        muted: "#A8B8CD",
        border: "#223C58",
      }
    : {
        text: "#263A54",
        muted: "#78869A",
        border: "#E2E9F1",
      };

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
        {filteredServices.map((service) => {
          const column = service.imageCell % 4;
          const spriteRow = Math.floor(service.imageCell / 4);

          return (
            <Pressable
              key={service.id}
              accessibilityRole="button"
              accessibilityLabel={service.title}
              onPress={() => onSelect(service.category)}
              style={({ pressed }) => ({
                width: "23.5%",
                minHeight: 84,
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 7,
                opacity: pressed ? 0.86 : 1,
                transform: [{ scale: pressed ? 0.975 : 1 }],
              })}
            >
              <View
                style={{
                  width: "100%",
                  aspectRatio: 1.78,
                  borderRadius: 13,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: "#18334F",
                }}
              >
                <Image
                  source={CATEGORY_SPRITES[spriteRow]}
                  accessible={false}
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    width: "400%",
                    height: "100%",
                    left: `${-column * 100}%`,
                    top: 0,
                  }}
                />
              </View>

              <Text
                numberOfLines={2}
                style={{
                  width: "100%",
                  minHeight: 29,
                  color: palette.text,
                  fontSize: 10.6,
                  lineHeight: 13.8,
                  fontWeight: "700",
                  letterSpacing: -0.1,
                  textAlign: "center",
                }}
              >
                {service.title}
              </Text>
            </Pressable>
          );
        })}
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
