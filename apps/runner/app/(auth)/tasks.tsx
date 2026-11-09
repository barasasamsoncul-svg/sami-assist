import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  apiRequest,
  getRunnerCategories,
  getRunnerOnboarding,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type TaskCategory = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const CUSTOMER_CATEGORIES: TaskCategory[] = [
  {
    key: "groceries",
    title: "Groceries",
    description: "Food shopping and everyday essentials.",
    icon: "basket-outline",
  },
  {
    key: "food_delivery",
    title: "Food & Delivery",
    description: "Restaurant orders, meals and food deliveries.",
    icon: "fast-food-outline",
  },
  {
    key: "pickup_delivery",
    title: "Pick Up & Drop Off",
    description: "Parcel collection and item deliveries.",
    icon: "cube-outline",
  },
  {
    key: "bill_payments",
    title: "Bills & Payments",
    description: "Supported bill and payment errands.",
    icon: "receipt-outline",
  },
  {
    key: "laundry_cleaning",
    title: "Laundry & Dry Cleaning",
    description: "Laundry collection and dry-cleaning errands.",
    icon: "water-outline",
  },
  {
    key: "documents_admin",
    title: "Documents & Government",
    description: "Document collection and administrative errands.",
    icon: "document-text-outline",
  },
  {
    key: "clothing_retail",
    title: "Clothing & Returns",
    description: "Clothing purchases, collections and returns.",
    icon: "shirt-outline",
  },
  {
    key: "shopping_gifts",
    title: "Shopping & Gifts",
    description: "Gift shopping and special purchases.",
    icon: "gift-outline",
  },
  {
    key: "home_services",
    title: "Home Services",
    description: "Supported household and home-service errands.",
    icon: "home-outline",
  },
  {
    key: "pharmacy_health",
    title: "Pharmacy & Health",
    description: "Supported pharmacy and health-related errands.",
    icon: "medkit-outline",
  },
  {
    key: "pet_care",
    title: "Pet Care",
    description: "Pet supplies and pet-related assistance.",
    icon: "paw-outline",
  },
  {
    key: "personal_errand",
    title: "Personal Assistance",
    description: "Everyday personal assistance and errands.",
    icon: "person-outline",
  },
  {
    key: "queue_appointments",
    title: "Queues & Appointments",
    description: "Queue assistance and appointment errands.",
    icon: "time-outline",
  },
  {
    key: "business_support",
    title: "Business Errands",
    description: "Errands and assistance for businesses.",
    icon: "briefcase-outline",
  },
  {
    key: "shopping",
    title: "Shopping & Essentials",
    description: "General shopping and purchase requests.",
    icon: "cart-outline",
  },
  {
    key: "other",
    title: "Custom Errand",
    description: "Other customer errands you can handle.",
    icon: "apps-outline",
  },
];

const BACK_SIZE = 44;

