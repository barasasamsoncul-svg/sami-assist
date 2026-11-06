
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import GroceryDetailsStep from "@/components/groceries/GroceryDetailsStep";
import GroceryPreferencesStep, {
  DEFAULT_GROCERY_PREFERENCES,
} from "@/components/groceries/GroceryPreferencesStep";

import ErrandReviewStep, {
  type ErrandReviewLocation,
  type ErrandReviewPaymentMethod,
  type ErrandReviewPaymentOption,
  type ErrandReviewSection,
} from "@/components/errands/ErrandReviewStep";

import {
  createGroceryErrand,
  uploadGroceryPhotos,
} from "@/features/groceries/api";

import type {
  GroceryLocation,
  GroceryPhoto,
  GroceryPreferences,
  GroceryRequestDraft,
} from "@/features/groceries/types";

import {
  parseGroceryBudget,
  validateGroceryDetails,
  validateGroceryPreferences,
  validateGroceryRequest,
} from "@/features/groceries/validation";

import type {
  GroceryValidationErrors,
} from "@/features/groceries/validation";

import { dispatchGet, locationGet } from "@/api";
import { useSaMiTheme } from "@/theme";

type Step = 0 | 1 | 2;

type PricingRule = {
  category: string;
  base_fee: number | string;
  distance_rate_per_km: number | string;
  medium_item_fee: number | string;
  standard_priority_multiplier: number | string;
};

