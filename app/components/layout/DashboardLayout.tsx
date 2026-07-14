import Image from "next/image";
import ChatWindow from "../dashboard/ChatWindow";
import ChatHistory from "../dashboard/ChatHistory";
import TopBar from "./TopBar";

import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  BarChart3,
  Settings,
  Plus,
} from "lucide-react";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900 p-6 text-white">
        {/* Logo */}
        <div className="mb-10 flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={45}
            height={45}
            className="rounded-lg"
          />

          <div>
            <h2 className="font-bold text-lg">SaMi Assist</h2>
            <p className="text-xs text-gray-400">
              AI Workspace
            </p>
          </div>
        </div>

        {/* Navigation */}
       <nav className="space-y-3">

  <button className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left font-medium transition hover:bg-blue-700">
    <LayoutDashboard size={20} />
    Dashboard
  </button>

  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
    <MessageSquare size={20} />
    AI Chat
  </button>

  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
    <FolderOpen size={20} />
    Documents
  </button>

  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
    <BarChart3 size={20} />
    Analytics
  </button>

  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-gray-800">
    <Settings size={20} />
    Settings
  </button>

</nav>
<div className="mt-10">
  <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold transition hover:bg-green-700">
    <Plus size={18} />
    New Chat
  </button>
</div>
        {/* User */}
        <div className="mt-auto pt-10">
          <div className="rounded-xl bg-gray-800 p-4">
            <p className="font-semibold">Samson Barasa</p>
            <p className="text-sm text-gray-400">
              Founder · SaMi Technologies
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
<main className="flex-1 bg-gray-100 p-8">
  <TopBar />

  <div className="mt-6 flex gap-6">
    <div className="flex-1">
      <ChatWindow />
    </div>

    <ChatHistory />
  </div>
</main>
    </div>
  );
}