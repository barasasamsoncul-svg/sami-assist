import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { provisionBusiness } from "@/lib/provision-business";

export async function POST(
  request: NextRequest
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const {
      businessName,
      businessSlug,
      email,
      phone,
    } = body;

    if (!businessName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Business name is required.",
        },
        { status: 400 }
      );
    }

    const slug =
      businessSlug ||
      businessName
        .toLowerCase()
        .trim()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          "");

    const result =
      await provisionBusiness({
        businessName,
        businessSlug: slug,
        ownerUserId: user.id,
        email:
          email || user.email,
        phone,
      });

    return NextResponse.json(
      result,
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Business provisioning error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Business provisioning failed.",
      },
      { status: 500 }
    );
  }
}