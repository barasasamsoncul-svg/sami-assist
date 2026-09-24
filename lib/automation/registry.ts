import 'server-only';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

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

import {
  sendSlackIntegrationMessage,
} from '@/lib/integrations/runtime';

import {
  ENTERPRISE_AUTOMATION_ACTIONS,
  ENTERPRISE_AUTOMATION_ACTION_HANDLERS,
  ENTERPRISE_AUTOMATION_TRIGGERS,
} from '@/lib/apps/enterprise/automation';

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
    {
      key:
        'integrations.webhook.received',
      name:
        'Webhook received',
      description:
        'Run when a verified SaMi custom-webhook endpoint receives an allowed event.',
      type:
        'event',
      moduleKey:
        null,
      requiredPermissions: [
        SAMI_PERMISSIONS
          .INTEGRATIONS_VIEW,
      ],
      companyScoped:
        true,
      configSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          endpointId: {
            type:
              'string',
          },
          eventKey: {
            type:
              'string',
          },
        },
        required: [
          'endpointId',
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
  ENTERPRISE_AUTOMATION_TRIGGERS;

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
    {
      key:
        'integrations.slack.send_message',
      name:
        'Send Slack message',
      description:
        'Send a message through an approved Slack connection in the current company.',
      moduleKey:
        null,
      operation:
        'write',
      requiredPermissions: [
        SAMI_PERMISSIONS
          .INTEGRATIONS_VIEW,
      ],
      approvalPolicy:
        'optional',
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          connectionId: {
            type:
              'string',
          },
          channel: {
            type:
              'string',
            maxLength:
              40,
          },
          text: {
            type:
              'string',
            maxLength:
              3000,
          },
        },
        required: [
          'connectionId',
          'channel',
          'text',
        ],
      },
    },
  ];

export const APP_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] =
  ENTERPRISE_AUTOMATION_ACTIONS;

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
    [
      'integrations.slack.send_message',
      async (
        context,
        input,
      ) => {
        const connectionId =
          typeof input.connectionId ===
            'string'
            ? input.connectionId
                .trim()
            : '';

        const channel =
          typeof input.channel ===
            'string'
            ? input.channel
                .trim()
            : '';

        const text =
          typeof input.text ===
            'string'
            ? input.text
            : '';

        if (
          !connectionId
        ) {
          throw new Error(
            'Slack connection is required.',
          );
        }

        return sendSlackIntegrationMessage(
          context,
          {
            connectionId,
            channel,
            text,
          },
        );
      },
    ],
  ]);

export const APP_AUTOMATION_ACTION_HANDLERS =
  ENTERPRISE_AUTOMATION_ACTION_HANDLERS;

export function isAutomationWorkerEnabled() {
  return (
    process.env
      .SAMI_AUTOMATION_WORKER_ENABLED ||
    ''
  )
    .trim()
    .toLowerCase() ===
    'true';
}

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
      (
        trigger.key !==
          'core.schedule' ||
        isAutomationWorkerEnabled()
      ) &&
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
