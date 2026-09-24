'use client';

import Link from 'next/link';

import {
  Bot,
  Brain,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import SamiAiUsageSummary from '@/app/components/ai/SamiAiUsageSummary';

import type {
  SamiAiWorkspaceStatus,
} from '@/app/components/ai/SamiAiStatus';

type AiPreferences = {
  memoryEnabled: boolean;
  useAccountPreferences: boolean;
  responseStyle:
    | 'balanced'
    | 'concise'
    | 'detailed';
};

type AiMemory = {
  id: string;
  key: string | null;
  type: string;
  content: string;
  importance: number;
  createdByAi: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
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

function formatDate(
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

export default function AiSettings() {
  const [
    preferences,
    setPreferences,
  ] =
    useState<AiPreferences | null>(
      null,
    );

  const [
    status,
    setStatus,
  ] =
    useState<SamiAiWorkspaceStatus | null>(
      null,
    );

  const [
    memories,
    setMemories,
  ] =
    useState<AiMemory[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    forgettingId,
    setForgettingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    confirmClear,
    setConfirmClear,
  ] =
    useState(
      false,
    );

  const [
    clearing,
    setClearing,
  ] =
    useState(
      false,
    );

  const [
    confirmClearHistory,
    setConfirmClearHistory,
  ] =
    useState(
      false,
    );

  const [
    clearingHistory,
    setClearingHistory,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    success,
    setSuccess,
  ] =
    useState<string | null>(
      null,
    );

  const load =
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
            preferencesResponse,
            memoriesResponse,
            statusResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/workspace/ai/preferences',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/ai/memories',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
              fetch(
                '/api/workspace/ai/status',
                {
                  credentials:
                    'same-origin',
                  cache:
                    'no-store',
                },
              ),
            ]);

          const [
            preferencesData,
            memoriesData,
            statusData,
          ] =
            await Promise.all([
              readJson(
                preferencesResponse,
              ),
              readJson(
                memoriesResponse,
              ),
              readJson(
                statusResponse,
              ),
            ]);

          if (
            !preferencesResponse.ok ||
            !preferencesData.success
          ) {
            throw new Error(
              preferencesData.error ||
                'SaMi AI preferences could not be loaded.',
            );
          }

          if (
            !memoriesResponse.ok ||
            !memoriesData.success
          ) {
            throw new Error(
              memoriesData.error ||
                'SaMi AI memories could not be loaded.',
            );
          }

          if (
            !statusResponse.ok ||
            !statusData.success
          ) {
            throw new Error(
              statusData.error ||
                'SaMi AI usage and capabilities could not be loaded.',
            );
          }

          setStatus(
            statusData.status,
          );

          setPreferences(
            preferencesData.preferences,
          );

          setMemories(
            Array.isArray(
              memoriesData.memories,
            )
              ? memoriesData.memories
              : [],
          );
        } catch (
          candidate
        ) {
          setError(
            candidate instanceof Error
              ? candidate.message
              : 'SaMi AI settings could not be loaded.',
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
      void load();
    },
    [
      load,
    ],
  );

  async function savePreferences(
    patch:
      Partial<AiPreferences>,
  ) {
    if (
      !preferences ||
      saving
    ) {
      return;
    }

    const previous =
      preferences;

    const next = {
      ...preferences,
      ...patch,
    };

    setPreferences(
      next,
    );
    setSaving(
      true,
    );
    setError(
      null,
    );
    setSuccess(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/ai/preferences',
          {
            method:
              'PATCH',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
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
            'SaMi AI preferences could not be saved.',
        );
      }

      setPreferences(
        data.preferences,
      );

      setSuccess(
        'SaMi AI preferences saved.',
      );
    } catch (
      candidate
    ) {
      setPreferences(
        previous,
      );

      setError(
        candidate instanceof Error
          ? candidate.message
          : 'SaMi AI preferences could not be saved.',
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  async function forgetMemory(
    memoryId: string,
  ) {
    setForgettingId(
      memoryId,
    );
    setError(
      null,
    );
    setSuccess(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/ai/memories/' +
            encodeURIComponent(
              memoryId,
            ),
          {
            method:
              'DELETE',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
            },
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
            'That memory could not be forgotten.',
        );
      }

      setMemories(
        current =>
          current.filter(
            memory =>
              memory.id !==
              memoryId,
          ),
      );

      setSuccess(
        'Memory forgotten.',
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'That memory could not be forgotten.',
      );
    } finally {
      setForgettingId(
        null,
      );
    }
  }

  async function clearAllMemories() {
    if (
      !confirmClear
    ) {
      setConfirmClear(
        true,
      );
      return;
    }

    setClearing(
      true,
    );
    setError(
      null,
    );
    setSuccess(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/ai/memories',
          {
            method:
              'DELETE',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
            },
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
            'SaMi AI memories could not be cleared.',
        );
      }

      setMemories(
        [],
      );

      setConfirmClear(
        false,
      );

      setSuccess(
        'All personal SaMi AI memories for this company were cleared.',
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'SaMi AI memories could not be cleared.',
      );
    } finally {
      setClearing(
        false,
      );
    }
  }

  async function clearChatHistory() {
    if (
      !confirmClearHistory
    ) {
      setConfirmClearHistory(
        true,
      );
      return;
    }

    setClearingHistory(
      true,
    );
    setError(
      null,
    );
    setSuccess(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/workspace/ai/conversations',
          {
            method:
              'DELETE',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
            },
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
            'SaMi AI chat history could not be cleared.',
        );
      }

      setConfirmClearHistory(
        false,
      );

      setStatus(
        current =>
          current
            ? {
                ...current,
                capabilities: {
                  ...current
                    .capabilities,
                  conversationCount:
                    0,
                },
              }
            : current,
      );

      const count =
        Number(
          data.deletedConversations ||
          0,
        );

      setSuccess(
        `${count} SaMi AI conversation${count === 1 ? '' : 's'} cleared.`,
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'SaMi AI chat history could not be cleared.',
      );
    } finally {
      setClearingHistory(
        false,
      );
    }
  }


  if (
    loading
  ) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-4 sm:p-6 dark:border-blue-900/50 dark:from-blue-950/20 dark:to-cyan-950/20">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
              Personal AI
            </p>

            <h2 className="mt-1 text-base font-bold">
              SaMi AI
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              SaMi remembers your conversations, current account preferences and—when memory is enabled—useful personal context across future chats in this company. AI access still follows your normal workspace permissions.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <Link
            href="/ai"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-xs font-semibold text-white transition hover:opacity-95"
          >
            <Bot className="h-4 w-4" />
            Open SaMi AI
          </Link>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-white/10">
        <SamiAiUsageSummary
          status={
            status
          }
        />
      </section>

      {(error ||
        success) && (
        <div
          role={
            error
              ? 'alert'
              : 'status'
          }
          className={[
            'mt-4 rounded-xl border px-4 py-3 text-xs',
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
          ].join(
            ' ',
          )}
        >
          {error ||
            success}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SettingCard
          title="Memory across chats"
          description="Remember stable preferences, terminology and useful recurring context for you in the current company."
        >
          <Toggle
            checked={
              preferences
                ?.memoryEnabled ===
              true
            }
            disabled={
              saving ||
              !preferences
            }
            onChange={
              checked =>
                void savePreferences({
                  memoryEnabled:
                    checked,
                })
            }
            label={
              preferences
                ?.memoryEnabled
                ? 'Memory on'
                : 'Memory off'
            }
          />
        </SettingCard>

        <SettingCard
          title="Use account preferences"
          description="Use your current locale, timezone, date/time format and other saved account display preferences when responding."
        >
          <Toggle
            checked={
              preferences
                ?.useAccountPreferences ===
              true
            }
            disabled={
              saving ||
              !preferences
            }
            onChange={
              checked =>
                void savePreferences({
                  useAccountPreferences:
                    checked,
                })
            }
            label={
              preferences
                ?.useAccountPreferences
                ? 'Account context on'
                : 'Account context off'
            }
          />
        </SettingCard>

        <SettingCard
          title="Response style"
          description="Choose how much detail SaMi should normally use. You can still ask for a different style in any conversation."
        >
          <select
            value={
              preferences
                ?.responseStyle ||
              'balanced'
            }
            disabled={
              saving ||
              !preferences
            }
            onChange={
              event =>
                void savePreferences({
                  responseStyle:
                    event.target
                      .value as
                      AiPreferences[
                        'responseStyle'
                      ],
                })
            }
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-blue-300 dark:border-white/10 dark:bg-[#0B0E14]"
          >
            <option value="balanced">
              Balanced
            </option>
            <option value="concise">
              Concise
            </option>
            <option value="detailed">
              Detailed
            </option>
          </select>
        </SettingCard>

        <SettingCard
          title="Permission-safe context"
          description="SaMi only receives tools and records already available to your signed-in account, assigned apps and current company."
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            Always enforced server-side
          </div>
        </SettingCard>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">
              Data controls
            </h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              Control your SaMi AI conversation history and durable personal memory for this company. Clearing chats does not remove business audit records for confirmed actions.
            </p>
          </div>

          <button
            type="button"
            disabled={
              clearingHistory
            }
            onClick={() =>
              void clearChatHistory()
            }
            className={[
              'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-bold transition disabled:opacity-60',
              confirmClearHistory
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10',
            ].join(
              ' ',
            )}
          >
            {clearingHistory ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {confirmClearHistory
              ? 'Confirm clear chats'
              : 'Clear chat history'}
          </button>
        </div>

        {confirmClearHistory && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            <span>
              This permanently removes your SaMi AI conversations and messages for the current company. Pending AI actions are expired first.
            </span>
            <button
              type="button"
              onClick={() =>
                setConfirmClearHistory(
                  false,
                )
              }
              className="shrink-0 font-bold underline"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="mt-5 min-w-0 rounded-2xl border border-slate-200 p-3.5 sm:p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="text-sm font-bold">
                Saved memories
              </h3>
            </div>

            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              These are durable personal memories for you in the current company. Conversation history is stored separately and is not deleted by clearing this list.
            </p>
          </div>

          {memories.length >
            0 && (
            <button
              type="button"
              disabled={
                clearing
              }
              onClick={() =>
                void clearAllMemories()
              }
              className={[
                'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-bold transition disabled:opacity-60',
                confirmClear
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10',
              ].join(
                ' ',
              )}
            >
              {clearing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {confirmClear
                ? 'Confirm clear all'
                : 'Clear all'}
            </button>
          )}
        </div>

        {confirmClear && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            <span>
              This clears durable personal memories for the current company. It does not delete conversations.
            </span>
            <button
              type="button"
              onClick={() =>
                setConfirmClear(
                  false,
                )
              }
              className="shrink-0 font-bold underline"
            >
              Cancel
            </button>
          </div>
        )}

        {memories.length ===
          0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
            <Brain className="mx-auto h-5 w-5 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-xs font-bold">
              No durable memories yet
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              When memory is enabled, SaMi can remember stable preferences and useful context from future conversations.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {memories.map(
              memory => (
                <div
                  key={
                    memory.id
                  }
                  className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    <Brain className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold">
                        {memory.type}
                      </p>
                      {memory.key && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          {memory.key}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                      {memory.content}
                    </p>

                    <p className="mt-1 text-[9px] text-slate-400">
                      Importance {memory.importance}/10
                      {memory.updatedAt
                        ? ` · Updated ${formatDate(memory.updatedAt)}`
                        : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      forgettingId ===
                      memory.id
                    }
                    onClick={() =>
                      void forgetMemory(
                        memory.id,
                      )
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                    aria-label="Forget this memory"
                  >
                    {forgettingId ===
                    memory.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-xs font-semibold">
        {title}
      </p>
      <p className="mt-1 min-h-10 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <div className="mt-3">
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (
    value: boolean,
  ) => void;
  label: string;
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
      className="inline-flex items-center gap-2 text-[10px] font-semibold text-slate-600 disabled:opacity-60 dark:text-slate-300"
    >
      <span
        className={[
          'relative inline-flex h-6 w-11 rounded-full transition',
          checked
            ? 'bg-blue-600'
            : 'bg-slate-200 dark:bg-white/10',
        ].join(
          ' ',
        )}
      >
        <span
          className={[
            'absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition',
            checked
              ? 'left-6'
              : 'left-1',
          ].join(
            ' ',
          )}
        />
      </span>
      {label}
    </button>
  );
}
