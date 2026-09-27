import 'server-only';

import {
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  createEnterpriseModuleRecord,
  getEnterpriseModuleWorkspace,
  searchEnterpriseModuleRecords,
  transitionEnterpriseModuleRecord,
  updateEnterpriseModuleRecord,
} from '@/lib/apps/enterprise/service';

import {
  getEnterpriseModuleExperience,
} from '@/lib/apps/enterprise/suite-experience';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';


export const ENTERPRISE_SUITE_AI_TOOLS:
  SamiAiToolDefinition[] = [
    {
      key:
        'workspace_app_summary',
      name:
        'Read business app summary',
      description:
        'Read a permitted SaMi business app summary for the current company, including record counts and recent records.',
      moduleKey:
        null,
      operation:
        'read',
      riskLevel:
        'low',
      confirmationRequired:
        false,
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          moduleKey: {
            type:
              'string',
          },
        },
        required: [
          'moduleKey',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const moduleKey =
            typeof input
              .moduleKey ===
              'string'
              ? input
                  .moduleKey
                  .trim()
                  .toLowerCase()
              : '';

          if (
            !isEnterpriseModuleKey(
              moduleKey,
            ) ||
            !context
              .accessibleModuleKeys
              .includes(
                moduleKey,
              )
          ) {
            throw new Error(
              'That SaMi app is not available in the current workspace.',
            );
          }

          const data =
            await getEnterpriseModuleWorkspace(
              moduleKey,
            );

          const experience =
            getEnterpriseModuleExperience(
              moduleKey,
              data.tables.map(
                table =>
                  table.key,
              ),
            );

          return {
            module:
              data.module,
            operatingExperience:
              experience
                ? {
                    process:
                      experience.process,
                    zones:
                      experience.zones,
                    connectedApps:
                      experience
                        .integrations
                        .filter(
                          integration =>
                            context
                              .accessibleModuleKeys
                              .includes(
                                integration
                                  .moduleKey,
                              ),
                        )
                        .map(
                          integration => ({
                            moduleKey:
                              integration
                                .moduleKey,
                            label:
                              integration
                                .label,
                          }),
                        ),
                  }
                : null,
            company:
              data.company,
            metrics:
              data.metrics,
            tables:
              data.tables.map(
                table => ({
                  key:
                    table.key,
                  label:
                    table.label,
                  count:
                    table.count,
                  recent:
                    table.records
                      .slice(
                        0,
                        5,
                      ),
                }),
              ),
          };
        },
    },

    {
      key:
        'workspace_app_search',
      name:
        'Search business app records',
      description:
        'Search permitted records inside one SaMi business app for the current company.',
      moduleKey:
        null,
      operation:
        'read',
      riskLevel:
        'low',
      confirmationRequired:
        false,
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          moduleKey: {
            type:
              'string',
          },
          query: {
            type:
              'string',
          },
        },
        required: [
          'moduleKey',
          'query',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const moduleKey =
            typeof input
              .moduleKey ===
              'string'
              ? input
                  .moduleKey
                  .trim()
                  .toLowerCase()
              : '';

          const query =
            typeof input
              .query ===
              'string'
              ? input
                  .query
                  .trim()
                  .slice(
                    0,
                    120,
                  )
              : '';

          if (
            !isEnterpriseModuleKey(
              moduleKey,
            ) ||
            !context
              .accessibleModuleKeys
              .includes(
                moduleKey,
              )
          ) {
            throw new Error(
              'That SaMi app is not available in the current workspace.',
            );
          }

          return {
            moduleKey,
            query,
            results:
              query
                ? await searchEnterpriseModuleRecords(
                    moduleKey,
                    query,
                    20,
                  )
                : [],
          };
        },
    },

    {
      key:
        'workspace_app_create',
      name:
        'Create business app record',
      description:
        'Create a permitted company-scoped record in a shared SaMi business app through the authoritative domain rules. Requires explicit confirmation.',
      moduleKey:
        null,
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          moduleKey: {
            type:
              'string',
          },
          table: {
            type:
              'string',
          },
          values: {
            type:
              'object',
          },
        },
        required: [
          'moduleKey',
          'table',
          'values',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const moduleKey =
            typeof input.moduleKey ===
              'string'
              ? input.moduleKey
                  .trim()
                  .toLowerCase()
              : '';

          if (
            !isEnterpriseModuleKey(
              moduleKey,
            ) ||
            !context
              .accessibleModuleKeys
              .includes(
                moduleKey,
              )
          ) {
            throw new Error(
              'That SaMi app is not available in the current workspace.',
            );
          }

          if (
            !context.isOwner &&
            !context.permissionContext
              .permissionSet
              .has(
                moduleKey +
                '.record.create',
              )
          ) {
            throw new Error(
              'You do not have permission to create records in this app.',
            );
          }

          return createEnterpriseModuleRecord(
            moduleKey,
            {
              table:
                input.table,
              values:
                input.values,
              idempotencyKey:
                globalThis.crypto
                  .randomUUID(),
            },
          );
        },
    },

    {
      key:
        'workspace_app_update',
      name:
        'Update business app record',
      description:
        'Update editable fields on a permitted shared-app record through the authoritative domain rules. Workflow fields still require the dedicated workflow tool. Requires explicit confirmation.',
      moduleKey:
        null,
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          moduleKey: {
            type:
              'string',
          },
          table: {
            type:
              'string',
          },
          recordId: {
            type:
              'string',
          },
          values: {
            type:
              'object',
          },
        },
        required: [
          'moduleKey',
          'table',
          'recordId',
          'values',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const moduleKey =
            typeof input.moduleKey ===
              'string'
              ? input.moduleKey
                  .trim()
                  .toLowerCase()
              : '';

          if (
            !isEnterpriseModuleKey(
              moduleKey,
            ) ||
            !context
              .accessibleModuleKeys
              .includes(
                moduleKey,
              )
          ) {
            throw new Error(
              'That SaMi app is not available in the current workspace.',
            );
          }

          if (
            !context.isOwner &&
            !context.permissionContext
              .permissionSet
              .has(
                moduleKey +
                '.record.edit',
              )
          ) {
            throw new Error(
              'You do not have permission to update records in this app.',
            );
          }

          return updateEnterpriseModuleRecord(
            moduleKey,
            {
              table:
                input.table,
              recordId:
                input.recordId,
              values:
                input.values,
            },
          );
        },
    },

    {
      key:
        'workspace_app_transition',
      name:
        'Run business workflow action',
      description:
        'Move a permitted shared-app business record through one server-governed workflow transition. This uses the same domain validation, side effects, audit and automation pipeline as the workspace UI.',
      moduleKey:
        null,
      operation:
        'write',
      riskLevel:
        'high',
      confirmationRequired:
        true,
      inputSchema: {
        type:
          'object',
        additionalProperties:
          false,
        properties: {
          moduleKey: {
            type:
              'string',
          },
          table: {
            type:
              'string',
          },
          recordId: {
            type:
              'string',
          },
          statusField: {
            type:
              'string',
          },
          nextStatus: {
            type:
              'string',
          },
        },
        required: [
          'moduleKey',
          'table',
          'recordId',
          'statusField',
          'nextStatus',
        ],
      },
      execute:
        async (
          context,
          input,
        ) => {
          const moduleKey =
            typeof input.moduleKey ===
              'string'
              ? input.moduleKey
                  .trim()
                  .toLowerCase()
              : '';

          if (
            !isEnterpriseModuleKey(
              moduleKey,
            ) ||
            !context
              .accessibleModuleKeys
              .includes(
                moduleKey,
              )
          ) {
            throw new Error(
              'That SaMi app is not available in the current workspace.',
            );
          }

          const transitionPermission =
            moduleKey +
            '.record.transition';

          if (
            !context.isOwner &&
            !context.permissionContext
              .permissionSet
              .has(
                transitionPermission,
              )
          ) {
            throw new Error(
              'You do not have permission to run this app workflow.',
            );
          }

          return transitionEnterpriseModuleRecord(
            moduleKey,
            {
              table:
                input.table,
              recordId:
                input.recordId,
              statusField:
                input.statusField,
              nextStatus:
                input.nextStatus,
            },
          );
        },
    },
  ];
