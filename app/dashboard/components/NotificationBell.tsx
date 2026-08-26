'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, CheckCircle, Users, CreditCard, Sparkles, Shield, AppWindow, LogOut } from 'lucide-react';

interface Notification {
  id: string;
  action: string;
  resource_type: string;
  details: any;
  created_at: string;
}

const NOTIFICATION_ICONS: Record<string, any> = {
  payment_received: CreditCard,
  payment_failed: AlertTriangle,
  trial_started: CheckCircle,
  trial_ending: AlertTriangle,
  member_invited: Users,
  invite_accepted: Users,
  '2fa_enabled': Shield,
  '2fa_disabled': Shield,
  password_reset_completed: Shield,
  role_changed: Users,
  member_removed: Users,
  app_installed: AppWindow,
  subscription_cancelled: AlertTriangle,
  plan_updated: CreditCard,
  ai_limit_warning: Sparkles,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  payment_received: 'text-green-600',
  payment_failed: 'text-red-600',
  trial_started: 'text-blue-600',
  trial_ending: 'text-yellow-600',
  member_invited: 'text-purple-600',
  invite_accepted: 'text-green-600',
  '2fa_enabled': 'text-blue-600',
  '2fa_disabled': 'text-gray-600',
  password_reset_completed: 'text-blue-600',
  role_changed: 'text-purple-600',
  member_removed: 'text-red-600',
  app_installed: 'text-green-600',
  subscription_cancelled: 'text-red-600',
  plan_updated: 'text-blue-600',
  ai_limit_warning: 'text-yellow-600',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();

    // Close dropdown on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getIcon = (action: string) => {
    const Icon = NOTIFICATION_ICONS[action] || Bell;
    const color = NOTIFICATION_COLORS[action] || 'text-gray-600';
    return <Icon size={16} className={color} />;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        title="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-950" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-50 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={32} className="mx-auto text-gray-300 dark:text-gray-700" />
                <p className="mt-2 text-sm text-gray-500">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {getIcon(notification.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatAction(notification.action)}
                      </p>
                      {notification.details && typeof notification.details === 'object' && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {notification.details.daysRemaining !== undefined
                            ? `Trial ends in ${notification.details.daysRemaining} days`
                            : notification.details.percentage !== undefined
                              ? `AI usage at ${notification.details.percentage}%`
                              : ''}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}