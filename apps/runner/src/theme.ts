import { useColorScheme } from "react-native";

const light = {
  navy: "#000535",
  blue: "#2769C7",
  blueSoft: "#EAF1FC",
  paper: "#F4F6FA",
  surface: "#FFFFFF",
  border: "#DEE5EF",
  text: "#17263C",
  textMuted: "#718096",
  muted: "#94A3B8",
  success: "#168B55",
  successSoft: "#E7F5ED",
  warning: "#A66A12",
  warningSoft: "#FFF4DC",
  red: "#B42318",
  dangerSoft: "#FDECEC",
  amber: "#F0B64D",
};

const dark = {
  navy: "#000535",
  blue: "#80B0F3",
  blueSoft: "#1B2D45",
  paper: "#080F1D",
  surface: "#111D2E",
  border: "#293A50",
  text: "#EAF0F8",
  textMuted: "#A1AFC2",
  muted: "#788BA4",
  success: "#58C98E",
  successSoft: "#15372D",
  warning: "#F4C36A",
  warningSoft: "#392D19",
  red: "#FF8989",
  dangerSoft: "#3B2228",
  amber: "#F7C96B",
};

export function useRunnerTheme() {
  const scheme = useColorScheme();
  return {
    mode: scheme === "dark" ? "dark" : "light",
    colors: scheme === "dark" ? dark : light,
  } as const;
}