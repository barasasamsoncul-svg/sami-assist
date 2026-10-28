import { Text, View } from "react-native";
import { colors } from "@/theme";

/**
 * SaMi's compact, code-drawn brand mark.
 * Built entirely from native vector-like shapes and text; no bitmap or photo asset.
 * Concept: task checklist + destination pin.
 */
export default function SaMiLogoMark({ size = 42 }: { size?: number }) {
  const radius = size * 0.095;
  const sheetWidth = size * 0.50;
  const sheetHeight = size * 0.68;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.31,
        backgroundColor: colors.navy,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Offset blue sheet adds depth without using an image or gradient. */}
      <View
        style={{
          position: "absolute",
          left: size * 0.39,
          top: size * 0.15,
          width: size * 0.43,
          height: size * 0.59,
          borderRadius: radius,
          backgroundColor: colors.blue,
          transform: [{ rotate: "8deg" }],
        }}
      />

      {/* Main task card. */}
      <View
        style={{
          position: "absolute",
          left: size * 0.16,
          top: size * 0.14,
          width: sheetWidth,
          height: sheetHeight,
          borderRadius: radius,
          backgroundColor: colors.white,
          borderWidth: Math.max(0.7, size * 0.018),
          borderColor: "#DCE6FA",
          overflow: "hidden",
          paddingTop: size * 0.105,
          paddingHorizontal: size * 0.075,
          gap: size * 0.055,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: size * 0.11,
            backgroundColor: colors.blue,
          }}
        />
        {[0, 1].map((row) => (
          <View
            key={row}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: size * 0.035,
            }}
          >
            <Text
              style={{
                fontSize: size * 0.145,
                lineHeight: size * 0.16,
                color: colors.blue,
                fontWeight: "900",
              }}
            >
              ✓
            </Text>
            <View
              style={{
                flex: 1,
                height: Math.max(1.2, size * 0.043),
                borderRadius: size * 0.03,
                backgroundColor: row === 0 ? "#9EACC5" : "#C4CDDC",
              }}
            />
          </View>
        ))}
      </View>

      {/* Teal destination pin: circle, white centre and a small pointed base. */}
      <View
        style={{
          position: "absolute",
          right: size * 0.105,
          bottom: size * 0.085,
          width: size * 0.31,
          height: size * 0.31,
          borderRadius: size * 0.16,
          backgroundColor: "#25C9AC",
          borderWidth: Math.max(1, size * 0.035),
          borderColor: colors.navy,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <View
          style={{
            width: size * 0.105,
            height: size * 0.105,
            borderRadius: size * 0.06,
            backgroundColor: colors.white,
          }}
        />
      </View>
      <View
        style={{
          position: "absolute",
          right: size * 0.185,
          bottom: size * 0.065,
          width: size * 0.11,
          height: size * 0.11,
          borderRadius: size * 0.02,
          backgroundColor: "#25C9AC",
          transform: [{ rotate: "45deg" }],
          zIndex: 1,
        }}
      />
    </View>
  );
}
