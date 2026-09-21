import {
  FIRST_PARTY_SAMI_MODULES,
} from '@/lib/modules/first-party';

export type SamiAppCategory =
  | 'finance'
  | 'documents'
  | 'sales'
  | 'commerce'
  | 'supply_chain'
  | 'operations'
  | 'people'
  | 'marketing'
  | 'work';

export type SamiApp = {
  key: string;
  name: string;
  category: SamiAppCategory;
  description: string;
  icon: string;
  route: string;
  recommended?: boolean;
};

/*
 * Compatibility projection for existing shell/settings consumers.
 *
 * The canonical source of first-party application identity is now the
 * SaMi module manifest registry. New platform capabilities should use the
 * manifest/runtime layer directly instead of adding another app metadata
 * registry here.
 */
export const SAMI_APPS:
  SamiApp[] =
  FIRST_PARTY_SAMI_MODULES
    .filter(
      manifest =>
        manifest.application &&
        manifest.category !==
          'technical' &&
        manifest.category !==
          'other',
    )
    .map(
      manifest => ({
        key:
          manifest.key,
        name:
          manifest.name,
        category:
          manifest.category as
            SamiAppCategory,
        description:
          manifest.description,
        icon:
          manifest.icon,
        route:
          manifest.route,
        recommended:
          manifest.recommended,
      }),
    );

export const APP_CATEGORIES: Array<{
  key: SamiAppCategory;
  name: string;
}> = [
  { key: 'finance', name: 'Finance' },
  { key: 'documents', name: 'Documents & Sign' },
  { key: 'sales', name: 'Sales' },
  { key: 'commerce', name: 'Commerce' },
  { key: 'supply_chain', name: 'Supply Chain' },
  { key: 'operations', name: 'Operations' },
  { key: 'people', name: 'People' },
  { key: 'marketing', name: 'Marketing' },
  { key: 'work', name: 'Work Management' },
];

export const CORE_APP_KEYS = [
  'dashboard',
  'ai',
] as const;

export function getApp(
  key:
    string,
): SamiApp | undefined {
  const normalized =
    key
      .trim()
      .toLowerCase();

  return SAMI_APPS.find(
    app =>
      app.key ===
      normalized,
  );
}

export function normalizeAppKeys(
  value:
    unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  const valid =
    new Set(
      SAMI_APPS.map(
        app =>
          app.key,
      ),
    );

  return [
    ...new Set(
      value.filter(
        (
          key,
        ): key is string =>
          typeof key ===
            'string' &&
          valid.has(
            key,
          ),
      ),
    ),
  ];
}

export function getRecommendedAppKeys(): string[] {
  return SAMI_APPS
    .filter(
      app =>
        app.recommended,
    )
    .map(
      app =>
        app.key,
    );
}

export function isValidAppKey(
  key:
    string,
): boolean {
  return Boolean(
    getApp(
      key,
    ),
  );
}
