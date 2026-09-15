import 'server-only';

import crypto from 'crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  withControlTransaction,
} from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

export type AvatarOwnerType =
  | 'user'
  | 'platform_admin';

export type AvatarRecord = {
  id: string;
  ownerType: AvatarOwnerType;
  ownerId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type AvatarObject = {
  body: Uint8Array;
  mimeType: string;
  checksumSha256: string;
};

type AvatarFileRow = {
  id: string;
  owner_type: AvatarOwnerType;
  owner_id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string | number;
  checksum_sha256: string;
};

type CurrentAvatarRow = {
  id: string;
  storage_key: string;
};

type ValidatedImage = {
  mimeType:
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp';
  extension:
    | 'jpg'
    | 'png'
    | 'webp';
};

/* ============================================================
   CONSTANTS

   Category 2 avatar limits only.
   This is NOT the Category 14 general file-storage system.
   ============================================================ */

export const MAX_AVATAR_BYTES =
  5 * 1024 * 1024;

const STORAGE_PROVIDER = 'r2';

const ALLOWED_OWNER_TYPES =
  new Set<AvatarOwnerType>([
    'user',
    'platform_admin',
  ]);

/* ============================================================
   ERRORS
   ============================================================ */

export type AvatarErrorCode =
  | 'INVALID_OWNER'
  | 'ACCOUNT_UNAVAILABLE'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
  | 'AVATAR_NOT_FOUND'
  | 'STORAGE_CONFIGURATION_ERROR'
  | 'STORAGE_UNAVAILABLE';

export class AvatarError extends Error {
  readonly code: AvatarErrorCode;

  constructor(
    code: AvatarErrorCode,
    message: string
  ) {
    super(message);

    this.name = 'AvatarError';
    this.code = code;
  }
}

/* ============================================================
   R2 CONFIGURATION

   Credentials remain server-side.

   We deliberately keep this inside Category 2's avatar service.
   It can later move behind Category 14's storage abstraction
   without changing the account-facing avatar contract.
   ============================================================ */

let r2Client: S3Client | null = null;

function requiredEnvironment(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new AvatarError(
      'STORAGE_CONFIGURATION_ERROR',
      'Avatar storage is not configured.'
    );
  }

  return value;
}

function getBucketName(): string {
  return requiredEnvironment(
    'SAMI_STORAGE_BUCKET'
  );
}

function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  const provider =
    requiredEnvironment(
      'SAMI_STORAGE_PROVIDER'
    ).toLowerCase();

  if (provider !== 'r2') {
    throw new AvatarError(
      'STORAGE_CONFIGURATION_ERROR',
      'Avatar storage provider is not configured correctly.'
    );
  }

  const endpoint =
    requiredEnvironment(
      'R2_ENDPOINT'
    );

  const accessKeyId =
    requiredEnvironment(
      'R2_ACCESS_KEY_ID'
    );

  const secretAccessKey =
    requiredEnvironment(
      'R2_SECRET_ACCESS_KEY'
    );

  r2Client = new S3Client({
    region: 'auto',

    endpoint,

    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return r2Client;
}

/* ============================================================
   VALIDATION
   ============================================================ */

function assertOwner(
  ownerType: AvatarOwnerType,
  ownerId: string
) {
  if (
    !ALLOWED_OWNER_TYPES.has(
      ownerType
    )
  ) {
    throw new AvatarError(
      'INVALID_OWNER',
      'Invalid avatar owner.'
    );
  }

  const normalizedOwnerId =
    ownerId.trim();

  if (!normalizedOwnerId) {
    throw new AvatarError(
      'INVALID_OWNER',
      'Invalid avatar owner.'
    );
  }

  return normalizedOwnerId;
}

function isJpeg(
  buffer: Buffer
): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isPng(
  buffer: Buffer
): boolean {
  if (buffer.length < 8) {
    return false;
  }

  const signature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ];

  return signature.every(
    (byte, index) =>
      buffer[index] === byte
  );
}

