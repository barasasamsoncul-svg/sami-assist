import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const backupRoot = path.join(root, '.sami-backups', `foundation-hardening-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function fail(message) {
  throw new Error(`[SaMi foundation hardening] ${message}`);
}

function file(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fail(`Required file not found: ${rel}`);
  return full;
}

function backup(rel) {
  const src = file(rel);
  const dst = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

const originalEolByFile = new Map();

function read(rel) {
  const raw = fs.readFileSync(file(rel), 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  originalEolByFile.set(rel, eol);

  /*
   * Windows projects commonly use CRLF while the audited patch markers
   * are intentionally stored with LF. Normalize only in memory so marker
   * matching is stable, then restore the file's original EOL on write.
   */
  return raw.replace(/\r\n/g, '\n');
}

function write(rel, content) {
  const eol = originalEolByFile.get(rel) || '\n';
  const output = eol === '\r\n'
    ? content.replace(/(?<!\r)\n/g, '\r\n')
    : content;

  fs.writeFileSync(file(rel), output, 'utf8');
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) fail(`Expected marker not found for ${label}. Your local file differs from the audited version; nothing was partially guessed.`);
  if (source.indexOf(search, first + search.length) >= 0) fail(`Marker for ${label} is not unique; refusing an ambiguous patch.`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function insertOnce(source, marker, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  return replaceOnce(source, marker, `${marker}${insertion}`, label);
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function patchWorkspaceRoute() {
  const rel = 'app/api/workspace/route.ts';
  backup(rel);
  let s = read(rel);

  s = insertOnce(
    s,
    `import {
  getAccountContextForUser,
  listAccessibleWorkspaces,
} from '@/lib/auth/account-context';
`,
    `
import {
  getPermissionContext,
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';
`,
    'workspace permission imports',
  );

  if (!s.includes('canViewWorkspaceSettings: boolean;')) {
    s = replaceOnce(
      s,
      `type WorkspaceIdentity = {
  sessionId: string;
  tenantId: string;
  userId: string;

  isOwner: boolean;
  isAdmin: boolean;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';
};`,
      `type WorkspaceIdentity = {
  sessionId: string;
  tenantId: string;
  userId: string;

  isOwner: boolean;
  isAdmin: boolean;

  /*
   * Category 8 is the canonical authority for ordinary workspace
   * administration. The Admin label remains compatibility metadata
   * only and no longer grants workspace settings access by itself.
   */
  canViewWorkspaceSettings: boolean;
  canManageWorkspace: boolean;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';
};`,
      'WorkspaceIdentity permission fields',
    );
  }

  const oldBuild = `function buildWorkspaceAccess(
  identity:
    WorkspaceIdentity,

  policy:
    WorkspaceManagementPolicy,
): WorkspaceAccess {
  const adminCanView =
    identity.isAdmin &&
    policy
      .adminsCanViewWorkspaceSettings;


  const adminCanEdit =
    adminCanView &&
    policy
      .adminsCanEditWorkspaceDetails;


  return {
    isOwner:
      identity.isOwner,

    isAdmin:
      identity.isAdmin,

    canViewWorkspaceSettings:
      identity.isOwner ||
      adminCanView,

    canManageWorkspace:
      identity.isOwner ||
      adminCanEdit,

    canManageWorkspaceAccess:
      identity.isOwner,

    canManageLifecycle:
      identity.isOwner,

    canTransferOwnership:
      identity.isOwner,
  };
}`;

  const newBuild = `function buildWorkspaceAccess(
  identity:
    WorkspaceIdentity,

  policy:
    WorkspaceManagementPolicy,
): WorkspaceAccess {
  /*
   * Legacy workspaceManagement flags are retained in storage for a
   * non-breaking migration, but they no longer authorize anything.
   * Category 8 permissions are the sole ordinary-management source.
   */
  void policy;


  return {
    isOwner:
      identity.isOwner,

    isAdmin:
      identity.isAdmin,

    canViewWorkspaceSettings:
      identity.isOwner ||
      identity.canViewWorkspaceSettings,

    canManageWorkspace:
      identity.isOwner ||
      identity.canManageWorkspace,

    /*
     * The old owner-controlled "allow Admins" switch is retired.
     * Roles & Permissions now controls delegated management.
     */
    canManageWorkspaceAccess:
      false,

    canManageLifecycle:
      identity.isOwner,

    canTransferOwnership:
      identity.isOwner,
  };
}`;

  if (!s.includes('Legacy workspaceManagement flags are retained in storage')) {
    s = replaceOnce(s, oldBuild, newBuild, 'workspace access builder');
  }

  const beforeReturn = `  return {
    sessionId:
      session.sessionId,`;
  const permissionInsert = `  const permissionContext =
    await getPermissionContext();


  if (
    permissionContext.userId !==
      session.user.id ||
    permissionContext.tenantId !==
      context.tenant.id
  ) {
    throw new WorkspaceApiError(
      403,
      'WORKSPACE_CONTEXT_MISMATCH',
      'The workspace authorization context is no longer valid.',
    );
  }


  const canViewWorkspaceSettings =
    permissionContext.isOwner ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_VIEW,
    ) ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_MANAGE,
    );


  const canManageWorkspace =
    permissionContext.isOwner ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_MANAGE,
    );


