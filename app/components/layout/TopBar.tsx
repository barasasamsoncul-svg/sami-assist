"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Bell,
  Moon,
  Sun,
  UserCircle,
  LogOut,
  Settings,
  HelpCircle,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";

export default function TopBar() {
  const [isDark, setIsDark] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // ==========================================
  // DARK MODE TOGGLE
  // ==========================================

  useEffect(() => {
    const isDarkMode = localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    setIsDark(isDarkMode);
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    document.documentElement.classList.toggle("dark", newTheme);
    localStorage.setItem("theme", newTheme ? "dark" : "light");
  };

  // ==========================================
  // CLOSE DROPDOWNS ON CLICK OUTSIDE
  // ==========================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ==========================================
  // NOTIFICATIONS DATA
  // ==========================================

  const notifications = [
    { id: 1, title: "New message from Sarah", time: "2 min ago", read: false },
    { id: 2, title: "Invoice #1234 paid", time: "1 hour ago", read: false },
    { id: 3, title: "Customer John Doe added", time: "3 hours ago", read: true },
    { id: 4, title: "AI Chat updated", time: "Yesterday", read: true },
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <header className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md transition-all dark:border-gray-800/80 dark:bg-gray-900/80 sm:px-6 sm:py-4">
      
      {/* ====================================
          LEFT SECTION
      ==================================== */}

      <div className="flex items-center gap-3">
        {/* Mobile menu placeholder (can be used with sidebar) */}
        <button
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl lg:text-2xl">
            Dashboard
          </h1>
          <p className="hidden text-xs text-gray-500 dark:text-gray-400 sm:block sm:text-sm">
            Welcome back to SaMi Assist
          </p>
        </div>
      </div>

      {/* ====================================
          RIGHT SECTION
      ==================================== */}

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
        
        {/* ====================================
            SEARCH - Desktop
        ==================================== */}

        <div
          ref={searchRef}
          className="relative hidden md:block"
        >
          <div className="flex items-center gap-2 rounded-xl border border-gray-300/70 bg-white/50 px-3 py-2 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-gray-700/70 dark:bg-gray-800/50 dark:focus-within:border-blue-400">
            <Search size={18} className="text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-32 border-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500 lg:w-48"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ====================================
            SEARCH - Mobile
        ==================================== */}

        <div className="md:hidden">
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="rounded-xl p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Search"
          >
            <Search size={20} />
          </button>
        </div>

        {/* Mobile search overlay */}
        {isSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 px-4 md:hidden">
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700">
                <Search size={18} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 border-none bg-transparent text-sm text-gray-800 outline-none dark:text-gray-200"
                  autoFocus
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================
            NOTIFICATIONS
        ==================================== */}

        <div ref={notificationRef} className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:w-96">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                <button className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  Mark all read
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 border-b border-gray-100 px-4 py-3 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${
                      !notif.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                    }`}
                  >
                    <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                      !notif.read ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {notif.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                <button className="w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ====================================
            THEME TOGGLE
        ==================================== */}

        <button
          onClick={toggleTheme}
          className="rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* ====================================
            PROFILE
        ==================================== */}

        <div ref={profileRef} className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 text-sm font-medium text-white transition hover:shadow-lg hover:shadow-blue-500/25 hover:scale-105 active:scale-95 sm:px-4"
          >
            <UserCircle size={20} />
            <span className="hidden sm:inline">Samson</span>
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${
                isProfileOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="font-semibold text-gray-900 dark:text-white">Samson</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">samson@samitech.com</p>
              </div>
              <div className="p-2">
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                  <UserCircle size={16} />
                  My Profile
                </button>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                  <Settings size={16} />
                  Settings
                </button>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                  <HelpCircle size={16} />
                  Help
                </button>
              </div>
              <div className="border-t border-gray-200 p-2 dark:border-gray-700">
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}