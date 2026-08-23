import { NextResponse } from "next/server";

import { registerUser } from "@/lib/user-registration";
import { provisionBusiness } from "@/lib/provision-business";
import { normalizeAppKeys } from "@/lib/sami-apps";
import { postgresAdmin } from "@/lib/postgres-admin";

export async function POST(req: Request) {
  let createdUserId: string | null = null;
  
  // ✅ DEBUG COLLECTION
  const debugInfo: any = {
    steps: [],
    errors: [],
    tableCheck: null,
    tableError: null,
    timestamp: new Date().toISOString()
  };

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

    debugInfo.steps.push({ 
      step: "Received registration request", 
      timestamp: new Date().toISOString(),
      details: { email, businessName, appKeys }
    });

    /*
     * -------------------------------------------------------
     * USER VALIDATION
     * -------------------------------------------------------
     */

    if (
      typeof fullName !== "string" ||
      !fullName.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Full name is required.",
          debug: debugInfo
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
          debug: debugInfo
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
          debug: debugInfo
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * BUSINESS VALIDATION
     * -------------------------------------------------------
     */

    if (
      typeof businessName !== "string" ||
      !businessName.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Business name is required.",
          debug: debugInfo
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * APP VALIDATION
     * -------------------------------------------------------
     */

    const selectedApps =
      normalizeAppKeys(appKeys);

    debugInfo.steps.push({ 
      step: "Apps validated", 
      timestamp: new Date().toISOString(),
      details: { selectedApps, count: selectedApps.length }
    });

    if (selectedApps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please select at least one SaMi app.",
          debug: debugInfo
        },
        { status: 400 }
      );
    }

    /*
     * -------------------------------------------------------
     * BUSINESS SLUG
     * -------------------------------------------------------
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
     * -------------------------------------------------------
     * CREATE USER
     * -------------------------------------------------------
     */

    debugInfo.steps.push({ 
      step: "Creating user...", 
      timestamp: new Date().toISOString() 
    });

    const user = await registerUser({
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
    });

    createdUserId = user.userId;

    debugInfo.steps.push({ 
      step: `User created: ${user.userId}`, 
      timestamp: new Date().toISOString(),
      details: { userId: user.userId, email: user.email }
    });

    /*
     * -------------------------------------------------------
     * CREATE BUSINESS + TENANT
     * -------------------------------------------------------
     */

    debugInfo.steps.push({ 
      step: "Provisioning business and tenant...", 
      timestamp: new Date().toISOString() 
    });

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

      debugInfo.steps.push({ 
        step: `Business provisioned: ${business.businessId}`, 
        timestamp: new Date().toISOString(),
        details: {
          businessId: business.businessId,
          businessName: business.businessName,
          databaseName: business.databaseName,
          appKeys: business.appKeys
        }
      });

    } catch (provisionError: any) {
      debugInfo.errors.push({
        step: "Provisioning failed",
        error: provisionError.message || String(provisionError),
        stack: provisionError.stack,
        timestamp: new Date().toISOString()
      });
      throw provisionError;
    }

    /*
     * -------------------------------------------------------
     * VERIFY TABLES WERE INSTALLED
     * -------------------------------------------------------
     */

    debugInfo.steps.push({ 
      step: "Verifying tables were installed...", 
      timestamp: new Date().toISOString() 
    });

    let tableCheckResult = null;
    let tableError = null;

    try {
      const { Client } = require("pg");
      const debugClient = new Client({
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: business.databaseName,
        user: process.env.POSTGRES_ADMIN_USER,
        password: process.env.POSTGRES_ADMIN_PASSWORD,
        ssl: { rejectUnauthorized: false }
      });

      await debugClient.connect();
      
      const tables = await debugClient.query(`
        SELECT 
          table_name
        FROM information_schema.tables t
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tableList = tables.rows.map((r: any) => r.table_name);
      
      tableCheckResult = {
        totalTables: tables.rowCount || 0,
        tables: tableList,
        hasUsers: tableList.includes('users'),
        hasBusinesses: tableList.includes('businesses'),
        hasInvoices: tableList.includes('invoices'),
        hasAccounts: tableList.includes('accounts'),
      };
      
      debugInfo.steps.push({ 
        step: `Table verification complete`, 
        timestamp: new Date().toISOString(),
        details: tableCheckResult
      });
      
      await debugClient.end();
      
    } catch (error: any) {
      tableError = error.message || String(error);
      debugInfo.errors.push({
        step: "Table verification failed",
        error: tableError,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }

    debugInfo.tableCheck = tableCheckResult;
    debugInfo.tableError = tableError;

    /*
     * -------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------
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

        // ✅ DEBUG INFO
        debug: {
          ...debugInfo,
          summary: {
            tablesInstalled: tableCheckResult?.totalTables || 0,
            success: (tableCheckResult?.totalTables || 0) > 0,
            hasCoreTables: tableCheckResult?.hasUsers || false,
            hasBusinessTables: tableCheckResult?.hasBusinesses || false,
          }
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Registration error:",
      error
    );

    debugInfo.errors.push({
      step: "Registration failed (catch block)",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    /*
     * -------------------------------------------------------
     * ROLLBACK USER
     * -------------------------------------------------------
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
          "Registration rollback: removed user",
          createdUserId
        );
        
        debugInfo.steps.push({ 
          step: `Rollback: removed user ${createdUserId}`, 
          timestamp: new Date().toISOString() 
        });
        
      } catch (rollbackError) {
        console.error(
          "Registration rollback failed:",
          rollbackError
        );
        
        debugInfo.errors.push({
          step: "Rollback failed",
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          timestamp: new Date().toISOString()
        });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Registration failed.",
        debug: debugInfo
      },
      { status: 500 }
    );
  }
}