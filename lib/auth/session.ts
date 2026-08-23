import { queryControl } from '@/lib/db/control';
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
}

export interface SessionBusiness {
  id: string;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
}

// Get current session from cookie
export async function getSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('sami_session')?.value;

  if (!sessionToken) {
    return null;
  }

  const result = await queryControl(
    `SELECT 
      s.id,
      s.user_id,
      s.expires_at,
      u.email,
      u.full_name,
      u.status
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 
       AND s.is_current = true
       AND s.expires_at > NOW()
       AND u.status = 'active'`,
    [sessionToken]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    sessionId: result.rows[0].id,
    user: {
      id: result.rows[0].user_id,
      email: result.rows[0].email,
      fullName: result.rows[0].full_name,
    },
  };
}

// Get current user's businesses
export async function getUserBusinesses(userId: string): Promise<SessionBusiness[]> {
  const result = await queryControl(
    `SELECT 
      b.id,
      b.name,
      b.slug,
      b.logo_url,
      bu.role,
      bu.permissions
     FROM businesses b
     INNER JOIN business_users bu ON bu.business_id = b.id
     WHERE bu.user_id = $1 
       AND bu.status = 'active'
       AND b.status = 'active'
     ORDER BY b.created_at ASC`,
    [userId]
  );

  return result.rows;
}

// Get current user's selected apps for a business
export async function getUserApps(businessId: string): Promise<string[]> {
  const result = await queryControl(
    `SELECT app_key 
     FROM business_apps 
     WHERE business_id = $1 AND enabled = true
     ORDER BY created_at ASC`,
    [businessId]
  );

  return result.rows.map((row: any) => row.app_key);
}