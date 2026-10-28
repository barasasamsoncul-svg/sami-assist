import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
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
  provider_earning_amount?: number | string | null; commission_amount?: number | string | null;
  service_payment_method?: string | null; payment_status?: string | null;
  payment_method?: string | null; payment_reference?: string | null;
  app_payment_checkout_status?: string | null;
  seller_payment_status?: string | null; seller_actual_amount?: number | string | null;
  seller_payment_method?: string | null; seller_payment_reference?: string | null;
  completion_notes?: string | null; cancellation_reason?: string | null;
};
type Event = { id: string; event_type: string; note?: string; created_at: string; actor_name?: string | null };
type ErrandMessage = { id: string; sender_id: string; message: string; created_at: string; sender_name: string; sender_role: string };
type Rating = { id: string; score: number; comment?: string | null; created_at: string; reviewer_name: string };
type Detail = { errand: Errand; events: Event[]; messages?: ErrandMessage[]; ratings?: Rating[] };
type RoadRoute = { coordinates: [number, number][] };
type VoiceCall = { id: string; errand_id: string; caller_id: string; callee_id: string; status: "ringing" | "active" | "rejected" | "ended" | "missed" | "failed"; caller_name: string; callee_name: string; public_code: string; errand_title: string };

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
  const [paymentReference, setPaymentReference] = useState("");
  const [sellerAmount, setSellerAmount] = useState("");
  const [sellerMethod, setSellerMethod] = useState("M-Pesa");
  const [sellerReference, setSellerReference] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("M-Pesa");
  const [payoutReference, setPayoutReference] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [messageText, setMessageText] = useState("");
  const [voiceCall, setVoiceCall] = useState<VoiceCall | null>(null);
  const [decliningCall, setDecliningCall] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

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
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load errand details.");
    } finally { setBusy(false); }
  }, [id]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const e = detail?.errand;
    if (!e) { setMapRoute([]); return; }
    const fromLat = num(e.pickup_latitude), fromLng = num(e.pickup_longitude);
    const toLat = num(e.destination_latitude), toLng = num(e.destination_longitude);
    if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
      setMapRoute([]);
      return;
    }
    let active = true;
    locationGet<{ route: RoadRoute }>({
      action: "route", fromLat: String(fromLat), fromLng: String(fromLng),
      toLat: String(toLat), toLng: String(toLng),
    }).then((result) => { if (active) setMapRoute(result.route.coordinates || []); })
      .catch(() => { if (active) setMapRoute([]); });
    return () => { active = false; };
  }, [
    detail?.errand?.pickup_latitude, detail?.errand?.pickup_longitude,
    detail?.errand?.destination_latitude, detail?.errand?.destination_longitude,
  ]);


  useEffect(() => {
    const e = detail?.errand;
    if (!e || !["assigned", "accepted", "in_progress", "completion_submitted"].includes(e.status)) return;
    const timer = setInterval(() => { load(false); }, 5000);
    return () => clearInterval(timer);
  }, [detail?.errand?.status, load]);

  useEffect(() => {
    const e = detail?.errand;
    if (!e || user?.role !== "provider" || e.provider_id !== user.id || !["accepted", "in_progress"].includes(e.status)) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 10 },
        (position) => {
          dispatchPost("updateProviderLocation", {
            id: e.id,
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
  }, [user?.id, user?.role, detail?.errand?.id, detail?.errand?.provider_id, detail?.errand?.status]);

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
  const isOperations = user?.role === "admin";

  useEffect(() => {
    if (!errand || (!isCustomer && !isAssignedProvider) || !errand.provider_id ||
        !["assigned", "accepted", "in_progress", "completion_submitted"].includes(errand.status)) {
      setVoiceCall(null);
      return;
    }
    let active = true;
    const syncCall = () => {
      dispatchGet<{ call: VoiceCall | null }>("callSync", { errandId: errand.id })
        .then((result) => { if (active) setVoiceCall(result.call); })
        .catch(() => { /* Calling may be unavailable until the additive database migration is applied. */ });
    };
    void syncCall();
    const timer = setInterval(syncCall, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [errand?.id, errand?.provider_id, errand?.status, isCustomer, isAssignedProvider]);

  const canCallOnErrand = Boolean(errand?.provider_id &&
    (isCustomer || isAssignedProvider) &&
    ["assigned", "accepted", "in_progress", "completion_submitted"].includes(errand?.status || ""));
  const incomingVoiceCall = Boolean(voiceCall?.status === "ringing" && voiceCall.callee_id === user?.id);

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


  function openVoiceCall() {
    if (!errand || !canCallOnErrand) return;
    router.push({
      pathname: "/(app)/errand/[id]/call",
      params: {
        id: errand.id,
        ...(incomingVoiceCall && voiceCall ? { callId: voiceCall.id } : {}),
      },
    });
  }

  async function declineVoiceCall() {
    if (!voiceCall) return;
    setDecliningCall(true);
    setError("");
    try {
      await dispatchPost("rejectErrandCall", { callId: voiceCall.id });
      setVoiceCall(null);
      setNotice("Call declined.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The call could not be declined.");
    } finally {
      setDecliningCall(false);
    }
  }

  async function sendMessage() {
    if (!errand || !messageText.trim()) return;
    setWorking("message"); setError(""); setNotice("");
    try {
      await dispatchPost("sendMessage", { errandId: errand.id, message: messageText.trim() });
      setMessageText("");
      setNotice("Message sent.");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent.");
    } finally { setWorking(""); }
  }

  async function submitRating() {
    if (!errand) return;
    setWorking("rating"); setError(""); setNotice("");
    try {
      await dispatchPost("addRating", { errandId: errand.id, score: ratingScore, comment: ratingComment.trim() });
      setNotice("Thank you for rating the completed errand.");
      setRatingComment("");
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rating could not be saved.");
    } finally { setWorking(""); }
  }

  async function recordCashServiceFee() {
    if (!errand) return;
    Alert.alert(
      "Confirm cash received",
      "Only record this if the full SaMi service fee of KES " + serviceFee.toLocaleString("en-KE") + " has actually been received.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Record received", onPress: () => { void act("mark_paid", { amount: serviceFee, method: "Cash", reference: "" }, "Cash service fee recorded."); } },
      ],
    );
  }

  async function recordSellerPayment() {
    if (!errand) return;
    const amount = Number(sellerAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter the actual amount paid to the seller."); return; }
    if (!sellerMethod) { setError("Choose the seller payment method."); return; }
    await act("recordSellerPayment", { amount, method: sellerMethod, reference: sellerReference.trim() }, "Separate seller/goods payment recorded.");
  }

  async function recordProviderPayout() {
    if (!errand) return;
    const amount = Number(payoutAmount || num(errand.provider_earning_amount) || 0);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid provider payout amount."); return; }
    await act("recordPayout", { amount, method: payoutMethod, reference: payoutReference.trim() }, "Provider payout recorded.");
  }

  async function recordRefund() {
    if (!errand) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid refund amount."); return; }
    await act("recordRefund", { amount, method: errand.payment_method || "M-Pesa", reference: refundReference.trim() }, "Refund recorded for operations reconciliation.");
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

            {isCustomer && !errand.provider_id ? (
              <View style={[common.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="chatbubbles-outline" size={22} color={colors.blue} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>Chat and calls</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Messaging and in-app voice calls unlock when a provider accepts this errand. Your personal number stays private.</Text>
                </View>
              </View>
            ) : null}

            {canCallOnErrand ? (
              <View style={[common.card, { gap: 12 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="call-outline" size={22} color={colors.blue} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "900" }}>Stay connected</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                      {incomingVoiceCall
                        ? (voiceCall?.caller_name || "Your errand contact") + " is calling about this errand."
                        : voiceCall?.status === "active"
                          ? "An in-app call is currently active."
                          : voiceCall?.status === "ringing" && voiceCall.caller_id === user?.id
                            ? "Calling " + (isCustomer ? (errand.provider_name || "your provider") : (errand.customer_name || "the customer")) + "…"
                            : "Call the assigned " + (isCustomer ? "provider" : "customer") + " without sharing personal phone numbers."}
                    </Text>
                  </View>
                </View>
                {incomingVoiceCall ? (
                  <View style={{ flexDirection: "row", gap: 9 }}>
                    <Pressable accessibilityRole="button" disabled={decliningCall} onPress={declineVoiceCall} style={[common.secondaryButton, { flex: 1, borderColor: "#F0C9CD", backgroundColor: "#FFF4F4" }]}>
                      {decliningCall ? <ActivityIndicator color={colors.red} /> : <Text style={{ color: colors.red, fontWeight: "900" }}>Decline</Text>}
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={openVoiceCall} style={[common.primaryButton, { flex: 1, flexDirection: "row", gap: 7 }]}>
                      <Ionicons name="call" size={17} color={colors.white} />
                      <Text style={common.primaryButtonText}>Answer call</Text>
                    </Pressable>
                  </View>
                ) : voiceCall?.status === "active" ? (
                  <Text style={{ color: colors.green, fontSize: 12, fontWeight: "800" }}>Call connected. Return to the call screen to continue talking.</Text>
                ) : voiceCall?.status === "ringing" && voiceCall.caller_id === user?.id ? (
                  <Text style={{ color: colors.blue, fontSize: 12, fontWeight: "800" }}>Ringing… keep this errand open while the other person answers.</Text>
                ) : (
                  <Pressable accessibilityRole="button" onPress={openVoiceCall} style={[common.primaryButton, { flexDirection: "row", gap: 8 }]}>
                    <Ionicons name="call" size={18} color={colors.white} />
                    <Text style={common.primaryButtonText}>Call {isCustomer ? "provider" : "customer"}</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

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

            {((isAssignedProvider || isOperations) && errand.service_payment_method === "cash" && errand.payment_status !== "paid" && ["completion_submitted", "completed", "disputed"].includes(errand.status)) ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Cash service fee</Text>
                <Text style={common.subtitle}>Record the SaMi service fee only after cash has actually been received. Seller/goods payments are recorded separately.</Text>
                <ActionButton title={working === "mark_paid" ? "Recording…" : "Record cash received · KES " + serviceFee.toLocaleString("en-KE")} disabled={Boolean(working)} onPress={recordCashServiceFee} />
              </View>
            ) : null}

            {isOperations && errand.service_payment_method === "in_app" && errand.payment_status !== "paid" ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Verify service payment</Text>
                <Text style={common.subtitle}>Use only after checking the actual M-PESA/provider transaction confirmation. This records the server-side payment ledger; it does not trigger an M-PESA charge.</Text>
                <TextInput value={paymentReference} onChangeText={setPaymentReference} placeholder="Verified transaction reference" placeholderTextColor="#929BAD" style={common.input} autoCapitalize="characters" />
                <ActionButton title={working === "mark_paid" ? "Recording…" : "Record verified M-PESA payment"} disabled={Boolean(working) || paymentReference.trim().length < 4} onPress={() => act("mark_paid", { amount: serviceFee, method: "M-Pesa", reference: paymentReference.trim() }, "Verified service payment recorded.")} />
              </View>
            ) : null}

            {(isAssignedProvider || isOperations) && errand.item_budget_amount !== null && errand.item_budget_amount !== undefined && errand.seller_payment_status !== "paid" && errand.seller_payment_status !== "not_applicable" && errand.status !== "cancelled" ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Separate seller / goods payment</Text>
                <Text style={common.subtitle}>Record the actual amount paid to the shop or seller, not SaMi's service fee.</Text>
                <TextInput value={sellerAmount} onChangeText={setSellerAmount} keyboardType="decimal-pad" placeholder={"Estimated budget KES " + Number(errand.item_budget_amount || 0).toLocaleString("en-KE")} placeholderTextColor="#929BAD" style={common.input} />
                <Text style={common.label}>Payment method</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["M-Pesa", "Cash", "Bank transfer", "Other manual method"] as const).map((method) => (
                    <Pressable key={method} onPress={() => setSellerMethod(method)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: sellerMethod === method ? colors.blue : colors.border, backgroundColor: sellerMethod === method ? colors.blueSoft : colors.white }}>
                      <Text style={{ color: colors.navy, fontSize: 12, fontWeight: "800" }}>{method}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={sellerReference} onChangeText={setSellerReference} placeholder="Seller receipt/reference (optional)" placeholderTextColor="#929BAD" style={common.input} />
                <ActionButton title={working === "recordSellerPayment" ? "Recording…" : "Record seller payment"} disabled={Boolean(working)} onPress={recordSellerPayment} />
              </View>
            ) : null}

            {isOperations && errand.service_payment_method === "in_app" && errand.payment_status === "paid" && errand.status === "completed" && Boolean(errand.provider_id) ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Provider payout</Text>
                <Text style={common.subtitle}>The saved provider share is KES {Number(errand.provider_earning_amount || 0).toLocaleString("en-KE")}. Record the amount actually paid; the backend prevents recording more than the remaining share.</Text>
                <TextInput value={payoutAmount} onChangeText={setPayoutAmount} keyboardType="decimal-pad" placeholder={String(Number(errand.provider_earning_amount || 0))} placeholderTextColor="#929BAD" style={common.input} />
                <Text style={common.label}>Payout method</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["M-Pesa", "Cash", "Bank transfer", "Other manual method"] as const).map((method) => (
                    <Pressable key={method} onPress={() => setPayoutMethod(method)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: payoutMethod === method ? colors.blue : colors.border, backgroundColor: payoutMethod === method ? colors.blueSoft : colors.white }}>
                      <Text style={{ color: colors.navy, fontSize: 12, fontWeight: "800" }}>{method}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={payoutReference} onChangeText={setPayoutReference} placeholder="Payout receipt/reference (optional)" placeholderTextColor="#929BAD" style={common.input} />
                <ActionButton title={working === "recordPayout" ? "Recording…" : "Record provider payout"} disabled={Boolean(working)} onPress={recordProviderPayout} />
              </View>
            ) : null}

            {isOperations && errand.payment_status === "paid" && !["cancelled"].includes(errand.status) ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Refund</Text>
                <Text style={common.subtitle}>Record a refund only after it has actually been sent. The backend rejects refunds that exceed recorded service collections.</Text>
                <TextInput value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" placeholder="Refund amount in KES" placeholderTextColor="#929BAD" style={common.input} />
                <TextInput value={refundReference} onChangeText={setRefundReference} placeholder="Refund transaction reference (optional)" placeholderTextColor="#929BAD" style={common.input} />
                <ActionButton title={working === "recordRefund" ? "Recording…" : "Record refund"} secondary disabled={Boolean(working)} onPress={recordRefund} />
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

            {(isOperations || isAssignedProvider || (isCustomer && Boolean(errand.provider_id))) ? (
              <View style={common.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="chatbubbles-outline" size={20} color={colors.blue} />
                  <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "900" }}>Errand messages</Text>
                </View>
                <Text style={common.subtitle}>Messages are private to this errand and appear here as the conversation updates.</Text>
                {detail?.messages?.length ? detail.messages.map((item) => (
                  <View key={item.id} style={{ backgroundColor: item.sender_id === user?.id ? colors.blueSoft : "#F5F7FB", borderRadius: 13, padding: 12, gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ color: colors.navy, fontWeight: "800", fontSize: 12 }}>{item.sender_name}{item.sender_id === user?.id ? " · You" : ""}</Text>
                      <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(item.created_at).toLocaleString()}</Text>
                    </View>
                    <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{item.message}</Text>
                  </View>
                )) : <Text style={{ color: colors.muted, fontSize: 13 }}>No messages yet.</Text>}
                <TextInput value={messageText} onChangeText={setMessageText} multiline placeholder="Write a task-related message…" placeholderTextColor="#929BAD" textAlignVertical="top" style={[common.input, { minHeight: 75 }]} />
                <ActionButton title={working === "message" ? "Sending…" : "Send message"} disabled={Boolean(working) || !messageText.trim()} onPress={sendMessage} />
              </View>
            ) : null}

            {isCustomer && !errand.provider_id ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 15, fontWeight: "900" }}>Your conversation will appear here</Text>
                <Text style={common.subtitle}>Once a provider is assigned, you can exchange instructions, send updates and make an in-app voice call from this errand.</Text>
              </View>
            ) : null}

            {isCustomer && errand.status === "completed" && errand.provider_id ? (
              <View style={common.card}>
                <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Rate this errand</Text>
                {(detail?.ratings || []).map((rating) => (
                  <View key={rating.id} style={{ borderRadius: 12, backgroundColor: "#F5F7FB", padding: 12, gap: 4 }}>
                    <Text style={{ color: colors.navy, fontWeight: "800" }}>{rating.reviewer_name === user?.full_name ? "Your rating" : rating.reviewer_name}</Text>
                    <Text style={{ color: colors.amber, fontSize: 17 }}>{("★".repeat(Math.max(0,Math.min(5,Number(rating.score)||0)))) + ("☆".repeat(Math.max(0,5-Math.min(5,Number(rating.score)||0))))}</Text>
                    {rating.comment ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{rating.comment}</Text> : null}
                  </View>
                ))}
                {!(detail?.ratings || []).some((rating) => rating.reviewer_name === user?.full_name) ? (
                  <>
                    <Text style={common.subtitle}>How was the provider’s service?</Text>
                    <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
                      {[1,2,3,4,5].map((score) => (
                        <Pressable key={score} accessibilityRole="button" accessibilityLabel={score + " stars"} onPress={() => setRatingScore(score)} style={{ padding: 5 }}>
                          <Text style={{ fontSize: 29, color: score <= ratingScore ? colors.amber : "#C7CDD8" }}>★</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput value={ratingComment} onChangeText={setRatingComment} multiline placeholder="Optional feedback" placeholderTextColor="#929BAD" textAlignVertical="top" style={[common.input,{minHeight:70}]} />
                    <ActionButton title={working === "rating" ? "Submitting…" : "Submit rating"} disabled={Boolean(working)} onPress={submitRating} />
                  </>
                ) : <Text style={{ color: colors.green, fontWeight: "700" }}>You have submitted feedback for this errand.</Text>}
              </View>
            ) : null}

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
