import { StyleSheet } from "react-native";

export const colors = {
  navy: "#173B67",
  blue: "#2463B8",
  blueSoft: "#EAF1FC",
  ink: "#1E2F46",
  muted: "#69788D",
  paper: "#F5F7FB",
  white: "#FFFFFF",
  border: "#DCE5F2",
  amber: "#F0B64D",
  green: "#2463B8",
  red: "#B42318",
};

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20, paddingBottom: 36, gap: 16 },
  eyebrow: { color: colors.blue, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.navy, fontSize: 29, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 15 },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  error: { backgroundColor: "#FDECEC", color: colors.red, borderRadius: 12, padding: 12, lineHeight: 19 },
  pill: { backgroundColor: colors.blueSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 30, alignSelf: "flex-start" },
});
