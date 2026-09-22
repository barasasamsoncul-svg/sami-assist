import 'server-only';

import {
  createWorkspaceNotification,
} from '@/lib/services/workspace-notifications';

export async function notifyCriticalSecurityEvent(
  input: {
    tenantId:
      string | null | undefined;
    userId:
      string;
    eventKey:
      string;
    title:
      string;
    message:
      string;
    dedupeKey:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  if (
    !input.tenantId
  ) {
    return {
      delivered:
        false,
      reason:
        'NO_WORKSPACE',
    };
  }

  try {
    await createWorkspaceNotification({
      tenantId:
        input.tenantId,
      recipientUserId:
        input.userId,
      companyId:
        null,
      type:
        input.eventKey,
      eventKey:
        input.eventKey,
      priority:
        'urgent',
      title:
        input.title,
      message:
        input.message,
      href:
        '/settings?tab=account',
      sourceModule:
        'core.security',
      sourceModel:
        'user',
      sourceRecordId:
        input.userId,
      dedupeKey:
        input.dedupeKey,
      metadata:
        input.metadata ||
        {},
      forceEmail:
        true,
      forceSms:
        true,
      critical:
        true,
    });

    return {
      delivered:
        true,
      reason:
        null,
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi Security] Critical user notification failed:',
      {
        eventKey:
          input.eventKey,
        userId:
          input.userId,
        error,
      },
    );

    return {
      delivered:
        false,
      reason:
        'DELIVERY_FAILED',
    };
  }
}
