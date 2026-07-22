"use client";

import { useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  MoreVertical,
  Edit2,
  Clock,
  Archive,
  Pin,
  Search,
  X,
} from "lucide-react";

type Conversation = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  pinned?: boolean;
  archived?: boolean;
};

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  onPin?: (id: string) => void;
  onArchive?: (id: string) => void;
};

export default function ChatHistory({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onPin,
  onArchive,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pinned" | "archived">("all");

  // ==========================================
  // FILTER CONVERSATIONS
  // ==========================================

  const filteredConversations = conversations
    .filter((chat) => {
      if (filter === "pinned") return chat.pinned;
      if (filter === "archived") return chat.archived;
      return !chat.archived; // "all" shows non-archived
    })
    .filter((chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Pinned first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then by updated_at
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });

  // ==========================================
  // HANDLE RENAME
  // ==========================================

  const handleRename = (id: string) => {
    if (editTitle.trim() && onRename) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  // ==========================================
  // FORMAT DATE
  // ==========================================

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  // ==========================================
  // CONVERSATION MENU
  // ==========================================

  const ConversationMenu = ({ chat }: { chat: Conversation }) => {
    const isOpen = menuOpenId === chat.id;

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId(isOpen ? null : chat.id);
          }}
          className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          aria-label="More options"
        >
          <MoreVertical size={16} />
        </button>

        {isOpen && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
            {onRename && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(chat.id);
                  setEditTitle(chat.title);
                  setMenuOpenId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Edit2 size={14} />
                Rename
              </button>
            )}
            {onPin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(chat.id);
                  setMenuOpenId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Pin size={14} className={chat.pinned ? "text-blue-500" : ""} />
                {chat.pinned ? "Unpin" : "Pin"}
              </button>
            )}
            {onArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(chat.id);
                  setMenuOpenId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Archive size={14} />
                Archive
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this conversation?")) {
                    onDelete(chat.id);
                  }
                  setMenuOpenId(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <aside className="flex h-full max-h-[calc(100vh-120px)] flex-col rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-xl backdrop-blur-sm dark:border-gray-800/80 dark:bg-gray-900/80 sm:p-5">
      
      {/* ====================================
          HEADER
      ==================================== */}

      <div className="flex flex-col gap-3">
        <button
          onClick={onNewChat}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3 font-semibold text-white transition hover:shadow-lg hover:shadow-blue-500/25 hover:scale-[1.02] active:scale-95"
        >
          <Plus size={20} className="transition-transform group-hover:rotate-90" />
          <span>New Chat</span>
        </button>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {(["all", "pinned", "archived"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                filter === tab
                  ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              {tab}
              {tab === "pinned" && conversations.filter(c => c.pinned).length > 0 && (
                <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  {conversations.filter(c => c.pinned).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ====================================
          CONVERSATIONS LIST
      ==================================== */}

      <div className="mt-4 flex-1 overflow-y-auto">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {filter === "pinned" ? "Pinned" : filter === "archived" ? "Archived" : "Recent"}
        </h3>

        <div className="space-y-1.5">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare size={32} className="text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                {searchQuery
                  ? "No matching conversations"
                  : filter === "pinned"
                  ? "No pinned conversations"
                  : filter === "archived"
                  ? "No archived conversations"
                  : "No conversations yet"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {filter === "all" && "Start a new chat to get started"}
              </p>
            </div>
          ) : (
            filteredConversations.map((chat) => (
              <div
                key={chat.id}
                className={`group relative rounded-xl transition-all duration-200 ${
                  selectedId === chat.id
                    ? "bg-gradient-to-r from-blue-50 to-blue-100/50 shadow-sm dark:from-blue-900/20 dark:to-blue-900/10"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              >
                <button
                  onClick={() => onSelect(chat.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4 sm:py-3"
                >
                  {/* Pin indicator */}
                  {chat.pinned && (
                    <Pin size={12} className="flex-shrink-0 text-blue-400" />
                  )}

                  {/* Icon */}
                  <MessageSquare
                    size={16}
                    className={`flex-shrink-0 ${
                      selectedId === chat.id
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  />

                  {/* Title */}
                  <div className="min-w-0 flex-1">
                    {editingId === chat.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRename(chat.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(chat.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-lg border border-blue-300 bg-white px-2 py-0.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-700 dark:bg-gray-800 dark:text-white"
                        autoFocus
                      />
                    ) : (
                      <p
                        className={`truncate text-sm ${
                          selectedId === chat.id
                            ? "font-semibold text-blue-700 dark:text-blue-400"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {chat.title}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                    {formatDate(chat.updated_at || chat.created_at)}
                  </span>
                </button>

                {/* Menu */}
                {(onDelete || onRename || onPin || onArchive) && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <ConversationMenu chat={chat} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ====================================
          FOOTER STATS
      ==================================== */}

      {conversations.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-center text-[10px] text-gray-400 dark:text-gray-500">
            {filteredConversations.length} of {conversations.length} conversations
          </p>
        </div>
      )}

    </aside>
  );
}