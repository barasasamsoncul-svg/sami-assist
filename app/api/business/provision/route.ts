import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { provisionBusiness } from "@/lib/provision-business";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      businessName,
      businessSlug,
      email,
      phone,
      businessType,
      appKeys,
    } = body;

    if (
      typeof businessName !== "string" ||
      !businessName.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Business name is required.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(appKeys) || appKeys.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please select at least one SaMi app.",
        },
        { status: 400 }
      );
    }

    const slug =
      typeof businessSlug === "string" &&
      businessSlug.trim()
        ? businessSlug.trim()
        : businessName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    const result = await provisionBusiness({
      businessName: businessName.trim(),
      businessSlug: slug,
      ownerUserId: user.id,
      email:
        typeof email === "string" && email.trim()
          ? email.trim()
          : user.email,
      phone:
        typeof phone === "string" && phone.trim()
          ? phone.trim()
          : undefined,
      businessType:
        typeof businessType === "string" &&
        businessType.trim()
          ? businessType.trim()
          : undefined,
      appKeys,
    });

    return NextResponse.json(result, {
      status: 201,
    });
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