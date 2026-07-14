import {
  Search,
  Bell,
  Moon,
  UserCircle,
} from "lucide-react";

export default function TopBar() {
  return (
    <header className="mb-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
      {/* Left */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard
        </h1>

        <p className="text-sm text-gray-500">
          Welcome back to SaMi Assist
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2">
          <Search size={18} className="text-gray-500" />
          <input
            type="text"
            placeholder="Search..."
            className="w-48 border-none bg-transparent text-gray-800 outline-none"
          />
        </div>

        {/* Notifications */}
        <button className="rounded-xl border border-gray-300 p-2 hover:bg-gray-100">
          <Bell size={20} />
        </button>

        {/* Theme */}
        <button className="rounded-xl border border-gray-300 p-2 hover:bg-gray-100">
          <Moon size={20} />
        </button>

        {/* Profile */}
        <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          <UserCircle size={20} />
          <span>Samson</span>
        </button>
      </div>
    </header>
  );
}