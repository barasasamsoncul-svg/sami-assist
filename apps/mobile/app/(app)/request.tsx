import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import MapPicker, { type MapPoint } from "@/components/MapPicker";
import { apiRequest, dispatchGet, dispatchPost, locationGet } from "@/api";
import { colors, common } from "@/theme";

type PricingRule = {
  category: string; service_name?: string; base_fee: number | string; distance_rate_per_km: number | string;
  small_item_fee: number | string; medium_item_fee: number | string; large_item_fee: number | string; bulky_item_fee: number | string;
  value_surcharge_threshold: number | string; value_surcharge_rate: number | string;
  low_priority_multiplier: number | string; standard_priority_multiplier: number | string;
  high_priority_multiplier: number | string; urgent_priority_multiplier: number | string;
};
type RoadRoute = { distanceKm: number; durationSeconds: number; coordinates: [number, number][] };
const categories = [
  ["shopping", "Shopping and buying items"],
  ["clothing_retail", "Clothing purchase or return"],
  ["pickup_delivery", "Pickup or drop-off"],
  ["documents_admin", "Documents and administration"],
  ["personal_errand", "Personal errand"],
  ["queue_appointments", "Queue or appointment"],
  ["business_support", "Business support"],
  ["local_assistance", "Local assistance"],
  ["other", "Other legitimate task"],
] as const;
const sizes = [
  ["none", "No item to carry"],
  ["small", "Small item"],
  ["medium", "Medium bag"],
  ["large", "Large item or several bags"],
  ["bulky", "Bulky, heavy or fragile"],
] as const;
const priorities = [["low", "Low"], ["standard", "Standard"], ["high", "High"], ["urgent", "Urgent"]] as const;

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: "default" | "numeric" | "phone-pad" | "decimal-pad";
}) {
  return <View><Text style={common.label}>{label}</Text><TextInput
    value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#929BAD"
    multiline={multiline} keyboardType={keyboardType || "default"} textAlignVertical={multiline ? "top" : "center"}
    style={[common.input, multiline && { minHeight: 100 }]}
  /></View>;
}

