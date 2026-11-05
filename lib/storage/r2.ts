import "server-only";

import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AVATAR_URL_EXPIRY_SECONDS = 60 * 60;

let client: S3Client | null = null;

function getStorageConfig() {
  const provider = process.env.SAMI_STORAGE_PROVIDER?.trim().toLowerCase();
  const bucket = process.env.SAMI_STORAGE_BUCKET?.trim();

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  let endpoint = process.env.R2_ENDPOINT?.trim();

  if (!endpoint && accountId) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  if (provider !== "r2") {
    throw new Error("SaMi storage provider is not configured for Cloudflare R2.");
  }

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("Cloudflare R2 storage configuration is incomplete.");
  }

  if (!/^https:\/\//i.test(endpoint)) {
    endpoint = `https://${endpoint}`;
  }

  const parsedEndpoint = new URL(endpoint);

  if (parsedEndpoint.protocol !== "https:") {
    throw new Error("Cloudflare R2 must use a secure HTTPS endpoint.");
  }

  return {
    bucket,
    endpoint: parsedEndpoint.toString().replace(/\/+$/, ""),
    accessKeyId,
    secretAccessKey,
  };
}

function getR2() {
  const config = getStorageConfig();

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return {
    client,
    bucket: config.bucket,
  };
}

export function createCustomerAvatarKey(
  userId: string,
  extension: "jpg" | "png" | "webp",
) {
  return `customers/${userId}/avatars/${randomUUID()}.${extension}`;
}

export function isCustomerAvatarKey(userId: string, key: string) {
  return (
    key.startsWith(`customers/${userId}/avatars/`) &&
    !key.includes("..") &&
    !key.includes("\\")
  );
}

export async function uploadR2Object(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  const { client, bucket } = getR2();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.bytes,
      ContentLength: input.bytes.byteLength,
      ContentType: input.contentType,
      CacheControl: "private, max-age=300",
    }),
  );
}

export async function createR2ReadUrl(key: string) {
  const { client, bucket } = getR2();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    {
      expiresIn: AVATAR_URL_EXPIRY_SECONDS,
    },
  );
}

export async function deleteR2Object(key: string) {
  const { client, bucket } = getR2();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}