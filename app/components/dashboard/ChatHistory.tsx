export default function ChatHistory() {
  const chats = [
    "Business Performance Report",
    "Marketing Strategy",
    "Sales Analysis",
    "Customer Support",
    "Financial Summary",
    "Project Planning",
  ];

  return (
    <div className="w-80 rounded-2xl bg-white p-6 shadow-lg">
      <h2 className="mb-5 text-2xl font-bold text-gray-900">
        Recent Chats
      </h2>

      <div className="space-y-3">
        {chats.map((chat, index) => (
          <button
            key={index}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-800 transition hover:bg-blue-50 hover:border-blue-500"
          >
            {chat}
          </button>
        ))}
      </div>
    </div>
  );
}