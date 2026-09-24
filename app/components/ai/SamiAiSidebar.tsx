'use client';

import Link from 'next/link';

import {
  ArrowLeft,
  Gauge,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

export type SamiAiConversation = {
  id: string;
  title: string;
  status: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

type SamiAiSidebarProps = {
  conversations: SamiAiConversation[];
  selectedConversationId: string | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  onRename: (
    conversationId: string,
    title: string,
  ) => Promise<void>;
  onTogglePin: (
    conversationId: string,
    pinned: boolean,
  ) => Promise<void>;
  onDelete: (
    conversationId: string,
  ) => Promise<void>;
  onUsage: () => void;
};

function conversationTime(
  value: string | null,
) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
    },
  );
}

export default function SamiAiSidebar({
  conversations,
  selectedConversationId,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
  onNew,
  onSelect,
  onRename,
  onTogglePin,
  onDelete,
  onUsage,
}: SamiAiSidebarProps) {
  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    searchOpen,
    setSearchOpen,
  ] =
    useState(false);

  const [
    renamingId,
    setRenamingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    renameDraft,
    setRenameDraft,
  ] =
    useState('');

  const [
    busyId,
    setBusyId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    deleteConfirmId,
    setDeleteConfirmId,
  ] =
    useState<string | null>(
      null,
    );

  const searchRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  useEffect(
    () => {
      if (
        searchOpen &&
        !collapsed
      ) {
        requestAnimationFrame(
          () =>
            searchRef.current
              ?.focus(),
        );
      }
    },
    [
      collapsed,
      searchOpen,
    ],
  );

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return conversations;
        }

        return conversations.filter(
          conversation =>
            conversation.title
              .toLowerCase()
              .includes(
                needle,
              ),
        );
      },
      [
        conversations,
        query,
      ],
    );

  const pinned =
    useMemo(
      () =>
        filtered.filter(
          item =>
            item.pinned,
        ),
      [filtered],
    );

  const recent =
    useMemo(
      () =>
        filtered.filter(
          item =>
            !item.pinned,
        ),
      [filtered],
    );

  function startSearch() {
    if (collapsed) {
      onToggleCollapsed();
    }

    setSearchOpen(
      true,
    );
  }

  function startRename(
    conversation:
      SamiAiConversation,
  ) {
    setDeleteConfirmId(
      null,
    );
    setRenamingId(
      conversation.id,
    );
    setRenameDraft(
      conversation.title,
    );
  }

  function cancelRename() {
    setRenamingId(
      null,
    );
    setRenameDraft('');
  }

  async function saveRename(
    conversationId:
      string,
  ) {
    const title =
      renameDraft.trim();

    if (
      !title ||
      busyId
    ) {
      return;
    }

    setBusyId(
      conversationId,
    );

    try {
      await onRename(
        conversationId,
        title,
      );

      cancelRename();
    } finally {
      setBusyId(
        null,
      );
    }
  }

  async function changePin(
    conversation:
      SamiAiConversation,
  ) {
    if (busyId) {
      return;
    }

    setBusyId(
      conversation.id,
    );

    try {
      await onTogglePin(
        conversation.id,
        !conversation.pinned,
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  async function deleteConversation(
    conversationId:
      string,
  ) {
    if (
      deleteConfirmId !==
        conversationId
    ) {
      setDeleteConfirmId(
        conversationId,
      );
      setRenamingId(
        null,
      );
      return;
    }

    if (busyId) {
      return;
    }

    setBusyId(
      conversationId,
    );

    try {
      await onDelete(
        conversationId,
      );

      setDeleteConfirmId(
        null,
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  function chooseConversation(
    conversationId:
      string,
  ) {
    onSelect(
      conversationId,
    );
    onCloseMobile();
  }

  function newChat() {
    onNew();
    onCloseMobile();
  }

  function renderConversation(
    conversation:
      SamiAiConversation,
  ) {
    const selected =
      selectedConversationId ===
      conversation.id;

    const renaming =
      renamingId ===
      conversation.id;

    const busy =
      busyId ===
      conversation.id;

    const confirmingDelete =
      deleteConfirmId ===
      conversation.id;

    return (
      <div
        key={
          conversation.id
        }
        className={[
          'group rounded-xl transition',
          selected
            ? 'bg-slate-200/80 dark:bg-white/10'
            : 'hover:bg-slate-200/55 dark:hover:bg-white/[0.06]',
        ].join(
          ' ',
        )}
      >
        {renaming ? (
          <div className="p-2">
            <input
              value={
                renameDraft
              }
              maxLength={
                80
              }
              onChange={
                event =>
                  setRenameDraft(
                    event.target.value,
                  )
              }
              onKeyDown={
                event => {
                  if (
                    event.key ===
                    'Enter'
                  ) {
                    event.preventDefault();
                    void saveRename(
                      conversation.id,
                    );
                  }

                  if (
                    event.key ===
                    'Escape'
                  ) {
                    cancelRename();
                  }
                }
              }
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#16181d]"
              autoFocus
            />

            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={
                  busy ||
                  !renameDraft.trim()
                }
                onClick={() =>
                  void saveRename(
                    conversation.id,
                  )
                }
                className="h-8 rounded-lg bg-slate-950 px-3 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
              >
                Save
              </button>

              <button
                type="button"
                disabled={
                  busy
                }
                onClick={
                  cancelRename
                }
                className="h-8 rounded-lg px-3 text-[10px] font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-1 px-2 py-1.5">
            <button
              type="button"
              onClick={() =>
                chooseConversation(
                  conversation.id,
                )
              }
              className="min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {conversation.pinned && (
                  <Pin className="h-3 w-3 shrink-0 text-blue-500" />
                )}

                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {
                    conversation.title
                  }
                </span>
              </div>

              <span className="mt-1 block text-[9px] text-slate-400">
                {conversationTime(
                  conversation.lastMessageAt ||
                    conversation.updatedAt,
                )}
              </span>
            </button>

            <div className={[
              'flex shrink-0 items-center gap-0.5 pt-1 transition',
              selected ||
              confirmingDelete
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            ].join(' ')}>
              <button
                type="button"
                title={
                  conversation.pinned
                    ? 'Unpin'
                    : 'Pin'
                }
                aria-label={
                  conversation.pinned
                    ? 'Unpin conversation'
                    : 'Pin conversation'
                }
                disabled={
                  busy
                }
                onClick={() =>
                  void changePin(
                    conversation,
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {conversation.pinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                title="Rename conversation"
                aria-label="Rename conversation"
                disabled={
                  busy
                }
                onClick={() =>
                  startRename(
                    conversation,
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                title={
                  confirmingDelete
                    ? 'Confirm delete conversation'
                    : 'Delete conversation'
                }
                aria-label={
                  confirmingDelete
                    ? 'Confirm delete conversation'
                    : 'Delete conversation'
                }
                disabled={
                  busy
                }
                onClick={() =>
                  void deleteConversation(
                    conversation.id,
                  )
                }
                className={[
                  'flex h-7 items-center justify-center rounded-lg px-1.5 text-slate-400 transition disabled:opacity-40',
                  confirmingDelete
                    ? 'bg-rose-600 text-white'
                    : 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300',
                ].join(
                  ' ',
                )}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}

                {confirmingDelete && (
                  <span className="ml-1 text-[9px] font-bold">
                    Confirm
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderExpandedContent() {
    return (
      <>
        <div className="space-y-1.5 px-2">
          <button
            type="button"
            onClick={
              newChat
            }
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-white/[0.07]"
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0" />
            <span>
              New chat
            </span>
          </button>

          <button
            type="button"
            aria-label="Search conversations"
            onClick={
              startSearch
            }
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-white/[0.07]"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span>
              Search chats
            </span>
          </button>
        </div>

        {searchOpen && (
          <div className="px-2 pt-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-400 focus-within:border-blue-400 dark:border-white/10 dark:bg-[#16181d]">
              <Search className="h-3.5 w-3.5 shrink-0" />

              <input
                ref={
                  searchRef
                }
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event.target.value,
                    )
                }
                placeholder="Search conversations"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
              />

              <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                  setSearchOpen(
                    false,
                  );
                  setQuery('');
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </label>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {filtered.length ===
          0 ? (
            <div className="px-3 py-8 text-center text-[10px] leading-5 text-slate-400">
              {conversations.length ===
              0
                ? 'Your conversations will appear here.'
                : 'No chats match your search.'}
            </div>
          ) : (
            <div className="space-y-4">
              {pinned.length >
                0 && (
                <section>
                  <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Pinned
                  </p>

                  <div className="space-y-0.5">
                    {pinned.map(
                      renderConversation,
                    )}
                  </div>
                </section>
              )}

              {recent.length >
                0 && (
                <section>
                  <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Recent
                  </p>

                  <div className="space-y-0.5">
                    {recent.map(
                      renderConversation,
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  function renderCollapsedContent() {
    return (
      <div className="flex flex-1 flex-col items-center gap-1.5 px-2">
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={
            newChat
          }
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.07]"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-label="Search conversations"
          title="Search chats"
          onClick={
            startSearch
          }
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.07]"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function sidebarBody(
    compact:
      boolean,
    mobile:
      boolean,
  ) {
    return (
      <>
        <div
          className={[
            'flex h-14 shrink-0 items-center border-b border-slate-200/80 dark:border-white/10',
            compact
              ? 'justify-center px-2'
              : 'gap-2 px-3',
          ].join(
            ' ',
          )}
        >
          {!compact && (
            <Link
              href="/ai"
              aria-label="SaMi AI"
              className="min-w-0 flex-1"
            >
              <SaMiLogo
                size="sm"
                className="max-w-[138px]"
              />
            </Link>
          )}

          {compact && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-[11px] font-black text-white dark:bg-white dark:text-slate-950">
              S
            </div>
          )}

          {mobile ? (
            <button
              type="button"
              aria-label="Close AI sidebar"
              onClick={
                onCloseMobile
              }
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={
                compact
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
              }
              title={
                compact
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
              }
              onClick={
                onToggleCollapsed
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-white/10"
            >
              {compact ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-2">
          {compact
            ? renderCollapsedContent()
            : renderExpandedContent()}
        </div>

        <div
          className={[
            'shrink-0 border-t border-slate-200/80 py-2 dark:border-white/10',
            compact
              ? 'px-2'
              : 'px-2',
          ].join(
            ' ',
          )}
        >
          <button
            type="button"
            title="Usage & capabilities"
            aria-label="Usage & capabilities"
            onClick={
              onUsage
            }
            className={[
              'flex h-10 items-center rounded-xl text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.07]',
              compact
                ? 'w-10 justify-center'
                : 'w-full gap-2.5 px-2.5',
            ].join(
              ' ',
            )}
          >
            <Gauge className="h-4 w-4 shrink-0" />
            {!compact && (
              <span className="text-xs font-semibold">
                Usage & capabilities
              </span>
            )}
          </button>

          <Link
            href="/settings?tab=ai"
            title="AI settings"
            aria-label="AI settings"
            className={[
              'flex h-10 items-center rounded-xl text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.07]',
              compact
                ? 'w-10 justify-center'
                : 'w-full gap-2.5 px-2.5',
            ].join(
              ' ',
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!compact && (
              <span className="text-xs font-semibold">
                AI settings
              </span>
            )}
          </Link>

          <Link
            href="/dashboard"
            title="Back to workspace"
            aria-label="Back to workspace"
            className={[
              'flex h-10 items-center rounded-xl text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/[0.07]',
              compact
                ? 'w-10 justify-center'
                : 'w-full gap-2.5 px-2.5',
            ].join(
              ' ',
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!compact && (
              <span className="text-xs font-semibold">
                Workspace
              </span>
            )}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <aside
        aria-label="SaMi AI sidebar"
        className={[
          'hidden h-[100dvh] shrink-0 flex-col border-r border-slate-200/80 bg-[#f1f2f4] transition-[width] duration-200 lg:flex dark:border-white/10 dark:bg-[#111318]',
          collapsed
            ? 'w-[68px]'
            : 'w-[280px]',
        ].join(
          ' ',
        )}
      >
        {sidebarBody(
          collapsed,
          false,
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[180] lg:hidden">
          <button
            type="button"
            aria-label="Close AI sidebar overlay"
            onClick={
              onCloseMobile
            }
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />

          <aside
            aria-label="SaMi AI mobile sidebar"
            className="absolute inset-y-0 left-0 flex w-[286px] max-w-[calc(100vw-16px)] flex-col border-r border-slate-200 bg-[#f1f2f4] shadow-2xl dark:border-white/10 dark:bg-[#111318]"
          >
            {sidebarBody(
              false,
              true,
            )}
          </aside>
        </div>
      )}
    </>
  );
}
