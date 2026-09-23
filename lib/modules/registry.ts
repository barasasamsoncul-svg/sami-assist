import {
  FIRST_PARTY_SAMI_MODULES,
} from '@/lib/modules/first-party';

import type {
  SamiModuleManifest,
} from '@/lib/modules/types';

import {
  assertValidSamiModuleManifests,
} from '@/lib/modules/validation';

assertValidSamiModuleManifests(
  FIRST_PARTY_SAMI_MODULES,
);

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
  requiredExtension?:
    keyof SamiModuleManifest[
      'extensions'
    ],
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
        manifest.installable &&
        (
          !requiredExtension ||
          manifest.extensions[
            requiredExtension
          ] ===
            true
        ),
      );
    },
  );
}


export function assertRegisteredSamiModuleExtension(
  moduleKey:
    string | null | undefined,
  extension:
    keyof SamiModuleManifest[
      'extensions'
    ],
) {
  const key =
    normalizeModuleKey(
      moduleKey,
    );

  if (
    !key
  ) {
    return;
  }

  const manifest =
    getSamiModuleManifest(
      key,
    );

  /*
   * Core services use source labels such as "core.billing",
   * "automation" and "core.security". Only a key that resolves to a
   * registered business module is governed by module extension flags.
   */
  if (
    !manifest
  ) {
    return;
  }

  if (
    manifest.extensions[
      extension
    ] !==
    true
  ) {
    throw new Error(
      `SaMi module "${key}" attempted to use extension "${extension}" before enabling it in the code-owned manifest.`,
    );
  }
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


export function getSamiModuleNavigation(
  moduleKey:
    string,
) {
  return (
    getSamiModuleManifest(
      moduleKey,
    )
      ?.navigation ||
    []
  );
}

export function getSamiModuleAction(
  moduleKey:
    string,
  actionKey:
    string,
) {
  const key =
    normalizeModuleKey(
      actionKey,
    );

  return (
    getSamiModuleManifest(
      moduleKey,
    )
      ?.actions
      .find(
        action =>
          normalizeModuleKey(
            action.key,
          ) ===
          key,
      ) ||
    null
  );
}

export function getSamiModuleView(
  moduleKey:
    string,
  viewKey:
    string,
) {
  const key =
    normalizeModuleKey(
      viewKey,
    );

  return (
    getSamiModuleManifest(
      moduleKey,
    )
      ?.views
      .find(
        view =>
          normalizeModuleKey(
            view.key,
          ) ===
          key,
      ) ||
    null
  );
}

export function getSamiModuleResource(
  moduleKey:
    string,
  resourceKey:
    string,
) {
  const key =
    normalizeModuleKey(
      resourceKey,
    );

  return (
    getSamiModuleManifest(
      moduleKey,
    )
      ?.resources
      .find(
        resource =>
          normalizeModuleKey(
            resource.key,
          ) ===
          key,
      ) ||
    null
  );
}

export function getAccessibleSamiModuleAction(
  accessibleModuleKeys:
    string[],
  moduleKey:
    string,
  actionKey:
    string,
) {
  const module =
    normalizeModuleKey(
      moduleKey,
    );

  const allowed =
    new Set(
      accessibleModuleKeys.map(
        normalizeModuleKey,
      ),
    );

  if (
    !allowed.has(
      module,
    )
  ) {
    return null;
  }

  return getSamiModuleAction(
    module,
    actionKey,
  );
}
