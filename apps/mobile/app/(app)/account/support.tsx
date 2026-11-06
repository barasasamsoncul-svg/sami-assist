import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { apiRequest, dispatchGet } from "@/api";

type SupportCategory = "errand" | "payment" | "account" | "technical" | "other";
type SupportScreenName = "home" | "issues" | "chat";

type Errand = {
  id: string;
  public_code?: string | null;
  title?: string | null;
  status?: string | null;
  category?: string | null;
  service_area?: string | null;
  pickup_location?: string | null;
  destination_location?: string | null;
  created_at?: string | null;
  service_fee_amount?: number | string | null;
  item_budget_amount?: number | string | null;
  seller_actual_amount?: number | string | null;
};

type ErrandDetailResponse = {
  errand: Errand;
  events?: unknown[];
  messages?: unknown[];
};

type SupportTicket = {
  id: string;
  public_code: string;
  related_errand_id: string | null;
  category: SupportCategory;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  latest_message?: string | null;
  latest_message_at?: string | null;
};

type SupportMessage = {
  id: number | string;
  ticket_id: string;
  sender_role: "customer" | "admin";
  sender_name?: string | null;
  message: string;
  is_internal?: boolean;
  created_at: string;
};

type TicketListResponse = { tickets: SupportTicket[] };
type TicketDetailResponse = { ticket: SupportTicket; messages: SupportMessage[] };
type CreateTicketResponse = {
  message?: string;
  ticket: SupportTicket;
  openingMessage?: SupportMessage;
};

type IssueOption = {
  id: string;
  label: string;
  category: SupportCategory;
  icon: keyof typeof Ionicons.glyphMap;
};

const ISSUE_OPTIONS: IssueOption[] = [
  { id: "late_provider", label: "My errand is taking too long", category: "errand", icon: "time-outline" },
  { id: "provider_not_arrived", label: "My provider has not arrived", category: "errand", icon: "person-outline" },
  { id: "cannot_reach_provider", label: "I cannot reach my provider", category: "errand", icon: "call-outline" },
  { id: "location_problem", label: "The provider cannot find the location", category: "errand", icon: "location-outline" },
  { id: "change_location", label: "I need to change the pickup or destination", category: "errand", icon: "map-outline" },
  { id: "change_details", label: "I need to change my errand details", category: "errand", icon: "create-outline" },
  { id: "cancel_errand", label: "I want to cancel this errand", category: "errand", icon: "close-circle-outline" },
  { id: "item_not_collected", label: "The item was not purchased or collected", category: "errand", icon: "bag-handle-outline" },
  { id: "wrong_item", label: "The item is missing or incorrect", category: "errand", icon: "help-circle-outline" },
  { id: "damaged_item", label: "The item was damaged", category: "errand", icon: "alert-circle-outline" },
  { id: "incomplete_errand", label: "My errand was not completed", category: "errand", icon: "checkmark-done-outline" },
  { id: "fee_issue", label: "I have an issue with the service fee or price", category: "payment", icon: "pricetag-outline" },
  { id: "payment_problem", label: "I have a payment problem", category: "payment", icon: "card-outline" },
  { id: "refund", label: "I need help with a refund", category: "payment", icon: "wallet-outline" },
  { id: "tracking_problem", label: "Errand tracking is not working", category: "technical", icon: "navigate-outline" },
  { id: "app_problem", label: "Something in the app is not working", category: "technical", icon: "phone-portrait-outline" },
  { id: "provider_safety", label: "I have a concern about provider behaviour or safety", category: "errand", icon: "shield-checkmark-outline" },
  { id: "something_else", label: "Something else", category: "other", icon: "chatbubble-ellipses-outline" },
];

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "errand", label: "Errand" },
  { value: "payment", label: "Payment" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

const LIGHT = {
  background: "#F5F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF3F9",
  text: "#172B45",
  muted: "#708096",
  border: "#E2E8F0",
  navy: "#173B67",
  blue: "#2866B2",
  blueSoft: "#EAF1FC",
  input: "#FFFFFF",
  customerBubble: "#173B67",
  supportBubble: "#FFFFFF",
  successBg: "#EAF6EF",
  successText: "#287747",
  warningBg: "#FFF4E5",
  warningText: "#95600B",
  dangerBg: "#FDEDEE",
  dangerText: "#B93643",
  iconMuted: "#8795A7",
};

const DARK = {
  background: "#0E1726",
  surface: "#172438",
  surfaceAlt: "#202F45",
  text: "#F2F5FA",
  muted: "#A8B5C7",
  border: "#304158",
  navy: "#8FB8ED",
  blue: "#8FB8ED",
  blueSoft: "#233B5A",
  input: "#111E30",
  customerBubble: "#24558B",
  supportBubble: "#172438",
  successBg: "#1C3A2C",
  successText: "#9AD2AE",
  warningBg: "#42351F",
  warningText: "#F2C777",
  dangerBg: "#43252B",
  dangerText: "#F2A0A8",
  iconMuted: "#A8B5C7",
};

type Palette = typeof LIGHT;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
}

