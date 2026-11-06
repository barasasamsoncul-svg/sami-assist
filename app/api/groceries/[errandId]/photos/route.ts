
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { getCurrentUser } from "@/lib/auth";
import { databasePool, query } from "@/lib/db";
import {
  createR2ReadUrl,
  uploadR2Object,
  deleteR2Object,
} from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    errandId: string;
  }>;
};

type PreparedPhoto = {
  bytes: Buffer;
  originalFileName: string;
};

const MAX_PHOTOS = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = MAX_PHOTOS * MAX_FILE_BYTES;
const MAX_IMAGE_PIXELS = 25_000_000;

function error(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isNativeClient(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function safeFileName(value: string) {
  const name = value
    .normalize("NFKC")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);

  return name || "grocery-photo";
}

async function preparePhoto(
  file: File,
): Promise<PreparedPhoto> {
  if (file.size < 100 || file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name || "A selected photo"} must be between 100 bytes and 5 MB.`,
    );
  }

  const inputBytes = Buffer.from(
    await file.arrayBuffer(),
  );

  const source = sharp(inputBytes, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  });

  const metadata = await source.metadata();

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 1 ||
    metadata.height < 1
  ) {
    throw new Error("One of the selected images is invalid.");
  }

  if (
    !["jpeg", "png", "webp"].includes(
      metadata.format || "",
    )
  ) {
    throw new Error(
      "Use JPEG, PNG or WebP images for grocery errand photos.",
    );
  }

  let normalized = await sharp(inputBytes, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  })
    .rotate()
    .resize(1600, 1600, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 82,
      mozjpeg: true,
    })
    .toBuffer();

  if (normalized.byteLength > MAX_FILE_BYTES) {
    normalized = await sharp(inputBytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
    })
      .rotate()
      .resize(1400, 1400, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 65,
        mozjpeg: true,
      })
      .toBuffer();
  }

  if (
    normalized.byteLength < 100 ||
    normalized.byteLength > MAX_FILE_BYTES
  ) {
    throw new Error(
      "One of the selected images could not be reduced to the 5 MB upload limit.",
    );
  }

  return {
    bytes: normalized,
    originalFileName: safeFileName(file.name),
  };
}

async function authenticateCustomer(request: Request) {
  if (!isNativeClient(request)) {
    return {
      user: null,
      response: error(
        "Grocery photo uploads are available through the SaMi customer app.",
        403,
      ),
    };
  }

  const user = await getCurrentUser(request).catch(
    () => null,
  );

  if (!user) {
    return {
      user: null,
      response: error("Sign in to continue.", 401),
    };
  }

  if (user.role !== "customer") {
    return {
      user: null,
      response: error(
        "Only customers can manage grocery errand photos.",
        403,
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

/**
 * POST /api/groceries/[errandId]/photos
 *
 * Uploads customer-selected photos for an existing grocery errand.
 *
 * Multipart form:
 *   photos: File[]
 *
 * Limits:
 *   - Customer-owned grocery errands only.
 *   - Maximum 5 photos per errand.
 *   - Maximum 5 MB per original photo.
 *   - JPEG, PNG and WebP accepted.
 *   - Images are normalized to JPEG before R2 storage.
 */
export async function POST(
  request: Request,
  context: RouteContext,
) {
  const auth = await authenticateCustomer(request);

  if (auth.response) {
    return auth.response;
  }

  const user = auth.user;

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  const { errandId } = await context.params;

  if (!isUuid(errandId)) {
    return error("Invalid grocery errand reference.");
  }

  const contentLength = Number(
    request.headers.get("content-length") || 0,
  );

  if (
    contentLength > MAX_TOTAL_BYTES + 512 * 1024
  ) {
    return error(
      "The selected photos exceed the total upload limit.",
      413,
    );
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return error("The photo upload request is invalid.");
  }

  const entries = form.getAll("photos");

  if (entries.length === 0) {
    return error("Choose at least one photo to upload.");
  }

  if (entries.length > MAX_PHOTOS) {
    return error(
      `You can upload a maximum of ${MAX_PHOTOS} photos at a time.`,
    );
  }

  if (entries.some((entry) => typeof entry === "string")) {
    return error("The photo upload contains an invalid file.");
  }

  const files = entries as File[];

  const totalOriginalBytes = files.reduce(
    (total, file) => total + file.size,
    0,
  );

  if (totalOriginalBytes > MAX_TOTAL_BYTES) {
    return error(
      "The selected photos exceed the total upload limit.",
      413,
    );
  }

  let preparedPhotos: PreparedPhoto[];

  try {
    preparedPhotos = await Promise.all(
      files.map((file) => preparePhoto(file)),
    );
  } catch (cause) {
    return error(
      cause instanceof Error
        ? cause.message
        : "One of the selected photos could not be processed.",
    );
  }

  const uploadedKeys: string[] = [];
  const client = await databasePool().connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the errand row so simultaneous uploads cannot
    // exceed the five-photo limit.
    const errandResult = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM public.errands
       WHERE id = $1
         AND customer_id = $2
         AND category = 'groceries'
       FOR UPDATE`,
      [errandId, user.id],
    );

    const errand = errandResult.rows[0];

    if (!errand) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return error(
        "Grocery errand not found or you do not have access to it.",
        404,
      );
    }

    if (
      ["completed", "cancelled", "declined"].includes(
        errand.status,
      )
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return error(
        "Photos cannot be added to a closed grocery errand.",
        409,
      );
    }

    const countResult = await client.query<{
      count: string;
    }>(
      `SELECT count(*)::text AS count
       FROM public.grocery_errand_photos
       WHERE errand_id = $1`,
      [errandId],
    );

    const existingCount = Number(
      countResult.rows[0]?.count || 0,
    );

    if (
      existingCount + preparedPhotos.length >
      MAX_PHOTOS
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return error(
        `This errand can have a maximum of ${MAX_PHOTOS} photos. ${existingCount} photo(s) are already attached.`,
        409,
      );
    }

    const uploadedPhotos: Array<{
      id: string;
      original_file_name: string;
      content_type: string;
      size_bytes: number;
      created_at: Date;
    }> = [];

    for (const photo of preparedPhotos) {
      const photoId = randomUUID();

      const storageKey =
        `customers/${user.id}/errands/${errandId}/photos/${photoId}.jpg`;

      await uploadR2Object({
        key: storageKey,
        bytes: photo.bytes,
        contentType: "image/jpeg",
      });

      uploadedKeys.push(storageKey);

      const inserted = await client.query<{
        id: string;
        original_file_name: string;
        content_type: string;
        size_bytes: number;
        created_at: Date;
      }>(
        `INSERT INTO public.grocery_errand_photos (
           id,
           errand_id,
           uploaded_by,
           storage_key,
           original_file_name,
           content_type,
           size_bytes
         )
         VALUES ($1, $2, $3, $4, $5, 'image/jpeg', $6)
         RETURNING
           id,
           original_file_name,
           content_type,
           size_bytes,
           created_at`,
        [
          photoId,
          errandId,
          user.id,
          storageKey,
          photo.originalFileName,
          photo.bytes.byteLength,
        ],
      );

      uploadedPhotos.push(inserted.rows[0]);
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        ok: true,
        message: "Grocery errand photos uploaded successfully.",
        photos: uploadedPhotos,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
    }

    // Remove R2 objects if the database transaction fails.
    await Promise.all(
      uploadedKeys.map((key) =>
        deleteR2Object(key).catch(() => undefined),
      ),
    );

    console.error(
      "[SaMi groceries] Photo upload failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "The grocery photos could not be saved. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}

