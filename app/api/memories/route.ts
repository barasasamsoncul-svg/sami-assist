import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**

* GET
* Fetch all memories from the
* currently logged-in user's tenant database.
  */
  export async function GET() {
  try {
  // Get logged-in user from SaMi session
  const user = await getAuthenticatedUser();

  if (!user) {
  return NextResponse.json(
  {
  error: "Unauthorized",
  },
  {
  status: 401,
  }
  );
  }

  // Connect to the user's business tenant database
  const { pool } =
  await getTenantDatabaseForUser(user.id);

  // Fetch memories
  // Tenant isolation means we do not need user_id here.
  const result = await pool.query(
  `    SELECT
       id,
       memory_type,
       content,
       source_type,
       source_id,
       importance,
       created_at,
       updated_at
     FROM ai_memory
     ORDER BY importance DESC, created_at DESC
     `
  );

  return NextResponse.json(result.rows);
  } catch (error) {
  console.error(
  "Memory API GET Error:",
  error
  );

  return NextResponse.json(
  {
  error:
  error instanceof Error
  ? error.message
  : "Internal Server Error",
  },
  {
  status: 500,
  }
  );
  }
  }

/**

* POST
* Create a new permanent memory
* in the currently logged-in user's
* tenant database.
  */
  export async function POST(
  req: Request
  ) {
  try {
  const body = await req.json();

  const {
  memory,
  category = "general",
  importance = 5,
  } = body;

  // Validate memory
  if (
  !memory ||
  typeof memory !== "string" ||
  !memory.trim()
  ) {
  return NextResponse.json(
  {
  error: "Memory is required",
  },
  {
  status: 400,
  }
  );
  }

  // Validate importance
  let safeImportance = Number(importance);

  if (
  Number.isNaN(safeImportance)
  ) {
  safeImportance = 5;
  }

  safeImportance = Math.max(
  1,
  Math.min(
  10,
  safeImportance
  )
  );

  // Get logged-in user from SaMi session
  const user = await getAuthenticatedUser();

  if (!user) {
  return NextResponse.json(
  {
  error: "Unauthorized",
  },
  {
  status: 401,
  }
  );
  }

  // Connect to the user's business tenant database
  const { pool } =
  await getTenantDatabaseForUser(user.id);

  const memoryContent =
  memory.trim();

  const memoryType =
  typeof category === "string" &&
  category.trim()
  ? category.trim()
  : "general";

  // Check if similar memory already exists
  const existingResult =
  await pool.query(
  `      SELECT
         id,
         memory_type,
         content,
         source_type,
         source_id,
         importance,
         created_at,
         updated_at
       FROM ai_memory
       WHERE content = $1
       LIMIT 1
       `,
  [
  memoryContent,
  ]
  );

  // Avoid duplicates
  if (
  (existingResult.rowCount ?? 0) > 0
  ) {
  return NextResponse.json({
  success: true,
  memory:
  existingResult.rows[0],
  message:
  "Memory already exists",
  });
  }

  // Save new memory
  const newMemoryResult =
  await pool.query(
  `      INSERT INTO ai_memory
         (
           memory_type,
           content,
           importance
         )
       VALUES
         ($1, $2, $3)
       RETURNING
         id,
         memory_type,
         content,
         source_type,
         source_id,
         importance,
         created_at,
         updated_at
       `,
  [
  memoryType,
  memoryContent,
  safeImportance,
  ]
  );

  return NextResponse.json(
  {
  success: true,
  memory:
  newMemoryResult.rows[0],
  },
  {
  status: 201,
  }
  );
  } catch (error) {
  console.error(
  "Memory API POST Error:",
  error
  );

  return NextResponse.json(
  {
  error:
  error instanceof Error
  ? error.message
  : "Internal Server Error",
  },
  {
  status: 500,
  }
  );
  }
  }
