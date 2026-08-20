import { NextResponse } from "next/server";
import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/provision-business";
import { normalizeAppKeys } from "@/lib/sami-apps";
import { postgresAdmin } from "@/lib/postgres-admin";

async function deleteRegisteredUser(
  userId: string
): Promise<void> {
  await postgresAdmin.query(
    `
      DELETE FROM users
      WHERE id = $1
    `,
    [userId]
  );
}

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
      businessType,
      appKeys,
    } = body;

    /*
     * ---------------------------------------------------------
     * VALIDATION
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
          error:
            "Password must be at least 8 characters.",
        },
        { status: 400 }
      );
    }

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
     * APPLICATION SELECTION
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
     * BUSINESS SLUG
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

    if (!generatedSlug) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to generate a business identifier.",
        },
        { status: 400 }
      );
    }

    /*
     * ---------------------------------------------------------
     * CREATE USER
     * ---------------------------------------------------------
     *
     * At this point the input has passed validation.
     */

    const user = await registerUser({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
    });

    /*
     * ---------------------------------------------------------
     * PROVISION BUSINESS
     * ---------------------------------------------------------
     *
     * If anything fails here, the user must also be removed.
     *
     * provisionBusiness() is responsible for cleaning up:
     *   - business
     *   - business_users
     *   - enabled apps
     *   - tenant database
     *   - database registry
     *
     * This route is responsible for cleaning up:
     *   - user
     */

    let business;

    try {
      business = await provisionBusiness({
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
    } catch (error) {
      /*
       * Business provisioning failed.
       *
       * Remove the user so failed registration does not
       * leave an orphan account in sami_control.users.
       */

      try {
        await deleteRegisteredUser(
          user.userId
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean up registered user:",
          cleanupError
        );
      }

      throw error;
    }

    /*
     * ---------------------------------------------------------
     * SUCCESS
     * ---------------------------------------------------------
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
          id: business.businessId,
          name: business.businessName,
          slug: business.businessSlug,
          type: business.businessType,
          databaseId: business.databaseId,
          databaseName: business.databaseName,
          databaseHost: business.databaseHost,
          databasePort: business.databasePort,
          databaseUser: business.databaseUser,
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