function isWebp(
  buffer: Buffer
): boolean {
  if (buffer.length < 12) {
    return false;
  }

  return (
    buffer
      .subarray(0, 4)
      .toString('ascii') ===
      'RIFF' &&
    buffer
      .subarray(8, 12)
      .toString('ascii') ===
      'WEBP'
  );
}

function detectImage(
  buffer: Buffer
): ValidatedImage {
  if (isJpeg(buffer)) {
    return {
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  if (isPng(buffer)) {
    return {
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  if (isWebp(buffer)) {
    return {
      mimeType: 'image/webp',
      extension: 'webp',
    };
  }

  throw new AvatarError(
    'UNSUPPORTED_IMAGE',
    'Use a JPEG, PNG, or WebP image.'
  );
}

function validateAvatarBuffer(
  buffer: Buffer
): ValidatedImage {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0
  ) {
    throw new AvatarError(
      'INVALID_FILE',
      'Choose an image to upload.'
    );
  }

  if (
    buffer.length >
    MAX_AVATAR_BYTES
  ) {
    throw new AvatarError(
      'FILE_TOO_LARGE',
      'Profile image must be 5 MB or smaller.'
    );
  }

  return detectImage(buffer);
}

/* ============================================================
   FILE NAME / STORAGE KEY
   ============================================================ */

function sanitizeOriginalName(
  value?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const basename =
    value
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.trim() || '';

  if (!basename) {
    return null;
  }

  const sanitized =
    basename
      .replace(
        /[^A-Za-z0-9._ -]/g,
        '_'
      )
      .replace(/\s+/g, ' ')
      .slice(0, 200);

  return sanitized || null;
}

function createStorageKey(
  ownerType: AvatarOwnerType,
  ownerId: string,
  extension: ValidatedImage['extension']
): string {
  /*
   * The object key never contains the original filename.
   * ownerId is a UUID in SaMi, while randomBytes prevents
   * predictable replacement keys.
   */

  const random =
    crypto
      .randomBytes(24)
      .toString('hex');

  return [
    'account-avatars',
    ownerType,
    ownerId,
    `${random}.${extension}`,
  ].join('/');
}

function sha256(
  buffer: Buffer
): string {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

/* ============================================================
   STORAGE OPERATIONS
   ============================================================ */

async function putObject(
  storageKey: string,
  body: Buffer,
  mimeType: string,
  checksum: string
) {
  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket:
          getBucketName(),

        Key:
          storageKey,

        Body:
          body,

        ContentType:
          mimeType,

        CacheControl:
          'private, max-age=3600',

        Metadata: {
          sha256:
            checksum,
        },
      })
    );
  } catch (error) {
    if (
      error instanceof
        AvatarError
    ) {
      throw error;
    }

    console.error(
      '[Avatar] R2 upload failed:',
      error
    );

    throw new AvatarError(
      'STORAGE_UNAVAILABLE',
      'Profile image storage is temporarily unavailable.'
    );
  }
}

async function deleteObject(
  storageKey: string
): Promise<boolean> {
  if (!storageKey) {
    return true;
  }

  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket:
          getBucketName(),

        Key:
          storageKey,
      })
    );

    return true;
  } catch (error) {
    /*
     * Deletion happens after the authoritative database
     * transaction. A failed cleanup must not roll back an
     * already-successful account update.
     *
     * Category 14 can later add a durable cleanup/reconciliation
     * worker. For now we log without exposing credentials.
     */

    console.error(
      '[Avatar] R2 cleanup failed:',
      {
        storageKey,
        error,
      }
    );

    return false;
  }
}

