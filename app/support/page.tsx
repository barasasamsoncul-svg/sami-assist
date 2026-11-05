
"use client";

import { useCallback, useEffect, useState } from "react";

type SupportStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

type SupportCategory =
  | "errand"
  | "payment"
  | "account"
  | "technical"
  | "other";

type Ticket = {
  id: string;
  public_code: string;
  customer_id: string;
  related_errand_id: string | null;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  customer_name: string;
  customer_email: string;
  latest_message?: string | null;
  latest_message_at?: string | null;
  errand_public_code?: string | null;
  errand_title?: string | null;
};

type TicketMessage = {
  id: number;
  ticket_id: string;
  sender_id?: string | null;
  sender_role: "customer" | "admin";
  sender_name: string;
  message: string;
  is_internal?: boolean;
  created_at: string;
};

type TicketDetail = {
  ticket: Ticket;
  messages: TicketMessage[];
};

type CurrentUser = {
  id: string;
  full_name: string;
  email: string;
  role: "customer" | "provider" | "admin";
};

const STATUSES: SupportStatus[] = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
];

const CATEGORIES: SupportCategory[] = [
  "errand",
  "payment",
  "account",
  "technical",
  "other",
];

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_customer: "Waiting for customer",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  errand: "Errand",
  payment: "Payment",
  account: "Account",
  technical: "Technical",
  other: "Other",
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "The request could not be completed.",
    );
  }

  return payload as T;
}

