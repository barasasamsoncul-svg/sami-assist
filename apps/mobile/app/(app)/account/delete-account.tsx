
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiRequest, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

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
  const canDelete =
    confirmed && validOtp && Boolean(challengeId);

  async function requestDeletionCode() {
    if (!confirmed || requestingCode || deleting) return;

    setRequestingCode(true);
    setError("");
    setNotice("");

    // A new request supersedes the previous challenge.
    setChallengeId("");
    setOtp("");
    setDeliveryHint("");

    try {
      const result =
        await apiRequest<DeletionOtpResponse>(
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
      setDeliveryHint(
        result.deliveryHint || "your registered email",
      );

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
      const result =
        await apiRequest<DeletionResponse>(
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
          result.message ||
            "Account deletion could not be completed.",
        );
      }

      Alert.alert(
        "Account deletion completed",
        result.message ||
          "Your SaMi account has been deactivated.",
        [
          {
            text: "Continue",
            onPress: () => {
              void dispatchPost("logout").catch(
                () => undefined,
              );

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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === "ios" ? "padding" : undefined
        }
      >
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingTop: 18,
            paddingBottom: 48,
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
              accessibilityLabel="Go back"
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
                ACCOUNT MANAGEMENT
              </Text>

              <Text
                style={{
                  color: colors.navy,
                  fontSize: 23,
                  fontWeight: "900",
                }}
              >
                Delete Account
              </Text>
            </View>
          </View>

          {/* Warning */}

          <View
            style={{
              backgroundColor: "#FFF0EF",
              borderRadius: 17,
              borderWidth: 1,
              borderColor: "#F0D5D2",
              padding: 17,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 49,
                height: 49,
                borderRadius: 15,
                backgroundColor: "#FFE0DD",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="warning-outline"
                size={27}
                color={colors.red}
              />
            </View>

            <Text
              style={{
                color: colors.red,
                fontSize: 17,
                fontWeight: "900",
              }}
            >
              This action is permanent
            </Text>

            <Text
              style={{
                color: "#70413E",
                fontSize: 13,
                lineHeight: 21,
              }}
            >
              Deleting your SaMi account will deactivate your
              account and remove eligible personal information.
              You will no longer be able to sign in using this
              account.
            </Text>
          </View>

          {/* Consequences */}

          <View style={{ gap: 7 }}>
            <Text style={common.eyebrow}>
              BEFORE YOU CONTINUE
            </Text>

            <Text
              style={{
                color: colors.navy,
                fontSize: 18,
                fontWeight: "900",
              }}
            >
              What happens when you delete your account?
            </Text>

            <Text style={common.subtitle}>
              Review the effects of account deletion carefully.
            </Text>
          </View>

          <View
            style={[
              common.card,
              { paddingHorizontal: 15 },
            ]}
          >
            {deletionConsequences.map((item, index) => (
              <View key={item.title}>
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
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={colors.navy}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        color: colors.navy,
                        fontSize: 13,
                        fontWeight: "900",
                      }}
                    >
                      {item.title}
                    </Text>

                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      {item.description}
                    </Text>
                  </View>
                </View>

                {index < deletionConsequences.length - 1 ? (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: colors.border,
                    }}
                  />
                ) : null}
              </View>
            ))}
          </View>

          {/* Eligibility */}

          <View
            style={{
              padding: 15,
              backgroundColor: colors.blueSoft,
              borderRadius: 15,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={21}
              color={colors.navy}
            />

            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{
                  color: colors.navy,
                  fontSize: 13,
                  fontWeight: "900",
                }}
              >
                Resolve outstanding errands first
              </Text>

              <Text
                style={{
                  color: colors.muted,
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

          {/* Confirmation */}

          <View style={{ gap: 7 }}>
            <Text style={common.eyebrow}>
              DELETION CONFIRMATION
            </Text>

            <Text
              style={{
                color: colors.navy,
                fontSize: 18,
                fontWeight: "900",
              }}
            >
              Confirm your decision
            </Text>

            <Text style={common.subtitle}>
              Type DELETE below to confirm that you understand
              this action is permanent.
            </Text>
          </View>

          <View
            style={[
              common.card,
              { gap: 13 },
            ]}
          >
            <View style={{ gap: 6 }}>
              <Text style={common.label}>
                Type DELETE to continue
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
                maxLength={6}
                placeholder="DELETE"
                placeholderTextColor={colors.muted}
                style={[
                  common.input,
                  {
                    borderColor: confirmed
                      ? colors.red
                      : colors.border,
                  },
                ]}
              />
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
              }}
            />

            <View style={{ gap: 8 }}>
              <Text
                style={{
                  color: colors.navy,
                  fontSize: 14,
                  fontWeight: "900",
                }}
              >
                Verify account ownership
              </Text>

              <Text
                style={{
                  color: colors.muted,
                  fontSize: 12,
                  lineHeight: 18,
                }}
              >
                SaMi will send a one-time verification code to
                your registered email before your account can
                be deleted.
              </Text>

              {deliveryHint ? (
                <Text
                  style={{
                    color: colors.blue,
                    fontSize: 12,
                    fontWeight: "800",
                  }}
                >
                  Code sent to {deliveryHint}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={
                  !confirmed ||
                  requestingCode ||
                  deleting
                }
                onPress={() => void requestDeletionCode()}
                style={[
                  common.secondaryButton,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 9,
                    opacity:
                      !confirmed ||
                      requestingCode ||
                      deleting
                        ? 0.55
                        : 1,
                  },
                ]}
              >
                {requestingCode ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={colors.navy}
                  />
                )}

                <Text style={common.secondaryButtonText}>
                  {requestingCode
                    ? "Sending code..."
                    : challengeId
                      ? "Send new verification code"
                      : "Send verification code"}
                </Text>
              </Pressable>

              {challengeId ? (
                <View style={{ gap: 6 }}>
                  <Text style={common.label}>
                    Six-digit verification code
                  </Text>

                  <TextInput
                    value={otp}
                    onChangeText={(value) => {
                      setOtp(
                        value
                          .replace(/[^0-9]/g, "")
                          .slice(0, 6),
                      );
                      setError("");
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="000000"
                    placeholderTextColor={colors.muted}
                    style={[
                      common.input,
                      {
                        textAlign: "center",
                        letterSpacing: 8,
                        fontSize: 19,
                        fontWeight: "900",
                      },
                    ]}
                  />

                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 11,
                      lineHeight: 17,
                    }}
                  >
                    The verification code expires after
                    10 minutes.
                  </Text>
                </View>
              ) : null}
            </View>
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
                backgroundColor: colors.blueSoft,
                padding: 12,
                borderRadius: 12,
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

          {/* Delete button */}

          <Pressable
            accessibilityRole="button"
            disabled={
              !canDelete ||
              deleting ||
              requestingCode
            }
            onPress={confirmDeletion}
            style={{
              minHeight: 54,
              borderRadius: 14,
              backgroundColor: colors.red,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 9,
              paddingHorizontal: 16,
              opacity:
                !canDelete ||
                deleting ||
                requestingCode
                  ? 0.45
                  : 1,
            }}
          >
            {deleting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons
                name="trash-outline"
                size={19}
                color={colors.white}
              />
            )}

            <Text
              style={{
                color: colors.white,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              {deleting
                ? "Deleting account..."
                : "Permanently delete my account"}
            </Text>
          </Pressable>

          {/* Cancel */}

          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={() =>
              router.replace("/(app)/account")
            }
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
              Keep my account
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