`;
  if (!s.includes(permissionInsert.trim())) {
    s = replaceOnce(s, beforeReturn, `${permissionInsert}${beforeReturn}`, 'workspace permission resolution');
  }

  if (!s.includes(`    canViewWorkspaceSettings,

    canManageWorkspace,`)) {
    s = replaceOnce(
      s,
      `    isAdmin:
      context.membership
        .isAdmin ===
      true,

    accessLevel:
      context.membership
        .accessLevel,`,
      `    isAdmin:
      context.membership
        .isAdmin ===
      true,

    canViewWorkspaceSettings,

    canManageWorkspace,

    accessLevel:
      context.membership
        .accessLevel,`,
      'workspace identity permission values',
    );
  }

  const legacyMarker = `    const hasManagement =
      hasOwn(
        body,
        'workspaceManagement',
      );
`;
  const rejection = `

    if (
      hasManagement
    ) {
      throw new WorkspaceApiError(
        409,
        'WORKSPACE_MANAGEMENT_POLICY_RETIRED',
        'Workspace management access is now controlled by Roles & Permissions.',
      );
    }
`;
  s = insertOnce(s, legacyMarker, rejection, 'legacy workspace management rejection');

  write(rel, s);
  return { rel, lines: s.split('\n').length, hash: sha256(s) };
}

function patchRolePermissions() {
  const rel = 'lib/services/role-permissions.ts';
  backup(rel);
  let s = read(rel);

  const activeCheck = `    AND LOWER(
      COALESCE(
        p.status,
        'active'
      )
    ) = 'active'`;
  const hardenedCheck = `${activeCheck}

    /* SaMi AI is a subscription-entitled core capability, not a role grant. */
    AND LOWER(p.key) NOT IN ('ai.use', 'ai.manage')`;

  if (!s.includes("LOWER(p.key) NOT IN ('ai.use', 'ai.manage')")) {
    s = replaceOnce(
      s,
      activeCheck,
      hardenedCheck,
      'AI exclusion from the role permission catalog',
    );
  }

  const resolverMarker = `  if (
    requestedKeys.length ===
      0
  ) {
    return [];
  }
`;
  const resolverGuard = `

  const deprecatedCoreAiPermissions =
    requestedKeys.filter(
      key =>
        key === 'ai.use' ||
        key === 'ai.manage',
    );


  if (
    deprecatedCoreAiPermissions.length >
      0
  ) {
    throw new RolePermissionServiceError(
      'PERMISSION_UNAVAILABLE',
      'SaMi AI access is controlled by workspace subscription entitlement and cannot be assigned through roles.',
    );
  }
