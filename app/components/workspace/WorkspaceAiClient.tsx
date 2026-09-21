'use client';

import {
  Archive,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import ReactMarkdown from 'react-markdown';

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
        cancelled = true;
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

      if (conversationId) {
        setSelectedConversationId(
          conversationId,
        );
      }

      await loadConversations();

      if (conversationId) {
        await loadConversation(
          conversationId,
        );
      }
    } catch (
      candidate
    ) {
      setDraft(message);
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
    actionId: string,
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

  if (!entitled) {
    return (
      <StateCard
        icon={
          ShieldCheck
        }
        title="SaMi AI is not included in this workspace"
        description="AI availability follows the workspace subscription. Your normal workspace access remains unchanged."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0F131B]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="grid min-h-[680px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
        <div className="border-b border-slate-200 p-3 dark:border-white/10">
          <button
            type="button"
            onClick={
              newConversation
            }
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New conversation
          </button>
        </div>

        <div className="max-h-[620px] overflow-y-auto p-2">
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
                      setSelectedConversationId(
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

      <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black">
              {selectedConversation
                ?.title ||
                'SaMi AI'}
            </p>
            <p className="mt-0.5 truncate text-[9px] text-slate-400">
              {status?.company
                ?.name ||
                'Current company'}
              {status?.configured &&
              status.provider &&
              status.model
                ? ` · ${status.provider} · ${status.model}`
                : ''}
              {status?.preferences
                ?.memoryEnabled
                ? ' · memory on'
                : ' · memory off'}
            </p>
          </div>

          {selectedConversationId && (
            <button
              type="button"
              onClick={() =>
                void archiveConversation()
              }
              className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
          )}
        </div>

        {!status?.configured ? (
          <div className="flex flex-1 items-center justify-center p-6">
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
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {messages.length ===
                0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                    <Bot className="h-6 w-6" />
                  </div>

                  <h2 className="mt-4 text-lg font-black tracking-tight">
                    Ask SaMi about your workspace
                  </h2>

                  <p className="mt-2 max-w-lg text-xs leading-6 text-slate-500 dark:text-slate-400">
                    SaMi can use only the company data, apps and permissions already available to your account. It cannot bypass your normal access.
                  </p>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-5">
                  {messages.map(
                    message => (
                      <div
                        key={
                          message.id
                        }
                        className={
                          message.role ===
                          'assistant'
                            ? 'flex justify-start'
                            : 'flex justify-end'
                        }
                      >
                        <div
                          className={[
                            'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%]',
                            message.role ===
                            'assistant'
                              ? 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200'
                              : 'bg-blue-600 text-white',
                          ].join(
                            ' ',
                          )}
                        >
                          {message.role ===
                          'assistant' ? (
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

                          <p className="mt-2 text-[8px] opacity-60">
                            {timeLabel(
                              message.createdAt,
                            )}
                          </p>
                        </div>
                      </div>
                    ),
                  )}

                  {sending && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      SaMi is working…
                    </div>
                  )}
                </div>
              )}

              {pendingActions.length >
                0 && (
                <div className="mx-auto mt-6 max-w-3xl space-y-3">
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
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
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
                            className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-600 px-3 text-[10px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
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

            {error && (
              <div
                role="alert"
                className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <div className="border-t border-slate-200 p-3 dark:border-white/10 sm:p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-300 dark:border-white/10 dark:bg-white/[0.035]">
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
                  placeholder="Ask SaMi about your workspace…"
                  className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mx-auto mt-2 max-w-3xl text-center text-[9px] text-slate-400">
                SaMi uses your current company and effective workspace permissions. Enter sends · Shift+Enter adds a line.
              </p>
            </div>
          </>
        )}
      </section>
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
