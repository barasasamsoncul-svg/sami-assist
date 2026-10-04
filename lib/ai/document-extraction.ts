import 'server-only';

export type SamiAiDocumentExtractionResult = {
  text: string;
  truncated: boolean;
  provider: string | null;
};

export type SamiAiDocumentExtractorStatus = {
  configured: boolean;
  endpoint: string | null;
  maxInputBytes: number;
  maxTextChars: number;
  timeoutMs: number;
  error: string | null;
};

const DEFAULT_MAX_INPUT_BYTES =
  12 * 1024 * 1024;

const HARD_MAX_INPUT_BYTES =
  32 * 1024 * 1024;

const DEFAULT_MAX_TEXT_CHARS =
  300_000;

const HARD_MAX_TEXT_CHARS =
  1_000_000;

const DEFAULT_TIMEOUT_MS =
  30_000;

const HARD_TIMEOUT_MS =
  120_000;

const DOCUMENT_MIME_TYPES =
  new Set([
    'application/pdf',
    'application/msword',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

const DOCUMENT_EXTENSIONS =
  new Set([
    'pdf',
    'doc',
    'docx',
    'rtf',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
  ]);

function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed =
    Number.parseInt(
      value || '',
      10,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    max,
  );
}

function normalizedExtension(
  extension:
    string | null,
) {
  return (
    extension ||
    ''
  )
    .trim()
    .replace(
      /^\./,
      '',
    )
    .toLowerCase();
}

export function isSamiAiExtractableDocument(
  mimeType:
    string,
  extension:
    string | null,
) {
  const mime =
    mimeType
      .trim()
      .toLowerCase();

  return (
    DOCUMENT_MIME_TYPES
      .has(
        mime,
      ) ||
    DOCUMENT_EXTENSIONS
      .has(
        normalizedExtension(
          extension,
        ),
      )
  );
}

function configuredEndpoint() {
  return (
    process.env
      .SAMI_AI_DOCUMENT_EXTRACTOR_URL
      ?.trim() ||
    ''
  );
}

function validatedEndpoint(
  value:
    string,
) {
  if (!value) {
    return {
      url: null,
      error:
        'SAMI_AI_DOCUMENT_EXTRACTOR_URL is not configured.',
    };
  }

  let parsed:
    URL;

  try {
    parsed =
      new URL(
        value,
      );
  } catch {
    return {
      url: null,
      error:
        'SAMI_AI_DOCUMENT_EXTRACTOR_URL must be a valid URL.',
    };
  }

  const localDevelopment =
    process.env.NODE_ENV !==
      'production' &&
    (
      parsed.hostname ===
        'localhost' ||
      parsed.hostname ===
        '127.0.0.1' ||
      parsed.hostname ===
        '::1'
    );

  if (
    parsed.protocol !==
      'https:' &&
    !(
      localDevelopment &&
      parsed.protocol ===
        'http:'
    )
  ) {
    return {
      url: null,
      error:
        'The SaMi AI document extractor must use HTTPS in production.',
    };
  }

  return {
    url:
      parsed.toString(),
    error: null,
  };
}

export function getSamiAiDocumentExtractorStatus():
  SamiAiDocumentExtractorStatus {
  const endpoint =
    validatedEndpoint(
      configuredEndpoint(),
    );

  const maxInputBytes =
    positiveInteger(
      process.env
        .SAMI_AI_DOCUMENT_EXTRACTOR_MAX_BYTES,
      DEFAULT_MAX_INPUT_BYTES,
      HARD_MAX_INPUT_BYTES,
    );

  const maxTextChars =
    positiveInteger(
      process.env
        .SAMI_AI_DOCUMENT_EXTRACTOR_MAX_TEXT_CHARS,
      DEFAULT_MAX_TEXT_CHARS,
      HARD_MAX_TEXT_CHARS,
    );

  const timeoutMs =
    positiveInteger(
      process.env
        .SAMI_AI_DOCUMENT_EXTRACTOR_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      HARD_TIMEOUT_MS,
    );

  return {
    configured:
      Boolean(
        endpoint.url,
      ),
    endpoint:
      endpoint.url,
    maxInputBytes,
    maxTextChars,
    timeoutMs,
    error:
      endpoint.error,
  };
}

function responseText(
  payload:
    unknown,
) {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return '';
  }

  const record =
    payload as
      Record<
        string,
        unknown
      >;

  if (
    typeof record.text ===
      'string'
  ) {
    return record.text;
  }

  if (
    typeof record.content ===
      'string'
  ) {
    return record.content;
  }

  if (
    record.document &&
    typeof record.document ===
      'object' &&
    typeof (
      record.document as
        Record<
          string,
          unknown
        >
    ).text ===
      'string'
  ) {
    return String(
      (
        record.document as
          Record<
            string,
            unknown
          >
      ).text,
    );
  }

  return '';
}

function responseProvider(
  payload:
    unknown,
) {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return null;
  }

  const record =
    payload as
      Record<
        string,
        unknown
      >;

  return (
    typeof record.provider ===
      'string' &&
    record.provider.trim()
  )
    ? record.provider
        .trim()
        .slice(
          0,
          120,
        )
    : null;
}

export async function extractSamiAiDocumentText(
  input: {
    name: string;
    mimeType: string;
    extension: string | null;
    bytes: Buffer;
  },
): Promise<
  SamiAiDocumentExtractionResult |
  null
> {
  if (
    !isSamiAiExtractableDocument(
      input.mimeType,
      input.extension,
    )
  ) {
    return null;
  }

  const status =
    getSamiAiDocumentExtractorStatus();

  if (
    !status.configured ||
    !status.endpoint
  ) {
    return null;
  }

  if (
    input.bytes.byteLength >
      status.maxInputBytes
  ) {
    throw new Error(
      `Document exceeds the SaMi AI extraction limit of ${status.maxInputBytes} bytes.`,
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      status.timeoutMs,
    );

  try {
    const token =
      process.env
        .SAMI_AI_DOCUMENT_EXTRACTOR_BEARER_TOKEN
        ?.trim() ||
      '';

    const response =
      await fetch(
        status.endpoint,
        {
          method:
            'POST',
          headers: {
            'Content-Type':
              'application/json',
            Accept:
              'application/json',
            'X-SaMi-Extractor-Contract':
              'document-text-v1',
            ...(
              token
                ? {
                    Authorization:
                      'Bearer ' +
                      token,
                  }
                : {}
            ),
          },
          body:
            JSON.stringify({
              version:
                1,
              purpose:
                'sami_ai_attachment_text_extraction',
              file: {
                name:
                  input.name,
                mimeType:
                  input.mimeType,
                extension:
                  input.extension,
                sizeBytes:
                  input.bytes
                    .byteLength,
                dataBase64:
                  input.bytes
                    .toString(
                      'base64',
                    ),
              },
            }),
          signal:
            controller.signal,
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Document extractor returned HTTP ${response.status}.`,
      );
    }

    const payload =
      await response
        .json()
        .catch(
          () => null,
        );

    const extracted =
      responseText(
        payload,
      )
        .replace(
          /\u0000/g,
          '',
        )
        .trim();

    if (!extracted) {
      throw new Error(
        'Document extractor returned no readable text.',
      );
    }

    const truncated =
      extracted.length >
      status.maxTextChars;

    return {
      text:
        extracted.slice(
          0,
          status.maxTextChars,
        ),
      truncated,
      provider:
        responseProvider(
          payload,
        ),
    };
  } finally {
    clearTimeout(
      timer,
    );
  }
}
