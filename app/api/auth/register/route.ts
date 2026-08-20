import { NextResponse } from "next/server";
import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/provision-business";
import { normalizeAppKeys } from "@/lib/sami-apps";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function POST(req: Request) {
  let createdUserId: string | null = null;

  try {
    const body = await req.json();

    const {
      fullName,
      email,
      password,
      businessName,
      businessSlug,
      phone,
      businessType,
      appKeys,
    } = body;

    /*
     * ---------------------------------------------------------
     * Validate user information
     * ---------------------------------------------------------
     */

    if (
      typeof fullName !== "string" ||
      !fullName.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Full name is required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof email !== "string" ||
      !email.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Email is required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Password must be at least 8 characters.",
        },
        { status: 400 }
      );
    }

    /*
     * ---------------------------------------------------------
     * Validate business information
     * ---------------------------------------------------------
     */

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

    /*
     * ---------------------------------------------------------
     * Validate selected apps
     * ---------------------------------------------------------
     */

    const selectedApps =
      normalizeAppKeys(appKeys);

    if (selectedApps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please select at least one SaMi app.",
        },
        { status: 400 }
      );
    }

    /*
     * ---------------------------------------------------------
     * Generate business slug
     * ---------------------------------------------------------
     */

    const generatedSlug =
      typeof businessSlug === "string" &&
      businessSlug.trim()
        ? businessSlug.trim()
        : businessName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);

    /*
     * ---------------------------------------------------------
     * CREATE USER
     * ---------------------------------------------------------
     */

    const user = await registerUser({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
    });

    createdUserId = user.userId;

    /*
     * ---------------------------------------------------------
     * CREATE BUSINESS + TENANT DATABASE
     * ---------------------------------------------------------
     *
     * If anything fails inside provisionBusiness(),
     * it removes the business.
     *
     * If it fails here, the catch block below also
     * removes the newly-created user.
     */

    const business =
      await provisionBusiness({
        businessName: businessName.trim(),
        businessSlug: generatedSlug,
        ownerUserId: user.userId,
        email: email.trim().toLowerCase(),
        phone:
          typeof phone === "string"
            ? phone.trim()
            : undefined,
        businessType:
          typeof businessType === "string" &&
          businessType.trim()
            ? businessType.trim()
            : undefined,
        appKeys: selectedApps,
      });

    /*
     * ---------------------------------------------------------
     * EVERYTHING SUCCEEDED
     * ---------------------------------------------------------
     */

    createdUserId = null;

    return NextResponse.json(
      {
        success: true,

        user: {
          id: user.userId,
          email: user.email,
          fullName: user.fullName,
        },

        business: {
          id: business.businessId,
          name: business.businessName,
          slug: business.businessSlug,
          databaseName: business.databaseName,
        },

        appKeys: selectedApps,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Registration error:",
      error
    );

    /*
     * ---------------------------------------------------------
     * ROLLBACK USER
     * ---------------------------------------------------------
     *
     * If the user was created but business/tenant
     * provisioning failed, remove the user.
     *
     * This prevents half-created accounts.
     */

    if (createdUserId) {
      try {
        await postgresAdmin.query(
          `
            DELETE FROM users
            WHERE id = $1
          `,
          [createdUserId]
        );

        console.log(
          "Rolled back user:",
          createdUserId
        );
      } catch (rollbackError) {
        console.error(
          "Failed to rollback user:",
          rollbackError
        );
      }
    }

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