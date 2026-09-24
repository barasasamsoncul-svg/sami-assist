export type SamiAiUsageMetric = {
  metric: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
  mode: string;
  enforced: boolean;
  label: string;
  resetAt?: string;
};

export type SamiAiRequestLimit = {
  used: number;
  limit: number;
  remaining: number;
  percent: number | null;
  window:
    | 'minute'
    | 'rolling_24_hours';
};

export type SamiAiWorkspaceStatus = {
  entitled: boolean;
  configured: boolean;
  company: {
    id: string;
    name: string;
  };
  attachments: {
    enabled: boolean;
    canUpload: boolean;
    maxFilesPerMessage: number;
    maxTextBytesPerFile: number;
  };
  preferences: {
    memoryEnabled: boolean;
    useAccountPreferences: boolean;
    responseStyle: string;
  };
  usage: {
    planKey: string;
    period: {
      start: string;
      end: string;
    };
    monthlyQueries:
      SamiAiUsageMetric & {
        resetAt: string;
      };
    rolling24Hours:
      SamiAiRequestLimit | null;
    perMinute:
      SamiAiRequestLimit | null;
    counting: {
      unit: string;
      description: string;
    };
  };
  performance: {
    requests24h: number;
    failures24h: number;
    averageResponseMs24h: number;
    totalTokens24h: number;
    toolCalls24h: number;
    requests7d: number;
  };
  capabilities: {
    totalTools: number;
    readTools: number;
    writeTools: number;
    confirmationTools: number;
    conversationCount: number;
    memoryCount: number;
  };
  availableTools: Array<{
    key: string;
    name: string;
    operation: string;
    riskLevel: string;
    confirmationRequired: boolean;
  }>;
};
