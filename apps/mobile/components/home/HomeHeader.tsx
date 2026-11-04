
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  firstName: string;
  avatarUri?: string | null;
  locationLabel: string;
  unreadNotifications: number;
  isDark: boolean;
  onNotificationsPress: () => void;
  onProfilePress: () => void;
  onLocationPress?: () => void;
};

export default function HomeHeader({
  firstName,
  avatarUri,
  locationLabel,
  unreadNotifications,
  isDark,
  onNotificationsPress,
  onProfilePress,
  onLocationPress,
}: Props) {
  const palette = isDark
    ? {
        heading: "#F4F7FF",
        muted: "#AAB8CC",
        border: "#293951",
        avatar: "#223D5E",
        blue: "#79AEFF",
        background: "#080F1D",
      }
    : {
        heading: "#000535",
        muted: "#78869A",
        border: "#E5EAF1",
        avatar: "#EAF1FC",
        blue: "#2463B8",
        background: "#F7F8FA",
      };

  return (
    <View style={{ width: "100%", gap: 11 }}>
      {/* SaMi watermark, notifications and profile */}
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Image
          source={require("../../assets/sami-welcome-wordmark-transparent.png")}
          resizeMode="contain"
          accessibilityLabel="SaMi - Consider it done"
          style={{
            width: 112,
            height: 48,
          }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 15,
          }}
        >
          {/* Notification icon */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={onNotificationsPress}
            style={{
              width: 36,
              height: 42,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={25}
              color={palette.heading}
            />

            {unreadNotifications > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 2,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: "#E34D59",
                  borderWidth: 1.5,
                  borderColor: palette.background,
                }}
              />
            ) : null}
          </Pressable>

          {/* User profile photo */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={onProfilePress}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              overflow: "hidden",
              borderWidth: 1.5,
              borderColor: palette.border,
              backgroundColor: palette.avatar,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                resizeMode="cover"
                style={{
                  width: 42,
                  height: 42,
                }}
              />
            ) : (
              <Text
                style={{
                  color: palette.blue,
                  fontSize: 17,
                  fontWeight: "900",
                }}
              >
                {firstName.charAt(0).toUpperCase()}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* User's current location */}
      {onLocationPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Current location: ${locationLabel}`}
          onPress={onLocationPress}
          style={{
            minHeight: 26,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="location-sharp"
            size={15}
            color={palette.blue}
          />

          <Text
            numberOfLines={1}
            style={{
              color: palette.heading,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {locationLabel}
          </Text>

          <Ionicons
            name="chevron-down"
            size={13}
            color={palette.muted}
          />
        </Pressable>
      ) : (
        <View
          style={{
            minHeight: 26,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="location-sharp"
            size={15}
            color={palette.blue}
          />

          <Text
            numberOfLines={1}
            style={{
              color: palette.heading,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {locationLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
