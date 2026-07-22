import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * GET
 * Fetch all memories belonging to the
 * currently logged-in user.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Get logged-in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // Fetch user's memories
    const {
      data: memories,
      error,
    } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .order("importance", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Fetch Memories Error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Failed to fetch memories",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      memories || []
    );
  } catch (error) {
    console.error(
      "Memory API GET Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
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
 * for the currently logged-in user.
 */
export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

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
          error:
            "Memory is required",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      await createClient();

    // Get logged-in user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // Check if similar memory already exists
    const {
      data: existingMemory,
    } = await supabase
      .from("memories")
      .select("id, memory")
      .eq("user_id", user.id)
      .eq(
        "memory",
        memory.trim()
      )
      .maybeSingle();

    // Avoid duplicates
    if (existingMemory) {
      return NextResponse.json({
        success: true,
        memory:
          existingMemory,
        message:
          "Memory already exists",
      });
    }

    // Save memory
    const {
      data: newMemory,
      error,
    } = await supabase
      .from("memories")
      .insert({
        user_id: user.id,
        memory:
          memory.trim(),
        category,
        importance,
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Create Memory Error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Failed to create memory",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        memory: newMemory,
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
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}