import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; full_name: string; email: string; role: "customer" | "provider" | "admin"; phone: string | null };
type Metrics = { total?: number; active?: number; completed?: number; disputes?: number };

function ActionCard({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[common.card, { flexDirection: "row", alignItems: "center", padding: 18 }]}>
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 23 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{body}</Text>
      </View>
      <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "800" }}>›</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const results = await Promise.all([dispatchGet<{ user: User }>("me"), dispatchGet<{ metrics: Metrics }>("dashboard")]);
      setUser(results[0].user);
      setMetrics(results[1].metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your SaMi workspace.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    try { await dispatchPost("logout"); } catch { /* The local token is removed by the API client after logout requests. */ }
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.blue, fontWeight: "900", fontSize: 15, letterSpacing: 1.2 }}>SaMi</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Everyday help, organised.</Text>
          </View>
          <Pressable onPress={logout} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }}>
            <Text style={{ color: colors.navy, fontWeight: "700", fontSize: 13 }}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: 22, gap: 10 }}>
          <Text style={{ color: "#BFD0FF", fontWeight: "800", fontSize: 12, letterSpacing: 1.1 }}>YOUR EVERYDAY HELPER</Text>
          <Text style={{ color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: "900" }}>What needs doing today?</Text>
          <Text style={{ color: "#D8E0F4", fontSize: 14, lineHeight: 21 }}>Shopping, collections, appointments and everyday tasks—handled with clear service fees and accountable updates.</Text>
          <Pressable onPress={() => router.push("/(app)/request")} style={[common.primaryButton, { backgroundColor: "#FFFFFF", marginTop: 4 }]}>
            <Text style={{ color: colors.navy, fontWeight: "900", fontSize: 15 }}>+ Request an errand</Text>
          </Pressable>
        </View>

        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy && !user ? <ActivityIndicator color={colors.blue} /> : null}
        {user ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.navy, fontSize: 20, fontWeight: "800" }}>Welcome, {user.full_name.split(" ")[0]}.</Text>
            <Text style={common.subtitle}>{user.role === "provider" ? "Your provider workspace" : user.role === "admin" ? "Your operations workspace" : "Your requests and updates in one place."}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            { label: "Total", value: metrics?.total },
            { label: "Active", value: metrics?.active },
            { label: "Completed", value: metrics?.completed },
          ].map((item) => (
            <View key={item.label} style={[common.card, { flex: 1, padding: 14, gap: 5 }]}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{item.label}</Text>
              <Text style={{ color: colors.navy, fontSize: 24, fontWeight: "900" }}>{item.value ?? "—"}</Text>
            </View>
          ))}
        </View>

        <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "800", marginTop: 2 }}>Your SaMi</Text>
        <ActionCard icon="↗" title="My errands" body="Review requests, assignments and progress." onPress={() => router.push("/(app)/errands")} />
        <ActionCard icon="＋" title="Request a task" body="Set the details, pick locations and review the service fee." onPress={() => router.push("/(app)/request")} />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>Seller or goods costs are tracked separately from SaMi's service fee.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