function formatErrandDateTime(value?: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const day = isToday ? "Today" : isYesterday ? "Yesterday" : date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();
  return `${day} · ${time}`;
}

function formatKes(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In progress",
    waiting_customer: "Awaiting your reply",
    resolved: "Resolved",
    closed: "Closed",
  };
  return labels[status] || status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusPalette(status: string, palette: Palette) {
  if (status === "resolved" || status === "closed") return { background: palette.successBg, text: palette.successText };
  if (status === "waiting_customer") return { background: palette.warningBg, text: palette.warningText };
  return { background: palette.blueSoft, text: palette.blue };
}

function createStyles(p: Palette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safeArea: { flex: 1, backgroundColor: p.background },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 },
    backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, alignItems: "center", justifyContent: "center", marginRight: 12 },
    headerText: { flex: 1, gap: 3 },
    headerTitle: { color: p.text, fontSize: 19, fontWeight: "800" },
    headerSubtitle: { color: p.muted, fontSize: 11 },
    refreshButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, alignItems: "center", justifyContent: "center" },
    scrollContent: { paddingHorizontal: 18, paddingBottom: 36, gap: 18 },
    hero: { backgroundColor: p.navy, borderRadius: 21, padding: 21, overflow: "hidden" },
    heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
    heroTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "900" },
    heroCopy: { color: "#E0EAF6", fontSize: 12, lineHeight: 19, marginTop: 7 },
    sectionHeading: { gap: 4 },
    sectionTitle: { color: p.text, fontSize: 17, fontWeight: "800" },
    sectionSubtitle: { color: p.muted, fontSize: 11, lineHeight: 17 },
    primaryActionCard: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 17, padding: 16, flexDirection: "row", alignItems: "center", gap: 13 },
    actionIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" },
    actionText: { flex: 1, gap: 4 },
    actionTitle: { color: p.text, fontSize: 14, fontWeight: "800" },
    actionDescription: { color: p.muted, fontSize: 11, lineHeight: 16 },
    card: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 17, padding: 16, gap: 12 },
    fieldLabel: { color: p.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
    categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    categoryChip: { borderRadius: 11, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 12, paddingVertical: 9 },
    categoryChipActive: { backgroundColor: p.blueSoft, borderColor: p.blue },
    categoryChipText: { color: p.muted, fontSize: 11, fontWeight: "700" },
    categoryChipTextActive: { color: p.blue, fontWeight: "800" },
    input: { minHeight: 45, borderWidth: 1, borderColor: p.border, borderRadius: 11, paddingHorizontal: 12, color: p.text, fontSize: 13, backgroundColor: p.input },
    messageInput: { minHeight: 105, borderWidth: 1, borderColor: p.border, borderRadius: 11, paddingHorizontal: 12, paddingTop: 11, color: p.text, fontSize: 13, lineHeight: 19, backgroundColor: p.input },
    primaryButton: { minHeight: 47, borderRadius: 12, backgroundColor: p.navy, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    primaryButtonText: { color: p.background === LIGHT.background ? "#FFFFFF" : "#0E1726", fontSize: 12, fontWeight: "800" },
    secondaryButton: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
    secondaryButtonText: { color: p.text, fontSize: 11, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    formFootnote: { color: p.muted, fontSize: 10, lineHeight: 15, textAlign: "center" },
    ticketHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    countBadge: { minWidth: 29, height: 29, paddingHorizontal: 7, borderRadius: 10, backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" },
    countText: { color: p.blue, fontSize: 11, fontWeight: "900" },
    ticketList: { gap: 10 },
    ticketCard: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 16, padding: 14, gap: 8 },
    ticketTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    ticketCode: { color: p.blue, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
    statusText: { fontSize: 9, fontWeight: "800" },
    ticketSubject: { color: p.text, fontSize: 13, lineHeight: 19, fontWeight: "800" },
    latestMessage: { color: p.muted, fontSize: 10, lineHeight: 15 },
    ticketBottom: { borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10, marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    ticketDate: { color: p.muted, fontSize: 9 },
    ticketOpen: { color: p.blue, fontSize: 10, fontWeight: "800" },
    emptyCard: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 16, padding: 23, alignItems: "center", gap: 8 },
    emptyTitle: { color: p.text, fontSize: 14, fontWeight: "800" },
    emptyCopy: { color: p.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
    warningBox: { backgroundColor: p.warningBg, borderRadius: 11, padding: 12 },
    warningText: { color: p.warningText, fontSize: 11, lineHeight: 17 },
    centerLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    loadingText: { color: p.muted, fontSize: 11 },
    issueContent: { paddingHorizontal: 18, paddingBottom: 30, gap: 16 },
    errandCard: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 17, padding: 16, gap: 11 },
    errandLocation: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
    errandLocationText: { color: p.text, flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
    errandMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 13 },
    errandMeta: { color: p.muted, fontSize: 10, fontWeight: "600" },
    errandAmount: { color: p.text, fontSize: 13, fontWeight: "900" },
    errandDivider: { height: 1, backgroundColor: p.border },
    issueList: { gap: 8 },
    issueOption: { minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 11 },
    issueIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" },
    issueLabel: { flex: 1, color: p.text, fontSize: 12, lineHeight: 17, fontWeight: "700" },
    detailContent: { paddingHorizontal: 18, paddingBottom: 22, gap: 17 },
    ticketSummary: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 16, padding: 15, gap: 9 },
    summarySubject: { color: p.text, fontSize: 15, lineHeight: 21, fontWeight: "900" },
    ticketMeta: { color: p.muted, fontSize: 10 },
    linkedErrand: { backgroundColor: p.blueSoft, borderRadius: 10, padding: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    linkedErrandText: { color: p.blue, fontSize: 11, fontWeight: "800" },
    conversationTitle: { color: p.text, fontSize: 15, fontWeight: "900" },
    messageRow: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 10 },
    customerMessageRow: { justifyContent: "flex-end" },
    messageBubble: { maxWidth: "88%", borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10 },
    supportBubble: { backgroundColor: p.supportBubble, borderWidth: 1, borderColor: p.border, borderBottomLeftRadius: 4 },
    customerBubble: { backgroundColor: p.customerBubble, borderBottomRightRadius: 4 },
    messageSender: { color: p.blue, fontSize: 9, fontWeight: "900", marginBottom: 5 },
    customerSender: { color: "#D5E6FC" },
    messageBody: { color: p.text, fontSize: 12, lineHeight: 18 },
    customerMessageBody: { color: "#FFFFFF" },
    messageTime: { color: p.muted, fontSize: 8, marginTop: 6, textAlign: "right" },
    customerMessageTime: { color: "#D5E6FC" },
    openingPrompt: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: p.supportBubble, borderWidth: 1, borderColor: p.border, borderRadius: 15, borderBottomLeftRadius: 4, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 10 },
    errorBox: { backgroundColor: p.dangerBg, borderRadius: 10, padding: 11 },
    errorText: { color: p.dangerText, fontSize: 11, lineHeight: 17 },
    replyPanel: { backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.border, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 13, gap: 9 },
    replyInput: { minHeight: 60, maxHeight: 120, borderWidth: 1, borderColor: p.border, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, color: p.text, fontSize: 12, lineHeight: 18, backgroundColor: p.input },
    headerEyebrow: { color: p.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
    pressed: { opacity: 0.78 },
    smallMuted: { color: p.muted, fontSize: 10, lineHeight: 15 },
  });
}

