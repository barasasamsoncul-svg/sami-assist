
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSaMiTheme } from "@/theme";

import type {
  GroceryPreferences,
  GroceryPreferredTime,
} from "@/features/groceries/types";

import type {
  GroceryValidationErrors,
} from "@/features/groceries/validation";

export const DEFAULT_GROCERY_PREFERENCES: GroceryPreferences = {
  preferredTime: "asap",
  scheduledTime: "",
  budgetAmount: "",
  notes: "",
};

type GroceryPreferencesStepProps = {
  value: GroceryPreferences;
  onChange: (value: GroceryPreferences) => void;
  onBack: () => void;
  onContinue: () => void;
  errors?: GroceryValidationErrors;
};

export default function GroceryPreferencesStep({
  value,
  onChange,
  onBack,
  onContinue,
  errors = {},
}: GroceryPreferencesStepProps) {
  const { colors, common, mode } = useSaMiTheme();

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
          gap: 20,
        },
        heading: {
          gap: 7,
        },
        eyebrow: {
          color: colors.blue,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.3,
          textTransform: "uppercase",
        },
        title: {
          color: colors.text,
          fontSize: 26,
          fontWeight: "800",
          letterSpacing: -0.5,
        },
        description: {
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 20,
        },
        section: {
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 18,
          backgroundColor: colors.surface,
          gap: 12,
        },
        sectionHeadingText: {
          gap: 4,
        },
        sectionTitle: {
          color: colors.text,
          fontSize: 14,
          fontWeight: "800",
        },
        sectionDescription: {
          color: colors.textMuted,
          fontSize: 12,
          lineHeight: 18,
        },
        timeOptions: {
          flexDirection: "row",
          gap: 10,
        },
        timeOption: {
          flex: 1,
          minHeight: 104,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 13,
          backgroundColor: colors.surfaceElevated,
          justifyContent: "center",
          gap: 7,
        },
        timeOptionSelected: {
          borderWidth: 1.5,
          borderColor: colors.blue,
          backgroundColor: colors.blueSoft,
        },
        timeOptionTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 5,
        },
        timeOptionTitle: {
          flex: 1,
          color: colors.text,
          fontSize: 13,
          fontWeight: "800",
        },
        timeOptionTitleSelected: {
          color: colors.navy,
        },
        timeOptionDescription: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 16,
        },
        timeOptionDescriptionSelected: {
          color: colors.navy,
        },
        selectionIndicator: {
          width: 19,
          height: 19,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        selectionIndicatorSelected: {
          borderColor: colors.blue,
          backgroundColor: colors.blue,
        },
        selectionDot: {
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: mode === "dark" ? "#081321" : "#FFFFFF",
        },
        field: {
          gap: 8,
          marginTop: 5,
        },
        fieldLabel: {
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
        },
        input: {
          ...common.input,
          minHeight: 50,
          borderRadius: 12,
          fontSize: 14,
        },
        inputError: {
          borderColor: colors.red,
        },
        helperText: {
          color: colors.textMuted,
          fontSize: 11,
          lineHeight: 17,
        },
        errorText: {
          color: colors.red,
          fontSize: 12,
          lineHeight: 18,
        },
        budgetInput: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        currencyBox: {
          minWidth: 55,
          minHeight: 50,
          paddingHorizontal: 9,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.blueSoft,
          alignItems: "center",
          justifyContent: "center",
        },
        currencyText: {
          color: colors.navy,
          fontSize: 13,
          fontWeight: "800",
        },
        budgetTextInput: {
          flex: 1,
        },
        notesInput: {
          minHeight: 120,
          textAlignVertical: "top",
          paddingTop: 13,
          lineHeight: 21,
        },
        notesFooter: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        },
        characterCount: {
          color: colors.textMuted,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
        },
        actions: {
          flexDirection: "row",
          gap: 12,
          marginTop: 2,
        },
        backButton: {
          ...common.secondaryButton,
          flex: 1,
          minHeight: 53,
          borderRadius: 14,
        },
        backButtonText: common.secondaryButtonText,
        continueButton: {
          ...common.primaryButton,
          flex: 1.5,
          minHeight: 53,
          borderRadius: 14,
        },
        continueButtonText: common.primaryButtonText,
      }),
    [colors, common, mode],
  );

  function update<K extends keyof GroceryPreferences>(
    field: K,
    nextValue: GroceryPreferences[K],
  ) {
    onChange({
      ...value,
      [field]: nextValue,
    });
  }

  function selectPreferredTime(
    preferredTime: GroceryPreferredTime,
  ) {
    onChange({
      ...value,
      preferredTime,
      scheduledTime:
        preferredTime === "asap" ? "" : value.scheduledTime,
    });
  }

  function updateBudget(text: string) {
    const cleaned = text.replace(/[^\d.]/g, "");
    const decimalIndex = cleaned.indexOf(".");

    const normalized =
      decimalIndex === -1
        ? cleaned
        : cleaned.slice(0, decimalIndex + 1) +
          cleaned.slice(decimalIndex + 1).replace(/\./g, "");

    update("budgetAmount", normalized);
  }

  const isScheduled = value.preferredTime === "scheduled";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>STEP 2 OF 7</Text>

        <Text style={styles.title}>Your preferences</Text>

        <Text style={styles.description}>
          Tell us when you need your groceries and share any
          additional instructions. These details help us organise
          your errand correctly.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          When do you need your groceries?
        </Text>

        <Text style={styles.sectionDescription}>
          Choose whether the errand should start as soon as possible
          or at a time that suits you.
        </Text>

        <View style={styles.timeOptions}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{
              checked: value.preferredTime === "asap",
              selected: value.preferredTime === "asap",
            }}
            onPress={() => selectPreferredTime("asap")}
            style={[
              styles.timeOption,
              value.preferredTime === "asap" &&
                styles.timeOptionSelected,
            ]}
          >
            <View style={styles.timeOptionTop}>
              <Text
                style={[
                  styles.timeOptionTitle,
                  value.preferredTime === "asap" &&
                    styles.timeOptionTitleSelected,
                ]}
              >
                As soon as possible
              </Text>

              <View
                style={[
                  styles.selectionIndicator,
                  value.preferredTime === "asap" &&
                    styles.selectionIndicatorSelected,
                ]}
              >
                {value.preferredTime === "asap" ? (
                  <View style={styles.selectionDot} />
                ) : null}
              </View>
            </View>

            <Text
              style={[
                styles.timeOptionDescription,
                value.preferredTime === "asap" &&
                  styles.timeOptionDescriptionSelected,
              ]}
            >
              Get the errand started soon.
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{
              checked: isScheduled,
              selected: isScheduled,
            }}
            onPress={() => selectPreferredTime("scheduled")}
            style={[
              styles.timeOption,
              isScheduled && styles.timeOptionSelected,
            ]}
          >
            <View style={styles.timeOptionTop}>
              <Text
                style={[
                  styles.timeOptionTitle,
                  isScheduled && styles.timeOptionTitleSelected,
                ]}
              >
                Schedule it
              </Text>

              <View
                style={[
                  styles.selectionIndicator,
                  isScheduled && styles.selectionIndicatorSelected,
                ]}
              >
                {isScheduled ? (
                  <View style={styles.selectionDot} />
                ) : null}
              </View>
            </View>

            <Text
              style={[
                styles.timeOptionDescription,
                isScheduled &&
                  styles.timeOptionDescriptionSelected,
              ]}
            >
              Choose your preferred date and time.
            </Text>
          </Pressable>
        </View>

        {isScheduled ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Preferred date and time
            </Text>

            <TextInput
              value={value.scheduledTime}
              onChangeText={(text) =>
                update("scheduledTime", text)
              }
              placeholder="e.g. 12 Nov 2026, 4:00 PM"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                errors.scheduledTime && styles.inputError,
              ]}
              accessibilityLabel="Preferred date and time"
              accessibilityHint="Enter the date and time you would like the grocery errand to start."
              returnKeyType="done"
            />

            {errors.scheduledTime ? (
              <Text style={styles.errorText}>
                {errors.scheduledTime}
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Enter the date and time that work best for you.
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>
            Shopping budget
            <Text style={styles.helperText}> · Optional</Text>
          </Text>

          <Text style={styles.sectionDescription}>
            Set an estimated amount for the groceries. This is the
            shopping budget, separate from SaMi's service fee.
          </Text>
        </View>

        <View style={styles.budgetInput}>
          <View style={styles.currencyBox}>
            <Text style={styles.currencyText}>KSh</Text>
          </View>

          <TextInput
            value={value.budgetAmount}
            onChangeText={updateBudget}
            placeholder="Enter amount"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              styles.budgetTextInput,
              errors.budgetAmount && styles.inputError,
            ]}
            accessibilityLabel="Optional grocery budget in Kenyan shillings"
          />
        </View>

        {errors.budgetAmount ? (
          <Text style={styles.errorText}>
            {errors.budgetAmount}
          </Text>
        ) : (
          <Text style={styles.helperText}>
            This helps the runner understand your expected shopping
            spend. The actual cost of groceries is separate from
            SaMi's service fee.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>
            Additional instructions
            <Text style={styles.helperText}> · Optional</Text>
          </Text>

          <Text style={styles.sectionDescription}>
            Share anything else your runner should know.
          </Text>
        </View>

        <TextInput
          value={value.notes}
          onChangeText={(text) => update("notes", text)}
          placeholder="For example: preferred substitutions, how to contact you about unavailable items, or delivery instructions..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          maxLength={1000}
          style={[styles.input, styles.notesInput]}
          accessibilityLabel="Additional grocery instructions"
        />

        <View style={styles.notesFooter}>
          <Text style={styles.helperText}>
            Keep any important instructions clear.
          </Text>

          <Text style={styles.characterCount}>
            {value.notes.length}/1000
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <Pressable
          onPress={onContinue}
          accessibilityRole="button"
          style={styles.continueButton}
        >
          <Text style={styles.continueButtonText}>
            Review your errand
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