export default function SupportPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [nextStatus, setNextStatus] =
    useState<SupportStatus>("open");

  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);

  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setPageError("");

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }

      params.set("limit", "100");

      const result = await request<{ tickets: Ticket[] }>(
        "/api/support/tickets?" + params.toString(),
      );

      setTickets(result.tickets || []);

      if (selectedTicket) {
        const refreshed = result.tickets.find(
          (ticket) => ticket.id === selectedTicket.id,
        );

        if (refreshed) {
          setSelectedTicket(refreshed);
          setNextStatus(refreshed.status);
        }
      }
    } catch (error) {
      setPageError(displayError(error));
    } finally {
      setLoadingTickets(false);
    }
  }, [statusFilter, categoryFilter, selectedTicket?.id]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    setLoadingDetail(true);
    setPageError("");

    try {
      const result = await request<TicketDetail>(
        `/api/support/tickets/${ticketId}`,
      );

      setSelectedTicket(result.ticket);
      setMessages(result.messages || []);
      setNextStatus(result.ticket.status);
    } catch (error) {
      setPageError(displayError(error));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const result = await request<{ user: CurrentUser }>(
          "/api/dispatch?action=me",
        );

        if (!active) return;

        setUser(result.user);
        setAuthorized(result.user.role === "admin");

        if (result.user.role !== "admin") {
          setPageError(
            "Administrator access is required to manage support requests.",
          );
        }
      } catch (error) {
        if (active) {
          setPageError(displayError(error));
        }
      } finally {
        if (active) setCheckingAccess(false);
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authorized) {
      void loadTickets();
    }
  }, [authorized, statusFilter, categoryFilter]);

  async function sendMessage() {
    if (!selectedTicket || sending) return;

    let cleanMessage = reply.trim();

    if (!cleanMessage && nextStatus === selectedTicket.status) {
      setPageError("Enter a message before sending.");
      return;
    }

    if (!cleanMessage) {
      cleanMessage =
        `Internal update: ticket status changed to ${STATUS_LABELS[nextStatus]}.`;
    }

    setSending(true);
    setPageError("");
    setNotice("");

    try {
      await request(
        `/api/support/tickets/${selectedTicket.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            message: cleanMessage,
            isInternal: internalNote || !reply.trim(),
            status: nextStatus,
          }),
        },
      );

      setReply("");
      setInternalNote(false);

      await loadTicketDetail(selectedTicket.id);
      await loadTickets();

      setNotice(
        internalNote || !reply.trim()
          ? "Internal note and ticket update saved."
          : "Your response has been sent.",
      );
    } catch (error) {
      setPageError(displayError(error));
    } finally {
      setSending(false);
    }
  }

  const filteredTickets = tickets.filter((ticket) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return (
      ticket.public_code.toLowerCase().includes(term) ||
      ticket.subject.toLowerCase().includes(term) ||
      ticket.customer_name.toLowerCase().includes(term) ||
      ticket.customer_email.toLowerCase().includes(term) ||
      (ticket.errand_public_code || "").toLowerCase().includes(term)
    );
  });

  const openCount = tickets.filter(
    (ticket) =>
      ticket.status === "open" ||
      ticket.status === "in_progress",
  ).length;

  const waitingCount = tickets.filter(
    (ticket) => ticket.status === "waiting_customer",
  ).length;

  const resolvedCount = tickets.filter(
    (ticket) =>
      ticket.status === "resolved" ||
      ticket.status === "closed",
  ).length;

  if (checkingAccess) {
    return (
      <main className="screen">
        <div className="loading">
          <span className="spinner" />
          <p>Checking operations access...</p>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="screen">
        <div className="access-card">
          <div className="access-icon">!</div>
          <h1>Access restricted</h1>
          <p>
            This support workspace is available to authorized
            SaMi administrators only.
          </p>
          <a href="/">Return to SaMi</a>
          {pageError && <p className="error">{pageError}</p>}
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">SaMi</span>
          <span className="brand-divider" />
          <span className="brand-section">Operations</span>
        </a>

        <div className="admin-info">
          <span className="admin-dot" />
          <span>{user?.full_name || "Administrator"}</span>
          <a href="/">Workspace</a>
        </div>
      </header>

      <div className="page">
        <div className="heading">
          <div>
            <p className="eyebrow">CUSTOMER OPERATIONS</p>
            <h1>Support Desk</h1>
            <p className="subtitle">
              Manage customer requests, errand issues and support
              conversations.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() => void loadTickets()}
            disabled={loadingTickets}
          >
            {loadingTickets ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        <div className="metrics">
          <div className="metric">
            <span className="metric-label">TOTAL REQUESTS</span>
            <strong>{tickets.length}</strong>
            <span className="metric-caption">Loaded tickets</span>
          </div>

          <div className="metric">
            <span className="metric-label">NEEDS ATTENTION</span>
            <strong>{openCount}</strong>
            <span className="metric-caption">Open or in progress</span>
          </div>

          <div className="metric">
            <span className="metric-label">AWAITING CUSTOMER</span>
            <strong>{waitingCount}</strong>
            <span className="metric-caption">Response requested</span>
          </div>

          <div className="metric">
            <span className="metric-label">RESOLVED / CLOSED</span>
            <strong>{resolvedCount}</strong>
            <span className="metric-caption">Completed cases</span>
          </div>
        </div>

        {notice && (
          <div className="success-message">{notice}</div>
        )}

        {pageError && (
          <div className="error-message">{pageError}</div>
        )}

        <div className="workspace">
          <section className="queue">
            <div className="queue-heading">
              <div>
                <h2>Support queue</h2>
                <p>{filteredTickets.length} matching requests</p>
              </div>
            </div>

            <input
              className="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, customer or subject..."
            />

            <div className="filters">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="all">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>

            {loadingTickets ? (
              <div className="queue-loading">Loading support requests...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">◇</span>
                <strong>No support requests found</strong>
                <span>
                  New customer requests will appear in this queue.
                </span>
              </div>
            ) : (
              <div className="ticket-list">
                {filteredTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    className={
                      selectedTicket?.id === ticket.id
                        ? "ticket active"
                        : "ticket"
                    }
                    onClick={() => void loadTicketDetail(ticket.id)}
                  >
                    <div className="ticket-top">
                      <strong>{ticket.public_code}</strong>
                      <span className={`status status-${ticket.status}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                    </div>

                    <strong className="ticket-subject">
                      {ticket.subject}
                    </strong>

                    <span className="ticket-customer">
                      {ticket.customer_name} · {ticket.customer_email}
                    </span>

                    {ticket.latest_message && (
                      <span className="ticket-preview">
                        {ticket.latest_message}
                      </span>
                    )}

                    <div className="ticket-bottom">
                      <span>{CATEGORY_LABELS[ticket.category]}</span>
                      <span>{formatDate(ticket.updated_at)}</span>
                    </div>

                    {ticket.related_errand_id && (
                      <span className="errand-link">
                        ↗ Linked errand{" "}
                        {ticket.errand_public_code || ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="conversation">
            {!selectedTicket ? (
              <div className="conversation-empty">
                <div className="conversation-empty-icon">✉</div>
                <h2>Select a support request</h2>
                <p>
                  Choose a ticket from the queue to view its details,
                  inspect the conversation and respond.
                </p>
              </div>
            ) : loadingDetail ? (
              <div className="queue-loading">
                Loading conversation...
              </div>
            ) : (
              <>
                <div className="conversation-header">
                  <div>
                    <p className="eyebrow">SUPPORT REQUEST</p>
                    <h2>{selectedTicket.public_code}</h2>
                    <p>{selectedTicket.subject}</p>
                  </div>

                  <span
                    className={`status status-${selectedTicket.status}`}
                  >
                    {STATUS_LABELS[selectedTicket.status]}
                  </span>
                </div>

                <div className="customer-card">
                  <div className="customer-avatar">
                    {selectedTicket.customer_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0] || "")
                      .join("")
                      .toUpperCase()}
                  </div>

                  <div className="customer-details">
                    <strong>{selectedTicket.customer_name}</strong>
                    <span>{selectedTicket.customer_email}</span>
                    <span>
                      Submitted {formatDate(selectedTicket.created_at)}
                    </span>
                  </div>

                  {selectedTicket.related_errand_id && (
                    <div className="linked-errand">
                      <span>RELATED ERRAND</span>
                      <strong>
                        {selectedTicket.errand_public_code ||
                          "Linked errand"}
                      </strong>
                      {selectedTicket.errand_title && (
                        <small>{selectedTicket.errand_title}</small>
                      )}
                    </div>
                  )}
                </div>

                <div className="conversation-title">
                  <h3>Conversation history</h3>
                  <span>{messages.length} messages</span>
                </div>

                <div className="messages">
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      No messages have been recorded.
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={
                          message.is_internal
                            ? "message internal"
                            : message.sender_role === "admin"
                              ? "message admin-message"
                              : "message customer-message"
                        }
                      >
                        <div className="message-top">
                          <strong>
                            {message.is_internal
                              ? "Internal note · " + message.sender_name
                              : message.sender_name}
                          </strong>
                          <span>{formatDate(message.created_at)}</span>
                        </div>

                        <p>{message.message}</p>

                        {message.is_internal && (
                          <span className="internal-label">
                            PRIVATE — NOT VISIBLE TO CUSTOMER
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="reply-box">
                  <div className="reply-heading">
                    <h3>Respond to request</h3>
                    <label className="internal-toggle">
                      <input
                        type="checkbox"
                        checked={internalNote}
                        onChange={(event) =>
                          setInternalNote(event.target.checked)
                        }
                      />
                      Internal note
                    </label>
                  </div>

                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder={
                      internalNote
                        ? "Write a private note for the operations team..."
                        : "Write a response to the customer..."
                    }
                  />

                  <div className="reply-footer">
                    <select
                      value={nextStatus}
                      onChange={(event) =>
                        setNextStatus(event.target.value as SupportStatus)
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>

                    <button
                      className="primary-button"
                      onClick={() => void sendMessage()}
                      disabled={sending}
                    >
                      {sending
                        ? "Saving..."
                        : internalNote
                          ? "Save internal note"
                          : "Send customer reply"}
                    </button>
                  </div>

                  <p className="reply-help">
                    Internal notes are visible only to administrators.
                    Public replies appear in the customer's SaMi app.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>

        <footer>
          SaMi Technologies · Support Operations
        </footer>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .screen {
    min-height: 100vh;
    background: #f4f6fa;
    color: #172b45;
    font-family: Arial, Helvetica, sans-serif;
  }

  .topbar {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 0 5%;
    background: #fff;
    border-bottom: 1px solid #e4eaf2;
  }

  .brand, .admin-info {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .brand {
    text-decoration: none;
    color: #173b67;
  }

  .brand-mark {
    font-size: 25px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -1.2px;
  }

  .brand-divider {
    width: 1px;
    height: 25px;
    background: #dce3ec;
  }

  .brand-section {
    color: #596c83;
    font-size: 13px;
    font-weight: 700;
  }

  .admin-info {
    color: #596c83;
    font-size: 12px;
  }

  .admin-info a {
    color: #2463b8;
    text-decoration: none;
    font-weight: 700;
    margin-left: 10px;
  }

  .admin-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #31a36b;
  }

  .page {
    width: min(1500px, 94%);
    margin: 0 auto;
    padding: 34px 0 50px;
  }

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 25px;
  }

  .eyebrow {
    color: #2463b8;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.4px;
    margin: 0 0 8px;
  }

  h1 {
    font-size: clamp(25px, 3vw, 34px);
    font-weight: 850;
    letter-spacing: -1px;
    margin: 0;
    color: #173b67;
  }

  .subtitle {
    color: #718197;
    font-size: 13px;
    margin-top: 8px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 23px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: white;
    border: 1px solid #e3e9f1;
    border-radius: 15px;
    padding: 18px;
  }

  .metric-label {
    color: #718197;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .8px;
  }

  .metric strong {
    color: #173b67;
    font-size: 26px;
    font-weight: 850;
  }

  .metric-caption {
    color: #8694a7;
    font-size: 11px;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(330px, 410px) minmax(0, 1fr);
    gap: 17px;
    align-items: start;
  }

  .queue, .conversation {
    min-width: 0;
    background: #fff;
    border: 1px solid #e3e9f1;
    border-radius: 17px;
    overflow: hidden;
  }

  .queue-heading {
    padding: 19px 18px 12px;
  }

  h2, h3, p {
    margin-top: 0;
  }

  .queue-heading h2, .conversation-header h2 {
    margin-bottom: 5px;
    color: #173b67;
    font-size: 17px;
    font-weight: 800;
  }

  .queue-heading p {
    margin-bottom: 0;
    color: #8794a6;
    font-size: 11px;
  }

  .search {
    width: calc(100% - 36px);
    margin: 6px 18px 12px;
    min-height: 39px;
    padding: 0 11px;
    border: 1px solid #e1e7ef;
    border-radius: 9px;
    outline: none;
    color: #172b45;
    background: #fbfcfe;
    font-size: 11px;
  }

  .search:focus, textarea:focus {
    border-color: #729bd5;
    box-shadow: 0 0 0 3px #eaf1fc;
  }

  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 0 18px 14px;
  }

  select {
    min-height: 37px;
    padding: 0 9px;
    border: 1px solid #e1e7ef;
    border-radius: 9px;
    background: #fff;
    color: #455a73;
    font-size: 11px;
    outline: none;
  }

  .ticket-list {
    max-height: 750px;
    overflow-y: auto;
    border-top: 1px solid #edf0f5;
  }

  .ticket {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 9px;
    padding: 15px 17px;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #edf0f5;
    background: #fff;
    cursor: pointer;
    transition: background .15s ease;
  }

  .ticket:hover, .ticket.active {
    background: #f3f7fd;
  }

  .ticket.active {
    box-shadow: inset 3px 0 #2463b8;
  }

  .ticket-top, .ticket-bottom, .conversation-header,
  .message-top, .reply-footer, .reply-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .ticket-top > strong {
    color: #2463b8;
    font-size: 10px;
  }

  .ticket-subject {
    color: #172b45;
    font-size: 12px;
    font-weight: 750;
    line-height: 17px;
  }

  .ticket-customer, .ticket-preview {
    color: #708096;
    font-size: 10px;
    line-height: 16px;
  }

  .ticket-preview {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .ticket-bottom {
    color: #8290a2;
    font-size: 9px;
  }

  .errand-link {
    color: #2463b8;
    font-size: 9px;
    font-weight: 700;
  }

  .status {
    display: inline-flex;
    white-space: nowrap;
    align-items: center;
    padding: 5px 8px;
    border-radius: 7px;
    background: #eaf1fc;
    color: #2463b8;
    font-size: 9px;
    font-weight: 800;
  }

  .status-open, .status-in_progress {
    background: #eaf1fc;
    color: #2463b8;
  }

  .status-waiting_customer {
    background: #fff3df;
    color: #96630d;
  }

  .status-resolved, .status-closed {
    background: #e8f5ed;
    color: #287747;
  }

  .conversation {
    min-height: 700px;
  }

  .conversation-empty {
    min-height: 550px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
    padding: 30px;
  }

  .conversation-empty-icon, .access-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    background: #eaf1fc;
    color: #2463b8;
    border-radius: 16px;
    font-size: 25px;
    margin-bottom: 15px;
  }

  .conversation-empty h2 {
    font-size: 16px;
    color: #173b67;
    margin-bottom: 7px;
  }

  .conversation-empty p {
    max-width: 350px;
    color: #7b899b;
    font-size: 12px;
    line-height: 19px;
  }

  .conversation-header {
    padding: 20px;
    border-bottom: 1px solid #e9edf3;
  }

  .conversation-header h2 {
    font-size: 19px;
  }

  .conversation-header p:last-child {
    color: #65768c;
    font-size: 12px;
    margin: 0;
  }

  .customer-card {
    display: flex;
    align-items: center;
    gap: 13px;
    flex-wrap: wrap;
    margin: 16px 18px;
    padding: 14px;
    background: #f7f9fc;
    border: 1px solid #e9edf3;
    border-radius: 12px;
  }

  .customer-avatar {
    width: 39px;
    height: 39px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    background: #eaf1fc;
    color: #173b67;
    font-size: 12px;
    font-weight: 850;
  }

  .customer-details {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 170px;
  }

  .customer-details strong {
    color: #172b45;
    font-size: 12px;
  }

  .customer-details span {
    color: #7b899b;
    font-size: 10px;
  }

  .linked-errand {
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 14px;
    border-left: 1px solid #dfe5ed;
  }

  .linked-errand span {
    color: #8391a4;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .8px;
  }

  .linked-errand strong {
    color: #2463b8;
    font-size: 11px;
  }

  .linked-errand small {
    color: #78879b;
    font-size: 9px;
  }

  .conversation-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 20px 12px;
  }

  .conversation-title h3, .reply-heading h3 {
    color: #173b67;
    font-size: 13px;
    margin: 0;
  }

  .conversation-title span {
    color: #8996a8;
    font-size: 10px;
  }

  .messages {
    max-height: 380px;
    overflow-y: auto;
    padding: 0 20px 19px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .message {
    max-width: 88%;
    padding: 13px 14px;
    border-radius: 12px;
    border: 1px solid #e7ebf1;
    background: #f8fafc;
  }

  .customer-message {
    align-self: flex-start;
  }

  .admin-message {
    align-self: flex-end;
    background: #edf4ff;
    border-color: #dce8fb;
  }

  .internal {
    align-self: stretch;
    max-width: 100%;
    border-color: #f0d69e;
    background: #fff8e9;
  }

  .message-top {
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .message-top strong {
    color: #173b67;
    font-size: 10px;
  }

  .message-top span {
    color: #8491a3;
    font-size: 9px;
  }

  .message p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: #394e67;
    font-size: 12px;
    line-height: 19px;
    margin: 0;
  }

  .internal-label {
    display: inline-block;
    margin-top: 9px;
    color: #96630d;
    font-size: 8px;
    font-weight: 850;
    letter-spacing: .5px;
  }

  .reply-box {
    border-top: 1px solid #e9edf3;
    padding: 17px 20px 20px;
  }

  .reply-heading {
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .internal-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #96630d;
    font-size: 10px;
    font-weight: 700;
  }

  textarea {
    width: 100%;
    resize: vertical;
    min-height: 110px;
    padding: 12px;
    border: 1px solid #dfe6ef;
    border-radius: 10px;
    outline: none;
    background: #fcfdff;
    color: #172b45;
    font-family: inherit;
    font-size: 12px;
    line-height: 19px;
  }

  .reply-footer {
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 11px;
  }

  .reply-footer select {
    margin-right: auto;
    min-width: 180px;
  }

  button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }

  .primary-button, .secondary-button {
    min-height: 39px;
    padding: 0 15px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 750;
    cursor: pointer;
  }

  .primary-button {
    color: white;
    background: #173b67;
    border: 1px solid #173b67;
  }

  .secondary-button {
    color: #2463b8;
    background: white;
    border: 1px solid #d7e2f1;
  }

  .reply-help {
    color: #8794a6;
    font-size: 9px;
    line-height: 15px;
    margin: 10px 0 0;
  }

  .success-message, .error-message {
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 15px;
    font-size: 11px;
    line-height: 17px;
  }

  .success-message {
    background: #e8f5ed;
    color: #287747;
  }

  .error-message, .error {
    background: #fff0f0;
    color: #b53e47;
  }

  .queue-loading, .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    color: #7c8a9e;
    font-size: 12px;
  }

  .loading {
    min-height: 75vh;
    flex-direction: column;
    gap: 12px;
  }

  .spinner {
    width: 26px;
    height: 26px;
    border: 3px solid #dbe6f4;
    border-top-color: #2463b8;
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 9px;
    padding: 35px 17px;
    color: #8290a2;
    font-size: 10px;
    line-height: 16px;
  }

  .empty-state strong {
    color: #314c6b;
    font-size: 12px;
  }

  .empty-icon {
    font-size: 23px;
    color: #7395c4;
  }

  .access-card {
    width: min(440px, calc(100% - 36px));
    margin: 15vh auto 0;
    padding: 30px;
    border: 1px solid #e3e9f1;
    border-radius: 17px;
    background: #fff;
    text-align: center;
  }

  .access-icon {
    margin: 0 auto 15px;
  }

  .access-card h1 {
    font-size: 23px;
  }

  .access-card p {
    color: #78879b;
    font-size: 12px;
    line-height: 19px;
    margin: 12px 0;
  }

  .access-card a {
    display: inline-block;
    margin-top: 8px;
    color: #2463b8;
    font-size: 12px;
    font-weight: 750;
    text-decoration: none;
  }

  footer {
    padding-top: 28px;
    color: #98a4b4;
    font-size: 10px;
    text-align: center;
  }

  @media (max-width: 950px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .ticket-list {
      max-height: 420px;
    }

    .conversation {
      min-height: 450px;
    }
  }

  @media (max-width: 650px) {
    .topbar {
      padding: 0 4%;
    }

    .admin-info > span:not(.admin-dot) {
      display: none;
    }

    .page {
      width: 92%;
      padding-top: 24px;
    }

    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .heading {
      align-items: flex-start;
    }

    .linked-errand {
      flex-basis: 100%;
      padding: 10px 0 0;
      border-left: 0;
      border-top: 1px solid #dfe5ed;
    }

    .conversation-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .message {
      max-width: 96%;
    }
  }
`;
