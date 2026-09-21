import {
  FIRST_PARTY_SAMI_MODULES,
} from '@/lib/modules/first-party';

import type {
  SamiModuleManifest,
} from '@/lib/modules/types';

function normalizeModuleKey(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}

const MODULE_MANIFESTS =
  new Map<
    string,
    SamiModuleManifest
  >(
    FIRST_PARTY_SAMI_MODULES.map(
      manifest => [
        normalizeModuleKey(
          manifest.key,
        ),
        manifest,
      ],
    ),
  );

export function getSamiModuleManifest(
  moduleKey:
    string | null | undefined,
): SamiModuleManifest | null {
  return (
    MODULE_MANIFESTS.get(
      normalizeModuleKey(
        moduleKey,
      ),
    ) ||
    null
  );
}

export function getSamiModuleManifests() {
  return [
    ...MODULE_MANIFESTS.values(),
  ];
}

export function getInstallableSamiModuleManifests() {
  return getSamiModuleManifests()
    .filter(
      manifest =>
        manifest.installable,
    );
}

export function getSamiModuleDependencyPlan(
  rootKey:
    string,
): SamiModuleManifest[] {
  const ordered:
    SamiModuleManifest[] =
    [];

  const resolved =
    new Set<string>();

  const visiting =
    new Set<string>();

  function visit(
    moduleKey:
      string,
  ) {
    const key =
      normalizeModuleKey(
        moduleKey,
      );

    if (
      resolved.has(
        key,
      )
    ) {
      return;
    }

    if (
      visiting.has(
        key,
      )
    ) {
      throw new Error(
        `SaMi module dependency cycle detected at ${key}.`,
      );
    }

    const manifest =
      getSamiModuleManifest(
        key,
      );

    if (
      !manifest ||
      !manifest.installable
    ) {
      throw new Error(
        `SaMi module ${key} is not installable.`,
      );
    }

    visiting.add(
      key,
    );

    for (
      const dependency
      of manifest.depends
    ) {
      visit(
        dependency,
      );
    }

    visiting.delete(
      key,
    );

    resolved.add(
      key,
    );

    ordered.push(
      manifest,
    );
  }

  visit(
    rootKey,
  );

  return ordered;
}

export function filterAccessibleModuleExtensions<
  T,
>(
  extensions:
    T[],
  accessibleModuleKeys:
    string[],
  getModuleKey:
    (
      extension:
        T,
    ) =>
      string | null | undefined,
): T[] {
  const allowed =
    new Set(
      accessibleModuleKeys
        .map(
          normalizeModuleKey,
        )
        .filter(
          Boolean,
        ),
    );

  return extensions.filter(
    extension => {
      const key =
        normalizeModuleKey(
          getModuleKey(
            extension,
          ),
        );

      if (
        !key ||
        !allowed.has(
          key,
        )
      ) {
        return false;
      }

      const manifest =
        getSamiModuleManifest(
          key,
        );

      return Boolean(
        manifest &&
        manifest.installable,
      );
    },
  );
}

export function getAccessibleSamiModuleRuntime(
  accessibleModuleKeys:
    string[],
) {
  const manifests =
    accessibleModuleKeys
      .map(
        key =>
          getSamiModuleManifest(
            key,
          ),
      )
      .filter(
        (
          manifest,
        ): manifest is
          SamiModuleManifest =>
          Boolean(
            manifest,
          ),
      );

  return {
    manifests,
    navigation:
      manifests.flatMap(
        manifest =>
          manifest.navigation,
      ),
    actions:
      manifests.flatMap(
        manifest =>
          manifest.actions,
      ),
    views:
      manifests.flatMap(
        manifest =>
          manifest.views,
      ),
    resources:
      manifests.flatMap(
        manifest =>
          manifest.resources,
      ),
    recordPolicies:
      manifests.flatMap(
        manifest =>
          manifest.security
            .recordPolicies,
      ),
    fieldPolicies:
      manifests.flatMap(
        manifest =>
          manifest.security
            .fieldPolicies,
      ),
  };
}