async function getObject(
  storageKey: string
): Promise<Buffer> {
  try {
    const result =
      await getR2Client().send(
        new GetObjectCommand({
          Bucket:
            getBucketName(),

          Key:
            storageKey,
        })
      );

    if (!result.Body) {
      throw new AvatarError(
        'AVATAR_NOT_FOUND',
        'Profile image was not found.'
      );
    }

    const bytes =
      await result.Body
        .transformToByteArray();

    return Buffer.from(
      bytes
    );
  } catch (error) {
    if (
      error instanceof
        AvatarError
    ) {
      throw error;
    }

    const candidate =
      error as {
        name?: string;
        $metadata?: {
          httpStatusCode?: number;
        };
      };

    if (
      candidate.name ===
        'NoSuchKey' ||
      candidate.$metadata
        ?.httpStatusCode === 404
    ) {
      throw new AvatarError(
        'AVATAR_NOT_FOUND',
        'Profile image was not found.'
      );
    }

    console.error(
      '[Avatar] R2 read failed:',
      error
    );

    throw new AvatarError(
      'STORAGE_UNAVAILABLE',
      'Profile image storage is temporarily unavailable.'
    );
  }
}

/* ============================================================
   DATABASE HELPERS
   ============================================================ */

function ownerTable(
  ownerType: AvatarOwnerType
) {
  /*
   * ownerType is never browser-controlled here without first
   * passing the strict enum validation above.
   */

  return ownerType ===
    'user'
    ? 'users'
    : 'platform_admins';
}

async function assertAccountAvailable(
  client: {
    query: (
      text: string,
      params?: unknown[]
    ) => Promise<{
      rows: Array<Record<string, unknown>>;
    }>;
  },
  ownerType: AvatarOwnerType,
  ownerId: string
) {
  const table =
    ownerTable(ownerType);

  const statusCondition =
    ownerType ===
    'platform_admin'
      ? `AND status = 'active'`
      : `AND status NOT IN ('deleted', 'disabled')`;

  const result =
    await client.query(
      `
        SELECT id

        FROM ${table}

        WHERE id = $1
          AND deleted_at IS NULL
          ${statusCondition}

        FOR UPDATE
      `,
      [ownerId]
    );

  if (
    result.rows.length !== 1
  ) {
    throw new AvatarError(
      'ACCOUNT_UNAVAILABLE',
      'This account is not currently available.'
    );
  }
}

function mapAvatarRow(
  row: AvatarFileRow
): AvatarRecord {
  return {
    id:
      row.id,

    ownerType:
      row.owner_type,

    ownerId:
      row.owner_id,

    storageKey:
      row.storage_key,

    mimeType:
      row.mime_type,

    sizeBytes:
      Number(
        row.size_bytes
      ),

    checksumSha256:
      row.checksum_sha256,
  };
}

/* ============================================================
   UPLOAD / REPLACE

   Cross-system transaction strategy:

   1. Validate locally.
   2. Upload unique object to R2.
   3. Start PostgreSQL transaction.
   4. Lock account row.
   5. Retire old metadata.
   6. Insert new metadata.
   7. Point account at new file.
   8. Commit.
   9. Delete old object best-effort.

   If PostgreSQL fails after R2 upload, the newly-uploaded
   object is compensating-deleted.
   ============================================================ */

