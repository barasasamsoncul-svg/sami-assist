import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRunnerTheme } from "@/theme";
import { styles } from "../styles";

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  busy = false,
  color,
  backgroundColor,
  borderColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  color: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor,
          borderColor,
          opacity: disabled || busy ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={20} color={color} />
      )}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  backgroundColor,
  textColor = "#FFFFFF",
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  backgroundColor: string;
  textColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor,
          opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : icon ? (
        <Ionicons name={icon} size={19} color={textColor} />
      ) : null}

      <Text style={[styles.primaryButtonText, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  colors,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  colors: ReturnType<typeof useRunnerTheme>["colors"];
}) {
  return (
    <View style={styles.sectionHeading}>
      {eyebrow ? (
        <Text
          style={[
            styles.eyebrow,
            { color: colors.textMuted },
          ]}
        >
          {eyebrow.toUpperCase()}
        </Text>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {title}
      </Text>

      {subtitle ? (
        <Text
          style={[
            styles.sectionSubtitle,
            { color: colors.textMuted },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function RoutePoint({
  icon,
  label,
  value,
  colors,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useRunnerTheme>["colors"];
  last?: boolean;
}) {
  return (
    <View style={styles.routePoint}>
      <View style={styles.routePointIconColumn}>
        <View
          style={[
            styles.routePointIcon,
            { backgroundColor: colors.blueSoft },
          ]}
        >
          <Ionicons name={icon} size={15} color={colors.blue} />
        </View>

        {!last ? (
          <View
            style={[
              styles.routeConnector,
              { backgroundColor: colors.border },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.routePointCopy}>
        <Text
          style={[
            styles.routePointLabel,
            { color: colors.textMuted },
          ]}
        >
          {label}
        </Text>

        <Text
          style={[
            styles.routePointValue,
            { color: colors.text },
          ]}
          numberOfLines={2}
        >
          {value || "Address not provided"}
        </Text>
      </View>
    </View>
  );
}

