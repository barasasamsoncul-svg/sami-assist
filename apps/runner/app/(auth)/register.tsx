
import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  apiRequest,
  requestRunnerRegistrationOtp,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type RunnerCategory = {
  key: string;
};

type CategoryPresentation = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const CATEGORY_PRESENTATION: Record<
  string,
  CategoryPresentation
> = {
  groceries: {
    title: "Groceries",
    description: "Shopping for food and daily essentials",
    icon: "basket-outline",
  },
  food_delivery: {
    title: "Food delivery",
    description: "Collecting and delivering restaurant orders",
    icon: "fast-food-outline",
  },
  pickup_delivery: {
    title: "Pick-ups and deliveries",
    description: "Moving parcels and items between locations",
    icon: "cube-outline",
  },
  bill_payments: {
    title: "Bill payments",
    description: "Helping customers make payments",
    icon: "receipt-outline",
  },
  laundry_cleaning: {
    title: "Laundry and cleaning",
    description: "Laundry collection and cleaning tasks",
    icon: "water-outline",
  },
  documents_admin: {
    title: "Documents and admin",
    description: "Document collection and administrative errands",
    icon: "document-text-outline",
  },
  clothing_retail: {
    title: "Clothing and retail",
    description: "Clothing purchases and retail collections",
    icon: "shirt-outline",
  },
  home_services: {
    title: "Home services",
    description: "Home assistance and service appointments",
    icon: "home-outline",
  },
  pharmacy_health: {
    title: "Pharmacy and health",
    description: "Pharmacy collections and health-related errands",
    icon: "medkit-outline",
  },
  pet_care: {
    title: "Pet care",
    description: "Pet supplies and pet-related assistance",
    icon: "paw-outline",
  },
  queue_appointments: {
    title: "Queues and appointments",
    description: "Queue assistance and appointment errands",
    icon: "time-outline",
  },
  personal_errand: {
    title: "Personal errands",
    description: "Everyday tasks and personal assistance",
    icon: "person-outline",
  },
  business_support: {
    title: "Business support",
    description: "Business collections and support errands",
    icon: "briefcase-outline",
  },
  shopping_gifts: {
    title: "Shopping and gifts",
    description: "Gift shopping and special purchases",
    icon: "gift-outline",
  },
  shopping: {
    title: "General shopping",
    description: "Other shopping and purchase requests",
    icon: "cart-outline",
  },
  other: {
    title: "Other tasks",
    description: "Other errands you are comfortable handling",
    icon: "apps-outline",
  },
};

