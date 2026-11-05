
import React, { useCallback, useEffect, useState } from "react";
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { apiRequest, dispatchGet } from "@/api";

type SupportCategory =
  | "errand"
  | "payment"
  | "account"
  | "technical"
  | "other";

type Errand = {
  id: string;
  public_code?: string | null;
  title: string;
  status?: string;
  service_area?: string | null;
  created_at?: string;
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
  id: number;
  ticket_id: string;
  sender_role: "customer" | "admin";
  sender_name?: string;
  message: string;
  is_internal?: boolean;
  created_at: string;
};

type TicketListResponse = {
  tickets: SupportTicket[];
};

type TicketDetailResponse = {
  ticket: SupportTicket;
  messages: SupportMessage[];
};

type CreateTicketResponse = {
  message: string;
  ticket: SupportTicket;
};

const NAVY = "#173B67";
const BLUE = "#2463B8";
const BACKGROUND = "#F5F7FB";
const WHITE = "#FFFFFF";
const INK = "#172B45";
const MUTED = "#708096";
const BORDER = "#E5EAF1";
const SOFT_BLUE = "#EAF1FC";
const RED = "#C53B45";

const CATEGORIES: {
  value: SupportCategory;
  label: string;
}[] = [
  { value: "errand", label: "Errand" },
  { value: "payment", label: "Payment" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In progress",
    waiting_customer: "Awaiting your reply",
    resolved: "Resolved",
    closed: "Closed",
  };

  return labels[status] || status.replaceAll("_", " ");
}

function statusColor(status: string) {
  if (status === "resolved" || status === "closed") {
    return {
      background: "#EAF6EF",
      text: "#287747",
    };
  }

  if (status === "waiting_customer") {
    return {
      background: "#FFF4E5",
      text: "#95600B",
    };
  }

  return {
    background: SOFT_BLUE,
    text: BLUE,
  };
}

