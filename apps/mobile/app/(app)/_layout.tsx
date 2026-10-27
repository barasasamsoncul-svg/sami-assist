import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: "slide_from_right" }} />;
}
