import {
  FIRST_PARTY_SAMI_MODULES,
} from '@/lib/modules/first-party';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import type {
  SamiModuleCategory,
} from '@/lib/modules/types';

export type SamiNavigationCategory =
  | Exclude<
      SamiModuleCategory,
      'technical'
    >;

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

const CATEGORY_LABELS:
  Record<string, string> = {
    finance: 'Finance',
    documents: 'Documents & Sign',
    sales: 'Sales',
    commerce: 'Commerce',
    supply_chain: 'Supply Chain',
    operations: 'Operations',
    people: 'People',
    marketing: 'Marketing',
    work: 'Work Management',
    other: 'Other',
  };

const APP_ORDER =
  new Map<string, number>(
    FIRST_PARTY_SAMI_MODULES.map(
      (
        manifest,
        index,
      ) => [
        normalizeAppKey(
          manifest.key,
        ),
        index,
      ],
    ),
  );

/*
 * Compatibility aliases are resolved in one place.
 *
 * Aliases only normalize legacy data/routes. They never grant access.
 * The permission-resolved workspace module set remains authoritative.
 */
const APP_KEY_ALIASES:
  Record<string, string> = {
    invoice: 'invoicing',
    invoices: 'invoicing',
    finance: 'accounting',
    customer: 'crm',
    customers: 'crm',
    sale: 'sales',
    stock: 'inventory',
    hr: 'employees',
    human_resources: 'employees',
    'human-resources': 'employees',
    project: 'projects',
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
    .replace(
      /\s+/g,
      '_',
    );
}

export function getCanonicalAppKey(
  value:
    string | null | undefined,
): string {
  const normalized =
    normalizeAppKey(
      value,
    );

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
) {
  return getSamiModuleManifest(
    getCanonicalAppKey(
      value,
    ),
  );
}

export function getAppEntryHref(
  value:
    string | null | undefined,
): string {
  const key =
    getCanonicalAppKey(
      value,
    );

  const manifest =
    getSamiModuleManifest(
      key,
    );

  if (
    manifest?.route
  ) {
    return `/${manifest.route.replace(
      /^\/+/, 
      '',
    )}`;
  }

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

  const manifest =
    getSamiModuleManifest(
      registryKey,
    );

  const rawCategory =
    manifest
      ?.category ||
    'other';

  const category:
    SamiNavigationCategory =
    rawCategory ===
      'technical'
      ? 'other'
      : rawCategory;

  const name =
    manifest
      ?.name ||
    module.name
      ?.trim() ||
    sourceKey ||
    'Application';

  const description =
    manifest
      ?.description ||
    `Open ${name} in this workspace.`;

  const iconKey =
    manifest
      ?.icon ||
    'app-window';

  const categoryLabel =
    CATEGORY_LABELS[
      category
    ] ||
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
    .filter(
      Boolean,
    )
    .map(
      value =>
        String(
          value,
        )
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
      manifest
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
        manifest,
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
    FIRST_PARTY_SAMI_MODULES
      .filter(
        manifest =>
          manifest.application &&
          manifest.installable,
      )
      .map(
        manifest =>
          resolveAppNavigation({
            key:
              manifest.key,
            name:
              manifest.name,
          }),
      ),
  );
}
