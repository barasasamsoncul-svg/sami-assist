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
} from "lucide-react";
import {
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

  const amount = (value: string) =>
    formatAccountingAmount(value || "0.00", data.currency);

  async function postAction(body: Record<string, unknown>, successTitle: string, successMessage: string) {
    setBusy(String(body.action || "action"));
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
        error instanceof Error ? error.message : "Retry this action.",
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
    if (result) setPolicyOpen(false);
  }

  async function createRequisition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    const result = await postAction(
      {
        action: "create-requisition",
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
      "The purchase request is saved as a draft and can move through controlled approval.",
    );
    if (result) setRequisitionOpen(false);
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
            Control requests, purchase orders, receipts and vendor-bill matching before money reaches Accounts Payable.
          </p>
        </div>

        <div className={styles.actions}>
          {canCreate ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => setRequisitionOpen((value) => !value)}
            >
              <Plus size={16} />
              New requisition
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => setPolicyOpen((value) => !value)}
            >
              <ShieldCheck size={16} />
              Approval policy
            </button>
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
              <span className={styles.eyebrow}>Approval & three-way match</span>
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
              <input name="maxAmount" inputMode="decimal" placeholder="Leave blank for no cap" />
            </label>
            <label>
              Approver role
              <input name="approverRole" required maxLength={80} placeholder="owner" />
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
            <button className={styles.primary} disabled={busy === "create-policy"}>
              <ShieldCheck size={16} />
              {busy === "create-policy" ? "Saving…" : "Save policy"}
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
              <input
                type="date"
                name="requestedOn"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
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
            <button className={styles.primary} disabled={busy === "create-requisition"}>
              <Plus size={16} />
              {busy === "create-requisition" ? "Saving…" : "Create requisition"}
            </button>
          </form>
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
                        <span className={styles.meta}>{row.active ? "Active" : "Inactive"}</span>
                      </td>
                      <td>{row.approver_role || "Assigned user"}</td>
                      <td>
                        {row.require_three_way_match ? (
                          <span className={styles.badge}>
                            <CheckCircle2 size={13} /> Three-way
                          </span>
                        ) : (
                          <span className={styles.badge}>Two-way</span>
                        )}
                      </td>
                      <td>
                        {amount(row.min_amount)} – {row.max_amount ? amount(row.max_amount) : "No cap"}
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
                      <PackageCheck size={14} /> {row.accepted_quantity} / {row.ordered_quantity}
                    </td>
                    <td className={styles.number}>{amount(row.base_total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <ShoppingCart size={26} />
            <p>No purchase orders yet. Approved requisitions can be converted into controlled orders.</p>
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
                      {row.quantity_variance_percent}% qty · {row.price_variance_percent}% price
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

      <SaMiOverlay overlay={overlay} onClose={closeOverlay} />
    </div>
  );
}
