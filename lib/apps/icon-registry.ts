import {
  AppWindow,
  BarChart3,
  Boxes,
  Briefcase,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Car,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  Folder,
  Headphones,
  Home,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  PenTool,
  ReceiptText,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserPlus,
  UserRound,
  Users,
  UserSearch,
  Utensils,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const APP_ICON_REGISTRY:
  Record<
    string,
    LucideIcon
  > = {
  calculator:
    Calculator,

  receipt:
    ReceiptText,

  'file-text':
    FileText,

  'bar-chart':
    BarChart3,

  folder:
    Folder,

  'pen-tool':
    PenTool,

  users:
    Users,

  'shopping-cart':
    ShoppingCart,

  repeat:
    Repeat,

  home:
    Home,

  store:
    Store,

  utensils:
    Utensils,

  package:
    Package,

  factory:
    Factory,

  boxes:
    Boxes,

  'shopping-bag':
    ShoppingBag,

  wrench:
    Wrench,

  'shield-check':
    ShieldCheck,

  'user-round':
    UserRound,

  car:
    Car,

  'user-plus':
    UserPlus,

  'clipboard-check':
    ClipboardCheck,

  'calendar-off':
    CalendarOff,

  'user-search':
    UserSearch,

  megaphone:
    Megaphone,

  mail:
    Mail,

  'message-square':
    MessageSquare,

  'calendar-days':
    CalendarDays,

  workflow:
    Workflow,

  'clipboard-list':
    ClipboardList,

  briefcase:
    Briefcase,

  clock:
    CalendarClock,

  'map-pin':
    MapPin,

  headphones:
    Headphones,

  'calendar-clock':
    CalendarClock,

  calendar:
    Calendar,

  'app-window':
    AppWindow,
};

export function getSaMiAppIcon(
  iconKey:
    string | null | undefined,
): LucideIcon {
  const normalized =
    (
      iconKey ||
      ''
    )
      .trim()
      .toLowerCase();

  return (
    APP_ICON_REGISTRY[
      normalized
    ] ||
    AppWindow
  );
}
