
import { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSaMiTheme } from "@/theme";

export type ErrandReviewPaymentMethod = "cash" | "in_app";

export type ErrandReviewItem = {
  label: string;
  value: string;
  multiline?: boolean;
  optional?: boolean;
};

export type ErrandReviewSection = {
  id: string;
  title: string;
  items: ErrandReviewItem[];
  note?: string;
};

export type ErrandReviewLocation = {
  title: string;
  address: string;
  kind?: "pickup" | "destination" | "location";
};

export type ErrandReviewPhoto = {
  uri: string;
  name?: string;
};

export type ErrandReviewPaymentOption = {
  value: ErrandReviewPaymentMethod;
  label: string;
  description: string;
};

export type ErrandReviewStepProps = {
  categoryLabel: string;
  requestTitle: string;
  description: string;

  photos?: ErrandReviewPhoto[];
  sections?: ErrandReviewSection[];
  locations?: ErrandReviewLocation[];

  serviceFee: number | null;
  feeLoading?: boolean;
  currency?: string;
  feeLabel?: string;
  feeExplanation?: string;

  paymentMethod?: ErrandReviewPaymentMethod;
  onPaymentMethodChange?: (
    method: ErrandReviewPaymentMethod,
  ) => void;
  paymentOptions?: ErrandReviewPaymentOption[];

  paymentPhone?: string;
  onPaymentPhoneChange?: (value: string) => void;

  notice?: string;
  error?: string;

  onBack: () => void;
  onConfirm: () => void;

  onEditDetails?: () => void;
  onEditPreferences?: () => void;

  confirmLabel?: string;
  submitting?: boolean;
};

