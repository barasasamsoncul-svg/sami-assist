export type SamiAutomationTriggerType =
  | 'event'
  | 'schedule'
  | 'manual'
  | 'webhook';

export type SamiAutomationOperation =
  | 'read'
  | 'write';

export type SamiAutomationApprovalPolicy =
  | 'never'
  | 'optional'
  | 'always';

export type SamiAutomationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'in'
  | 'exists'
  | 'not_exists';

export type SamiAutomationTriggerDefinition = {
  key: string;
  name: string;
  description: string;
  type: SamiAutomationTriggerType;
  moduleKey: string | null;
  resourceKey?: string | null;
  requiredPermissions: string[];
  companyScoped: boolean;
  configSchema?: Record<string, unknown>;
};

export type SamiAutomationActionDefinition = {
  key: string;
  name: string;
  description: string;
  moduleKey: string | null;
  operation: SamiAutomationOperation;
  resourceKey?: string | null;
  requiredPermissions: string[];
  approvalPolicy: SamiAutomationApprovalPolicy;
  inputSchema?: Record<string, unknown>;
};

export type SamiAutomationCondition = {
  key: string;
  path: string;
  operator: SamiAutomationConditionOperator;
  value?: unknown;
};

export type SamiAutomationActionStep = {
  key: string;
  actionKey: string;
  input: Record<string, unknown>;
  requireApproval?: boolean;
};

export type SamiAutomationDefinition = {
  trigger: {
    key: string;
    config: Record<string, unknown>;
  };
  conditions: SamiAutomationCondition[];
  actions: SamiAutomationActionStep[];
  retry: {
    maxAttempts: number;
    backoffSeconds: number;
  };
};

export type SamiAutomationRuntimeContext = {
  userId: string;
  sessionId: string;
  tenantId: string;
  companyId: string;
  accessibleModuleKeys: string[];
  permissionSet: ReadonlySet<string>;
  isOwner: boolean;
};

export type SamiAutomationActionHandler = (
  context: SamiAutomationRuntimeContext,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