export default function RunnerTaskSelectionScreen() {
  const { colors } = useRunnerTheme();

  const [availableCategories, setAvailableCategories] = useState<
    TaskCategory[]
  >([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadTaskCategories = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setError("");

    try {
      const [catalogue, onboarding] = await Promise.all([
        getRunnerCategories(),
        getRunnerOnboarding(),
      ]);

      const activeKeys = new Set(
        (catalogue.categories || [])
          .map((category) => category.key)
          .filter((key): key is string => typeof key === "string"),
      );

      // Keep Customer's exact task catalogue and order.
      // Only show categories enabled in the Runner database.
      const activeOptions = CUSTOMER_CATEGORIES.filter((category) =>
        activeKeys.has(category.key),
      );

      if (activeOptions.length === 0) {
        throw new Error(
          "No task categories are currently available. Please try again later.",
        );
      }

      if (!mountedRef.current) return;

      setAvailableCategories(activeOptions);

      const savedSelection = onboarding.runner.selectedCategories || [];

      setSelectedCategories(
        savedSelection.filter((key) => activeKeys.has(key)),
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Task categories could not be loaded.",
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTaskCategories();
  }, [loadTaskCategories]);

  // When a validation or save error appears, scroll it into view.
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  function toggleCategory(key: string) {
    setSelectedCategories((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });

    setError("");
  }

  async function saveTaskSelection() {
    if (saving) return;

    if (selectedCategories.length === 0) {
      setError("Select at least one type of errand you can perform.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await apiRequest<{
        ok: boolean;
        message: string;
        selectedCategories: string[];
        nextStep: string;
      }>("/api/runner/me/categories", {
        method: "PUT",
        body: {
          categoryKeys: selectedCategories,
        },
      });

      if (!mountedRef.current) return;

      // Keep this page in the navigation history.
      router.push("/(auth)/transport");
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your task selection could not be saved. Please try again.",
      );
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  const selectedCount = selectedCategories.length;
  const saveDisabled =
    loading || Boolean(loadError) || selectedCount === 0 || saving;

  const isDarkPaper = colors.paper === "#080F1D";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDarkPaper ? "light-content" : "dark-content"}
        backgroundColor={colors.paper}
      />

      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              disabled={saving}
              onPress={() => router.back()}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.6 : saving ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={colors.text}
              />
            </Pressable>

            <View style={styles.brand}>
              <Text style={[styles.brandName, { color: colors.navy }]}>
                SaMi <Text style={{ color: colors.blue }}>Runner</Text>
              </Text>

              <Text
                style={[
                  styles.brandTagline,
                  { color: colors.textMuted },
                ]}
              >
                CONSIDER IT DONE
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          {/* Progress — this is step 1 of 3 */}
          <View style={styles.progressSection}>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.blue },
                ]}
              />
            </View>

            <View style={styles.progressMeta}>
              <Text
                style={[
                  styles.progressText,
                  { color: colors.textMuted },
                ]}
              >
                STEP 1 OF 3 · TASK CATEGORIES
              </Text>

              <View style={styles.progressDots}>
                <View
                  style={[
                    styles.stepDotCurrent,
                    { backgroundColor: colors.blue },
                  ]}
                />
                <View
                  style={[
                    styles.stepDot,
                    { backgroundColor: colors.border },
                  ]}
                />
                <View
                  style={[
                    styles.stepDot,
                    { backgroundColor: colors.border },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Intro */}
          <View style={styles.intro}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.blueSoft },
              ]}
            >
              <Ionicons
                name="checkbox-outline"
                size={27}
                color={colors.blue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: colors.blue }]}>
              YOUR RUNNER SERVICES
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Which tasks can you perform?
            </Text>

            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
            >
              Choose every type of errand you are comfortable handling.
              Customers will be able to request services from the
              categories you select.
            </Text>
          </View>

          {/* Selection summary */}
          <View
            style={[
              styles.selectionSummary,
              {
                backgroundColor: colors.blueSoft,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.summaryIcon}>
              <Ionicons
                name="layers-outline"
                size={21}
                color={colors.blue}
              />
            </View>

            <View style={styles.summaryCopy}>
              <Text
                style={[styles.summaryTitle, { color: colors.text }]}
              >
                {selectedCount === 0
                  ? "No task types selected"
                  : `${selectedCount} task ${
                      selectedCount === 1 ? "type" : "types"
                    } selected`}
              </Text>

              <Text
                style={[
                  styles.summarySubtitle,
                  { color: colors.textMuted },
                ]}
              >
                {selectedCount === 0
                  ? "Select at least one to continue."
                  : "Tap a selected card to remove it."}
              </Text>
            </View>
          </View>

          {/* Body */}
          {loading ? (
            <View
              style={styles.loadingState}
              accessibilityRole="progressbar"
              accessibilityLabel="Loading task categories"
            >
              <ActivityIndicator size="large" color={colors.blue} />

              <Text
                style={[
                  styles.loadingText,
                  { color: colors.textMuted },
                ]}
              >
                Loading task categories...
              </Text>
            </View>
          ) : loadError ? (
            <View
              style={[
                styles.loadError,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={21}
                color={colors.red}
              />

              <Text
                style={[
                  styles.loadErrorText,
                  { color: colors.red },
                ]}
              >
                {loadError}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading categories"
                hitSlop={10}
                onPress={() => void loadTaskCategories()}
                style={({ pressed }) => [
                  styles.retryButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Text
                  style={[styles.retryText, { color: colors.blue }]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.categoryGrid}>
              {availableCategories.map((category) => {
                const selected = selectedCategories.includes(
                  category.key,
                );

                return (
                  <Pressable
                    key={category.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${category.title}. ${category.description}`}
                    onPress={() => toggleCategory(category.key)}
                    style={({ pressed }) => [
                      styles.categoryCard,
                      {
                        backgroundColor: selected
                          ? colors.blueSoft
                          : colors.surface,
                        borderColor: selected
                          ? colors.blue
                          : colors.border,
                        opacity: pressed ? 0.88 : 1,
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      },
                      selected &&
                        Platform.select({
                          ios: {
                            shadowColor: colors.blue,
                            shadowOpacity: 0.12,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 3 },
                          },
                          android: { elevation: 2 },
                          default: {},
                        }),
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        {
                          backgroundColor: selected
                            ? colors.blue
                            : colors.paper,
                        },
                      ]}
                    >
                      <Ionicons
                        name={category.icon}
                        size={23}
                        color={selected ? "#FFFFFF" : colors.blue}
                      />
                    </View>

                    <Text
                      numberOfLines={2}
                      style={[
                        styles.categoryTitle,
                        { color: colors.text },
                      ]}
                    >
                      {category.title}
                    </Text>

                    <Text
                      numberOfLines={3}
                      style={[
                        styles.categoryDescription,
                        { color: colors.textMuted },
                      ]}
                    >
                      {category.description}
                    </Text>

                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: selected
                            ? colors.blue
                            : "transparent",
                          borderColor: selected
                            ? colors.blue
                            : colors.border,
                        },
                      ]}
                    >
                      {selected ? (
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color="#FFFFFF"
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Validation error */}
          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.errorContainer,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.red}
              />

              <Text style={[styles.errorText, { color: colors.red }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Note */}
          <View style={styles.note}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={colors.textMuted}
            />

            <Text
              style={[styles.noteText, { color: colors.textMuted }]}
            >
              Your selections determine which category-specific documents
              may be required later. Shared identity documents will only
              be requested once.
            </Text>
          </View>
        </ScrollView>

        {/* Bottom bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.paper,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save and continue"
            accessibilityHint="Saves your task selection and opens the transport step"
            disabled={saveDisabled}
            onPress={() => void saveTaskSelection()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.blue },
              saveDisabled && styles.disabled,
              pressed && !saveDisabled && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  Save and continue
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color="#FFFFFF"
                />
              </>
            )}
          </Pressable>

          <Text
            style={[styles.bottomHint, { color: colors.textMuted }]}
          >
            Select at least one task category to continue.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 22,
  },

  // Header
  header: {
    minHeight: BACK_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    alignItems: "center",
    gap: 3,
  },

  brandName: {
    fontSize: 19,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },

  brandTagline: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: { width: BACK_SIZE },

  // Progress
  progressSection: { gap: 10 },

  progressTrack: {
    height: 6,
    borderRadius: 6,
    overflow: "hidden",
  },

  progressFill: {
    width: "33.33%",
    height: "100%",
    borderRadius: 6,
  },

  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  progressText: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  progressDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  stepDotCurrent: {
    width: 16,
    height: 6,
    borderRadius: 3,
  },

  // Intro
  intro: { gap: 10 },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
  },

  // Selection summary
  selectionSummary: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCopy: { flex: 1, gap: 4 },

  summaryTitle: {
    fontSize: 13,
    fontWeight: "900",
  },

  summarySubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  // Loading + load error
  loadingState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: { fontSize: 12.5 },

  loadError: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  loadErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

  retryButton: { padding: 6 },

  retryText: {
    fontSize: 12,
    fontWeight: "900",
  },

  // Category grid
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },

  categoryCard: {
    width: "48%",
    minHeight: 164,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    position: "relative",
  },

  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  categoryTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
    paddingRight: 24,
  },

  categoryDescription: {
    fontSize: 11.5,
    lineHeight: 16,
    paddingRight: 2,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 12,
    right: 12,
  },

  // Error + note
  errorContainer: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 3,
  },

  noteText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 10,
    borderTopWidth: 1,
    gap: 9,
  },

  primaryButton: {
    minHeight: 58,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  bottomHint: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 340,
    alignSelf: "center",
  },

  disabled: { opacity: 0.45 },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
});