`;

  if (!s.includes('deprecatedCoreAiPermissions')) {
    s = insertOnce(
      s,
      resolverMarker,
      resolverGuard,
      'AI role-mutation rejection',
    );
  }

  write(rel, s);
  return { rel, lines: s.split('\n').length, hash: sha256(s) };
}

function patchLegacyInvitationPost() {
  const rel = 'app/api/workspace/invitations/route.ts';
  backup(rel);
  let s = read(rel);

  const postMarker = `export async function POST(
  request:
    NextRequest,
) {
`;

  const patchMarker = `export async function PATCH(`;

  const postStart = s.indexOf(postMarker);
  if (postStart < 0) {
    fail('Expected legacy invitation POST entry point was not found.');
  }

  const patchStart = s.indexOf(patchMarker, postStart + postMarker.length);
  if (patchStart < 0) {
    fail('Expected invitation PATCH entry point after POST was not found.');
  }

  if (s.indexOf(postMarker, postStart + postMarker.length) >= 0 &&
      s.indexOf(postMarker, postStart + postMarker.length) < patchStart) {
    fail('More than one invitation POST entry point exists before PATCH; refusing an ambiguous patch.');
  }

  let prefix = s.slice(0, postStart);
  let postSection = s.slice(postStart, patchStart);
  let suffix = s.slice(patchStart);

  const guard = `  /*
   * Compatibility entry point only.
   *
   * 307 preserves method and request body while routing ALL invitation
   * creation through the canonical Role → Apps → Companies endpoint.
   * The original implementation remains below intentionally so this
   * hardening release does not delete working lifecycle code.
   */
  return NextResponse.redirect(
    new URL(
      '/api/workspace/invitations/create-with-access',
      request.url,
    ),
    307,
  );

`;

  if (!postSection.includes("'/api/workspace/invitations/create-with-access'")) {
    postSection = replaceOnce(
      postSection,
      postMarker,
      postMarker + guard,
      'legacy invitation POST redirect inside POST block',
    );
  }

  /*
   * Scope the compatibility typing repair to POST only. Other functions in
   * this 1,000+ line route legitimately use Record<string, unknown>, so a
   * global uniqueness check would be incorrect on Windows or LF checkouts.
   */
  const typedBodyPattern = /let\s+body\s*:\s*\{\s*email\?\s*:\s*string\s*;/;

  if (!typedBodyPattern.test(postSection)) {
    const declarationPattern = /let\s+body\s*:\s*Record\s*<\s*string\s*,\s*(?:unknown|any)\s*>\s*;/g;
    const declarationMatches = [...postSection.matchAll(declarationPattern)];

    if (declarationMatches.length !== 1) {
      fail(`Expected exactly one legacy invitation POST request body declaration inside the POST block, found ${declarationMatches.length}.`);
    }

    const match = declarationMatches[0];
    const indentation = postSection.slice(0, match.index).split('\n').pop().match(/^\s*/)?.[0] || '';
    const formatted = [
      'let body: {',
      `${indentation}  email?: string;`,
      `${indentation}  memberType?: unknown;`,
      `${indentation}  roleIds?: unknown;`,
      `${indentation}  companyIds?: unknown;`,
      `${indentation}  defaultCompanyId?: string | null;`,
      `${indentation}  message?: string | null;`,
      `${indentation}  expiresInDays?: number;`,
      `${indentation}};`,
    ].join('\n');

    postSection =
      postSection.slice(0, match.index) +
      formatted +
      postSection.slice(match.index + match[0].length);
  }

  if (!postSection.includes('parsed as typeof body')) {
    const castPattern = /body\s*=\s*parsed\s+as\s+Record\s*<\s*string\s*,\s*(?:unknown|any)\s*>\s*;/g;
    const castMatches = [...postSection.matchAll(castPattern)];

    if (castMatches.length !== 1) {
      fail(`Expected exactly one legacy invitation POST request body cast inside the POST block, found ${castMatches.length}.`);
    }

    const match = castMatches[0];
    const indentation = postSection.slice(0, match.index).split('\n').pop().match(/^\s*/)?.[0] || '';
    const replacement = `body =\n${indentation}  parsed as typeof body;`;

    postSection =
      postSection.slice(0, match.index) +
      replacement +
      postSection.slice(match.index + match[0].length);
  }


  s = prefix + postSection + suffix;

  write(rel, s);
  return { rel, lines: s.split('\n').length, hash: sha256(s) };
}

function main() {
  for (const rel of [
    'app/api/workspace/route.ts',
    'lib/services/role-permissions.ts',
    'app/api/workspace/invitations/route.ts',
  ]) file(rel);

  fs.mkdirSync(backupRoot, { recursive: true });

  const results = [
    patchWorkspaceRoute(),
    patchRolePermissions(),
    patchLegacyInvitationPost(),
  ];

  console.log('\n[SaMi] Foundation hardening patches applied safely.');
  console.log(`[SaMi] Backups: ${backupRoot}`);
  for (const result of results) {
    console.log(`  ✓ ${result.rel} — ${result.lines} lines — sha256:${result.hash}`);
  }
  console.log('\n[SaMi] Next: run npm run build, then the regression tests included in this package.');
}

main();
