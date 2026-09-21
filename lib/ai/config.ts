import 'server-only';

export type SamiAiProvider =
  | 'groq'
  | 'openai'
  | 'gemini'
  | 'custom';

export type SamiAiProviderConfig = {
  provider: SamiAiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxToolRounds: number;
  contextMessages: number;
  requestsPerMinute: number;
  requestsPerDay: number;
};

export type SamiAiProviderStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  error: string | null;
};

const DEFAULT_BASE_URLS: Record<
  Exclude<SamiAiProvider, 'custom'>,
  string
> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  gemini:
    'https://generativelanguage.googleapis.com/v1beta/openai/',
};

function normalizeProvider(
  value: string | undefined,
): SamiAiProvider | null {
  const normalized =
    value?.trim().toLowerCase() || '';

  if (
    normalized === 'groq' ||
    normalized === 'openai' ||
    normalized === 'gemini' ||
    normalized === 'custom'
  ) {
    return normalized;
  }

  if (
    normalized === 'google' ||
    normalized === 'google-gemini'
  ) {
    return 'gemini';
  }

  if (
    normalized === 'openai-compatible' ||
    normalized === 'compatible'
  ) {
    return 'custom';
  }

  return null;
}

type ProviderModelSelection = {
  provider: SamiAiProvider;
  model: string;
};

function providerSpecificModel(
  provider:
    SamiAiProvider,
) {
  if (provider === 'groq') {
    return (
      process.env.GROQ_MODEL?.trim() ||
      ''
    );
  }

  if (provider === 'openai') {
    return (
      process.env.OPENAI_MODEL?.trim() ||
      ''
    );
  }

  if (provider === 'gemini') {
    return (
      process.env.GEMINI_MODEL?.trim() ||
      process.env.GOOGLE_MODEL?.trim() ||
      ''
    );
  }

  return (
    process.env.SAMI_AI_MODEL?.trim() ||
    ''
  );
}

function configuredProviderModels():
  ProviderModelSelection[] {
  const candidates:
    ProviderModelSelection[] = [
      {
        provider: 'groq',
        model:
          process.env.GROQ_MODEL?.trim() ||
          '',
      },
      {
        provider: 'openai',
        model:
          process.env.OPENAI_MODEL?.trim() ||
          '',
      },
      {
        provider: 'gemini',
        model:
          process.env.GEMINI_MODEL?.trim() ||
          process.env.GOOGLE_MODEL?.trim() ||
          '',
      },
    ];

  return candidates.filter(
    candidate =>
      Boolean(candidate.model),
  );
}

function inferProviderFromKeys():
  SamiAiProvider | null {
  const providers:
    SamiAiProvider[] = [];

  if (
    process.env.GROQ_API_KEY?.trim()
  ) {
    providers.push('groq');
  }

  if (
    process.env.OPENAI_API_KEY?.trim()
  ) {
    providers.push('openai');
  }

  if (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim()
  ) {
    providers.push('gemini');
  }

  return providers.length === 1
    ? providers[0]
    : null;
}

function resolveProviderAndModel():
  ProviderModelSelection | null {
  const explicitProvider =
    normalizeProvider(
      process.env.SAMI_AI_PROVIDER,
    );

  const genericModel =
    process.env.SAMI_AI_MODEL?.trim() ||
    '';

  if (explicitProvider) {
    return {
      provider:
        explicitProvider,
      model:
        genericModel ||
        providerSpecificModel(
          explicitProvider,
        ),
    };
  }

  const modelCandidates =
    configuredProviderModels();

  if (
    modelCandidates.length ===
    1
  ) {
    return modelCandidates[0];
  }

  if (
    modelCandidates.length >
    1
  ) {
    return null;
  }

  const inferredProvider =
    inferProviderFromKeys();

  if (!inferredProvider) {
    return null;
  }

  return {
    provider:
      inferredProvider,
    model:
      genericModel ||
      providerSpecificModel(
        inferredProvider,
      ),
  };
}

