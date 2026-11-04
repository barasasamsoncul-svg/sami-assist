
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  isDark: boolean;
};

export default function HomeSearch({
  value,
  onChangeText,
  isDark,
}: Props) {
  const palette = isDark
    ? {
        background: "#172337",
        text: "#F4F7FF",
        muted: "#AAB8CC",
      }
    : {
        background: "#F0F2F5",
        text: "#000535",
        muted: "#78869A",
      };

  return (
    <View
      style={{
        width: "100%",
        height: 48,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        gap: 10,
        borderRadius: 15,
        backgroundColor: palette.background,
      }}
    >
      <Ionicons
        name="search-outline"
        size={20}
        color={palette.muted}
      />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="What can we do for you today?"
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        autoCorrect={false}
        style={{
          flex: 1,
          height: "100%",
          paddingVertical: 0,
          color: palette.text,
          fontSize: 13,
          fontWeight: "500",
        }}
        accessibilityLabel="Search errand services"
      />

      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={8}
          style={{
            width: 28,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="close-circle"
            size={19}
            color={palette.muted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}