export async function replaceAvatar(
  ownerType: AvatarOwnerType,
  ownerId: string,
  buffer: Buffer,
  originalName?: string | null
): Promise<AvatarRecord> {
  const id =
    assertOwner(
      ownerType,
      ownerId
    );

  const image =
    validateAvatarBuffer(
      buffer
    );

  const checksum =
    sha256(buffer);

  const storageKey =
    createStorageKey(
      ownerType,
      id,
      image.extension
    );

  const safeOriginalName =
    sanitizeOriginalName(
      originalName
    );

  /*
   * Upload first. Nothing in PostgreSQL points at this object
   * yet, so a storage failure cannot corrupt account state.
   */
  await putObject(
    storageKey,
    buffer,
    image.mimeType,
    checksum
  );

  let previousStorageKey:
    string | null = null;

  let created:
    AvatarRecord | null =
      null;

  try {
    created =
      await withControlTransaction(
        async (client) => {
          await assertAccountAvailable(
            client,
            ownerType,
            id
          );

          const table =
            ownerTable(
              ownerType
            );

          /*
           * Read the current authoritative avatar while the
           * account row is locked.
           */
          const currentResult =
            await client.query(
              `
                SELECT
                  f.id,
                  f.storage_key

                FROM ${table} a

                LEFT JOIN files f
                  ON f.id =
                    a.avatar_file_id

                WHERE a.id = $1
                  AND a.deleted_at IS NULL

                LIMIT 1
              `,
              [id]
            );

          const current =
            currentResult
              .rows[0] as
              | CurrentAvatarRow
              | undefined;

          if (
            current?.id &&
            current.storage_key
          ) {
            previousStorageKey =
              current.storage_key;

            await client.query(
              `
                UPDATE files

                SET
                  status = 'deleted',
                  deleted_at = NOW()

                WHERE id = $1
                  AND owner_type = $2
                  AND owner_id = $3
                  AND purpose =
                    'profile_avatar'
                  AND status =
                    'active'
              `,
              [
                current.id,
                ownerType,
                id,
              ]
            );
          }

          const insertResult =
            await client.query(
              `
                INSERT INTO files (
                  owner_type,
                  owner_id,
                  purpose,
                  storage_provider,
                  storage_key,
                  original_name,
                  mime_type,
                  size_bytes,
                  checksum_sha256,
                  status,
                  created_at
                )

                VALUES (
                  $1,
                  $2,
                  'profile_avatar',
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  'active',
                  NOW()
                )

                RETURNING
                  id,
                  owner_type,
                  owner_id,
                  storage_key,
                  mime_type,
                  size_bytes,
                  checksum_sha256
              `,
              [
                ownerType,
                id,
                STORAGE_PROVIDER,
                storageKey,
                safeOriginalName,
                image.mimeType,
                buffer.length,
                checksum,
              ]
            );

          if (
            insertResult.rows
              .length !== 1
          ) {
            throw new Error(
              'Avatar metadata insert failed.'
            );
          }

          const avatar =
            mapAvatarRow(
              insertResult
                .rows[0] as
                AvatarFileRow
            );

          const updateResult =
            await client.query(
              `
                UPDATE ${table}

                SET
                  avatar_file_id =
                    $2,
                  updated_at =
                    NOW()

                WHERE id = $1
                  AND deleted_at
                    IS NULL

                RETURNING id
              `,
              [
                id,
                avatar.id,
              ]
            );

          if (
            updateResult.rows
              .length !== 1
          ) {
            throw new AvatarError(
              'ACCOUNT_UNAVAILABLE',
              'This account is not currently available.'
            );
          }

          return avatar;
        }
      );
  } catch (error) {
    /*
     * PostgreSQL did not commit, therefore the new R2 object
     * must not remain as an unreferenced upload.
     */
    await deleteObject(
      storageKey
    );

    throw error;
  }

  /*
   * PostgreSQL now points to the new avatar. Removing the old
   * object cannot be part of the SQL transaction.
   */
  if (
    previousStorageKey &&
    previousStorageKey !==
      storageKey
  ) {
    await deleteObject(
      previousStorageKey
    );
  }

  if (!created) {
    throw new Error(
      'Avatar replacement did not complete.'
    );
  }

  return created;
}

/* ============================================================
   REMOVE
   ============================================================ */

