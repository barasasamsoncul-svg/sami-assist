import {
  APP_CATEGORIES,
  SAMI_APPS,
  type SamiApp,
  type SamiAppCategory,
} from '@/lib/sami-apps';

export type SamiNavigationCategory =
  | SamiAppCategory
  | 'other';

export type SamiAppNavigation = {
  key: string;
  registryKey: string;
  name: string;
  description: string;
  href: string;
  iconKey: string;
  category: SamiNavigationCategory;
  categoryLabel: string;
  order: number;
  recommended: boolean;
  keywords: string[];
  registered: boolean;
};

export type SamiModuleLike = {
  key: string;
  name?: string | null;
  status?: string | null;
};

const APP_BY_KEY =
  new Map<string, SamiApp>(
    SAMI_APPS.map(app => [
      normalizeAppKey(app.key),
      app,
    ]),
  );

const CATEGORY_LABELS =
  new Map<string, string>(
    APP_CATEGORIES.map(category => [
      category.key,
      category.name,
    ]),
  );

const APP_ORDER =
  new Map<string, number>(
    SAMI_APPS.map((app, index) => [
      normalizeAppKey(app.key),
      index,
    ]),
  );

/*
 * Compatibility aliases are resolved in one place.
 *
 * These aliases are accepted for older data / routes, but all
 * navigation emitted by Category 12 uses the canonical registry key.
 */
const APP_KEY_ALIASES:
  Record<string, string> = {
    invoice: 'invoicing',
    invoices: 'invoicing',

    finance: 'accounting',

    customer: 'crm',
    customers: 'crm',

    sale: 'sales',

    pos: 'pos_shop',
    point_of_sale: 'pos_shop',
    'point-of-sale': 'pos_shop',

    stock: 'inventory',

    hr: 'employees',
    human_resources: 'employees',
    'human-resources': 'employees',

    project: 'projects',

    ecommerce: 'pos_shop',
    'e-commerce': 'pos_shop',
    e_commerce: 'pos_shop',
  };

export function normalizeAppKey(
  value:
    string | null | undefined,
): string {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function getCanonicalAppKey(
  value:
    string | null | undefined,
): string {
  const normalized =
    normalizeAppKey(value);

  return (
    APP_KEY_ALIASES[
      normalized
    ] ||
    normalized
  );
}

export function getRegisteredApp(
  value:
    string | null | undefined,
): SamiApp | null {
  const key =
    getCanonicalAppKey(value);

  return (
    APP_BY_KEY.get(key) ||
    null
  );
}

export function getAppEntryHref(
  value:
    string | null | undefined,
): string {
  const key =
    getCanonicalAppKey(value);

  return `/apps/${encodeURIComponent(
    key,
  )}`;
}

export function resolveAppNavigation(
  module:
    SamiModuleLike,
): SamiAppNavigation {
  const sourceKey =
    normalizeAppKey(
      module.key,
    );

  const registryKey =
    getCanonicalAppKey(
      sourceKey,
    );

  const registered =
    APP_BY_KEY.get(
      registryKey,
    ) ||
    null;

  const category =
    registered
      ?.category ||
    'other';

  const name =
    registered
      ?.name ||
    module.name
      ?.trim() ||
    sourceKey ||
    'Application';

  const description =
    registered
      ?.description ||
    `Open ${name} in this workspace.`;

  const iconKey =
    registered
      ?.icon ||
    'app-window';

  const categoryLabel =
    category ===
      'other'
      ? 'Other'
      : CATEGORY_LABELS.get(
          category,
        ) ||
        'Other';

  const order =
    APP_ORDER.get(
      registryKey,
    ) ??
    10_000;

  const keywords = [
    registryKey,
    sourceKey,
    name,
    description,
    categoryLabel,
  ]
    .filter(Boolean)
    .map(value =>
      String(value)
        .trim()
        .toLowerCase(),
    );

  return {
    key:
      sourceKey,

    registryKey,

    name,

    description,

    href:
      getAppEntryHref(
        registryKey,
      ),

    iconKey,

    category,

    categoryLabel,

    order,

    recommended:
      registered
        ?.recommended ===
      true,

    keywords:
      [
        ...new Set(
          keywords,
        ),
      ],

    registered:
      Boolean(
        registered,
      ),
  };
}

export function sortAppNavigation<
  T extends SamiAppNavigation,
>(
  apps:
    T[],
): T[] {
  return [
    ...apps,
  ].sort(
    (
      left,
      right,
    ) => {
      if (
        left.order !==
        right.order
      ) {
        return (
          left.order -
          right.order
        );
      }

      return left.name
        .localeCompare(
          right.name,
        );
    },
  );
}

export function getRegistryNavigation(): SamiAppNavigation[] {
  return sortAppNavigation(
    SAMI_APPS.map(
      app =>
        resolveAppNavigation({
          key:
            app.key,
          name:
            app.name,
        }),
    ),
  );
}
