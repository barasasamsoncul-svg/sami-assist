import { NextResponse } from "next/server";
import { loginUser } from "@/lib/user-login";
import { createAuthSession } from "@/lib/auth-session";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email is required.",
        },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: "Password is required.",
        },
        { status: 400 }
      );
    }

    const result = await loginUser({
      email,
      password,
    });

    /*
     * The auth session belongs to the authenticated user.
     * createAuthSession expects the user ID directly.
     */
    await createAuthSession(result.userId);

    return NextResponse.json(
      {
        success: true,

        user: {
          id: result.userId,
          email: result.email,
          fullName: result.fullName,
        },

        business: {
          id: result.businessId,
          name: result.businessName,
          slug: result.businessSlug,
        },

        appKeys: result.appKeys,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Login failed.";

    const status =
      message === "Invalid email or password."
        ? 401
        : 400;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}