export async function removeAvatar(
  ownerType: AvatarOwnerType,
  ownerId: string
): Promise<boolean> {
  const id =
    assertOwner(
      ownerType,
      ownerId
    );

  let previousStorageKey:
    string | null = null;

  const removed =
    await withControlTransaction(
      async (client) => {
        await assertAccountAvailable(
          client,
          ownerType,
          id
        );

        const table =
          ownerTable(
            ownerType
          );

        const currentResult =
          await client.query(
            `
              SELECT
                f.id,
                f.storage_key

              FROM ${table} a

              LEFT JOIN files f
                ON f.id =
                  a.avatar_file_id

              WHERE a.id = $1
                AND a.deleted_at
                  IS NULL

              LIMIT 1
            `,
            [id]
          );

        const current =
          currentResult
            .rows[0] as
            | CurrentAvatarRow
            | undefined;

        if (
          !current?.id ||
          !current.storage_key
        ) {
          /*
           * Idempotent removal.
           */
          await client.query(
            `
              UPDATE ${table}

              SET
                avatar_file_id =
                  NULL,
                updated_at =
                  NOW()

              WHERE id = $1
                AND deleted_at
                  IS NULL
            `,
            [id]
          );

          return false;
        }

        previousStorageKey =
          current.storage_key;

        await client.query(
          `
            UPDATE ${table}

            SET
              avatar_file_id =
                NULL,
              updated_at =
                NOW()

            WHERE id = $1
              AND deleted_at
                IS NULL
          `,
          [id]
        );

        await client.query(
          `
            UPDATE files

            SET
              status = 'deleted',
              deleted_at = NOW()

            WHERE id = $1
              AND owner_type = $2
              AND owner_id = $3
              AND purpose =
                'profile_avatar'
              AND status =
                'active'
          `,
          [
            current.id,
            ownerType,
            id,
          ]
        );

        return true;
      }
    );

  if (previousStorageKey) {
    await deleteObject(
      previousStorageKey
    );
  }

  return removed;
}

/* ============================================================
   READ METADATA
   ============================================================ */

export async function getAvatarRecord(
  ownerType: AvatarOwnerType,
  ownerId: string
): Promise<AvatarRecord | null> {
  const id =
    assertOwner(
      ownerType,
      ownerId
    );

  const table =
    ownerTable(
      ownerType
    );

  /*
   * Dynamic table name is derived only from our strict enum,
   * never from raw request input.
   */

  const {
    queryControl,
  } =
    await import(
      '@/lib/db/control'
    );

  const result =
    await queryControl(
      `
        SELECT
          f.id,
          f.owner_type,
          f.owner_id,
          f.storage_key,
          f.mime_type,
          f.size_bytes,
          f.checksum_sha256

        FROM ${table} a

        INNER JOIN files f
          ON f.id =
            a.avatar_file_id

        WHERE a.id = $1
          AND a.deleted_at
            IS NULL
          AND f.owner_type =
            $2
          AND f.owner_id =
            $1
          AND f.purpose =
            'profile_avatar'
          AND f.status =
            'active'

        LIMIT 1
      `,
      [
        id,
        ownerType,
      ]
    );

  if (
    result.rows.length === 0
  ) {
    return null;
  }

  return mapAvatarRow(
    result.rows[0] as
      AvatarFileRow
  );
}

/* ============================================================
   READ PRIVATE OBJECT

   The API layer must authenticate/authorize the requester
   before calling this function.

   R2 remains private.
   ============================================================ */

export async function getAvatarObject(
  ownerType: AvatarOwnerType,
  ownerId: string
): Promise<AvatarObject> {
  const avatar =
    await getAvatarRecord(
      ownerType,
      ownerId
    );

  if (!avatar) {
    throw new AvatarError(
      'AVATAR_NOT_FOUND',
      'Profile image was not found.'
    );
  }

  const body =
    await getObject(
      avatar.storageKey
    );

  /*
   * Defensive integrity check. We do not silently return an
   * object that differs from the metadata committed by SaMi.
   */
  const actualChecksum =
    sha256(body);

  if (
    actualChecksum !==
    avatar.checksumSha256
  ) {
    console.error(
      '[Avatar] Object checksum mismatch:',
      {
        avatarId:
          avatar.id,
        ownerType,
        ownerId,
      }
    );

    throw new AvatarError(
      'STORAGE_UNAVAILABLE',
      'Profile image is temporarily unavailable.'
    );
  }

  return {
    body:
      new Uint8Array(
        body
      ),

    mimeType:
      avatar.mimeType,

    checksumSha256:
      avatar.checksumSha256,
  };
}