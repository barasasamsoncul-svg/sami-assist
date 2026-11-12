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

import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  apiRequest,
  getRunnerCategories,
  getRunnerOnboarding,
} from "@/api";

import { useRunnerTheme } from "@/theme";

type RunnerService = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// SaMi Runner supports exactly these two service types.
// These keys must match the Runner database catalogue and API validation.
const RUNNER_SERVICES: RunnerService[] = [
  {
    key: "pickup_deliver",
    title: "Pick Up & Deliver",
    description:
      "Collect an item from the sender and deliver it to the customer's chosen destination.",
    icon: "cube-outline",
  },
  {
    key: "shop_deliver",
    title: "Shop & Deliver",
    description:
      "Shop for the customer's requested items and deliver the order to them.",
    icon: "cart-outline",
  },
];

const BACK_SIZE = 44;

export default function RunnerTaskSelectionScreen() {
  const { colors, mode } = useRunnerTheme();

  const isDark = mode === "dark";
  const supportingText = isDark ? "#C1CCDA" : "#526176";
  const brandColor = isDark ? "#F5F7FB" : "#000535";
  const actionBlue = isDark ? "#8AB8F8" : "#1F5EAB";
  const buttonBlue = isDark ? "#1D5DAD" : "#174F9F";

  const [availableServices, setAvailableServices] = useState<
    RunnerService[]
  >([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const [accountState, setAccountState] = useState<{
    onboardingStatus: string;
    accountStatus: string;
  } | null>(null);

  useEffect(() => {
    // Re-arm during setup so Strict Mode's effect cycle cannot leave
    // asynchronous requests believing the screen is permanently unmounted.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadTaskCategories = useCallback(async () => {
    if (loadInFlightRef.current) return;

    loadInFlightRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setLoadError("");
    setError("");

    try {
      // GET /api/runner/categories returns the active two-service catalogue.
      // GET /api/runner/me/onboarding returns the authenticated Runner's
      // saved selections and account state.
      const [catalogue, onboarding] = await Promise.all([
        getRunnerCategories(),
        getRunnerOnboarding(),
      ]);

      if (!catalogue.ok || !Array.isArray(catalogue.categories)) {
        throw new Error(
          "The Runner service catalogue returned an invalid response. Please retry.",
        );
      }

      if (
        !onboarding?.ok ||
        !onboarding.runner ||
        !Array.isArray(onboarding.runner.selectedCategories)
      ) {
        throw new Error(
          "Your saved Runner service selection could not be verified. Please retry.",
        );
      }

      const activeKeys = new Set(
        catalogue.categories
          .map((category) => category.key)
          .filter(
            (key): key is string =>
              typeof key === "string" &&
              /^[a-z0-9_]{2,60}$/.test(key),
          ),
      );

      // The API remains authoritative for active service keys.
      // The interface exposes only the two agreed Runner services.
      const missingServices = RUNNER_SERVICES.filter(
        (service) => !activeKeys.has(service.key),
      );

      if (missingServices.length > 0) {
        throw new Error(
          "The Runner service catalogue is not configured for both Pick Up & Deliver and Shop & Deliver. Please contact SaMi Operations.",
        );
      }

      const activeOptions = RUNNER_SERVICES.filter((service) =>
        activeKeys.has(service.key),
      );

      if (!mountedRef.current) return;

      setAvailableServices(activeOptions);

      const savedSelection = onboarding.runner.selectedCategories;

      setSelectedCategories(
        RUNNER_SERVICES
          .filter(
            (service) =>
              activeKeys.has(service.key) &&
              savedSelection.includes(service.key),
          )
          .map((service) => service.key),
      );

      setAccountState({
        onboardingStatus: onboarding.onboardingStatus,
        accountStatus: onboarding.runner.accountStatus,
      });

      hasLoadedOnceRef.current = true;
    } catch (cause) {
      if (!mountedRef.current) return;

      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Runner services could not be loaded.",
      );
    } finally {
      loadInFlightRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Refresh from the server whenever the Runner returns to this screen.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void loadTaskCategories();
    }, [loadTaskCategories]),
  );

  // Scroll validation and save errors into view.
  useEffect(() => {
    if (!error) return;

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [error]);

  const onboardingStatus = accountState?.onboardingStatus ?? "";
  const accountStatus = accountState?.accountStatus ?? "";

  const isApproved = onboardingStatus === "approved";
  const isPendingReview = onboardingStatus === "pending_review";
  const isRestricted = ["suspended", "closed"].includes(accountStatus);

  const sessionExpired =
    /session has expired|sign in again|no valid runner session/i.test(
      loadError,
    );

  const canEditCategories =
    hasLoadedOnceRef.current &&
    Boolean(accountState) &&
    !loading &&
    !refreshing &&
    !loadError &&
    !sessionExpired &&
    !isApproved &&
    !isPendingReview &&
    !isRestricted;

  function toggleCategory(key: string) {
    if (!canEditCategories || saving) return;

    setSelectedCategories((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }

      return [...current, key];
    });

    setError("");
  }

  async function saveTaskSelection() {
    if (saving || loading || loadError || !canEditCategories) return;

    if (selectedCategories.length === 0) {
      setError(
        "Select Pick Up & Deliver, Shop & Deliver, or both.",
      );
      return;
    }

    if (selectedCategories.length > RUNNER_SERVICES.length) {
      setError(
        "You can select only the two available Runner services.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      // PUT /api/runner/me/categories accepts { categoryKeys: string[] }.
      // The server validates active keys and application status, then
      // replaces the saved selection transactionally.
      const response = await apiRequest<{
        ok: boolean;
        message: string;
        selectedCategories: string[];
        nextStep: string;
      }>("/api/runner/me/categories", {
        method: "PUT",
        body: {
          categoryKeys: [...selectedCategories],
        },
      });

      if (
        !response?.ok ||
        !Array.isArray(response.selectedCategories)
      ) {
        throw new Error(
          "The server did not confirm that your Runner services were saved. Refresh your selection before continuing.",
        );
      }

      const requested = [...selectedCategories].sort();
      const confirmed = [...response.selectedCategories].sort();

      if (
        requested.length !== confirmed.length ||
        requested.some((key, index) => key !== confirmed[index])
      ) {
        throw new Error(
          "The server saved a different service selection. Refresh your selection before continuing.",
        );
      }

      if (!mountedRef.current) return;

      // Continue only after the server confirms the exact selection.
      router.push("/(auth)/transport");
    } catch (cause) {
      if (!mountedRef.current) return;

      setError(
        cause instanceof Error
          ? cause.message
          : "Your Runner services could not be saved. Please try again.",
      );
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  const selectedCount = selectedCategories.length;

  const saveDisabled =
    loading ||
    refreshing ||
    Boolean(loadError) ||
    selectedCount === 0 ||
    saving ||
    !canEditCategories;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.paper }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
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
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else if (sessionExpired) {
                  router.replace("/(auth)/login");
                } else if (isApproved) {
                  router.replace("/(app)");
                } else if (isPendingReview) {
                  router.replace("/(app)/profile-setup?mode=status");
                }
              }}
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
              <Text style={[styles.brandName, { color: brandColor }]}>
                SaMi <Text style={{ color: actionBlue }}>Runner</Text>
              </Text>

              <Text
                style={[
                  styles.brandTagline,
                  { color: supportingText },
                ]}
              >
                CONSIDER IT DONE
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          {/* Progress */}
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
                  { backgroundColor: buttonBlue },
                ]}
              />
            </View>

            <View style={styles.progressMeta}>
              <Text
                style={[
                  styles.progressText,
                  { color: supportingText },
                ]}
              >
                {isApproved
                  ? "APPROVED · RUNNER SERVICES"
                  : isPendingReview
                    ? "UNDER REVIEW · RUNNER SERVICES"
                    : isRestricted
                      ? "RESTRICTED · RUNNER SERVICES"
                      : "RUNNER SERVICES · STEP 1 OF 3"}
              </Text>

              <View style={styles.progressDots}>
                <View
                  style={[
                    styles.stepDotCurrent,
                    { backgroundColor: buttonBlue },
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
                color={actionBlue}
              />
            </View>

            <Text style={[styles.eyebrow, { color: actionBlue }]}>
              YOUR RUNNER SERVICES
            </Text>

            <Text style={[styles.title, { color: colors.text }]}>
              Which services can you provide?
            </Text>

            <Text
              style={[styles.subtitle, { color: supportingText }]}
            >
              Choose one or both of the two services SaMi offers. Customers can
              request these services from you based on your selection.
            </Text>
          </View>

          {sessionExpired ? (
            <View
              style={[
                styles.accountNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.red}
              />

              <View style={styles.accountNoticeCopy}>
                <Text
                  style={[
                    styles.accountNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Runner session expired
                </Text>

                <Text
                  style={[
                    styles.accountNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Your saved task selection is still on your account.
                  Sign in again to make changes.
                </Text>

                <Pressable
                  onPress={() => router.replace("/(auth)/login")}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.accountNoticeAction,
                      { color: actionBlue },
                    ]}
                  >
                    Sign in again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isApproved ? (
            <View
              style={[
                styles.accountNotice,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={colors.success}
              />

              <View style={styles.accountNoticeCopy}>
                <Text
                  style={[
                    styles.accountNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Runner account approved
                </Text>

                <Text
                  style={[
                    styles.accountNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Your selected Runner services are read-only after approval.
                </Text>

                <Pressable
                  onPress={() => router.replace("/(app)")}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.accountNoticeAction,
                      { color: actionBlue },
                    ]}
                  >
                    Open Runner dashboard
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isPendingReview ? (
            <View
              style={[
                styles.accountNotice,
                { backgroundColor: colors.warningSoft },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.warning}
              />

              <View style={styles.accountNoticeCopy}>
                <Text
                  style={[
                    styles.accountNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Application under review
                </Text>

                <Text
                  style={[
                    styles.accountNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Your submitted Runner services cannot be changed while
                  SaMi Operations reviews your application.
                </Text>

                <Pressable
                  onPress={() =>
                    router.push("/(app)/profile-setup?mode=status")
                  }
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.accountNoticeAction,
                      { color: actionBlue },
                    ]}
                  >
                    View application status
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : isRestricted ? (
            <View
              style={[
                styles.accountNotice,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.red}
              />

              <View style={styles.accountNoticeCopy}>
                <Text
                  style={[
                    styles.accountNoticeTitle,
                    { color: colors.text },
                  ]}
                >
                  Account access restricted
                </Text>

                <Text
                  style={[
                    styles.accountNoticeText,
                    { color: supportingText },
                  ]}
                >
                  Runner services cannot be changed for this account.
                  Contact SaMi Operations for assistance.
                </Text>
              </View>
            </View>
          ) : null}

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
                color={actionBlue}
              />
            </View>

            <View style={styles.summaryCopy}>
              <Text
                style={[styles.summaryTitle, { color: colors.text }]}
              >
                {selectedCount === 0
                  ? "No Runner services selected"
                  : `${selectedCount} Runner service${
                      selectedCount === 1 ? "" : "s"
                    } selected`}
              </Text>

              <Text
                style={[
                  styles.summarySubtitle,
                  { color: supportingText },
                ]}
              >
                {!canEditCategories
                  ? "Your saved task selection is read-only."
                  : selectedCount === 0
                    ? "Select at least one service to continue."
                    : "Tap a selected card to remove it."}
              </Text>
            </View>
          </View>

          {/* Body */}
          {loading ? (
            <View
              style={styles.loadingState}
              accessibilityRole="progressbar"
              accessibilityLabel="Loading Runner services"
            >
              <ActivityIndicator size="large" color={actionBlue} />

              <Text
                style={[
                  styles.loadingText,
                  { color: supportingText },
                ]}
              >
                Loading Runner services...
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
                accessibilityLabel={
                  sessionExpired
                    ? "Sign in again"
                    : "Retry loading Runner services"
                }
                hitSlop={10}
                onPress={() =>
                  sessionExpired
                    ? router.replace("/(auth)/login")
                    : void loadTaskCategories()
                }
                style={({ pressed }) => [
                  styles.retryButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Text
                  style={[styles.retryText, { color: actionBlue }]}
                >
                  {sessionExpired ? "Sign in" : "Retry"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.serviceGrid}>
              {availableServices.map((service) => {
                const selected = selectedCategories.includes(
                  service.key,
                );

                return (
                  <Pressable
                    key={service.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: selected,
                      disabled: !canEditCategories || saving || refreshing,
                    }}
                    accessibilityLabel={`${service.title}. ${service.description}`}
                    disabled={
                      !canEditCategories || saving || refreshing
                    }
                    onPress={() => toggleCategory(service.key)}
                    style={({ pressed }) => [
                      styles.serviceCard,
                      {
                        backgroundColor: selected
                          ? colors.blueSoft
                          : colors.surface,
                        borderColor: selected
                          ? actionBlue
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
                        styles.serviceIcon,
                        {
                          backgroundColor: selected
                            ? buttonBlue
                            : colors.paper,
                        },
                      ]}
                    >
                      <Ionicons
                        name={service.icon}
                        size={23}
                        color={selected ? "#FFFFFF" : actionBlue}
                      />
                    </View>

                    <Text
                      numberOfLines={2}
                      style={[
                        styles.serviceTitle,
                        { color: colors.text },
                      ]}
                    >
                      {service.title}
                    </Text>

                    <Text
                      numberOfLines={3}
                      style={[
                        styles.serviceDescription,
                        { color: supportingText },
                      ]}
                    >
                      {service.description}
                    </Text>

                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: selected
                            ? buttonBlue
                            : "transparent",
                          borderColor: selected
                            ? actionBlue
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
              color={supportingText}
            />

            <Text
              style={[styles.noteText, { color: supportingText }]}
            >
              Your selected services help SaMi determine the relevant setup
              requirements. Shared identity documents are requested only once.
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
          {sessionExpired ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(auth)/login")}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Sign in again</Text>
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
          ) : isApproved ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(app)")}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                Open Runner dashboard
              </Text>
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
          ) : isPendingReview ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push("/(app)/profile-setup?mode=status")
              }
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                View application status
              </Text>
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </Pressable>
          ) : isRestricted ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save and continue"
              accessibilityHint="Saves your task selection and opens the transport step"
              disabled={saveDisabled}
              onPress={() => void saveTaskSelection()}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: buttonBlue },
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
          )}

          {!isRestricted ? (
            <Text style={[styles.bottomHint, { color: supportingText }]}>
              {sessionExpired
                ? "Your saved application data remains on your account."
                : isApproved
                  ? "Your selected Runner services remain available for reference."
                  : isPendingReview
                    ? "Your application is being reviewed. You can leave this screen and return later."
                    : "Select at least one Runner service to continue."}
            </Text>
          ) : null}
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

  accountNotice: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  accountNoticeCopy: {
    flex: 1,
    gap: 5,
  },

  accountNoticeTitle: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },

  accountNoticeText: {
    fontSize: 12,
    lineHeight: 18,
  },

  accountNoticeAction: {
    fontSize: 12,
    fontWeight: "900",
    paddingTop: 2,
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

  // Runner service cards
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },

  serviceCard: {
    width: "48%",
    minHeight: 164,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    position: "relative",
  },

  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  serviceTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
    paddingRight: 24,
  },

  serviceDescription: {
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