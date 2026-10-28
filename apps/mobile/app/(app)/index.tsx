import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; full_name: string; email: string; role: "customer" | "provider" | "admin"; phone: string | null };
type Metrics = { total?: number; active?: number; completed?: number; disputes?: number };
type ProviderProfile = { approval_status: "pending" | "approved" | "rejected" | "suspended"; rejection_reason?: string | null; available: boolean; service_area?: string | null; completed_jobs?: number; rating_average?: number | string | null; rating_count?: number };

const customerServices = [
  { id: "shopping", category: "shopping", icon: "🛍️", title: "Shopping", caption: "Buy items for me" },
  { id: "pickups", category: "pickup_delivery", icon: "↙", title: "Pickups", caption: "Collect something" },
  { id: "deliveries", category: "pickup_delivery", icon: "↗", title: "Deliveries", caption: "Send something" },
  { id: "other", category: "other", icon: "＋", title: "Other errands", caption: "Describe your task" },
] as const;

function HeaderButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "800" }}>{icon}</Text>
    </Pressable>
  );
}

function ActionCard({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[common.card, { flexDirection: "row", alignItems: "center", padding: 16 }]}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 21, color: colors.navy, fontWeight: "800" }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>{body}</Text>
      </View>
      <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "800" }}>›</Text>
    </Pressable>
  );
}

