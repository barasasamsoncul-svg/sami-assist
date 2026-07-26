import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/provision-business";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      email,
      password,
      fullName,
      businessName,
      businessSlug,
      phone,
    } = body;

    if (!businessName) {
      return NextResponse.json(
        {
          success: false,
          error: "Business name is required.",
        },
        { status: 400 }
      );
    }

    const user = await registerUser({
      email,
      password,
      fullName,
    });

    const result = await provisionBusiness({
      businessName,
      businessSlug,
      ownerUserId: user.userId,
      email,
      phone,
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.userId,
          email: user.email,
          fullName: user.fullName,
        },
        business: {
          id: result.businessId,
          name: businessName,
          databaseName: result.databaseName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Registration and provisioning error:",
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