function ChoiceRow({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={common.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => (
          <Pressable key={option[0]} onPress={() => onChange(option[0])} style={{
            paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
            borderColor: value === option[0] ? colors.blue : colors.border,
            backgroundColor: value === option[0] ? colors.blueSoft : colors.white,
          }}>
            <Text style={{ color: value === option[0] ? colors.navy : colors.muted, fontSize: 13, fontWeight: value === option[0] ? "800" : "600" }}>{option[1]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function RequestScreen() {
  const { category: categoryParam, description: descriptionParam, pickupLat: pickupLatParam, pickupLng: pickupLngParam } = useLocalSearchParams<{ category?: string; description?: string; pickupLat?: string; pickupLng?: string }>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("personal_errand");
  const [serviceArea, setServiceArea] = useState("Nairobi");
  const [pickupLocation, setPickupLocation] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [pickup, setPickup] = useState<MapPoint | null>(null);
  const [destination, setDestination] = useState<MapPoint | null>(null);
  const [selecting, setSelecting] = useState<"pickup" | "destination">("pickup");
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationBusy, setLocationBusy] = useState("");
  const [routeError, setRouteError] = useState("");
  const [manualDistance, setManualDistance] = useState("1");
  const [itemSize, setItemSize] = useState("none");
  const [itemBudget, setItemBudget] = useState("");
  const [priority, setPriority] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaInAppAvailable, setMpesaInAppAvailable] = useState(false);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    dispatchGet<{ pricing: PricingRule[] }>("pricing").then((data) => setRules(data.pricing || [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    dispatchGet<{ paymentMethods?: { cash?: boolean; mpesaInApp?: boolean } }>("paymentMethods")
      .then((data) => setMpesaInAppAvailable(data.paymentMethods?.mpesaInApp === true))
      .catch(() => setMpesaInAppAvailable(false));
  }, []);

  useEffect(() => {
    if (!mpesaInAppAvailable && paymentMethod === "in_app") setPaymentMethod("cash");
  }, [mpesaInAppAvailable, paymentMethod]);

  useEffect(() => {
    if (categoryParam && categories.some(([value]) => value === categoryParam)) {
      setCategory(categoryParam);
    }
  }, [categoryParam]);

  useEffect(() => {
    if (typeof descriptionParam !== "string" || !descriptionParam.trim()) return;
    const initialDescription = descriptionParam.trim();
    setDescription((current) => current || initialDescription);
    setTitle((current) => current || initialDescription.split(/\s+/).slice(0, 6).join(" ").slice(0, 80));
  }, [descriptionParam]);

  useEffect(() => {
    const lat = typeof pickupLatParam === "string" ? Number(pickupLatParam) : NaN;
    const lng = typeof pickupLngParam === "string" ? Number(pickupLngParam) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    setPickup((current) => current || { lat, lng });
    setPickupLocation((current) => current || "Pickup pin selected on home map (" + lat.toFixed(5) + ", " + lng.toFixed(5) + ")");
    setSelecting("destination");
  }, [pickupLatParam, pickupLngParam]);

  useEffect(() => {
    if (!pickup || !destination) { setRoute(null); setRouteError(""); setRouteLoading(false); return; }
    let active = true;
    setRouteLoading(true); setRouteError("");
    const timeout = setTimeout(() => {
      locationGet<{ route: RoadRoute }>({
        action: "route", fromLat: String(pickup.lat), fromLng: String(pickup.lng),
        toLat: String(destination.lat), toLng: String(destination.lng),
      }).then((result) => {
        if (!active) return;
        setRoute(result.route);
        setManualDistance(result.route.distanceKm.toFixed(2));
      }).catch((e) => {
        if (active) { setRoute(null); setRouteError(e instanceof Error ? e.message : "Could not calculate a road route."); }
      }).finally(() => { if (active) setRouteLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timeout); };
  }, [pickup, destination]);

  const rule = rules.find((row) => row.category === category);
  const paymentOptions: readonly (readonly [string, string])[] = mpesaInAppAvailable
    ? [["cash", "Cash"], ["in_app", "M-PESA in app"]]
    : [["cash", "Cash"]];
  const estimate = useMemo(() => {
    if (!rule) return null;
    const n = (value: number | string | null | undefined) => Number(value ?? 0);
    const distance = route?.distanceKm ?? Math.max(0, Number(manualDistance) || 0);
    const sizeFee = itemSize === "none" ? 0 : n(rule[itemSize + "_item_fee" as keyof PricingRule] as string | number);
    const goodsValue = Math.max(0, Number(itemBudget) || 0);
    const valueFee = Math.max(0, goodsValue - n(rule.value_surcharge_threshold)) * n(rule.value_surcharge_rate) / 100;
    const priorityMultiplier = n(rule[(priority + "_priority_multiplier") as keyof PricingRule] as string | number) || 1;
    return Math.round((n(rule.base_fee) + distance * n(rule.distance_rate_per_km) + sizeFee + valueFee) * priorityMultiplier);
  }, [rule, route, manualDistance, itemSize, itemBudget, priority]);

  function onMapPoint(slot: "pickup" | "destination", point: MapPoint) {
    if (slot === "pickup") setPickup(point); else setDestination(point);
    setRoute(null);
  }

  async function useCurrentLocation() {
    setLocationBusy("gps"); setRouteError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow SaMi to use your location, or set the pickup pin on the map.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setPickup(point);
      setPickupLocation("Phone GPS pin (" + point.lat.toFixed(5) + ", " + point.lng.toFixed(5) + ")");
      setSelecting("destination");
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "Your current location could not be read.");
    } finally { setLocationBusy(""); }
  }

  async function findAddress(slot: "pickup" | "destination") {
    const address = slot === "pickup" ? pickupLocation.trim() : destinationLocation.trim();
    if (address.length < 3) { setRouteError("Enter a full address or landmark before searching."); return; }
    setLocationBusy(slot); setRouteError("");
    try {
      const result = await locationGet<{ point: MapPoint; label: string }>({ action: "geocode", q: address });
      if (slot === "pickup") {
        setPickup(result.point);
        setPickupLocation(result.label || address);
        setSelecting("destination");
      } else {
        setDestination(result.point);
        setDestinationLocation(result.label || address);
        setSelecting("destination");
      }
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "That address could not be found. Try a nearby landmark or pin the location directly.");
    } finally { setLocationBusy(""); }
  }

  function advanceStep() {
    setError("");
    if (step === 0) {
      if (title.trim().length < 3 || description.trim().length < 5 || serviceArea.trim().length < 2) {
        setError("Add a clear task title, task details and service area before continuing.");
        return;
      }
    }
    if (step === 1) {
      const hasPickup = Boolean(pickupLocation.trim() || pickup);
      const hasDestination = Boolean(destinationLocation.trim() || destination);
      if (hasPickup !== hasDestination) {
        setError("Add both pickup and drop-off details, or leave both for a single-location errand.");
        return;
      }
      if (pickup && destination && !route && !routeLoading && !routeError && !(Number(manualDistance) > 0)) {
        setError("SaMi needs a valid road distance to estimate this errand.");
        return;
      }
    }
    setStep((current) => Math.min(2, current + 1));
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  }

  async function submit() {
    setBusy(true); setError(""); setSuccess("");
    try {
      if (title.trim().length < 3 || description.trim().length < 5 || serviceArea.trim().length < 2) throw new Error("Add a clear task title, task details and service area.");
      if ((pickupLocation.trim() || destinationLocation.trim()) && !route && !(Number(manualDistance) > 0)) throw new Error("Choose the map points or enter a valid estimated distance.");
      if (paymentMethod === "in_app" && !mpesaInAppAvailable) throw new Error("M-PESA in-app payments are temporarily unavailable. Please choose cash.");
      if (paymentMethod === "in_app" && !mpesaPhone.trim()) throw new Error("Enter the Kenyan M-PESA number for the payment prompt.");
      const created = await dispatchPost<{ errand: { id: string; public_code: string; service_fee_amount: number | string } }>("createErrand", {
        title: title.trim(), description: description.trim(), category, serviceArea: serviceArea.trim(),
        pickupLocation: pickupLocation.trim(), destinationLocation: destinationLocation.trim(),
        pickupLatitude: pickup?.lat ?? "", pickupLongitude: pickup?.lng ?? "",
        destinationLatitude: destination?.lat ?? "", destinationLongitude: destination?.lng ?? "",
        distanceKm: route?.distanceKm ?? (Number(manualDistance) || 1), itemSize,
        itemBudgetAmount: itemBudget === "" ? "" : Number(itemBudget), priority, servicePaymentMethod: paymentMethod,
      });
      let paymentMessage = "Choose cash payment for the SaMi service fee. Any shop/seller payment stays separate.";
      if (paymentMethod === "in_app") {
        try {
          await apiRequest("/api/payments/mpesa/checkout", { method: "POST", body: { errandId: created.errand.id, phone: mpesaPhone.trim() } });
          paymentMessage = "M-PESA payment prompt requested. Follow the prompt on your phone.";
        } catch (e) {
          paymentMessage = "The errand was saved, but M-PESA checkout could not start: " + (e instanceof Error ? e.message : "please retry from support.");
        }
      }
      setSuccess("Request " + created.errand.public_code + " received. Service fee: KES " + Number(created.errand.service_fee_amount || estimate || 0).toLocaleString("en-KE") + ". " + paymentMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request could not be submitted.");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.navy, fontSize: 23 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>New request</Text>
            <Text style={common.title}>What needs doing?</Text>
          </View>
        </View>

        {success ? (
          <View style={[common.card, { borderColor: "#A7E3C8", padding: 22 }]}>
            <Text style={{ color: colors.green, fontWeight: "900", fontSize: 12, letterSpacing: 1 }}>REQUEST CREATED</Text>
            <Text style={{ color: colors.navy, fontWeight: "900", fontSize: 21, lineHeight: 28 }}>{success}</Text>
            <Text style={common.subtitle}>Your request is now in SaMi. Approved providers can accept eligible open requests, and operations can assign a provider.</Text>
            <Pressable onPress={() => router.replace("/(app)/errands")} style={common.primaryButton}><Text style={common.primaryButtonText}>View my errands</Text></Pressable>
            <Pressable onPress={() => { setSuccess(""); setStep(0); setTitle(""); setDescription(""); setPickupLocation(""); setDestinationLocation(""); setPickup(null); setDestination(null); setRoute(null); }} style={common.secondaryButton}><Text style={common.secondaryButtonText}>Create another request</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={{ gap: 12, paddingVertical: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={common.eyebrow}>CREATE AN ERRAND</Text>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>STEP {step + 1} OF 3</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 7 }}>
                {[0, 1, 2].map((item) => <View key={item} style={{ flex: 1, height: 5, borderRadius: 4, backgroundColor: item <= step ? colors.green : colors.border }} />)}
              </View>
              <Text style={{ color: colors.navy, fontSize: 19, fontWeight: "900" }}>{["Tell us what you need", "Choose the locations", "Review and confirm"][step]}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{["Describe the task and choose the closest service category.", "Set pickup and drop-off details so SaMi can estimate the travel distance.", "Review the service fee, handling details and payment method before posting."][step]}</Text>
            </View>
            {step === 0 ? (
            <View style={common.card}>
              <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Describe the task</Text>
              <Field label="Task title" value={title} onChangeText={setTitle} placeholder="e.g. Collect a parcel from town" />
              <ChoiceRow label="Task category" options={categories} value={category} onChange={setCategory} />
              <Field label="What should the provider do?" value={description} onChangeText={setDescription} placeholder="Include instructions, item details or what success looks like." multiline />
              <Field label="Service area / town" value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Nairobi, Westlands" />
            </View>

            ) : null}

            {step === 1 ? (
            <View style={common.card}>
              <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Set locations on the map</Text>
              <Text style={common.subtitle}>Choose pickup, then drop-off. Road distance is calculated by SaMi's routing service.</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => setSelecting("pickup")} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: selecting === "pickup" ? colors.blue : colors.border, backgroundColor: selecting === "pickup" ? colors.blueSoft : colors.white }}>
                  <Text style={{ color: colors.navy, fontSize: 13, fontWeight: "800", textAlign: "center" }}>1. Select pickup</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 4 }}>{pickup ? pickup.lat.toFixed(4) + ", " + pickup.lng.toFixed(4) : "Not set"}</Text>
                </Pressable>
                <Pressable onPress={() => setSelecting("destination")} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: selecting === "destination" ? colors.blue : colors.border, backgroundColor: selecting === "destination" ? colors.blueSoft : colors.white }}>
                  <Text style={{ color: colors.navy, fontSize: 13, fontWeight: "800", textAlign: "center" }}>2. Select drop-off</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 4 }}>{destination ? destination.lat.toFixed(4) + ", " + destination.lng.toFixed(4) : "Not set"}</Text>
                </Pressable>
              </View>
              <MapPicker selecting={selecting} pickup={pickup} destination={destination} route={route?.coordinates.map(([lat,lng]) => ({ lat, lng })) || []} onPoint={onMapPoint} />
              <Pressable disabled={locationBusy==="gps"} onPress={useCurrentLocation} style={[common.secondaryButton,{opacity:locationBusy==="gps"?0.6:1}]}>
                {locationBusy==="gps" ? <ActivityIndicator color={colors.blue}/> : <Text style={common.secondaryButtonText}>Use my current location as pickup</Text>}
              </Pressable>
              <Field label="Pickup address / landmark" value={pickupLocation} onChangeText={setPickupLocation} placeholder="Street, building, shop or landmark" />
              <Pressable disabled={locationBusy==="pickup"} onPress={() => findAddress("pickup")} style={[common.secondaryButton,{opacity:locationBusy==="pickup"?0.6:1}]}>
                {locationBusy==="pickup" ? <ActivityIndicator color={colors.blue}/> : <Text style={common.secondaryButtonText}>Find pickup on map</Text>}
              </Pressable>
              <Field label="Destination address / landmark" value={destinationLocation} onChangeText={setDestinationLocation} placeholder="Where the errand should end" />
              <Pressable disabled={locationBusy==="destination"} onPress={() => findAddress("destination")} style={[common.secondaryButton,{opacity:locationBusy==="destination"?0.6:1}]}>
                {locationBusy==="destination" ? <ActivityIndicator color={colors.blue}/> : <Text style={common.secondaryButtonText}>Find destination on map</Text>}
              </Pressable>
              {routeLoading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ActivityIndicator color={colors.blue} /><Text style={{ color: colors.muted }}>Calculating driving route…</Text></View> : null}
              {route ? <Text style={{ color: colors.green, fontWeight: "800" }}>Road route: {route.distanceKm.toFixed(2)} km • about {Math.max(1, Math.round(route.durationSeconds / 60))} min</Text> : null}
              {routeError ? <Text style={common.error}>{routeError}</Text> : null}
              {!route ? <Field label="Estimated distance (km)" value={manualDistance} onChangeText={setManualDistance} placeholder="1.0" keyboardType="decimal-pad" /> : null}
            </View>

            ) : null}

            {step === 2 ? (
            <View style={common.card}>
              <Text style={{ color: colors.navy, fontSize: 17, fontWeight: "800" }}>Review & confirm</Text>
              <ChoiceRow label="Item size" options={sizes} value={itemSize} onChange={setItemSize} />
              <Field label="Estimated item / goods budget (KES, optional)" value={itemBudget} onChangeText={setItemBudget} placeholder="0" keyboardType="decimal-pad" />
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>This is the expected seller/goods cost, not SaMi's fee. Pay the seller separately when the goods are bought or received.</Text>
              <ChoiceRow label="Priority" options={priorities} value={priority} onChange={setPriority} />
              <View style={{ backgroundColor: colors.blueSoft, padding: 16, borderRadius: 16, gap: 5 }}>
                <Text style={{ color: colors.navy, fontSize: 12, fontWeight: "800" }}>ESTIMATED SAMI SERVICE FEE</Text>
                <Text style={{ color: colors.navy, fontSize: 28, fontWeight: "900" }}>{estimate === null ? "Checking…" : "KES " + estimate.toLocaleString("en-KE")}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>Final distance and fee are recalculated by the server when you submit.</Text>
              </View>
              <ChoiceRow label="How will you pay SaMi's service fee?" options={paymentOptions} value={paymentMethod} onChange={setPaymentMethod} />
              {!mpesaInAppAvailable ? <Text style={common.subtitle}>In-app M-PESA is temporarily unavailable. You can still pay SaMi's service fee in cash. Any shop or seller payment remains separate.</Text> : null}
              {paymentMethod === "in_app" ? <Field label="M-PESA phone number" value={mpesaPhone} onChangeText={setMpesaPhone} placeholder="07XXXXXXXX" keyboardType="phone-pad" /> : null}
            </View>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {step > 0 ? <Pressable accessibilityRole="button" onPress={previousStep} disabled={busy} style={[common.secondaryButton, { flex: 1 }]}><Text style={common.secondaryButtonText}>Back</Text></Pressable> : null}
              {step < 2 ? (
                <Pressable accessibilityRole="button" onPress={advanceStep} style={[common.primaryButton, { flex: 2 }]}><Text style={common.primaryButtonText}>Continue · Step {step + 2}</Text></Pressable>
              ) : (
                <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[common.primaryButton, { flex: 2 }, busy && { opacity: 0.65 }]}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Confirm & post errand</Text>}
                </Pressable>
              )}
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>No quote stage. You see the estimated service fee before submitting; a provider or operations team can then take the request.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