function StatCard({ label, value, accent = colors.navy }: { label: string; value: number | undefined; accent?: string }) {
  return (
    <View style={[common.card, { flex: 1, minWidth: 88, paddingHorizontal: 13, paddingVertical: 14, gap: 6 }]}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: accent, fontSize: 24, fontWeight: "900" }}>{value ?? "—"}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [taskDraft, setTaskDraft] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const results = await Promise.all([dispatchGet<{ user: User }>("me"), dispatchGet<{ metrics: Metrics }>("dashboard")]);
      setUser(results[0].user);
      setMetrics(results[1].metrics);
      if (results[0].user.role === "provider") {
        dispatchGet<{ profile: ProviderProfile }>("providerProfile")
          .then((result) => setProviderProfile(result.profile))
          .catch(() => setProviderProfile(null));
      } else {
        setProviderProfile(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your SaMi workspace.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAvailability() {
    if (!providerProfile || providerProfile.approval_status !== "approved") return;
    setAvailabilityBusy(true);
    setError("");
    try {
      const result = await dispatchPost<{ available: boolean; message: string }>("providerAvailability", { available: !providerProfile.available });
      setProviderProfile({ ...providerProfile, available: result.available });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Availability could not be changed.");
    } finally {
      setAvailabilityBusy(false);
    }
  }


  const firstName = user?.full_name.trim().split(/\s+/)[0] || "there";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 40 : 12, paddingBottom: 34, gap: 20 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontSize: 23, fontWeight: "900" }}>S</Text>
            </View>
            <View style={{ gap: 1 }}>
              <Text style={{ color: colors.navy, fontSize: 23, fontWeight: "900", letterSpacing: -0.6 }}>SaMi</Text>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>Errands</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <HeaderButton icon="◉" label="Notifications" onPress={() => router.push("/(app)/notifications")} />
            <HeaderButton icon={firstName.slice(0, 1).toUpperCase()} label="Profile and sign out" onPress={() => router.push("/(app)/account")} />
          </View>
        </View>

        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy && !user ? <ActivityIndicator color={colors.blue} /> : null}

        {user?.role === "customer" ? (
          <>
            <View style={{ gap: 6, marginTop: 2 }}>
              <Text style={common.eyebrow}>{greeting}</Text>
              <Text style={{ color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 }}>Hi {firstName}, what needs doing?</Text>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>Choose a task or start a request. Your service fee is shown before you submit.</Text>
            </View>

            <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: 20, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.white, fontSize: 20, fontWeight: "800" }}>✦</Text>
                </View>
                <Text style={{ color: "#D8E0F4", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>START SOMETHING NEW</Text>
              </View>
              <Text style={{ color: colors.white, fontSize: 23, lineHeight: 28, fontWeight: "900" }}>One request. Clear service fees.</Text>
              <Text style={{ color: "#D8E0F4", fontSize: 13, lineHeight: 19 }}>Set the task and locations, review the calculated fee, then send it to SaMi.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/request")} style={[common.primaryButton, { backgroundColor: colors.white, marginTop: 2 }]}>
                <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>＋  Request an errand</Text>
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "900" }}>Quick services</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/request")} hitSlop={8}>
                  <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "800" }}>All tasks ›</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {customerServices.map((service) => (
                  <Pressable
                    key={service.category}
                    accessibilityRole="button"
                    accessibilityLabel={service.title}
                    onPress={() => router.push({ pathname: "/(app)/request", params: { category: service.category } })}
                    style={[common.card, { width: "48%", minHeight: 132, flexGrow: 1, padding: 14, gap: 8 }]}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.navy, fontSize: 20, fontWeight: "800" }}>{service.icon}</Text>
                    </View>
                    <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>{service.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15 }}>{service.caption}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "900" }}>Your activity</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/errands")} hitSlop={8}>
                  <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "800" }}>View errands ›</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 9 }}>
                <StatCard label="All requests" value={metrics?.total} />
                <StatCard label="In progress" value={metrics?.active} accent={colors.blue} />
                <StatCard label="Completed" value={metrics?.completed} accent={colors.green} />
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/errands")} style={[common.card, { flexDirection: "row", alignItems: "center", padding: 15 }]}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "900" }}>↗</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>Track your errands</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>See assignments, progress and completion updates.</Text>
                </View>
                <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "900" }}>›</Text>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "900" }}>Account</Text>
              <ActionCard icon="KES" title="Payments" body="Service fee payments and transaction history." onPress={() => router.push("/(app)/payments")} />
              <ActionCard icon="◉" title="Notifications" body="Errand status and service updates." onPress={() => router.push("/(app)/notifications")} />
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>Goods paid to a shop or seller are separate from SaMi’s service fee.</Text>
            </View>
          </>
        ) : user?.role === "provider" ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={common.eyebrow}>Provider workspace</Text>
              <Text style={{ color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 }}>Welcome, {firstName}.</Text>
              <Text style={common.subtitle}>Manage your availability, pick up eligible work and keep customers updated.</Text>
            </View>
            <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: 20, gap: 12 }}>
              <Text style={{ color: "#BFD0FF", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>READY FOR WORK?</Text>
              <Text style={{ color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: "900" }}>Find your next errand.</Text>
              <Text style={{ color: "#D8E0F4", fontSize: 13, lineHeight: 19 }}>Check eligible requests, accept work and record completion in SaMi.</Text>
              <Pressable onPress={() => router.push("/(app)/errands")} style={[common.primaryButton, { backgroundColor: colors.white }]}>
                <Text style={{ color: colors.navy, fontWeight: "900", fontSize: 15 }}>View available errands</Text>
              </Pressable>
            </View>
            <View style={common.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "900" }}>Provider application</Text>
                <Text style={{ color: providerProfile?.approval_status === "approved" ? colors.green : providerProfile?.approval_status === "rejected" || providerProfile?.approval_status === "suspended" ? colors.red : colors.amber, fontSize: 11, fontWeight: "900" }}>
                  {providerProfile ? providerProfile.approval_status.replaceAll("_", " ").toUpperCase() : "LOADING"}
                </Text>
              </View>
              {providerProfile?.approval_status === "approved" ? (
                <>
                  <Text style={common.subtitle}>You can accept eligible open requests while marked available.</Text>
                  <Pressable disabled={availabilityBusy} onPress={toggleAvailability} style={[providerProfile.available ? common.secondaryButton : common.primaryButton, availabilityBusy && { opacity: 0.6 }]}>
                    {availabilityBusy ? <ActivityIndicator color={colors.blue} /> : <Text style={providerProfile.available ? common.secondaryButtonText : common.primaryButtonText}>{providerProfile.available ? "Go unavailable" : "Go available"}</Text>}
                  </Pressable>
                </>
              ) : providerProfile?.approval_status === "rejected" ? (
                <Text style={{ color: colors.red, fontSize: 13, lineHeight: 19 }}>Operations feedback: {providerProfile.rejection_reason || "Contact SaMi support to review your application."}</Text>
              ) : (
                <Text style={common.subtitle}>SaMi operations must approve your profile before job acceptance and live task tracking are enabled.</Text>
              )}
              {providerProfile?.approval_status === "approved" ? <Text style={{ color: colors.muted, fontSize: 12 }}>{providerProfile.completed_jobs ?? 0} jobs completed</Text> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <StatCard label="Total" value={metrics?.total} />
              <StatCard label="Active" value={metrics?.active} accent={colors.blue} />
              <StatCard label="Completed" value={metrics?.completed} accent={colors.green} />
            </View>
            <ActionCard icon="↗" title="My errands" body="Assignments, status and active task progress." onPress={() => router.push("/(app)/errands")} />
            <ActionCard icon="⚙" title="Provider profile" body="Manage your service area, categories and introduction." onPress={() => router.push("/(app)/profile")} />
            <ActionCard icon="KES" title="Earnings & payments" body="Review payment and payout activity." onPress={() => router.push("/(app)/payments")} />
          </>
        ) : user?.role === "admin" ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={common.eyebrow}>SaMi operations</Text>
              <Text style={{ color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 }}>Operations overview</Text>
              <Text style={common.subtitle}>Monitor requests, provider approvals and service issues.</Text>
            </View>
            <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: 20, gap: 12 }}>
              <Text style={{ color: "#BFD0FF", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>DISPATCH CONTROL</Text>
              <Text style={{ color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: "900" }}>Keep errands moving.</Text>
              <Pressable onPress={() => router.push("/(app)/operations")} style={[common.primaryButton, { backgroundColor: colors.white }]}>
                <Text style={{ color: colors.navy, fontWeight: "900", fontSize: 15 }}>Open operations</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              <StatCard label="All errands" value={metrics?.total} />
              <StatCard label="Active" value={metrics?.active} accent={colors.blue} />
              <StatCard label="Completed" value={metrics?.completed} accent={colors.green} />
              <StatCard label="Disputes" value={metrics?.disputes} accent={colors.red} />
            </View>
            <ActionCard icon="▤" title="Errand queue" body="Review requests, assignments and completion." onPress={() => router.push("/(app)/errands")} />
            <ActionCard icon="⌘" title="Operations control room" body="Provider approvals, assignments and dispatch." onPress={() => router.push("/(app)/operations")} />
            <ActionCard icon="KES" title="Payments" body="Review service fees, payouts and refunds." onPress={() => router.push("/(app)/payments")} />
            <ActionCard icon="◉" title="Notifications" body="Review system and errand updates." onPress={() => router.push("/(app)/notifications")} />
          </>
        ) : (
          <View style={[common.card, { alignItems: "center", paddingVertical: 26 }]}>
            <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "900" }}>Loading your SaMi workspace</Text>
            <Text style={common.subtitle}>Your account and errand activity will appear here.</Text>
          </View>
        )}


      </ScrollView>
    </SafeAreaView>
  );
}
