import type {
  SamiAutomationActionDefinition,
  SamiAutomationCondition,
  SamiAutomationConditionOperator,
  SamiAutomationDefinition,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';

const MAX_CONDITIONS =
  20;

const MAX_ACTIONS =
  20;

const MAX_JSON_BYTES =
  32 * 1024;

const CONDITION_OPERATORS =
  new Set<
    SamiAutomationConditionOperator
  >([
    'equals',
    'not_equals',
    'greater_than',
    'greater_than_or_equal',
    'less_than',
    'less_than_or_equal',
    'contains',
    'in',
    'exists',
    'not_exists',
  ]);

const SAFE_PATH =
  /^[A-Za-z0-9_.-]{1,160}$/;

function objectValue(
  value:
    unknown,
) {
  return Boolean(
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    ),
  );
}

function safeObject(
  value:
    unknown,
) {
  return objectValue(
    value,
  )
    ? (
        value as
          Record<
            string,
            unknown
          >
      )
    : {};
}

function normalizeKey(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}

function validateJsonSize(
  value:
    unknown,
) {
  try {
    return (
      Buffer.byteLength(
        JSON.stringify(
          value,
        ),
        'utf8',
      ) <=
      MAX_JSON_BYTES
    );
  } catch {
    return false;
  }
}

function safePath(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    return '';
  }

  const path =
    value.trim();

  if (
    !SAFE_PATH.test(
      path,
    )
  ) {
    return '';
  }

  const segments =
    path
      .toLowerCase()
      .split(
        '.',
      );

  if (
    segments.some(
      segment =>
        segment ===
          '__proto__' ||
        segment ===
          'prototype' ||
        segment ===
          'constructor',
    )
  ) {
    return '';
  }

  return path;
}

export class SamiAutomationDefinitionError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'SamiAutomationDefinitionError';
  }
}

export function normalizeAutomationDefinition(
  value:
    unknown,
  options: {
    triggers:
      SamiAutomationTriggerDefinition[];
    actions:
      SamiAutomationActionDefinition[];
  },
): SamiAutomationDefinition {
  const source =
    safeObject(
      value,
    );

  const triggerSource =
    safeObject(
      source.trigger,
    );

  const triggerKey =
    normalizeKey(
      triggerSource.key,
    );

  const trigger =
    options.triggers
      .find(
        candidate =>
          normalizeKey(
            candidate.key,
          ) ===
          triggerKey,
      );

  if (
    !trigger
  ) {
    throw new SamiAutomationDefinitionError(
      'Choose an available automation trigger.',
    );
  }

  const triggerConfig =
    safeObject(
      triggerSource.config,
    );

  if (
    !validateJsonSize(
      triggerConfig,
    )
  ) {
    throw new SamiAutomationDefinitionError(
      'Automation trigger configuration is too large.',
    );
  }

  const rawConditions =
    Array.isArray(
      source.conditions,
    )
      ? source.conditions
      : [];

  if (
    rawConditions.length >
    MAX_CONDITIONS
  ) {
    throw new SamiAutomationDefinitionError(
      'This automation has too many conditions.',
    );
  }

  const conditions:
    SamiAutomationCondition[] =
    rawConditions.map(
      (
        raw,
        index,
      ) => {
        const candidate =
          safeObject(
            raw,
          );

        const key =
          normalizeKey(
            candidate.key,
          ) ||
          `condition-${
            index + 1
          }`;

        const path =
          safePath(
            candidate.path,
          );

        if (
          !path
        ) {
          throw new SamiAutomationDefinitionError(
            'Each condition needs a safe data path.',
          );
        }

        const operator =
          normalizeKey(
            candidate.operator,
          ) as
            SamiAutomationConditionOperator;

        if (
          !CONDITION_OPERATORS.has(
            operator,
          )
        ) {
          throw new SamiAutomationDefinitionError(
            'Choose a supported condition operator.',
          );
        }

        return {
          key,
          path,
          operator,
          ...(
            operator ===
                'exists' ||
              operator ===
                'not_exists'
              ? {}
              : {
                  value:
                    candidate.value,
                }
          ),
        };
      },
    );

  const rawActions =
    Array.isArray(
      source.actions,
    )
      ? source.actions
      : [];

  if (
    rawActions.length ===
      0
  ) {
    throw new SamiAutomationDefinitionError(
      'Add at least one automation action.',
    );
  }

  if (
    rawActions.length >
    MAX_ACTIONS
  ) {
    throw new SamiAutomationDefinitionError(
      'This automation has too many actions.',
    );
  }

  const stepKeys =
    new Set<string>();

  const actions =
    rawActions.map(
      (
        raw,
        index,
      ) => {
        const candidate =
          safeObject(
            raw,
          );

        const key =
          normalizeKey(
            candidate.key,
          ) ||
          `step-${
            index + 1
          }`;

        if (
          stepKeys.has(
            key,
          )
        ) {
          throw new SamiAutomationDefinitionError(
            'Automation step keys must be unique.',
          );
        }

        stepKeys.add(
          key,
        );

        const actionKey =
          normalizeKey(
            candidate.actionKey,
          );

        const action =
          options.actions
            .find(
              registered =>
                normalizeKey(
                  registered.key,
                ) ===
                actionKey,
            );

        if (
          !action
        ) {
          throw new SamiAutomationDefinitionError(
            'Choose an available automation action.',
          );
        }

        const input =
          safeObject(
            candidate.input,
          );

        if (
          !validateJsonSize(
            input,
          )
        ) {
          throw new SamiAutomationDefinitionError(
            'Automation action input is too large.',
          );
        }

        const requestedApproval =
          candidate.requireApproval ===
            true;

        const requireApproval =
          action.approvalPolicy ===
            'always'
            ? true
            : action.approvalPolicy ===
                'never'
              ? false
              : requestedApproval;

        return {
          key,
          actionKey:
            action.key,
          input,
          requireApproval,
        };
      },
    );

  const retrySource =
    safeObject(
      source.retry,
    );

  const maxAttempts =
    Math.min(
      5,
      Math.max(
        1,
        Math.floor(
          Number(
            retrySource
              .maxAttempts ||
            1,
          ),
        ),
      ),
    );

  const backoffSeconds =
    Math.min(
      86_400,
      Math.max(
        0,
        Math.floor(
          Number(
            retrySource
              .backoffSeconds ||
            0,
          ),
        ),
      ),
    );

  return {
    trigger: {
      key:
        trigger.key,
      config:
        triggerConfig,
    },
    conditions,
    actions,
    retry: {
      maxAttempts,
      backoffSeconds,
    },
  };
}
