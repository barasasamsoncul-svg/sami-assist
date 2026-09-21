import 'server-only';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getCompanySelectorState,
} from '@/lib/auth/company-context';

import {
  searchWorkspace,
} from '@/lib/search/workspace-search';

import {
  getOrganizationState,
} from '@/lib/services/organization-profile';

import {
  getWorkspaceActivitySummary,
  listWorkspaceActivity,
} from '@/lib/services/workspace-activity';

import {
  searchWorkspaceFiles,
} from '@/lib/services/workspace-files';

import {
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import {
  rememberSamiAiPersonalContext,
} from '@/lib/ai/memory';

import type {
  SamiAiRuntimeContext,
  SamiAiToolDefinition,
} from '@/lib/ai/types';

function textInput(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  const value =
    input[key];

  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
}

function integerInput(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
) {
  const value =
    Number(input[key]);

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(value),
    max,
  );
}

export const CORE_SAMI_AI_TOOLS:
  SamiAiToolDefinition[] = [
    {
      key: 'workspace_search',
      name: 'Search workspace',
      description:
        'Search the current SaMi workspace for pages, accessible apps, companies, coworkers, files and module-provided records. Results are permission-aware.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            description:
              'What to search for.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
          },
        },
        required: ['query'],
      },
      execute: async (
        _context,
        input,
      ) => {
        const query =
          textInput(
            input,
            'query',
            120,
          );

        if (!query) {
          return {
            results: [],
          };
        }

        const result =
          await searchWorkspace({
            query,
            limit:
              integerInput(
                input,
                'limit',
                10,
                20,
              ),
          });

        return {
          total:
            result.total,
          results:
            result.results.map(
              item => ({
                id: item.id,
                kind: item.kind,
                title: item.title,
                subtitle:
                  item.subtitle,
                description:
                  item.description,
                href: item.href,
                badge: item.badge,
                source: item.source,
              }),
            ),
        };
      },
    },

    {
      key: 'current_company',
      name: 'Current company',
      description:
        'Read the current company and the other companies this user is allowed to access in the workspace.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        const state =
          await getCompanySelectorState();

        return {
          currentCompanyId:
            state.currentCompanyId,
          selectedCompanyIds:
            state.selectedCompanyIds,
          companies:
            state.companies.map(
              company => ({
                id: company.id,
                name: company.name,
                currency:
                  company.currency,
                timezone:
                  company.timezone,
                country:
                  company.country,
                isCurrent:
                  company.isCurrent,
                isDefault:
                  company.isDefault,
                isSelected:
                  company.isSelected,
              }),
            ),
        };
      },
    },

    {
      key: 'activity_summary',
      name: 'Activity summary',
      description:
        'Read a safe summary of recent activity for the current company.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        return getWorkspaceActivitySummary();
      },
    },

    {
      key: 'recent_activity',
      name: 'Recent activity',
      description:
        'Read recent business-readable activity for the current company. This does not expose raw audit internals.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 15,
          },
        },
      },
      execute: async (
        _context,
        input,
      ) => {
        const result =
          await listWorkspaceActivity({
            view: 'activity',
            limit:
              integerInput(
                input,
                'limit',
                8,
                15,
              ),
          });

        return {
          items:
            result.items.map(
              item => ({
                id: item.id,
                label: item.label,
                summary:
                  item.summary,
                module:
                  item.module,
                result:
                  item.result,
                actor:
                  item.actor.name,
                entity:
                  item.entity,
                createdAt:
                  item.createdAt,
              }),
            ),
        };
      },
    },

    {
      key: 'notification_summary',
      name: 'Notification summary',
      description:
        'Read the signed-in user’s notification counts for the current company.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        return getWorkspaceNotificationSummary();
      },
    },

    {
      key: 'organization_profile',
      name: 'Organization profile',
      description:
        'Read organization/company profile information that the current user is already allowed to view.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      requiredAnyPermissions: [
        SAMI_PERMISSIONS.ORGANIZATION_VIEW,
        SAMI_PERMISSIONS.ORGANIZATION_MANAGE,
        SAMI_PERMISSIONS.COMPANIES_VIEW,
        SAMI_PERMISSIONS.COMPANIES_MANAGE,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        const state =
          await getOrganizationState();

        return {
          profile:
            state.profile,
          branches:
            state.branches,
          companies:
            state.companies,
          capabilities:
            state.capabilities,
        };
      },
    },

    {
      key: 'remember_personal_context',
      name: 'Remember personal context',
      description:
        'Save a stable personal preference, recurring instruction, business terminology preference or other useful durable context for this signed-in user in the current company. Do not use for secrets, credentials, transient facts or data that belongs to another person.',
      moduleKey: null,
      operation: 'memory',
      riskLevel: 'low',
      confirmationRequired: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: {
            type: 'string',
            description:
              'A stable machine-friendly key for the memory, such as report-style or customer-naming-preference.',
          },
          type: {
            type: 'string',
            description:
              'Short category such as preference, terminology, workflow or context.',
          },
          content: {
            type: 'string',
            description:
              'The durable fact or preference to remember.',
          },
          importance: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
          },
        },
        required: ['content'],
      },
      execute: async (
        context,
        input,
      ) => {
        if (
          !context
            .memoryEnabled
        ) {
          return {
            remembered:
              false,
            reason:
              'memory_disabled',
          };
        }

        const memory =
          await rememberSamiAiPersonalContext(
            {
              tenantId:
                context.tenantId,
              userId:
                context.userId,
              companyId:
                context.companyId,
            },
            {
              key:
                input.key,
              type:
                input.type,
              content:
                input.content,
              importance:
                input.importance,
            },
          );

        return {
          remembered:
            true,
          memory: {
            id:
              memory.id,
            key:
              memory.key,
            type:
              memory.type,
            content:
              memory.content,
            importance:
              memory.importance,
          },
        };
      },
    },

    {
      key: 'file_search',
      name: 'Search files',
      description:
        'Search active files in the current company. Returns safe file metadata only, never storage credentials or raw object keys.',
      moduleKey: null,
      operation: 'read',
      riskLevel: 'low',
      confirmationRequired: false,
      requiredAllPermissions: [
        SAMI_PERMISSIONS.FILES_VIEW,
      ],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
          },
        },
        required: ['query'],
      },
      execute: async (
        _context,
        input,
      ) => {
        const query =
          textInput(
            input,
            'query',
            120,
          );

        if (!query) {
          return {
            files: [],
          };
        }

        const files =
          await searchWorkspaceFiles(
            query,
            integerInput(
              input,
              'limit',
              10,
              20,
            ),
          );

        return {
          files:
            files.map(
              file => ({
                id: file.id,
                name: file.name,
                mimeType:
                  file.mimeType,
                extension:
                  file.extension,
                sizeBytes:
                  file.sizeBytes,
                purpose:
                  file.purpose,
                status:
                  file.status,
                createdAt:
                  file.createdAt,
              }),
            ),
        };
      },
    },
  ];
