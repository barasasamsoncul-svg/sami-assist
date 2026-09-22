export type SamiIntegrationCategory =
  | 'productivity'
  | 'communication'
  | 'finance'
  | 'commerce'
  | 'developer'
  | 'identity'
  | 'data'
  | 'other';

export type SamiIntegrationConnectionType =
  | 'oauth2'
  | 'webhook'
  | 'external_app';

export type SamiIntegrationStatus =
  | 'draft'
  | 'connected'
  | 'degraded'
  | 'expired'
  | 'revoked'
  | 'error';

export type SamiIntegrationCapability =
  | 'sync'
  | 'inbound_webhook'
  | 'outbound_webhook'
  | 'automation_triggers'
  | 'automation_actions'
  | 'ai_context'
  | 'launcher';

export type SamiIntegrationOAuthDefinition = {
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string | null;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  usePkce: boolean;
  extraAuthorizationParams?: Record<string, string>;
};

export type SamiIntegrationProviderDefinition = {
  key: string;
  name: string;
  description: string;
  category: SamiIntegrationCategory;
  iconKey: string;
  connectionType: SamiIntegrationConnectionType;
  websiteUrl: string | null;
  docsUrl: string | null;
  capabilities: SamiIntegrationCapability[];
  oauth?: SamiIntegrationOAuthDefinition;
  moduleKey?: string | null;
};

export type SamiIntegrationPublicProvider =
  SamiIntegrationProviderDefinition & {
    configured: boolean;
  };

export type SamiIntegrationRuntimeContext = {
  userId: string;
  sessionId: string;
  tenantId: string;
  companyId: string;
  isOwner: boolean;
  permissionSet: ReadonlySet<string>;
  accessibleModuleKeys: string[];
};

export type SamiIntegrationCredentialPayload = {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string | null;
  apiKey?: string;
  webhookSecret?: string;
  providerData?: Record<string, unknown>;
};

export type SamiExternalAppAuthMode =
  | 'bookmark'
  | 'saml'
  | 'oidc';

export type SamiExternalAppAssignmentMode =
  | 'manual'
  | 'all_internal'
  | 'rule';
