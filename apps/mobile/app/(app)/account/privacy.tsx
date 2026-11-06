
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { dispatchGet } from "@/api";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type Palette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  heading: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  successBackground: string;
  successText: string;
  dangerBackground: string;
  dangerText: string;
  dangerBorder: string;
  white: string;
};

type ExportResponse = {
  exportVersion?: number;
  exportedAt?: string;
  retentionNote?: string;
  profile?: Record<string, unknown> | null;
  errands?: unknown[];
  payments?: unknown[];
  notifications?: unknown[];
  messages?: unknown[];
  ratings?: unknown[];
  events?: unknown[];
  calls?: unknown[];
};

function PrivacyItem({
  icon,
  title,
  description,
  palette,
}: {
  icon: IconName;
  title: string;
  description: string;
  palette: Palette;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 14,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          backgroundColor: palette.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={palette.accent} />
      </View>

      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={{
            color: palette.heading,
            fontSize: 13,
            fontWeight: "900",
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            color: palette.muted,
            fontSize: 12,
            lineHeight: 19,
          }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  palette,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  palette: Palette;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: palette.accent,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.2,
        }}
      >
        {eyebrow}
      </Text>

      <Text
        style={{
          color: palette.heading,
          fontSize: 19,
          fontWeight: "900",
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={{
            color: palette.muted,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export default function CustomerPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const palette: Palette = {
    background: isDark ? "#080F1D" : "#F7F8FA",
    surface: isDark ? "#111A2C" : "#FFFFFF",
    surfaceRaised: isDark ? "#17243A" : "#F1F5FB",
    border: isDark ? "#293951" : "#E6E9EF",
    heading: isDark ? "#F4F7FF" : "#000535",
    text: isDark ? "#E7EEF9" : "#24324A",
    muted: isDark ? "#AAB8CC" : "#78869A",
    accent: isDark ? "#79AEFF" : "#2463B8",
    accentSoft: isDark ? "#172D4D" : "#EAF1FC",
    successBackground: isDark ? "#14372F" : "#E8F7EF",
    successText: isDark ? "#83DDB8" : "#18794E",
    dangerBackground: isDark ? "#3E2026" : "#FFF0EF",
    dangerText: isDark ? "#FF9B94" : "#B42318",
    dangerBorder: isDark ? "#67343D" : "#F0D5D2",
    white: "#FFFFFF",
  };

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function exportData() {
    if (exporting) return;

    setExporting(true);
    setError("");
    setNotice("");

    let fileUri: string | null = null;

    try {
      const data = await dispatchGet<ExportResponse>(
        "exportMyData",
      );

      if (!data || typeof data !== "object") {
        throw new Error(
          "SaMi returned an invalid data export. Please try again.",
        );
      }

      const root = FileSystem.cacheDirectory;

      if (!root) {
        throw new Error(
          "SaMi could not access local storage for the export file.",
        );
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      fileUri =
        root + "sami-data-export-" + timestamp + ".json";

      await FileSystem.writeAsStringAsync(
        fileUri,
        JSON.stringify(data, null, 2),
        {
          encoding: FileSystem.EncodingType.UTF8,
        },
      );

      const available = await Sharing.isAvailableAsync();

      if (!available) {
        throw new Error(
          "This device does not have a compatible app for sharing the export file.",
        );
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Export your SaMi personal data",
        UTI: "public.json",
      });

      setNotice(
        "Your SaMi data export is ready to save or share. Keep the file somewhere private because it contains personal account information.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your data export could not be prepared.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: palette.background,
      }}
    >
      <StatusBar
        hidden={false}
        translucent={false}
        backgroundColor={palette.background}
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 26) + 16,
          gap: 21,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 13,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Account"
            onPress={() => router.back()}
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={palette.heading}
            />
          </Pressable>

          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: palette.accent,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.3,
              }}
            >
              YOUR INFORMATION
            </Text>

            <Text
              style={{
                color: palette.heading,
                fontSize: 23,
                fontWeight: "900",
                letterSpacing: -0.5,
              }}
            >
              Data & Privacy
            </Text>
          </View>
        </View>

        <Text
          style={{
            color: palette.muted,
            fontSize: 13,
            lineHeight: 21,
          }}
        >
          Understand the information associated with your SaMi
          account and request a copy of the available personal data.
        </Text>

        {/* Privacy introduction */}

        <View
          style={{
            padding: 19,
            borderRadius: 22,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            gap: 13,
          }}
        >
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 17,
              backgroundColor: palette.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={27}
              color={palette.accent}
            />
          </View>

          <Text
            style={{
              color: palette.heading,
              fontSize: 19,
              fontWeight: "900",
            }}
          >
            Your information matters
          </Text>

          <Text
            style={{
              color: palette.muted,
              fontSize: 13,
              lineHeight: 21,
            }}
          >
            SaMi maintains information needed to provide your
            account, errand services, customer support and payment
            history. You can request an export of the information
            currently returned by the SaMi data-export service.
          </Text>
        </View>

        {/* Data categories */}

        <SectionHeading
          eyebrow="YOUR INFORMATION"
          title="Information associated with your account"
          description="The export service includes the following categories where records are available."
          palette={palette}
        />

        <View
          style={{
            paddingHorizontal: 15,
            paddingVertical: 3,
            borderRadius: 20,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <PrivacyItem
            icon="person-outline"
            title="Personal profile"
            description="Your registered name, email address, phone number and account details."
            palette={palette}
          />

          <View style={{ height: 1, backgroundColor: palette.border }} />

          <PrivacyItem
            icon="receipt-outline"
            title="Errand records"
            description="Your errand requests, descriptions, statuses and associated activity."
            palette={palette}
          />

          <View style={{ height: 1, backgroundColor: palette.border }} />

          <PrivacyItem
            icon="wallet-outline"
            title="Payment information"
            description="Available payment records, transaction references and payment statuses."
            palette={palette}
          />

          <View style={{ height: 1, backgroundColor: palette.border }} />

          <PrivacyItem
            icon="notifications-outline"
            title="Notifications"
            description="Notifications and service updates associated with your account."
            palette={palette}
          />

          <View style={{ height: 1, backgroundColor: palette.border }} />

          <PrivacyItem
            icon="chatbubbles-outline"
            title="Messages and ratings"
            description="Available errand conversations, rating comments and review records."
            palette={palette}
          />

          <View style={{ height: 1, backgroundColor: palette.border }} />

          <PrivacyItem
            icon="time-outline"
            title="Activity and call history"
            description="Available errand event history and call records associated with your errands."
            palette={palette}
          />
        </View>

        {/* Data export */}

        <SectionHeading
          eyebrow="DATA ACCESS"
          title="Export your data"
          description="Generate a JSON file containing the personal data returned by SaMi and save or share it on your device."
          palette={palette}
        />

        <View
          style={{
            padding: 18,
            borderRadius: 20,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            gap: 15,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 15,
                backgroundColor: palette.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="document-text-outline"
                size={25}
                color={palette.accent}
              />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  color: palette.heading,
                  fontSize: 14,
                  fontWeight: "900",
                }}
              >
                Personal data export
              </Text>

              <Text
                style={{
                  color: palette.muted,
                  fontSize: 11,
                }}
              >
                JSON file · Device sharing
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: palette.accentSoft,
              }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontSize: 10,
                  fontWeight: "900",
                  letterSpacing: 0.5,
                }}
              >
                EXPORT
              </Text>
            </View>
          </View>

          <Text
            style={{
              color: palette.muted,
              fontSize: 12,
              lineHeight: 19,
            }}
          >
            SaMi securely requests your account data, prepares a
            JSON file locally and opens your device's sharing menu.
            You can save the file or share it with an app of your choice.
          </Text>

          <View
            style={{
              padding: 12,
              borderRadius: 13,
              backgroundColor: palette.surfaceRaised,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 9,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={17}
              color={palette.accent}
            />

            <Text
              style={{
                flex: 1,
                color: palette.muted,
                fontSize: 11,
                lineHeight: 17,
              }}
            >
              Your export may contain personal, errand and payment
              information. Store it securely and share it only with
              people or services you trust.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={exporting}
            onPress={() => void exportData()}
            style={{
              minHeight: 53,
              borderRadius: 15,
              backgroundColor: palette.accent,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Ionicons
                name="download-outline"
                size={19}
                color={palette.white}
              />
            )}

            <Text
              style={{
                color: palette.white,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              {exporting
                ? "Preparing your export..."
                : "Export my data"}
            </Text>
          </Pressable>
        </View>

        {/* Feedback */}

        {error ? (
          <View
            style={{
              padding: 13,
              borderRadius: 13,
              backgroundColor: palette.dangerBackground,
              borderWidth: 1,
              borderColor: palette.dangerBorder,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 9,
            }}
          >
            <Ionicons
              name="alert-circle-outline"
              size={19}
              color={palette.dangerText}
            />

            <Text
              accessibilityRole="alert"
              style={{
                flex: 1,
                color: palette.dangerText,
                fontSize: 12,
                lineHeight: 19,
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View
            style={{
              padding: 13,
              borderRadius: 13,
              backgroundColor: palette.successBackground,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 9,
            }}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={19}
              color={palette.successText}
            />

            <Text
              style={{
                flex: 1,
                color: palette.successText,
                fontSize: 12,
                fontWeight: "700",
                lineHeight: 19,
              }}
            >
              {notice}
            </Text>
          </View>
        ) : null}

        {/* Account deletion */}

        <View
          style={{
            padding: 16,
            borderRadius: 18,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.dangerBorder,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
            }}
          >
            <View
              style={{
                width: 39,
                height: 39,
                borderRadius: 12,
                backgroundColor: palette.dangerBackground,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="trash-outline"
                size={19}
                color={palette.dangerText}
              />
            </View>

            <Text
              style={{
                flex: 1,
                color: palette.heading,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              Account deletion
            </Text>
          </View>

          <Text
            style={{
              color: palette.muted,
              fontSize: 12,
              lineHeight: 19,
            }}
          >
            Deactivating your account and removing eligible
            personal information is handled separately from
            downloading your data.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push("/(app)/account/delete-account" as never)
            }
            style={{
              minHeight: 43,
              borderRadius: 12,
              backgroundColor: palette.dangerBackground,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                color: palette.dangerText,
                fontSize: 12,
                fontWeight: "900",
              }}
            >
              Go to Delete Account
            </Text>

            <Ionicons
              name="arrow-forward"
              size={16}
              color={palette.dangerText}
            />
          </Pressable>
        </View>

        {/* Back to Account */}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(app)/account")}
          style={{
            minHeight: 51,
            borderRadius: 15,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
          }}
        >
          <Ionicons
            name="arrow-back"
            size={17}
            color={palette.heading}
          />

          <Text
            style={{
              color: palette.heading,
              fontSize: 14,
              fontWeight: "900",
            }}
          >
            Back to Account
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
