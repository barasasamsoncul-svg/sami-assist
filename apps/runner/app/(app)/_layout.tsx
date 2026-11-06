import { Stack } from "expo-router";

export default function RunnerAppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    />
  );
}