function resolveProviderKey(
  provider:
    SamiAiProvider,
) {
  const generic =
    process.env.SAMI_AI_API_KEY?.trim();

  if (generic) {
    return generic;
  }

  if (provider === 'groq') {
    return (
      process.env.GROQ_API_KEY?.trim() ||
      ''
    );
  }

  if (provider === 'openai') {
    return (
      process.env.OPENAI_API_KEY?.trim() ||
      ''
    );
  }

  if (provider === 'gemini') {
    return (
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      ''
    );
  }

  return '';
}

function resolveBaseUrl(
  provider:
    SamiAiProvider,
) {
  const explicit =
    process.env.SAMI_AI_BASE_URL?.trim();

  if (explicit) {
    return explicit.replace(
      /\/+$/,
      '',
    );
  }

  if (provider === 'custom') {
    return '';
  }

  return DEFAULT_BASE_URLS[
    provider
  ];
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    max,
  );
}

export function getSamiAiProviderStatus():
  SamiAiProviderStatus {
  const explicitProvider =
    normalizeProvider(
      process.env.SAMI_AI_PROVIDER,
    );

  const modelCandidates =
    configuredProviderModels();

  if (
    !explicitProvider &&
    modelCandidates.length >
      1
  ) {
    return {
      configured: false,
      provider: null,
      model: null,
      baseUrl: null,
      error:
        'More than one provider model is active. Keep exactly one of GROQ_MODEL, OPENAI_MODEL, or GEMINI_MODEL/GOOGLE_MODEL configured.',
    };
  }

  const selection =
    resolveProviderAndModel();

  const provider =
    selection?.provider ||
    null;

  const model =
    selection?.model ||
    '';

  if (!provider) {
    return {
      configured: false,
      provider: null,
      model:
        model || null,
      baseUrl: null,
      error:
        'Configure exactly one provider model (GROQ_MODEL, OPENAI_MODEL, or GEMINI_MODEL/GOOGLE_MODEL) and its API key. SAMI_AI_PROVIDER is optional.',
    };
  }

  const baseUrl =
    resolveBaseUrl(provider);

  if (!model) {
    return {
      configured: false,
      provider,
      model: null,
      baseUrl:
        baseUrl || null,
      error:
        'No AI model is configured. Set the selected provider model variable (for example GROQ_MODEL, OPENAI_MODEL, or GEMINI_MODEL).',
    };
  }

  if (
    !resolveProviderKey(provider)
  ) {
    return {
      configured: false,
      provider,
      model,
      baseUrl:
        baseUrl || null,
      error:
        'No AI API key is configured for the selected provider.',
    };
  }

  if (!baseUrl) {
    return {
      configured: false,
      provider,
      model,
      baseUrl: null,
      error:
        'SAMI_AI_BASE_URL is required for a custom provider.',
    };
  }

  return {
    configured: true,
    provider,
    model,
    baseUrl,
    error: null,
  };
}

export function requireSamiAiProviderConfig():
  SamiAiProviderConfig {
  const status =
    getSamiAiProviderStatus();

  if (
    !status.configured ||
    !status.provider ||
    !status.model ||
    !status.baseUrl
  ) {
    throw new Error(
      status.error ||
      'SaMi AI provider is not configured.',
    );
  }

  const provider =
    status.provider as
      SamiAiProvider;

  const apiKey =
    resolveProviderKey(
      provider,
    );

  if (!apiKey) {
    throw new Error(
      'SaMi AI API key is not configured.',
    );
  }

  return {
    provider,
    model:
      status.model,
    apiKey,
    baseUrl:
      status.baseUrl,
    maxToolRounds:
      positiveInteger(
        process.env.SAMI_AI_MAX_TOOL_ROUNDS,
        6,
        12,
      ),
    contextMessages:
      positiveInteger(
        process.env.SAMI_AI_CONTEXT_MESSAGES,
        24,
        60,
      ),
    requestsPerMinute:
      positiveInteger(
        process.env.SAMI_AI_REQUESTS_PER_MINUTE,
        20,
        300,
      ),
    requestsPerDay:
      positiveInteger(
        process.env.SAMI_AI_REQUESTS_PER_DAY,
        500,
        10_000,
      ),
  };
}
