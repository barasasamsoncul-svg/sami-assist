/** Maximum accepted size for the shared Sales write endpoint. */
export const MAX_BODY_BYTES = 160 * 1024;

export type SalesRequestBodyErrorCode =
  | 'INVALID_REQUEST'
  | 'REQUEST_TOO_LARGE';

/** A client-correctable error while reading the Sales JSON request body. */
export class SalesRequestBodyError extends Error {
  readonly code: SalesRequestBodyErrorCode;
  readonly status: 400 | 413;

  constructor(code: SalesRequestBodyErrorCode, status: 400 | 413, message: string) {
    super(message);
    this.name = 'SalesRequestBodyError';
    this.code = code;
    this.status = status;
  }
}

const invalidRequest = () => new SalesRequestBodyError(
  'INVALID_REQUEST',
  400,
  'A valid Sales request is required.',
);

const requestTooLarge = () => new SalesRequestBodyError(
  'REQUEST_TOO_LARGE',
  413,
  'The Sales request is too large.',
);

/**
 * Read JSON while enforcing the byte limit against the actual body stream.
 * Content-Length is an early-rejection hint only; it is never trusted as the
 * sole size check because it can be absent or disagree with the streamed data.
 */
export async function parseSalesRequestBody(
  request: Pick<Request, 'headers' | 'body'>,
): Promise<unknown> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLengthText = contentLengthHeader.trim();
    if (!/^\d+$/.test(contentLengthText)) {
      throw invalidRequest();
    }

    const declaredLength = Number(contentLengthText);
    if (!Number.isSafeInteger(declaredLength)) {
      throw invalidRequest();
    }
    if (declaredLength > MAX_BODY_BYTES) {
      throw requestTooLarge();
    }
  }

  if (!request.body) {
    throw invalidRequest();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains the actionable result if cancellation fails.
        }
        throw requestTooLarge();
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SalesRequestBodyError) throw error;
    throw invalidRequest();
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidRequest();
  }

  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    throw invalidRequest();
  }
}
