import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; role: "customer" | "provider" | "admin" };
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type Errand = {
  id: string; public_code: string; title: string; category: string; description?: string;
  status: string; customer_name?: string; provider_name?: string | null; provider_id?: string | null;
  service_fee_amount?: string | number | null; pickup_location?: string | null; destination_location?: string | null;
  service_payment_method?: string | null; payment_status?: string | null;
};

const readableStatus = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusColor = (status: string) => status === "completed" ? colors.blue : status === "disputed" ? colors.red : colors.blue;

export default function ErrandsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Errand[]>([]);
  const [busy, setBusy] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");

  const load = useCallback(async () => {
    setError(""); setNotice("");
    try {
      const result = await Promise.all([dispatchGet<{ user: User }>("me"), dispatchGet<{ errands: Errand[] }>("errands")]);
      setUser(result[0].user);
      setItems(result[1].errands || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load errands.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleItems = items.filter((item) => {
    if (filter === "completed") return item.status === "completed";
    if (filter === "cancelled") return item.status === "cancelled";
    if (filter === "active") return !["completed", "cancelled"].includes(item.status);
    return true;
  });

  async function accept(item: Errand) {
    setWorkingId(item.id); setError(""); setNotice("");
    try {
      await dispatchPost("errandAction", { id: item.id, errandAction: "accept" });
      router.push({ pathname: "/(app)/errand/[id]", params: { id: item.id } });
    } catch (e) { setError(e instanceof Error ? e.message : "The errand could not be accepted."); }
    finally { setWorkingId(""); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1 }}>
            <Ionicons name="chevron-back" size={21} color={colors.navy} />
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>{user?.role === "customer" ? "YOUR SAMI ACTIVITY" : user?.role === "provider" ? "PROVIDER WORKSPACE" : "SAMI OPERATIONS"}</Text>
            <Text style={common.title}>{user?.role === "customer" ? "Your errands" : user?.role === "provider" ? "Available & assigned errands" : "Errand queue"}</Text>
          </View>
        </View>
        {notice ? <Text style={{ color: colors.blue, backgroundColor: "#EAF1FC", borderRadius: 12, padding: 12 }}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 }}>Your activity</Text>
          <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 7, padding: 4, borderRadius: 15, backgroundColor: "#EEF2F8" }}>
            {([
              ["all", "All"],
              ["active", "Active"],
              ["completed", "Completed"],
              ["cancelled", "Cancelled"],
            ] as const).map(([value, label]) => {
              const selected = filter === value;
              return (
                <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setFilter(value)} style={{ flex: 1, minHeight: 38, paddingHorizontal: 5, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.white : "transparent", borderWidth: selected ? 1 : 0, borderColor: selected ? colors.border : "transparent" }}>
                  <Text numberOfLines={1} style={{ color: selected ? colors.navy : colors.muted, fontSize: 11, fontWeight: selected ? "900" : "700" }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{visibleItems.length} {visibleItems.length === 1 ? "errand" : "errands"}</Text>
        </View>
        {busy && items.length === 0 ? <ActivityIndicator color={colors.blue} /> : null}
        {!busy && visibleItems.length === 0 && !error ? (
          <View style={[common.card, { alignItems: "center", paddingVertical: 30 }]}>
            <Ionicons name={items.length === 0 ? "receipt-outline" : "filter-outline"} size={34} color={colors.blue} />
            <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "800" }}>{items.length === 0 ? "No errands yet" : "Nothing in this view"}</Text>
            <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 20 }}>{items.length === 0 ? (user?.role === "customer" ? "When you create an errand, you can follow its status and updates here." : "Available requests and assignments will appear here.") : "Try another filter to find the errand you are looking for."}</Text>
            {user?.role === "customer" ? <Pressable onPress={() => router.push("/(app)/request")} style={common.primaryButton}><Text style={common.primaryButtonText}>Request an errand</Text></Pressable> : null}
          </View>
        ) : null}
        {visibleItems.map((item) => {
          const openForProvider = user?.role === "provider" && !item.provider_id && item.status === "requested";
          return (
            <View key={item.id} style={common.card}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 }}>{item.public_code}</Text>
                  <Text style={{ color: colors.navy, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>{item.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{item.category.replaceAll("_", " ")}</Text>
                </View>
                <View style={[common.pill, { backgroundColor: item.status === "completed" ? "#EAF1FC" : item.status === "disputed" ? "#FDECEC" : colors.blueSoft }]}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: statusColor(item.status) }}>{readableStatus(item.status)}</Text>
                </View>
              </View>
              {item.pickup_location || item.destination_location ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>From: {item.pickup_location || "Not set"}{"\n"}To: {item.destination_location || "Not set"}</Text> : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "900" }}>KES {Number(item.service_fee_amount || 0).toLocaleString("en-KE")}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>SaMi service fee • goods paid separately</Text>
                </View>
                <Pressable onPress={() => router.push({ pathname: "/(app)/errand/[id]", params: { id: item.id } })} style={[common.secondaryButton, { minHeight: 42, paddingHorizontal: 12 }]}>
                  <Text style={common.secondaryButtonText}>Details</Text>
                </Pressable>
              </View>
              {openForProvider ? (
                <Pressable disabled={workingId === item.id} onPress={() => accept(item)} style={[common.primaryButton, workingId === item.id && { opacity: 0.65 }]}>
                  {workingId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Accept errand</Text>}
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {user?.role === "provider" ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Location updates are shared only for an assigned errand while it is accepted or in progress and this screen is active.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
