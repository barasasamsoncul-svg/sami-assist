import { NextResponse } from "next/server";
import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/provision-business";
import { saveEnabledApps } from "@/lib/enabled-apps";
import { normalizeAppKeys } from "@/lib/sami-apps";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      fullName,
      email,
      password,
      businessName,
      businessSlug,
      phone,
      appKeys,
    } = body;

    if (!fullName?.trim()) {
      return NextResponse.json(
        { success: false, error: "Full name is required." },
        { status: 400 }
      );
    }

    if (!email?.trim()) {
      return NextResponse.json(
        { success: false, error: "Email is required." },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required." },
        { status: 400 }
      );
    }

    if (!businessName?.trim()) {
      return NextResponse.json(
        { success: false, error: "Business name is required." },
        { status: 400 }
      );
    }

    const selectedApps = normalizeAppKeys(appKeys);

    if (selectedApps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please select at least one app.",
        },
        { status: 400 }
      );
    }

    const generatedSlug =
      businessSlug?.trim() ||
      businessName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);

    const user = await registerUser({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
    });

    const result = await provisionBusiness({
      businessName: businessName.trim(),
      businessSlug: generatedSlug,
      ownerUserId: user.userId,
      email: email.trim(),
      phone: phone?.trim() || "",
      appKeys: [],
    });

    await saveEnabledApps(
      result.businessId,
      selectedApps
    );

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
          name: businessName.trim(),
          databaseName: result.databaseName,
        },
        appKeys: selectedApps,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Registration failed.",
      },
      { status: 500 }
    );
  }
}
