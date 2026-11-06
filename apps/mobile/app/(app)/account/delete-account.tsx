
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiRequest, dispatchPost } from "@/api";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type DeletionOtpResponse = {
  ok: boolean;
  challengeId: string;
  deliveryHint: string;
  message: string;
};

type DeletionResponse = {
  ok: boolean;
  message: string;
};

const deletionConsequences: {
  icon: IconName;
  title: string;
  description: string;
}[] = [
  {
    icon: "person-remove-outline",
    title: "Account deactivation",
    description:
      "Your account will be permanently deactivated and you will lose access.",
  },
  {
    icon: "person-outline",
    title: "Personal information",
    description:
      "Your name, contact details and eligible personal information will be removed or redacted.",
  },
  {
    icon: "receipt-outline",
    title: "Errand history",
    description:
      "Eligible completed and cancelled errand descriptions and location details will be redacted.",
  },
  {
    icon: "wallet-outline",
    title: "Financial records",
    description:
      "Financial amounts, transaction references and audit records may be retained where required for reconciliation or legal obligations.",
  },
  {
    icon: "chatbubbles-outline",
    title: "Messages and reviews",
    description:
      "Eligible message contents and rating comments will be removed or redacted.",
  },
];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const palette = {
    background: isDark ? "#080F1D" : "#F7F8FA",
    surface: isDark ? "#111A2C" : "#FFFFFF",
    surfaceRaised: isDark ? "#17243A" : "#F1F5FB",
    input: isDark ? "#0B1424" : "#FFFFFF",
    border: isDark ? "#293951" : "#E6E9EF",
    heading: isDark ? "#F4F7FF" : "#000535",
    text: isDark ? "#E7EEF9" : "#24324A",
    muted: isDark ? "#AAB8CC" : "#78869A",
    accent: isDark ? "#79AEFF" : "#2463B8",
    accentSoft: isDark ? "#172D4D" : "#EAF1FC",
    danger: isDark ? "#FF8F88" : "#B42318",
    dangerBackground: isDark ? "#3E2026" : "#FFF0EF",
    dangerBorder: isDark ? "#67343D" : "#F0D5D2",
    dangerSoft: isDark ? "#52282E" : "#FFE0DD",
    warningText: isDark ? "#F5C66B" : "#8A5A00",
    successBackground: isDark ? "#14372F" : "#E8F7EF",
    successText: isDark ? "#83DDB8" : "#18794E",
    white: "#FFFFFF",
  };

  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");

  const [challengeId, setChallengeId] = useState("");
  const [deliveryHint, setDeliveryHint] = useState("");

  const [requestingCode, setRequestingCode] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const confirmed = confirmation.trim() === "DELETE";
  const validOtp = /^[0-9]{6}$/.test(otp);
  const canDelete = confirmed && validOtp && Boolean(challengeId);

  async function requestDeletionCode() {
    if (!confirmed || requestingCode || deleting) return;

    setRequestingCode(true);
    setError("");
    setNotice("");

    // A new request replaces the previous challenge.
    setChallengeId("");
    setOtp("");
    setDeliveryHint("");

    try {
      const result = await apiRequest<DeletionOtpResponse>(
        "/api/customer/account-deletion/otp",
        {
          method: "POST",
        },
      );

      if (!result.ok || !result.challengeId) {
        throw new Error(
          "SaMi could not start account deletion verification.",
        );
      }

      setChallengeId(result.challengeId);
      setDeliveryHint(result.deliveryHint || "your registered email");

      setNotice(
        result.message ||
          "A verification code has been sent to your registered email.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The verification code could not be sent.",
      );
    } finally {
      setRequestingCode(false);
    }
  }

  async function performDeletion() {
    if (!canDelete || deleting || requestingCode) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<DeletionResponse>(
        "/api/customer/account-deletion",
        {
          method: "POST",
          body: {
            confirmation: "DELETE",
            challengeId,
            code: otp,
          },
        },
      );

      if (!result.ok) {
        throw new Error(
          result.message || "Account deletion could not be completed.",
        );
      }

      Alert.alert(
        "Account deletion completed",
        result.message || "Your SaMi account has been deactivated.",
        [
          {
            text: "Continue",
            onPress: () => {
              void dispatchPost("logout").catch(() => undefined);
              router.replace("/(auth)/login");
            },
          },
        ],
        {
          cancelable: false,
        },
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your account could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeletion() {
    if (!canDelete || deleting) return;

    Alert.alert(
      "Permanently delete your SaMi account?",
      "This action cannot be undone. Your account will be deactivated and eligible personal information removed.",
      [
        {
          text: "Keep my account",
          style: "cancel",
        },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            void performDeletion();
          },
        },
      ],
    );
  }

  function ConsequenceItem({
    icon,
    title,
    description,
    last,
  }: {
    icon: IconName;
    title: string;
    description: string;
    last: boolean;
  }) {
    return (
      <View>
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
            <Ionicons
              name={icon}
              size={20}
              color={palette.accent}
            />
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

        {!last ? (
          <View
            style={{
              height: 1,
              backgroundColor: palette.border,
            }}
          />
        ) : null}
      </View>
    );
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 28) + 18,
            gap: 21,
          }}
          keyboardShouldPersistTaps="handled"
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
              accessibilityLabel="Go back to Account"
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
                ACCOUNT MANAGEMENT
              </Text>

              <Text
                style={{
                  color: palette.heading,
                  fontSize: 23,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                }}
              >
                Delete Account
              </Text>
            </View>
          </View>

          {/* Permanent deletion warning */}

          <View
            style={{
              backgroundColor: palette.dangerBackground,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: palette.dangerBorder,
              padding: 19,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                backgroundColor: palette.dangerSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="warning-outline"
                size={27}
                color={palette.danger}
              />
            </View>

            <Text
              style={{
                color: palette.danger,
                fontSize: 18,
                fontWeight: "900",
              }}
            >
              This action is permanent
            </Text>

            <Text
              style={{
                color: palette.text,
                fontSize: 13,
                lineHeight: 21,
              }}
            >
              Deleting your SaMi account will deactivate your
              account and remove eligible personal information.
              You will no longer be able to sign in using this
              account. This action cannot be undone.
            </Text>
          </View>

          {/* Consequences */}

          <View style={{ gap: 7 }}>
            <Text
              style={{
                color: palette.accent,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.2,
              }}
            >
              BEFORE YOU CONTINUE
            </Text>

            <Text
              style={{
                color: palette.heading,
                fontSize: 19,
                fontWeight: "900",
              }}
            >
              What happens when you delete your account?
            </Text>

            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              Review the effects of account deletion carefully.
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 15,
              borderRadius: 20,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            {deletionConsequences.map((item, index) => (
              <ConsequenceItem
                key={item.title}
                icon={item.icon}
                title={item.title}
                description={item.description}
                last={index === deletionConsequences.length - 1}
              />
            ))}
          </View>

          {/* Eligibility warning */}

          <View
            style={{
              padding: 16,
              backgroundColor: palette.accentSoft,
              borderRadius: 17,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 11,
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={palette.accent}
            />

            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  color: palette.heading,
                  fontSize: 13,
                  fontWeight: "900",
                }}
              >
                Resolve outstanding errands first
              </Text>

              <Text
                style={{
                  color: palette.text,
                  fontSize: 12,
                  lineHeight: 19,
                }}
              >
                You must complete or cancel open errands and
                resolve any disputes before account deletion.
                SaMi checks your eligibility before completing
                the request.
              </Text>
            </View>
          </View>

          {/* Confirmation heading */}

          <View style={{ gap: 7 }}>
            <Text
              style={{
                color: palette.accent,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.2,
              }}
            >
              DELETION CONFIRMATION
            </Text>

            <Text
              style={{
                color: palette.heading,
                fontSize: 19,
                fontWeight: "900",
              }}
            >
              Confirm your decision
            </Text>

            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              Type DELETE below to confirm that you understand
              this action is permanent.
            </Text>
          </View>

          {/* Confirmation and verification card */}

          <View
            style={{
              padding: 17,
              borderRadius: 20,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
              gap: 16,
            }}
          >
            {/* Typed confirmation */}

            <View style={{ gap: 8 }}>
              <Text
                style={{
                  color: palette.text,
                  fontSize: 12,
                  fontWeight: "900",
                }}
              >
                TYPE DELETE TO CONTINUE
              </Text>

              <TextInput
                value={confirmation}
                onChangeText={(value) => {
                  setConfirmation(value.toUpperCase());
                  setError("");
                  setNotice("");
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={6}
                placeholder="DELETE"
                placeholderTextColor={palette.muted}
                selectionColor={palette.accent}
                keyboardAppearance={isDark ? "dark" : "light"}
                editable={!deleting}
                style={{
                  minHeight: 53,
                  borderWidth: 1,
                  borderColor: confirmed
                    ? palette.danger
                    : palette.border,
                  borderRadius: 13,
                  backgroundColor: palette.input,
                  paddingHorizontal: 14,
                  color: palette.text,
                  fontSize: 15,
                  fontWeight: "800",
                  letterSpacing: 1.5,
                }}
              />

              <Text
                style={{
                  color: confirmed ? palette.successText : palette.muted,
                  fontSize: 11,
                  fontWeight: confirmed ? "800" : "500",
                }}
              >
                {confirmed
                  ? "Confirmation accepted."
                  : "Enter the exact word DELETE."}
              </Text>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: palette.border,
              }}
            />

            {/* OTP request */}

            <View style={{ gap: 9 }}>
              <Text
                style={{
                  color: palette.heading,
                  fontSize: 14,
                  fontWeight: "900",
                }}
              >
                Verify account ownership
              </Text>

              <Text
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  lineHeight: 19,
                }}
              >
                SaMi will send a one-time verification code to
                your registered email before your account can
                be deleted.
              </Text>

              {deliveryHint ? (
                <View
                  style={{
                    padding: 12,
                    backgroundColor: palette.accentSoft,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                  }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={palette.accent}
                  />

                  <Text
                    style={{
                      flex: 1,
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    Code sent to {deliveryHint}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!confirmed || requestingCode || deleting}
                onPress={() => void requestDeletionCode()}
                style={{
                  minHeight: 49,
                  borderRadius: 13,
                  backgroundColor: palette.accentSoft,
                  borderWidth: 1,
                  borderColor: palette.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity:
                    !confirmed || requestingCode || deleting
                      ? 0.5
                      : 1,
                }}
              >
                {requestingCode ? (
                  <ActivityIndicator color={palette.accent} />
                ) : (
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={palette.accent}
                  />
                )}

                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 13,
                    fontWeight: "900",
                  }}
                >
                  {requestingCode
                    ? "Sending code..."
                    : challengeId
                      ? "Send a new verification code"
                      : "Send verification code"}
                </Text>
              </Pressable>

              {/* OTP entry */}

              {challengeId ? (
                <View style={{ gap: 8, paddingTop: 3 }}>
                  <Text
                    style={{
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    SIX-DIGIT VERIFICATION CODE
                  </Text>

                  <TextInput
                    value={otp}
                    onChangeText={(value) => {
                      setOtp(
                        value.replace(/[^0-9]/g, "").slice(0, 6),
                      );
                      setError("");
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="000000"
                    placeholderTextColor={palette.muted}
                    selectionColor={palette.accent}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    editable={!deleting}
                    textAlign="center"
                    style={{
                      minHeight: 57,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 13,
                      backgroundColor: palette.input,
                      color: palette.heading,
                      fontSize: 22,
                      fontWeight: "900",
                      letterSpacing: 8,
                    }}
                  />

                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 11,
                      lineHeight: 17,
                    }}
                  >
                    The verification code expires after 10 minutes.
                  </Text>
                </View>
              ) : null}
            </View>
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
                color={palette.danger}
              />

              <Text
                accessibilityRole="alert"
                style={{
                  flex: 1,
                  color: palette.danger,
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

          {/* Permanent deletion action */}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Permanently delete my SaMi account"
            disabled={!canDelete || deleting || requestingCode}
            onPress={confirmDeletion}
            style={{
              minHeight: 55,
              borderRadius: 15,
              backgroundColor: palette.danger,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 9,
              paddingHorizontal: 16,
              opacity:
                !canDelete || deleting || requestingCode ? 0.45 : 1,
            }}
          >
            {deleting ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Ionicons
                name="trash-outline"
                size={19}
                color={palette.white}
              />
            )}

            <Text
              style={{
                color: palette.white,
                fontSize: 13,
                fontWeight: "900",
              }}
            >
              {deleting
                ? "Deleting account..."
                : "Permanently delete my account"}
            </Text>
          </Pressable>

          {/* Keep account */}

          <Pressable
            accessibilityRole="button"
            disabled={deleting}
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
              opacity: deleting ? 0.5 : 1,
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
              Keep my account
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
