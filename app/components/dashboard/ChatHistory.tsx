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
    <aside className="w-72 border-r bg-white">
      <div className="p-4">
        <button
          onClick={onNewChat}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          + New Chat
        </button>
      </div>

      <div className="px-4 pb-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-500">
          Conversations
        </h3>

        <div className="space-y-2">
          {conversations.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedId === chat.id
                  ? "bg-blue-100 text-blue-700"
                  : "hover:bg-gray-100"
              }`}
            >
              {chat.title}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}