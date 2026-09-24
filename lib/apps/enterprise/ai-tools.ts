import 'server-only';

import {
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseModuleWorkspace,
  searchEnterpriseModuleRecords,
} from '@/lib/apps/enterprise/service';

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

          return {
            module:
              data.module,
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
  ];
