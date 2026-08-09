import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { postgresAdmin } from "@/lib/postgres-admin";
import bcrypt from "bcryptjs";

export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const body = await req.json();
    const updates: string[] = [];
    const values: any[] = [];

    // Update full name
    if (body.fullName !== undefined) {
      updates.push(`full_name = $${values.length + 1}`);
      values.push(body.fullName.trim());
    }

    // Update email
    if (body.email !== undefined) {
      const newEmail = body.email.trim().toLowerCase();
      
      // Check if email is already in use by another user
      const existing = await postgresAdmin.query(
        `SELECT id FROM users WHERE email = $1 AND id != $2`,
        [newEmail, user.id]
      );
      
      if (existing.rowCount && existing.rowCount > 0) {
        return NextResponse.json({ success: false, error: "Email is already in use." }, { status: 409 });
      }
      
      updates.push(`email = $${values.length + 1}`);
      values.push(newEmail);
    }

    // Update password
    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ success: false, error: "Current password is required to change password." }, { status: 400 });
      }
      
      if (body.newPassword !== body.confirmPassword) {
        return NextResponse.json({ success: false, error: "Passwords do not match." }, { status: 400 });
      }
      
      if (body.newPassword.length < 8) {
        return NextResponse.json({ success: false, error: "Password must be at least 8 characters." }, { status: 400 });
      }

      // Verify current password
      const result = await postgresAdmin.query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [user.id]
      );
      
      const isValid = await bcrypt.compare(body.currentPassword, result.rows[0].password_hash);
      if (!isValid) {
        return NextResponse.json({ success: false, error: "Current password is incorrect." }, { status: 401 });
      }

      const newHash = await bcrypt.hash(body.newPassword, 12);
      updates.push(`password_hash = $${values.length + 1}`);
      values.push(newHash);
    }

    // Update two-factor authentication
    if (body.twoFactorEnabled !== undefined) {
      updates.push(`two_factor_enabled = $${values.length + 1}`);
      values.push(body.twoFactorEnabled);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update." }, { status: 400 });
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);

    // Execute update
    values.push(user.id);
    await postgresAdmin.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    // Get updated user
    const result = await postgresAdmin.query(
      `SELECT 
         id, 
         email, 
         full_name, 
         two_factor_enabled, 
         email_verified, 
         created_at, 
         last_login_at,
         updated_at
       FROM users 
       WHERE id = $1`,
      [user.id]
    );

    return NextResponse.json({ 
      success: true, 
      user: result.rows[0],
      message: "Account updated successfully."
    });
  } catch (error) {
    console.error("Account PATCH error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to update account." }, { status: 500 });
  }
}