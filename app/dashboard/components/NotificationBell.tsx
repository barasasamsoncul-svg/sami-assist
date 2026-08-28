'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, CheckCircle, Users, CreditCard, Sparkles, Shield, AppWindow } from 'lucide-react';

interface Notification {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
}

const ICONS: Record<string, any> = {
  payment_received: CreditCard,
  payment_failed: AlertTriangle,
  trial_started: CheckCircle,
  member_invited: Users,
  '2fa_enabled': Shield,
  module_installed: AppWindow,
  ai_limit_warning: Sparkles,
};

const COLORS: Record<string, string> = {
  payment_received: 'text-green-600',
  payment_failed: 'text-red-600',
  trial_started: 'text-blue-600',
  member_invited: 'text-purple-600',
  '2fa_enabled': 'text-blue-600',
  module_installed: 'text-green-600',
  ai_limit_warning: 'text-yellow-600',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications);
        setUnread(data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  const formatAction = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }} className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
        <Bell size={17} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-950" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-50 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold">Notifications</h3>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center"><Bell size={32} className="mx-auto text-gray-300" /><p className="mt-2 text-sm text-gray-500">No notifications</p></div>
            ) : (
              notifications.map((n) => {
                const Icon = ICONS[n.action] || Bell;
                const color = COLORS[n.action] || 'text-gray-600';
                return (
                  <div key={n.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <Icon size={16} className={`${color} mt-0.5 shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{formatAction(n.action)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatTime(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}