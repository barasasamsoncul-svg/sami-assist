'use client';

import Link from 'next/link';
import {
  Archive,
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  Smartphone,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type NotificationItem = {
  id: string;
  type: string;
  eventKey: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string | null;
  href: string | null;
  sourceModule: string | null;
  sourceModel: string | null;
  sourceRecordId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Participant = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
};

type Conversation = {
  id: string;
  type: 'direct' | 'group' | 'announcement';
  subject: string | null;
  participants: Participant[];
  unreadCount: number;
  latestMessage: {
    body: string;
    senderUserId: string;
    createdAt: string;
  } | null;
  updatedAt: string;
};

type Message = {
  id: string;
  conversationId: string;
  senderUserId: string;
  replyToMessageId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

type Preferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  muteUntil: string | null;
};

type Tab =
  | 'alerts'
  | 'messages'
  | 'preferences';

type Props = {
  mode?: 'drawer' | 'page';
  userId: string;
  initialUnreadNotifications?: number;
  onUnreadChange?: (count: number) => void;
};

type Json = Record<string, any>;

async function readJson(
  response: Response,
): Promise<Json> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function when(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  const diff =
    Date.now() -
    date.getTime();

  if (diff < 60_000) {
    return 'Now';
  }

  if (diff < 3_600_000) {
    return (
      Math.max(
        1,
        Math.floor(
          diff / 60_000,
        ),
      ) +
      'm'
    );
  }

  if (diff < 86_400_000) {
    return (
      Math.floor(
        diff / 3_600_000,
      ) +
      'h'
    );
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
    },
  );
}

function initials(
  name: string,
) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      part =>
        part.charAt(0),
    )
    .join('')
    .toUpperCase() ||
    '?';
}

