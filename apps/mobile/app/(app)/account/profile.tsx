
import { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { apiRequest } from "@/api";
import { colors, common } from "@/theme";

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
    setNotice("");

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

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function saveProfile() {
    const cleanName = fullName.trim().replace(/\s+/g, " ");

    if (cleanName.length < 2 || cleanName.length > 120) {
      setError("Your name must be between 2 and 120 characters.");
      return;
    }

    if (cleanName === originalName.trim()) {
      setNotice("There are no changes to save.");
      setError("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest<{
        ok: boolean;
        message: string;
        user: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
        };
      }>("/api/customer/profile", {
        method: "POST",
        body: {
          fullName: cleanName,
        },
      });

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

      const selection =
        await ImagePicker.launchImageLibraryAsync({
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

  const hasChanges =
    cleanName !== originalName.trim();

  const displayName =
    fullName.trim() || "Your profile";

  const showAvatar =
    Boolean(profile?.avatar_url) && !avatarFailed;

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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 48,
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
                YOUR ACCOUNT
              </Text>

              <Text
                style={{
                  color: colors.navy,
                  fontSize: 23,
                  fontWeight: "900",
                }}
              >
                Personal profile
              </Text>
            </View>
          </View>

          {loading ? (
            <View
              style={{
                paddingVertical: 70,
                alignItems: "center",
                gap: 12,
              }}
            >
              <ActivityIndicator
                size="large"
                color={colors.blue}
              />

              <Text style={common.subtitle}>
                Loading your profile...
              </Text>
            </View>
          ) : profile ? (
            <>
              {/* Profile photograph */}

              <View
                style={[
                  common.card,
                  {
                    alignItems: "center",
                    paddingVertical: 25,
                    gap: 12,
                  },
                ]}
              >
                <View
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: 52,
                    backgroundColor: colors.blueSoft,
                    borderWidth: 3,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {showAvatar ? (
                    <Image
                      key={profile.avatar_url}
                      source={{
                        uri: profile.avatar_url!,
                      }}
                      resizeMode="cover"
                      onError={() => setAvatarFailed(true)}
                      style={{
                        width: 104,
                        height: 104,
                      }}
                    />
                  ) : (
                    <Text
                      style={{
                        color: colors.navy,
                        fontSize: 34,
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
                        backgroundColor: "rgba(0,0,0,0.45)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ActivityIndicator
                        color={colors.white}
                        size="large"
                      />
                    </View>
                  ) : null}
                </View>

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
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    textAlign: "center",
                  }}
                >
                  Your SaMi customer account
                </Text>

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
                    style={[
                      common.primaryButton,
                      {
                        flex: 1,
                        flexDirection: "row",
                        gap: 7,
                        opacity: avatarBusy ? 0.55 : 1,
                      },
                    ]}
                  >
                    {avatarBusy ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={18}
                        color={colors.white}
                      />
                    )}

                    <Text style={common.primaryButtonText}>
                      {avatarBusy ? "Please wait" : "Change photo"}
                    </Text>
                  </Pressable>

                  {profile.avatar_url ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={avatarBusy}
                      onPress={confirmRemoveAvatar}
                      style={[
                        common.secondaryButton,
                        {
                          flex: 1,
                          borderWidth: 1,
                          borderColor: "#F0D5D2",
                          opacity: avatarBusy ? 0.55 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: colors.red,
                          fontSize: 13,
                          fontWeight: "800",
                        }}
                      >
                        Remove photo
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    lineHeight: 17,
                    textAlign: "center",
                  }}
                >
                  JPEG, PNG or WebP. Maximum 5 MB.
                  Your photo is stored privately.
                </Text>
              </View>

              {/* Profile details */}

              <View style={{ gap: 7 }}>
                <Text style={common.eyebrow}>
                  PROFILE DETAILS
                </Text>

                <Text
                  style={{
                    color: colors.navy,
                    fontSize: 18,
                    fontWeight: "900",
                  }}
                >
                  Your personal information
                </Text>

                <Text style={common.subtitle}>
                  Keep your details accurate so SaMi can identify
                  your account correctly.
                </Text>
              </View>

              <View style={common.card}>
                <View>
                  <Text style={common.label}>
                    Full name
                  </Text>

                  <TextInput
                    value={fullName}
                    onChangeText={(value) => {
                      setFullName(value);
                      setError("");
                      setNotice("");
                    }}
                    placeholder="Enter your full name"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={120}
                    returnKeyType="done"
                    style={common.input}
                  />
                </View>

                <View>
                  <Text style={common.label}>
                    Email address
                  </Text>

                  <View
                    style={{
                      minHeight: 50,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 13,
                      backgroundColor: "#F0F3F8",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={colors.muted}
                    />

                    <Text
                      style={{
                        flex: 1,
                        color: colors.ink,
                        fontSize: 14,
                      }}
                    >
                      {profile.email || "Not available"}
                    </Text>

                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={colors.muted}
                    />
                  </View>
                </View>

                <View>
                  <Text style={common.label}>
                    Phone number
                  </Text>

                  <View
                    style={{
                      minHeight: 50,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 13,
                      backgroundColor: "#F0F3F8",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons
                      name="call-outline"
                      size={18}
                      color={colors.muted}
                    />

                    <Text
                      style={{
                        flex: 1,
                        color: colors.ink,
                        fontSize: 14,
                      }}
                    >
                      {profile.phone || "Not added"}
                    </Text>

                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={colors.muted}
                    />
                  </View>
                </View>

                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  Email and phone changes are managed separately
                  through Sign-in & Verification.
                </Text>
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
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.blueSoft,
                  }}
                >
                  <Text
                    style={{
                      color: colors.navy,
                      fontSize: 13,
                      lineHeight: 19,
                      fontWeight: "600",
                    }}
                  >
                    {notice}
                  </Text>
                </View>
              ) : null}

              {/* Save profile */}

              <Pressable
                accessibilityRole="button"
                disabled={saving || !hasChanges}
                onPress={() => void saveProfile()}
                style={[
                  common.primaryButton,
                  {
                    flexDirection: "row",
                    gap: 9,
                    opacity: saving || !hasChanges ? 0.55 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Ionicons
                    name="save-outline"
                    size={19}
                    color={colors.white}
                  />
                )}

                <Text style={common.primaryButtonText}>
                  {saving ? "Saving profile..." : "Save changes"}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={{ gap: 14 }}>
              <Text style={common.error}>
                Your profile could not be displayed.
              </Text>

              <Pressable
                onPress={() => void loadProfile()}
                style={common.primaryButton}
              >
                <Text style={common.primaryButtonText}>
                  Try again
                </Text>
              </Pressable>
            </View>
          )}

          {!loading && profile ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadProfile()}
              disabled={saving || avatarBusy}
              style={{
                alignItems: "center",
                padding: 8,
              }}
            >
              <Text
                style={{
                  color: colors.blue,
                  fontSize: 13,
                  fontWeight: "800",
                }}
              >
                Refresh profile
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