function formatCategoryKey(key: string): string {
  return key
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function getCategoryPresentation(
  key: string,
): CategoryPresentation {
  return (
    CATEGORY_PRESENTATION[key] || {
      title: formatCategoryKey(key),
      description: "Select this task if you can perform it.",
      icon: "briefcase-outline",
    }
  );
}

export default function RunnerRegistrationScreen() {
  const { colors } = useRunnerTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [categories, setCategories] = useState<
    RunnerCategory[]
  >([]);

  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([]);

  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [categoryLoadError, setCategoryLoadError] =
    useState("");

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();

  const validEmail =
    normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const validName =
    normalizedName.length >= 2 &&
    normalizedName.length <= 120;

  const selectedCount = selectedCategories.length;

  const canContinue =
    validName &&
    validEmail &&
    selectedCount > 0 &&
    !loadingCategories &&
    !categoryLoadError &&
    !submitting;

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        presentation: getCategoryPresentation(category.key),
      })),
    [categories],
  );

  async function loadCategories() {
    setLoadingCategories(true);
    setCategoryLoadError("");

    try {
      const result = await apiRequest<{
        ok: boolean;
        categories: RunnerCategory[];
      }>("/api/runner/categories");

      const activeCategories = Array.isArray(
        result.categories,
      )
        ? result.categories.filter(
            (category) =>
              typeof category.key === "string" &&
              /^[a-z0-9_]+$/.test(category.key),
          )
        : [];

      if (!activeCategories.length) {
        throw new Error(
          "No task categories are currently available.",
        );
      }

      setCategories(activeCategories);

      setSelectedCategories((current) =>
        current.filter((key) =>
          activeCategories.some(
            (category) => category.key === key,
          ),
        ),
      );
    } catch (cause) {
      setCategoryLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not load task categories.",
      );
    } finally {
      setLoadingCategories(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  function toggleCategory(key: string) {
    setSelectedCategories((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }

      return [...current, key];
    });

    setError("");
  }

  async function continueRegistration() {
    if (!validName) {
      setError("Enter your full name to continue.");
      return;
    }

    if (!validEmail) {
      setError("Enter a valid email address.");
      return;
    }

    if (!selectedCategories.length) {
      setError(
        "Choose at least one type of task you can perform.",
      );
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await requestRunnerRegistrationOtp({
        fullName: normalizedName,
        email: normalizedEmail,
        categoryKeys: selectedCategories,
      });

      router.push({
        pathname: "/(auth)/verify",
        params: {
          challengeId: result.challengeId,
          destination: result.destination,
          purpose: "register",
        },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration could not be started. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[
        styles.safeArea,
        { backgroundColor: colors.paper },
      ]}
    >
      <StatusBar
        barStyle={
          colors.paper === "#080F1D"
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={colors.paper}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={
          Platform.OS === "ios" ? "padding" : "height"
        }
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={[
                styles.backButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={21}
                color={colors.text}
              />
            </Pressable>

            <View style={styles.headerBrand}>
              <Text
                style={[
                  styles.brandName,
                  { color: colors.navy },
                ]}
              >
                SaMi{" "}
                <Text style={{ color: colors.blue }}>
                  Runner
                </Text>
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

          <View style={styles.progressHeader}>
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

            <Text
              style={[
                styles.progressText,
                { color: colors.textMuted },
              ]}
            >
              STEP 1 OF 3 · REGISTRATION
            </Text>
          </View>

          <View style={styles.intro}>
            <Text
              style={[
                styles.eyebrow,
                { color: colors.blue },
              ]}
            >
              BECOME A RUNNER
            </Text>

            <Text
              style={[
                styles.title,
                { color: colors.text },
              ]}
            >
              Let's get you started.
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted },
              ]}
            >
              Create your Runner account and tell us
              which tasks you are able to handle.
              You can complete your verification
              documents in the next step.
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text },
              ]}
            >
              Your details
            </Text>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Full name
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={colors.textMuted}
                />

                <TextInput
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setError("");
                  }}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={120}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.label,
                  { color: colors.text },
                ]}
              >
                Email address
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={colors.textMuted}
                />

                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError("");
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  maxLength={254}
                  style={[
                    styles.input,
                    { color: colors.text },
                  ]}
                  accessibilityLabel="Email address"
                />
              </View>

              <Text
                style={[
                  styles.fieldHint,
                  { color: colors.textMuted },
                ]}
              >
                We will send a verification code to this email.
              </Text>
            </View>
          </View>

          <View style={styles.categorySection}>
            <View style={styles.categoryHeading}>
              <View style={styles.categoryHeadingText}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.text },
                  ]}
                >
                  Which tasks can you perform?
                </Text>

                <Text
                  style={[
                    styles.categorySubtitle,
                    { color: colors.textMuted },
                  ]}
                >
                  Select all that apply. Your choices
                  help us determine your verification
                  requirements.
                </Text>
              </View>

              <View
                style={[
                  styles.selectionCount,
                  { backgroundColor: colors.blueSoft },
                ]}
              >
                <Text
                  style={[
                    styles.selectionCountText,
                    { color: colors.blue },
                  ]}
                >
                  {selectedCount} selected
                </Text>
              </View>
            </View>

            {loadingCategories ? (
              <View style={styles.loadingCategories}>
                <ActivityIndicator
                  size="small"
                  color={colors.blue}
                />

                <Text
                  style={[
                    styles.loadingText,
                    { color: colors.textMuted },
                  ]}
                >
                  Loading available tasks...
                </Text>
              </View>
            ) : categoryLoadError ? (
              <View
                style={[
                  styles.loadError,
                  { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color={colors.red}
                />

                <Text
                  style={[
                    styles.loadErrorText,
                    { color: colors.red },
                  ]}
                >
                  {categoryLoadError}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadCategories()}
                  style={styles.retryButton}
                >
                  <Text
                    style={[
                      styles.retryText,
                      { color: colors.blue },
                    ]}
                  >
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.categoryGrid}>
                {categoryOptions.map((category) => {
                  const selected =
                    selectedCategories.includes(
                      category.key,
                    );

                  return (
                    <Pressable
                      key={category.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() =>
                        toggleCategory(category.key)
                      }
                      style={[
                        styles.categoryCard,
                        {
                          backgroundColor: selected
                            ? colors.blueSoft
                            : colors.surface,
                          borderColor: selected
                            ? colors.blue
                            : colors.border,
                        },
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
                          name={category.presentation.icon}
                          size={21}
                          color={
                            selected
                              ? "#FFFFFF"
                              : colors.blue
                          }
                        />
                      </View>

                      <View style={styles.categoryCopy}>
                        <Text
                          style={[
                            styles.categoryTitle,
                            { color: colors.text },
                          ]}
                        >
                          {category.presentation.title}
                        </Text>

                        <Text
                          style={[
                            styles.categoryDescription,
                            { color: colors.textMuted },
                          ]}
                        >
                          {category.presentation.description}
                        </Text>
                      </View>

                      <Ionicons
                        name={
                          selected
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={21}
                        color={
                          selected
                            ? colors.blue
                            : colors.muted
                        }
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
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

              <Text
                style={[
                  styles.errorText,
                  { color: colors.red },
                ]}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              disabled={!canContinue}
              onPress={() => void continueRegistration()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.blue },
                !canContinue && styles.disabled,
                pressed && canContinue && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Continue
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>

            <View style={styles.signInRow}>
              <Text
                style={[
                  styles.signInPrompt,
                  { color: colors.textMuted },
                ]}
              >
                Already have a Runner account?
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() =>
                  router.replace("/(auth)/login")
                }
              >
                <Text
                  style={[
                    styles.signInLink,
                    { color: colors.blue },
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>
            </View>

            <Text
              style={[
                styles.footerNote,
                { color: colors.textMuted },
              ]}
            >
              Your account will remain pending until
              you complete verification and SaMi
              Operations approves your application.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  keyboardContainer: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 25,
  },

  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    height: 42,
    width: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  headerBrand: {
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
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2,
  },

  headerSpacer: {
    width: 42,
  },

  progressHeader: {
    gap: 9,
  },

  progressTrack: {
    height: 5,
    borderRadius: 5,
    overflow: "hidden",
  },

  progressFill: {
    width: "33.33%",
    height: "100%",
    borderRadius: 5,
  },

  progressText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  intro: {
    gap: 10,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  title: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 21,
  },

  formSection: {
    gap: 17,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },

  fieldGroup: {
    gap: 8,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
  },

  inputContainer: {
    minHeight: 55,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    minHeight: 53,
    paddingVertical: 10,
    fontSize: 14,
  },

  fieldHint: {
    fontSize: 10,
    lineHeight: 16,
  },

  categorySection: {
    gap: 14,
  },

  categoryHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  categoryHeadingText: {
    flex: 1,
    gap: 6,
  },

  categorySubtitle: {
    fontSize: 11,
    lineHeight: 17,
  },

  selectionCount: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  selectionCountText: {
    fontSize: 9,
    fontWeight: "900",
  },

  loadingCategories: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  loadingText: {
    fontSize: 11,
  },

  categoryGrid: {
    gap: 10,
  },

  categoryCard: {
    minHeight: 83,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  categoryCopy: {
    flex: 1,
    gap: 4,
  },

  categoryTitle: {
    fontSize: 12,
    fontWeight: "900",
  },

  categoryDescription: {
    fontSize: 10,
    lineHeight: 15,
  },

  loadError: {
    padding: 13,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  loadErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  retryButton: {
    padding: 5,
  },

  retryText: {
    fontSize: 11,
    fontWeight: "900",
  },

  errorContainer: {
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },

  footer: {
    gap: 14,
    paddingTop: 3,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  signInPrompt: {
    fontSize: 11,
  },

  signInLink: {
    fontSize: 11,
    fontWeight: "900",
  },

  footerNote: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.82,
  },
});
