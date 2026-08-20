import { NextResponse } from "next/server";
import { loginUser } from "@/lib/user-login";
import { createAuthSession } from "@/lib/auth-session";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "Email and password are required.",
        },
        { status: 400 }
      );
    }

    const result = await loginUser({
      email,
      password,
    });

    if (!result.userId) {
      return NextResponse.json(
        {
          error: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    await createAuthSession({
      userId: result.userId,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.userId,
        email: result.email,
        fullName: result.fullName,
      },
      business: result.businessId
        ? {
            id: result.businessId,
          }
        : null,
      appKeys: result.appKeys ?? [],
    });
  } catch (error) {
    console.error("Login API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during login.",
      },
      { status: 500 }
    );
  }
}