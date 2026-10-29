import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { dispatchGet } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; role: "customer" | "provider" | "admin" };
type Errand = {
  id: string;
  public_code: string;
  title: string;
  status: string;
  provider_id?: string | null;
  provider_name?: string | null;
  customer_name?: string | null;
  updated_at?: string;
};

const readableStatus = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function MessagesScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Errand[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [me, result] = await Promise.all([
        dispatchGet<{ user: User }>("me"),
        dispatchGet<{ errands: Errand[] }>("errands"),
      ]);
      setUser(me.user);
      setItems((result.errands || []).filter((item) => Boolean(item.provider_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Messages could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}>
        <View style={{ gap: 5 }}>
          <Text style={common.eyebrow}>STAY IN THE LOOP</Text>
          <Text style={common.title}>Messages</Text>
          <Text style={common.subtitle}>Keep every errand conversation connected to its request. Open an errand to message or call the other person.</Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy && items.length === 0 ? <ActivityIndicator color={colors.blue} size="large" /> : null}
        {!busy && !error && items.length === 0 ? (
          <View style={[common.card, { alignItems: "center", padding: 24, gap: 10 }]}>
            <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="chatbubbles-outline" size={28} color={colors.blue} />
            </View>
            <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "900" }}>Your conversations will appear here</Text>
            <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 20 }}>Once an errand has an assigned worker, you can message and call them from its details.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(user?.role === "customer" ? "/(app)/request" : "/(app)/errands")} style={common.primaryButton}>
              <Text style={common.primaryButtonText}>{user?.role === "customer" ? "Create an errand" : "View errands"}</Text>
            </Pressable>
          </View>
        ) : null}
        {items.map((item) => {
          const otherPerson = user?.role === "provider" ? item.customer_name || "Customer" : item.provider_name || "Your errand worker";
          return (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={"Open conversation for " + item.title} onPress={() => router.push({ pathname: "/(app)/errand/[id]", params: { id: item.id } })} style={[common.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 17, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="chatbubble-ellipses-outline" size={23} color={colors.blue} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>{otherPerson}</Text>
                <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13 }}>{item.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{item.public_code} · {readableStatus(item.status)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
