import 'server-only';

import {
  CORE_SAMI_AI_TOOLS,
} from '@/lib/ai/core-tools';

import type {
  SamiAiRuntimeContext,
  SamiAiToolDefinition,
} from '@/lib/ai/types';

/*
 * Business apps add code-owned handlers here.
 *
 * Control DB registry rows may describe or enable tools, but a database
 * row alone never becomes executable. SaMi executes only handlers
 * compiled into this registry.
 */
export const APP_SAMI_AI_TOOLS:
  SamiAiToolDefinition[] =
  [];

function hasAllPermissions(
  context: SamiAiRuntimeContext,
  permissions: string[],
) {
  if (
    permissions.length ===
    0
  ) {
    return true;
  }

  if (
    context.isOwner
  ) {
    return true;
  }

  return permissions.every(
    permission =>
      context.permissionContext
        .permissionSet
        .has(permission),
  );
}

function hasAnyPermission(
  context: SamiAiRuntimeContext,
  permissions: string[],
) {
  if (
    permissions.length ===
    0
  ) {
    return true;
  }

  if (
    context.isOwner
  ) {
    return true;
  }

  return permissions.some(
    permission =>
      context.permissionContext
        .permissionSet
        .has(permission),
  );
}

function moduleIsAccessible(
  context: SamiAiRuntimeContext,
  moduleKey: string | null,
) {
  if (!moduleKey) {
    return true;
  }

  const normalized =
    moduleKey
      .trim()
      .toLowerCase();

  return context
    .accessibleModuleKeys
    .some(
      key =>
        key
          .trim()
          .toLowerCase() ===
        normalized,
    );
}

function toolIsSafe(
  context: SamiAiRuntimeContext,
  tool: SamiAiToolDefinition,
) {
  if (
    tool.operation === 'write' &&
    !tool.confirmationRequired
  ) {
    return false;
  }

  if (
    tool.operation === 'memory' &&
    !context.memoryEnabled
  ) {
    return false;
  }

  return true;
}

export function getAvailableSamiAiTools(
  context: SamiAiRuntimeContext,
) {
  return [
    ...CORE_SAMI_AI_TOOLS,
    ...APP_SAMI_AI_TOOLS,
  ].filter(
    tool =>
      toolIsSafe(
        context,
        tool,
      ) &&
      moduleIsAccessible(
        context,
        tool.moduleKey,
      ) &&
      hasAllPermissions(
        context,
        tool.requiredAllPermissions ||
          [],
      ) &&
      hasAnyPermission(
        context,
        tool.requiredAnyPermissions ||
          [],
      ),
  );
}

export function getAvailableSamiAiToolMap(
  context: SamiAiRuntimeContext,
) {
  return new Map(
    getAvailableSamiAiTools(
      context,
    ).map(
      tool => [
        tool.key,
        tool,
      ],
    ),
  );
}
