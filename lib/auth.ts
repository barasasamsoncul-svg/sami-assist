import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

export type Role = "customer" | "provider" | "admin";
export type AppUser = { id: string; full_name: string; email: string; role: Role; phone: string | null };
const COOKIE = "sami_errands_session";
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

function bearerToken(request?: Request): string | null {
  const header = request?.headers.get("authorization") || "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{40,128})$/i.exec(header);
  return match?.[1] ?? null;
}

export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 14 * 86400000);
  await query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)", [userId,tokenHash(raw),expires]);
  const jar = await cookies();
  jar.set(COOKIE,raw,{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",expires});
  return raw;
}

export async function getCurrentUser(request?: Request): Promise<AppUser | null> {
  const jar = await cookies();
  const token = bearerToken(request) || jar.get(COOKIE)?.value;
  if (!token) return null;
  const result = await query<AppUser>(
    "SELECT u.id,u.full_name,u.email,u.role,u.phone FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true LIMIT 1",
    [tokenHash(token)]
  );
  return result.rows[0] ?? null;
}

export async function destroySession(request?: Request) {
  const jar = await cookies();
  const token = bearerToken(request) || jar.get(COOKIE)?.value;
  if (token) await query("DELETE FROM user_sessions WHERE token_hash=$1",[tokenHash(token)]);
  jar.delete(COOKIE);
}
