import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createR2ReadUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

async function customerFromRequest(request: Request) {
  if (!isNative(request)) {
    return { error: error("This endpoint is available through the SaMi app.", 403) };
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return { error: error("Sign in to continue.", 401) };
  }

  if (user.role !== "customer") {
    return { error: error("Only customer profiles are available here.", 403) };
  }

  return { user };
}

export async function GET(request: Request) {
  const auth = await customerFromRequest(request);
  if (auth.error) return auth.error;

  try {
    const result = await query<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      avatar_key: string | null;
      email_verified_at: string | null;
      phone_verified_at: string | null;
    }>(
      `SELECT
         id,
         full_name,
         email,
         phone,
         avatar_key,
         email_verified_at,
         phone_verified_at
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       LIMIT 1`,
      [auth.user.id],
    );

    const profile = result.rows[0];

    if (!profile) {
      return error("Your customer profile could not be found.", 404);
    }

    const avatarUrl = profile.avatar_key
      ? await createR2ReadUrl(profile.avatar_key)
      : null;

    return NextResponse.json(
      {
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          avatar_url: avatarUrl,
          email_verified: Boolean(profile.email_verified_at),
          phone_verified: Boolean(profile.phone_verified_at),
          email_verified_at: profile.email_verified_at,
          phone_verified_at: profile.phone_verified_at,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error(
      "[SaMi customer profile] Read failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Your profile could not be loaded right now.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await customerFromRequest(request);
  if (auth.error) return auth.error;

  const payload: unknown = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return error("Invalid profile details.");
  }

  const suppliedName = (payload as Record<string, unknown>).fullName;

  if (typeof suppliedName !== "string") {
    return error("Enter your full name.");
  }

  const fullName = suppliedName.trim().replace(/\s+/g, " ");

  if (fullName.length < 2 || fullName.length > 120) {
    return error("Your name must be between 2 and 120 characters.");
  }

  try {
    const result = await query<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
    }>(
      `UPDATE public.users
       SET full_name = $2,
           updated_at = now()
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       RETURNING id, full_name, email, phone`,
      [auth.user.id, fullName],
    );

    const user = result.rows[0];

    if (!user) {
      return error("Your customer profile could not be found.", 404);
    }

    return NextResponse.json({
      ok: true,
      message: "Your profile has been updated.",
      user,
    });
  } catch (cause) {
    console.error(
      "[SaMi customer profile] Update failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Your profile could not be updated right now.", 503);
  }
}