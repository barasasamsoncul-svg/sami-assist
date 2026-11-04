
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
        background: "#142B40",
        artworkBackground: "#1E4056",
        heading: "#FFFFFF",
        subtitle: "#C5D5E5",
        accent: "#75C9AB",
        bagBackground: "#245447",
      }
    : {
        background: "#DDF1E4",
        artworkBackground: "#C9E7D3",
        heading: "#000535",
        subtitle: "#526B60",
        accent: "#2463B8",
        bagBackground: "#BFE5D1",
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title.replace("\n", " ")} ${subtitle}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: 124,
        borderRadius: 16,
        backgroundColor: palette.background,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {/* Promotional text */}
      <View
        style={{
          width: "59%",
          paddingLeft: 17,
          paddingVertical: 16,
          justifyContent: "center",
          gap: 8,
          zIndex: 2,
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
          {title}
        </Text>

        <Text
          style={{
            color: palette.subtitle,
            fontSize: 11,
            lineHeight: 16,
            fontWeight: "600",
          }}
        >
          {subtitle}
        </Text>
      </View>

      {/* Promotional artwork */}
      <View
        style={{
          width: "41%",
          height: "100%",
          minHeight: 124,
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
            {/* Temporary branded artwork until an advert image is supplied */}
            <View
              style={{
                position: "absolute",
                width: 104,
                height: 104,
                borderRadius: 52,
                backgroundColor: palette.artworkBackground,
                right: 8,
                top: 10,
              }}
            />

            <Ionicons
              name="person"
              size={83}
              color={isDark ? "#79AEFF" : "#2463B8"}
              style={{
                position: "absolute",
                bottom: 3,
                right: 27,
              }}
            />

            <View
              style={{
                position: "absolute",
                right: 9,
                bottom: 10,
                width: 39,
                height: 39,
                borderRadius: 13,
                backgroundColor: palette.bagBackground,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="bag-handle"
                size={23}
                color={palette.accent}
              />
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}
