import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";
import SaMiLogoMark from "@/components/SaMiLogoMark";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type User = { id: string; full_name: string; email: string; role: "customer" | "provider" | "admin"; phone: string | null };
type Metrics = { total?: number; active?: number; completed?: number; disputes?: number };
type ProviderProfile = { approval_status: "pending" | "approved" | "rejected" | "suspended"; rejection_reason?: string | null; available: boolean; service_area?: string | null; completed_jobs?: number; rating_average?: number | string | null; rating_count?: number };

const customerServices = [
  { id: "shopping", category: "shopping", icon: "cart-outline", title: "Shopping & essentials", caption: "Buy items and groceries" },
  { id: "pickup", category: "pickup_delivery", icon: "cube-outline", title: "Pick-up & drop-off", caption: "Send or collect items" },
  { id: "documents", category: "documents_admin", icon: "document-text-outline", title: "Documents & admin", caption: "Forms and office runs" },
  { id: "queues", category: "queue_appointments", icon: "time-outline", title: "Queues & appointments", caption: "Waiting and bookings" },
  { id: "personal", category: "personal_errand", icon: "sparkles-outline", title: "Personal assistance", caption: "Everyday tasks, handled" },
  { id: "business", category: "business_support", icon: "briefcase-outline", title: "Business errands", caption: "Keep work moving" },
  { id: "clothing", category: "clothing_retail", icon: "shirt-outline", title: "Clothing & returns", caption: "Purchases, exchanges, returns" },
  { id: "other", category: "other", icon: "add-outline", title: "Custom errand", caption: "Tell us what you need" },
] as const;

