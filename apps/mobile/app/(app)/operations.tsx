import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; role: "customer" | "provider" | "admin" };
type Provider = {
  user_id: string; full_name: string; email: string; phone?: string | null; business_name?: string | null;
  service_area?: string | null; service_categories?: string[]; approval_status: string; available: boolean;
  rejection_reason?: string | null; completed_jobs?: number;
};
type Errand = {
  id: string; public_code: string; title: string; category: string; status: string; provider_id?: string | null;
  provider_name?: string | null; customer_name?: string; service_area?: string; service_fee_amount?: number | string | null;
};

const readable = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusColor = (s: string) => s === "completed" || s === "approved" ? colors.green : s === "disputed" || s === "rejected" || s === "suspended" ? colors.red : colors.blue;

export default function OperationsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [errands, setErrands] = useState<Errand[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const me = await dispatchGet<{ user: User }>("me");
      setUser(me.user);
      if (me.user.role !== "admin") {
        setProviders([]); setErrands([]);
        setError("Operations access is restricted to SaMi administrators.");
        return;
      }
      const [providerResult, errandResult] = await Promise.all([
        dispatchGet<{ providers: Provider[] }>("providers"),
        dispatchGet<{ errands: Errand[] }>("errands"),
      ]);
      setProviders(providerResult.providers || []);
      setErrands(errandResult.errands || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operations data could not be loaded.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const busyProviderIds = useMemo(() => new Set(
    errands.filter((e) => e.provider_id && ["assigned", "accepted", "in_progress", "completion_submitted"].includes(e.status))
      .map((e) => e.provider_id as string)
  ), [errands]);

  function eligibleProviders(errand: Errand) {
    return providers.filter((p) => {
      const categories = p.service_categories || [];
      return p.approval_status === "approved" && p.available && !busyProviderIds.has(p.user_id) &&
        (!categories.length || categories.includes(errand.category) || categories.includes("other"));
    });
  }

  async function reviewProvider(provider: Provider, decision: "approve" | "suspend" | "reinstate") {
    setWorking(provider.user_id); setError(""); setNotice("");
    try {
      const result = await dispatchPost<{ message: string }>("providerReview", {
        providerId: provider.user_id, decision,
      });
      setNotice(result.message || "Provider application updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provider review failed.");
    } finally { setWorking(""); }
  }

  async function assign(errand: Errand, provider: Provider) {
    setWorking(errand.id); setError(""); setNotice("");
    try {
      await dispatchPost("errandAction", { id: errand.id, errandAction: "assign", providerId: provider.user_id });
      setNotice("Assigned " + errand.public_code + " to " + (provider.business_name || provider.full_name) + ".");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The errand could not be assigned.");
    } finally { setWorking(""); }
  }

  const pending = providers.filter((p) => p.approval_status === "pending");
  const activeErrands = errands.filter((e) => !["completed", "cancelled"].includes(e.status));

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.navy, fontSize: 23 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>SaMi operations</Text>
            <Text style={common.title}>Control room</Text>
          </View>
        </View>

        {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12, lineHeight: 19 }}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.blue} /> : null}

        {user?.role === "admin" ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                ["Needs review", pending.length],
                ["Active errands", activeErrands.length],
                ["Providers", providers.length],
              ].map(([label, value]) => (
                <View key={String(label)} style={[common.card, { flex: 1, padding: 12, gap: 5 }]}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}>{label}</Text>
                  <Text style={{ color: colors.navy, fontSize: 23, fontWeight: "900" }}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "800" }}>Provider applications</Text>
              {!providers.length ? <Text style={common.subtitle}>No provider records found.</Text> : null}
              {providers.map((p) => (
                <View key={p.user_id} style={common.card}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "800" }}>{p.business_name || p.full_name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{p.email}{p.phone ? " · " + p.phone : ""}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{p.service_area || "Service area not yet provided"}</Text>
                    </View>
                    <View style={[common.pill, { backgroundColor: p.approval_status === "approved" ? "#E5F6EE" : p.approval_status === "rejected" || p.approval_status === "suspended" ? "#FDECEC" : colors.blueSoft }]}>
                      <Text style={{ color: statusColor(p.approval_status), fontSize: 10, fontWeight: "900" }}>{readable(p.approval_status)}</Text>
                    </View>
                  </View>
                  {p.rejection_reason ? <Text style={{ color: colors.red, fontSize: 12 }}>{p.rejection_reason}</Text> : null}
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Categories: {(p.service_categories || []).map(readable).join(", ") || "Not selected"}</Text>
                  {p.approval_status === "pending" ? (
                    <Pressable disabled={Boolean(working)} onPress={() => reviewProvider(p, "approve")} style={[common.primaryButton, Boolean(working) && { opacity: 0.6 }]}>
                      {working === p.user_id ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Approve provider</Text>}
                    </Pressable>
                  ) : null}
                  {p.approval_status === "approved" ? (
                    <Pressable disabled={Boolean(working)} onPress={() => reviewProvider(p, "suspend")} style={[common.secondaryButton, Boolean(working) && { opacity: 0.6 }]}>
                      <Text style={common.secondaryButtonText}>{working === p.user_id ? "Updating…" : "Suspend provider"}</Text>
                    </Pressable>
                  ) : null}
                  {p.approval_status === "suspended" ? (
                    <Pressable disabled={Boolean(working)} onPress={() => reviewProvider(p, "reinstate")} style={[common.primaryButton, Boolean(working) && { opacity: 0.6 }]}>
                      {working === p.user_id ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Reinstate provider</Text>}
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "800" }}>Errand dispatch</Text>
              {errands.map((e) => {
                const options = ["requested", "declined"].includes(e.status) && !e.provider_id ? eligibleProviders(e) : [];
                return (
                  <View key={e.id} style={common.card}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>{e.public_code}</Text>
                        <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "800" }}>{e.title}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{e.customer_name || "Customer"} · {e.service_area || "Area not specified"}</Text>
                      </View>
                      <View style={common.pill}><Text style={{ color: statusColor(e.status), fontSize: 10, fontWeight: "900" }}>{readable(e.status)}</Text></View>
                    </View>
                    <Text style={{ color: colors.ink, fontWeight: "800" }}>KES {Number(e.service_fee_amount || 0).toLocaleString("en-KE")}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Provider: {e.provider_name || "Unassigned"}</Text>
                    <Pressable onPress={() => router.push({ pathname: "/(app)/errand/[id]", params: { id: e.id } })} style={common.secondaryButton}>
                      <Text style={common.secondaryButtonText}>Open errand details</Text>
                    </Pressable>
                    {options.length ? (
                      <View style={{ gap: 7 }}>
                        <Text style={common.label}>Assign an eligible provider</Text>
                        {options.map((p) => (
                          <Pressable key={p.user_id} disabled={Boolean(working)} onPress={() => assign(e, p)} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text style={{ color: colors.navy, fontSize: 13, fontWeight: "800" }}>{p.business_name || p.full_name}</Text>
                              <Text style={{ color: colors.muted, fontSize: 11 }}>{p.service_area || "Service area not specified"}</Text>
                            </View>
                            {working === e.id ? <ActivityIndicator color={colors.blue} /> : <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "900" }}>Assign ›</Text>}
                          </Pressable>
                        ))}
                      </View>
                    ) : ["requested", "declined"].includes(e.status) && !e.provider_id ? <Text style={{ color: colors.muted, fontSize: 12 }}>No eligible available provider at present.</Text> : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
