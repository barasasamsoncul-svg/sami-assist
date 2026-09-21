export type SamiAppVisual = {
  key: string;
  tile: string;
  soft: string;
  text: string;
  ring: string;
  glow: string;
  dot: string;
  border: string;
};

const VISUALS: Record<string, SamiAppVisual> = {
  emerald: {
    key: 'emerald',
    tile: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    soft: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/20',
    glow: 'shadow-emerald-500/20',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200/80 dark:border-emerald-500/20',
  },
  sky: {
    key: 'sky',
    tile: 'bg-gradient-to-br from-sky-500 to-blue-600',
    soft: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-500/20',
    glow: 'shadow-sky-500/20',
    dot: 'bg-sky-500',
    border: 'border-sky-200/80 dark:border-sky-500/20',
  },
  amber: {
    key: 'amber',
    tile: 'bg-gradient-to-br from-amber-400 to-orange-600',
    soft: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/20',
    glow: 'shadow-amber-500/20',
    dot: 'bg-amber-500',
    border: 'border-amber-200/80 dark:border-amber-500/20',
  },
  indigo: {
    key: 'indigo',
    tile: 'bg-gradient-to-br from-indigo-500 to-violet-600',
    soft: 'bg-indigo-50 dark:bg-indigo-500/10',
    text: 'text-indigo-700 dark:text-indigo-300',
    ring: 'ring-indigo-500/20',
    glow: 'shadow-indigo-500/20',
    dot: 'bg-indigo-500',
    border: 'border-indigo-200/80 dark:border-indigo-500/20',
  },
  violet: {
    key: 'violet',
    tile: 'bg-gradient-to-br from-violet-500 to-purple-600',
    soft: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-500/20',
    glow: 'shadow-violet-500/20',
    dot: 'bg-violet-500',
    border: 'border-violet-200/80 dark:border-violet-500/20',
  },
  cyan: {
    key: 'cyan',
    tile: 'bg-gradient-to-br from-cyan-500 to-sky-600',
    soft: 'bg-cyan-50 dark:bg-cyan-500/10',
    text: 'text-cyan-700 dark:text-cyan-300',
    ring: 'ring-cyan-500/20',
    glow: 'shadow-cyan-500/20',
    dot: 'bg-cyan-500',
    border: 'border-cyan-200/80 dark:border-cyan-500/20',
  },
  rose: {
    key: 'rose',
    tile: 'bg-gradient-to-br from-rose-500 to-pink-600',
    soft: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/20',
    glow: 'shadow-rose-500/20',
    dot: 'bg-rose-500',
    border: 'border-rose-200/80 dark:border-rose-500/20',
  },
  fuchsia: {
    key: 'fuchsia',
    tile: 'bg-gradient-to-br from-fuchsia-500 to-pink-600',
    soft: 'bg-fuchsia-50 dark:bg-fuchsia-500/10',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    ring: 'ring-fuchsia-500/20',
    glow: 'shadow-fuchsia-500/20',
    dot: 'bg-fuchsia-500',
    border: 'border-fuchsia-200/80 dark:border-fuchsia-500/20',
  },
  orange: {
    key: 'orange',
    tile: 'bg-gradient-to-br from-orange-500 to-red-600',
    soft: 'bg-orange-50 dark:bg-orange-500/10',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-500/20',
    glow: 'shadow-orange-500/20',
    dot: 'bg-orange-500',
    border: 'border-orange-200/80 dark:border-orange-500/20',
  },
  lime: {
    key: 'lime',
    tile: 'bg-gradient-to-br from-lime-500 to-green-600',
    soft: 'bg-lime-50 dark:bg-lime-500/10',
    text: 'text-lime-700 dark:text-lime-300',
    ring: 'ring-lime-500/20',
    glow: 'shadow-lime-500/20',
    dot: 'bg-lime-500',
    border: 'border-lime-200/80 dark:border-lime-500/20',
  },
  slate: {
    key: 'slate',
    tile: 'bg-gradient-to-br from-slate-600 to-slate-900',
    soft: 'bg-slate-100 dark:bg-white/10',
    text: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-500/20',
    glow: 'shadow-slate-500/15',
    dot: 'bg-slate-500',
    border: 'border-slate-200 dark:border-white/10',
  },
  blue: {
    key: 'blue',
    tile: 'bg-gradient-to-br from-blue-600 to-indigo-700',
    soft: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-500/20',
    glow: 'shadow-blue-500/20',
    dot: 'bg-blue-500',
    border: 'border-blue-200/80 dark:border-blue-500/20',
  },
};

const APP_VISUAL_KEYS: Record<string, keyof typeof VISUALS> = {
  accounting: 'emerald',
  invoicing: 'sky',
  expenses: 'amber',
  spreadsheet: 'indigo',
  documents: 'violet',
  sign: 'fuchsia',
  crm: 'cyan',
  sales: 'blue',
  subscriptions: 'indigo',
  rentals: 'amber',
  pos_shop: 'orange',
  pos_restaurant: 'rose',
  inventory: 'emerald',
  manufacturing: 'indigo',
  plm: 'violet',
  purchase: 'amber',
  maintenance: 'orange',
  quality: 'lime',
  employees: 'violet',
  fleet: 'slate',
  referrals: 'cyan',
  appraisals: 'indigo',
  time_off: 'sky',
  recruitment: 'fuchsia',
  social_marketing: 'fuchsia',
  email_marketing: 'rose',
  sms_marketing: 'orange',
  events: 'violet',
  marketing_automation: 'indigo',
  surveys: 'cyan',
  projects: 'blue',
  timesheets: 'emerald',
  field_services: 'orange',
  helpdesk: 'cyan',
  planning: 'indigo',
  appointments: 'rose',
};

const CATEGORY_VISUAL_KEYS: Record<string, keyof typeof VISUALS> = {
  finance: 'emerald',
  documents: 'violet',
  sales: 'blue',
  commerce: 'orange',
  supply_chain: 'lime',
  operations: 'amber',
  people: 'violet',
  marketing: 'fuchsia',
  work: 'indigo',
  other: 'slate',
};

export function getSaMiAppVisual(
  appKey:
    string | null | undefined,
  category?:
    string | null,
): SamiAppVisual {
  const normalized =
    (
      appKey ||
      ''
    )
      .trim()
      .toLowerCase();

  const visualKey =
    APP_VISUAL_KEYS[
      normalized
    ] ||
    CATEGORY_VISUAL_KEYS[
      (
        category ||
        'other'
      )
        .trim()
        .toLowerCase()
    ] ||
    'slate';

  return (
    VISUALS[
      visualKey
    ] ||
    VISUALS.slate
  );
}
