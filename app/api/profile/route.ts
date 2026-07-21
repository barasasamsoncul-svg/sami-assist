import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createClient();

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

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, created_at"
      )
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        {
          error: profileError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error(
      "Profile API Error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to load profile.",
      },
      {
        status: 500,
      }
    );
  }
}