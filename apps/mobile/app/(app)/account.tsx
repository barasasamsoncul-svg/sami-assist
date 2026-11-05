
import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

function AccountSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Text
        style={{
          color: colors.muted,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1,
          paddingLeft: 3,
        }}
      >
        {title.toUpperCase()}
      </Text>

      <View
        style={[
          common.card,
          {
            padding: 3,
            gap: 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function AccountMenuItem({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const accent = destructive ? colors.red : colors.navy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 13,
        paddingVertical: 12,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: destructive ? "#FFF0EF" : colors.blueSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={21} color={accent} />
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: accent,
            fontSize: 14,
            fontWeight: "800",
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            color: colors.muted,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={destructive ? colors.red : colors.muted}
      />
    </Pressable>
  );
}

function MenuDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: 14,
      }}
    />
  );
}

export default function AccountScreen() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await dispatchGet<{ user: Customer }>("me");
      setCustomer(result.user);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your account could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function signOut() {
    setSigningOut(true);
    setError("");

    try {
      await dispatchPost("logout");
    } catch {
      // The API client clears the local session after logout requests.
    }

    router.replace("/(auth)/login");
  }

  const displayName =
    customer?.full_name?.trim() || "SaMi customer";

  const initial = displayName.charAt(0).toUpperCase();

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
            paddingBottom: 32,
            gap: 23,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Account heading */}
        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>
            YOUR SAMI ACCOUNT
          </Text>

          <Text style={common.title}>
            Account
          </Text>

          <Text style={common.subtitle}>
            Manage your profile, account access and personal information.
          </Text>
        </View>

        {/* Loading */}
        {loading ? (
          <ActivityIndicator
            color={colors.blue}
            size="small"
          />
        ) : null}

        {/* Error */}
        {error ? (
          <View
            style={{
              padding: 14,
              borderRadius: 14,
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
              onPress={loadAccount}
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

        {/* Customer profile summary */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open personal profile"
          onPress={() =>
            router.push("/(app)/account/profile" as never)
          }
          style={({ pressed }) => [
            common.card,
            {
              padding: 18,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: colors.navy,
                borderWidth: 3,
                borderColor: colors.blueSoft,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {customer?.avatar_url ? (
                <View style={{ width: 60, height: 60 }}>
                  {/* Avatar display will be connected to the profile API. */}
                  <Ionicons
                    name="person"
                    size={30}
                    color={colors.white}
                    style={{ textAlign: "center", marginTop: 13 }}
                  />
                </View>
              ) : (
                <Text
                  style={{
                    color: colors.white,
                    fontSize: 25,
                    fontWeight: "900",
                  }}
                >
                  {initial}
                </Text>
              )}
            </View>

            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{
                  color: colors.navy,
                  fontSize: 17,
                  fontWeight: "900",
                }}
              >
                {displayName}
              </Text>

              <Text
                numberOfLines={1}
                style={{
                  color: colors.muted,
                  fontSize: 12,
                }}
              >
                {customer?.email || "Your personal account"}
              </Text>

              <Text
                style={{
                  color: colors.blue,
                  fontSize: 11,
                  fontWeight: "900",
                }}
              >
                VIEW PROFILE
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.blue}
            />
          </View>
        </Pressable>

        {/* My account */}
        <AccountSection title="My account">
          <AccountMenuItem
            icon="person-outline"
            title="Personal Profile"
            subtitle="Manage your personal details and profile information."
            onPress={() =>
              router.push("/(app)/account/profile" as never)
            }
          />

          <MenuDivider />

          <AccountMenuItem
            icon="phone-portrait-outline"
            title="Sign-in & Verification"
            subtitle="Your registered contact details and OTP sign-in."
            onPress={() =>
              router.push("/(app)/account/sign-in" as never)
            }
          />
        </AccountSection>

        {/* Privacy */}
        <AccountSection title="Privacy and information">
          <AccountMenuItem
            icon="shield-checkmark-outline"
            title="Data & Privacy"
            subtitle="Access and export your personal information."
            onPress={() =>
              router.push("/(app)/account/privacy" as never)
            }
          />
        </AccountSection>

        {/* Account management */}
        <AccountSection title="Account management">
          <AccountMenuItem
            icon="trash-outline"
            title="Delete Account"
            subtitle="Review account deletion and personal data removal."
            destructive
            onPress={() =>
              router.push("/(app)/account/delete-account" as never)
            }
          />
        </AccountSection>

        {/* Customer support */}
        <AccountSection title="Customer assistance">
          <AccountMenuItem
            icon="headset-outline"
            title="Help & Support"
            subtitle="Get assistance with SaMi and your errands."
            onPress={() =>
              router.push("/(app)/account/support" as never)
            }
          />
        </AccountSection>

        {/* Sign out */}
        <Pressable
          accessibilityRole="button"
          disabled={loading || signingOut}
          onPress={signOut}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E9C9C7",
            backgroundColor: "#FFF8F7",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 9,
            opacity: signingOut ? 0.6 : pressed ? 0.75 : 1,
          })}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.red} />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={19}
                color={colors.red}
              />

              <Text
                style={{
                  color: colors.red,
                  fontSize: 14,
                  fontWeight: "800",
                }}
              >
                Sign Out
              </Text>
            </>
          )}
        </Pressable>

        <Text
          style={{
            textAlign: "center",
            color: colors.muted,
            fontSize: 11,
          }}
        >
          SaMi. Consider it done.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
