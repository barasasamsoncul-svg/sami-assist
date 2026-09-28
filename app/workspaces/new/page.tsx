import {
  redirect,
} from 'next/navigation';

import {
  getSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';

import NewWorkspaceClient from './NewWorkspaceClient';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function NewWorkspacePage() {
  const session =
    await getSession();

  if (
    !session
  ) {
    redirect(
      '/login?next=%2Fworkspaces%2Fnew',
    );
  }

  const recoverable =
    await queryControl(
      `
        SELECT
          t.id::text AS id,
          t.name,
          t.updated_at
        FROM tenants t
        INNER JOIN tenant_users tu
          ON tu.tenant_id =
             t.id
        WHERE tu.user_id = $1
          AND tu.is_owner =
              TRUE
          AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) =
              'active'
          AND tu.deleted_at
              IS NULL
          AND t.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) =
              'provisioning_failed'
        ORDER BY
          t.updated_at DESC,
          t.created_at DESC
        LIMIT 5
      `,
      [
        session.user.id,
      ],
    );

  return (
    <NewWorkspaceClient
      recoverableWorkspaces={
        recoverable.rows.map(
          row => ({
            id:
              String(
                row.id,
              ),
            name:
              String(
                row.name ||
                'Workspace',
              ),
          }),
        )
      }
      account={{
        email:
          session.user
            .email,
        firstName:
          session.user
            .firstName,
        lastName:
          session.user
            .lastName,
      }}
    />
  );
}
