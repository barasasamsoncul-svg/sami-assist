import { NextResponse } from "next/server";

import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/services/provisioning";
import { normalizeAppKeys } from "@/lib/sami-apps";

function generateBusinessSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const fullName = cleanString(body.fullName);
    const email = cleanString(body.email).toLowerCase();
    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const businessName = cleanString(body.businessName);
    const businessSlug = cleanString(body.businessSlug);
    const phone = cleanString(body.phone);

    /*
     * We deliberately normalize the apps here instead of trusting
     * the browser. The server is the final authority.
     */
    const appKeys = normalizeAppKeys(body.appKeys);

    /*
     * -----------------------------------------
     * VALIDATION
     * -----------------------------------------
     */

    if (!fullName) {
      return NextResponse.json(
        {
          success: false,
          error: "Full name is required.",
        },
        { status: 400 }
      );
    }

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

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: "Password must be at least 8 characters.",
        },
        { status: 400 }
      );
    }

    if (!businessName) {
      return NextResponse.json(
        {
          success: false,
          error: "Business name is required.",
        },
        { status: 400 }
      );
    }

    if (appKeys.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please select at least one business app.",
        },
        { status: 400 }
      );
    }

    /*
     * -----------------------------------------
     * BUSINESS SLUG
     * -----------------------------------------
     *
     * The browser may send a slug, but if it does
     * not, we generate one from the business name.
     */
    const slug =
      businessSlug || generateBusinessSlug(businessName);

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: "A valid business name is required.",
        },
        { status: 400 }
      );
    }

    /*
     * -----------------------------------------
     * CREATE USER
     * -----------------------------------------
     */
    const user = await registerUser({
      email,
      password,
      fullName,
    });

    /*
     * -----------------------------------------
     * PROVISION BUSINESS
     * -----------------------------------------
     *
     * provisionBusiness is responsible for the complete
     * business onboarding process:
     *
     * 1. Create business
     * 2. Assign owner
     * 3. Create tenant database
     * 4. Register tenant database
     * 5. Install core schema
     * 6. Install selected app schemas
     * 7. Save enabled apps
     *
     * This is the critical part that prevents a user
     * from being registered without a business.
     */
    const provisioned = await provisionBusiness({
      businessName,
      businessSlug: slug,
      ownerUserId: user.userId,
      email,
      phone,
      appKeys,
    });

    /*
     * -----------------------------------------
     * VERIFY THE PROVISION RESULT
     * -----------------------------------------
     *
     * Do not return success if provisioning did not
     * produce the identifiers required by the system.
     */
    if (!provisioned.businessId) {
      throw new Error(
        "Business provisioning completed without a business ID."
      );
    }

    if (!provisioned.databaseName) {
      throw new Error(
        "Business provisioning completed without a tenant database."
      );
    }

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     */
    return NextResponse.json(
      {
        success: true,

        user: {
          id: user.userId,
          email: user.email,
          fullName: user.fullName,
        },

        business: {
          id: provisioned.businessId,
          name: businessName,
          slug,
          databaseName: provisioned.databaseName,
        },

        appKeys,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER] Registration failed:", error);

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