import 'server-only';

import {
  isIntegrationEncryptionConfigured,
} from '@/lib/integrations/crypto';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import type {
  SamiIntegrationProviderDefinition,
  SamiIntegrationPublicProvider,
  SamiIntegrationRuntimeContext,
} from '@/lib/integrations/types';

export const CORE_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] = [
    {
      key:
        'google_workspace',
      name:
        'Google Workspace',
      description:
        'Establish an organization-managed Google Workspace identity connection for registered SaMi provider extensions.',
      category:
        'productivity',
      iconKey:
        'google',
      connectionType:
        'oauth2',
      websiteUrl:
        'https://workspace.google.com',
      docsUrl:
        'https://developers.google.com/identity/protocols/oauth2',
      capabilities: [],
      oauth: {
        authorizationUrl:
          'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl:
          'https://oauth2.googleapis.com/token',
        revokeUrl:
          'https://oauth2.googleapis.com/revoke',
        clientIdEnv:
          'SAMI_GOOGLE_OAUTH_CLIENT_ID',
        clientSecretEnv:
          'SAMI_GOOGLE_OAUTH_CLIENT_SECRET',
        scopes: [
          'openid',
          'email',
          'profile',
        ],
        usePkce:
          true,
        extraAuthorizationParams: {
          access_type:
            'offline',
          prompt:
            'consent',
        },
      },
    },
    {
      key:
        'microsoft_365',
      name:
        'Microsoft 365',
      description:
        'Establish an organization-managed Microsoft 365 identity connection for registered SaMi provider extensions.',
      category:
        'productivity',
      iconKey:
        'microsoft',
      connectionType:
        'oauth2',
      websiteUrl:
        'https://www.microsoft.com/microsoft-365',
      docsUrl:
        'https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow',
      capabilities: [],
      oauth: {
        authorizationUrl:
          'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl:
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        clientIdEnv:
          'SAMI_MICROSOFT_OAUTH_CLIENT_ID',
        clientSecretEnv:
          'SAMI_MICROSOFT_OAUTH_CLIENT_SECRET',
        scopes: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'User.Read',
        ],
        usePkce:
          true,
      },
    },
    {
      key:
        'slack',
      name:
        'Slack',
      description:
        'Connect a Slack workspace for approved SaMi workflow messaging actions.',
      category:
        'communication',
      iconKey:
        'message-square',
      connectionType:
        'oauth2',
      websiteUrl:
        'https://slack.com',
      docsUrl:
        'https://api.slack.com/authentication/oauth-v2',
      capabilities: [
        'automation_actions',
      ],
      oauth: {
        authorizationUrl:
          'https://slack.com/oauth/v2/authorize',
        tokenUrl:
          'https://slack.com/api/oauth.v2.access',
        clientIdEnv:
          'SAMI_SLACK_OAUTH_CLIENT_ID',
        clientSecretEnv:
          'SAMI_SLACK_OAUTH_CLIENT_SECRET',
        scopes: [
          'chat:write',
        ],
        usePkce:
          false,
      },
    },
    {
      key:
        'custom_webhook',
      name:
        'Custom Webhook',
      description:
        'Receive signed events from a trusted external system without giving it database or API access.',
      category:
        'developer',
      iconKey:
        'webhook',
      connectionType:
        'webhook',
      websiteUrl:
        null,
      docsUrl:
        null,
      capabilities: [
        'inbound_webhook',
        'automation_triggers',
      ],
    },
    {
      key:
        'external_app',
      name:
        'External App',
      description:
        'Add an approved external or internal business application to the SaMi launcher.',
      category:
        'other',
      iconKey:
        'external-link',
      connectionType:
        'external_app',
      websiteUrl:
        null,
      docsUrl:
        null,
      capabilities: [
        'launcher',
      ],
    },
  ];

export const APP_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] =
  [];

const PROVIDERS:
  SamiIntegrationProviderDefinition[] = [
    ...CORE_INTEGRATION_PROVIDERS,
    ...APP_INTEGRATION_PROVIDERS,
  ];

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

function oauthConfigured(
  provider:
    SamiIntegrationProviderDefinition,
) {
  if (
    provider.connectionType !==
      'oauth2'
  ) {
    return true;
  }

  const oauth =
    provider.oauth;

  if (
    !oauth
  ) {
    return false;
  }

  return Boolean(
    isIntegrationEncryptionConfigured() &&
    process.env[
      oauth.clientIdEnv
    ]?.trim() &&
    process.env[
      oauth.clientSecretEnv
    ]?.trim(),
  );
}

export function getIntegrationProvider(
  providerKey:
    string,
) {
  const key =
    normalizeKey(
      providerKey,
    );

  return (
    PROVIDERS.find(
      provider =>
        provider.key ===
        key,
    ) ||
    null
  );
}

export function getIntegrationProviderCatalog():
  SamiIntegrationPublicProvider[] {
  return PROVIDERS.map(
    provider => {
      const {
        oauth:
          _oauth,
        ...publicProvider
      } =
        provider;

      return {
        ...publicProvider,
        configured:
          oauthConfigured(
            provider,
          ),
      };
    },
  );
}

export function getAccessibleIntegrationProviders(
  context:
    SamiIntegrationRuntimeContext,
) {
  return getIntegrationProviderCatalog()
    .filter(
      provider => {
        if (
          !provider.moduleKey
        ) {
          return true;
        }

        const manifest =
          getSamiModuleManifest(
            provider.moduleKey,
          );

        return Boolean(
          manifest &&
          manifest.extensions
            .integrationProviders &&
          context
            .accessibleModuleKeys
            .includes(
              provider.moduleKey,
            ),
        );
      },
    );
}

export function requireConfiguredOAuthProvider(
  providerKey:
    string,
) {
  const provider =
    getIntegrationProvider(
      providerKey,
    );

  if (
    !provider ||
    provider.connectionType !==
      'oauth2' ||
    !provider.oauth
  ) {
    throw new Error(
      'Integration provider does not support OAuth.',
    );
  }

  const clientId =
    process.env[
      provider.oauth
        .clientIdEnv
    ]?.trim();

  const clientSecret =
    process.env[
      provider.oauth
        .clientSecretEnv
    ]?.trim();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new Error(
      'Integration provider is not configured on this SaMi deployment.',
    );
  }

  return {
    provider,
    oauth:
      provider.oauth,
    clientId,
    clientSecret,
  };
}
