import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  getSignedUrl,
} from '@aws-sdk/s3-request-presigner';


export type ObjectStorageProvider =
  | 'r2'
  | 's3';


export type ObjectStorageErrorCode =
  | 'STORAGE_CONFIGURATION_ERROR'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_OBJECT_NOT_FOUND'
  | 'INVALID_STORAGE_KEY';


export class ObjectStorageError
  extends Error {
  readonly code:
    ObjectStorageErrorCode;

  constructor(
    code:
      ObjectStorageErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'ObjectStorageError';

    this.code =
      code;
  }
}


export type StoredObjectHead = {
  sizeBytes:
    number;
  contentType:
    string | null;
  etag:
    string | null;
  lastModified:
    Date | null;
};


type StorageConfig = {
  provider:
    ObjectStorageProvider;
  bucket:
    string;
  region:
    string;
  endpoint?:
    string;
  forcePathStyle:
    boolean;
  credentials?:
    {
      accessKeyId:
        string;
      secretAccessKey:
        string;
    };
};


type PresignedUploadInput = {
  storageKey:
    string;
  mimeType:
    string;
  expiresInSeconds?:
    number;
};


type PresignedDownloadInput = {
  storageKey:
    string;
  fileName:
    string;
  expiresInSeconds?:
    number;
};


type PutPrivateObjectInput = {
  storageKey:
    string;
  body:
    Buffer | Uint8Array;
  mimeType:
    string;
  cacheControl?:
    string;
  metadata?:
    Record<string, string>;
};


let cachedClient:
  S3Client | null =
  null;

let cachedFingerprint =
  '';


function requiredEnvironment(
  name:
    string,
): string {
  const value =
    process.env[name]
      ?.trim();

  if (
    !value
  ) {
    throw new ObjectStorageError(
      'STORAGE_CONFIGURATION_ERROR',
      'Private object storage is not configured.',
    );
  }

  return value;
}


function getStorageConfig():
  StorageConfig {
  const provider =
    requiredEnvironment(
      'SAMI_STORAGE_PROVIDER',
    )
      .toLowerCase();

  const bucket =
    requiredEnvironment(
      'SAMI_STORAGE_BUCKET',
    );

  if (
    provider ===
      'r2'
  ) {
    return {
      provider:
        'r2',
      bucket,
      region:
        'auto',
      endpoint:
        requiredEnvironment(
          'R2_ENDPOINT',
        ),
      forcePathStyle:
        false,
      credentials: {
        accessKeyId:
          requiredEnvironment(
            'R2_ACCESS_KEY_ID',
          ),
        secretAccessKey:
          requiredEnvironment(
            'R2_SECRET_ACCESS_KEY',
          ),
      },
    };
  }

  if (
    provider ===
      's3'
  ) {
    const region =
      requiredEnvironment(
        'SAMI_STORAGE_REGION',
      );

    const accessKeyId =
      process.env
        .SAMI_STORAGE_ACCESS_KEY_ID
        ?.trim();

    const secretAccessKey =
      process.env
        .SAMI_STORAGE_SECRET_ACCESS_KEY
        ?.trim();

    if (
      Boolean(
        accessKeyId,
      ) !==
      Boolean(
        secretAccessKey,
      )
    ) {
      throw new ObjectStorageError(
        'STORAGE_CONFIGURATION_ERROR',
        'Private object storage credentials are incomplete.',
      );
    }

    return {
      provider:
        's3',
      bucket,
      region,
      endpoint:
        process.env
          .SAMI_STORAGE_ENDPOINT
          ?.trim() ||
        undefined,
      forcePathStyle:
        process.env
          .SAMI_STORAGE_FORCE_PATH_STYLE
          ?.trim()
          .toLowerCase() ===
        'true',
      credentials:
        accessKeyId &&
        secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    };
  }

  throw new ObjectStorageError(
    'STORAGE_CONFIGURATION_ERROR',
    'Private object storage provider is not supported.',
  );
}


function getStorageClient(): {
  client:
    S3Client;
  config:
    StorageConfig;
} {
  const config =
    getStorageConfig();

  const fingerprint =
    JSON.stringify({
      provider:
        config.provider,
      bucket:
        config.bucket,
      region:
        config.region,
      endpoint:
        config.endpoint ||
        null,
      forcePathStyle:
        config.forcePathStyle,
      credentialMode:
        config.credentials
          ? 'explicit'
          : 'sdk',
    });

  if (
    !cachedClient ||
    cachedFingerprint !==
      fingerprint
  ) {
    cachedClient =
      new S3Client({
        region:
          config.region,
        endpoint:
          config.endpoint,
        forcePathStyle:
          config.forcePathStyle,
        credentials:
          config.credentials,
      });

    cachedFingerprint =
      fingerprint;
  }

  return {
    client:
      cachedClient,
    config,
  };
}


function safeStorageKey(
  value:
    string,
): string {
  const key =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    !key ||
    key.length >
      1024 ||
    key.startsWith(
      '/',
    ) ||
    key.includes(
      '\\',
    ) ||
    key
      .split(
        '/',
      )
      .some(
        segment =>
          !segment ||
          segment ===
            '.' ||
          segment ===
            '..',
      )
  ) {
    throw new ObjectStorageError(
      'INVALID_STORAGE_KEY',
      'The storage object reference is invalid.',
    );
  }

  return key;
}


function cleanEtag(
  value:
    string | undefined,
): string | null {
  if (
    !value
  ) {
    return null;
  }

  return value
    .trim()
    .replace(
      /^"+|"+$/g,
      '',
    ) ||
    null;
}


