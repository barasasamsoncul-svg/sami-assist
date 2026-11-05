import { Image, Pressable, Text, View } from "react-native";

type Service = {
  id: string;
  category: string;
  title: string;
  keywords: string;
  imageCell: number;
  width: number;
  aspectRatio: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
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
  { id: "groceries", category: "groceries", title: "Groceries", keywords: "food supermarket market shopping", imageCell: 0, width: 42, aspectRatio: 1.38, rotation: -1.5, offsetX: -1, offsetY: 2 },
  { id: "food", category: "food_delivery", title: "Food & Delivery", keywords: "restaurant meals takeaway food", imageCell: 1, width: 35, aspectRatio: 1.28, rotation: 1.8, offsetX: 2, offsetY: 17 },
  { id: "pickup", category: "pickup_delivery", title: "Pick Up & Drop Off", keywords: "parcel package collection delivery", imageCell: 2, width: 44, aspectRatio: 1.48, rotation: -1.2, offsetX: 0, offsetY: 0 },
  { id: "bills", category: "bill_payments", title: "Bills & Payments", keywords: "pay bills utilities payments", imageCell: 3, width: 37, aspectRatio: 1.3, rotation: 1.4, offsetX: 1, offsetY: 13 },
  { id: "laundry", category: "laundry_cleaning", title: "Laundry & Dry Cleaning", keywords: "clothes washing ironing cleaning", imageCell: 4, width: 38, aspectRatio: 1.32, rotation: 1.5, offsetX: -2, offsetY: 4 },
  { id: "documents", category: "documents_admin", title: "Documents & Government", keywords: "forms offices paperwork administration", imageCell: 5, width: 44, aspectRatio: 1.42, rotation: -1.8, offsetX: 1, offsetY: 16 },
  { id: "clothing", category: "clothing_retail", title: "Clothing & Returns", keywords: "clothes fashion retail exchange returns", imageCell: 6, width: 35, aspectRatio: 1.27, rotation: 1.2, offsetX: 2, offsetY: 0 },
  { id: "gifts", category: "shopping_gifts", title: "Shopping & Gifts", keywords: "purchases presents gifts retail", imageCell: 7, width: 42, aspectRatio: 1.4, rotation: -1.4, offsetX: -1, offsetY: 12 },
  { id: "home", category: "home_services", title: "Home Services", keywords: "house household home tasks", imageCell: 8, width: 40, aspectRatio: 1.36, rotation: -1.6, offsetX: 1, offsetY: 2 },
  { id: "pharmacy", category: "pharmacy_health", title: "Pharmacy & Health", keywords: "medicine pharmacy healthcare collection", imageCell: 9, width: 36, aspectRatio: 1.3, rotation: 1.8, offsetX: -1, offsetY: 15 },
  { id: "petcare", category: "pet_care", title: "Pet Care", keywords: "pets animals pet supplies", imageCell: 10, width: 43, aspectRatio: 1.46, rotation: -1.1, offsetX: 2, offsetY: 0 },
  { id: "personal", category: "personal_errand", title: "Personal Assistance", keywords: "personal help assistance tasks", imageCell: 11, width: 35, aspectRatio: 1.28, rotation: 1.5, offsetX: -2, offsetY: 12 },
  { id: "queues", category: "queue_appointments", title: "Queues & Appointments", keywords: "waiting bookings appointments queue", imageCell: 12, width: 39, aspectRatio: 1.35, rotation: 1.3, offsetX: 0, offsetY: 4 },
  { id: "business", category: "business_support", title: "Business Errands", keywords: "business office company work support", imageCell: 13, width: 44, aspectRatio: 1.42, rotation: -1.7, offsetX: 1, offsetY: 16 },
  { id: "shopping", category: "shopping", title: "Shopping & Essentials", keywords: "shopping essentials store purchases", imageCell: 14, width: 36, aspectRatio: 1.29, rotation: 1.6, offsetX: -2, offsetY: 1 },
  { id: "other", category: "other", title: "Custom Errand", keywords: "other different special request custom", imageCell: 15, width: 42, aspectRatio: 1.4, rotation: -1.3, offsetX: 2, offsetY: 14 },
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
      }
    : {
        text: "#263A54",
        muted: "#78869A",
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
          alignItems: "flex-start",
          justifyContent: "space-around",
          columnGap: 0,
          rowGap: 9,
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
                width: `${service.width}%`,
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 6,
                marginTop: service.offsetY,
                marginLeft: `${service.offsetX}%`,
                marginBottom: 9,
                opacity: pressed ? 0.86 : 1,
                transform: [
                  { rotate: `${service.rotation}deg` },
                  { scale: pressed ? 0.975 : 1 },
                ],
              })}
            >
              <View
                style={{
                  width: "100%",
                  aspectRatio: service.aspectRatio,
                  borderRadius: 18,
                  overflow: "hidden",
                  backgroundColor: "transparent",
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
                  fontSize: 11.2,
                  lineHeight: 14.2,
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
