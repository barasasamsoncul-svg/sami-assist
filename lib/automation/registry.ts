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

import {
  createWorkspaceNotification,
} from '@/lib/services/workspace-notifications';

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
        'Run automatically at a bounded interval while revalidating the run-as user\'s current access each time.',
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
          intervalMinutes: {
            type:
              'integer',
            minimum:
              1,
            maximum:
              43200,
          },
          timezone: {
            type:
              'string',
            maxLength:
              100,
          },
        },
        required: [
          'intervalMinutes',
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
/*
 * Webhook and business-event triggers stay out of the user-facing
 * registry until their trusted ingress/emitter paths are implemented.
 */
export const APP_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] =
  [];

export const CORE_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] = [
    {
      key:
        'core.notify_me',
      name:
        'Notify me',
      description:
        'Create an in-app notification for the workflow runner in the current company.',
      moduleKey:
        null,
      operation:
        'write',
      requiredPermissions:
        [],
      approvalPolicy:
        'optional',
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          title: {
            type:
              'string',
            maxLength:
              120,
          },
          message: {
            type:
              'string',
            maxLength:
              1000,
          },
        },
        required: [
          'title',
        ],
      },
    },
  ];

export const APP_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] =
  [];

const CORE_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >([
    [
      'core.notify_me',
      async (
        context,
        input,
      ) => {
        const title =
          typeof input.title ===
            'string'
            ? input.title
                .replace(
                  /[\\u0000-\\u001f\\u007f]/g,
                  ' ',
                )
                .replace(
                  /\\s+/g,
                  ' ',
                )
                .trim()
                .slice(
                  0,
                  120,
                )
            : '';

        const message =
          typeof input.message ===
            'string'
            ? input.message
                .replace(
                  /\\u0000/g,
                  '',
                )
                .trim()
                .slice(
                  0,
                  1000,
                )
            : '';

        if (
          !title
        ) {
          throw new Error(
            'Notification title is required.',
          );
        }

        const notification =
          await createWorkspaceNotification({
            tenantId:
              context.tenantId,
            companyId:
              context.companyId,
            recipientUserId:
              context.userId,
            type:
              'automation',
            eventKey:
              'automation.notify_me',
            title,
            message:
              message ||
              null,
            sourceModule:
              'automation',
            metadata: {
              generatedBy:
                'automation',
            },
          });

        return {
          notificationId:
            notification.id,
        };
      },
    ],
  ]);

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
  return [
    ...CORE_AUTOMATION_ACTIONS,
    ...APP_AUTOMATION_ACTIONS,
  ]
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
  const key =
    normalizeKey(
      actionKey,
    );

  return (
    CORE_AUTOMATION_ACTION_HANDLERS
      .get(
        key,
      ) ||
    APP_AUTOMATION_ACTION_HANDLERS
      .get(
        key,
      ) ||
    null
  );
}
