import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  isDark: boolean;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
};

export default function HomePromoHero({
  isDark,
  title = "Big or small,\\nwe run your errands.",
  subtitle = "Save time. Live more.",
  onPress,
}: Props) {
  const colors = isDark
    ? {
        background: "#142B43",
        heading: "#F8FBFF",
        subtitle: "#C6D5E6",
        halo: "#1D405D",
        hair: "#172A46",
        skin: "#D99C79",
        shirt: "#78A9EF",
        shirtShade: "#568DD9",
        bag: "#205849",
        bagIcon: "#8AD2B9",
        sparkle: "#E9BD75",
      }
    : {
        background: "#E8F1FF",
        heading: "#102A4A",
        subtitle: "#657991",
        halo: "#D5E6FF",
        hair: "#172C4D",
        skin: "#D99C79",
        shirt: "#6399E8",
        shirtShade: "#477FCF",
        bag: "#D2EFE4",
        bagIcon: "#278A70",
        sparkle: "#D7A34A",
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title.replace("\\n", " ")} ${subtitle}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width: "100%",
        height: 158,
        borderRadius: 22,
        backgroundColor: colors.background,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <View
        style={{
          width: "58%",
          paddingLeft: 19,
          paddingRight: 4,
          justifyContent: "center",
          gap: 10,
          zIndex: 2,
        }}
      >
        <Text
          style={{
            color: colors.heading,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: "900",
            letterSpacing: -0.55,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.subtitle,
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "600",
            letterSpacing: 0.05,
          }}
        >
          {subtitle}
        </Text>
      </View>

      {/* Original SaMi character artwork, built from native shapes so it
          stays crisp on every Android density and needs no remote image. */}
      <View
        accessible={false}
        style={{
          width: "42%",
          height: "100%",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 132,
            height: 132,
            borderRadius: 66,
            right: 6,
            top: 12,
            backgroundColor: colors.halo,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 9,
            height: 9,
            borderRadius: 5,
            left: 18,
            top: 29,
            backgroundColor: colors.sparkle,
          }}
        />
        <Ionicons
          name="sparkles"
          size={19}
          color={colors.sparkle}
          style={{ position: "absolute", right: 17, top: 19 }}
        />

        {/* Hair silhouette */}
        <View
          style={{
            position: "absolute",
            width: 82,
            height: 104,
            right: 33,
            bottom: 9,
            borderTopLeftRadius: 42,
            borderTopRightRadius: 42,
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 28,
            backgroundColor: colors.hair,
            transform: [{ rotate: "5deg" }],
          }}
        />
        {/* Face and neck */}
        <View
          style={{
            position: "absolute",
            width: 43,
            height: 49,
            right: 52,
            top: 39,
            borderRadius: 23,
            backgroundColor: colors.skin,
            zIndex: 2,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 17,
            height: 20,
            right: 65,
            top: 78,
            backgroundColor: colors.skin,
            zIndex: 1,
          }}
        />
        {/* Hair fringe */}
        <View
          style={{
            position: "absolute",
            width: 48,
            height: 22,
            right: 49,
            top: 35,
            borderTopLeftRadius: 25,
            borderTopRightRadius: 23,
            borderBottomRightRadius: 17,
            backgroundColor: colors.hair,
            transform: [{ rotate: "-8deg" }],
            zIndex: 3,
          }}
        />
        {/* Shoulder and shirt */}
        <View
          style={{
            position: "absolute",
            width: 105,
            height: 57,
            right: 19,
            bottom: -7,
            borderTopLeftRadius: 55,
            borderTopRightRadius: 55,
            backgroundColor: colors.shirt,
            zIndex: 2,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 32,
            height: 44,
            right: 96,
            bottom: 1,
            borderRadius: 20,
            backgroundColor: colors.shirtShade,
            transform: [{ rotate: "22deg" }],
            zIndex: 3,
          }}
        />
        {/* Shopping tote */}
        <View
          style={{
            position: "absolute",
            width: 48,
            height: 44,
            right: 8,
            bottom: 10,
            borderRadius: 15,
            backgroundColor: colors.bag,
            borderWidth: 1,
            borderColor: isDark ? "#356C61" : "#B7DECF",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
          }}
        >
          <Ionicons name="bag-handle" size={25} color={colors.bagIcon} />
        </View>
      </View>
    </Pressable>
  );
}
