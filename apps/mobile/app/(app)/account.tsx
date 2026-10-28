import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role: "customer" | "provider" | "admin";
};

function AccountAction({ icon, title, subtitle, onPress }: {
  icon: string; title: string; subtitle: string; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[common.card, {
      flexDirection: "row", alignItems: "center", padding: 15,
    }]}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.navy, fontSize: 20, fontWeight: "800" }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
      </View>
      <Text style={{ color: colors.blue, fontSize: 23, fontWeight: "800" }}>›</Text>
    </Pressable>
  );
}

export default function AccountScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

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
    try { await dispatchPost("logout"); } catch { /* The API client clears the local session after a logout request. */ }
    router.replace("/(auth)/login");
  }

  const roleLabel = user?.role === "provider" ? "Errand provider" : user?.role === "admin" ? "Administrator" : "Customer";

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={[common.content, { paddingTop: 22, paddingBottom: 28 }]} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>YOUR SAMI ACCOUNT</Text>
          <Text style={common.title}>Account</Text>
          <Text style={common.subtitle}>Your profile, settings and SaMi activity.</Text>
        </View>

        {busy ? <ActivityIndicator color={colors.blue} /> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}

        <View style={[common.card, { padding: 18, gap: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
            <View style={{ width: 56, height: 56, borderRadius: 19, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontSize: 24, fontWeight: "900" }}>
                {(user?.full_name.trim().charAt(0) || "S").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>{user?.full_name || "SaMi account"}</Text>
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

        <View style={{ gap: 11 }}>
          <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>Your SaMi</Text>
          <AccountAction icon="▤" title={user?.role === "provider" ? "My work" : "My errands"} subtitle={user?.role === "provider" ? "Review assignments and eligible errands." : "Track current requests and view your errand history."} onPress={() => router.push("/(app)/errands")} />
          <AccountAction icon="▱" title={user?.role === "provider" ? "Earnings" : "Payments"} subtitle={user?.role === "provider" ? "Review recorded service earnings and payment activity." : "View service-fee payments, transaction records and refunds."} onPress={() => router.push("/(app)/payments")} />
          <AccountAction icon="◉" title="Notifications" subtitle="See errand updates and important service notices." onPress={() => router.push("/(app)/notifications")} />
          {user?.role === "provider" ? <AccountAction icon="⚙" title="Provider profile" subtitle="Manage your service area, categories and introduction." onPress={() => router.push("/(app)/profile")} /> : null}
          {user?.role === "admin" ? <AccountAction icon="⌘" title="Operations control" subtitle="Provider approvals, dispatch and service issues." onPress={() => router.push("/(app)/operations")} /> : null}
        </View>

        <Pressable accessibilityRole="button" disabled={busy || signingOut} onPress={logout} style={{
          minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#E9C9C7",
          backgroundColor: "#FFF8F7", alignItems: "center", justifyContent: "center",
          opacity: signingOut ? 0.6 : 1,
        }}>
          {signingOut ? <ActivityIndicator color={colors.red} /> : <Text style={{ color: colors.red, fontSize: 14, fontWeight: "800" }}>Sign out</Text>}
        </Pressable>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }}>SaMi keeps seller payments separate from your service-fee records.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
