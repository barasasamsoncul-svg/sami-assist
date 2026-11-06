
import type {
  GroceryLocation,
  GroceryPreferences,
  GroceryRequestDraft,
} from "./types";

export type GroceryValidationField =
  | "description"
  | "pickup"
  | "delivery"
  | "scheduledTime"
  | "budgetAmount";

export type GroceryValidationErrors = Partial<
  Record<GroceryValidationField, string>
>;

export type GroceryValidationResult = {
  valid: boolean;
  errors: GroceryValidationErrors;
};

function isValidLocation(location: GroceryLocation): boolean {
  return location.label.trim().length > 0;
}

export function parseGroceryBudget(
  value: string,
): number | null {
  const cleaned = value.trim().replace(/,/g, "");

  if (!cleaned) {
    return null;
  }

  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

export function validateGroceryDetails(
  input: Pick<
    GroceryRequestDraft,
    "description" | "pickup" | "delivery"
  >,
): GroceryValidationResult {
  const errors: GroceryValidationErrors = {};

  if (input.description.trim().length < 5) {
    errors.description =
      "Describe what you need the runner to do.";
  }

  if (!isValidLocation(input.pickup)) {
    errors.pickup = "Enter a pickup location.";
  }

  if (!isValidLocation(input.delivery)) {
    errors.delivery = "Enter a drop-off location.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateGroceryPreferences(
  preferences: GroceryPreferences,
): GroceryValidationResult {
  const errors: GroceryValidationErrors = {};

  if (
    preferences.preferredTime === "scheduled" &&
    !preferences.scheduledTime.trim()
  ) {
    errors.scheduledTime =
      "Enter your preferred time.";
  }

  if (preferences.budgetAmount.trim()) {
    const amount = parseGroceryBudget(
      preferences.budgetAmount,
    );

    if (amount === null) {
      errors.budgetAmount =
        "Enter a valid budget greater than zero.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateGroceryRequest(
  draft: GroceryRequestDraft,
): GroceryValidationResult {
  const details = validateGroceryDetails(draft);
  const preferences = validateGroceryPreferences(
    draft.preferences,
  );

  const errors: GroceryValidationErrors = {
    ...details.errors,
    ...preferences.errors,
  };

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
