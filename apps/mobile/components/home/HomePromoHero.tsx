import {
  Image,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

type Props = {
  isDark: boolean;
  title?: string;
  subtitle?: string;
  imageSource?: ImageSourcePropType;
  onPress?: () => void;
};

export default function HomePromoHero({
  isDark,
  title = "Big or small,\nwe run your errands.",
  subtitle = "Save time. Live more.",
  imageSource,
  onPress,
}: Props) {
  const palette = isDark
    ? {
        background: "#142B43",
        artworkBackground: "#1B3D59",
        heading: "#FFFFFF",
        subtitle: "#C6D5E6",
        accent: "#7AD0B6",
        bagBackground: "#205849",
        sparkle: "#E9BD75",
      }
    : {
        background: "#EAF2FF",
        artworkBackground: "#D7E7FF",
        heading: "#102A4A",
        subtitle: "#5C6F87",
        accent: "#2872C8",
        bagBackground: "#D5F0E5",
        sparkle: "#D9A64C",
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title.replace("\n", " ")} ${subtitle}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: 138,
        borderRadius: 19,
        backgroundColor: palette.background,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          width: "58%",
          paddingLeft: 18,
          paddingVertical: 18,
          justifyContent: "center",
          gap: 9,
          zIndex: 2,
        }}
      >
        <Text
          style={{
            color: palette.heading,
            fontSize: 18,
            lineHeight: 23,
            fontWeight: "900",
            letterSpacing: -0.45,
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            color: palette.subtitle,
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "600",
          }}
        >
          {subtitle}
        </Text>
      </View>

      <View
        style={{
          width: "42%",
          height: "100%",
          minHeight: 138,
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            resizeMode="cover"
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              right: 0,
              bottom: 0,
            }}
          />
        ) : (
          <>
            <View
              style={{
                position: "absolute",
                width: 116,
                height: 116,
                borderRadius: 58,
                backgroundColor: palette.artworkBackground,
                right: 7,
                top: 11,
              }}
            />

            <View
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: palette.sparkle,
                top: 23,
                left: 17,
              }}
            />

            <Ionicons
              name="sparkles"
              size={17}
              color={palette.sparkle}
              style={{
                position: "absolute",
                top: 17,
                right: 17,
              }}
            />

            <Ionicons
              name="person"
              size={88}
              color={isDark ? "#82B2F6" : "#6D9FE8"}
              style={{
                position: "absolute",
                bottom: 1,
                right: 29,
              }}
            />

            <View
              style={{
                position: "absolute",
                right: 9,
                bottom: 10,
                width: 43,
                height: 43,
                borderRadius: 15,
                backgroundColor: palette.bagBackground,
                borderWidth: 1,
                borderColor: isDark ? "#356C61" : "#B8DECE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="bag-handle"
                size={24}
                color={palette.accent}
              />
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}
