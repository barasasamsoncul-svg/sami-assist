import { NextResponse } from "next/server";
import { createTenantDatabase } from "@/lib/database-provisioning";

export async function GET() {
  try {
    const result = await createTenantDatabase(
      "sami_tenant_test_001"
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Tenant provisioning test failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}