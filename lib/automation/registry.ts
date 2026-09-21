import 'server-only';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';

export const CORE_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] = [
    {
      key:
        'core.manual',
      name:
        'Manual run',
      description:
        'Run an automation explicitly from SaMi after normal authorization checks.',
      type:
        'manual',
      moduleKey:
        null,
      requiredPermissions:
        [],
      companyScoped:
        true,
    },
    {
      key:
        'core.schedule',
      name:
        'Schedule',
      description:
        'Run an automation from a stored schedule in the current company.',
      type:
        'schedule',
      moduleKey:
        null,
      requiredPermissions:
        [],
      companyScoped:
        true,
      configSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          expression: {
            type:
              'string',
          },
          timezone: {
            type:
              'string',
          },
        },
        required: [
          'expression',
          'timezone',
        ],
      },
    },
  ];

/*
 * Business apps register code-owned contributions here.
 *
 * Database rows may select these keys, but database metadata can never
 * create an executable trigger/action handler by itself.
 */
export const APP_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] =
  [];

export const APP_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] =
  [];

export const APP_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >();

function normalizeKey(
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

function hasPermissions(
  context:
    SamiAutomationRuntimeContext,
  required:
    string[],
) {
  return (
    required.length ===
      0 ||
    required.every(
      permission =>
        context.isOwner ||
        context.permissionSet.has(
          permission,
        ),
    )
  );
}

function moduleExtensionAvailable(
  context:
    SamiAutomationRuntimeContext,
  moduleKey:
    string | null,
  extension:
    'automationTriggers' |
    'automationActions',
) {
  if (
    !moduleKey
  ) {
    return true;
  }

  const key =
    normalizeKey(
      moduleKey,
    );

  if (
    !context
      .accessibleModuleKeys
      .map(
        normalizeKey,
      )
      .includes(
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
    manifest.extensions[
      extension
    ],
  );
}

export function getAccessibleAutomationTriggers(
  context:
    SamiAutomationRuntimeContext,
) {
  return [
    ...CORE_AUTOMATION_TRIGGERS,
    ...APP_AUTOMATION_TRIGGERS,
  ].filter(
    trigger =>
      moduleExtensionAvailable(
        context,
        trigger.moduleKey,
        'automationTriggers',
      ) &&
      hasPermissions(
        context,
        trigger
          .requiredPermissions,
      ),
  );
}

export function getAccessibleAutomationActions(
  context:
    SamiAutomationRuntimeContext,
) {
  return APP_AUTOMATION_ACTIONS
    .filter(
      action =>
        moduleExtensionAvailable(
          context,
          action.moduleKey,
          'automationActions',
        ) &&
        hasPermissions(
          context,
          action
            .requiredPermissions,
        ),
    );
}

export function getAccessibleAutomationAction(
  context:
    SamiAutomationRuntimeContext,
  actionKey:
    string,
) {
  const key =
    normalizeKey(
      actionKey,
    );

  return (
    getAccessibleAutomationActions(
      context,
    ).find(
      action =>
        normalizeKey(
          action.key,
        ) ===
        key,
    ) ||
    null
  );
}

export function getAutomationActionHandler(
  actionKey:
    string,
) {
  return (
    APP_AUTOMATION_ACTION_HANDLERS
      .get(
        normalizeKey(
          actionKey,
        ),
      ) ||
    null
  );
}
