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

const AVATAR_SIZE = 54;
const BELL_SIZE = 46;

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

  const initial = firstName?.trim()?.charAt(0)?.toUpperCase() || "S";
  const badgeLabel =
    unreadNotifications > 9 ? "9+" : String(unreadNotifications);

  return (
    <View style={{ width: "100%", gap: 12 }}>
      {/* Top row — wordmark, notifications, avatar */}
      <View
        style={{
          minHeight: AVATAR_SIZE + 2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Image
          source={require("../../assets/sami-welcome-wordmark-transparent.png")}
          resizeMode="contain"
          accessibilityLabel="SaMi - Consider it done"
          style={{ width: 118, height: 48 }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Notifications */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unreadNotifications > 0
                ? `Notifications, ${unreadNotifications} unread`
                : "Notifications"
            }
            onPress={onNotificationsPress}
            hitSlop={6}
            style={({ pressed }) => ({
              width: BELL_SIZE,
              height: BELL_SIZE,
              borderRadius: BELL_SIZE / 2,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={palette.heading}
            />

            {unreadNotifications > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 5,
                  right: 4,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: 9,
                  backgroundColor: "#E34D59",
                  borderWidth: 2,
                  borderColor: palette.background,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 10,
                    fontWeight: "800",
                    lineHeight: 12,
                  }}
                >
                  {badgeLabel}
                </Text>
              </View>
            ) : null}
          </Pressable>

          {/* Profile avatar */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={onProfilePress}
            hitSlop={4}
            style={({ pressed }) => ({
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: palette.border,
              backgroundColor: palette.avatar,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                resizeMode="cover"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                }}
              />
            ) : (
              <Text
                style={{
                  color: palette.blue,
                  fontSize: 22,
                  fontWeight: "900",
                }}
              >
                {initial}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Location row */}
      {onLocationPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Current location: ${locationLabel}`}
          onPress={onLocationPress}
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: 28,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            opacity: pressed ? 0.6 : 1,
          })}
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
              fontSize: 13,
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
            minHeight: 28,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
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
              fontSize: 13,
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