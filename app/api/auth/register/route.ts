import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/user-registration";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      email,
      password,
      fullName,
    } = body;

    const result = await registerUser({
      email,
      password,
      fullName,
    });

    return NextResponse.json(
      result,
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Registration error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Registration failed.",
      },
      { status: 400 }
    );
  }
}