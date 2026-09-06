import { NextRequest } from 'next/server';
import { queryControl } from '@/lib/db/control';

type AuthEventInput = {
  request: NextRequest;
  userId?: string | null;
  tenantId?: string | null;
  eventType: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

export function getClientUserAgent(
  request: NextRequest
): string | null {
  return request.headers.get('user-agent') || null;
}

export async function recordAuthEvent(
  input: AuthEventInput
): Promise<void> {
  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.tenantId || null,
        input.userId || null,
        input.eventType,
        input.entityType || 'auth',
        input.entityId || null,
        getClientIp(input.request),
        getClientUserAgent(input.request),
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record auth event:',
      error
    );
  }
}

export async function recordLoginHistory(input: {
  request: NextRequest;
  userId?: string | null;
  sessionId?: string | null;
  successful: boolean;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await queryControl(
      `
        INSERT INTO login_history (
          user_id,
          session_id,
          ip_address,
          user_agent,
          successful,
          failure_reason,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.userId || null,
        input.sessionId || null,
        getClientIp(input.request),
        getClientUserAgent(input.request),
        input.successful,
        input.failureReason || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record login history:',
      error
    );
  }
}