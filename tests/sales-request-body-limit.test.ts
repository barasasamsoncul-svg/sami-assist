import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_BODY_BYTES,
  parseSalesRequestBody,
  SalesRequestBodyError,
} from '../lib/apps/sales/request-body';

function fakeRequest(
  stream: ReadableStream<Uint8Array> | null,
  contentLength?: string,
): Pick<Request, 'headers' | 'body'> {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set('content-length', contentLength);
  return { headers, body: stream };
}

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const encode = (value: string) => new TextEncoder().encode(value);

test('parses valid JSON within the byte limit', async () => {
  assert.deepEqual(
    await parseSalesRequestBody(fakeRequest(streamFrom([encode('{"action":"create_quote"}')]))),
    { action: 'create_quote' },
  );
});

test('rejects oversized declared Content-Length before reading the body', async () => {
  await assert.rejects(
    parseSalesRequestBody(fakeRequest(streamFrom([encode('{}')]), String(MAX_BODY_BYTES + 1))),
    (error: unknown) => error instanceof SalesRequestBodyError && error.code === 'REQUEST_TOO_LARGE' && error.status === 413,
  );
});

test('rejects streamed bodies above the byte limit even without Content-Length', async () => {
  const first = new Uint8Array(MAX_BODY_BYTES);
  const second = encode('x');
  await assert.rejects(
    parseSalesRequestBody(fakeRequest(streamFrom([first, second]))),
    (error: unknown) => error instanceof SalesRequestBodyError && error.code === 'REQUEST_TOO_LARGE' && error.status === 413,
  );
});

test('rejects malformed Content-Length and invalid JSON with a client error', async () => {
  await assert.rejects(
    parseSalesRequestBody(fakeRequest(streamFrom([encode('{}')]), 'not-a-number')),
    (error: unknown) => error instanceof SalesRequestBodyError && error.code === 'INVALID_REQUEST' && error.status === 400,
  );
  await assert.rejects(
    parseSalesRequestBody(fakeRequest(streamFrom([encode('{')]))),
    (error: unknown) => error instanceof SalesRequestBodyError && error.code === 'INVALID_REQUEST' && error.status === 400,
  );
});

test('rejects an absent body', async () => {
  await assert.rejects(
    parseSalesRequestBody(fakeRequest(null)),
    (error: unknown) => error instanceof SalesRequestBodyError && error.code === 'INVALID_REQUEST' && error.status === 400,
  );
});