function safeDownloadName(
  value:
    string,
): string {
  const name =
    value
      .replace(
        /[\u0000-\u001f\u007f"]/g,
        '_',
      )
      .replace(
        /[\\/]/g,
        '_',
      )
      .trim()
      .slice(
        0,
        180,
      );

  return (
    name ||
    'download'
  );
}


function toStorageError(
  error:
    unknown,
  fallback:
    string,
): ObjectStorageError {
  if (
    error instanceof
      ObjectStorageError
  ) {
    return error;
  }

  const candidate =
    error as {
      name?:
        string;
      $metadata?: {
        httpStatusCode?:
          number;
      };
    };

  if (
    candidate?.name ===
      'NoSuchKey' ||
    candidate?.name ===
      'NotFound' ||
    candidate?.$metadata
      ?.httpStatusCode ===
      404
  ) {
    return new ObjectStorageError(
      'STORAGE_OBJECT_NOT_FOUND',
      'The stored object was not found.',
    );
  }

  console.error(
    '[SaMi Storage] Object storage request failed:',
    error,
  );

  return new ObjectStorageError(
    'STORAGE_UNAVAILABLE',
    fallback,
  );
}


export function getObjectStorageProviderKey():
  ObjectStorageProvider {
  return getStorageConfig()
    .provider;
}


export async function putPrivateObject(
  input:
    PutPrivateObjectInput,
): Promise<void> {
  const {
    client,
    config,
  } =
    getStorageClient();

  const storageKey =
    safeStorageKey(
      input.storageKey,
    );

  try {
    await client.send(
      new PutObjectCommand({
        Bucket:
          config.bucket,
        Key:
          storageKey,
        Body:
          input.body,
        ContentType:
          input.mimeType,
        CacheControl:
          input.cacheControl ||
          'private, no-store',
        Metadata:
          input.metadata,
      }),
    );
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'Private object storage is temporarily unavailable.',
    );
  }
}


export async function getPrivateObjectBytes(
  storageKey:
    string,
): Promise<Buffer> {
  const {
    client,
    config,
  } =
    getStorageClient();

  try {
    const result =
      await client.send(
        new GetObjectCommand({
          Bucket:
            config.bucket,
          Key:
            safeStorageKey(
              storageKey,
            ),
        }),
      );

    if (
      !result.Body
    ) {
      throw new ObjectStorageError(
        'STORAGE_OBJECT_NOT_FOUND',
        'The stored object was not found.',
      );
    }

    return Buffer.from(
      await result.Body
        .transformToByteArray(),
    );
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'Private object storage is temporarily unavailable.',
    );
  }
}


export async function headPrivateObject(
  storageKey:
    string,
): Promise<StoredObjectHead> {
  const {
    client,
    config,
  } =
    getStorageClient();

  try {
    const result =
      await client.send(
        new HeadObjectCommand({
          Bucket:
            config.bucket,
          Key:
            safeStorageKey(
              storageKey,
            ),
        }),
      );

    return {
      sizeBytes:
        Number(
          result.ContentLength ||
          0,
        ),
      contentType:
        typeof result.ContentType ===
          'string'
          ? result.ContentType
          : null,
      etag:
        cleanEtag(
          result.ETag,
        ),
      lastModified:
        result.LastModified ||
        null,
    };
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'Private object storage is temporarily unavailable.',
    );
  }
}


export async function deletePrivateObject(
  storageKey:
    string,
): Promise<void> {
  const {
    client,
    config,
  } =
    getStorageClient();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket:
          config.bucket,
        Key:
          safeStorageKey(
            storageKey,
          ),
      }),
    );
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'Private object storage is temporarily unavailable.',
    );
  }
}


export async function createPrivateUploadUrl(
  input:
    PresignedUploadInput,
): Promise<{
  url:
    string;
  method:
    'PUT';
  headers:
    Record<string, string>;
  expiresAt:
    string;
}> {
  const {
    client,
    config,
  } =
    getStorageClient();

  const expiresIn =
    Math.min(
      Math.max(
        input
          .expiresInSeconds ||
        600,
        60,
      ),
      900,
    );

  const mimeType =
    input.mimeType
      .trim()
      .toLowerCase() ||
    'application/octet-stream';

  try {
    const url =
      await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket:
            config.bucket,
          Key:
            safeStorageKey(
              input.storageKey,
            ),
          ContentType:
            mimeType,
          CacheControl:
            'private, no-store',
        }),
        {
          expiresIn,
          signableHeaders:
            new Set([
              'content-type',
            ]),
        },
      );

    return {
      url,
      method:
        'PUT',
      headers: {
        'Content-Type':
          mimeType,
      },
      expiresAt:
        new Date(
          Date.now() +
          expiresIn * 1000,
        )
          .toISOString(),
    };
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'SaMi could not create a secure upload URL.',
    );
  }
}


export async function createPrivateDownloadUrl(
  input:
    PresignedDownloadInput,
): Promise<{
  url:
    string;
  expiresAt:
    string;
}> {
  const {
    client,
    config,
  } =
    getStorageClient();

  const expiresIn =
    Math.min(
      Math.max(
        input
          .expiresInSeconds ||
        120,
        30,
      ),
      300,
    );

  const disposition =
    `attachment; filename="${safeDownloadName(
      input.fileName,
    )}"`;

  try {
    return {
      url:
        await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket:
              config.bucket,
            Key:
              safeStorageKey(
                input.storageKey,
              ),
            ResponseContentDisposition:
              disposition,
          }),
          {
            expiresIn,
          },
        ),
      expiresAt:
        new Date(
          Date.now() +
          expiresIn * 1000,
        )
          .toISOString(),
    };
  } catch (
    error
  ) {
    throw toStorageError(
      error,
      'SaMi could not create a secure download URL.',
    );
  }
}
