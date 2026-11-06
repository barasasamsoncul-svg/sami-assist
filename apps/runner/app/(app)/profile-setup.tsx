import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { updateRunnerProfile } from "@/api";
import { useRunnerTheme } from "@/theme";

const VEHICLE_TYPES = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "other", label: "Other" },
] as const;

export default function RunnerProfileSetupScreen() {
  const { colors } = useRunnerTheme();
  const [fullName, setFullName] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (serviceArea.trim().length < 2) {
      setError("Enter your main service area.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await updateRunnerProfile({
        fullName: fullName.trim(),
        serviceArea: serviceArea.trim(),
        vehicleType,
        vehicleRegistration: vehicleRegistration.trim(),
      });
      router.replace("/(app)");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.blue }]}>
            RUNNER ONBOARDING
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Set up your profile
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Add the details needed to create your Runner profile.
            Verification and document submission will follow separately.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Full name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.text }]}>Main service area</Text>
          <TextInput
            value={serviceArea}
            onChangeText={setServiceArea}
            placeholder="e.g. Nairobi West"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.text }]}>Vehicle type</Text>
          <View style={styles.vehicleOptions}>
            {VEHICLE_TYPES.map((vehicle) => {
              const selected = vehicleType === vehicle.value;
              return (
                <Pressable
                  key={vehicle.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setVehicleType(vehicle.value)}
                  style={[
                    styles.vehicleOption,
                    {
                      backgroundColor: selected ? colors.blueSoft : colors.surface,
                      borderColor: selected ? colors.blue : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.vehicleOptionText,
                      { color: selected ? colors.blue : colors.text },
                    ]}
                  >
                    {vehicle.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>
            Vehicle registration (optional)
          </Text>
          <TextInput
            value={vehicleRegistration}
            onChangeText={setVehicleRegistration}
            placeholder="e.g. KXX 123A"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />
        </View>

        <View style={[styles.notice, { backgroundColor: colors.blueSoft }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.blue} />
          <Text style={[styles.noticeText, { color: colors.text }]}>
            Completing this form does not automatically approve your Runner
            account. Operations verification is required before you can go
            online and receive errands.
          </Text>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={save}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.blue },
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Save profile</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 22, paddingTop: 42, paddingBottom: 38, gap: 22 },
  heading: { gap: 9 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 20 },
  form: { gap: 10 },
  label: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  input: {
    minHeight: 51,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  vehicleOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  vehicleOption: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  vehicleOptionText: { fontSize: 11, fontWeight: "800" },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 13,
    borderRadius: 13,
    gap: 9,
  },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
  error: { fontSize: 12, lineHeight: 18 },
  primaryButton: {
    minHeight: 53,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});