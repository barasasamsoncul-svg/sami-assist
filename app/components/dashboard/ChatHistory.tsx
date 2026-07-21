"use client";

type Conversation = {
  id: string;
  title: string;
};

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

export default function ChatHistory({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
}: Props) {
  return (
    <aside className="w-72 rounded-3xl bg-white p-5 shadow-xl">

      <button
        onClick={onNewChat}
        className="mb-6 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700"
      >
        + New Chat
      </button>

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Conversations
      </h3>

      <div className="space-y-2">

        {conversations.length === 0 ? (
          <p className="text-sm text-gray-400">
            No conversations yet.
          </p>
        ) : (
          conversations.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedId === chat.id
                  ? "bg-blue-100 font-semibold text-blue-700"
                  : "hover:bg-gray-100"
              }`}
            >
              {chat.title}
            </button>
          ))
        )}

      </div>

    </aside>
  );
}