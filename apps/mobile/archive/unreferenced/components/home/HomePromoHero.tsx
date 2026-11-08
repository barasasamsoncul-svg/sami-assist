import {
  Image,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

type Props = {
  isDark: boolean;
  title?: string;
  subtitle?: string;
  imageSource?: ImageSourcePropType;
  onPress?: () => void;
};

const HERO_RADIUS = 22;
const HERO_MIN_HEIGHT = 180;
const HERO_PADDING = 18;
const TICKET_WIDTH = 120;
const TICKET_PEEK = 5;

export default function HomePromoHero({
  isDark,
  title = "Big or small,\nwe run your errands.",
  subtitle = "Save time. Live more.",
  imageSource,
  onPress,
}: Props) {
  const palette = isDark
    ? {
        background: "#0F2236",
        tint: "#173352",
        ring: "rgba(121,174,255,0.16)",
        heading: "#F4F7FF",
        subtitle: "#A8BED6",
        accent: "#79AEFF",
        eyebrow: "#8FB4E3",
        ticket: "#1A3350",
        ticketBorder: "#284A6E",
        ticketHeading: "#E6EFFA",
        ticketMuted: "#96ABC4",
        track: "#355A80",
        live: "#35C08A",
      }
    : {
        background: "#EAF2FF",
        tint: "#DCE8FA",
        ring: "rgba(36,99,184,0.10)",
        heading: "#0A2244",
        subtitle: "#5A6E88",
        accent: "#2463B8",
        eyebrow: "#3F6296",
        ticket: "#FFFFFF",
        ticketBorder: "#D6E3F3",
        ticketHeading: "#0A2244",
        ticketMuted: "#6A7E97",
        track: "#C3D4E8",
        live: "#1F9D68",
      };

  const titleLines = title.split("\n").filter((line) => line.length > 0);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title.replace(/\n/g, " ")}. ${subtitle}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: HERO_MIN_HEIGHT,
        borderRadius: HERO_RADIUS,
        backgroundColor: palette.background,
        overflow: "hidden",
        justifyContent: "center",
        transform: [{ scale: pressed ? 0.988 : 1 }],
        opacity: pressed ? 0.97 : 1,
      })}
    >
      {/* Layered tints — clipped by hero bounds */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: palette.ring,
          top: -90,
          right: -60,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: palette.tint,
          bottom: -50,
          left: -30,
          opacity: 0.7,
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: HERO_PADDING,
        }}
      >
        {/* Left: copy */}
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          {/* Eyebrow — the brand promise, tracked out */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              alignSelf: "flex-start",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: palette.accent,
              }}
            />
            <Text
              style={{
                color: palette.eyebrow,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 1.4,
              }}
            >
              CONSIDER IT DONE
            </Text>
          </View>

          {/* Title — second line in accent for editorial weight */}
          <View style={{ gap: 2 }}>
            {titleLines.map((line, index) => (
              <Text
                key={`${index}-${line}`}
                style={{
                  color:
                    index === 0 || titleLines.length === 1
                      ? palette.heading
                      : palette.accent,
                  fontSize: 21,
                  lineHeight: 26,
                  fontWeight: "800",
                  letterSpacing: -0.5,
                }}
              >
                {line}
              </Text>
            ))}
          </View>

          {/* Subtitle */}
          <Text
            style={{
              color: palette.subtitle,
              fontSize: 12.5,
              lineHeight: 17,
              fontWeight: "600",
            }}
          >
            {subtitle}
          </Text>
        </View>

        {/* Right: artwork */}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: TICKET_WIDTH + TICKET_PEEK + 3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {imageSource ? (
            <Image
              source={imageSource}
              resizeMode="contain"
              style={{ width: 128, height: 128 }}
            />
          ) : (
            <LiveTicket
              isDark={isDark}
              ticket={palette.ticket}
              border={palette.ticketBorder}
              heading={palette.ticketHeading}
              muted={palette.ticketMuted}
              accent={palette.accent}
              track={palette.track}
              live={palette.live}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function LiveTicket({
  isDark,
  ticket,
  border,
  heading,
  muted,
  accent,
  track,
  live,
}: {
  isDark: boolean;
  ticket: string;
  border: string;
  heading: string;
  muted: string;
  accent: string;
  track: string;
  live: string;
}) {
  return (
    <View
      style={{
        paddingRight: TICKET_PEEK,
        paddingBottom: TICKET_PEEK,
      }}
    >
      {/* Stacked backing card — gives the ticket depth */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: TICKET_PEEK,
          left: TICKET_PEEK,
          right: 0,
          bottom: 0,
          borderRadius: 14,
          backgroundColor: ticket,
          opacity: 0.5,
          borderWidth: 1,
          borderColor: border,
        }}
      />

      {/* Front ticket */}
      <View
        style={{
          width: TICKET_WIDTH,
          borderRadius: 14,
          backgroundColor: ticket,
          borderWidth: 1,
          borderColor: border,
          padding: 10,
          gap: 9,
          shadowColor: "#0A2244",
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }}
      >
        {/* Status row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: live,
                opacity: 0.25,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: live,
                }}
              />
            </View>
            <Text
              style={{
                color: heading,
                fontSize: 10.5,
                fontWeight: "700",
              }}
            >
              On the way
            </Text>
          </View>

          <Text
            style={{
              color: muted,
              fontSize: 9.5,
              fontWeight: "600",
            }}
          >
            12 min
          </Text>
        </View>

        {/* Route: pickup → dotted → drop-off */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: accent,
            }}
          />

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 2,
            }}
          >
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: track,
                }}
              />
            ))}
          </View>

          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: accent,
              backgroundColor: accent,
            }}
          />
        </View>

        {/* Waypoint labels */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: -3,
          }}
        >
          <Text
            style={{
              color: muted,
              fontSize: 9.5,
              fontWeight: "600",
            }}
          >
            Market
          </Text>
          <Text
            style={{
              color: muted,
              fontSize: 9.5,
              fontWeight: "600",
            }}
          >
            Home
          </Text>
        </View>
      </View>
    </View>
  );
}