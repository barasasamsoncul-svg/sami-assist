
import { useCallback, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiRequest, dispatchPost } from "@/api";

type IconName = ComponentProps<typeof Ionicons>["name"];

type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

type ProfileResponse = {
  profile: Customer;
};

type AccountPalette = {
  background: string;
  surface: string;
  heading: string;
  muted: string;
  blue: string;
  blueSoft: string;
  border: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  statusBar: "light-content" | "dark-content";
};

function useAccountPalette(): AccountPalette {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  return isDark
    ? {
        background: "#080F1D",
        surface: "#111A2C",
        heading: "#F4F7FF",
        muted: "#AAB8CC",
        blue: "#79AEFF",
        blueSoft: "#1B3150",
        border: "#293951",
        danger: "#FFB8B8",
        dangerBg: "#3B2028",
        dangerBorder: "#70404A",
        statusBar: "light-content",
      }
    : {
        background: "#F7F8FA",
        surface: "#FFFFFF",
        heading: "#000535",
        muted: "#78869A",
        blue: "#2463B8",
        blueSoft: "#EAF1FC",
        border: "#E5EAF1",
        danger: "#B42318",
        dangerBg: "#FFF0EF",
        dangerBorder: "#E9C9C7",
        statusBar: "dark-content",
      };
}

function AccountSection({
  title,
  children,
  palette,
}: {
  title: string;
  children: ReactNode;
  palette: AccountPalette;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Text
        style={{
          color: palette.muted,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1,
          paddingLeft: 3,
        }}
      >
        {title.toUpperCase()}
      </Text>

      <View
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: 20,
          padding: 3,
          gap: 0,
        }}
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
  palette,
  destructive = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  palette: AccountPalette;
  destructive?: boolean;
}) {
  const accent = destructive
    ? palette.danger
    : palette.heading;

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
          backgroundColor: destructive
            ? palette.dangerBg
            : palette.blueSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={icon}
          size={21}
          color={accent}
        />
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
            color: palette.muted,
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
        color={destructive ? palette.danger : palette.muted}
      />
    </Pressable>
  );
}

function MenuDivider({
  palette,
}: {
  palette: AccountPalette;
}) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: palette.border,
        marginHorizontal: 14,
      }}
    />
  );
}

export default function AccountScreen() {
  const palette = useAccountPalette();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<ProfileResponse>(
        "/api/customer/profile",
      );

      if (!result.profile) {
        throw new Error(
          "Your customer profile could not be loaded.",
        );
      }

      setCustomer(result.profile);
      setAvatarFailed(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your account could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh the saved profile and signed image URL
  // whenever the customer returns to this screen.
  useFocusEffect(
    useCallback(() => {
      void loadAccount();
    }, [loadAccount]),
  );

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

  const initial =
    displayName.charAt(0).toUpperCase();

  const hasAvatar =
    Boolean(customer?.avatar_url) && !avatarFailed;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
    >
      <StatusBar
        hidden={false}
        translucent={false}
        backgroundColor={palette.background}
        barStyle={palette.statusBar}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 18,
          paddingBottom: 32,
          gap: 23,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Account heading */}
        <View style={{ gap: 5 }}>
          <Text
            style={{
              color: palette.blue,
              fontSize: 12,
              fontWeight: "800",
              letterSpacing: 1.2,
            }}
          >
            YOUR SAMI ACCOUNT
          </Text>

          <Text
            style={{
              color: palette.heading,
              fontSize: 29,
              fontWeight: "800",
              letterSpacing: -0.7,
            }}
          >
            Account
          </Text>

          <Text
            style={{
              color: palette.muted,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            Manage your profile, account access and personal information.
          </Text>
        </View>

        {/* Loading */}
        {loading ? (
          <ActivityIndicator
            color={palette.blue}
            size="small"
          />
        ) : null}

        {/* Error */}
        {error ? (
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: palette.dangerBg,
              borderWidth: 1,
              borderColor: palette.dangerBorder,
              gap: 10,
            }}
          >
            <Text
              accessibilityRole="alert"
              style={{
                color: palette.danger,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {error}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void loadAccount()}
            >
              <Text
                style={{
                  color: palette.heading,
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
          style={({ pressed }) => ({
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: 20,
            padding: 18,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
            }}
          >
            {/* Actual saved customer avatar */}
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: palette.blueSoft,
                borderWidth: 3,
                borderColor: palette.border,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {hasAvatar ? (
                <Image
                  key={customer?.avatar_url}
                  source={{
                    uri: customer!.avatar_url!,
                  }}
                  resizeMode="cover"
                  onError={() => setAvatarFailed(true)}
                  style={{
                    width: 60,
                    height: 60,
                  }}
                />
              ) : (
                <Text
                  style={{
                    color: palette.blue,
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
                  color: palette.heading,
                  fontSize: 17,
                  fontWeight: "900",
                }}
              >
                {displayName}
              </Text>

              <Text
                numberOfLines={1}
                style={{
                  color: palette.muted,
                  fontSize: 12,
                }}
              >
                {customer?.email || "Your personal account"}
              </Text>

              <Text
                style={{
                  color: palette.blue,
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
              color={palette.blue}
            />
          </View>
        </Pressable>

        {/* My account */}
        <AccountSection
          title="My account"
          palette={palette}
        >
          <AccountMenuItem
            icon="person-outline"
            title="Personal Profile"
            subtitle="Manage your personal details and profile information."
            palette={palette}
            onPress={() =>
              router.push("/(app)/account/profile" as never)
            }
          />

          <MenuDivider palette={palette} />

          <AccountMenuItem
            icon="phone-portrait-outline"
            title="Sign-in & Verification"
            subtitle="Your registered contact details and OTP sign-in."
            palette={palette}
            onPress={() =>
              router.push("/(app)/account/sign-in" as never)
            }
          />
        </AccountSection>

        {/* Privacy */}
        <AccountSection
          title="Privacy and information"
          palette={palette}
        >
          <AccountMenuItem
            icon="shield-checkmark-outline"
            title="Data & Privacy"
            subtitle="Access and export your personal information."
            palette={palette}
            onPress={() =>
              router.push("/(app)/account/privacy" as never)
            }
          />
        </AccountSection>

        {/* Account management */}
        <AccountSection
          title="Account management"
          palette={palette}
        >
          <AccountMenuItem
            icon="trash-outline"
            title="Delete Account"
            subtitle="Review account deletion and personal data removal."
            palette={palette}
            destructive
            onPress={() =>
              router.push("/(app)/account/delete-account" as never)
            }
          />
        </AccountSection>

        {/* Customer support */}
        <AccountSection
          title="Customer assistance"
          palette={palette}
        >
          <AccountMenuItem
            icon="headset-outline"
            title="Help & Support"
            subtitle="Get assistance with SaMi and your errands."
            palette={palette}
            onPress={() =>
              router.push("/(app)/account/support" as never)
            }
          />
        </AccountSection>

        {/* Sign out */}
        <Pressable
          accessibilityRole="button"
          disabled={loading || signingOut}
          onPress={() => void signOut()}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.dangerBorder,
            backgroundColor: palette.dangerBg,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 9,
            opacity: signingOut ? 0.6 : pressed ? 0.75 : 1,
          })}
        >
          {signingOut ? (
            <ActivityIndicator color={palette.danger} />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={19}
                color={palette.danger}
              />

              <Text
                style={{
                  color: palette.danger,
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
            color: palette.muted,
            fontSize: 11,
          }}
        >
          SaMi. Consider it done.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