export default function SupportScreen() {
  const params = useLocalSearchParams<{ errandId?: string | string[] }>();
  const routeErrandId = Array.isArray(params.errandId) ? params.errandId[0] : params.errandId;
  const isDark = useColorScheme() === "dark";
  const palette = isDark ? DARK : LIGHT;
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [screen, setScreen] = useState<SupportScreenName>(routeErrandId ? "issues" : "home");
  const [chatReturnScreen, setChatReturnScreen] = useState<"home" | "issues">(routeErrandId ? "issues" : "home");
  const [errandContext, setErrandContext] = useState<Errand | null>(null);
  const [errandLoading, setErrandLoading] = useState(Boolean(routeErrandId));
  const [errandError, setErrandError] = useState("");

  const [errands, setErrands] = useState<Errand[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const [category, setCategory] = useState<SupportCategory>("errand");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedErrandId, setSelectedErrandId] = useState("");
  const [reply, setReply] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [pageError, setPageError] = useState("");

  const loadData = useCallback(async () => {
    setPageError("");
    const [errandsResult, ticketsResult] = await Promise.allSettled([
      dispatchGet<{ errands: Errand[] }>("errands"),
      apiRequest<TicketListResponse>("/api/support/tickets"),
    ]);

    if (errandsResult.status === "fulfilled") {
      setErrands(errandsResult.value.errands || []);
    } else {
      setPageError("Your errands could not be loaded. You can still submit a general support request.");
    }

    if (ticketsResult.status === "fulfilled") {
      setTickets(ticketsResult.value.tickets || []);
    } else {
      setPageError((current) => current ? `${current}\nYour support history could not be loaded.` : "Your support history could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      setLoading(true);
      await loadData();
      if (mounted) setLoading(false);
    };
    void initialize();
    return () => { mounted = false; };
  }, [loadData]);

  useEffect(() => {
    if (!routeErrandId) return;
    let active = true;
    setScreen("issues");
    setErrandLoading(true);
    setErrandError("");
    dispatchGet<ErrandDetailResponse>("errandDetail", { id: routeErrandId })
      .then((result) => {
        if (!active) return;
        if (!result?.errand?.id) throw new Error("The errand details were not returned.");
        setErrandContext(result.errand);
      })
      .catch((error: unknown) => {
        if (active) setErrandError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setErrandLoading(false);
      });
    return () => { active = false; };
  }, [routeErrandId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const loadTicket = async (ticketId: string, fallback?: SupportTicket) => {
    setSelectedTicket(fallback || null);
    setMessages([]);
    setTicketError("");
    setLoadingTicket(true);
    try {
      const result = await apiRequest<TicketDetailResponse>(`/api/support/tickets/${ticketId}`);
      setSelectedTicket(result.ticket);
      setMessages(result.messages || []);
    } catch (error) {
      setTicketError(getErrorMessage(error));
    } finally {
      setLoadingTicket(false);
    }
  };

  const enterTicket = async (ticket: SupportTicket, returnTo: "home" | "issues") => {
    setChatReturnScreen(returnTo);
    setScreen("chat");
    setReply("");
    await loadTicket(ticket.id, ticket);
  };

  const startErrandConversation = async (issue: IssueOption) => {
    if (!errandContext?.id) {
      Alert.alert("Errand unavailable", "We could not identify this errand. Return to the errand and try Get help again.");
      return;
    }
    setSubmitting(true);
    setTicketError("");
    try {
      const result = await apiRequest<CreateTicketResponse>("/api/support/tickets", {
        method: "POST",
        body: {
          flow: "errand_help",
          category: issue.category,
          subject: `Errand help: ${issue.label}`,
          message: `I need help with: ${issue.label}`,
          relatedErrandId: errandContext.id,
        },
      });
      if (!result?.ticket?.id) throw new Error("The support request was created without a ticket reference.");
      setChatReturnScreen("issues");
      setScreen("chat");
      setReply("");
      await loadTicket(result.ticket.id, result.ticket);
      void loadData();
    } catch (error) {
      Alert.alert("Could not start support chat", getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const createGeneralTicket = async () => {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (cleanSubject.length < 5) {
      Alert.alert("Subject required", "Enter a subject containing at least five characters.");
      return;
    }
    if (!cleanMessage) {
      Alert.alert("Describe the issue", "Please explain what you need help with.");
      return;
    }
    if (category === "errand" && !selectedErrandId) {
      Alert.alert("Select an errand", "Choose the errand this request relates to, or select another category.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiRequest<CreateTicketResponse>("/api/support/tickets", {
        method: "POST",
        body: {
          flow: "general",
          category,
          subject: cleanSubject,
          message: cleanMessage,
          relatedErrandId: selectedErrandId || undefined,
        },
      });
      if (!result?.ticket?.id) throw new Error("The support request was created without a ticket reference.");
      setSubject("");
      setMessage("");
      setSelectedErrandId("");
      await loadData();
      await enterTicket(result.ticket, "home");
    } catch (error) {
      Alert.alert("Could not submit request", getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket) return;
    const cleanReply = reply.trim();
    if (!cleanReply) return;
    setSendingReply(true);
    setTicketError("");
    try {
      await apiRequest(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        body: { message: cleanReply },
      });
      setReply("");
      await loadTicket(selectedTicket.id);
      void loadData();
    } catch (error) {
      setTicketError(getErrorMessage(error));
    } finally {
      setSendingReply(false);
    }
  };

  const openRelatedErrand = (errandId: string) => {
    router.push({ pathname: "/(app)/errand/[id]", params: { id: errandId } });
  };

  const handleBack = () => {
    if (screen === "chat") {
      setScreen(chatReturnScreen);
      setSelectedTicket(null);
      setMessages([]);
      setTicketError("");
      setReply("");
      return;
    }
    if (screen === "issues") {
      if (routeErrandId) {
        router.back();
      } else {
        setScreen("home");
      }
      return;
    }
    router.back();
  };

  const visibleMessages = messages.filter((item) => !item.message.startsWith("I need help with: "));
  const isErrandHelpConversation = Boolean(selectedTicket?.subject?.startsWith("Errand help: "));
  const hasSavedOpeningMessage = visibleMessages.some((item) => item.sender_role === "admin");
  const selectedErrand = errands.find((item) => item.id === selectedErrandId);
  const status = selectedTicket ? statusPalette(selectedTicket.status, palette) : null;

  const locationLabel = useMemo(() => {
    if (!errandContext) return "Location unavailable";
    const pickup = errandContext.pickup_location?.trim();
    const destination = errandContext.destination_location?.trim();
    const serviceArea = errandContext.service_area?.trim();
    if (pickup && destination && pickup.toLowerCase() !== destination.toLowerCase()) return `${pickup} → ${destination}`;
    return pickup || serviceArea || destination || "Location unavailable";
  }, [errandContext]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={palette.background} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={screen === "chat" ? "Back to support" : "Go back"}
          >
            <Ionicons name="chevron-back" size={21} color={palette.navy} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {screen === "issues" ? "Errand help" : screen === "chat" ? selectedTicket?.public_code || "Support chat" : "Help & Support"}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {screen === "issues" ? "Choose what you need help with" : screen === "chat" ? (isErrandHelpConversation ? "Support for your errand" : "Your support conversation") : "SaMi is here to help."}
            </Text>
          </View>
          {screen === "home" ? (
            <Pressable style={styles.refreshButton} onPress={() => void refresh()} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Refresh support">
              {refreshing ? <ActivityIndicator size="small" color={palette.navy} /> : <Ionicons name="refresh" size={19} color={palette.navy} />}
            </Pressable>
          ) : null}
        </View>

        {screen === "issues" ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.issueContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {errandLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={palette.blue} />
                <Text style={styles.loadingText}>Loading your errand...</Text>
              </View>
            ) : errandError || !errandContext ? (
              <View style={styles.card}>
                <View style={styles.warningBox}><Text style={styles.warningText}>{errandError || "The errand details are unavailable."}</Text></View>
                <Pressable onPress={() => router.back()} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Return to errand</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.errandCard}>
                  <View style={styles.errandLocation}>
                    <Ionicons name="location" size={17} color={palette.blue} />
                    <Text style={styles.errandLocationText}>{locationLabel}</Text>
                  </View>
                  <View style={styles.errandDivider} />
                  <View style={styles.errandMetaRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="calendar-outline" size={13} color={palette.muted} />
                      <Text style={styles.errandMeta}>{formatErrandDateTime(errandContext.created_at)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="wallet-outline" size={13} color={palette.muted} />
                      <Text style={styles.errandAmount}>{formatKes(errandContext.service_fee_amount) || "Amount unavailable"}</Text>
                    </View>
                  </View>
                  {errandContext.public_code ? <Text style={styles.smallMuted}>{errandContext.public_code}{errandContext.title ? ` · ${errandContext.title}` : ""}</Text> : null}
                </View>

                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Select issue</Text>
                  <Text style={styles.sectionSubtitle}>Choose the option that best describes what happened. This opens a private chat with SaMi Support.</Text>
                </View>

                <View style={styles.issueList}>
                  {ISSUE_OPTIONS.map((issue) => (
                    <Pressable
                      key={issue.id}
                      disabled={submitting}
                      onPress={() => void startErrandConversation(issue)}
                      style={({ pressed }) => [styles.issueOption, pressed && styles.pressed, submitting && styles.disabled]}
                      accessibilityRole="button"
                    >
                      <View style={styles.issueIcon}><Ionicons name={issue.icon} size={17} color={palette.blue} /></View>
                      <Text style={styles.issueLabel}>{issue.label}</Text>
                      {submitting ? <ActivityIndicator size="small" color={palette.blue} /> : <Ionicons name="chevron-forward" size={17} color={palette.iconMuted} />}
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.formFootnote}>Your errand reference and selected issue will be shared with the support team so they can assist you.</Text>
              </>
            )}
          </ScrollView>
        ) : screen === "chat" ? (
          <View style={styles.flex}>
            {loadingTicket ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={palette.blue} />
                <Text style={styles.loadingText}>Opening your conversation...</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.flex} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {selectedTicket ? (
                    <View style={styles.ticketSummary}>
                      <View style={styles.ticketTop}>
                        <Text style={styles.ticketCode}>{selectedTicket.public_code}</Text>
                        {status ? <View style={[styles.statusBadge, { backgroundColor: status.background }]}><Text style={[styles.statusText, { color: status.text }]}>{formatStatus(selectedTicket.status)}</Text></View> : null}
                      </View>
                      <Text style={styles.summarySubject}>{selectedTicket.subject}</Text>
                      <Text style={styles.ticketMeta}>{CATEGORIES.find((item) => item.value === selectedTicket.category)?.label || selectedTicket.category} · {formatDate(selectedTicket.created_at)}</Text>
                      {selectedTicket.related_errand_id ? (
                        <Pressable style={styles.linkedErrand} onPress={() => openRelatedErrand(selectedTicket.related_errand_id!)}>
                          <Text style={styles.linkedErrandText}>View linked errand</Text>
                          <Ionicons name="chevron-forward" size={16} color={palette.blue} />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  <Text style={styles.conversationTitle}>Conversation</Text>
                  {isErrandHelpConversation && !hasSavedOpeningMessage ? (
                    <View style={styles.openingPrompt}>
                      <Text style={styles.messageSender}>SaMi Support</Text>
                      <Text style={styles.messageBody}>Hi, tell me a little more about what happened so I can help.</Text>
                    </View>
                  ) : null}
                  {visibleMessages.length === 0 && !(isErrandHelpConversation && !hasSavedOpeningMessage) ? (
                    <View style={styles.emptyCard}><Text style={styles.emptyCopy}>No messages are available in this conversation yet.</Text></View>
                  ) : null}
                  {visibleMessages.map((item, index) => {
                    const isCustomer = item.sender_role === "customer";
                    return (
                      <View key={`${item.id}-${index}`} style={[styles.messageRow, isCustomer && styles.customerMessageRow]}>
                        <View style={[styles.messageBubble, isCustomer ? styles.customerBubble : styles.supportBubble]}>
                          <Text style={[styles.messageSender, isCustomer && styles.customerSender]}>{isCustomer ? "You" : "SaMi Support"}</Text>
                          <Text style={[styles.messageBody, isCustomer && styles.customerMessageBody]}>{item.message}</Text>
                          <Text style={[styles.messageTime, isCustomer && styles.customerMessageTime]}>{formatMessageTime(item.created_at)}</Text>
                        </View>
                      </View>
                    );
                  })}
                  {!!ticketError ? <View style={styles.errorBox}><Text style={styles.errorText}>{ticketError}</Text></View> : null}
                </ScrollView>

                <View style={styles.replyPanel}>
                  <TextInput
                    style={styles.replyInput}
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Tell us a little more..."
                    placeholderTextColor={palette.muted}
                    multiline
                    maxLength={4000}
                    textAlignVertical="top"
                    editable={!sendingReply}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, (!reply.trim() || sendingReply) && styles.disabled, pressed && styles.pressed]}
                    onPress={() => void sendReply()}
                    disabled={!reply.trim() || sendingReply || !selectedTicket}
                  >
                    {sendingReply ? <ActivityIndicator size="small" color={isDark ? "#0E1726" : "#FFFFFF"} /> : <><Text style={styles.primaryButtonText}>Send message</Text><Ionicons name="send" size={14} color={isDark ? "#0E1726" : "#FFFFFF"} /></>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <View style={styles.heroIcon}><Ionicons name="headset-outline" size={22} color="#FFFFFF" /></View>
              <Text style={styles.heroTitle}>How can we help?</Text>
              <Text style={styles.heroCopy}>Get help with an errand, a payment or your SaMi account. You can also follow your support conversations here.</Text>
            </View>

            {!!pageError ? <View style={styles.warningBox}><Text style={styles.warningText}>{pageError}</Text></View> : null}

            <Pressable onPress={() => router.push("/(app)/errands")} style={({ pressed }) => [styles.primaryActionCard, pressed && styles.pressed]}>
              <View style={styles.actionIcon}><Ionicons name="receipt-outline" size={21} color={palette.blue} /></View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Get help with an errand</Text>
                <Text style={styles.actionDescription}>Choose a specific errand, select the issue and start a support chat.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.iconMuted} />
            </Pressable>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Send a general request</Text>
              <Text style={styles.sectionSubtitle}>For account questions or anything not linked to a specific errand.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <View style={styles.categoryWrap}>
                {CATEGORIES.map((item) => {
                  const active = category === item.value;
                  return (
                    <Pressable key={item.value} onPress={() => setCategory(item.value)} style={({ pressed }) => [styles.categoryChip, active && styles.categoryChipActive, pressed && styles.pressed]}>
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {category === "errand" ? (
                <>
                  <Text style={styles.fieldLabel}>LINK TO AN ERRAND</Text>
                  {loading && errands.length === 0 ? <ActivityIndicator color={palette.blue} /> : errands.length === 0 ? (
                    <Text style={styles.smallMuted}>No errands were found. Change the category if this is not about an errand.</Text>
                  ) : (
                    <View style={{ gap: 7 }}>
                      {selectedErrand ? (
                        <Pressable onPress={() => setSelectedErrandId("")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                          <Text style={styles.secondaryButtonText}>Clear selection · {selectedErrand.public_code || selectedErrand.title || "Errand"}</Text>
                        </Pressable>
                      ) : null}
                      {errands.slice(0, 8).map((item) => {
                        const active = selectedErrandId === item.id;
                        return (
                          <Pressable key={item.id} onPress={() => setSelectedErrandId(item.id)} style={({ pressed }) => [styles.issueOption, active && { borderColor: palette.blue, backgroundColor: palette.blueSoft }, pressed && styles.pressed]}>
                            <View style={styles.issueIcon}><Ionicons name="receipt-outline" size={16} color={palette.blue} /></View>
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text style={styles.issueLabel}>{item.public_code || item.title || "SaMi errand"}</Text>
                              <Text style={styles.smallMuted} numberOfLines={1}>{item.title || item.status || "Errand"}</Text>
                            </View>
                            <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={18} color={palette.blue} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>SUBJECT</Text>
              <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Briefly describe your request" placeholderTextColor={palette.muted} maxLength={160} />
              <Text style={styles.fieldLabel}>MESSAGE</Text>
              <TextInput style={styles.messageInput} value={message} onChangeText={setMessage} placeholder="Explain what happened and how we can help..." placeholderTextColor={palette.muted} multiline maxLength={4000} textAlignVertical="top" />
              <Text style={[styles.smallMuted, { textAlign: "right" }]}>{message.length}/4000</Text>
              <Pressable onPress={() => void createGeneralTicket()} disabled={submitting} style={({ pressed }) => [styles.primaryButton, submitting && styles.disabled, pressed && styles.pressed]}>
                {submitting ? <ActivityIndicator size="small" color={isDark ? "#0E1726" : "#FFFFFF"} /> : <Text style={styles.primaryButtonText}>Submit support request</Text>}
              </Pressable>
              <Text style={styles.formFootnote}>Your request will receive a reference number. You can return here to follow the conversation.</Text>
            </View>

            <View style={styles.ticketHeader}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Your support requests</Text>
                <Text style={styles.sectionSubtitle}>Open a request to read replies or send another message.</Text>
              </View>
              <View style={styles.countBadge}><Text style={styles.countText}>{tickets.length}</Text></View>
            </View>

            {loading && tickets.length === 0 ? (
              <View style={styles.emptyCard}><ActivityIndicator color={palette.blue} /><Text style={styles.emptyCopy}>Loading your support requests...</Text></View>
            ) : tickets.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="chatbubbles-outline" size={30} color={palette.blue} />
                <Text style={styles.emptyTitle}>No support requests yet</Text>
                <Text style={styles.emptyCopy}>When you contact SaMi Support, your conversations will appear here.</Text>
              </View>
            ) : (
              <View style={styles.ticketList}>
                {tickets.map((item) => {
                  const ticketStatus = statusPalette(item.status, palette);
                  return (
                    <Pressable key={item.id} onPress={() => void enterTicket(item, "home")} style={({ pressed }) => [styles.ticketCard, pressed && styles.pressed]}>
                      <View style={styles.ticketTop}>
                        <Text style={styles.ticketCode}>{item.public_code}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: ticketStatus.background }]}><Text style={[styles.statusText, { color: ticketStatus.text }]}>{formatStatus(item.status)}</Text></View>
                      </View>
                      <Text style={styles.ticketSubject}>{item.subject}</Text>
                      {!!item.latest_message ? <Text style={styles.latestMessage} numberOfLines={2}>{item.latest_message}</Text> : null}
                      <View style={styles.ticketBottom}>
                        <Text style={styles.ticketDate}>Updated {formatDate(item.updated_at)}</Text>
                        <Text style={styles.ticketOpen}>Open conversation ›</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={[styles.formFootnote, { paddingTop: 2 }]}>SaMi · Consider it done.</Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}