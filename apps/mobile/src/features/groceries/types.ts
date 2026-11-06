
export type GroceryMapPoint = {
  lat: number;
  lng: number;
};

export type GroceryLocation = {
  label: string;
  point: GroceryMapPoint | null;
};

export type GroceryPhoto = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
};

export type GroceryPreferredTime =
  | "asap"
  | "scheduled";

export type GroceryPreferences = {
  preferredTime: GroceryPreferredTime;
  scheduledTime: string;
  budgetAmount: string;
  notes: string;
};

export type GroceryDeliveryMode =
  | "deliver"
  | "customer_collect";

export type GroceryPriority =
  | "low"
  | "standard"
  | "high"
  | "urgent";

export type GroceryPaymentMethod =
  | "cash"
  | "in_app";

export type GroceryPaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "refunded";

export type GroceryWorkflowStatus =
  | "submitted"
  | "assigned"
  | "accepted"
  | "shopping"
  | "awaiting_customer_approval"
  | "purchased"
  | "ready_for_collection"
  | "out_for_delivery"
  | "arrived"
  | "handed_over"
  | "completed"
  | "issue"
  | "cancelled";

export type GroceryErrandStatus =
  | "requested"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "completion_submitted"
  | "completed"
  | "disputed"
  | "cancelled"
  | "declined";

/**
 * Customer's request before submission.
 *
 * Photos are local until uploaded.
 */
export type GroceryRequestDraft = {
  description: string;
  photos: GroceryPhoto[];
  pickup: GroceryLocation;
  delivery: GroceryLocation;
  preferences: GroceryPreferences;
};

/**
 * Customer request data sent to the Groceries API.
 */
export type CreateGroceryErrandInput = {
  title: string;
  description: string;
  serviceArea: string;

  pickupLocation: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;

  destinationLocation: string;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;

  preferredTime: GroceryPreferredTime;
  scheduledTime?: string;

  purchaseBudgetAmount?: number | null;
  customerNotes?: string;

  distanceKm: number;
  itemSize: string;
  priority: GroceryPriority;
  servicePaymentMethod: GroceryPaymentMethod;
};

/**
 * Customer-facing record returned by the API.
 */
export type GroceryOrder = {
  id: string;
  public_code: string;

  title: string;
  category: "groceries";
  description: string;

  pickup_location: string | null;
  destination_location: string | null;
  service_area: string;

  due_at: string | null;
  distance_km: number | string;

  service_fee_amount: number | string;
  currency: string;
  priority: GroceryPriority;

  status: GroceryErrandStatus;

  service_payment_method: GroceryPaymentMethod;
  payment_status: GroceryPaymentStatus;

  completion_notes: string | null;
  cancellation_reason: string | null;

  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;

  preferred_time: GroceryPreferredTime;
  scheduled_time: string | null;
  purchase_budget_amount: number | string | null;
  customer_notes: string | null;

  workflow_status: GroceryWorkflowStatus;

  photos: Array<{
    id: string;
    url: string;
    content_type: string;
  }>;
};

export type GroceryOrdersResponse = {
  orders: GroceryOrder[];
};

export type GroceryCreateResponse = {
  errand: {
    id: string;
    public_code: string;
    service_fee_amount: number | string;
  };

  grocery: {
    workflowStatus: GroceryWorkflowStatus;
  };

  price: {
    serviceFee: number;
    distanceKm: number;
  };

  paymentNotice: string;
};
