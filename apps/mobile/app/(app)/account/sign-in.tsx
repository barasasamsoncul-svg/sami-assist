
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { apiRequest } from "@/api";

type ContactType = "email" | "phone";

type CustomerProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url?: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
};

type ProfileResponse = {
  profile: CustomerProfile;
};

type ChangeRequestResponse = {
  ok: boolean;
  challengeId: string;
  destinationMasked?: string;
  expiresInSeconds?: number;
  message?: string;
};

type ChangeVerifyResponse = {
  ok: boolean;
  message?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const OTP_PATTERN = /^\d{6}$/;

function getCleanContact(type: ContactType, value: string) {
  if (type === "email") {
    return value.trim().toLowerCase();
  }

  return value.replace(/[()\s-]/g, "");
}

function getContactError(type: ContactType, value: string) {
  if (!value) {
    return type === "email"
      ? "Enter the new email address."
      : "Enter the new phone number.";
  }

  if (type === "email" && !EMAIL_PATTERN.test(value)) {
    return "Enter a valid email address.";
  }

  if (type === "phone" && !PHONE_PATTERN.test(value)) {
    return "Use international format, for example +254712345678.";
  }

  return "";
}

export default function CustomerSignInScreen() {
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
    successBackground: isDark ? "#14372F" : "#E8F7EF",
    successText: isDark ? "#83DDB8" : "#18794E",
    warningBackground: isDark ? "#3A2B16" : "#FFF5DF",
    warningText: isDark ? "#F5C66B" : "#8A5A00",
    dangerBackground: isDark ? "#3E2026" : "#FFF0EF",
    dangerText: isDark ? "#FF9B94" : "#B42318",
    overlay: "rgba(0,0,0,0.58)",
    white: "#FFFFFF",
  };

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [contactType, setContactType] = useState<ContactType>("email");
  const [contactValue, setContactValue] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState(600);
  const [codeRequested, setCodeRequested] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalNotice, setModalNotice] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<ProfileResponse>(
        "/api/customer/profile",
      );

      if (!result.profile) {
        throw new Error("Your customer profile could not be loaded.");
      }

      setCustomer(result.profile);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your account details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  function resetChangeForm() {
    setContactValue("");
    setVerificationCode("");
    setChallengeId("");
    setMaskedDestination("");
    setExpiresInSeconds(600);
    setCodeRequested(false);
    setRequestingCode(false);
    setVerifyingCode(false);
    setModalError("");
    setModalNotice("");
  }

  function openChangeContact(type: ContactType) {
    resetChangeForm();
    setContactType(type);
    setNotice("");
    setModalVisible(true);
  }

  function closeChangeContact() {
    if (requestingCode || verifyingCode) return;

    setModalVisible(false);
    resetChangeForm();
  }

  async function requestVerificationCode() {
    const cleanValue = getCleanContact(contactType, contactValue);
    const validationError = getContactError(contactType, cleanValue);

    if (validationError) {
      setModalError(validationError);
      return;
    }

    setRequestingCode(true);
    setModalError("");
    setModalNotice("");

    try {
      const result = await apiRequest<ChangeRequestResponse>(
        "/api/customer/contact/change/request",
        {
          method: "POST",
          body: {
            contactType,
            newValue: cleanValue,
          },
        },
      );

      if (!result.ok || !result.challengeId) {
        throw new Error(
          "The verification request could not be completed. Try again.",
        );
      }

      setChallengeId(result.challengeId);
      setMaskedDestination(result.destinationMasked || cleanValue);
      setExpiresInSeconds(result.expiresInSeconds || 600);
      setVerificationCode("");
      setCodeRequested(true);
      setModalNotice(
        result.message || "Your verification code has been sent.",
      );
    } catch (cause) {
      setModalError(
        cause instanceof Error
          ? cause.message
          : "We could not send your verification code.",
      );
    } finally {
      setRequestingCode(false);
    }
  }

  async function verifyContactChange() {
    const cleanCode = verificationCode.trim();

    if (!OTP_PATTERN.test(cleanCode)) {
      setModalError("Enter the six-digit verification code.");
      return;
    }

    if (!challengeId) {
      setModalError("Request a new verification code to continue.");
      setCodeRequested(false);
      return;
    }

    setVerifyingCode(true);
    setModalError("");
    setModalNotice("");

    try {
      const result = await apiRequest<ChangeVerifyResponse>(
        "/api/customer/contact/change/verify",
        {
          method: "POST",
          body: {
            challengeId,
            code: cleanCode,
          },
        },
      );

      if (!result.ok) {
        throw new Error("Your contact details could not be verified.");
      }

      setModalVisible(false);
      resetChangeForm();

      await loadProfile();

      setNotice(
        result.message ||
          `Your ${contactType === "email" ? "email address" : "phone number"} has been updated successfully.`,
      );
    } catch (cause) {
      setModalError(
        cause instanceof Error
          ? cause.message
          : "The verification code could not be confirmed.",
      );
    } finally {
      setVerifyingCode(false);
    }
  }

  const currentContact =
    contactType === "email"
      ? customer?.email || ""
      : customer?.phone || "";

  const modalTitle =
    contactType === "email"
      ? "Change email address"
      : "Change phone number";

  const modalDescription =
    contactType === "email"
      ? "Enter the new email address you want to use for your SaMi account."
      : "Enter your new phone number in international format.";

  const verified =
    contactType === "email"
      ? customer?.email_verified
      : customer?.phone_verified;

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: palette.background }}
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
          paddingBottom: Math.max(insets.bottom, 24) + 20,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Page header */}

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
              size={21}
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
              ACCOUNT SECURITY
            </Text>

            <Text
              style={{
                color: palette.heading,
                fontSize: 23,
                fontWeight: "900",
                letterSpacing: -0.5,
              }}
            >
              Sign-in & Verification
            </Text>
          </View>
        </View>

        {/* Security introduction */}

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
              name="shield-checkmark"
              size={27}
              color={palette.accent}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: palette.heading,
                fontSize: 19,
                fontWeight: "900",
                letterSpacing: -0.3,
              }}
            >
              Your account, securely yours
            </Text>

            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
                lineHeight: 21,
              }}
            >
              SaMi uses one-time verification codes (OTP) for
              passwordless sign-in. Keep your email address and phone
              number up to date so you can securely access your account.
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingTop: 5,
            }}
          >
            <Ionicons
              name="lock-closed"
              size={15}
              color={palette.accent}
            />
            <Text
              style={{
                color: palette.accent,
                fontSize: 12,
                fontWeight: "800",
              }}
            >
              No password required
            </Text>
          </View>
        </View>

        {/* Contact details heading */}

        <View style={{ gap: 6 }}>
          <Text
            style={{
              color: palette.accent,
              fontSize: 11,
              fontWeight: "900",
              letterSpacing: 1.2,
            }}
          >
            YOUR CONTACT DETAILS
          </Text>

          <Text
            style={{
              color: palette.heading,
              fontSize: 20,
              fontWeight: "900",
              letterSpacing: -0.4,
            }}
          >
            Sign-in methods
          </Text>

          <Text
            style={{
              color: palette.muted,
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            These details are linked to your customer account. You can
            change either one after verifying the new contact.
          </Text>
        </View>

        {/* Loading */}

        {loading ? (
          <View
            style={{
              paddingVertical: 42,
              alignItems: "center",
              gap: 13,
            }}
          >
            <ActivityIndicator size="large" color={palette.accent} />
            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
              }}
            >
              Loading your contact details...
            </Text>
          </View>
        ) : null}

        {/* Load error */}

        {error ? (
          <View
            style={{
              padding: 15,
              borderRadius: 15,
              backgroundColor: palette.dangerBackground,
              borderWidth: 1,
              borderColor: palette.border,
              gap: 11,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={palette.dangerText}
              />

              <Text
                accessibilityRole="alert"
                style={{
                  flex: 1,
                  color: palette.dangerText,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {error}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => void loadProfile()}
              style={{
                alignSelf: "flex-start",
                paddingVertical: 5,
              }}
            >
              <Text
                style={{
                  color: palette.dangerText,
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Contact method cards */}

        {!loading && customer ? (
          <View style={{ gap: 13 }}>
            {/* Email */}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change email address"
              onPress={() => openChangeContact("email")}
              style={{
                padding: 16,
                borderRadius: 19,
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
                    width: 47,
                    height: 47,
                    borderRadius: 15,
                    backgroundColor: palette.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="mail-outline"
                    size={22}
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
                    Email address
                  </Text>

                  <Text
                    selectable
                    style={{
                      color: palette.text,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {customer.email || "No email address added"}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: customer.email_verified
                      ? palette.successBackground
                      : palette.warningBackground,
                  }}
                >
                  <Text
                    style={{
                      color: customer.email_verified
                        ? palette.successText
                        : palette.warningText,
                      fontSize: 10,
                      fontWeight: "900",
                    }}
                  >
                    {customer.email_verified ? "VERIFIED" : "UNVERIFIED"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: palette.border,
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 12,
                  }}
                >
                  Used for email verification and sign-in
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: palette.accent,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    Change
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={palette.accent}
                  />
                </View>
              </View>
            </Pressable>

            {/* Phone */}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change phone number"
              onPress={() => openChangeContact("phone")}
              style={{
                padding: 16,
                borderRadius: 19,
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
                    width: 47,
                    height: 47,
                    borderRadius: 15,
                    backgroundColor: palette.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="call-outline"
                    size={22}
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
                    Phone number
                  </Text>

                  <Text
                    selectable
                    style={{
                      color: palette.text,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {customer.phone || "No phone number added"}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: customer.phone_verified
                      ? palette.successBackground
                      : palette.warningBackground,
                  }}
                >
                  <Text
                    style={{
                      color: customer.phone_verified
                        ? palette.successText
                        : palette.warningText,
                      fontSize: 10,
                      fontWeight: "900",
                    }}
                  >
                    {customer.phone_verified ? "VERIFIED" : "UNVERIFIED"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: palette.border,
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 12,
                  }}
                >
                  Used for SMS verification and sign-in
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: palette.accent,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    Change
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={palette.accent}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* Success feedback */}

        {notice ? (
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: palette.successBackground,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={palette.successText}
            />

            <Text
              style={{
                flex: 1,
                color: palette.successText,
                fontSize: 13,
                lineHeight: 19,
                fontWeight: "700",
              }}
            >
              {notice}
            </Text>
          </View>
        ) : null}

        {/* Security reminder */}

        <View
          style={{
            padding: 15,
            borderRadius: 16,
            backgroundColor: palette.accentSoft,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 11,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={21}
            color={palette.accent}
          />

          <Text
            style={{
              flex: 1,
              color: palette.text,
              fontSize: 12,
              lineHeight: 19,
            }}
          >
            Never share a verification code with anyone. SaMi will
            never ask you to disclose an OTP over a phone call or
            message. Only enter codes in the official app.
          </Text>
        </View>

        {/* Back to account */}

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

      {/* Contact change and OTP modal */}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeChangeContact}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: palette.overlay,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close contact change"
            onPress={closeChangeContact}
            style={{ flex: 1 }}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            <View
              style={{
                backgroundColor: palette.surface,
                borderTopLeftRadius: 27,
                borderTopRightRadius: 27,
                borderTopWidth: 1,
                borderColor: palette.border,
                paddingHorizontal: 21,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 22) + 8,
                gap: 17,
              }}
            >
              {/* Modal handle */}

              <View
                style={{
                  alignSelf: "center",
                  width: 42,
                  height: 4,
                  borderRadius: 5,
                  backgroundColor: palette.border,
                }}
              />

              {/* Modal heading */}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 47,
                    height: 47,
                    borderRadius: 15,
                    backgroundColor: palette.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={contactType === "email" ? "mail-outline" : "call-outline"}
                    size={22}
                    color={palette.accent}
                  />
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: palette.heading,
                      fontSize: 18,
                      fontWeight: "900",
                    }}
                  >
                    {codeRequested ? "Verify new contact" : modalTitle}
                  </Text>

                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {codeRequested
                      ? "Enter the code sent to your new contact."
                      : modalDescription}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  disabled={requestingCode || verifyingCode}
                  onPress={closeChangeContact}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: palette.surfaceRaised,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={palette.heading}
                  />
                </Pressable>
              </View>

              {/* Current contact */}

              {!codeRequested ? (
                <View
                  style={{
                    padding: 13,
                    borderRadius: 13,
                    backgroundColor: palette.surfaceRaised,
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 11,
                      fontWeight: "800",
                      letterSpacing: 0.5,
                    }}
                  >
                    CURRENT {contactType === "email" ? "EMAIL" : "PHONE"}
                  </Text>

                  <Text
                    style={{
                      color: palette.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {currentContact || "Not provided"}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    padding: 13,
                    borderRadius: 13,
                    backgroundColor: palette.accentSoft,
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: palette.accent,
                      fontSize: 11,
                      fontWeight: "900",
                      letterSpacing: 0.5,
                    }}
                  >
                    VERIFICATION SENT TO
                  </Text>

                  <Text
                    style={{
                      color: palette.heading,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {maskedDestination}
                  </Text>
                </View>
              )}

              {/* New contact input */}

              {!codeRequested ? (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: palette.heading,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    New {contactType === "email" ? "email address" : "phone number"}
                  </Text>

                  <View
                    style={{
                      minHeight: 54,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 14,
                      backgroundColor: palette.input,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      gap: 11,
                    }}
                  >
                    <Ionicons
                      name={contactType === "email" ? "mail-outline" : "call-outline"}
                      size={19}
                      color={palette.muted}
                    />

                    <TextInput
                      value={contactValue}
                      onChangeText={(value) => {
                        setContactValue(value);
                        setModalError("");
                      }}
                      placeholder={
                        contactType === "email"
                          ? "name@example.com"
                          : "+254712345678"
                      }
                      placeholderTextColor={palette.muted}
                      keyboardType={
                        contactType === "email"
                          ? "email-address"
                          : "phone-pad"
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      editable={!requestingCode}
                      returnKeyType="done"
                      selectionColor={palette.accent}
                      keyboardAppearance={isDark ? "dark" : "light"}
                      style={{
                        flex: 1,
                        color: palette.text,
                        fontSize: 14,
                        paddingVertical: 13,
                      }}
                    />
                  </View>

                  {contactType === "phone" ? (
                    <Text
                      style={{
                        color: palette.muted,
                        fontSize: 11,
                        lineHeight: 17,
                      }}
                    >
                      Include your country code. For Kenya, use +254
                      followed by your number without the leading zero.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: palette.heading,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    Six-digit verification code
                  </Text>

                  <TextInput
                    value={verificationCode}
                    onChangeText={(value) => {
                      setVerificationCode(
                        value.replace(/\D/g, "").slice(0, 6),
                      );
                      setModalError("");
                    }}
                    placeholder="000000"
                    placeholderTextColor={palette.muted}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                    editable={!verifyingCode}
                    returnKeyType="done"
                    selectionColor={palette.accent}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    textAlign="center"
                    style={{
                      minHeight: 60,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 14,
                      backgroundColor: palette.input,
                      color: palette.heading,
                      fontSize: 25,
                      fontWeight: "900",
                      letterSpacing: 9,
                    }}
                  />

                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 11,
                      lineHeight: 17,
                    }}
                  >
                    The code expires in approximately{" "}
                    {Math.max(1, Math.ceil(expiresInSeconds / 60))} minutes.
                  </Text>
                </View>
              )}

              {/* Modal feedback */}

              {modalError ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: palette.dangerBackground,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={palette.dangerText}
                  />

                  <Text
                    accessibilityRole="alert"
                    style={{
                      flex: 1,
                      color: palette.dangerText,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {modalError}
                  </Text>
                </View>
              ) : null}

              {modalNotice ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: palette.successBackground,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={palette.successText}
                  />

                  <Text
                    style={{
                      flex: 1,
                      color: palette.successText,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {modalNotice}
                  </Text>
                </View>
              ) : null}

              {/* Primary action */}

              <Pressable
                accessibilityRole="button"
                disabled={requestingCode || verifyingCode}
                onPress={() => {
                  if (codeRequested) {
                    void verifyContactChange();
                  } else {
                    void requestVerificationCode();
                  }
                }}
                style={{
                  minHeight: 53,
                  borderRadius: 15,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: requestingCode || verifyingCode ? 0.65 : 1,
                }}
              >
                {requestingCode || verifyingCode ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Ionicons
                    name={codeRequested ? "shield-checkmark-outline" : "send-outline"}
                    size={18}
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
                  {requestingCode
                    ? "Sending code..."
                    : verifyingCode
                      ? "Verifying..."
                      : codeRequested
                        ? "Verify and update"
                        : "Send verification code"}
                </Text>
              </Pressable>

              {/* Resend and change destination */}

              {codeRequested ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    disabled={requestingCode || verifyingCode}
                    onPress={() => {
                      setCodeRequested(false);
                      setVerificationCode("");
                      setChallengeId("");
                      setModalError("");
                      setModalNotice("");
                    }}
                  >
                    <Text
                      style={{
                        color: palette.muted,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      Change contact
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={requestingCode || verifyingCode}
                    onPress={() => void requestVerificationCode()}
                  >
                    <Text
                      style={{
                        color: palette.accent,
                        fontSize: 12,
                        fontWeight: "900",
                      }}
                    >
                      Resend code
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {!codeRequested ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={requestingCode}
                  onPress={closeChangeContact}
                  style={{ alignItems: "center", paddingVertical: 4 }}
                >
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