export default function WorkspaceNotificationCenter({
  mode = 'drawer',
  userId,
  initialUnreadNotifications = 0,
  onUnreadChange,
}: Props) {
  const [
    open,
    setOpen,
  ] =
    useState(
      mode === 'page',
    );

  const [
    deepLinkApplied,
    setDeepLinkApplied,
  ] =
    useState(
      false,
    );

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      'alerts',
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    notifications,
    setNotifications,
  ] =
    useState<
      NotificationItem[]
    >(
      [],
    );

  const [
    alertUnread,
    setAlertUnread,
  ] =
    useState(
      Math.max(
        0,
        initialUnreadNotifications,
      ),
    );

  const [
    liveAlert,
    setLiveAlert,
  ] =
    useState<
      NotificationItem | null
    >(
      null,
    );

  const alertUnreadRef =
    useRef(
      Math.max(
        0,
        initialUnreadNotifications,
      ),
    );

  const latestAlertIdRef =
    useRef<
      string | null
    >(
      null,
    );

  const hasLoadedSummaryRef =
    useRef(
      false,
    );

  const [
    conversations,
    setConversations,
  ] =
    useState<
      Conversation[]
    >(
      [],
    );

  const [
    messageUnread,
    setMessageUnread,
  ] =
    useState(
      0,
    );

  const [
    recipients,
    setRecipients,
  ] =
    useState<
      Participant[]
    >(
      [],
    );

  const [
    canAnnounce,
    setCanAnnounce,
  ] =
    useState(
      false,
    );

  const [
    preferences,
    setPreferences,
  ] =
    useState<Preferences>({
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
      smsEnabled: false,
      muteUntil: null,
    });

  const [
    selectedConversation,
    setSelectedConversation,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    messages,
    setMessages,
  ] =
    useState<
      Message[]
    >(
      [],
    );

  const [
    composeOpen,
    setComposeOpen,
  ] =
    useState(
      false,
    );

  const [
    composeType,
    setComposeType,
  ] =
    useState<
      'direct' | 'announcement'
    >(
      'direct',
    );

  const [
    recipientId,
    setRecipientId,
  ] =
    useState(
      '',
    );

  const [
    subject,
    setSubject,
  ] =
    useState(
      '',
    );

  const [
    draft,
    setDraft,
  ] =
    useState(
      '',
    );

  const totalUnread =
    alertUnread +
    messageUnread;

  useEffect(
    () => {
      onUnreadChange?.(
        totalUnread,
      );
    },
    [
      onUnreadChange,
      totalUnread,
    ],
  );

  const loadSummary =
    useCallback(
      async () => {
        try {
          const [
            summaryResponse,
            conversationsResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/workspace/notifications/summary',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/messages',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
            ]);

          const [
            summaryData,
            conversationData,
          ] =
            await Promise.all([
              readJson(
                summaryResponse,
              ),
              readJson(
                conversationsResponse,
              ),
            ]);

          if (
            summaryResponse.ok &&
            summaryData.success
          ) {
            const nextUnread =
              Math.max(
                0,
                Number(
                  summaryData
                    .summary
                    ?.unreadCount ||
                  0,
                ),
              );

            const latestUnread =
              summaryData
                .summary
                ?.latestUnread as
                NotificationItem |
                null |
                undefined;

            if (
              latestUnread?.id
            ) {
              if (
                hasLoadedSummaryRef
                  .current &&
                latestAlertIdRef
                  .current !==
                  latestUnread.id &&
                nextUnread >
                  alertUnreadRef
                    .current
              ) {
                setLiveAlert(
                  latestUnread,
                );
              }

              latestAlertIdRef
                .current =
                latestUnread.id;
            } else {
              latestAlertIdRef
                .current =
                null;
            }

            alertUnreadRef
              .current =
              nextUnread;

            setAlertUnread(
              nextUnread,
            );

            hasLoadedSummaryRef
              .current =
              true;
          }

          if (
            conversationsResponse.ok &&
            conversationData.success
          ) {
            setConversations(
              conversationData
                .conversations ||
              [],
            );

            setMessageUnread(
              Number(
                conversationData
                  .unreadCount ||
                0,
              ),
            );
          }
        } catch {
          // Shell badge failure must never block the workspace.
        }
      },
      [],
    );

  const loadPanel =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const [
            alertsResponse,
            conversationsResponse,
            recipientsResponse,
            preferencesResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/workspace/notifications?limit=60',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/messages',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/messages/recipients',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/notifications/preferences',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
            ]);

          const [
            alertsData,
            conversationsData,
            recipientsData,
            preferencesData,
          ] =
            await Promise.all([
              readJson(
                alertsResponse,
              ),
              readJson(
                conversationsResponse,
              ),
              readJson(
                recipientsResponse,
              ),
              readJson(
                preferencesResponse,
              ),
            ]);

          if (
            !alertsResponse.ok ||
            !alertsData.success
          ) {
            throw new Error(
              alertsData.error ||
              'Notifications could not be loaded.',
            );
          }

          setNotifications(
            alertsData
              .notifications ||
            [],
          );

          setAlertUnread(
            (
              alertsData
                .notifications ||
              []
            ).filter(
              (
                item: NotificationItem,
              ) =>
                !item.isRead,
            ).length,
          );

          if (
            conversationsResponse.ok &&
            conversationsData.success
          ) {
            setConversations(
              conversationsData
                .conversations ||
              [],
            );

            setMessageUnread(
              Number(
                conversationsData
                  .unreadCount ||
                0,
              ),
            );
          }

          if (
            recipientsResponse.ok &&
            recipientsData.success
          ) {
            setRecipients(
              recipientsData
                .recipients ||
              [],
            );

            setCanAnnounce(
              recipientsData
                .canAnnounce ===
              true,
            );
          }

          if (
            preferencesResponse.ok &&
            preferencesData.success
          ) {
            setPreferences(
              preferencesData
                .preferences,
            );
          }
        } catch (
          candidate
        ) {
          setError(
            candidate instanceof Error
              ? candidate.message
              : 'Notifications could not be loaded.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadSummary();
    },
    [
      loadSummary,
    ],
  );

  useEffect(
    () => {
      if (
        mode !==
        'drawer'
      ) {
        return;
      }

      const refresh =
        () => {
          if (
            typeof document ===
              'undefined' ||
            document
              .visibilityState ===
              'visible'
          ) {
            void loadSummary();
          }
        };

      const interval =
        window.setInterval(
          refresh,
          20_000,
        );

      window.addEventListener(
        'focus',
        refresh,
      );

      document.addEventListener(
        'visibilitychange',
        refresh,
      );

      return () => {
        window.clearInterval(
          interval,
        );

        window.removeEventListener(
          'focus',
          refresh,
        );

        document.removeEventListener(
          'visibilitychange',
          refresh,
        );
      };
    },
    [
      loadSummary,
      mode,
    ],
  );

  useEffect(
    () => {
      if (
        !liveAlert
      ) {
        return;
      }

      const timeout =
        window.setTimeout(
          () =>
            setLiveAlert(
              null,
            ),
          8_000,
        );

      return () =>
        window.clearTimeout(
          timeout,
        );
    },
    [
      liveAlert,
    ],
  );

  useEffect(
    () => {
      if (open) {
        setLiveAlert(
          null,
        );

        void loadPanel();
      }
    },
    [
      loadPanel,
      open,
    ],
  );

  useEffect(
    () => {
      if (
        mode !== 'page' ||
        deepLinkApplied ||
        typeof window === 'undefined'
      ) {
        return;
      }

      const params =
        new URLSearchParams(
          window.location.search,
        );

      const requestedTab =
        params.get(
          'tab',
        );

      const conversationId =
        params.get(
          'conversation',
        );

      const composeUserId =
        params.get(
          'compose',
        );

      if (
        requestedTab ===
        'messages'
      ) {
        setTab(
          'messages',
        );
      }

      setDeepLinkApplied(
        true,
      );

      if (
        composeUserId
      ) {
        setTab(
          'messages',
        );

        setComposeType(
          'direct',
        );

        setRecipientId(
          composeUserId,
        );

        setComposeOpen(
          true,
        );
      }

      if (
        conversationId
      ) {
        void openConversation(
          conversationId,
        );
      }
    },
    [
      deepLinkApplied,
      mode,
    ],
  );

  async function markAlert(
    item: NotificationItem,
    isRead: boolean,
  ) {
    setBusy(
      item.id,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/notifications/' +
          encodeURIComponent(
            item.id,
          ),
          {
            method:
              'PATCH',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                isRead,
              }),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Notification could not be updated.',
        );
      }

      setNotifications(
        current =>
          current.map(
            candidate =>
              candidate.id ===
                item.id
                ? data.notification
                : candidate,
          ),
      );

      await loadSummary();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Notification could not be updated.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function archiveAlert(
    item: NotificationItem,
  ) {
    setBusy(
      item.id,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/notifications/' +
          encodeURIComponent(
            item.id,
          ),
          {
            method:
              'DELETE',
            credentials:
              'same-origin',
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Notification could not be archived.',
        );
      }

      setNotifications(
        current =>
          current.filter(
            candidate =>
              candidate.id !==
              item.id,
          ),
      );

      await loadSummary();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Notification could not be archived.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function markAllRead() {
    setBusy(
      'all',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/notifications/read-all',
          {
            method:
              'POST',
            credentials:
              'same-origin',
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Notifications could not be updated.',
        );
      }

      setNotifications(
        current =>
          current.map(
            item => ({
              ...item,
              isRead:
                true,
              readAt:
                item.readAt ||
                new Date()
                  .toISOString(),
            }),
          ),
      );

      await loadSummary();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Notifications could not be updated.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function openConversation(
    conversationId: string,
  ) {
    setSelectedConversation(
      conversationId,
    );

    setBusy(
      'conversation',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/messages/' +
          encodeURIComponent(
            conversationId,
          ),
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Conversation could not be loaded.',
        );
      }

      setMessages(
        data.messages ||
        [],
      );

      await fetch(
        '/api/workspace/messages/' +
        encodeURIComponent(
          conversationId,
        ),
        {
          method:
            'PATCH',
          credentials:
            'same-origin',
        },
      );

      await loadSummary();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Conversation could not be loaded.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function sendReply() {
    if (
      !selectedConversation ||
      !draft.trim()
    ) {
      return;
    }

    setBusy(
      'send',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/messages/' +
          encodeURIComponent(
            selectedConversation,
          ),
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                body:
                  draft,
              }),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Message could not be sent.',
        );
      }

      setDraft(
        '',
      );

      await openConversation(
        selectedConversation,
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Message could not be sent.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function sendNewMessage() {
    if (
      !draft.trim()
    ) {
      return;
    }

    if (
      composeType ===
        'direct' &&
      !recipientId
    ) {
      setError(
        'Choose a coworker.',
      );
      return;
    }

    if (
      composeType ===
        'announcement' &&
      !subject.trim()
    ) {
      setError(
        'Add an announcement subject.',
      );
      return;
    }

    setBusy(
      'compose',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/messages',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                composeType ===
                  'announcement'
                  ? {
                      type:
                        'announcement',
                      subject,
                      body:
                        draft,
                    }
                  : {
                      type:
                        'direct',
                      recipientUserId:
                        recipientId,
                      body:
                        draft,
                    },
              ),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Message could not be sent.',
        );
      }

      setComposeOpen(
        false,
      );

      setRecipientId(
        '',
      );

      setSubject(
        '',
      );

      setDraft(
        '',
      );

      setTab(
        'messages',
      );

      await loadPanel();

      if (
        data.conversationId
      ) {
        await openConversation(
          data.conversationId,
        );
      }
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Message could not be sent.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function updatePreferences(
    patch: Partial<Preferences>,
  ) {
    setBusy(
      'preferences',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/notifications/preferences',
          {
            method:
              'PATCH',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                patch,
              ),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Notification preferences could not be saved.',
        );
      }

      setPreferences(
        data.preferences,
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Notification preferences could not be saved.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  const selected =
    useMemo(
      () =>
        conversations.find(
          conversation =>
            conversation.id ===
            selectedConversation,
        ) ||
        null,
      [
        conversations,
        selectedConversation,
      ],
    );

  const content = (
    <div
      className={
        mode === 'page'
          ? 'sami-surface min-h-[680px] rounded-[24px]'
          : 'flex h-full flex-col bg-white dark:bg-[#11141a]'
      }
    >
      <div className="flex items-center gap-3 border-b border-[var(--sami-border)] px-4 py-4 dark:border-white/10 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight">
            Notifications & messages
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Alerts, coworker messages and company announcements.
          </p>
        </div>

        {mode === 'drawer' && (
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() =>
              setOpen(
                false,
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-[var(--sami-border)] px-3 py-2 dark:border-white/10">
        <TabButton
          active={
            tab ===
            'alerts'
          }
          label="Alerts"
          badge={
            alertUnread
          }
          onClick={() =>
            setTab(
              'alerts',
            )
          }
        />

        <TabButton
          active={
            tab ===
            'messages'
          }
          label="Messages"
          badge={
            messageUnread
          }
          onClick={() =>
            setTab(
              'messages',
            )
          }
        />

        <button
          type="button"
          aria-label="Notification preferences"
          onClick={() =>
            setTab(
              'preferences',
            )
          }
          className={[
            'ml-auto flex h-9 w-9 items-center justify-center rounded-lg transition',
            tab ===
              'preferences'
              ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white',
          ].join(' ')}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : tab === 'alerts' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {alertUnread > 0
                ? `${alertUnread} unread`
                : 'All caught up'}
            </p>

            {alertUnread > 0 && (
              <button
                type="button"
                onClick={() =>
                  void markAllRead()
                }
                disabled={
                  busy ===
                  'all'
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50 disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                {busy ===
                'all' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all read
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length ===
            0 ? (
              <EmptyState
                icon={
                  Inbox
                }
                title="No notifications"
                message="SaMi will surface important workspace activity here."
              />
            ) : (
              notifications.map(
                item => (
                  <div
                    key={
                      item.id
                    }
                    className={[
                      'border-t border-slate-100 px-4 py-3 dark:border-white/5',
                      item.isRead
                        ? ''
                        : 'bg-blue-50/50 dark:bg-blue-500/[0.05]',
                    ].join(' ')}
                  >
                    <div className="flex gap-3">
                      <div
                        className={[
                          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                          item.priority ===
                            'urgent'
                            ? 'bg-rose-500'
                            : item.priority ===
                                'high'
                              ? 'bg-amber-500'
                              : item.isRead
                                ? 'bg-slate-200 dark:bg-slate-700'
                                : 'bg-blue-500',
                        ].join(' ')}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-bold leading-5">
                            {item.title}
                          </p>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {when(
                              item.createdAt,
                            )}
                          </span>
                        </div>

                        {item.message && (
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {item.message}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {item.href && (
                            <Link
                              href={
                                item.href
                              }
                              onClick={() => {
                                if (
                                  !item.isRead
                                ) {
                                  void markAlert(
                                    item,
                                    true,
                                  );
                                }

                                if (
                                  mode ===
                                  'drawer'
                                ) {
                                  setOpen(
                                    false,
                                  );
                                }
                              }}
                              className="inline-flex h-7 items-center rounded-lg bg-slate-950 px-2.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-950"
                            >
                              Open
                            </Link>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              void markAlert(
                                item,
                                !item.isRead,
                              )
                            }
                            disabled={
                              busy ===
                              item.id
                            }
                            className="inline-flex h-7 items-center rounded-lg px-2.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                          >
                            {item.isRead
                              ? 'Unread'
                              : 'Read'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void archiveAlert(
                                item,
                              )
                            }
                            disabled={
                              busy ===
                              item.id
                            }
                            className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>
      ) : tab === 'messages' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Internal workspace communication
            </p>

            <button
              type="button"
              onClick={() => {
                setComposeType(
                  'direct',
                );
                setComposeOpen(
                  true,
                );
                setError(
                  null,
                );
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-950"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          {composeOpen ? (
            <div className="border-y border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.025]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setComposeType(
                      'direct',
                    )
                  }
                  className={[
                    'h-8 rounded-lg px-3 text-[11px] font-bold',
                    composeType ===
                      'direct'
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400',
                  ].join(' ')}
                >
                  Direct message
                </button>

                {canAnnounce && (
                  <button
                    type="button"
                    onClick={() =>
                      setComposeType(
                        'announcement',
                      )
                    }
                    className={[
                      'h-8 rounded-lg px-3 text-[11px] font-bold',
                      composeType ===
                        'announcement'
                        ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                        : 'border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400',
                    ].join(' ')}
                  >
                    Company announcement
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setComposeOpen(
                      false,
                    )
                  }
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {composeType ===
              'direct' ? (
                <select
                  value={
                    recipientId
                  }
                  onChange={
                    event =>
                      setRecipientId(
                        event.target
                          .value,
                      )
                  }
                  className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none dark:border-white/10 dark:bg-[#0B0E14]"
                >
                  <option value="">
                    Choose coworker
                  </option>
                  {recipients.map(
                    recipient => (
                      <option
                        key={
                          recipient.id
                        }
                        value={
                          recipient.id
                        }
                      >
                        {recipient.name} — {recipient.email}
                      </option>
                    ),
                  )}
                </select>
              ) : (
                <input
                  value={
                    subject
                  }
                  onChange={
                    event =>
                      setSubject(
                        event.target
                          .value,
                      )
                  }
                  placeholder="Announcement subject"
                  maxLength={
                    255
                  }
                  className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none dark:border-white/10 dark:bg-[#0B0E14]"
                />
              )}

              <textarea
                value={
                  draft
                }
                onChange={
                  event =>
                    setDraft(
                      event.target
                        .value,
                    )
                }
                placeholder={
                  composeType ===
                    'announcement'
                    ? 'Write the company announcement…'
                    : 'Write a message…'
                }
                maxLength={
                  8000
                }
                rows={
                  4
                }
                className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 outline-none dark:border-white/10 dark:bg-[#0B0E14]"
              />

              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void sendNewMessage()
                  }
                  disabled={
                    busy ===
                    'compose'
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  {busy ===
                  'compose' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : composeType ===
                    'announcement' ? (
                    <Megaphone className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send
                </button>
              </div>
            </div>
          ) : null}

          <div className={[
            'min-h-0 flex-1',
            mode === 'page'
              ? 'grid lg:grid-cols-[330px_minmax(0,1fr)]'
              : '',
          ].join(' ')}>
            <div className={[
              'min-h-0 overflow-y-auto',
              mode === 'page'
                ? 'border-r border-slate-200 dark:border-white/10'
                : selectedConversation
                  ? 'hidden'
                  : '',
            ].join(' ')}>
              {conversations.length ===
              0 ? (
                <EmptyState
                  icon={
                    MessageSquare
                  }
                  title="No conversations"
                  message="Message a coworker or send a company announcement."
                />
              ) : (
                conversations.map(
                  conversation => {
                    const others =
                      conversation.participants
                        .filter(
                          participant =>
                            participant.id !==
                            userId,
                        );

                    const label =
                      conversation.subject ||
                      others
                        .map(
                          participant =>
                            participant.name,
                        )
                        .join(', ') ||
                      'Conversation';

                    return (
                      <button
                        key={
                          conversation.id
                        }
                        type="button"
                        onClick={() =>
                          void openConversation(
                            conversation.id,
                          )
                        }
                        className={[
                          'w-full border-t border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.04]',
                          selectedConversation ===
                            conversation.id
                            ? 'bg-blue-50/70 dark:bg-blue-500/[0.06]'
                            : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          <div className={[
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black',
                            conversation.type ===
                              'announcement'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                          ].join(' ')}>
                            {conversation.type ===
                              'announcement' ? (
                              <Megaphone className="h-4 w-4" />
                            ) : (
                              initials(
                                label,
                              )
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-xs font-bold">
                                {label}
                              </p>
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {when(
                                  conversation.updatedAt,
                                )}
                              </span>
                            </div>

                            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {conversation.latestMessage?.body ||
                                'No messages yet'}
                            </p>
                          </div>

                          {conversation.unreadCount >
                          0 && (
                            <span className="flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[9px] font-black text-white">
                              {conversation.unreadCount >
                              99
                                ? '99+'
                                : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  },
                )
              )}
            </div>

            <div className={[
              'min-h-0',
              mode !== 'page' &&
              !selectedConversation
                ? 'hidden'
                : '',
            ].join(' ')}>
              {selectedConversation ? (
                <div className="flex h-full min-h-[430px] flex-col">
                  <div className="flex items-center gap-3 border-b border-[var(--sami-border)] px-4 py-3 dark:border-white/10">
                    {mode !== 'page' && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedConversation(
                            null,
                          )
                        }
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        Back
                      </button>
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {selected?.subject ||
                          selected?.participants
                            .filter(
                              participant =>
                                participant.id !==
                                userId,
                            )
                            .map(
                              participant =>
                                participant.name,
                            )
                            .join(', ') ||
                          'Conversation'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {selected?.type ===
                          'announcement'
                          ? 'Company announcement'
                          : 'Internal workspace message'}
                      </p>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {busy ===
                      'conversation' &&
                    messages.length ===
                      0 ? (
                      <div className="flex min-h-[220px] items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      messages.map(
                        message => {
                          const mine =
                            message.senderUserId ===
                            userId;

                          return (
                            <div
                              key={
                                message.id
                              }
                              className={[
                                'flex',
                                mine
                                  ? 'justify-end'
                                  : 'justify-start',
                              ].join(' ')}
                            >
                              <div className={[
                                'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-5',
                                mine
                                  ? 'rounded-br-md bg-blue-600 text-white'
                                  : 'rounded-bl-md bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
                              ].join(' ')}>
                                <p className="whitespace-pre-wrap break-words">
                                  {message.body}
                                </p>
                                <p className={[
                                  'mt-1 text-[9px]',
                                  mine
                                    ? 'text-blue-100'
                                    : 'text-slate-400',
                                ].join(' ')}>
                                  {when(
                                    message.createdAt,
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        },
                      )
                    )}
                  </div>

                  <div className="border-t border-slate-200 p-3 dark:border-white/10">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={
                          draft
                        }
                        onChange={
                          event =>
                            setDraft(
                              event.target
                                .value,
                            )
                        }
                        placeholder="Reply…"
                        rows={
                          2
                        }
                        maxLength={
                          8000
                        }
                        className="min-h-10 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs leading-5 outline-none dark:border-white/10 dark:bg-white/[0.04]"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void sendReply()
                        }
                        disabled={
                          busy ===
                            'send' ||
                          !draft.trim()
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-50"
                      >
                        {busy ===
                        'send' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : mode === 'page' ? (
                <EmptyState
                  icon={
                    MessageSquare
                  }
                  title="Choose a conversation"
                  message="Select a message thread from the left."
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Bell className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">
                  In-app notifications
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Show workspace alerts in SaMi. Messages remain available in the Messages inbox.
                </p>
              </div>

              <Toggle
                checked={
                  preferences.inAppEnabled
                }
                disabled={
                  busy ===
                  'preferences'
                }
                onChange={
                  checked =>
                    void updatePreferences({
                      inAppEnabled:
                        checked,
                    })
                }
              />
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Mail className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">
                  Email notifications
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Receive optional workspace alerts by email. Login, verification and security emails are never controlled by this switch.
                </p>
              </div>

              <Toggle
                checked={
                  preferences.emailEnabled
                }
                disabled={
                  busy ===
                  'preferences'
                }
                onChange={
                  checked =>
                    void updatePreferences({
                      emailEnabled:
                        checked,
                    })
                }
              />
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Smartphone className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">
                  SMS notifications
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Receive important workspace alerts, messages and billing updates by SMS using the phone number on your SaMi profile.
                </p>
              </div>

              <Toggle
                checked={
                  preferences.smsEnabled
                }
                disabled={
                  busy ===
                  'preferences'
                }
                onChange={
                  checked =>
                    void updatePreferences({
                      smsEnabled:
                        checked,
                    })
                }
              />
            </div>
          </div>

          {mode ===
            'drawer' && (
            <Link
              href="/notifications"
              onClick={() =>
                setOpen(
                  false,
                )
              }
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
            >
              Open full notification center
            </Link>
          )}
        </div>
      )}
    </div>
  );

  if (
    mode ===
    'page'
  ) {
    return content;
  }

  return (
    <>
      {liveAlert && (
        <div
          aria-live="polite"
          className="fixed right-3 top-[72px] z-[145] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-blue-500/20 dark:bg-[#11141a] sm:right-5"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Bell className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
                New workspace alert
              </p>

              <p className="mt-1 text-xs font-black leading-5 text-slate-950 dark:text-white">
                {liveAlert.title}
              </p>

              {liveAlert.message && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {liveAlert.message}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                {liveAlert.href && (
                  <Link
                    href={
                      liveAlert.href
                    }
                    onClick={() => {
                      void markAlert(
                        liveAlert,
                        true,
                      );

                      setLiveAlert(
                        null,
                      );
                    }}
                    className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-[10px] font-black text-white transition hover:bg-blue-700"
                  >
                    Open
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setLiveAlert(
                      null,
                    );

                    setOpen(
                      true,
                    );
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]"
                >
                  View notifications
                </button>

                <button
                  type="button"
                  aria-label="Dismiss workspace alert"
                  onClick={() =>
                    setLiveAlert(
                      null,
                    )
                  }
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={
          totalUnread >
          0
            ? `Open notifications, ${totalUnread} unread`
            : 'Open notifications'
        }
        onClick={() => {
          setLiveAlert(
            null,
          );

          setOpen(
            true,
          );
        }}
        className={[
          'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-[var(--sami-surface)] shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:bg-[var(--sami-surface-soft)]',
          totalUnread >
            0
            ? 'border-blue-300 text-blue-600 ring-2 ring-blue-500/10 dark:border-blue-500/30 dark:text-blue-300'
            : 'border-[var(--sami-border)] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
        ].join(
          ' ',
        )}
      >
        <Bell
          className={[
            'h-4 w-4',
            totalUnread >
              0
              ? 'fill-current'
              : '',
          ].join(
            ' ',
          )}
        />

        {totalUnread >
        0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-[#0B0E14]">
            {totalUnread >
            99
              ? '99+'
              : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[130]">
          <button
            type="button"
            aria-label="Close notification panel"
            onClick={() =>
              setOpen(
                false,
              )
            }
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 right-0 isolate w-full max-w-[520px] overflow-hidden border-l border-[var(--sami-border)] bg-white shadow-[var(--sami-shadow-lg)] dark:bg-[#11141a]">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[11px] font-bold transition',
        active
          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
      ].join(' ')}
    >
      {label}

      {badge >
      0 && (
        <span className={[
          'rounded-full px-1.5 py-0.5 text-[9px]',
          active
            ? 'bg-white/20 text-white dark:bg-slate-950/10 dark:text-slate-950'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
        ].join(' ')}>
          {badge >
          99
            ? '99+'
            : badge}
        </span>
      )}
    </button>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={
        checked
      }
      disabled={
        disabled
      }
      onClick={() =>
        onChange(
          !checked,
        )
      }
      className={[
        'relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50',
        checked
          ? 'bg-blue-600'
          : 'bg-slate-200 dark:bg-slate-700',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition',
          checked
            ? 'left-[22px]'
            : 'left-0.5',
        ].join(' ')}
      />
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: typeof Bell;
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-bold">
        {title}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">
        {message}
      </p>
    </div>
  );
}
