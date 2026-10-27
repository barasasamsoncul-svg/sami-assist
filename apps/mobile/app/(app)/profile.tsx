import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { dispatchGet, dispatchPost } from "@/api";
import { colors, common } from "@/theme";

const categories = [
  ["shopping", "Shopping"],
  ["clothing_retail", "Clothing purchases and returns"],
  ["pickup_delivery", "Pickups and drop-offs"],
  ["documents_admin", "Documents and admin tasks"],
  ["personal_errand", "Personal errands"],
  ["queue_appointments", "Queues and appointments"],
  ["business_support", "Business support"],
  ["local_assistance", "Local assistance"],
  ["other", "Other legitimate errands"],
] as const;

type Profile = {
  provider_type?: "individual" | "business" | "team";
  business_name?: string | null;
  service_categories?: string[];
  service_area?: string | null;
  bio?: string | null;
  approval_status?: string;
};

export default function ProviderProfileScreen() {
  const [providerType, setProviderType] = useState<"individual" | "business" | "team">("individual");
  const [businessName, setBusinessName] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [bio, setBio] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["other"]);
  const [approvalStatus, setApprovalStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    dispatchGet<{ profile: Profile }>("providerProfile")
      .then(({ profile }) => {
        if (!active) return;
        setProviderType(profile.provider_type || "individual");
        setBusinessName(profile.business_name || "");
        setServiceArea(profile.service_area || "");
        setBio(profile.bio || "");
        setSelectedCategories(Array.isArray(profile.service_categories) ? profile.service_categories : []);
        setApprovalStatus(profile.approval_status || "pending");
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggleCategory(category: string) {
    setSelectedCategories((current) => current.includes(category) ? current.filter((v) => v !== category) : [...current, category]);
  }

  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await dispatchPost<{ approvalStatus: string; message: string }>("updateProviderProfile", {
        providerType, businessName: businessName.trim(), serviceArea: serviceArea.trim(),
        bio: bio.trim(), serviceCategories: selectedCategories,
      });
      setApprovalStatus(result.approvalStatus);
      setNotice(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provider profile could not be saved.");
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={common.screen}>
      <ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.navy, fontSize: 23 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={common.eyebrow}>Provider onboarding</Text>
            <Text style={common.title}>Your service profile</Text>
          </View>
        </View>

        <View style={common.card}>
          <Text style={{ color: colors.navy, fontSize: 16, fontWeight: "800" }}>Application status: {approvalStatus.replaceAll("_", " ").toUpperCase()}</Text>
          <Text style={common.subtitle}>Tell customers and SaMi operations what work you can handle and where you can work. New or rejected applications need approval before accepting errands.</Text>
        </View>

        {loading ? <ActivityIndicator color={colors.blue} /> : null}
        <View style={common.card}>
          <Text style={common.label}>Provider type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              ["individual", "Individual"],
              ["business", "Business"],
              ["team", "Team"],
            ] as const).map(([value, label]) => (
              <Pressable key={value} onPress={() => setProviderType(value)} style={{
                flex: 1, padding: 11, borderRadius: 12, borderWidth: 1,
                borderColor: providerType === value ? colors.blue : colors.border,
                backgroundColor: providerType === value ? colors.blueSoft : colors.white, alignItems: "center",
              }}>
                <Text style={{ color: colors.navy, fontSize: 12, fontWeight: "800" }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {providerType !== "individual" ? (
            <View>
              <Text style={common.label}>Business / team name</Text>
              <TextInput value={businessName} onChangeText={setBusinessName} placeholder="Name shown on your provider profile" placeholderTextColor="#929BAD" style={common.input} />
            </View>
          ) : null}

          <View>
            <Text style={common.label}>Service area</Text>
            <TextInput value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Nairobi, Westlands, Kilimani" placeholderTextColor="#929BAD" style={common.input} />
          </View>

          <View>
            <Text style={common.label}>Short introduction</Text>
            <TextInput value={bio} onChangeText={setBio} multiline textAlignVertical="top" placeholder="Describe your experience, transport, availability or useful skills." placeholderTextColor="#929BAD" style={[common.input, { minHeight: 105 }]} />
          </View>

          <View style={{ gap: 9 }}>
            <Text style={common.label}>Errand categories you can handle</Text>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>Choose every category you can reliably support. Only eligible requests are shown to you.</Text>
            {categories.map(([value, label]) => {
              const selected = selectedCategories.includes(value);
              return (
                <Pressable key={value} onPress={() => toggleCategory(value)} style={{
                  flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
                  borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.blue : colors.border,
                  backgroundColor: selected ? colors.blueSoft : colors.white,
                }}>
                  <View style={{ height: 21, width: 21, borderRadius: 6, borderWidth: 1.5, borderColor: selected ? colors.blue : "#AAB3C2", backgroundColor: selected ? colors.blue : colors.white, alignItems: "center", justifyContent: "center" }}>
                    {selected ? <Text style={{ color: colors.white, fontSize: 13, fontWeight: "900" }}>✓</Text> : null}
                  </View>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: selected ? "800" : "500", flex: 1 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <Text accessibilityRole="alert" style={common.error}>{error}</Text> : null}
        {notice ? <Text style={{ color: colors.green, backgroundColor: "#E5F6EE", borderRadius: 12, padding: 12, lineHeight: 20 }}>{notice}</Text> : null}
        <Pressable disabled={loading || saving} onPress={save} style={[common.primaryButton, (loading || saving) && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={common.primaryButtonText}>Save provider profile</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
