'use client';

import Link from 'next/link';

import {
  Archive,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Gauge,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import ReactMarkdown from 'react-markdown';

import SaMiLogo from '@/app/components/SaMiLogo';
import WorkspaceCompanyIdentity from '@/app/components/workspace/WorkspaceCompanyIdentity';

type Conversation = {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

type Message = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  status: string;
  provider: string | null;
  model: string | null;
  correlationId: string | null;
  createdAt: string | null;
};

type PendingAction = {
  id: string;
  name: string;
  toolKey: string | null;
  riskLevel: string;
  expiresAt: string | null;
};

type AiPerformance = {
  requests24h: number;
  failures24h: number;
  averageResponseMs24h: number;
  totalTokens24h: number;
  toolCalls24h: number;
  requests7d: number;
};

type AiStatus = {
  entitled: boolean;
  configured: boolean;
  provider: string | null;
  model: string | null;
  configurationError: string | null;
  company: {
    id: string;
    name: string;
  };
  preferences: {
    memoryEnabled: boolean;
    useAccountPreferences: boolean;
    responseStyle: string;
  };
  performance: AiPerformance;
  availableTools: Array<{
    key: string;
    name: string;
    operation: string;
    riskLevel: string;
    confirmationRequired: boolean;
  }>;
};

async function readJson(
  response: Response,
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function timeLabel(
  value: string | null,
) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date.toLocaleString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat().format(
    value,
  );
}

function formatDuration(
  value: number,
) {
  if (
    !value ||
    value < 1
  ) {
    return '—';
  }

  if (
    value < 1000
  ) {
    return `${value} ms`;
  }

  return `${(
    value /
    1000
  ).toFixed(1)} s`;
}

export default function WorkspaceAiClient({
  entitled,
}: {
  entitled: boolean;
}) {
  const [
    status,
    setStatus,
  ] =
    useState<AiStatus | null>(
      null,
    );

  const [
    conversations,
    setConversations,
  ] =
    useState<Conversation[]>(
      [],
    );

  const [
    selectedConversationId,
    setSelectedConversationId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    messages,
    setMessages,
  ] =
    useState<Message[]>(
      [],
    );

  const [
    pendingActions,
    setPendingActions,
  ] =
    useState<PendingAction[]>(
      [],
    );

  const [
    draft,
    setDraft,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    confirmingActionId,
    setConfirmingActionId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    historyOpen,
    setHistoryOpen,
  ] =
    useState(false);

  const [
    performanceOpen,
    setPerformanceOpen,
  ] =
    useState(false);

  const selectedConversation =
    useMemo(
      () =>
        conversations.find(
          item =>
            item.id ===
            selectedConversationId,
        ) || null,
      [
        conversations,
        selectedConversationId,
      ],
    );

  const loadStatus =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/workspace/ai/status',
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
              'SaMi AI status could not be loaded.',
          );
        }

        setStatus(
          data.status,
        );
      },
      [],
    );

  const loadConversations =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/workspace/ai/conversations',
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
              'SaMi AI conversations could not be loaded.',
          );
        }

        setConversations(
          Array.isArray(
            data.conversations,
          )
            ? data.conversations
            : [],
        );
      },
      [],
    );

  const loadConversation =
    useCallback(
      async (
        conversationId:
          string,
      ) => {
        const response =
          await fetch(
            '/api/workspace/ai/conversations/' +
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
              'SaMi AI conversation could not be loaded.',
          );
        }

        setMessages(
          Array.isArray(
            data.messages,
          )
            ? data.messages
            : [],
        );

        setPendingActions(
          Array.isArray(
            data.pendingActions,
          )
            ? data.pendingActions
            : [],
        );
      },
      [],
    );

  useEffect(
    () => {
      if (!entitled) {
        setLoading(false);
        return;
      }

      let cancelled =
        false;

      void (async () => {
        setLoading(true);
        setError(null);

        try {
          await Promise.all([
            loadStatus(),
            loadConversations(),
          ]);
        } catch (
          candidate
        ) {
          if (!cancelled) {
            setError(
              candidate instanceof Error
                ? candidate.message
                : 'SaMi AI could not be loaded.',
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled =
          true;
      };
    },
    [
      entitled,
      loadConversations,
      loadStatus,
    ],
  );

  useEffect(
    () => {
      if (
        !selectedConversationId
      ) {
        setMessages([]);
        setPendingActions([]);
        return;
      }

      void loadConversation(
        selectedConversationId,
      ).catch(
        candidate => {
          setError(
            candidate instanceof Error
              ? candidate.message
              : 'Conversation could not be loaded.',
          );
        },
      );
    },
    [
      loadConversation,
      selectedConversationId,
    ],
  );

  function newConversation() {
    setSelectedConversationId(
      null,
    );
    setMessages([]);
    setPendingActions([]);
    setDraft('');
    setError(null);
    setHistoryOpen(false);
  }

  async function selectConversation(
    conversationId:
      string,
  ) {
    setSelectedConversationId(
      conversationId,
    );
    setHistoryOpen(false);
  }

  async function sendMessage() {
    const message =
      draft.trim();

    if (
      !message ||
      sending ||
      !status?.configured
    ) {
      return;
    }

    setSending(true);
    setError(null);
    setDraft('');

    try {
      const response =
        await fetch(
          '/api/workspace/ai/chat',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify({
                conversationId:
                  selectedConversationId,
                message,
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
            'SaMi AI could not complete that request.',
        );
      }

      const conversationId =
        String(
          data.conversation
            ?.id ||
          selectedConversationId ||
          '',
        );

      if (
        conversationId
      ) {
        setSelectedConversationId(
          conversationId,
        );
      }

      await Promise.all([
        loadConversations(),
        loadStatus(),
      ]);

      if (
        conversationId
      ) {
        await loadConversation(
          conversationId,
        );
      }
    } catch (
      candidate
    ) {
      setDraft(
        message,
      );

      setError(
        candidate instanceof Error
          ? candidate.message
          : 'SaMi AI could not complete that request.',
      );
    } finally {
      setSending(false);
    }
  }

  async function archiveConversation() {
    if (
      !selectedConversationId
    ) {
      return;
    }

    try {
      const response =
        await fetch(
          '/api/workspace/ai/conversations/' +
            encodeURIComponent(
              selectedConversationId,
            ),
          {
            method:
              'DELETE',
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
            'Conversation could not be archived.',
        );
      }

      newConversation();
      await loadConversations();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Conversation could not be archived.',
      );
    }
  }

  async function confirmAction(
    actionId:
      string,
  ) {
    setConfirmingActionId(
      actionId,
    );
    setError(null);

    try {
      const response =
        await fetch(
          '/api/workspace/ai/actions/' +
            encodeURIComponent(
              actionId,
            ) +
            '/confirm',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache: 'no-store',
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
            'The AI action could not be confirmed.',
        );
      }

      if (
        selectedConversationId
      ) {
        await loadConversation(
          selectedConversationId,
        );
      }

      await loadStatus();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'The AI action could not be confirmed.',
      );
    } finally {
      setConfirmingActionId(
        null,
      );
    }
  }

  function handleKeyDown(
    event:
      KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key ===
        'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">
        <div className="mx-auto flex h-16 w-full max-w-[1700px] items-center gap-2 px-2.5 sm:gap-3 sm:px-5 lg:px-7">
          <Link
            href="/dashboard"
            aria-label="Back to workspace"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <Link
            href="/dashboard"
            className="hidden shrink-0 sm:block"
            aria-label="SaMi workspace"
          >
            <SaMiLogo
              size="sm"
              className="max-w-[150px]"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-tight">
              {selectedConversation
                ?.title ||
                'SaMi AI'}
            </p>
            <p className="hidden truncate text-[10px] text-slate-400 sm:block">
              Permission-aware business assistant
            </p>
          </div>

          <WorkspaceCompanyIdentity />

          <button
            type="button"
            onClick={() =>
              setHistoryOpen(
                true,
              )
            }
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 sm:px-3 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">
              History
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setPerformanceOpen(
                true,
              )
            }
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 sm:px-3 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Gauge className="h-4 w-4" />
            <span className="hidden md:inline">
              Performance
            </span>
          </button>

          <Link
            href="/settings?tab=ai"
            aria-label="SaMi AI settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {!entitled ? (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <StateCard
            icon={
              ShieldCheck
            }
            title="SaMi AI is not included in this workspace"
            description="AI availability follows the workspace subscription. Your normal workspace access remains unchanged."
          />
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !status?.configured ? (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <StateCard
            icon={
              TriangleAlert
            }
            title="AI provider configuration required"
            description={
              status?.configurationError ||
              'Configure an AI provider, model and API key in the environment.'
            }
          />
        </div>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-3 pb-6 pt-5 sm:px-6 sm:pt-8">
              {messages.length ===
                0 ? (
                <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                    <Sparkles className="h-7 w-7" />
                  </div>

                  <h1 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">
                    How can SaMi help?
                  </h1>

                  <p className="mt-2 max-w-xl text-xs leading-6 text-slate-500 sm:text-sm dark:text-slate-400">
                    Ask about the current company, your apps, files, activity, notifications or business data available to your account. SaMi cannot bypass your permissions.
                  </p>

                  <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {[
                      'What changed recently?',
                      'What needs my attention?',
                      'What apps can I access?',
                      'Summarize my workspace activity.',
                    ].map(
                      suggestion => (
                        <button
                          key={
                            suggestion
                          }
                          type="button"
                          onClick={() =>
                            setDraft(
                              suggestion,
                            )
                          }
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/[0.07]"
                        >
                          {suggestion}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map(
                    message => (
                      <MessageBubble
                        key={
                          message.id
                        }
                        message={
                          message
                        }
                      />
                    ),
                  )}

                  {sending && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      SaMi is working…
                    </div>
                  )}
                </div>
              )}

              {pendingActions.length >
                0 && (
                <div className="mt-6 space-y-3">
                  {pendingActions.map(
                    action => (
                      <div
                        key={
                          action.id
                        }
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.07]"
                      >
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black">
                              Confirmation required
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                              {action.name} · risk {action.riskLevel}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={
                              confirmingActionId ===
                              action.id
                            }
                            onClick={() =>
                              void confirmAction(
                                action.id,
                              )
                            }
                            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-3 text-[10px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
                          >
                            {confirmingActionId ===
                            action.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Confirm
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div className="border-t border-slate-200/80 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-4 dark:border-white/10 dark:bg-[#0B0E14]/95">
            <div className="mx-auto max-w-4xl">
              {selectedConversationId && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      void archiveConversation()
                    }
                    className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[9px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-300"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive conversation
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm focus-within:border-blue-300 dark:border-white/10 dark:bg-white/[0.035] dark:focus-within:border-blue-500/40">
                <textarea
                  value={
                    draft
                  }
                  onChange={
                    event =>
                      setDraft(
                        event.target.value,
                      )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  rows={1}
                  maxLength={8000}
                  placeholder="Message SaMi…"
                  className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  aria-label="Send message"
                  disabled={
                    sending ||
                    !draft.trim()
                  }
                  onClick={() =>
                    void sendMessage()
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mt-2 text-center text-[9px] text-slate-400">
                SaMi uses your current company and effective workspace permissions. Enter sends · Shift+Enter adds a line.
              </p>
            </div>
          </div>
        </section>
      )}

      {historyOpen && (
        <HistoryDrawer
          conversations={
            conversations
          }
          selectedConversationId={
            selectedConversationId
          }
          onClose={() =>
            setHistoryOpen(
              false,
            )
          }
          onNew={
            newConversation
          }
          onSelect={
            conversationId =>
              void selectConversation(
                conversationId,
              )
          }
        />
      )}

      {performanceOpen && (
        <PerformancePanel
          status={
            status
          }
          onClose={() =>
            setPerformanceOpen(
              false,
            )
          }
        />
      )}
    </main>
  );
}

function MessageBubble({
  message,
}: {
  message:
    Message;
}) {
  const assistant =
    message.role ===
    'assistant';

  return (
    <div
      className={
        assistant
          ? 'flex justify-start'
          : 'flex justify-end'
      }
    >
      <div
        className={[
          'max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%]',
          assistant
            ? 'border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200'
            : 'bg-blue-600 text-white',
        ].join(
          ' ',
        )}
      >
        {assistant ? (
          <div className="prose prose-sm max-w-none break-words text-inherit prose-headings:text-inherit prose-strong:text-inherit prose-code:text-inherit dark:prose-invert">
            <ReactMarkdown>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        <p className="mt-2 text-[8px] opacity-55">
          {timeLabel(
            message.createdAt,
          )}
        </p>
      </div>
    </div>
  );
}

function HistoryDrawer({
  conversations,
  selectedConversationId,
  onClose,
  onNew,
  onSelect,
}: {
  conversations:
    Conversation[];
  selectedConversationId:
    string | null;
  onClose:
    () => void;
  onNew:
    () => void;
  onSelect:
    (
      conversationId:
        string,
    ) => void;
}) {
  return (
    <div className="fixed inset-0 z-[160]">
      <button
        type="button"
        aria-label="Close conversation history"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
      />

      <aside className="absolute inset-y-0 left-0 flex w-[330px] max-w-[calc(100vw-16px)] flex-col border-r border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0B0E14]">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          <History className="h-4 w-4 text-blue-600 dark:text-blue-300" />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black">
              Conversation history
            </p>
            <p className="mt-0.5 text-[9px] text-slate-400">
              Current company
            </p>
          </div>

          <button
            type="button"
            aria-label="Close history"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={
              onNew
            }
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New conversation
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {conversations.length ===
            0 ? (
            <div className="px-4 py-10 text-center">
              <Bot className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-bold">
                No conversations yet
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(
                conversation => (
                  <button
                    key={
                      conversation.id
                    }
                    type="button"
                    onClick={() =>
                      onSelect(
                        conversation.id,
                      )
                    }
                    className={[
                      'w-full rounded-xl px-3 py-3 text-left transition',
                      selectedConversationId ===
                        conversation.id
                        ? 'bg-blue-50 text-blue-950 dark:bg-blue-500/10 dark:text-white'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]',
                    ].join(
                      ' ',
                    )}
                  >
                    <p className="truncate text-xs font-bold">
                      {conversation.title}
                    </p>
                    <p className="mt-1 text-[9px] text-slate-400">
                      {timeLabel(
                        conversation.lastMessageAt ||
                          conversation.updatedAt,
                      )}
                    </p>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PerformancePanel({
  status,
  onClose,
}: {
  status:
    AiStatus | null;
  onClose:
    () => void;
}) {
  const performance =
    status?.performance;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close AI performance"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
      />

      <section className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0F131B]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 dark:border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Gauge className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">
              SaMi AI performance
            </p>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              {status?.provider || 'Provider unavailable'}
              {status?.model
                ? ` · ${status.model}`
                : ''}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close performance"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75dvh] overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PerformanceStat
              label="Requests · 24h"
              value={
                formatNumber(
                  performance
                    ?.requests24h ||
                  0,
                )
              }
            />

            <PerformanceStat
              label="Average response"
              value={
                formatDuration(
                  performance
                    ?.averageResponseMs24h ||
                  0,
                )
              }
            />

            <PerformanceStat
              label="Tokens · 24h"
              value={
                formatNumber(
                  performance
                    ?.totalTokens24h ||
                  0,
                )
              }
            />

            <PerformanceStat
              label="Tool calls · 24h"
              value={
                formatNumber(
                  performance
                    ?.toolCalls24h ||
                  0,
                )
              }
            />

            <PerformanceStat
              label="Failures · 24h"
              value={
                formatNumber(
                  performance
                    ?.failures24h ||
                  0,
                )
              }
            />

            <PerformanceStat
              label="Requests · 7d"
              value={
                formatNumber(
                  performance
                    ?.requests7d ||
                  0,
                )
              }
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoCard
              title="Memory"
              value={
                status
                  ?.preferences
                  ?.memoryEnabled
                  ? 'Enabled'
                  : 'Disabled'
              }
              description="Persistent personal memory for the current company."
            />

            <InfoCard
              title="Response style"
              value={
                status
                  ?.preferences
                  ?.responseStyle ||
                'balanced'
              }
              description="Default answer depth configured in SaMi AI settings."
            />

            <InfoCard
              title="Available tools"
              value={
                String(
                  status
                    ?.availableTools
                    .length ||
                  0,
                )
              }
              description="Tools already filtered by your apps, company and permissions."
            />

            <InfoCard
              title="Current company"
              value={
                status
                  ?.company
                  .name ||
                'Unavailable'
              }
              description="All AI business context is scoped to this company."
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Link
              href="/settings?tab=ai"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Settings className="h-4 w-4" />
              AI settings
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PerformanceStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tracking-tight">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-[10px] font-bold text-slate-400">
        {title}
      </p>
      <p className="mt-1 truncate text-sm font-black capitalize">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
}) {
  return (
    <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>

      <h2 className="mt-4 text-base font-black tracking-tight">
        {title}
      </h2>

      <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}
