import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import MapPicker, { type MapPoint } from "@/components/MapPicker";
import { apiRequest, dispatchGet, dispatchPost, locationGet } from "@/api";
import { colors, common } from "@/theme";

type User = { id: string; full_name: string; role: "customer" | "provider" | "admin"; phone?: string | null };
type Errand = {
  id: string; public_code: string; customer_id: string; provider_id: string | null;
  title: string; category: string; description: string; status: string;
  pickup_location?: string | null; destination_location?: string | null; service_area?: string;
  pickup_latitude?: number | string | null; pickup_longitude?: number | string | null;
  destination_latitude?: number | string | null; destination_longitude?: number | string | null;
  provider_latitude?: number | string | null; provider_longitude?: number | string | null;
  provider_location_updated_at?: string | null; provider_name?: string | null; customer_name?: string;
  service_fee_amount?: number | string | null; item_budget_amount?: number | string | null;
  service_payment_method?: string | null; payment_status?: string | null;
  completion_notes?: string | null; cancellation_reason?: string | null;
};
type Event = { id: string; event_type: string; note?: string; created_at: string; actor_name?: string | null };
type Detail = { errand: Errand; events: Event[] };
type RoadRoute = { coordinates: [number, number][] };

const readable = (value?: string | null) => (value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const num = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const statusColor = (status: string) => status === "completed" ? colors.green : status === "disputed" || status === "cancelled" ? colors.red : colors.blue;

function ActionButton({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[secondary ? common.secondaryButton : common.primaryButton, disabled && { opacity: 0.5 }]}>
    <Text style={secondary ? common.secondaryButtonText : common.primaryButtonText}>{title}</Text>
  </Pressable>;
}

export default function ErrandDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id || "";
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [mapRoute, setMapRoute] = useState<[number, number][]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");

  const load = useCallback(async (showSpinner = false) => {
    if (!id) { setError("Errand identifier is missing."); setBusy(false); return; }
    if (showSpinner) setBusy(true);
    try {
      const [me, data] = await Promise.all([
        dispatchGet<{ user: User }>("me"),
        dispatchGet<Detail>("errandDetail", { id }),
      ]);
      setUser(me.user);
      setDetail(data);
      const e = data.errand;
      const fromLat = num(e.pickup_latitude), fromLng = num(e.pickup_longitude);
      const toLat = num(e.destination_latitude), toLng = num(e.destination_longitude);
      if (fromLat !== null && fromLng !== null && toLat !== null && toLng !== null) {
        locationGet<{ route: RoadRoute }>({
          action: "route", fromLat: String(fromLat), fromLng: String(fromLng),
          toLat: String(toLat), toLng: String(toLng),
        }).then((r) => setMapRoute(r.route.coordinates || [])).catch(() => setMapRoute([]));
      } else setMapRoute([]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load errand details.");
    } finally { setBusy(false); }
  }, [id]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const e = detail?.errand;
    if (!e || !["accepted", "in_progress"].includes(e.status)) return;
    const timer = setInterval(() => { load(false); }, 12000);
    return () => clearInterval(timer);
  }, [detail?.errand?.status, load]);

  const errand = detail?.errand;
  const pickup = useMemo<MapPoint | null>(() => {
    const lat = num(errand?.pickup_latitude), lng = num(errand?.pickup_longitude);
    return lat === null || lng === null ? null : { lat, lng };
  }, [errand?.pickup_latitude, errand?.pickup_longitude]);
  const destination = useMemo<MapPoint | null>(() => {
    const lat = num(errand?.destination_latitude), lng = num(errand?.destination_longitude);
    return lat === null || lng === null ? null : { lat, lng };
  }, [errand?.destination_latitude, errand?.destination_longitude]);
  const provider = useMemo<MapPoint | null>(() => {
    const lat = num(errand?.provider_latitude), lng = num(errand?.provider_longitude);
    return lat === null || lng === null ? null : { lat, lng };
  }, [errand?.provider_latitude, errand?.provider_longitude]);

  const isCustomer = user?.role === "customer" && user.id === errand?.customer_id;
  const isAssignedProvider = user?.role === "provider" && user.id === errand?.provider_id;
  const canAccept = user?.role === "provider" && Boolean(errand && (
    (errand.status === "requested" && !errand.provider_id) ||
    (errand.status === "assigned" && isAssignedProvider)
  ));
  const serviceFee = num(errand?.service_fee_amount) || 0;
  const locationTimestamp = errand?.provider_location_updated_at ? new Date(errand.provider_location_updated_at) : null;
  const locationIsFresh = Boolean(locationTimestamp && Date.now() - locationTimestamp.getTime() <= 90000);

  async function act(action: string, fields: Record<string, unknown> = {}, successMessage?: string) {
    if (!errand) return;
    setWorking(action); setError(""); setNotice("");
    try {
      await dispatchPost("errandAction", { id: errand.id, errandAction: action, ...fields });
      setNotice(successMessage || "Errand updated.");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action could not be completed.");
    } finally { setWorking(""); }
  }

  async function startMpesa() {
    if (!errand) return;
    if (!mpesaPhone.trim()) { setError("Enter the Kenyan M-PESA phone number that should receive the payment prompt."); return; }
    setWorking("mpesa"); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ message?: string; CheckoutRequestID?: string; CustomerMessage?: string }>(
        "/api/payments/mpesa/checkout",
        { method: "POST", body: { errandId: errand.id, phone: mpesaPhone.trim() } }
      );
      setNotice(result.CustomerMessage || result.message || "M-PESA checkout was requested. Follow the prompt on your phone.");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "M-PESA checkout could not be started.");
    } finally { setWorking(""); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => load(true)} tintColor={colors.blue} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.navy, fontSize: 23 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>Errand details</Text>
            <Text style={common.title}>{errand?.public_code || "Loading…"}</Text>
          </View>
        </View>

        {busy && !errand ? <ActivityIndicator color={colors.blue} /> : null}
        {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12, lineHeight: 20 }}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {!busy && !errand && !error ? <View style={common.card}><Text style={common.subtitle}>This errand could not be found.</Text></View> : null}

        {errand ? (
          <>
            <View style={common.card}>
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.navy, fontSize: 22, fontWeight: "900", lineHeight: 28 }}>{errand.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{readable(errand.category)} · {errand.service_area || "Service area not set"}</Text>
                <View style={{ backgroundColor: errand.status === "completed" ? "#E5F6EE" : errand.status === "disputed" ? "#FDECEC" : colors.blueSoft, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 7, alignSelf: "flex-start" }}>
                  <Text style={{ color: statusColor(errand.status), fontSize: 12, fontWeight: "900" }}>{readable(errand.status)}</Text>
                </View>
              </View>
              <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 23 }}>{errand.description}</Text>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>SAMI SERVICE FEE</Text>
                  <Text style={{ color: colors.navy, fontSize: 25, fontWeight: "900" }}>KES {serviceFee.toLocaleString("en-KE")}</Text>
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>SERVICE PAYMENT</Text>
                  <Text style={{ color: colors.navy, fontSize: 14, fontWeight: "800" }}>{readable(errand.service_payment_method || "cash")}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{readable(errand.payment_status || "unpaid")}</Text>
                </View>
              </View>
              {num(errand.item_budget_amount) !== null ? <Text style={{ color: colors.muted, fontSize: 13 }}>Estimated seller/goods budget: KES {(num(errand.item_budget_amount) || 0).toLocaleString("en-KE")} (paid to the seller separately).</Text> : null}
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>TASK DETAILS</Text>
              <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 21 }}>Customer: {errand.customer_name || "Customer"}{"\n"}Provider: {errand.provider_name || "Waiting for provider"}{"\n"}Pickup: {errand.pickup_location || "Not specified"}{"\n"}Destination: {errand.destination_location || "Not specified"}</Text>
              {errand.completion_notes ? <View style={{ backgroundColor: "#F5F7FB", padding: 12, borderRadius: 12, gap: 5 }}><Text style={{ color: colors.navy, fontWeight: "800" }}>Provider completion notes</Text><Text style={{ color: colors.ink, lineHeight: 21 }}>{errand.completion_notes}</Text></View> : null}
              {errand.cancellation_reason ? <Text style={{ color: colors.muted }}>Cancellation note: {errand.cancellation_reason}</Text> : null}
            </View>

            {(pickup || destination || provider) ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Route and live location</Text>
                <MapPicker selecting="pickup" pickup={pickup} destination={destination} provider={locationIsFresh ? provider : null} route={mapRoute.map(([lat,lng]) => ({lat,lng}))} readOnly />
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                  {locationIsFresh && provider ? "Last provider location: " + locationTimestamp?.toLocaleTimeString() + ". The map refreshes during an active errand." : ["accepted", "in_progress"].includes(errand.status) ? "Waiting for the provider's next GPS update. Old positions are hidden after 90 seconds." : "Pickup and destination pins show the planned route."}
                </Text>
              </View>
            ) : null}

            {isCustomer && errand.service_payment_method === "in_app" && errand.payment_status !== "paid" && !["cancelled","disputed"].includes(errand.status) ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Pay SaMi by M-PESA</Text>
                <Text style={common.subtitle}>This payment is for SaMi's service fee only. You pay any shop or seller separately.</Text>
                <TextInput value={mpesaPhone || user?.phone || ""} onChangeText={setMpesaPhone} keyboardType="phone-pad" placeholder="07XXXXXXXX" placeholderTextColor="#929BAD" style={common.input} />
                <ActionButton title={working === "mpesa" ? "Requesting payment…" : "Send M-PESA prompt"} disabled={Boolean(working)} onPress={startMpesa} />
              </View>
            ) : null}

            {isAssignedProvider && errand.status === "accepted" ? <ActionButton title={working === "start" ? "Starting…" : "Start errand"} disabled={Boolean(working)} onPress={() => act("start", {}, "Errand marked as in progress.")} /> : null}
            {isAssignedProvider && errand.status === "in_progress" ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Submit completion</Text>
                <Text style={common.subtitle}>Describe what you completed. The customer can confirm the result or raise a dispute.</Text>
                <TextInput value={completionNotes} onChangeText={setCompletionNotes} multiline placeholder="Completion details, hand-off notes or delivery confirmation…" placeholderTextColor="#929BAD" textAlignVertical="top" style={[common.input, { minHeight: 105 }]} />
                <ActionButton title={working === "complete" ? "Submitting…" : "Submit completion"} disabled={Boolean(working) || completionNotes.trim().length < 3} onPress={() => act("complete", { completionNotes: completionNotes.trim() }, "Completion submitted for customer review.")} />
              </View>
            ) : null}
            {canAccept ? <ActionButton title={working === "accept" ? "Accepting…" : "Accept errand"} disabled={Boolean(working)} onPress={() => act("accept", {}, "You accepted this errand.")} /> : null}

            {isCustomer && errand.status === "completion_submitted" ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Confirm the result</Text>
                <Text style={common.subtitle}>Confirm only when the task is done as agreed. A dispute sends the request to SaMi operations for review.</Text>
                <ActionButton title={working === "confirm" ? "Confirming…" : "Confirm completion"} disabled={Boolean(working)} onPress={() => act("confirm", {}, "Completion confirmed.")} />
                <TextInput value={disputeNote} onChangeText={setDisputeNote} multiline placeholder="Explain the issue if something went wrong…" placeholderTextColor="#929BAD" textAlignVertical="top" style={[common.input, { minHeight: 80 }]} />
                <ActionButton title={working === "dispute" ? "Opening dispute…" : "Raise a dispute"} secondary disabled={Boolean(working) || disputeNote.trim().length < 3} onPress={() => act("dispute", { note: disputeNote.trim() }, "Your dispute was sent for review.")} />
              </View>
            ) : null}

            {isCustomer && ["requested", "assigned"].includes(errand.status) ? <ActionButton title={working === "cancel" ? "Cancelling…" : "Cancel request"} secondary disabled={Boolean(working)} onPress={() => act("cancel", { reason: "Cancelled by customer in the SaMi mobile app." }, "Errand request cancelled.")} /> : null}

            {detail?.events?.length ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Activity history</Text>
                {detail.events.map((item) => (
                  <View key={item.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 }}>
                    <Text style={{ color: colors.navy, fontWeight: "800", fontSize: 13 }}>{readable(item.event_type)}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>{item.actor_name || "SaMi"} · {new Date(item.created_at).toLocaleString()}</Text>
                    {item.note ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{item.note}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
