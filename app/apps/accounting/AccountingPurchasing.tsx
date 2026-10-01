"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  Plus,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  useRouter,
} from "next/navigation";

import SaMiOverlay from "@/app/components/SaMiOverlay";
import {
  useSaMiOverlay,
} from "@/app/components/useSaMiOverlay";
import type {
  AccountingPurchasingWorkspace,
} from "@/lib/apps/accounting/purchasing-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


function today() {
  return new Date().toISOString().slice(0, 10);
}

function browserUuid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    "00000000-0000-4000-8000-" +
    String(Date.now()).padStart(12, "0").slice(-12)
  );
}


export default function AccountingPurchasing({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingPurchasingWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const {
    overlay,
    showSuccess,
    showError,
    closeOverlay,
  } = useSaMiOverlay();

  const [busy, setBusy] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [orderRequisitionId, setOrderRequisitionId] = useState("");
  const [receiptOrderId, setReceiptOrderId] = useState("");

  const requestKeys = useRef({
    requisition: "",
    order: "",
    receipt: "",
  });

  const requestKey = (
    kind: "requisition" | "order" | "receipt",
  ) => {
    if (!requestKeys.current[kind]) {
      requestKeys.current[kind] = browserUuid();
    }
    return requestKeys.current[kind];
  };

  const amount = (value: string) =>
    formatAccountingAmount(value || "0.00", data.currency);

  const approvedRequisitions = useMemo(
    () => data.requisitions.filter((row) => row.status === "approved"),
    [data.requisitions],
  );

  const receiptLines = useMemo(
    () =>
      receiptOrderId
        ? data.orderLines.filter(
            (row) => row.purchase_order_id === receiptOrderId,
          )
        : data.orderLines,
    [data.orderLines, receiptOrderId],
  );

  async function postAction(
    body: Record<string, unknown>,
    successTitle: string,
    successMessage: string,
  ) {
    const key =
      String(body.action || "action") +
      ":" +
      String(
        body.requisitionId ||
          body.purchaseOrderId ||
          body.documentId ||
          body.matchId ||
          "",
      );

    setBusy(key);

    try {
      const response = await fetch("/api/apps/accounting/purchasing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Purchasing action failed.");
      }

      showSuccess(successTitle, successMessage);
      router.refresh();
      return payload.result;
    } catch (error) {
      showError(
        "Purchasing action failed",
        error instanceof Error
          ? error.message
          : "Retry this action.",
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const form = new FormData(event.currentTarget);

    const result = await postAction(
      {
        action: "create-policy",
        name: form.get("name"),
        minAmount: form.get("minAmount"),
        maxAmount: form.get("maxAmount"),
        approverRole: form.get("approverRole"),
        requireReceipt: form.get("requireReceipt") === "on",
        requireThreeWayMatch: form.get("requireThreeWayMatch") === "on",
        quantityTolerancePercent: form.get("quantityTolerancePercent"),
        priceTolerancePercent: form.get("priceTolerancePercent"),
        amountTolerance: form.get("amountTolerance"),
      },
      "Purchasing policy created",
      "Approval and matching controls are now available for qualifying purchase orders.",
    );

    if (result) {
      event.currentTarget.reset();
      setPolicyOpen(false);
    }
  }

  async function createRequisition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const result = await postAction(
      {
        action: "create-requisition",
        requestKey: requestKey("requisition"),
        purpose: form.get("purpose"),
        requestedOn: form.get("requestedOn"),
        neededBy: form.get("neededBy"),
        department: form.get("department"),
        costCenter: form.get("costCenter"),
        currency: data.currency,
        lines: [
          {
            description: form.get("description"),
            quantity: form.get("quantity"),
            estimatedUnitPrice: form.get("estimatedUnitPrice"),
          },
        ],
      },
      "Requisition created",
      "The purchase request is saved as a draft and can now move through approval.",
    );

    if (result) {
      requestKeys.current.requisition = "";
      formElement.reset();
      setRequisitionOpen(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const requisitionId = String(form.get("requisitionId") || "");
    const requisitionLines = requisitionId
      ? data.requisitionLines.filter(
          (line) => line.requisition_id === requisitionId,
        )
      : [];

    if (requisitionId && !requisitionLines.length) {
      showError(
        "Requisition lines unavailable",
        "Reload Purchasing before converting this requisition.",
      );
      return;
    }

    const lines = requisitionLines.length
      ? requisitionLines.map((line) => ({
          requisitionLineId: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.estimated_unit_price,
          taxAmount: "0.00",
          expenseAccountId: line.expense_account_id || undefined,
        }))
      : [
          {
            description: form.get("description"),
            quantity: form.get("quantity"),
            unitPrice: form.get("unitPrice"),
            taxAmount: form.get("taxAmount"),
          },
        ];

    const result = await postAction(
      {
        action: "create-order",
        requestKey: requestKey("order"),
        requisitionId: requisitionId || undefined,
        vendorId: form.get("vendorId"),
        orderDate: form.get("orderDate"),
        expectedDate: form.get("expectedDate"),
        currency: form.get("currency") || data.currency,
        exchangeRate: form.get("exchangeRate"),
        lines,
      },
      "Purchase order created",
      requisitionId
        ? "The approved requisition was converted into a controlled purchase order."
        : "The purchase order was created as a draft and must pass approval before receipt.",
    );

    if (result) {
      requestKeys.current.order = "";
      formElement.reset();
      setOrderRequisitionId("");
      setOrderOpen(false);
    }
  }

  async function createReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const lineId = String(form.get("purchaseOrderLineId") || "");
    const line = data.orderLines.find((row) => row.id === lineId);

    if (!line) {
      showError(
        "Choose a purchase-order line",
        "Select an open PO line before recording the receipt.",
      );
      return;
    }

    const result = await postAction(
      {
        action: "create-receipt",
        requestKey: requestKey("receipt"),
        purchaseOrderId: line.purchase_order_id,
        receivedOn: form.get("receivedOn"),
        deliveryReference: form.get("deliveryReference"),
        notes: form.get("notes"),
        lines: [
          {
            purchaseOrderLineId: line.id,
            quantityReceived: form.get("quantityReceived"),
            acceptedQuantity: form.get("acceptedQuantity"),
            rejectedQuantity: form.get("rejectedQuantity"),
            rejectionReason: form.get("rejectionReason"),
          },
        ],
      },
      "Goods receipt confirmed",
      "Accepted quantities were added to the purchase-order receipt trail.",
    );

    if (result) {
      requestKeys.current.receipt = "";
      formElement.reset();
      setReceiptOrderId("");
      setReceiptOpen(false);
    }
  }

  async function matchBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const form = new FormData(event.currentTarget);

    const result = await postAction(
      {
        action: "match-bill",
        documentId: form.get("documentId"),
        purchaseOrderId: form.get("purchaseOrderId"),
      },
      "Vendor bill checked",
      "The bill was compared with the purchase order, receipt evidence and configured tolerances.",
    );

    if (result) {
      setMatchOpen(false);
    }
  }

  async function requisitionAction(
    requisitionId: string,
    action: "submit" | "approve" | "reject" | "cancel",
  ) {
    const reason =
      action === "reject"
        ? window.prompt("Reason for rejecting this requisition:")
        : undefined;

    if (action === "reject" && !reason?.trim()) return;

    await postAction(
      {
        action: "transition-requisition",
        requisitionId,
        workflowAction: action,
        reason,
      },
      "Requisition updated",
      "The purchase request moved to its next controlled workflow state.",
    );
  }

  async function orderAction(
    purchaseOrderId: string,
    action: "submit" | "approve" | "cancel",
  ) {
    const reason =
      action === "cancel"
        ? window.prompt("Reason for cancelling this purchase order:")
        : undefined;

    if (action === "cancel" && !reason?.trim()) return;

    await postAction(
      {
        action: "transition-order",
        purchaseOrderId,
        workflowAction: action,
        reason,
      },
      "Purchase order updated",
      action === "approve"
        ? "The purchase order is approved and can now receive goods or services."
        : "The purchase order moved to its next controlled workflow state.",
    );
  }

  async function overrideMatch(matchId: string) {
    const reason = window.prompt(
      "Explain why this purchasing match exception is being overridden:",
    );

    if (!reason?.trim()) return;

    await postAction(
      {
        action: "override-match",
        matchId,
        reason,
      },
      "Match exception overridden",
      "The override reason and user were recorded in the purchasing control trail.",
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>
            Accounting · Purchasing Controls · {data.currency}
          </div>
          <h2>Procure-to-pay control center</h2>
          <p>
            Control purchase requests, purchase orders, goods receipts and vendor-bill matching before liabilities are allowed to post.
          </p>
        </div>

        <div className={styles.actions}>
          {canCreate ? (
            <>
              <button
                type="button"
                className={styles.primary}
                onClick={() => setRequisitionOpen((value) => !value)}
              >
                <Plus size={16} />
                New requisition
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setOrderRequisitionId("");
                  setOrderOpen((value) => !value);
                }}
              >
                <ShoppingCart size={16} />
                New PO
              </button>
            </>
          ) : null}

          {canEdit ? (
            <>
              <button
                type="button"
                className={styles.button}
                onClick={() => setReceiptOpen((value) => !value)}
              >
                <PackageCheck size={16} />
                Receive
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setMatchOpen((value) => !value)}
              >
                <ReceiptText size={16} />
                Match bill
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setPolicyOpen((value) => !value)}
              >
                <ShieldCheck size={16} />
                Approval policy
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Requisitions awaiting approval</span>
          <strong>{data.counts.submittedRequisitions}</strong>
          <small>Submitted purchase requests</small>
        </div>
        <div className={styles.financeCard}>
          <span>POs awaiting approval</span>
          <strong>{data.counts.ordersAwaitingApproval}</strong>
          <small>Orders not yet authorized</small>
        </div>
        <div className={styles.financeCard}>
          <span>POs awaiting receipt</span>
          <strong>{data.counts.ordersAwaitingReceipt}</strong>
          <small>Approved or partially received</small>
        </div>
        <div className={styles.financeCard}>
          <span>Match exceptions</span>
          <strong>{data.counts.matchExceptions}</strong>
          <small>Require correction or override</small>
        </div>
      </section>

      {policyOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Approval & matching</span>
              <h3>New purchasing policy</h3>
            </div>
          </div>
          <form className={styles.filters} onSubmit={createPolicy}>
            <label>
              Policy name
              <input name="name" required maxLength={160} placeholder="Standard purchases" />
            </label>
            <label>
              Minimum amount
              <input name="minAmount" inputMode="decimal" defaultValue="0.00" required />
            </label>
            <label>
              Maximum amount
              <input name="maxAmount" inputMode="decimal" placeholder="No cap" />
            </label>
            <label>
              Approver role
              <input name="approverRole" required maxLength={80} defaultValue="owner" />
            </label>
            <label>
              Quantity tolerance %
              <input name="quantityTolerancePercent" inputMode="decimal" defaultValue="0" required />
            </label>
            <label>
              Price tolerance %
              <input name="priceTolerancePercent" inputMode="decimal" defaultValue="0" required />
            </label>
            <label>
              Amount tolerance
              <input name="amountTolerance" inputMode="decimal" defaultValue="0.00" required />
            </label>
            <label>
              <input type="checkbox" name="requireReceipt" defaultChecked />
              Require goods receipt
            </label>
            <label>
              <input type="checkbox" name="requireThreeWayMatch" defaultChecked />
              Require three-way match
            </label>
            <button className={styles.primary} disabled={busy.startsWith("create-policy")}>
              <ShieldCheck size={16} />
              Save policy
            </button>
          </form>
        </section>
      ) : null}

      {requisitionOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Internal purchase request</span>
              <h3>New requisition</h3>
            </div>
          </div>
          <form className={styles.filters} onSubmit={createRequisition}>
            <label>
              Request date
              <input type="date" name="requestedOn" required defaultValue={today()} />
            </label>
            <label>
              Needed by
              <input type="date" name="neededBy" />
            </label>
            <label>
              Department
              <input name="department" maxLength={160} />
            </label>
            <label>
              Cost center
              <input name="costCenter" maxLength={160} />
            </label>
            <label>
              Purpose
              <input name="purpose" required maxLength={2000} />
            </label>
            <label>
              Item / service
              <input name="description" required maxLength={2000} />
            </label>
            <label>
              Quantity
              <input name="quantity" inputMode="decimal" defaultValue="1" required />
            </label>
            <label>
              Estimated unit price
              <input name="estimatedUnitPrice" inputMode="decimal" defaultValue="0.00" required />
            </label>
            <button className={styles.primary} disabled={busy.startsWith("create-requisition")}>
              <Plus size={16} />
              Create requisition
            </button>
          </form>
        </section>
      ) : null}

      {orderOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Controlled commitment</span>
              <h3>Create purchase order</h3>
            </div>
          </div>

          {!data.vendors.length ? (
            <div className={styles.notice}>
              Create an active vendor in Accounts Payable before creating a purchase order.
            </div>
          ) : (
            <form className={styles.filters} onSubmit={createOrder}>
              <label>
                Vendor
                <select name="vendorId" required defaultValue="">
                  <option value="">Choose vendor</option>
                  {data.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.vendor_code} · {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Approved requisition
                <select
                  name="requisitionId"
                  value={orderRequisitionId}
                  onChange={(event) => setOrderRequisitionId(event.target.value)}
                >
                  <option value="">Standalone PO</option>
                  {approvedRequisitions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.requisition_number} · {row.purpose}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Order date
                <input type="date" name="orderDate" defaultValue={today()} required />
              </label>
              <label>
                Expected date
                <input type="date" name="expectedDate" />
              </label>
              <label>
                Currency
                <input name="currency" defaultValue={data.currency} maxLength={3} required />
              </label>
              <label>
                Exchange rate to {data.currency}
                <input name="exchangeRate" inputMode="decimal" defaultValue="1" required />
              </label>

              {!orderRequisitionId ? (
                <>
                  <label>
                    Item / service
                    <input name="description" maxLength={2000} required />
                  </label>
                  <label>
                    Quantity
                    <input name="quantity" inputMode="decimal" defaultValue="1" required />
                  </label>
                  <label>
                    Unit price
                    <input name="unitPrice" inputMode="decimal" defaultValue="0.00" required />
                  </label>
                  <label>
                    Tax amount
                    <input name="taxAmount" inputMode="decimal" defaultValue="0.00" required />
                  </label>
                </>
              ) : (
                <div className={styles.notice}>
                  {data.requisitionLines.filter(
                    (line) => line.requisition_id === orderRequisitionId,
                  ).length} approved requisition line(s) will be copied into this PO.
                </div>
              )}

              <button className={styles.primary} disabled={busy.startsWith("create-order")}>
                <ShoppingCart size={16} />
                Create PO
              </button>
            </form>
          )}
        </section>
      ) : null}

      {receiptOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Receipt evidence</span>
              <h3>Record goods / service receipt</h3>
            </div>
          </div>

          {!data.orderLines.length ? (
            <div className={styles.notice}>
              There are no approved purchase-order lines awaiting receipt.
            </div>
          ) : (
            <form className={styles.filters} onSubmit={createReceipt}>
              <label>
                Purchase order
                <select
                  value={receiptOrderId}
                  onChange={(event) => setReceiptOrderId(event.target.value)}
                >
                  <option value="">All open POs</option>
                  {data.orders
                    .filter((row) =>
                      ["approved", "partially_received"].includes(row.status),
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.purchase_order_number} · {row.vendor_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Open PO line
                <select name="purchaseOrderLineId" required defaultValue="">
                  <option value="">Choose line</option>
                  {receiptLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.purchase_order_number} · {line.description} · remaining {line.remaining_quantity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Received on
                <input type="date" name="receivedOn" defaultValue={today()} required />
              </label>
              <label>
                Quantity received
                <input name="quantityReceived" inputMode="decimal" required />
              </label>
              <label>
                Accepted quantity
                <input name="acceptedQuantity" inputMode="decimal" required />
              </label>
              <label>
                Rejected quantity
                <input name="rejectedQuantity" inputMode="decimal" defaultValue="0" required />
              </label>
              <label>
                Delivery reference
                <input name="deliveryReference" maxLength={160} />
              </label>
              <label>
                Rejection reason
                <input name="rejectionReason" maxLength={2000} />
              </label>
              <label>
                Notes
                <input name="notes" maxLength={4000} />
              </label>
              <button className={styles.primary} disabled={busy.startsWith("create-receipt")}>
                <PackageCheck size={16} />
                Confirm receipt
              </button>
            </form>
          )}
        </section>
      ) : null}

      {matchOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Two-way / three-way match</span>
              <h3>Match vendor bill</h3>
            </div>
          </div>

          {!data.bills.length ? (
            <div className={styles.notice}>
              No draft or approved vendor bills are waiting for purchasing matching.
            </div>
          ) : (
            <form className={styles.filters} onSubmit={matchBill}>
              <label>
                Vendor bill
                <select name="documentId" required defaultValue="">
                  <option value="">Choose bill</option>
                  {data.bills.map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.document_number} · {bill.vendor_name} · {amount(bill.base_total_amount)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Purchase order
                <select name="purchaseOrderId" required defaultValue="">
                  <option value="">Choose PO</option>
                  {data.orders
                    .filter((row) =>
                      ["approved", "partially_received", "received", "closed"].includes(
                        row.status,
                      ),
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.purchase_order_number} · {row.vendor_name} · {amount(row.base_total_amount)}
                      </option>
                    ))}
                </select>
              </label>
              <button className={styles.primary} disabled={busy.startsWith("match-bill")}>
                <ReceiptText size={16} />
                Run match
              </button>
            </form>
          )}
        </section>
      ) : null}

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Purchase requests</span>
              <h3>Requisitions</h3>
            </div>
            <ClipboardCheck size={20} />
          </div>

          {data.requisitions.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th className={styles.number}>Estimate</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requisitions.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.requisition_number}
                        <span className={styles.meta}>{row.requested_on}</span>
                      </td>
                      <td>{row.purpose}</td>
                      <td>
                        <span className={styles.badge}>{row.status}</span>
                      </td>
                      <td className={styles.number}>{amount(row.estimated_total)}</td>
                      <td>
                        <div className={styles.actions}>
                          {row.status === "draft" && canEdit ? (
                            <>
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => requisitionAction(row.id, "submit")}
                              >
                                Submit
                              </button>
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => requisitionAction(row.id, "cancel")}
                              >
                                Cancel
                              </button>
                            </>
                          ) : null}
                          {row.status === "submitted" && canEdit ? (
                            <>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={() => requisitionAction(row.id, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => requisitionAction(row.id, "reject")}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {row.status === "approved" && canCreate ? (
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => {
                                setOrderRequisitionId(row.id);
                                setOrderOpen(true);
                              }}
                            >
                              Create PO
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <ClipboardCheck size={26} />
              <p>No purchase requisitions yet.</p>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Approval policy</span>
              <h3>Active control rules</h3>
            </div>
            <ShieldCheck size={20} />
          </div>

          {data.policies.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Approver</th>
                    <th>Match</th>
                    <th>Range</th>
                  </tr>
                </thead>
                <tbody>
                  {data.policies.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name}
                        <span className={styles.meta}>
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{row.approver_role || "Assigned user"}</td>
                      <td>
                        <span className={styles.badge}>
                          <CheckCircle2 size={13} />
                          {row.require_three_way_match ? "Three-way" : "Two-way"}
                        </span>
                      </td>
                      <td>
                        {amount(row.min_amount)} –{" "}
                        {row.max_amount ? amount(row.max_amount) : "No cap"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.notice}>
              Create at least one active approval policy before issuing purchase orders.
            </div>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Purchase orders</span>
            <h3>Order & receipt control</h3>
          </div>
          <ShoppingCart size={20} />
        </div>

        {data.orders.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Receipt progress</th>
                  <th className={styles.number}>Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.purchase_order_number}
                      <span className={styles.meta}>{row.order_date}</span>
                    </td>
                    <td>{row.vendor_name}</td>
                    <td>
                      <span className={styles.badge}>{row.status}</span>
                    </td>
                    <td>
                      <PackageCheck size={14} /> {row.accepted_quantity} /{" "}
                      {row.ordered_quantity}
                    </td>
                    <td className={styles.number}>{amount(row.base_total_amount)}</td>
                    <td>
                      <div className={styles.actions}>
                        {row.status === "draft" && canEdit ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => orderAction(row.id, "submit")}
                          >
                            Submit
                          </button>
                        ) : null}
                        {row.status === "submitted" && canEdit ? (
                          <button
                            type="button"
                            className={styles.primary}
                            onClick={() => orderAction(row.id, "approve")}
                          >
                            Approve
                          </button>
                        ) : null}
                        {["approved", "partially_received"].includes(row.status) &&
                        canEdit ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => {
                              setReceiptOrderId(row.id);
                              setReceiptOpen(true);
                            }}
                          >
                            Receive
                          </button>
                        ) : null}
                        {["draft", "submitted", "approved"].includes(row.status) &&
                        canEdit ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => orderAction(row.id, "cancel")}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <ShoppingCart size={26} />
            <p>No purchase orders yet.</p>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Invoice matching</span>
            <h3>Exceptions requiring attention</h3>
          </div>
          <ReceiptText size={20} />
        </div>

        {data.exceptions.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th className={styles.number}>Ordered</th>
                  <th className={styles.number}>Received</th>
                  <th className={styles.number}>Invoiced</th>
                  <th>Variance</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.exceptions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={styles.badge}>
                        <AlertTriangle size={13} /> Exception
                      </span>
                    </td>
                    <td className={styles.number}>{amount(row.ordered_amount)}</td>
                    <td className={styles.number}>{amount(row.received_amount)}</td>
                    <td className={styles.number}>{amount(row.invoiced_amount)}</td>
                    <td>
                      {row.quantity_variance_percent}% qty ·{" "}
                      {row.price_variance_percent}% price
                    </td>
                    <td>
                      {canEdit ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => overrideMatch(row.id)}
                        >
                          <XCircle size={14} />
                          Override
                        </button>
                      ) : (
                        "Review required"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.notice}>
            No purchasing match exceptions are currently open.
          </div>
        )}
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay} />
    </div>
  );
}
