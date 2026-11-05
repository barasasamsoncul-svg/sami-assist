import { useState } from "react";
import {
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  isDark: boolean;
};

const FIELD_HEIGHT = 54;
const FIELD_RADIUS = 18;

export default function HomeSearch({
  value,
  onChangeText,
  isDark,
}: Props) {
  const [focused, setFocused] = useState(false);

  const palette = isDark
    ? {
        background: "#14243A",
        border: "#263B55",
        borderActive: "#79AEFF",
        text: "#F4F7FF",
        muted: "#AAB8CC",
        accent: "#79AEFF",
        glow: "rgba(121,174,255,0.22)",
      }
    : {
        background: "#FFFFFF",
        border: "#E5EBF3",
        borderActive: "#2463B8",
        text: "#000535",
        muted: "#78869A",
        accent: "#2463B8",
        glow: "rgba(36,99,184,0.14)",
      };

  return (
    <View
      style={{
        width: "100%",
        height: FIELD_HEIGHT,
        borderWidth: 1,
        borderColor: focused ? palette.borderActive : palette.border,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 6,
        gap: 10,
        borderRadius: FIELD_RADIUS,
        backgroundColor: palette.background,
        ...(focused
          ? Platform.select({
              ios: {
                shadowColor: palette.accent,
                shadowOpacity: 0.22,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
              },
              android: { elevation: 2 },
              default: {},
            })
          : {}),
      }}
    >
      <Ionicons
        name={value.length > 0 ? "search" : "search-outline"}
        size={19}
        color={focused ? palette.accent : palette.muted}
      />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="What can we do for you today?"
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={palette.accent}
        cursorColor={palette.accent}
        style={{
          flex: 1,
          height: "100%",
          paddingVertical: 0,
          color: palette.text,
          fontSize: 15,
          fontWeight: "500",
          letterSpacing: -0.1,
        }}
        accessibilityLabel="Search errand services"
      />

      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: isDark
                ? "rgba(170,184,204,0.14)"
                : "rgba(120,134,154,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="close"
              size={13}
              color={palette.muted}
            />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}