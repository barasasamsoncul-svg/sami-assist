
import { useState } from "react";
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
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function PrivacyItem({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 13,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.blueSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={colors.navy} />
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
          style={{
            color: colors.muted,
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}

export default function CustomerPrivacyScreen() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function exportData() {
    if (exporting) return;

    setExporting(true);
    setError("");
    setNotice("");

    try {
      const data = await dispatchGet<Record<string, unknown>>(
        "exportMyData",
      );

      const root = FileSystem.documentDirectory;

      if (!root) {
        throw new Error(
          "SaMi could not access local storage for the export file.",
        );
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      const fileUri =
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
        "Your SaMi data export is ready to save or share.",
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
            paddingBottom: 45,
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
            gap: 13,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Account"
            onPress={() => router.back()}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: colors.white,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={colors.navy}
            />
          </Pressable>

          <View style={{ flex: 1, gap: 3 }}>
            <Text style={common.eyebrow}>
              YOUR INFORMATION
            </Text>

            <Text style={common.title}>
              Data & Privacy
            </Text>
          </View>
        </View>

        <Text style={common.subtitle}>
          Understand how your personal information is handled
          and access a copy of the data associated with your
          SaMi account.
        </Text>

        {/* Privacy introduction */}

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
            Your data belongs to you
          </Text>

          <Text
            style={{
              color: colors.muted,
              fontSize: 13,
              lineHeight: 21,
            }}
          >
            SaMi maintains information required to provide
            your account and errand services. You can request
            an export of the personal information associated
            with your account.
          </Text>
        </View>

        {/* Information categories */}

        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>
            YOUR INFORMATION
          </Text>

          <Text
            style={{
              color: colors.navy,
              fontSize: 18,
              fontWeight: "900",
            }}
          >
            Information associated with your account
          </Text>

          <Text style={common.subtitle}>
            Your export can include the following categories
            where records exist.
          </Text>
        </View>

        <View style={[common.card, { paddingHorizontal: 14 }]}>
          <PrivacyItem
            icon="person-outline"
            title="Personal profile"
            description="Your registered name, email address, phone number and account information."
          />

          <View style={{ height: 1, backgroundColor: colors.border }} />

          <PrivacyItem
            icon="receipt-outline"
            title="Errand records"
            description="Your errand requests, descriptions, statuses and associated activity."
          />

          <View style={{ height: 1, backgroundColor: colors.border }} />

          <PrivacyItem
            icon="wallet-outline"
            title="Payment information"
            description="Available payment records, transaction references and payment statuses."
          />

          <View style={{ height: 1, backgroundColor: colors.border }} />

          <PrivacyItem
            icon="notifications-outline"
            title="Notifications"
            description="Notifications and service updates associated with your account."
          />

          <View style={{ height: 1, backgroundColor: colors.border }} />

          <PrivacyItem
            icon="chatbubbles-outline"
            title="Messages and ratings"
            description="Available errand conversations, ratings and review records."
          />
        </View>

        {/* Export data */}

        <View style={{ gap: 7 }}>
          <Text style={common.eyebrow}>
            DATA ACCESS
          </Text>

          <Text
            style={{
              color: colors.navy,
              fontSize: 18,
              fontWeight: "900",
            }}
          >
            Export your data
          </Text>

          <Text style={common.subtitle}>
            Generate a JSON file containing the personal data
            returned by SaMi and save or share it on your device.
          </Text>
        </View>

        <View
          style={[
            common.card,
            {
              padding: 17,
              gap: 13,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={27}
              color={colors.navy}
            />

            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  color: colors.navy,
                  fontSize: 14,
                  fontWeight: "900",
                }}
              >
                Personal data export
              </Text>

              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                }}
              >
                JSON format
              </Text>
            </View>

            <View style={common.pill}>
              <Text
                style={{
                  color: colors.navy,
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                DOWNLOAD
              </Text>
            </View>
          </View>

          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            SaMi requests your account data, prepares a file
            on your device and opens the system sharing menu.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={exporting}
            onPress={() => void exportData()}
            style={[
              common.primaryButton,
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                opacity: exporting ? 0.6 : 1,
              },
            ]}
          >
            {exporting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons
                name="download-outline"
                size={19}
                color={colors.white}
              />
            )}

            <Text style={common.primaryButtonText}>
              {exporting
                ? "Preparing your export..."
                : "Export my data"}
            </Text>
          </Pressable>
        </View>

        {/* Feedback */}

        {error ? (
          <Text
            accessibilityRole="alert"
            style={common.error}
          >
            {error}
          </Text>
        ) : null}

        {notice ? (
          <View
            style={{
              padding: 13,
              borderRadius: 12,
              backgroundColor: colors.blueSoft,
            }}
          >
            <Text
              style={{
                color: colors.navy,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
              }}
            >
              {notice}
            </Text>
          </View>
        ) : null}

        {/* Account deletion navigation */}

        <View
          style={{
            padding: 15,
            borderRadius: 15,
            backgroundColor: "#FFF8F7",
            borderWidth: 1,
            borderColor: "#F0D5D2",
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="trash-outline"
              size={19}
              color={colors.red}
            />

            <Text
              style={{
                color: colors.red,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              Want to delete your account?
            </Text>
          </View>

          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Account deletion and personal information removal
            are handled separately.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push("/(app)/account/delete-account" as never)
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 5,
            }}
          >
            <Text
              style={{
                color: colors.red,
                fontSize: 13,
                fontWeight: "900",
              }}
            >
              Go to Delete Account
            </Text>

            <Ionicons
              name="arrow-forward"
              size={16}
              color={colors.red}
            />
          </Pressable>
        </View>

        {/* Footer */}

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
