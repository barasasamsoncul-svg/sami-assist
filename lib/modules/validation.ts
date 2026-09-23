import type {
  SamiModuleManifest,
} from '@/lib/modules/types';

function normalize(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase();
}

function assertUnique(
  values:
    string[],
  label:
    string,
  moduleKey:
    string,
) {
  const seen =
    new Set<string>();

  for (
    const value
    of values
  ) {
    const key =
      normalize(
        value,
      );

    if (
      !key
    ) {
      throw new Error(
        `SaMi module ${moduleKey} contains an empty ${label} key.`,
      );
    }

    if (
      seen.has(
        key,
      )
    ) {
      throw new Error(
        `SaMi module ${moduleKey} contains duplicate ${label} key "${value}".`,
      );
    }

    seen.add(
      key,
    );
  }
}

export function assertValidSamiModuleManifests(
  manifests:
    SamiModuleManifest[],
) {
  assertUnique(
    manifests.map(
      manifest =>
        manifest.key,
    ),
    'module',
    'registry',
  );

  const moduleKeys =
    new Set(
      manifests.map(
        manifest =>
          normalize(
            manifest.key,
          ),
      ),
    );

  for (
    const manifest
    of manifests
  ) {
    const moduleKey =
      normalize(
        manifest.key,
      );

    if (
      !manifest.name.trim() ||
      !manifest.version.trim() ||
      !manifest.route.trim()
    ) {
      throw new Error(
        `SaMi module ${moduleKey} must define name, version and route.`,
      );
    }

    for (
      const extensionKey
      of [
        'dashboard',
        'search',
        'notifications',
        'activity',
        'automationTriggers',
        'automationActions',
        'aiTools',
        'integrationProviders',
        'apiEndpoints',
        'dataExport',
        'dataErasure',
      ] as const
    ) {
      if (
        typeof manifest
          .extensions[
            extensionKey
          ] !==
        'boolean'
      ) {
        throw new Error(
          `SaMi module ${moduleKey} must explicitly declare extension "${extensionKey}".`,
        );
      }
    }

    if (
      manifest.depends.some(
        dependency =>
          normalize(
            dependency,
          ) ===
          moduleKey,
      )
    ) {
      throw new Error(
        `SaMi module ${moduleKey} cannot depend on itself.`,
      );
    }

    for (
      const dependency
      of manifest.depends
    ) {
      if (
        !moduleKeys.has(
          normalize(
            dependency,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} depends on unknown module "${dependency}".`,
        );
      }
    }

    assertUnique(
      manifest.navigation.map(
        item =>
          item.key,
      ),
      'navigation',
      moduleKey,
    );

    assertUnique(
      manifest.actions.map(
        action =>
          action.key,
      ),
      'action',
      moduleKey,
    );

    assertUnique(
      manifest.views.map(
        view =>
          view.key,
      ),
      'view',
      moduleKey,
    );

    assertUnique(
      manifest.resources.map(
        resource =>
          resource.key,
      ),
      'resource',
      moduleKey,
    );

    const actionKeys =
      new Set(
        manifest.actions.map(
          action =>
            normalize(
              action.key,
            ),
        ),
      );

    const viewKeys =
      new Set(
        manifest.views.map(
          view =>
            normalize(
              view.key,
            ),
        ),
      );

    const resourceByKey =
      new Map(
        manifest.resources.map(
          resource => [
            normalize(
              resource.key,
            ),
            resource,
          ],
        ),
      );

    assertUnique(
      manifest.security
        .permissions
        .map(
          permission =>
            permission.key,
        ),
      'permission',
      moduleKey,
    );

    const permissionKeys =
      new Set(
        manifest.security
          .permissions
          .map(
            permission =>
              normalize(
                permission.key,
              ),
          ),
      );

    for (
      const permission
      of manifest.security
        .permissions
    ) {
      const key =
        normalize(
          permission.key,
        );

      if (
        !key.startsWith(
          `${moduleKey}.`,
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} permission "${permission.key}" must begin with "${moduleKey}.".`,
        );
      }

      if (
        !permission.name.trim() ||
        !permission.resource.trim() ||
        !permission.action.trim()
      ) {
        throw new Error(
          `SaMi module ${moduleKey} permission "${permission.key}" must define name, resource and action.`,
        );
      }
    }

    const assertPermissionReference =
      (
        permission:
          string,
        source:
          string,
      ) => {
        const key =
          normalize(
            permission,
          );

        if (
          !permissionKeys.has(
            key,
          )
        ) {
          throw new Error(
            `SaMi module ${moduleKey} ${source} references undeclared permission "${permission}".`,
          );
        }
      };

    for (
      const resource
      of manifest.resources
    ) {
      for (
        const permissions
        of Object.values(
          resource.permissions,
        )
      ) {
        for (
          const permission
          of permissions ||
          []
        ) {
          assertPermissionReference(
            permission,
            `resource "${resource.key}"`,
          );
        }
      }

      for (
        const field
        of resource.fields ||
        []
      ) {
        for (
          const permission
          of [
            ...(
              field.readPermissions ||
              []
            ),
            ...(
              field.writePermissions ||
              []
            ),
          ]
        ) {
          assertPermissionReference(
            permission,
            `field "${resource.key}.${field.key}"`,
          );
        }
      }
    }

    for (
      const item
      of manifest.navigation
    ) {
      if (
        item.actionKey &&
        !actionKeys.has(
          normalize(
            item.actionKey,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} navigation "${item.key}" references unknown action "${item.actionKey}".`,
        );
      }
    }

    for (
      const action
      of manifest.actions
    ) {
      if (
        action.resourceKey &&
        !resourceByKey.has(
          normalize(
            action.resourceKey,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} action "${action.key}" references unknown resource "${action.resourceKey}".`,
        );
      }

      for (
        const viewKey
        of action.viewKeys ||
        []
      ) {
        if (
          !viewKeys.has(
            normalize(
              viewKey,
            ),
          )
        ) {
          throw new Error(
            `SaMi module ${moduleKey} action "${action.key}" references unknown view "${viewKey}".`,
          );
        }
      }
    }

    for (
      const view
      of manifest.views
    ) {
      if (
        view.resourceKey &&
        !resourceByKey.has(
          normalize(
            view.resourceKey,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} view "${view.key}" references unknown resource "${view.resourceKey}".`,
        );
      }
    }

    for (
      const policy
      of manifest.security
        .recordPolicies
    ) {
      for (
        const permission
        of policy.requiredPermissions ||
        []
      ) {
        assertPermissionReference(
          permission,
          `record policy "${policy.key}"`,
        );
      }

      if (
        !resourceByKey.has(
          normalize(
            policy.resourceKey,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} record policy "${policy.key}" references unknown resource "${policy.resourceKey}".`,
        );
      }
    }

    for (
      const policy
      of manifest.security
        .fieldPolicies
    ) {
      const resource =
        resourceByKey.get(
          normalize(
            policy.resourceKey,
          ),
        );

      if (
        !resource
      ) {
        throw new Error(
          `SaMi module ${moduleKey} field policy "${policy.key}" references unknown resource "${policy.resourceKey}".`,
        );
      }

      const fields =
        new Set(
          (
            resource.fields ||
            []
          ).map(
            field =>
              normalize(
                field.key,
              ),
          ),
        );

      for (
        const permission
        of [
          ...(
            policy.readPermissions ||
            []
          ),
          ...(
            policy.writePermissions ||
            []
          ),
        ]
      ) {
        assertPermissionReference(
          permission,
          `field policy "${policy.key}"`,
        );
      }

      if (
        !fields.has(
          normalize(
            policy.fieldKey,
          ),
        )
      ) {
        throw new Error(
          `SaMi module ${moduleKey} field policy "${policy.key}" references unknown field "${policy.fieldKey}".`,
        );
      }
    }
  }
}
