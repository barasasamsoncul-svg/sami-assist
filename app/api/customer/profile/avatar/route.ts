import { NextResponse } from "next/server";
import sharp from "sharp";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  createCustomerAvatarKey,
  createR2ReadUrl,
  deleteR2Object,
  isCustomerAvatarKey,
  uploadR2Object,
} from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

async function authenticate(request: Request) {
  if (!isNative(request)) {
    return { error: error("This endpoint is available through the SaMi app.", 403) };
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) return { error: error("Sign in to continue.", 401) };
  if (user.role !== "customer") {
    return { error: error("Only customer avatars can be managed here.", 403) };
  }

  return { user };
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  let uploadedKey: string | null = null;
  let databaseUpdated = false;

  try {
    const form = await request.formData();
    const file = form.get("avatar");

    if (!file || typeof file === "string") {
      return error("Choose a photo to upload.");
    }

    if (file.size < 100 || file.size > MAX_UPLOAD_BYTES) {
      return error("Choose an image smaller than 5 MB.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    const source = sharp(bytes, {
      failOn: "error",
      limitInputPixels: 20_000_000,
    });

    const metadata = await source.metadata();

    if (!["jpeg", "png", "webp"].includes(metadata.format || "")) {
      return error("Use a JPEG, PNG or WebP image.");
    }

    const normalized = await source
      .rotate()
      .resize(512, 512, {
        fit: "cover",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    const existing = await query<{ avatar_key: string | null }>(
      `SELECT avatar_key
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       LIMIT 1`,
      [auth.user.id],
    );

    if (!existing.rows[0]) {
      return error("Your customer profile could not be found.", 404);
    }

    const oldKey = existing.rows[0].avatar_key;
    const newKey = createCustomerAvatarKey(auth.user.id, "jpg");
    uploadedKey = newKey;

    await uploadR2Object({
      key: newKey,
      bytes: normalized,
      contentType: "image/jpeg",
    });

    // Verify that a signed read URL can be created before saving the new key.
    const avatarUrl = await createR2ReadUrl(newKey);

    const updated = await query<{ avatar_key: string }>(
      `UPDATE public.users
       SET avatar_key = $2,
           updated_at = now()
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       RETURNING avatar_key`,
      [auth.user.id, newKey],
    );

    if (!updated.rows[0]) {
      throw new Error("AVATAR_DATABASE_UPDATE_FAILED");
    }

    databaseUpdated = true;

    if (oldKey && isCustomerAvatarKey(auth.user.id, oldKey)) {
      await deleteR2Object(oldKey).catch((cause) => {
        console.error(
          "[SaMi avatar] Previous image cleanup failed.",
          cause instanceof Error ? cause.message : "unknown error",
        );
      });
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Your profile photo has been updated.",
        avatar_url: avatarUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    if (uploadedKey && !databaseUpdated) {
      await deleteR2Object(uploadedKey).catch(() => undefined);
    }

    console.error(
      "[SaMi avatar] Upload failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "Your photo could not be uploaded. Check the storage configuration and try again.",
      503,
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const existing = await query<{ avatar_key: string | null }>(
      `SELECT avatar_key
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       LIMIT 1`,
      [auth.user.id],
    );

    if (!existing.rows[0]) {
      return error("Your customer profile could not be found.", 404);
    }

    const oldKey = existing.rows[0].avatar_key;

    await query(
      `UPDATE public.users
       SET avatar_key = NULL,
           updated_at = now()
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true`,
      [auth.user.id],
    );

    if (oldKey && isCustomerAvatarKey(auth.user.id, oldKey)) {
      await deleteR2Object(oldKey).catch((cause) => {
        console.error(
          "[SaMi avatar] Removed image cleanup failed.",
          cause instanceof Error ? cause.message : "unknown error",
        );
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Your profile photo has been removed.",
    });
  } catch (cause) {
    console.error(
      "[SaMi avatar] Removal failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Your photo could not be removed right now.", 503);
  }
}