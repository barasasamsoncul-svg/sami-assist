import type {
  PermissionContext,
} from '@/lib/auth/permission-context';

export type SamiAiToolOperation =
  | 'read'
  | 'memory'
  | 'write';

export type SamiAiRiskLevel =
  | 'low'
  | 'medium'
  | 'high';

export type SamiAiRuntimeContext = {
  sessionId: string;
  userId: string;
  tenantId: string;
  companyId: string;
  tenantName: string;
  companyName: string;
  isOwner: boolean;
  permissionContext: PermissionContext;
  accessibleModuleKeys: string[];
  memoryEnabled: boolean;
  useAccountPreferences: boolean;
  responseStyle: string;
  accountPreferences: {
    theme: string;
    locale: string;
    timezone: string;
    dateFormat: string;
    timeFormat: string;
    firstDayOfWeek: number;
  };
};

export type SamiAiToolDefinition = {
  key: string;
  name: string;
  description: string;
  moduleKey: string | null;
  operation: SamiAiToolOperation;
  riskLevel: SamiAiRiskLevel;
  confirmationRequired: boolean;
  requiredAllPermissions?: string[];
  requiredAnyPermissions?: string[];
  inputSchema: Record<string, unknown>;
  execute: (
    context: SamiAiRuntimeContext,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
};

export type SamiAiProviderToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type SamiAiProviderMessage = {
  role:
    | 'system'
    | 'user'
    | 'assistant'
    | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: SamiAiProviderToolCall[];
};

export type SamiAiProviderTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type SamiAiProviderResult = {
  content: string;
  toolCalls: SamiAiProviderToolCall[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};