function HeaderButton({ icon, label, onPress, badgeCount = 0 }: {
  icon: string; label: string; onPress: () => void; badgeCount?: number;
}) {
  const isBell = icon === "bell";
  const isMenu = icon === "menu";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badgeCount > 0 && isBell ? label + ", " + badgeCount + " unread" : label}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" }}
    >
      {isBell ? (
        <Ionicons name="notifications-outline" size={22} color={colors.navy} />
      ) : isMenu ? (
        <Ionicons name="menu-outline" size={25} color={colors.navy} />
      ) : (
        <Text style={{ color: colors.navy, fontSize: 21, fontWeight: "800" }}>{icon}</Text>
      )}
      {isBell && badgeCount > 0 ? (
        <View style={{ position: "absolute", top: 5, right: 5, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ color: colors.white, fontSize: 8, fontWeight: "900" }}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
        </View>
      ) : null}
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
  const [serviceSearch, setServiceSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const results = await Promise.all([dispatchGet<{ user: User }>("me"), dispatchGet<{ metrics: Metrics }>("dashboard")]);
      setUser(results[0].user);
      if (results[0].user.role === "customer") {
        dispatchGet<{ unread: number }>("notifications")
          .then((data) => setUnreadNotifications(Number(data.unread || 0)))
          .catch(() => setUnreadNotifications(0));
      }
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


  const firstName = user?.full_name?.trim().split(/\s+/)[0] || "there";

  function startCustomerRequest(category?: string) {
    const params: { category?: string } = {};
    if (category) params.category = category;
    router.push({ pathname: "/(app)/request", params });
  }

  function openCustomerSetting(setting: "security" | "privacy" | "notifications" | "location" | "about") {
    setSettingsOpen(false);
    if (setting === "security" || setting === "privacy") {
      router.push({ pathname: "/(app)/account", params: { section: setting } });
    } else if (setting === "notifications") {
      router.push("/(app)/notifications");
    } else if (setting === "location") {
      Linking.openSettings().catch(() => Alert.alert("Location settings", "Open your phone's Settings app and allow SaMi to access location while using the app."));
    } else if (setting === "about") {
      Alert.alert("SaMi errands", "SaMi helps customers arrange everyday errands, follow progress, and manage service payments.");
    }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 20 : 12, paddingBottom: 34, gap: 20 }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.blue} />}
        showsVerticalScrollIndicator={false}
      >
        {user?.role === "customer" ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
              <Text style={{ color: colors.navy, fontSize: 28, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.1 }}>SaMi</Text>
              <Text style={{ color: colors.blue, fontSize: 10, fontWeight: "800", letterSpacing: 0.25 }}>Your Everyday Help Organised</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeaderButton icon="bell" label="Notifications" badgeCount={unreadNotifications} onPress={() => router.push("/(app)/notifications")} />
              <HeaderButton icon="menu" label="Open settings menu" onPress={() => setSettingsOpen(true)} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <SaMiLogoMark size={42} />
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
        )}

        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {busy && !user ? <ActivityIndicator color={colors.blue} /> : null}

        {user?.role === "customer" ? (
          <>
            <View style={{ gap: 14 }}>
              <View style={{ gap: 5 }}>
                <Text style={common.eyebrow}>YOUR DAY, MADE EASIER</Text>
                <Text style={{ color: colors.navy, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 }}>Big or small, we run your errands.</Text>
                <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>Your day, made easier. Tell us what you need and we’ll help get it done.</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="search-outline" size={21} color={colors.muted} />
                <TextInput value={serviceSearch} onChangeText={setServiceSearch} placeholder="What can we do for you today?" placeholderTextColor={colors.muted} returnKeyType="search" style={{ flex: 1, minHeight: 50, color: colors.navy, fontSize: 14 }} accessibilityLabel="Search SaMi errand services" />
                {serviceSearch ? <Pressable accessibilityRole="button" accessibilityLabel="Clear service search" onPress={() => setServiceSearch("")}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable> : null}
              </View>
              <Pressable accessibilityRole="button" onPress={() => startCustomerRequest()} style={{ backgroundColor: "#EAF1FC", borderRadius: 22, padding: 18, gap: 10, overflow: "hidden" }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" }}><Ionicons name="navigate-outline" size={23} color={colors.white} /></View>
                <Text style={{ color: colors.navy, fontSize: 19, lineHeight: 25, fontWeight: "900" }}>Your errands, your way.</Text>
                <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>Request a helping hand for shopping, collections, personal tasks and more.</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 2 }}><Text style={{ color: colors.blue, fontSize: 14, fontWeight: "900" }}>Create an errand</Text><Ionicons name="arrow-forward" size={17} color={colors.blue} /></View>
              </Pressable>
            </View>

            <View style={{ gap: 13 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.navy, fontSize: 20, fontWeight: "900", letterSpacing: -0.35 }}>Explore our services</Text>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Choose a service to start a request with the right details.</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {customerServices.filter((service) => (service.title + " " + service.caption).toLowerCase().includes(serviceSearch.trim().toLowerCase())).map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={service.title}
                    onPress={() => startCustomerRequest(service.category)}
                    style={[common.card, { width: "48%", minHeight: 118, flexGrow: 1, padding: 14, gap: 8 }]}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={service.icon} size={20} color={colors.navy} />
                    </View>
                    <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>{service.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15 }}>{service.caption}</Text>
                  </Pressable>
                ))}
              </View>
              {customerServices.filter((service) => (service.title + " " + service.caption).toLowerCase().includes(serviceSearch.trim().toLowerCase())).length === 0 ? <Text style={[common.subtitle, { textAlign: "center", paddingVertical: 10 }]}>No matching service. Choose Custom errand to describe what you need.</Text> : null}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(app)/errands")}
              style={[common.card, { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }]}
            >
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "900" }}>↗</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>Your errands</Text>
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                  {(metrics?.active ?? 0) > 0
                    ? String(metrics?.active) + ((metrics?.active ?? 0) === 1 ? " request in progress" : " requests in progress")
                    : "Track status and updates after you send a request."}
                </Text>
              </View>
              <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "900" }}>›</Text>
            </Pressable>
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
                <Text style={{ color: providerProfile?.approval_status === "approved" ? colors.blue : providerProfile?.approval_status === "rejected" || providerProfile?.approval_status === "suspended" ? colors.red : colors.amber, fontSize: 11, fontWeight: "900" }}>
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
              <StatCard label="Completed" value={metrics?.completed} accent={colors.blue} />
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
              <StatCard label="Completed" value={metrics?.completed} accent={colors.blue} />
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

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: "rgba(7, 17, 42, 0.48)" }}>
          <View style={{ width: "84%", maxWidth: 360, height: "100%", backgroundColor: colors.white, paddingTop: Platform.OS === "android" ? 46 : 58, paddingHorizontal: 22, paddingBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <Text style={{ color: colors.navy, fontSize: 28, fontWeight: "900", letterSpacing: -0.8 }}>Settings</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close settings menu" onPress={() => setSettingsOpen(false)} style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.navy, fontSize: 23, fontWeight: "600" }}>×</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 22 }}>Your account, privacy and app permissions.</Text>
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 8 }} />
            {([
              { key: "security", icon: "shield-checkmark-outline", title: "Account security", detail: "Password and signed-in sessions" },
              { key: "privacy", icon: "lock-closed-outline", title: "Data & privacy", detail: "Export or delete your account" },
              { key: "notifications", icon: "notifications-outline", title: "Notifications", detail: "Errand and service updates" },
              { key: "location", icon: "location-outline", title: "Location & maps", detail: "Manage location permission" },
              { key: "about", icon: "information-circle-outline", title: "About SaMi", detail: "App information" },
            ] as const).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => openCustomerSetting(item.key as "security" | "privacy" | "notifications" | "location" | "about")}
                style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#EEF1F6" }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={item.icon as IoniconName} size={20} color={colors.blue} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "900" }}>{item.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{item.detail}</Text>
                </View>
                <Text style={{ color: colors.blue, fontSize: 22, fontWeight: "800" }}>›</Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>SaMi errands · Customer app</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close settings menu" onPress={() => setSettingsOpen(false)} style={{ flex: 1 }} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
