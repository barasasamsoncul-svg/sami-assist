
import { Stack } from "expo-router";
import { StatusBar, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";

void SplashScreen.preventAutoHideAsync().catch(
  () => undefined
);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: "#000535" }}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#000535"
          translucent={false}
          hidden={false}
        />

        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "#F4F6FA"
            },
            animation: "fade"
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}
