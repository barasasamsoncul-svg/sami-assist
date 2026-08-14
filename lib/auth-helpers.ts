import { NextRequest } from "next/server";
import { cookies } from "next/headers";

// Get user ID from request using session cookie
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    try {
        // Get session cookie from request - await the cookies() function
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");
        
        if (!sessionCookie) {
            // Try to get from Authorization header as fallback
            const authHeader = req.headers.get("authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                // If you use Bearer tokens, decode here
                // const token = authHeader.replace("Bearer ", "");
                // const decoded = await verifyToken(token);
                // return decoded.userId;
            }
            return null;
        }

        // Call the /api/auth/me endpoint to get user info
        const response = await fetch(`${req.nextUrl.origin}/api/auth/me`, {
            headers: {
                Cookie: `session=${sessionCookie.value}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.user?.id || null;
    } catch (error) {
        console.error("Error getting user ID:", error);
        return null;
    }
}

// Get business ID from request
export async function getBusinessIdFromRequest(req: NextRequest): Promise<string | null> {
    try {
        const userId = await getUserIdFromRequest(req);
        if (!userId) {
            return null;
        }

        // You can get business from the session or from a separate endpoint
        // For now, we'll get it from the /api/auth/me endpoint
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session");

        if (!sessionCookie) {
            return null;
        }

        const response = await fetch(`${req.nextUrl.origin}/api/auth/me`, {
            headers: {
                Cookie: `session=${sessionCookie.value}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.user?.businessId || data.business?.id || null;
    } catch (error) {
        console.error("Error getting business ID:", error);
        return null;
    }
}