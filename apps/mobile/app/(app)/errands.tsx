import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { apiRequest, dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; role: "customer" | "provider" | "admin" };
type Errand = {
  id: string; public_code: string; title: string; category: string; description?: string;
  status: string; customer_name?: string; provider_name?: string | null; provider_id?: string | null;
  service_fee_amount?: string | number | null; pickup_location?: string | null; destination_location?: string | null;
  service_payment_method?: string | null; payment_status?: string | null;
};

const readableStatus = (status: string) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusColor = (status: string) => status === "completed" ? colors.green : status === "disputed" ? colors.red : colors.blue;

export default function ErrandsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Errand[]>([]);
  const [busy, setBusy] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  useEffect(() => {
    if (user?.role !== "provider") return;
    const active = items.find((item) => ["accepted", "in_progress"].includes(item.status) && item.provider_id === user.id);
    if (!active) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 10 },
        (position) => {
          dispatchPost("updateProviderLocation", {
            id: active.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            headingDegrees: position.coords.heading,
            speedMetersPerSecond: position.coords.speed,
          }).catch(() => undefined);
        },
      );
    })().catch(() => undefined);
    return () => { cancelled = true; subscription?.remove(); };
  }, [user, items]);

  async function accept(item: Errand) {
    setWorkingId(item.id); setError(""); setNotice("");
    try {
      await dispatchPost("errandAction", { id: item.id, errandAction: "accept" });
      setNotice("You accepted " + item.public_code + ". Keep location sharing enabled while the errand is active.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "The errand could not be accepted."); }
    finally { setWorkingId(""); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderColor: colors.border, borderWidth: 1 }}>
            <Text style={{ color: colors.navy, fontSize: 23 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>SaMi workspace</Text>
            <Text style={common.title}>My errands</Text>
          </View>
        </View>
        {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12 }}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy && items.length === 0 ? <ActivityIndicator color={colors.blue} /> : null}
        {!busy && items.length === 0 && !error ? (
          <View style={[common.card, { alignItems: "center", paddingVertical: 30 }]}>
            <Text style={{ fontSize: 32 }}>✦</Text>
            <Text style={{ color: colors.navy, fontSize: 18, fontWeight: "800" }}>No errands yet</Text>
            <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 20 }}>Your requests or available assignments will appear here.</Text>
            {user?.role === "customer" ? <Pressable onPress={() => router.push("/(app)/request")} style={common.primaryButton}><Text style={common.primaryButtonText}>Request an errand</Text></Pressable> : null}
          </View>
        ) : null}
        {items.map((item) => {
          const openForProvider = user?.role === "provider" && !item.provider_id && item.status === "requested";
          return (
            <View key={item.id} style={common.card}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 }}>{item.public_code}</Text>
                  <Text style={{ color: colors.navy, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>{item.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{item.category.replaceAll("_", " ")}</Text>
                </View>
                <View style={[common.pill, { backgroundColor: item.status === "completed" ? "#E5F6EE" : item.status === "disputed" ? "#FDECEC" : colors.blueSoft }]}>
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
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Provider GPS updates are sent only for an assigned errand in accepted or in-progress status while this screen is active.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
