import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function DELETE(
  req: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Customer ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      await createClient();

    // ==========================================
    // GET CURRENT LOGGED-IN USER
    // ==========================================

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

    // ==========================================
    // DELETE CUSTOMER
    // Only the owner can delete their customer
    // ==========================================

    const {
      error: deleteError,
    } = await supabase
      .from("customers")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error(
        "Customer deletion error:",
        deleteError
      );

      return NextResponse.json(
        {
          error:
            "Failed to delete customer",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Customer deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete customer API error:",
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