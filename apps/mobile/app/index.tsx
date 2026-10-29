import { useEffect } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { dispatchGet } from "@/api";

type BootstrapStatus = {
  adminExists: boolean;
  tokenConfigured: boolean;
  setupAvailable: boolean;
};

const blue = "#2463B8";
const navy = "#173B67";
const paper = "#F8FAFD";

function ErrandsIllustration({ width }: { width: number }) {
  const compact = width < 340;
  return (
    <View
      accessibilityLabel="SaMi errands illustration: a customer making a request, a home location, and an errand courier"
      style={{
        width,
        maxWidth: 390,
        aspectRatio: 1.22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: "76%",
          aspectRatio: 1,
          borderRadius: 999,
          backgroundColor: "#EAF1FC",
          top: "8%",
        }}
      />
      <View
        style={{
          position: "absolute",
          width: "59%",
          aspectRatio: 1,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "#D7E5F9",
          top: "17%",
        }}
      />

      {/* The customer: dimensional layers, phone, face and jacket */}
      <View
        style={{
          position: "absolute",
          left: "8%",
          bottom: "9%",
          width: "34%",
          height: "69%",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            position: "absolute",
            bottom: 0,
            width: "70%",
            height: 9,
            borderRadius: 100,
            backgroundColor: "#D5E1F3",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 7,
            left: "25%",
            width: "24%",
            height: "28%",
            borderRadius: 13,
            backgroundColor: "#243B59",
            transform: [{ rotate: "3deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 7,
            right: "22%",
            width: "24%",
            height: "28%",
            borderRadius: 13,
            backgroundColor: "#304B6D",
            transform: [{ rotate: "-5deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: "18%",
            width: "31%",
            height: 9,
            borderRadius: 8,
            backgroundColor: "#FFFFFF",
            transform: [{ rotate: "-3deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            right: "14%",
            width: "31%",
            height: 9,
            borderRadius: 8,
            backgroundColor: "#FFFFFF",
            transform: [{ rotate: "3deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "5%",
            width: "48%",
            aspectRatio: 0.88,
            borderRadius: 24,
            backgroundColor: "#D99A72",
            borderWidth: 2,
            borderColor: "#C88560",
            elevation: 4,
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "1%",
            width: "48%",
            height: "17%",
            borderTopLeftRadius: 25,
            borderTopRightRadius: 25,
            borderBottomRightRadius: 9,
            borderBottomLeftRadius: 5,
            backgroundColor: "#26364C",
            transform: [{ rotate: "-7deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "23%",
            width: "70%",
            height: "48%",
            borderRadius: 27,
            backgroundColor: "#2463B8",
            borderTopWidth: 4,
            borderLeftWidth: 3,
            borderColor: "#4B88D7",
            elevation: 7,
            shadowColor: "#173B67",
            shadowOpacity: 0.15,
            shadowRadius: 7,
            shadowOffset: { width: 3, height: 5 },
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "29%",
            right: "2%",
            width: "22%",
            height: "30%",
            borderRadius: 12,
            backgroundColor: "#D99A72",
            transform: [{ rotate: "-28deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "26%",
            right: "-2%",
            width: compact ? 21 : 24,
            height: compact ? 35 : 40,
            borderRadius: 5,
            backgroundColor: "#17253B",
            borderWidth: 2,
            borderColor: "#FFFFFF",
            transform: [{ rotate: "-13deg" }],
            elevation: 4,
          }}
        >
          <View
            style={{
              flex: 1,
              margin: 3,
              borderRadius: 2,
              backgroundColor: "#9FC7FC",
            }}
          />
        </View>
        <View
          style={{
            position: "absolute",
            top: "29%",
            left: "9%",
            width: "19%",
            height: "27%",
            borderRadius: 12,
            backgroundColor: "#1D559F",
            transform: [{ rotate: "22deg" }],
          }}
        />
      </View>

      {/* Home and a clear location pin */}
      <View
        style={{
          position: "absolute",
          right: "9%",
          bottom: "13%",
          width: "28%",
          aspectRatio: 1,
          borderRadius: 26,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "#DCE7F7",
          elevation: 5,
          shadowColor: navy,
          shadowOpacity: 0.12,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View
          style={{
            width: "78%",
            aspectRatio: 1,
            borderRadius: 20,
            backgroundColor: "#EAF1FC",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="home" size={compact ? 34 : 42} color={blue} />
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          right: "17%",
          bottom: "45%",
          width: compact ? 42 : 50,
          height: compact ? 48 : 56,
          borderRadius: 22,
          borderBottomLeftRadius: 7,
          backgroundColor: "#2463B8",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "45deg" }],
          elevation: 7,
          shadowColor: navy,
          shadowOpacity: 0.18,
          shadowRadius: 8,
        }}
      >
        <View
          style={{
            width: "58%",
            aspectRatio: 1,
            borderRadius: 100,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate: "-45deg" }],
          }}
        >
          <Ionicons name="home" size={compact ? 16 : 19} color={blue} />
        </View>
      </View>

      {/* Floating request card */}
      <View
        style={{
          position: "absolute",
          right: "1%",
          top: "5%",
          width: "42%",
          padding: compact ? 9 : 12,
          borderRadius: 18,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E5ECF6",
          elevation: 6,
          shadowColor: navy,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          gap: compact ? 6 : 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: "#35A37C",
            }}
          />
          <Text
            style={{
              fontSize: compact ? 8 : 9,
              fontWeight: "900",
              color: navy,
              letterSpacing: 0.6,
            }}
          >
            ERRAND REQUEST
          </Text>
        </View>
        {[
          ["bag-handle-outline", "Shopping"],
          ["cube-outline", "Pick up"],
          ["paper-plane-outline", "Deliver"],
        ].map(([icon, label]) => (
          <View
            key={label}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Ionicons
              name={icon as "bag-handle-outline"}
              size={compact ? 13 : 15}
              color={blue}
            />
            <Text
              style={{
                flex: 1,
                color: "#43566F",
                fontWeight: "700",
                fontSize: compact ? 9 : 10,
              }}
            >
              {label}
            </Text>
            <Ionicons
              name="checkmark-circle"
              size={compact ? 13 : 15}
              color="#36A47D"
            />
          </View>
        ))}
      </View>

      {/* Dotted route and courier badge */}
      <View
        style={{
          position: "absolute",
          top: "56%",
          left: "43%",
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          transform: [{ rotate: "13deg" }],
        }}
      >
        {[0, 1, 2, 3].map((dot) => (
          <View
            key={dot}
            style={{
              width: dot === 3 ? 9 : 6,
              height: dot === 3 ? 9 : 6,
              borderRadius: 10,
              backgroundColor: dot === 3 ? "#E5A044" : "#84AEE9",
            }}
          />
        ))}
      </View>
      <View
        style={{
          position: "absolute",
          left: "43%",
          bottom: "4%",
          width: compact ? 48 : 58,
          height: compact ? 48 : 58,
          borderRadius: 19,
          backgroundColor: navy,
          borderWidth: 3,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          elevation: 6,
        }}
      >
        <Ionicons name="bicycle" size={compact ? 27 : 33} color="#FFFFFF" />
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const compact = height < 720 || width < 360;
  const heroWidth = Math.min(width - 40, 390);

  useEffect(() => {
    let active = true;
    dispatchGet<BootstrapStatus>("bootstrapStatus")
      .then(async (status) => {
        if (!active) return;
        if (!status.adminExists) {
          router.replace("/(auth)/setup-admin");
          return;
        }
        try {
          await dispatchGet("me");
          if (active) router.replace("/(app)");
        } catch {
          // Signed-out visitors stay on this welcome screen.
        }
      })
      .catch(() => {
        // Keep welcome actions usable if the network is temporarily unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }}>
      <StatusBar barStyle="dark-content" backgroundColor={paper} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View
          style={{
            flexGrow: 1,
            minHeight: Math.max(height - 32, compact ? 590 : 650),
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: compact ? 18 : 28,
            paddingBottom: compact ? 16 : 24,
          }}
        >
          <View
            accessibilityLabel="SaMi"
            style={{
              width: 160,
              height: 72,
              alignItems: "center",
              justifyContent: "flex-start",
              position: "relative",
            }}
          >
            <Text
              style={{
                width: 160,
                textAlign: "center",
                color: navy,
                fontSize: 54,
                lineHeight: 64,
                fontWeight: "900",
                fontStyle: "italic",
                letterSpacing: -3.2,
                includeFontPadding: false,
              }}
            >
              SaMi
            </Text>
            <View
              style={{
                position: "absolute",
                top: 48,
                left: 55,
                width: 61,
                height: 15,
                borderBottomWidth: 4,
                borderColor: blue,
                borderBottomLeftRadius: 42,
                borderBottomRightRadius: 42,
              }}
            />
          </View>

          <View style={{ width: "100%", alignItems: "center", marginTop: 18, marginBottom: 10 }}>
            <ErrandsIllustration width={heroWidth} />
            <Text
              style={{
                marginTop: compact ? 6 : 12,
                color: navy,
                fontSize: 24,
                lineHeight: 32,
                fontWeight: "800",
                letterSpacing: -0.5,
                textAlign: "center",
              }}
            >
              Consider it done.
            </Text>
          </View>

          <View
            style={{
              width: "100%",
              maxWidth: 390,
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get started"
              onPress={() => router.push("/(auth)/choose-role")}
              style={({ pressed }) => ({
                width: "100%",
                minHeight: 58,
                borderRadius: 18,
                backgroundColor: pressed ? "#1D5297" : blue,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                shadowColor: navy,
                shadowOpacity: 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 5 },
                elevation: 3,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>
                Get started
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              onPress={() => router.push("/(auth)/login")}
              style={({ pressed }) => ({
                minHeight: 46,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: pressed ? "#EAF1FC" : "transparent",
              })}
            >
              <Text style={{ color: navy, fontSize: 15, fontWeight: "800" }}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
