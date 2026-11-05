
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function ContactMethod({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  value: string;
  description: string;
}) {
  return (
    <View
      style={[
        common.card,
        {
          padding: 15,
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
        },
      ]}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          backgroundColor: colors.blueSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color={colors.navy} />
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: colors.navy,
            fontSize: 13,
            fontWeight: "900",
          }}
        >
          {title}
        </Text>

        <Text
          selectable
          style={{
            color: colors.ink,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {value}
        </Text>

        <Text
          style={{
            color: colors.muted,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}

export default function CustomerSignInScreen() {
  const insets = useSafeAreaInsets();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await dispatchGet<{ user: Customer }>("me");
      setCustomer(result.user);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your sign-in details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={common.screen}
    >
      <StatusBar
        hidden={false}
        translucent={false}
        backgroundColor={colors.paper}
        barStyle="dark-content"
      />

      <ScrollView
        contentContainerStyle={[
          common.content,
          {
            paddingTop: 18,
            paddingBottom: Math.max(insets.bottom, 24) + 12,
            gap: 21,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Account"
            onPress={() => router.back()}
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              backgroundColor: colors.blueSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color={colors.navy}
            />
          </Pressable>

          <View style={{ flex: 1, gap: 3 }}>
            <Text style={common.eyebrow}>ACCOUNT ACCESS</Text>
            <Text style={common.title}>Sign-in & Verification</Text>
          </View>
        </View>

        {/* OTP explanation */}
        <View
          style={[
            common.card,
            {
              padding: 18,
              gap: 12,
            },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: colors.blueSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={27}
              color={colors.navy}
            />
          </View>

          <Text
            style={{
              color: colors.navy,
              fontSize: 17,
              fontWeight: "900",
            }}
          >
            Passwordless sign-in
          </Text>

          <Text
            style={{
              color: colors.muted,
              fontSize: 13,
              lineHeight: 21,
            }}
          >
            SaMi uses one-time verification codes (OTP) to
            authenticate customer accounts. You receive a code
            through the contact method selected during sign-in.
            There are no password settings.
          </Text>
        </View>

        {/* Registered contact methods */}
        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>YOUR CONTACT DETAILS</Text>

          <Text
            style={{
              color: colors.navy,
              fontSize: 18,
              fontWeight: "900",
            }}
          >
            Registered contact methods
          </Text>

          <Text style={common.subtitle}>
            These are the contact details associated with your
            current SaMi account.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.blue}
            size="large"
            style={{ marginVertical: 14 }}
          />
        ) : null}

        {error ? (
          <View
            style={{
              padding: 14,
              borderRadius: 13,
              backgroundColor: "#FFF0EF",
              gap: 10,
            }}
          >
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.red,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {error}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void loadDetails()}
            >
              <Text
                style={{
                  color: colors.navy,
                  fontWeight: "800",
                }}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && customer ? (
          <View style={{ gap: 12 }}>
            <ContactMethod
              icon="mail-outline"
              title="Email address"
              value={customer.email || "Not provided"}
              description="Your registered email contact."
            />

            <ContactMethod
              icon="call-outline"
              title="Phone number"
              value={customer.phone || "Not provided"}
              description="Your registered mobile contact."
            />
          </View>
        ) : null}

        {/* Security guidance */}
        <View
          style={{
            padding: 15,
            borderRadius: 14,
            backgroundColor: colors.blueSoft,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.navy}
          />

          <Text
            style={{
              flex: 1,
              color: colors.navy,
              fontSize: 12,
              lineHeight: 19,
            }}
          >
            Never share your verification code with another
            person. Only enter it in the official SaMi app when
            completing a sign-in or verification request.
          </Text>
        </View>

        {/* Back */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(app)/account")}
          style={[
            common.secondaryButton,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={17}
            color={colors.navy}
          />

          <Text style={common.secondaryButtonText}>
            Back to Account
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
