export type PurchaseRequisitionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'cancelled';

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export type PurchaseMatchResult =
  | 'pending'
  | 'matched'
  | 'exception'
  | 'overridden';

export type PurchasePolicy = {
  id: string;
  name: string;
  min_amount: string;
  max_amount: string | null;
  approver_role: string | null;
  approver_user_id: string | null;
  require_receipt: boolean;
  require_three_way_match: boolean;
  quantity_tolerance_percent: string;
  price_tolerance_percent: string;
  amount_tolerance: string;
  active: boolean;
};

export type PurchaseRequisition = {
  id: string;
  requisition_number: string;
  requested_by: string;
  requested_on: string;
  needed_by: string | null;
  department: string | null;
  cost_center: string | null;
  purpose: string;
  currency: string;
  estimated_total: string;
  status: PurchaseRequisitionStatus;
};

export type PurchaseOrder = {
  id: string;
  purchase_order_number: string;
  requisition_id: string | null;
  vendor_id: string;
  vendor_name: string;
  order_date: string;
  expected_date: string | null;
  currency: string;
  total_amount: string;
  base_total_amount: string;
  status: PurchaseOrderStatus;
  approval_policy_id: string | null;
  ordered_quantity: string;
  accepted_quantity: string;
};

export type PurchaseMatch = {
  id: string;
  vendor_document_id: string;
  purchase_order_id: string;
  match_type: 'two_way' | 'three_way';
  ordered_amount: string;
  received_amount: string;
  invoiced_amount: string;
  amount_variance: string;
  quantity_variance_percent: string;
  price_variance_percent: string;
  result: PurchaseMatchResult;
  override_reason: string | null;
};

export type AccountingPurchasingWorkspace = {
  companyId: string;
  currency: string;
  policies: PurchasePolicy[];
  requisitions: PurchaseRequisition[];
  orders: PurchaseOrder[];
  exceptions: PurchaseMatch[];
  counts: {
    draftRequisitions: number;
    submittedRequisitions: number;
    ordersAwaitingApproval: number;
    ordersAwaitingReceipt: number;
    matchExceptions: number;
  };
};
