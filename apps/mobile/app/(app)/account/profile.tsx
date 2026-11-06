
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { apiRequest } from "@/api";

type CustomerProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: "customer";
  email_verified: boolean;
  phone_verified: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
};

type ProfileResponse = {
  profile: CustomerProfile;
};

type ProfileUpdateResponse = {
  ok: boolean;
  message: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
  };
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "S"
  );
}

export default function PersonalProfileScreen() {
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
    dangerBackground: isDark ? "#3E2026" : "#FFF0EF",
    dangerText: isDark ? "#FF9B94" : "#B42318",
    dangerBorder: isDark ? "#67343D" : "#F0D5D2",
    white: "#FFFFFF",
  };

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [originalName, setOriginalName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

      setProfile(result.profile);
      setFullName(result.profile.full_name || "");
      setOriginalName(result.profile.full_name || "");
      setAvatarFailed(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be loaded.",
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

  async function saveProfile() {
    const cleanName = fullName.trim().replace(/\s+/g, " ");

    if (cleanName.length < 2 || cleanName.length > 120) {
      setError("Your name must be between 2 and 120 characters.");
      setNotice("");
      return;
    }

    if (cleanName === originalName.trim()) {
      setNotice("There are no profile changes to save.");
      setError("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<ProfileUpdateResponse>(
        "/api/customer/profile",
        {
          method: "POST",
          body: {
            fullName: cleanName,
          },
        },
      );

      if (!result.ok || !result.user) {
        throw new Error("Your profile could not be updated.");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              ...result.user,
            }
          : current,
      );

      setFullName(result.user.full_name);
      setOriginalName(result.user.full_name);

      setNotice(
        result.message || "Your profile has been updated.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function chooseAvatar() {
    if (avatarBusy) return;

    setError("");
    setNotice("");
    setAvatarBusy(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo access required",
          "Allow SaMi to access your photos so you can choose a profile picture.",
        );
        return;
      }

      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.86,
      });

      if (selection.canceled || !selection.assets[0]) {
        return;
      }

      const asset = selection.assets[0];

      if (
        asset.fileSize &&
        asset.fileSize > 5 * 1024 * 1024
      ) {
        throw new Error("Choose an image smaller than 5 MB.");
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      if (
        asset.mimeType &&
        !allowedTypes.includes(asset.mimeType)
      ) {
        throw new Error(
          "Please choose a JPEG, PNG or WebP image.",
        );
      }

      const form = new FormData();
      const imageFile = new ExpoFile(asset.uri);

      form.append(
        "avatar",
        imageFile,
        asset.fileName || "sami-avatar.jpg",
      );

      const result = await apiRequest<{
        ok: boolean;
        message: string;
        avatar_url: string;
      }>("/api/customer/profile/avatar", {
        method: "POST",
        body: form,
      });

      if (!result.ok || !result.avatar_url) {
        throw new Error("Your profile photo could not be uploaded.");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              avatar_url: result.avatar_url,
            }
          : current,
      );

      setAvatarFailed(false);
      setNotice(
        result.message || "Your profile photo has been updated.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile photo could not be uploaded.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (avatarBusy || !profile?.avatar_url) return;

    setAvatarBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{
        ok: boolean;
        message: string;
      }>("/api/customer/profile/avatar", {
        method: "DELETE",
      });

      if (!result.ok) {
        throw new Error("Your profile photo could not be removed.");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              avatar_url: null,
            }
          : current,
      );

      setAvatarFailed(false);
      setNotice(
        result.message || "Your profile photo has been removed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile photo could not be removed.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  function confirmRemoveAvatar() {
    Alert.alert(
      "Remove profile photo?",
      "Your account will return to the default initials image.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove photo",
          style: "destructive",
          onPress: () => {
            void removeAvatar();
          },
        },
      ],
    );
  }

  const cleanName = fullName.trim().replace(/\s+/g, " ");
  const hasChanges = cleanName !== originalName.trim();
  const displayName = fullName.trim() || "Your profile";
  const showAvatar = Boolean(profile?.avatar_url) && !avatarFailed;

  function VerificationStatus({ verified }: { verified: boolean }) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 9,
          paddingVertical: 6,
          borderRadius: 20,
          backgroundColor: verified
            ? palette.successBackground
            : palette.surfaceRaised,
        }}
      >
        <Ionicons
          name={verified ? "checkmark-circle" : "time-outline"}
          size={13}
          color={verified ? palette.successText : palette.muted}
        />

        <Text
          style={{
            color: verified ? palette.successText : palette.muted,
            fontSize: 10,
            fontWeight: "900",
          }}
        >
          {verified ? "VERIFIED" : "NOT VERIFIED"}
        </Text>
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
            padding: 20,
            paddingBottom: Math.max(insets.bottom, 28) + 20,
            gap: 20,
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
                YOUR ACCOUNT
              </Text>

              <Text
                style={{
                  color: palette.heading,
                  fontSize: 23,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                }}
              >
                Personal profile
              </Text>
            </View>
          </View>

          {/* Loading state */}

          {loading ? (
            <View
              style={{
                paddingVertical: 72,
                alignItems: "center",
                gap: 13,
              }}
            >
              <ActivityIndicator
                size="large"
                color={palette.accent}
              />

              <Text
                style={{
                  color: palette.muted,
                  fontSize: 13,
                }}
              >
                Loading your profile...
              </Text>
            </View>
          ) : null}

          {/* Profile content */}

          {!loading && profile ? (
            <>
              {/* Profile identity and photo */}

              <View
                style={{
                  padding: 20,
                  borderRadius: 22,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 56,
                    backgroundColor: palette.accentSoft,
                    borderWidth: 3,
                    borderColor: palette.border,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {showAvatar ? (
                    <Image
                      key={profile.avatar_url}
                      source={{ uri: profile.avatar_url! }}
                      resizeMode="cover"
                      onError={() => setAvatarFailed(true)}
                      style={{
                        width: 112,
                        height: 112,
                      }}
                    />
                  ) : (
                    <Text
                      style={{
                        color: palette.accent,
                        fontSize: 36,
                        fontWeight: "900",
                      }}
                    >
                      {initials(displayName)}
                    </Text>
                  )}

                  {avatarBusy ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "rgba(0,0,0,0.48)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ActivityIndicator
                        color={palette.white}
                        size="large"
                      />
                    </View>
                  ) : null}
                </View>

                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text
                    style={{
                      color: palette.heading,
                      fontSize: 18,
                      fontWeight: "900",
                    }}
                  >
                    {displayName}
                  </Text>

                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 12,
                    }}
                  >
                    SaMi customer account
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 9,
                    width: "100%",
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    disabled={avatarBusy}
                    onPress={() => void chooseAvatar()}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderRadius: 14,
                      backgroundColor: palette.accent,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      paddingHorizontal: 9,
                      opacity: avatarBusy ? 0.55 : 1,
                    }}
                  >
                    {avatarBusy ? (
                      <ActivityIndicator color={palette.white} />
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={18}
                        color={palette.white}
                      />
                    )}

                    <Text
                      style={{
                        color: palette.white,
                        fontSize: 12,
                        fontWeight: "900",
                      }}
                    >
                      {avatarBusy ? "Please wait" : "Change photo"}
                    </Text>
                  </Pressable>

                  {profile.avatar_url ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={avatarBusy}
                      onPress={confirmRemoveAvatar}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        borderRadius: 14,
                        backgroundColor: palette.dangerBackground,
                        borderWidth: 1,
                        borderColor: palette.dangerBorder,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingHorizontal: 9,
                        opacity: avatarBusy ? 0.55 : 1,
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={palette.dangerText}
                      />

                      <Text
                        style={{
                          color: palette.dangerText,
                          fontSize: 12,
                          fontWeight: "900",
                        }}
                      >
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 11,
                    lineHeight: 17,
                    textAlign: "center",
                  }}
                >
                  JPEG, PNG or WebP. Maximum 5 MB. Your profile photo
                  is stored privately.
                </Text>
              </View>

              {/* Personal information */}

              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 1.2,
                  }}
                >
                  PROFILE DETAILS
                </Text>

                <Text
                  style={{
                    color: palette.heading,
                    fontSize: 19,
                    fontWeight: "900",
                  }}
                >
                  Your personal information
                </Text>

                <Text
                  style={{
                    color: palette.muted,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  Keep your name and contact information accurate so
                  SaMi can identify and reach you.
                </Text>
              </View>

              <View
                style={{
                  padding: 17,
                  borderRadius: 20,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                  gap: 17,
                }}
              >
                {/* Full name */}

                <View style={{ gap: 7 }}>
                  <Text
                    style={{
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    FULL NAME
                  </Text>

                  <TextInput
                    value={fullName}
                    onChangeText={(value) => {
                      setFullName(value);
                      setError("");
                      setNotice("");
                    }}
                    placeholder="Enter your full name"
                    placeholderTextColor={palette.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={120}
                    returnKeyType="done"
                    selectionColor={palette.accent}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    editable={!saving}
                    style={{
                      minHeight: 52,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 13,
                      backgroundColor: palette.input,
                      paddingHorizontal: 14,
                      color: palette.text,
                      fontSize: 14,
                    }}
                  />

                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 11,
                    }}
                  >
                    Use the name you want displayed on your account.
                  </Text>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: palette.border,
                  }}
                />

                {/* Email */}

                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: palette.text,
                        fontSize: 12,
                        fontWeight: "900",
                      }}
                    >
                      EMAIL ADDRESS
                    </Text>

                    <VerificationStatus verified={profile.email_verified} />
                  </View>

                  <View
                    style={{
                      minHeight: 51,
                      paddingHorizontal: 13,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 13,
                      backgroundColor: palette.surfaceRaised,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={palette.muted}
                    />

                    <Text
                      selectable
                      style={{
                        flex: 1,
                        color: palette.text,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {profile.email || "Not available"}
                    </Text>

                    <Ionicons
                      name="lock-closed-outline"
                      size={15}
                      color={palette.muted}
                    />
                  </View>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: palette.border,
                  }}
                />

                {/* Phone */}

                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: palette.text,
                        fontSize: 12,
                        fontWeight: "900",
                      }}
                    >
                      PHONE NUMBER
                    </Text>

                    <VerificationStatus verified={profile.phone_verified} />
                  </View>

                  <View
                    style={{
                      minHeight: 51,
                      paddingHorizontal: 13,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 13,
                      backgroundColor: palette.surfaceRaised,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons
                      name="call-outline"
                      size={18}
                      color={palette.muted}
                    />

                    <Text
                      selectable
                      style={{
                        flex: 1,
                        color: palette.text,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {profile.phone || "Not added"}
                    </Text>

                    <Ionicons
                      name="lock-closed-outline"
                      size={15}
                      color={palette.muted}
                    />
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push("/(app)/account/sign-in" as never)
                  }
                  style={{
                    minHeight: 48,
                    borderRadius: 13,
                    backgroundColor: palette.accentSoft,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingHorizontal: 12,
                  }}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={palette.accent}
                  />

                  <Text
                    style={{
                      color: palette.accent,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    Manage email and phone
                  </Text>

                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={palette.accent}
                  />
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
                    alignItems: "center",
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
                      lineHeight: 18,
                      fontWeight: "700",
                    }}
                  >
                    {notice}
                  </Text>
                </View>
              ) : null}

              {/* Save name */}

              <Pressable
                accessibilityRole="button"
                disabled={saving || avatarBusy || !hasChanges}
                onPress={() => void saveProfile()}
                style={{
                  minHeight: 53,
                  borderRadius: 15,
                  backgroundColor: palette.accent,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  opacity: saving || avatarBusy || !hasChanges ? 0.5 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Ionicons
                    name="save-outline"
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
                  {saving ? "Saving profile..." : "Save profile changes"}
                </Text>
              </Pressable>

              {/* Refresh */}

              <Pressable
                accessibilityRole="button"
                onPress={() => void loadProfile()}
                disabled={saving || avatarBusy}
                style={{
                  alignItems: "center",
                  paddingVertical: 8,
                  opacity: saving || avatarBusy ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    color: palette.accent,
                    fontSize: 12,
                    fontWeight: "900",
                  }}
                >
                  Refresh profile
                </Text>
              </Pressable>
            </>
          ) : null}

          {/* Error state */}

          {!loading && !profile ? (
            <View
              style={{
                padding: 18,
                borderRadius: 18,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                gap: 13,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={27}
                color={palette.dangerText}
              />

              <Text
                style={{
                  color: palette.heading,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                Your profile could not be displayed
              </Text>

              <Text
                accessibilityRole="alert"
                style={{
                  color: palette.muted,
                  fontSize: 13,
                  lineHeight: 20,
                }}
              >
                {error || "Please try loading your profile again."}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => void loadProfile()}
                style={{
                  minHeight: 48,
                  borderRadius: 13,
                  backgroundColor: palette.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: palette.white,
                    fontSize: 13,
                    fontWeight: "900",
                  }}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