export default function SupportScreen() {
  const params = useLocalSearchParams<{ errandId?: string }>();
  const routeErrandId =
    typeof params.errandId === "string" ? params.errandId : undefined;

  const [errands, setErrands] = useState<Errand[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  const [selectedErrandId, setSelectedErrandId] = useState(
    routeErrandId || "",
  );
  const [category, setCategory] = useState<SupportCategory>("errand");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");

  const [selectedTicket, setSelectedTicket] =
    useState<SupportTicket | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [pageError, setPageError] = useState("");
  const [ticketError, setTicketError] = useState("");

  useEffect(() => {
    if (routeErrandId) {
      setSelectedErrandId(routeErrandId);
      setCategory("errand");
    }
  }, [routeErrandId]);

  const loadData = useCallback(async () => {
    setPageError("");

    const [errandsResult, ticketsResult] = await Promise.allSettled([
      dispatchGet<{ errands: Errand[] }>("errands"),
      apiRequest<TicketListResponse>("/api/support/tickets"),
    ]);

    if (errandsResult.status === "fulfilled") {
      setErrands(errandsResult.value.errands || []);
    } else {
      setPageError(
        "Your errands could not be loaded. You can still submit a general support request.",
      );
    }

    if (ticketsResult.status === "fulfilled") {
      setTickets(ticketsResult.value.tickets || []);
    } else {
      setPageError((current) =>
        current
          ? current + "\nYour support history could not be loaded."
          : "Your support history could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      setLoading(true);
      await loadData();

      if (mounted) {
        setLoading(false);
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadData]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const loadTicket = async (
    ticketId: string,
    fallback?: SupportTicket,
  ) => {
    setSelectedTicket(fallback || null);
    setMessages([]);
    setTicketError("");
    setLoadingTicket(true);

    try {
      const result = await apiRequest<TicketDetailResponse>(
        `/api/support/tickets/${ticketId}`,
      );

      setSelectedTicket(result.ticket);
      setMessages(result.messages || []);
    } catch (error) {
      setTicketError(getErrorMessage(error));
    } finally {
      setLoadingTicket(false);
    }
  };

  const createTicket = async () => {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (cleanSubject.length < 5) {
      Alert.alert(
        "Subject required",
        "Enter a subject containing at least five characters.",
      );
      return;
    }

    if (!cleanMessage) {
      Alert.alert(
        "Describe the issue",
        "Please explain what you need help with.",
      );
      return;
    }

    if (
      category === "errand" &&
      !selectedErrandId
    ) {
      Alert.alert(
        "Select an errand",
        "Choose the errand this support request relates to, or change the category if it is not about an errand.",
      );
      return;
    }

    setSubmitting(true);
    setPageError("");

    try {
      const result = await apiRequest<CreateTicketResponse>(
        "/api/support/tickets",
        {
          method: "POST",
          body: {
            category,
            subject: cleanSubject,
            message: cleanMessage,
            relatedErrandId: selectedErrandId || undefined,
          },
        },
      );

      setSubject("");
      setMessage("");

      await loadData();
      await loadTicket(result.ticket.id, result.ticket);
    } catch (error) {
      Alert.alert(
        "Could not submit request",
        getErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket) return;

    const cleanReply = reply.trim();

    if (!cleanReply) {
      Alert.alert(
        "Message required",
        "Enter a message before sending.",
      );
      return;
    }

    setSendingReply(true);
    setTicketError("");

    try {
      await apiRequest(
        `/api/support/tickets/${selectedTicket.id}/messages`,
        {
          method: "POST",
          body: {
            message: cleanReply,
          },
        },
      );

      setReply("");

      await loadTicket(selectedTicket.id);
      await loadData();
    } catch (error) {
      setTicketError(getErrorMessage(error));
    } finally {
      setSendingReply(false);
    }
  };

  const openRelatedErrand = (errandId: string) => {
    router.push({
      pathname: "/(app)/errand/[id]",
      params: { id: errandId },
    });
  };

  const selectedErrand = errands.find(
    (item) => item.id === selectedErrandId,
  );

  const showTicketDetail = selectedTicket !== null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={BACKGROUND}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          {showTicketDetail ? (
            <Pressable
              onPress={() => {
                setSelectedTicket(null);
                setMessages([]);
                setTicketError("");
                setReply("");
              }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back to support requests"
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          )}

          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>
              {showTicketDetail
                ? selectedTicket.public_code
                : "Help & Support"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {showTicketDetail
                ? "Your support conversation"
                : "SaMi is here to help."}
            </Text>
          </View>

          {!showTicketDetail && (
            <Pressable
              style={styles.refreshButton}
              onPress={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={NAVY} />
              ) : (
                <Text style={styles.refreshIcon}>↻</Text>
              )}
            </Pressable>
          )}
        </View>

        {showTicketDetail ? (
          <View style={styles.flex}>
            {loadingTicket ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={BLUE} />
                <Text style={styles.loadingText}>
                  Loading conversation...
                </Text>
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.detailContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.ticketSummary}>
                    <View style={styles.ticketSummaryTop}>
                      <Text style={styles.ticketCode}>
                        {selectedTicket.public_code}
                      </Text>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: statusColor(
                              selectedTicket.status,
                            ).background,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color: statusColor(
                                selectedTicket.status,
                              ).text,
                            },
                          ]}
                        >
                          {formatStatus(selectedTicket.status)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.ticketSubject}>
                      {selectedTicket.subject}
                    </Text>

                    <Text style={styles.ticketMeta}>
                      {CATEGORIES.find(
                        (item) => item.value === selectedTicket.category,
                      )?.label || selectedTicket.category}
                      {"  ·  "}
                      {formatDate(selectedTicket.created_at)}
                    </Text>

                    {selectedTicket.related_errand_id && (
                      <Pressable
                        style={styles.relatedErrandButton}
                        onPress={() =>
                          openRelatedErrand(
                            selectedTicket.related_errand_id!,
                          )
                        }
                      >
                        <View style={styles.relatedErrandText}>
                          <Text style={styles.relatedErrandLabel}>
                            LINKED ERRAND
                          </Text>
                          <Text style={styles.relatedErrandTitle}>
                            {errands.find(
                              (item) =>
                                item.id ===
                                selectedTicket.related_errand_id,
                            )?.public_code || "View related errand"}
                          </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </Pressable>
                    )}
                  </View>

                  <Text style={styles.conversationHeading}>
                    Conversation
                  </Text>

                  {messages.length === 0 ? (
                    <View style={styles.emptyMessages}>
                      <Text style={styles.emptyText}>
                        No messages are available in this conversation yet.
                      </Text>
                    </View>
                  ) : (
                    messages.map((item) => {
                      const isCustomer =
                        item.sender_role === "customer";

                      return (
                        <View
                          key={String(item.id)}
                          style={[
                            styles.messageRow,
                            isCustomer && styles.customerMessageRow,
                          ]}
                        >
                          <View
                            style={[
                              styles.messageBubble,
                              isCustomer
                                ? styles.customerBubble
                                : styles.supportBubble,
                            ]}
                          >
                            <Text
                              style={[
                                styles.messageSender,
                                isCustomer && styles.customerSender,
                              ]}
                            >
                              {isCustomer
                                ? "You"
                                : "SaMi Support"}
                            </Text>

                            <Text
                              style={[
                                styles.messageBody,
                                isCustomer && styles.customerMessageBody,
                              ]}
                            >
                              {item.message}
                            </Text>

                            <Text
                              style={[
                                styles.messageTime,
                                isCustomer && styles.customerMessageTime,
                              ]}
                            >
                              {formatDate(item.created_at)}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {!!ticketError && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{ticketError}</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.replyPanel}>
                  <TextInput
                    style={styles.replyInput}
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Write a reply..."
                    placeholderTextColor="#95A1B1"
                    multiline
                    maxLength={4000}
                    textAlignVertical="top"
                  />

                  <Pressable
                    style={[
                      styles.sendButton,
                      (sendingReply || !reply.trim()) &&
                        styles.disabledButton,
                    ]}
                    onPress={() => void sendReply()}
                    disabled={sendingReply || !reply.trim()}
                  >
                    {sendingReply ? (
                      <ActivityIndicator color={WHITE} size="small" />
                    ) : (
                      <Text style={styles.sendButtonText}>
                        Send reply
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeIcon}>
                <Text style={styles.welcomeIconText}>?</Text>
              </View>

              <Text style={styles.welcomeTitle}>
                How can we help?
              </Text>

              <Text style={styles.welcomeDescription}>
                Get assistance with your errands, payments or account.
                You can submit a request and follow the response here.
              </Text>
            </View>

            {!!pageError && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>{pageError}</Text>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Submit a support request
              </Text>
              <Text style={styles.sectionSubtitle}>
                Tell us what you need help with.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>
                WHAT DO YOU NEED HELP WITH?
              </Text>

              <View style={styles.categoryWrap}>
                {CATEGORIES.map((item) => {
                  const active = category === item.value;

                  return (
                    <Pressable
                      key={item.value}
                      style={[
                        styles.categoryChip,
                        active && styles.categoryChipActive,
                      ]}
                      onPress={() => setCategory(item.value)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.fieldDivider} />

              <View style={styles.fieldHeadingRow}>
                <Text style={styles.fieldLabel}>
                  LINK AN ERRAND
                </Text>
                <Text style={styles.optionalText}>
                  {category === "errand" ? "Required" : "Optional"}
                </Text>
              </View>

              <Text style={styles.fieldHint}>
                Select the errand this request relates to.
              </Text>

              {loading ? (
                <ActivityIndicator
                  style={styles.errandsLoader}
                  color={BLUE}
                />
              ) : errands.length === 0 ? (
                <View style={styles.noErrands}>
                  <Text style={styles.noErrandsText}>
                    No errands are currently available to link.
                  </Text>
                </View>
              ) : (
                <View style={styles.errandChoices}>
                  <Pressable
                    style={[
                      styles.errandChoice,
                      !selectedErrandId &&
                        styles.errandChoiceSelected,
                    ]}
                    onPress={() => setSelectedErrandId("")}
                  >
                    <View style={styles.radioOuter}>
                      {!selectedErrandId && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <View style={styles.errandChoiceText}>
                      <Text style={styles.errandChoiceTitle}>
                        General support request
                      </Text>
                      <Text style={styles.errandChoiceMeta}>
                        Not linked to a particular errand
                      </Text>
                    </View>
                  </Pressable>

                  {errands.map((item) => {
                    const active = selectedErrandId === item.id;

                    return (
                      <Pressable
                        key={item.id}
                        style={[
                          styles.errandChoice,
                          active && styles.errandChoiceSelected,
                        ]}
                        onPress={() => {
                          setSelectedErrandId(item.id);
                          setCategory("errand");
                        }}
                      >
                        <View style={styles.radioOuter}>
                          {active && (
                            <View style={styles.radioInner} />
                          )}
                        </View>

                        <View style={styles.errandChoiceText}>
                          <Text style={styles.errandChoiceTitle}>
                            {item.public_code || "SaMi errand"}
                          </Text>
                          <Text
                            style={styles.errandChoiceMeta}
                            numberOfLines={2}
                          >
                            {item.title}
                            {item.status
                              ? ` · ${item.status.replaceAll("_", " ")}`
                              : ""}
                          </Text>
                        </View>

                        <Text style={styles.chevron}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {selectedErrand && (
                <View style={styles.selectedErrandNote}>
                  <Text style={styles.selectedErrandNoteText}>
                    This request will be linked to{" "}
                    {selectedErrand.public_code || selectedErrand.title}.
                  </Text>
                </View>
              )}

              <View style={styles.fieldDivider} />

              <Text style={styles.fieldLabel}>SUBJECT</Text>

              <TextInput
                style={styles.textInput}
                value={subject}
                onChangeText={setSubject}
                placeholder="Briefly describe the issue"
                placeholderTextColor="#95A1B1"
                maxLength={160}
              />

              <Text style={styles.fieldLabel}>MESSAGE</Text>

              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Explain what happened and how we can help..."
                placeholderTextColor="#95A1B1"
                multiline
                maxLength={4000}
                textAlignVertical="top"
              />

              <Text style={styles.characterCount}>
                {message.length}/4000
              </Text>

              <Pressable
                style={[
                  styles.submitButton,
                  submitting && styles.disabledButton,
                ]}
                onPress={() => void createTicket()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    Submit support request
                  </Text>
                )}
              </Pressable>

              <Text style={styles.formFootnote}>
                Your request will receive a reference number. You can
                return here to follow the conversation.
              </Text>
            </View>

            <View style={styles.ticketsHeader}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Your support requests
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Track requests and read replies from SaMi Support.
                </Text>
              </View>

              <View style={styles.ticketCount}>
                <Text style={styles.ticketCountText}>
                  {tickets.length}
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.listLoading}>
                <ActivityIndicator color={BLUE} />
                <Text style={styles.loadingText}>
                  Loading your requests...
                </Text>
              </View>
            ) : tickets.length === 0 ? (
              <View style={styles.emptyTickets}>
                <View style={styles.emptyTicketsIcon}>
                  <Text style={styles.emptyTicketsIconText}>?</Text>
                </View>
                <Text style={styles.emptyTicketsTitle}>
                  No support requests yet
                </Text>
                <Text style={styles.emptyTicketsDescription}>
                  When you submit a support request, it will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.ticketList}>
                {tickets.map((item) => {
                  const status = statusColor(item.status);

                  return (
                    <Pressable
                      key={item.id}
                      style={styles.ticketCard}
                      onPress={() =>
                        void loadTicket(item.id, item)
                      }
                    >
                      <View style={styles.ticketCardTop}>
                        <Text style={styles.ticketCode}>
                          {item.public_code}
                        </Text>

                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: status.background },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              { color: status.text },
                            ]}
                          >
                            {formatStatus(item.status)}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.ticketCardSubject}>
                        {item.subject}
                      </Text>

                      {!!item.latest_message && (
                        <Text
                          style={styles.latestMessage}
                          numberOfLines={2}
                        >
                          {item.latest_message}
                        </Text>
                      )}

                      {!!item.related_errand_id && (
                        <Text style={styles.linkedErrandText}>
                          Linked to an errand
                        </Text>
                      )}

                      <View style={styles.ticketCardBottom}>
                        <Text style={styles.ticketCardDate}>
                          Updated {formatDate(item.updated_at)}
                        </Text>
                        <Text style={styles.openConversation}>
                          Open conversation ›
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.helpNote}>
              <Text style={styles.helpNoteTitle}>
                Need help with a specific errand?
              </Text>
              <Text style={styles.helpNoteDescription}>
                Link your request to that errand so the support team can
                identify the correct job and understand its context.
              </Text>

              <Pressable
                style={styles.errandsButton}
                onPress={() => router.push("/(app)/errands")}
              >
                <Text style={styles.errandsButtonText}>
                  View my errands
                </Text>
              </Pressable>
            </View>

            <Text style={styles.footer}>
              SaMi · Consider it done.
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 17,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  backIcon: {
    color: NAVY,
    fontSize: 32,
    lineHeight: 35,
    marginTop: -4,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: INK,
    fontSize: 20,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshIcon: {
    color: NAVY,
    fontSize: 25,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 38,
  },
  welcomeCard: {
    backgroundColor: NAVY,
    borderRadius: 20,
    padding: 22,
    marginBottom: 25,
  },
  welcomeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  welcomeIconText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "800",
  },
  welcomeTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "800",
  },
  welcomeDescription: {
    color: "#DCE7F5",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  sectionHeader: {
    flex: 1,
    marginBottom: 13,
  },
  sectionTitle: {
    color: INK,
    fontSize: 17,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  formCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 17,
    marginBottom: 29,
  },
  fieldLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryChipActive: {
    backgroundColor: SOFT_BLUE,
    borderColor: BLUE,
  },
  categoryChipText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: NAVY,
    fontWeight: "700",
  },
  fieldDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 18,
  },
  fieldHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionalText: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 10,
  },
  fieldHint: {
    color: MUTED,
    fontSize: 11,
    marginTop: -4,
    marginBottom: 11,
  },
  errandsLoader: {
    padding: 16,
  },
  noErrands: {
    backgroundColor: BACKGROUND,
    borderRadius: 11,
    padding: 13,
  },
  noErrandsText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },
  errandChoices: {
    gap: 8,
  },
  errandChoice: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  errandChoiceSelected: {
    borderColor: BLUE,
    backgroundColor: "#F5F8FF",
  },
  radioOuter: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: BLUE,
  },
  errandChoiceText: {
    flex: 1,
  },
  errandChoiceTitle: {
    color: INK,
    fontSize: 12,
    fontWeight: "700",
  },
  errandChoiceMeta: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  chevron: {
    color: MUTED,
    fontSize: 23,
    marginLeft: 8,
  },
  selectedErrandNote: {
    backgroundColor: SOFT_BLUE,
    borderRadius: 9,
    padding: 10,
    marginTop: 10,
  },
  selectedErrandNoteText: {
    color: NAVY,
    fontSize: 11,
    lineHeight: 16,
  },
  textInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: INK,
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: WHITE,
  },
  messageInput: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingTop: 12,
    color: INK,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: WHITE,
  },
  characterCount: {
    color: MUTED,
    textAlign: "right",
    fontSize: 10,
    marginTop: 6,
  },
  submitButton: {
    minHeight: 48,
    backgroundColor: NAVY,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 17,
  },
  submitButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  formFootnote: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 11,
  },
  ticketsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  ticketCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: SOFT_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
    marginLeft: 10,
    paddingHorizontal: 7,
  },
  ticketCountText: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "800",
  },
  listLoading: {
    padding: 25,
    alignItems: "center",
  },
  loadingText: {
    color: MUTED,
    fontSize: 12,
    marginTop: 9,
  },
  emptyTickets: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: "center",
  },
  emptyTicketsIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: SOFT_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTicketsIconText: {
    color: BLUE,
    fontSize: 22,
    fontWeight: "800",
  },
  emptyTicketsTitle: {
    color: INK,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyTicketsDescription: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },
  ticketList: {
    gap: 11,
  },
  ticketCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 15,
  },
  ticketCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ticketCode: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  ticketCardSubject: {
    color: INK,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 12,
  },
  latestMessage: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  linkedErrandText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 9,
  },
  ticketCardBottom: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 13,
    paddingTop: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketCardDate: {
    color: MUTED,
    fontSize: 10,
  },
  openConversation: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "700",
  },
  helpNote: {
    backgroundColor: SOFT_BLUE,
    borderRadius: 17,
    padding: 17,
    marginTop: 25,
  },
  helpNoteTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },
  helpNoteDescription: {
    color: "#536984",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 7,
  },
  errandsButton: {
    alignSelf: "flex-start",
    backgroundColor: NAVY,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 13,
  },
  errandsButtonText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: "700",
  },
  footer: {
    color: "#9AA7B7",
    fontSize: 11,
    textAlign: "center",
    marginTop: 25,
  },
  warningBox: {
    backgroundColor: "#FFF4E5",
    borderColor: "#F0D9B5",
    borderWidth: 1,
    borderRadius: 11,
    padding: 12,
    marginBottom: 18,
  },
  warningText: {
    color: "#845A17",
    fontSize: 11,
    lineHeight: 17,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailContent: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  ticketSummary: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 16,
    marginBottom: 22,
  },
  ticketSummaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ticketSubject: {
    color: INK,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 13,
  },
  ticketMeta: {
    color: MUTED,
    fontSize: 11,
    marginTop: 7,
  },
  relatedErrandButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SOFT_BLUE,
    borderRadius: 11,
    padding: 12,
    marginTop: 15,
  },
  relatedErrandText: {
    flex: 1,
  },
  relatedErrandLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  relatedErrandTitle: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  conversationHeading: {
    color: INK,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 15,
  },
  emptyMessages: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 17,
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 13,
  },
  customerMessageRow: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "86%",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  supportBubble: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderBottomLeftRadius: 4,
  },
  customerBubble: {
    backgroundColor: NAVY,
    borderBottomRightRadius: 4,
  },
  messageSender: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
  },
  customerSender: {
    color: "#C6DAFA",
  },
  messageBody: {
    color: INK,
    fontSize: 13,
    lineHeight: 19,
  },
  customerMessageBody: {
    color: WHITE,
  },
  messageTime: {
    color: MUTED,
    fontSize: 9,
    marginTop: 7,
    textAlign: "right",
  },
  customerMessageTime: {
    color: "#CAD9ED",
  },
  errorBox: {
    backgroundColor: "#FDEDEE",
    borderRadius: 10,
    padding: 11,
    marginTop: 10,
  },
  errorText: {
    color: RED,
    fontSize: 11,
    lineHeight: 17,
  },
  replyPanel: {
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 17,
    paddingTop: 13,
    paddingBottom: 16,
  },
  replyInput: {
    minHeight: 65,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 11,
    color: INK,
    fontSize: 13,
    lineHeight: 19,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  sendButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "700",
  },
});
