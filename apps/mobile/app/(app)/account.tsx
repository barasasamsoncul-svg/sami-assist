import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type User = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: "customer" | "provider" | "admin";
};

function AccountAction({ icon, title, subtitle, onPress }: {
  icon: IoniconName; title: string; subtitle: string; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[common.card, {
      flexDirection: "row", alignItems: "center", padding: 15,
    }]}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={21} color={colors.navy} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.blue} />
    </Pressable>
  );
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 3 }}>
      <Text style={common.eyebrow}>{eyebrow}</Text>
      <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "900", letterSpacing: -0.3 }}>{title}</Text>
      {body ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{body}</Text> : null}
    </View>
  );
}

export default function AccountScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    dispatchGet<{ user: User }>("me")
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Your account could not be loaded."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setSigningOut(true);
    setError("");
    try { await dispatchPost("logout"); } catch { /* The API client clears the local session after logout requests. */ }
    router.replace("/(auth)/login");
  }

  async function changePassword() {
    setChangingPassword(true);
    setError("");
    setNotice("");
    try {
      const result = await dispatchPost<{ message: string }>("changePassword", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNotice(result.message || "Your password has been updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your password could not be updated.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const data = await dispatchGet<Record<string, unknown>>("exportMyData");
      const root = FileSystem.documentDirectory;
      if (!root) throw new Error("SaMi could not access local storage for the export file.");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileUri = root + "sami-data-export-" + stamp + ".json";
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) throw new Error("The phone does not have a compatible app for sharing the export file.");
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Export your SaMi data",
        UTI: "public.json",
      });
      setNotice("Your data export file is ready to save or share.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your data export could not be prepared.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const result = await dispatchPost<{ message: string }>("deleteAccount", {
        password: deletePassword,
        confirmation: deleteConfirmation,
      });
      await dispatchPost("logout").catch(() => undefined);
      Alert.alert(
        "Account deletion completed",
        result.message || "Your account was deactivated and personal profile details removed.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your account could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  const displayName = typeof user?.full_name === "string" ? user.full_name.trim() : "";
  const roleLabel = user?.role === "provider" ? "Errand provider" : user?.role === "admin" ? "Administrator" : "Customer";
  const isCustomer = user?.role === "customer";
  const requestedSection = Array.isArray(params.section) ? params.section[0] : params.section;

  useEffect(() => {
    if (!requestedSection || sectionOffsets[requestedSection] === undefined) return;
    const offset = sectionOffsets[requestedSection];
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, offset - 12), animated: true }));
  }, [requestedSection, sectionOffsets]);

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={[common.content, { paddingTop: 22, paddingBottom: 30 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>{isCustomer ? "PERSONAL ACCOUNT" : "YOUR SAMI ACCOUNT"}</Text>
          <Text style={common.title}>Account</Text>
          <Text style={common.subtitle}>{isCustomer ? "Manage your sign-in security and personal information." : "Your profile and account."}</Text>
        </View>

        {busy ? <ActivityIndicator color={colors.blue} /> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12, lineHeight: 19 }}>{notice}</Text> : null}

        <View style={[common.card, { padding: 18, gap: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
            <View style={{ width: 56, height: 56, borderRadius: 19, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontSize: 24, fontWeight: "900" }}>
                {(displayName.charAt(0) || "S").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>{displayName || "SaMi account"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{roleLabel}</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <View style={{ gap: 5 }}>
            <Text style={common.label}>Email</Text>
            <Text style={{ color: colors.ink, fontSize: 14 }}>{user?.email || "Not provided"}</Text>
          </View>
          <View style={{ gap: 5 }}>
            <Text style={common.label}>Phone</Text>
            <Text style={{ color: colors.ink, fontSize: 14 }}>{user?.phone || "Not provided"}</Text>
          </View>
        </View>

        {isCustomer ? (
          <>
            <View onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              setSectionOffsets((old) => old.security === y ? old : { ...old, security: y });
            }} style={{ gap: 13 }}>
              <SectionTitle eyebrow="SECURITY" title="Account security" body="Change your password. Other active sessions are signed out after a successful change." />
              <View style={[common.card, { gap: 12 }]}>
                <View style={{ gap: 6 }}>
                  <Text style={common.label}>Current password</Text>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Enter current password"
                    placeholderTextColor="#929BAD"
                    style={common.input}
                    textContentType="password"
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={common.label}>New password</Text>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="At least 12 characters"
                    placeholderTextColor="#929BAD"
                    style={common.input}
                    textContentType="newPassword"
                  />
                  <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>Use a unique password you do not use for another service.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={changingPassword || !currentPassword || newPassword.length < 12}
                  onPress={changePassword}
                  style={[common.primaryButton, (changingPassword || !currentPassword || newPassword.length < 12) && { opacity: 0.55 }]}
                >
                  {changingPassword ? <ActivityIndicator color={colors.white} /> : <Text style={common.primaryButtonText}>Update password</Text>}
                </Pressable>
              </View>
            </View>

            <View onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              setSectionOffsets((old) => old.privacy === y ? old : { ...old, privacy: y });
            }} style={{ gap: 13 }}>
              <SectionTitle eyebrow="YOUR INFORMATION" title="Data & privacy" body="You can request a copy of your SaMi data or remove your account and personal details." />
              <View style={[common.card, { gap: 12 }]}>
                <View style={{ gap: 5 }}>
                  <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>Export your data</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Prepare a JSON file containing your profile, errands, payment records, notifications, messages and ratings, then save or share it.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={exporting}
                  onPress={exportData}
                  style={[common.secondaryButton, { flexDirection: "row", gap: 8, opacity: exporting ? 0.6 : 1 }]}
                >
                  {exporting ? <ActivityIndicator color={colors.blue} /> : <Ionicons name="download-outline" size={19} color={colors.navy} />}
                  {!exporting ? <Text style={common.secondaryButtonText}>Export my data</Text> : null}
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 13 }}>
              <SectionTitle eyebrow="IRREVERSIBLE ACTION" title="Delete account" body="Open errands must be completed or cancelled first. Financial and audit records may be retained where required for reconciliation or legal obligations." />
              <View style={[common.card, { borderColor: "#F0D5D2", gap: 12 }]}>
                <View style={{ gap: 5 }}>
                  <Text style={{ color: colors.red, fontSize: 15, fontWeight: "900" }}>Remove my account</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>SaMi deactivates your account and redacts personal profile details and closed-errand descriptions/locations. This cannot be undone from the app.</Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={common.label}>Current password</Text>
                  <TextInput
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Confirm with your password"
                    placeholderTextColor="#929BAD"
                    style={common.input}
                    textContentType="password"
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={common.label}>Type DELETE to confirm</Text>
                  <TextInput
                    value={deleteConfirmation}
                    onChangeText={setDeleteConfirmation}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="DELETE"
                    placeholderTextColor="#929BAD"
                    style={[common.input, { borderColor: deleteConfirmation === "DELETE" ? colors.red : colors.border }]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={deleting || !deletePassword || deleteConfirmation !== "DELETE"}
                  onPress={() => Alert.alert(
                    "Delete your SaMi account?",
                    "This will deactivate your account and remove personal information from eligible records. Open errands must be resolved first.",
                    [{ text: "Keep account", style: "cancel" }, { text: "Delete account", style: "destructive", onPress: () => { void deleteAccount(); } }],
                  )}
                  style={[{ minHeight: 50, borderRadius: 14, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, (deleting || !deletePassword || deleteConfirmation !== "DELETE") && { opacity: 0.5 }]}
                >
                  {deleting ? <ActivityIndicator color={colors.white} /> : <Text style={{ color: colors.white, fontSize: 14, fontWeight: "900" }}>Delete my account</Text>}
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={{ gap: 11 }}>
            <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>Your SaMi</Text>
            <AccountAction icon="receipt-outline" title={user?.role === "provider" ? "My work" : "Errands"} subtitle={user?.role === "provider" ? "Review assignments and eligible errands." : "Review errand operations."} onPress={() => router.push("/(app)/errands")} />
            <AccountAction icon="wallet-outline" title={user?.role === "provider" ? "Earnings" : "Payments"} subtitle={user?.role === "provider" ? "Review recorded service earnings and payment activity." : "Review service payments and refunds."} onPress={() => router.push("/(app)/payments")} />
            <AccountAction icon="notifications-outline" title="Notifications" subtitle="See errand updates and important service notices." onPress={() => router.push("/(app)/notifications")} />
            {user?.role === "provider" ? <AccountAction icon="person-circle-outline" title="Provider profile" subtitle="Manage your service area, categories and introduction." onPress={() => router.push("/(app)/profile")} /> : null}
            {user?.role === "admin" ? <AccountAction icon="settings-outline" title="Operations control" subtitle="Provider approvals, assignments and service issues." onPress={() => router.push("/(app)/operations")} /> : null}
          </View>
        )}

        <Pressable accessibilityRole="button" disabled={busy || signingOut} onPress={logout} style={{
          minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#E9C9C7",
          backgroundColor: "#FFF8F7", alignItems: "center", justifyContent: "center",
          opacity: signingOut ? 0.6 : 1,
        }}>
          {signingOut ? <ActivityIndicator color={colors.red} /> : <Text style={{ color: colors.red, fontSize: 14, fontWeight: "800" }}>Sign out</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Keep a route-level rendering error from leaving the Account tab completely blank.
 * Expo Router can retry the screen without forcing the user to reinstall SaMi.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={common.screen}>
      <View style={[common.content, { flex: 1, justifyContent: "center", gap: 14, padding: 24 }]}>
        <Text style={common.eyebrow}>SAMI ACCOUNT</Text>
        <Text style={common.title}>Account couldn't open</Text>
        <Text style={common.subtitle}>
          SaMi encountered a problem while opening this screen. Your account and errands have not been deleted.
        </Text>
        {__DEV__ ? (
          <Text selectable style={{ color: colors.red, fontSize: 12, lineHeight: 18 }}>
            {error.name}: {error.message}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={common.primaryButton}
        >
          <Text style={common.primaryButtonText}>Try again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(app)")}
          style={common.secondaryButton}
        >
          <Text style={common.secondaryButtonText}>Back to home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

