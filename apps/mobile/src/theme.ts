
import { useMemo } from "react";
import {
  StyleSheet,
  useColorScheme,
  type ViewStyle,
  type TextStyle,
} from "react-native";

export type SaMiMode = "light" | "dark";

export type SaMiColors = {
  navy: string;
  blue: string;
  blueSoft: string;
  ink: string;
  muted: string;
  paper: string;
  white: string;
  border: string;
  amber: string;
  green: string;
  red: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  input: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  dangerSoft: string;
  overlay: string;
  mapBackground: string;
};

export type SaMiCommonStyles = {
  screen: ViewStyle;
  content: ViewStyle;
  eyebrow: TextStyle;
  title: TextStyle;
  subtitle: TextStyle;
  card: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  primaryButton: ViewStyle;
  primaryButtonText: TextStyle;
  secondaryButton: ViewStyle;
  secondaryButtonText: TextStyle;
  error: TextStyle;
  pill: ViewStyle;
};

export type SaMiTheme = {
  mode: SaMiMode;
  colors: SaMiColors;
  common: SaMiCommonStyles;
};

const lightColors: SaMiColors = {
  navy: "#173B67",
  blue: "#2463B8",
  blueSoft: "#EAF1FC",
  ink: "#1E2F46",
  muted: "#69788D",
  paper: "#F5F7FB",
  white: "#FFFFFF",
  border: "#DCE5F2",
  amber: "#F0B64D",
  green: "#168B55",
  red: "#B42318",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  text: "#1E2F46",
  textMuted: "#69788D",
  input: "#FFFFFF",
  success: "#168B55",
  successSoft: "#E8F6EE",
  warning: "#A66A12",
  warningSoft: "#FFF5DF",
  dangerSoft: "#FDECEC",
  overlay: "rgba(15, 29, 48, 0.45)",
  mapBackground: "#EAF0F7",
};

const darkColors: SaMiColors = {
  navy: "#A8C9F4",
  blue: "#7FB0F2",
  blueSoft: "#1A2D46",
  ink: "#E5ECF5",
  muted: "#A1AFC2",
  paper: "#080F1D",
  white: "#111D2E",
  border: "#293A50",
  amber: "#F7C96B",
  green: "#58C98E",
  red: "#FF8989",
  surface: "#111D2E",
  surfaceElevated: "#17253A",
  text: "#EAF0F8",
  textMuted: "#A1AFC2",
  input: "#132238",
  success: "#58C98E",
  successSoft: "#15372D",
  warning: "#F4C36A",
  warningSoft: "#392D19",
  dangerSoft: "#3B2228",
  overlay: "rgba(0, 0, 0, 0.7)",
  mapBackground: "#101D2F",
};

function createCommonStyles(
  palette: SaMiColors,
  mode: SaMiMode,
): SaMiCommonStyles {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.paper,
    },
    content: {
      padding: 20,
      paddingBottom: 36,
      gap: 16,
    },
    eyebrow: {
      color: palette.blue,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    title: {
      color: palette.text,
      fontSize: 29,
      fontWeight: "800",
      letterSpacing: -0.7,
    },
    subtitle: {
      color: palette.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    card: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 20,
      padding: 16,
      gap: 10,
    },
    label: {
      color: palette.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
    },
    input: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 13,
      backgroundColor: palette.input,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: palette.text,
      fontSize: 15,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: palette.blue,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    primaryButtonText: {
      color: mode === "dark" ? "#081321" : "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: palette.blueSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: palette.border,
    },
    secondaryButtonText: {
      color: palette.navy,
      fontSize: 14,
      fontWeight: "800",
    },
    error: {
      backgroundColor: palette.dangerSoft,
      color: palette.red,
      borderRadius: 12,
      padding: 12,
      lineHeight: 19,
    },
    pill: {
      backgroundColor: palette.blueSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 30,
      alignSelf: "flex-start",
    },
  }) as SaMiCommonStyles;
}

/**
 * Theme-aware design system.
 * Automatically follows the device's light/dark appearance.
 */
export function useSaMiTheme(): SaMiTheme {
  const scheme = useColorScheme();

  return useMemo(() => {
    const mode: SaMiMode =
      scheme === "dark" ? "dark" : "light";

    const palette =
      mode === "dark" ? darkColors : lightColors;

    return {
      mode,
      colors: palette,
      common: createCommonStyles(palette, mode),
    };
  }, [scheme]);
}

/**
 * Legacy light-theme exports.
 * Existing screens can continue using these while being migrated.
 */
export const colors: SaMiColors = {
  ...lightColors,
};

export const common = createCommonStyles(
  lightColors,
  "light",
);
