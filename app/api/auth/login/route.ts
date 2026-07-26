import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/user-login";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      email,
      password,
    } = body;

    const result = await loginUser({
      email,
      password,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: result.user,
        expiresAt: result.expiresAt,
      },
      { status: 200 }
    );

    response.cookies.set(
      "sami_session",
      result.sessionToken,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: result.expiresAt,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Login failed.",
      },
      { status: 401 }
    );
  }
}