function formatAmount(
  amount: number,
  currency: string,
): string {
  return `${currency} ${new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export default function ErrandReviewStep({
  categoryLabel,
  requestTitle,
  description,

  photos = [],
  sections = [],
  locations = [],

  serviceFee,
  feeLoading = false,
  currency = "KSh",
  feeLabel = "SaMi service fee",
  feeExplanation =
    "This is SaMi's service fee for organising and completing your errand. Separate shopping or purchase costs are not included.",

  paymentMethod = "cash",
  onPaymentMethodChange,
  paymentOptions = [],

  paymentPhone = "",
  onPaymentPhoneChange,

  notice,
  error,

  onBack,
  onConfirm,

  onEditDetails,
  onEditPreferences,

  confirmLabel = "Confirm & post errand",
  submitting = false,
}: ErrandReviewStepProps) {
  const { colors, mode } = useSaMiTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
        },
        content: {
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 38,
          gap: 15,
        },

        heading: {
          gap: 11,
          marginBottom: 3,
        },
        headingTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        headingEyebrow: {
          color: colors.blue,
          fontSize: 10,
          fontWeight: "900",
          letterSpacing: 1.2,
        },
        stepCount: {
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          marginTop: 5,
        },
        statusBadge: {
          backgroundColor: colors.successSoft,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 30,
        },
        statusText: {
          color: colors.success,
          fontSize: 11,
          fontWeight: "800",
        },
        progressTrack: {
          flexDirection: "row",
          gap: 5,
        },
        progressSegment: {
          flex: 1,
          height: 4,
          borderRadius: 4,
        },
        headingTitle: {
          color: colors.text,
          fontSize: 26,
          fontWeight: "800",
          letterSpacing: -0.6,
          marginTop: 5,
        },
        headingSubtitle: {
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 20,
        },

        card: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 17,
          padding: 16,
          gap: 13,
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        cardHeaderText: {
          flex: 1,
          gap: 4,
        },
        cardTitle: {
          color: colors.text,
          fontSize: 14,
          fontWeight: "800",
        },
        categoryLabel: {
          color: colors.blue,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        editButton: {
          minHeight: 32,
          justifyContent: "center",
          paddingHorizontal: 5,
        },
        editAction: {
          color: colors.blue,
          fontSize: 12,
          fontWeight: "800",
        },
        requestTitle: {
          color: colors.text,
          fontSize: 17,
          fontWeight: "800",
          lineHeight: 24,
        },
        description: {
          color: colors.text,
          fontSize: 13,
          lineHeight: 21,
        },
        emptyDescription: {
          color: colors.textMuted,
          fontStyle: "italic",
        },

        photoSection: {
          gap: 9,
          marginTop: 3,
        },
        smallLabel: {
          color: colors.textMuted,
          fontSize: 10,
          fontWeight: "800",
          letterSpacing: 0.8,
        },
        photoList: {
          gap: 10,
          paddingRight: 4,
        },
        photoWrapper: {
          width: 82,
          height: 82,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: colors.blueSoft,
          borderWidth: 1,
          borderColor: colors.border,
        },
        photo: {
          width: "100%",
          height: "100%",
        },
        photoName: {
          color: colors.textMuted,
          fontSize: 10,
          marginTop: 3,
        },

        reviewRows: {
          gap: 13,
        },
        reviewRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
        },
        reviewLabel: {
          flex: 1,
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        reviewValue: {
          flex: 1.4,
          color: colors.text,
          fontSize: 12,
          fontWeight: "600",
          lineHeight: 19,
          textAlign: "right",
        },
        multilineValue: {
          textAlign: "left",
          flex: 1,
        },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          width: "100%",
        },
        sectionNote: {
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 19,
        },
        inlineEdit: {
          alignSelf: "flex-start",
          paddingVertical: 5,
        },

        locations: {
          gap: 17,
        },
        locationRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        locationMarker: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
        },
        locationMarkerText: {
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: "900",
        },
        locationContent: {
          flex: 1,
          gap: 4,
        },
        locationTitle: {
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "600",
        },
        locationAddress: {
          color: colors.text,
          fontSize: 13,
          fontWeight: "600",
          lineHeight: 19,
        },

        feeCard: {
          backgroundColor: colors.blueSoft,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 17,
          padding: 16,
          gap: 13,
        },
        feeHeader: {
          flexDirection: "row",
          alignItems: "center",
          gap: 11,
        },
        feeIcon: {
          width: 41,
          height: 41,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        },
        feeIconText: {
          color: colors.blue,
          fontSize: 10,
          fontWeight: "900",
        },
        feeHeaderText: {
          flex: 1,
          gap: 4,
        },
        feeSubheading: {
          color: colors.textMuted,
          fontSize: 11,
        },
        feeAmountRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        },
        feeAmountLabel: {
          color: colors.text,
          fontSize: 12,
          fontWeight: "600",
          flex: 1,
        },
        feeAmount: {
          color: colors.navy,
          fontSize: 22,
          fontWeight: "900",
        },
        feeExplanation: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 18,
        },
        loadingRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 35,
        },
        loadingText: {
          color: colors.textMuted,
          fontSize: 12,
        },
        feeError: {
          color: colors.red,
          fontSize: 12,
          lineHeight: 19,
        },

        paymentExplanation: {
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        paymentOptions: {
          gap: 10,
        },
        paymentOption: {
          borderWidth: 1,
          borderRadius: 13,
          padding: 13,
          gap: 7,
        },
        paymentOptionSelected: {
          backgroundColor: colors.blueSoft,
          borderColor: colors.blue,
        },
        paymentOptionUnselected: {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
        paymentOptionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        },
        paymentOptionTitle: {
          color: colors.text,
          fontSize: 13,
          fontWeight: "800",
          flex: 1,
        },
        paymentOptionDescription: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 17,
        },
        selectionCircle: {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 1.5,
          alignItems: "center",
          justifyContent: "center",
        },
        selectionCircleSelected: {
          backgroundColor: colors.blue,
          borderColor: colors.blue,
        },
        selectionCircleUnselected: {
          backgroundColor: "transparent",
          borderColor: colors.border,
        },
        selectionTick: {
          color: mode === "dark" ? "#081321" : "#FFFFFF",
          fontSize: 11,
          fontWeight: "900",
        },
        phoneSection: {
          gap: 8,
          marginTop: 5,
        },
        phoneInput: {
          minHeight: 49,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.input,
          paddingHorizontal: 13,
          color: colors.text,
          fontSize: 14,
        },

        feedback: {
          padding: 12,
          borderRadius: 12,
          fontSize: 12,
          lineHeight: 19,
        },
        notice: {
          color: colors.success,
          backgroundColor: colors.successSoft,
        },
        error: {
          color: colors.red,
          backgroundColor: colors.dangerSoft,
        },

        actions: {
          flexDirection: "row",
          gap: 11,
          marginTop: 3,
        },
        backButton: {
          flex: 1,
          minHeight: 53,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 13,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
        },
        backButtonText: {
          color: colors.navy,
          fontSize: 13,
          fontWeight: "800",
        },
        confirmButton: {
          flex: 1.7,
          minHeight: 53,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 13,
          backgroundColor: colors.blue,
          paddingHorizontal: 12,
        },
        confirmButtonText: {
          color: mode === "dark" ? "#081321" : "#FFFFFF",
          fontSize: 13,
          fontWeight: "900",
          textAlign: "center",
        },
        disabled: {
          opacity: 0.45,
        },
        footerNote: {
          color: colors.textMuted,
          fontSize: 10,
          lineHeight: 17,
          textAlign: "center",
          paddingHorizontal: 12,
        },
      }),
    [colors, mode],
  );

  const validFee =
    serviceFee !== null &&
    Number.isFinite(serviceFee) &&
    serviceFee >= 0;

  const canConfirm =
    !submitting &&
    !feeLoading &&
    validFee;

  const visibleSections = sections.filter(
    (section) =>
      section.items.some(
        (item) => !(item.optional && !item.value.trim()),
      ) || Boolean(section.note),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <View style={styles.headingTop}>
          <View>
            <Text style={styles.headingEyebrow}>
              SHARED ERRAND FLOW
            </Text>

            <Text style={styles.stepCount}>
              STEP 3 OF 7
            </Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              Review
            </Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          {Array.from({ length: 7 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.progressSegment,
                {
                  backgroundColor:
                    index < 3 ? colors.blue : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <Text style={styles.headingTitle}>
          Review & Confirm
        </Text>

        <Text style={styles.headingSubtitle}>
          Check your errand information, locations and service fee
          before submitting your request.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              Your errand
            </Text>

            <Text style={styles.categoryLabel}>
              {categoryLabel}
            </Text>
          </View>

          {onEditDetails ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit errand details"
              onPress={onEditDetails}
              disabled={submitting}
              hitSlop={8}
              style={styles.editButton}
            >
              <Text style={styles.editAction}>
                Edit
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.requestTitle}>
          {requestTitle.trim() || "Errand request"}
        </Text>

        <Text
          style={[
            styles.description,
            !description.trim() && styles.emptyDescription,
          ]}
        >
          {description.trim() || "No task description provided."}
        </Text>

        {photos.length > 0 ? (
          <View style={styles.photoSection}>
            <Text style={styles.smallLabel}>
              REFERENCE PHOTOS ({photos.length})
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoList}
            >
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`}>
                  <View style={styles.photoWrapper}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityLabel={
                        photo.name ||
                        `Errand attachment ${index + 1}`
                      }
                    />
                  </View>
                  {photo.name ? (
                    <Text
                      style={styles.photoName}
                      numberOfLines={1}
                    >
                      {photo.name}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {visibleSections.map((section) => (
        <View key={section.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {section.title}
            </Text>

            {section.id === "preferences" &&
            onEditPreferences ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit errand preferences"
                disabled={submitting}
                onPress={onEditPreferences}
                hitSlop={8}
                style={styles.editButton}
              >
                <Text style={styles.editAction}>
                  Edit
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.reviewRows}>
            {section.items.map((item, index) => {
              if (item.optional && !item.value.trim()) {
                return null;
              }

              return (
                <View
                  key={`${section.id}-${item.label}-${index}`}
                  style={styles.reviewRow}
                >
                  <Text style={styles.reviewLabel}>
                    {item.label}
                  </Text>

                  <Text
                    style={[
                      styles.reviewValue,
                      item.multiline && styles.multilineValue,
                    ]}
                  >
                    {item.value.trim() || "Not provided"}
                  </Text>
                </View>
              );
            })}
          </View>

          {section.note ? (
            <>
              <View style={styles.divider} />

              <Text style={styles.sectionNote}>
                {section.note}
              </Text>
            </>
          ) : null}
        </View>
      ))}

      {locations.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Errand locations
          </Text>

          <View style={styles.locations}>
            {locations.map((location, index) => {
              const kind = location.kind || "location";

              const markerLabel =
                kind === "pickup"
                  ? "P"
                  : kind === "destination"
                    ? "D"
                    : "•";

              const markerColor =
                kind === "destination"
                  ? colors.success
                  : colors.blue;

              return (
                <View
                  key={`${location.title}-${index}`}
                  style={styles.locationRow}
                >
                  <View
                    style={[
                      styles.locationMarker,
                      { backgroundColor: markerColor },
                    ]}
                  >
                    <Text style={styles.locationMarkerText}>
                      {markerLabel}
                    </Text>
                  </View>

                  <View style={styles.locationContent}>
                    <Text style={styles.locationTitle}>
                      {location.title}
                    </Text>

                    <Text style={styles.locationAddress}>
                      {location.address.trim() || "Address not provided"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.feeCard}>
        <View style={styles.feeHeader}>
          <View style={styles.feeIcon}>
            <Text style={styles.feeIconText}>
              KSh
            </Text>
          </View>

          <View style={styles.feeHeaderText}>
            <Text style={styles.cardTitle}>
              Service fee
            </Text>

            <Text style={styles.feeSubheading}>
              {feeLabel}
            </Text>
          </View>
        </View>

        {feeLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.blue} />

            <Text style={styles.loadingText}>
              Calculating your service fee...
            </Text>
          </View>
        ) : !validFee ? (
          <Text style={styles.feeError}>
            The service fee is not available yet. Please check
            your request and try again.
          </Text>
        ) : (
          <>
            <View style={styles.divider} />

            <View style={styles.feeAmountRow}>
              <Text style={styles.feeAmountLabel}>
                {feeLabel}
              </Text>

              <Text style={styles.feeAmount}>
                {formatAmount(serviceFee, currency)}
              </Text>
            </View>

            <Text style={styles.feeExplanation}>
              {feeExplanation}
            </Text>
          </>
        )}
      </View>

      {paymentOptions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Payment method
          </Text>

          <Text style={styles.paymentExplanation}>
            Choose how you will pay SaMi's service fee.
          </Text>

          <View style={styles.paymentOptions}>
            {paymentOptions.map((option) => {
              const selected =
                paymentMethod === option.value;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected,
                    checked: selected,
                    disabled: !onPaymentMethodChange,
                  }}
                  disabled={!onPaymentMethodChange || submitting}
                  onPress={() =>
                    onPaymentMethodChange?.(option.value)
                  }
                  style={[
                    styles.paymentOption,
                    selected
                      ? styles.paymentOptionSelected
                      : styles.paymentOptionUnselected,
                  ]}
                >
                  <View style={styles.paymentOptionHeader}>
                    <Text style={styles.paymentOptionTitle}>
                      {option.label}
                    </Text>

                    <View
                      style={[
                        styles.selectionCircle,
                        selected
                          ? styles.selectionCircleSelected
                          : styles.selectionCircleUnselected,
                      ]}
                    >
                      {selected ? (
                        <Text style={styles.selectionTick}>
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.paymentOptionDescription}>
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {paymentMethod === "in_app" &&
          onPaymentPhoneChange ? (
            <View style={styles.phoneSection}>
              <Text style={styles.smallLabel}>
                M-PESA PHONE NUMBER
              </Text>

              <TextInput
                value={paymentPhone}
                onChangeText={onPaymentPhoneChange}
                placeholder="07XXXXXXXX"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={styles.phoneInput}
                accessibilityLabel="M-PESA phone number"
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Text
          accessibilityRole="alert"
          style={[styles.feedback, styles.notice]}
        >
          {notice}
        </Text>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.feedback, styles.error]}
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={onBack}
          style={[
            styles.backButton,
            submitting && styles.disabled,
          ]}
        >
          <Text style={styles.backButtonText}>
            Back
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !canConfirm,
            busy: submitting,
          }}
          disabled={!canConfirm}
          onPress={onConfirm}
          style={[
            styles.confirmButton,
            !canConfirm && styles.disabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator
              color={mode === "dark" ? "#081321" : "#FFFFFF"}
            />
          ) : (
            <Text style={styles.confirmButtonText}>
              {confirmLabel}
            </Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.footerNote}>
        Your request will enter SaMi's runner-matching stage
        after confirmation.
      </Text>
    </ScrollView>
  );
}
