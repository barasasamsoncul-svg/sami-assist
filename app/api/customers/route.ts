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
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      data: customers,
      error,
    } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Customers fetch error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Failed to load customers",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      customers || []
    );
  } catch (error) {
    console.error(
      "Customers API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const {
      company_name,
      contact_name,
      email,
      phone,
      address,
    } = body;

    if (!company_name?.trim()) {
      return NextResponse.json(
        {
          error:
            "Company name is required",
        },
        { status: 400 }
      );
    }

    const supabase =
      await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const {
      data: customer,
      error,
    } = await supabase
      .from("customers")
      .insert({
        user_id: user.id,
        company_name:
          company_name.trim(),
        contact_name:
          contact_name?.trim() ||
          null,
        email:
          email?.trim() ||
          null,
        phone:
          phone?.trim() ||
          null,
        address:
          address?.trim() ||
          null,
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Customer creation error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Failed to create customer",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      customer,
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Customer API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
      },
      { status: 500 }
    );
  }
}