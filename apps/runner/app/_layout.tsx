
import { useCallback, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

const BRAND_NAVY = "#000535";

// Keep the native splash visible until the React Native root is ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hasHiddenSplash = useRef(false);

  const handleRootLayout = useCallback(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    hasHiddenSplash.current = true;
    SplashScreen.hide();
  }, []);

  return (
    <View style={styles.root} onLayout={handleRootLayout}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={BRAND_NAVY}
        translucent={false}
      />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: BRAND_NAVY,
          },
          animation: "none",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_NAVY,
  },
});