type RoadRoute = {
  distanceKm: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

type PricingResponse = {
  pricing?: PricingRule[];
};

const INITIAL_LOCATION: GroceryLocation = {
  label: "",
  point: null,
};

const GROCERY_PAYMENT_OPTIONS: ErrandReviewPaymentOption[] = [
  {
    value: "cash",
    label: "Cash",
    description: "Cash payment for SaMi's service fee.",
  },
  {
    value: "in_app",
    label: "In-app payment",
    description: "Use SaMi's in-app payment method for the service fee.",
  },
];

function toNumber(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Unavailable";
  }

  const minutes = Math.max(1, Math.ceil(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

function createRequestTitle(): string {
  return "Grocery errand";
}

function ProgressHeader({
  step,
  colors,
}: {
  step: 1 | 2;
  colors: ReturnType<typeof useSaMiTheme>["colors"];
}) {
  const labels = [
    "Details",
    "Preferences",
    "Review",
    "Finding runner",
    "Runner found",
    "Tracking",
    "Completion",
  ];

  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.topRow}>
        <Text
          style={[
            progressStyles.eyebrow,
            { color: colors.blue },
          ]}
        >
          GROCERY ERRAND
        </Text>

        <Text
          style={[
            progressStyles.stepCount,
            { color: colors.textMuted },
          ]}
        >
          STEP {step} OF 7
        </Text>
      </View>

      <View style={progressStyles.track}>
        {labels.map((label, index) => (
          <View
            key={label}
            style={[
              progressStyles.segment,
              {
                backgroundColor:
                  index < step ? colors.blue : colors.border,
              },
            ]}
          />
        ))}
      </View>

      <Text
        style={[
          progressStyles.currentStep,
          { color: colors.textMuted },
        ]}
      >
        {labels[step - 1]}
      </Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 15,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  stepCount: {
    fontSize: 11,
    fontWeight: "800",
  },
  track: {
    flexDirection: "row",
    gap: 5,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 4,
  },
  currentStep: {
    fontSize: 11,
    fontWeight: "700",
  },
});

export default function GroceriesServiceScreen() {
  const { colors, common } = useSaMiTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screenContent: {
          flex: 1,
          paddingTop: 8,
        },
        topBar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
        },
        backIconButton: {
          width: 42,
          height: 42,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 13,
          backgroundColor: colors.surface,
        },
        backIcon: {
          color: colors.navy,
          fontSize: 30,
          lineHeight: 32,
          marginTop: -3,
        },
        topBarText: {
          flex: 1,
          gap: 3,
        },
        pageError: {
          marginHorizontal: 20,
          marginBottom: 10,
        },
      }),
    [colors],
  );

  const [step, setStep] = useState<Step>(0);

  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<GroceryPhoto[]>([]);

  const [pickup, setPickup] = useState<GroceryLocation>({
    ...INITIAL_LOCATION,
  });

  const [delivery, setDelivery] = useState<GroceryLocation>({
    ...INITIAL_LOCATION,
  });

  const [preferences, setPreferences] =
    useState<GroceryPreferences>({
      ...DEFAULT_GROCERY_PREFERENCES,
    });

  const [servicePaymentMethod, setServicePaymentMethod] =
    useState<ErrandReviewPaymentMethod>("cash");

  const [pricingRule, setPricingRule] =
    useState<PricingRule | null>(null);

  const [pricingLoading, setPricingLoading] = useState(true);

  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [errors, setErrors] =
    useState<GroceryValidationErrors>({});

  const [pageError, setPageError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submissionLock = useRef(false);

  const draft: GroceryRequestDraft = {
    description,
    photos,
    pickup,
    delivery,
    preferences,
  };

  const pickupLat = pickup.point?.lat ?? null;
  const pickupLng = pickup.point?.lng ?? null;
  const deliveryLat = delivery.point?.lat ?? null;
  const deliveryLng = delivery.point?.lng ?? null;

  useEffect(() => {
    let active = true;

    setPricingLoading(true);

    dispatchGet<PricingResponse>("pricing")
      .then((result) => {
        if (!active) return;

        const rule = (result.pricing ?? []).find(
          (item) => item.category === "groceries",
        );

        setPricingRule(rule ?? null);
      })
      .catch(() => {
        if (active) {
          setPricingRule(null);
        }
      })
      .finally(() => {
        if (active) {
          setPricingLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      pickupLat === null ||
      pickupLng === null ||
      deliveryLat === null ||
      deliveryLng === null
    ) {
      setRoute(null);
      setRouteError("");
      setRouteLoading(false);
      return;
    }

    let active = true;

    setRoute(null);
    setRouteError("");
    setRouteLoading(true);

    locationGet<{ route: RoadRoute }>({
      action: "route",
      fromLat: String(pickupLat),
      fromLng: String(pickupLng),
      toLat: String(deliveryLat),
      toLng: String(deliveryLng),
    })
      .then((result) => {
        if (!active) return;

        const calculatedRoute = result.route;
        const distance = Number(calculatedRoute?.distanceKm);

        if (
          !calculatedRoute ||
          !Number.isFinite(distance) ||
          distance <= 0
        ) {
          throw new Error(
            "SaMi could not calculate a valid road distance.",
          );
        }

        setRoute({
          ...calculatedRoute,
          distanceKm: distance,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;

        setRouteError(
          error instanceof Error
            ? error.message
            : "Could not calculate the road route.",
        );
      })
      .finally(() => {
        if (active) {
          setRouteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    pickupLat,
    pickupLng,
    deliveryLat,
    deliveryLng,
  ]);

  const serviceFee = useMemo(() => {
    if (!pricingRule || !route) {
      return null;
    }

    const baseFee = Number(pricingRule.base_fee);
    const distanceRate = Number(
      pricingRule.distance_rate_per_km,
    );
    const mediumItemFee = Number(
      pricingRule.medium_item_fee,
    );
    const priorityMultiplier = Number(
      pricingRule.standard_priority_multiplier,
    );

    const values = [
      baseFee,
      distanceRate,
      mediumItemFee,
      priorityMultiplier,
    ];

    if (
      values.some((value) => !Number.isFinite(value)) ||
      baseFee < 0 ||
      distanceRate < 0 ||
      mediumItemFee < 0 ||
      priorityMultiplier <= 0
    ) {
      return null;
    }

    const calculated =
      (baseFee +
        route.distanceKm * distanceRate +
        mediumItemFee) *
      priorityMultiplier;

    if (!Number.isFinite(calculated) || calculated < 0) {
      return null;
    }

    return Math.round(calculated);
  }, [pricingRule, route]);

  const feeLoading = pricingLoading || routeLoading;

  const reviewSections = useMemo<ErrandReviewSection[]>(() => {
    const budget = parseGroceryBudget(
      preferences.budgetAmount,
    );

    const preferenceItems: ErrandReviewSection["items"] = [
      {
        label: "Preferred timing",
        value:
          preferences.preferredTime === "asap"
            ? "As soon as possible"
            : "Scheduled",
      },
      {
        label: "Scheduled date and time",
        value: preferences.scheduledTime,
        optional: true,
      },
      {
        label: "Shopping budget",
        value:
          budget === null
            ? ""
            : `KSh ${new Intl.NumberFormat("en-KE", {
                maximumFractionDigits: 2,
              }).format(budget)}`,
        optional: true,
      },
      {
        label: "Additional instructions",
        value: preferences.notes,
        multiline: true,
        optional: true,
      },
    ];

    const sections: ErrandReviewSection[] = [
      {
        id: "preferences",
        title: "Shopping preferences",
        items: preferenceItems,
        note:
          "The shopping budget is separate from SaMi's service fee. The cost of the groceries is paid separately.",
      },
    ];

    if (route) {
      sections.push({
        id: "route",
        title: "Route estimate",
        items: [
          {
            label: "Road distance",
            value: `${route.distanceKm.toFixed(1)} km`,
          },
          {
            label: "Estimated travel time",
            value: formatDuration(route.durationSeconds),
          },
        ],
        note:
          "The final route and service fee are recalculated by SaMi when the request is submitted.",
      });
    }

    return sections;
  }, [preferences, route]);

  const reviewLocations = useMemo<ErrandReviewLocation[]>(
    () => [
      {
        title: "Pickup",
        address: pickup.label,
        kind: "pickup",
      },
      {
        title: "Grocery delivery",
        address: delivery.label,
        kind: "destination",
      },
    ],
    [pickup.label, delivery.label],
  );

  function updateDescription(value: string) {
    setDescription(value);

    setErrors((current) => ({
      ...current,
      description: undefined,
    }));

    setPageError("");
  }

  function updatePickup(value: GroceryLocation) {
    setPickup(value);

    setErrors((current) => ({
      ...current,
      pickup: undefined,
    }));

    setPageError("");
  }

  function updateDelivery(value: GroceryLocation) {
    setDelivery(value);

    setErrors((current) => ({
      ...current,
      delivery: undefined,
    }));

    setPageError("");
  }

  function updatePhotos(value: GroceryPhoto[]) {
    setPhotos(value);
    setPageError("");
  }

  function continueFromDetails() {
    setPageError("");

    const result = validateGroceryDetails({
      description,
      pickup,
      delivery,
    });

    setErrors(result.errors);

    if (!result.valid) {
      return;
    }

    if (!pickup.point || !delivery.point) {
      setPageError(
        "Select both pickup and drop-off points on the map so SaMi can calculate the route.",
      );
      return;
    }

    if (routeLoading) {
      setPageError(
        "Please wait while SaMi calculates the road distance.",
      );
      return;
    }

    if (routeError) {
      setPageError(
        "SaMi could not calculate this route. Check both locations and try again.",
      );
      return;
    }

    if (!route) {
      setPageError(
        "A valid road route is required before continuing.",
      );
      return;
    }

    setStep(1);
  }

  function continueFromPreferences() {
    setPageError("");

    const result = validateGroceryPreferences(preferences);

    setErrors(result.errors);

    if (!result.valid) {
      return;
    }

    setStep(2);
  }

  function goBack() {
    if (submitting) return;

    setPageError("");
    setErrors({});

    setStep((current) =>
      Math.max(0, current - 1) as Step,
    );
  }

  function editDetails() {
    setPageError("");
    setErrors({});
    setStep(0);
  }

  function editPreferences() {
    setPageError("");
    setErrors({});
    setStep(1);
  }

  async function submitRequest() {
    if (submissionLock.current) return;

    setPageError("");

    const validation = validateGroceryRequest(draft);

    setErrors(validation.errors);

    if (!validation.valid) {
      setStep(
        validation.errors.description ||
          validation.errors.pickup ||
          validation.errors.delivery
          ? 0
          : 1,
      );
      return;
    }

    if (!route || !pickup.point || !delivery.point) {
      setPageError(
        "The pickup and drop-off route is unavailable. Return to Details and check the locations.",
      );
      setStep(0);
      return;
    }

    if (feeLoading || serviceFee === null) {
      setPageError(
        "The SaMi service fee is unavailable. Please wait for it to finish calculating and try again.",
      );
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);

    try {
      const budget = parseGroceryBudget(
        preferences.budgetAmount,
      );

      const created = await createGroceryErrand({
        title: createRequestTitle(),
        description: description.trim(),
        serviceArea: pickup.label.trim(),

        pickupLocation: pickup.label.trim(),
        pickupLatitude: pickup.point.lat,
        pickupLongitude: pickup.point.lng,

        destinationLocation: delivery.label.trim(),
        destinationLatitude: delivery.point.lat,
        destinationLongitude: delivery.point.lng,

        preferredTime: preferences.preferredTime,
        scheduledTime:
          preferences.preferredTime === "scheduled"
            ? preferences.scheduledTime.trim()
            : undefined,

        purchaseBudgetAmount: budget,
        customerNotes: preferences.notes.trim(),

        distanceKm: route.distanceKm,
        itemSize: "medium",
        priority: "standard",
        servicePaymentMethod: servicePaymentMethod,
      });

      let photoUploadWarning = "";

      if (photos.length > 0) {
        try {
          await uploadGroceryPhotos(
            created.errand.id,
            photos,
          );
        } catch {
          photoUploadWarning =
            "Your grocery errand was created, but its reference photos could not be uploaded. You can still open the errand.";
        }
      }

      const openErrand = () => {
        router.replace({
          pathname: "/(app)/errand/[id]",
          params: {
            id: created.errand.id,
          },
        });
      };

      if (photoUploadWarning) {
        Alert.alert(
          "Errand created",
          photoUploadWarning,
          [
            {
              text: "Continue",
              onPress: openErrand,
            },
          ],
          { cancelable: false },
        );
      } else {
        Alert.alert(
          "Request submitted",
          `Your grocery errand ${created.errand.public_code} has been submitted.`,
          [
            {
              text: "View errand",
              onPress: openErrand,
            },
          ],
          { cancelable: false },
        );
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Your grocery errand could not be submitted.",
      );
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={common.screen}>
      <View style={styles.screenContent}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={submitting}
            onPress={() => {
              if (step > 0) {
                goBack();
              } else {
                router.back();
              }
            }}
            style={styles.backIconButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <View style={styles.topBarText}>
            <Text style={common.eyebrow}>
              SAMI ERRANDS
            </Text>

            <Text style={common.title}>
              Groceries
            </Text>
          </View>
        </View>

        {step < 2 ? (
          <ProgressHeader
            step={step === 0 ? 1 : 2}
            colors={colors}
          />
        ) : null}

        {pageError && step !== 2 ? (
          <Text
            accessibilityRole="alert"
            style={[common.error, styles.pageError]}
          >
            {pageError}
          </Text>
        ) : null}

        {routeError && step === 0 ? (
          <Text
            accessibilityRole="alert"
            style={[common.error, styles.pageError]}
          >
            {routeError}
          </Text>
        ) : null}

        {step === 0 ? (
          <GroceryDetailsStep
            description={description}
            onDescriptionChange={updateDescription}
            photos={photos}
            onPhotosChange={updatePhotos}
            pickup={pickup}
            onPickupChange={updatePickup}
            delivery={delivery}
            onDeliveryChange={updateDelivery}
            onContinue={continueFromDetails}
            errors={errors}
          />
        ) : null}

        {step === 1 ? (
          <GroceryPreferencesStep
            value={preferences}
            onChange={(value) => {
              setPreferences(value);
              setErrors({});
              setPageError("");
            }}
            onBack={goBack}
            onContinue={continueFromPreferences}
            errors={errors}
          />
        ) : null}

        {step === 2 ? (
          <ErrandReviewStep
            categoryLabel="Groceries"
            requestTitle={createRequestTitle()}
            description={description}
            photos={photos.map((photo) => ({
              uri: photo.uri,
              name: photo.name,
            }))}
            sections={reviewSections}
            locations={reviewLocations}
            serviceFee={serviceFee}
            feeLoading={feeLoading}
            currency="KSh"
            feeLabel="SaMi service fee"
            feeExplanation="This is SaMi's service fee for organising your grocery errand. The cost of groceries is separate and is paid directly for the goods."
            paymentMethod={servicePaymentMethod}
            onPaymentMethodChange={setServicePaymentMethod}
            paymentOptions={GROCERY_PAYMENT_OPTIONS}
            error={pageError}
            onBack={goBack}
            onConfirm={submitRequest}
            onEditDetails={editDetails}
            onEditPreferences={editPreferences}
            confirmLabel="Confirm grocery errand"
            submitting={submitting}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