/**
 * GET /api/groceries/[errandId]/photos
 *
 * Returns signed, temporary read URLs for photos belonging
 * to the authenticated customer's grocery errand.
 */
export async function GET(
  request: Request,
  context: RouteContext,
) {
  const auth = await authenticateCustomer(request);

  if (auth.response) {
    return auth.response;
  }

  const user = auth.user;

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  const { errandId } = await context.params;

  if (!isUuid(errandId)) {
    return error("Invalid grocery errand reference.");
  }

  try {
    const errandResult = await query<{
      id: string;
    }>(
      `SELECT id
       FROM public.errands
       WHERE id = $1
         AND customer_id = $2
         AND category = 'groceries'
       LIMIT 1`,
      [errandId, user.id],
    );

    if (!errandResult.rows[0]) {
      return error(
        "Grocery errand not found or you do not have access to it.",
        404,
      );
    }

    const photosResult = await query<{
      id: string;
      storage_key: string;
      original_file_name: string;
      content_type: string;
      size_bytes: number;
      created_at: Date;
    }>(
      `SELECT
         id,
         storage_key,
         original_file_name,
         content_type,
         size_bytes,
         created_at
       FROM public.grocery_errand_photos
       WHERE errand_id = $1
         AND uploaded_by = $2
       ORDER BY created_at ASC, id ASC`,
      [errandId, user.id],
    );

    const photos = await Promise.all(
      photosResult.rows.map(async (photo) => ({
        id: photo.id,
        url: await createR2ReadUrl(photo.storage_key),
        original_file_name: photo.original_file_name,
        content_type: photo.content_type,
        size_bytes: photo.size_bytes,
        created_at: photo.created_at,
      })),
    );

    return NextResponse.json(
      {
        photos,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi groceries] Photo retrieval failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "Grocery photos are temporarily unavailable.",
      503,
    );
  }
}
