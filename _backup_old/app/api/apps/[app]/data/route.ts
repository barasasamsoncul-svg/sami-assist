import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";
import { getEnabledAppsForUser } from "@/lib/enabled-apps";
import { APP_SCHEMA_TABLES } from "@/lib/app-schema-map";

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function isSafeName(value: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

async function getContext(app: string) {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("__UNAUTHORIZED__");

  const allowed = APP_SCHEMA_TABLES[app];
  if (!allowed) throw new Error("__APP_NOT_FOUND__");

  const enabled = await getEnabledAppsForUser(user.id);
  if (!enabled.appKeys.includes(app)) throw new Error("__APP_DISABLED__");

  const tenant = await getTenantDatabaseForUser(user.id);
  return { user, tenant, allowed };
}

async function getMetadata(pool: any, allowed: string[]) {
  const columns = await pool.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [allowed],
  );

  const primaryKeys = await pool.query(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
     WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'
       AND tc.table_name = ANY($1::text[])
     ORDER BY tc.table_name, kcu.ordinal_position`,
    [allowed],
  );

  const relationships = await pool.query(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
     WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
       AND tc.table_name = ANY($1::text[])`,
    [allowed],
  );

  const meta = allowed.map((table) => ({
    table,
    columns: columns.rows.filter((x: any) => x.table_name === table),
    primaryKey: primaryKeys.rows.find((x: any) => x.table_name === table)?.column_name || "id",
    relationships: relationships.rows.filter((x: any) => x.table_name === table),
  }));

  return meta;
}

export async function GET(req: Request, { params }: { params: Promise<{ app: string }> }) {
  try {
    const { app } = await params;
    const { tenant, allowed } = await getContext(app);
    const url = new URL(req.url);
    const requestedTable = url.searchParams.get("table") || allowed[0];
    const table = requestedTable;
    if (!allowed.includes(table) || !isSafeName(table)) {
      return NextResponse.json({ error: "Table is not available in this module." }, { status: 400 });
    }

    const limitRaw = Number(url.searchParams.get("limit") || 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 100);
    const search = (url.searchParams.get("search") || "").trim();
    const metadata = await getMetadata(tenant.pool, allowed);
    const tableMeta = metadata.find((x: any) => x.table === table)!;

    const searchable = tableMeta.columns
      .filter((c: any) => ["text", "character varying", "character", "uuid"].includes(c.data_type))
      .map((c: any) => c.column_name)
      .filter(isSafeName);

    const paramsList: unknown[] = [];
    let where = "";
    if (search && searchable.length) {
      paramsList.push(`%${search}%`);
      const n = paramsList.length;
      where = `WHERE ${searchable.map((c: string) => `CAST(${quoteIdentifier(c)} AS TEXT) ILIKE $${n}`).join(" OR ")}`;
    }

    const result = await tenant.pool.query(
      `SELECT * FROM ${quoteIdentifier(table)} ${where} ORDER BY 1 DESC LIMIT ${limit}`,
      paramsList,
    );

    return NextResponse.json({
      app,
      table,
      tables: metadata.map((x: any) => ({ table: x.table, columns: x.columns, primaryKey: x.primaryKey, relationships: x.relationships })),
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load module data.";
    if (message === "__UNAUTHORIZED__") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "__APP_NOT_FOUND__") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (message === "__APP_DISABLED__") return NextResponse.json({ error: "This module is not enabled for this business." }, { status: 403 });
    console.error("Module GET error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ app: string }> }) {
  try {
    const { app } = await params;
    const { tenant, allowed } = await getContext(app);
    const body = await req.json();
    const table = String(body.table || "");
    const values = body.values && typeof body.values === "object" ? body.values : {};
    if (!allowed.includes(table) || !isSafeName(table)) return NextResponse.json({ error: "Table is not available in this module." }, { status: 400 });

    const meta = await getMetadata(tenant.pool, allowed);
    const tableMeta = meta.find((x: any) => x.table === table)!;
    const columns = new Set(tableMeta.columns.map((x: any) => x.column_name));
    const entries = Object.entries(values).filter(([key]) => columns.has(key) && isSafeName(key));
    if (!entries.length) return NextResponse.json({ error: "No valid fields supplied." }, { status: 400 });

    const names = entries.map(([key]) => quoteIdentifier(key)).join(", ");
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
    const result = await tenant.pool.query(
      `INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${placeholders}) RETURNING *`,
      entries.map(([, value]) => value),
    );
    return NextResponse.json({ row: result.rows[0], rowCount: result.rowCount }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create record.";
    if (message === "__UNAUTHORIZED__") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "__APP_NOT_FOUND__") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (message === "__APP_DISABLED__") return NextResponse.json({ error: "This module is not enabled for this business." }, { status: 403 });
    console.error("Module POST error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ app: string }> }) {
  try {
    const { app } = await params;
    const { tenant, allowed } = await getContext(app);
    const body = await req.json();
    const table = String(body.table || "");
    const values = body.values && typeof body.values === "object" ? body.values : {};
    const primaryKey = String(body.primaryKey || "id");
    const id = body.id;
    if (!allowed.includes(table) || !isSafeName(table)) return NextResponse.json({ error: "Table is not available in this module." }, { status: 400 });
    if (!isSafeName(primaryKey) || id === undefined || id === null || id === "") return NextResponse.json({ error: "A record identifier is required." }, { status: 400 });

    const meta = await getMetadata(tenant.pool, allowed);
    const tableMeta = meta.find((x: any) => x.table === table)!;
    const columns = new Set(tableMeta.columns.map((x: any) => x.column_name));
    if (!columns.has(primaryKey)) return NextResponse.json({ error: "Invalid primary key." }, { status: 400 });

    const entries = Object.entries(values).filter(([key]) => key !== primaryKey && columns.has(key) && isSafeName(key));
    if (!entries.length) return NextResponse.json({ error: "No valid fields supplied." }, { status: 400 });
    const assignments = entries.map(([key], i) => `${quoteIdentifier(key)}=$${i + 1}`).join(", ");
    const result = await tenant.pool.query(
      `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${quoteIdentifier(primaryKey)}=$${entries.length + 1} RETURNING *`,
      [...entries.map(([, value]) => value), id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ row: result.rows[0], rowCount: result.rowCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update record.";
    if (message === "__UNAUTHORIZED__") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "__APP_NOT_FOUND__") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (message === "__APP_DISABLED__") return NextResponse.json({ error: "This module is not enabled for this business." }, { status: 403 });
    console.error("Module PATCH error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
