'use client';

import {
  AppWindow,
  ArchiveRestore,
  Ban,
  Building2,
  Check,
  ChevronRight,
  Crown,
  Filter,
  Layers3,
  Loader2,
  Mail,
  Menu,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  useSearchParams,
} from 'next/navigation';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';
import UserAvatar from '@/app/components/account/UserAvatar';

/* ================================================================
   SHELL TYPES
   ================================================================ */

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData =
  | {
      id: string;
      name: string;
      slug: string;
      status: string;
    }
  | null;

type MembershipData =
  | {
      accessLevel: 'owner' | 'admin' | 'member';
      isOwner: boolean;
      isAdmin: boolean;
      label: string;
    }
  | null;

type SubscriptionData =
  | {
      status: string;
      planKey: string | null;
      planName: string | null;
    }
  | null;

type ModuleData = {
  key: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
};

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  canViewUsers: boolean;
  canManageUsers: boolean;
  canViewRoles: boolean;
  canManageRoles: boolean;
  canViewInvitations: boolean;
  canManageInvitations: boolean;
  canUseAi: boolean;
  canViewFiles: boolean;
  canViewNotifications: boolean;
};

/* ================================================================
   COMMON ACCESS TYPES
   ================================================================ */

type AppAccessMode = 'role_based' | 'selected';

type AccessApp = {
  id: string;
  key: string;
  name: string;
  status: string;
};

type DirectoryRole = {
  id: string;
  key: string | null;
  name: string;
};

type DirectoryCompany = {
  id: string;
  name: string;
  isDefault: boolean;
};

type DirectoryMember = {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarFileId: string | null;
  accountStatus: string;
  memberType: 'internal' | 'portal';
  membershipStatus: 'active' | 'suspended';
  accessState: string;
  canEnterWorkspace: boolean;
  isOwner: boolean;
  defaultCompanyId: string | null;
  appAccessMode: AppAccessMode;
  roles: DirectoryRole[];
  companies: DirectoryCompany[];
  apps: AccessApp[];
  invitedAt: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  deletedAt: string | null;
};

type Directory = {
  tenantId: string;
  workspaceName: string;
  generatedAt: string;
  members: DirectoryMember[];
};

type DirectoryResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  directory?: Directory;
};

/* ================================================================
   INVITATIONS
   ================================================================ */

type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

type InvitationRole = {
  id: string;
  key: string;
  name: string;
  available: boolean;
};

type InvitationCompany = {
  id: string;
  name: string;
  isDefault: boolean;
  available: boolean;
};

type WorkspaceInvitation = {
  id: string;
  tenantId: string;
  workspaceName: string;
  email: string;
  memberType: 'internal' | 'portal';
  status: InvitationStatus;
  message: string | null;
  roles: InvitationRole[];
  companies: InvitationCompany[];
  defaultCompanyId: string | null;
  expiresAt: string;
  lastSentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvitationsResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  invitations?: WorkspaceInvitation[];
  invitation?: WorkspaceInvitation;
  appAccess?: InvitationAppAccess;
  emailSent?: boolean;
};

type InvitationAppAccess = {
  invitationId: string;
  tenantId: string;
  mode: AppAccessMode;
  selectedApps: AccessApp[];
};

type InvitationAppsResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  accesses?: InvitationAppAccess[];
  access?: InvitationAppAccess;
};

/* ================================================================
   INVITATION OPTIONS
   ================================================================ */

type InvitationRoleOption = {
  id: string;
  tenantId: string | null;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  appIds: string[];
  appKeys: string[];
};

type InvitationCompanyOption = {
  id: string;
  name: string;
  legalName: string | null;
  currency: string;
  timezone: string;
  country: string | null;
  isCurrent: boolean;
  isDefault: boolean;
};

type InvitationOptions = {
  roles: InvitationRoleOption[];
  companies: InvitationCompanyOption[];
  apps: AccessApp[];
  defaultRoleId: string | null;
  defaultCompanyId: string;
};

type InvitationOptionsResponse = {
  success?: boolean;
  error?: string;
  options?: InvitationOptions;
};

/* ================================================================
   ROLE EDITOR
   ================================================================ */

type AssignableRole = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  assignable: boolean;
  permissionCount?: number;
  apps?: AccessApp[];
  appIds?: string[];
  appKeys?: string[];
};

type MemberRoleState = {
  roles: {
    id: string;
    key: string;
    name: string;
    description: string | null;
  }[];
};

type MemberRolesResponse = {
  success?: boolean;
  error?: string;
  roles?: AssignableRole[];
  member?: MemberRoleState;
};

type RoleEditor = {
  member: DirectoryMember | null;
  roles: AssignableRole[];
  selected: Set<string>;
  original: Set<string>;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const EMPTY_ROLE_EDITOR: RoleEditor = {
  member: null,
  roles: [],
  selected: new Set(),
  original: new Set(),
  loading: false,
  saving: false,
  error: null,
};

/* ================================================================
   APP EDITOR
   ================================================================ */

type MemberAppAccess = {
  userId: string;
  tenantId: string;
  isOwner: boolean;
  editable: boolean;
  mode: AppAccessMode;
  installedApps: AccessApp[];
  roleEligibleApps: AccessApp[];
  selectedApps: AccessApp[];
  effectiveApps: AccessApp[];
};

type MemberAppResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  access?: MemberAppAccess;
};

type AppEditorTarget =
  | {
      kind: 'member';
      member: DirectoryMember;
    }
  | {
      kind: 'invitation';
      invitation: WorkspaceInvitation;
    };

type AppEditor = {
  target: AppEditorTarget | null;
  mode: AppAccessMode;
  installedApps: AccessApp[];
  eligibleApps: AccessApp[];
  selected: Set<string>;
  original: Set<string>;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const EMPTY_APP_EDITOR: AppEditor = {
  target: null,
  mode: 'selected',
  installedApps: [],
  eligibleApps: [],
  selected: new Set(),
  original: new Set(),
  loading: false,
  saving: false,
  error: null,
};

/* ================================================================
   INVITE FORM
   ================================================================ */

type InviteForm = {
  open: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  options: InvitationOptions | null;
  email: string;
  memberType: 'internal' | 'portal';
  roleIds: Set<string>;
  appAccessMode: AppAccessMode;
  appIds: Set<string>;
  companyIds: Set<string>;
  defaultCompanyId: string;
  message: string;
  expiresInDays: number;
};

const EMPTY_INVITE_FORM: InviteForm = {
  open: false,
  loading: false,
  saving: false,
  error: null,
  options: null,
  email: '',
  memberType: 'internal',
  roleIds: new Set(),
  appAccessMode: 'selected',
  appIds: new Set(),
  companyIds: new Set(),
  defaultCompanyId: '',
  message: '',
  expiresInDays: 7,
};

/* ================================================================
   COMPANY EDITOR
   ================================================================ */

type MemberCompanyOption = {
  id: string;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  country: string | null;
  selected: boolean;
  isDefault: boolean;
};

type MemberCompanyAccess = {
  tenantId: string;
  userId: string;
  editable: boolean;
  defaultCompanyId: string;
  companyIds: string[];
  companies: MemberCompanyOption[];
};

type MemberCompanyResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  access?: MemberCompanyAccess;
};

type CompanyEditor = {
  member: DirectoryMember | null;
  companies: MemberCompanyOption[];
  selected: Set<string>;
  defaultCompanyId: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const EMPTY_COMPANY_EDITOR: CompanyEditor = {
  member: null,
  companies: [],
  selected: new Set(),
  defaultCompanyId: '',
  loading: false,
  saving: false,
  error: null,
};

/* ================================================================
   LIFECYCLE
   ================================================================ */

type LifecycleAction = 'suspend' | 'reactivate' | 'remove' | 'restore';

type LifecycleDialog = {
  open: boolean;
  member: DirectoryMember | null;
  action: LifecycleAction | null;
  reason: string;
  saving: boolean;
  error: string | null;
};

const EMPTY_LIFECYCLE_DIALOG: LifecycleDialog = {
  open: false,
  member: null,
  action: null,
  reason: '',
  saving: false,
  error: null,
};

/* ================================================================
   UNIFIED RECORD
   ================================================================ */

type AccessStatus = 'active' | 'suspended' | 'removed' | 'invited' | 'expired' | 'revoked';

type AccessRecord =
  | {
      kind: 'member';
      id: string;
      email: string;
      name: string;
      memberType: 'internal' | 'portal';
      status: 'active' | 'suspended' | 'removed';
      appAccessMode: AppAccessMode;
      roles: { id: string; name: string }[];
      apps: AccessApp[];
      companies: { id: string; name: string; isDefault: boolean }[];
      date: string | null;
      member: DirectoryMember;
    }
  | {
      kind: 'invitation';
      id: string;
      email: string;
      name: string;
      memberType: 'internal' | 'portal';
      status: 'invited' | 'expired' | 'revoked';
      appAccessMode: AppAccessMode;
      roles: { id: string; name: string }[];
      apps: AccessApp[];
      companies: { id: string; name: string; isDefault: boolean }[];
      date: string | null;
      invitation: WorkspaceInvitation;
    };

type FilterValue = 'all' | 'active' | 'invited' | 'suspended' | 'removed' | 'portal' | 'expired' | 'revoked';

/* ================================================================
   HELPERS
   ================================================================ */

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function memberName(member: DirectoryMember) {
  return member.fullName?.trim() || `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email;
}

function memberInitials(member: DirectoryMember) {
  const initials = `${member.firstName?.trim().charAt(0) || ''}${member.lastName?.trim().charAt(0) || ''}`.trim();
  return initials ? initials.toUpperCase() : member.email.charAt(0).toUpperCase();
}

function memberStatus(member: DirectoryMember): 'active' | 'suspended' | 'removed' {
  return member.deletedAt ? 'removed' : member.membershipStatus;
}

function invitationStatus(invitation: WorkspaceInvitation): 'invited' | 'expired' | 'revoked' {
  if (invitation.status === 'expired') return 'expired';
  if (invitation.status === 'revoked') return 'revoked';
  return 'invited';
}

function setsEqual(first: Set<string>, second: Set<string>) {
  if (first.size !== second.size) return false;
  for (const value of first) if (!second.has(value)) return false;
  return true;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function lifecycleTitle(action: LifecycleAction) {
  if (action === 'suspend') return 'Suspend employee';
  if (action === 'reactivate') return 'Reactivate employee';
  if (action === 'remove') return 'Remove employee';
  return 'Restore employee';
}

function lifecycleDescription(action: LifecycleAction) {
  if (action === 'suspend') return 'The employee immediately loses workspace access. Roles, apps and company assignments remain stored for reactivation.';
  if (action === 'reactivate') return 'The employee regains workspace access using the retained roles, app grants and company assignments.';
  if (action === 'remove') return 'The workspace membership is soft-removed. The global SaMi account and historical access record are preserved.';
  return 'The removed workspace membership is restored with its retained authorization state.';
}

function roleEligibleAppIds(
  roles: { id: string; appIds?: string[] }[],
  selectedRoleIds: Set<string>,
) {
  const ids = new Set<string>();
  for (const role of roles) {
    if (!selectedRoleIds.has(role.id)) continue;
    for (const appId of role.appIds || []) ids.add(appId);
  }
  return ids;
}

function appsForIds(apps: AccessApp[], ids: Set<string>) {
  return apps.filter(app => ids.has(app.id));
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function UsersSettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canViewUsers,
  canManageUsers,
  canViewRoles,
  canManageRoles,
  canViewInvitations,
  canManageInvitations,
  canUseAi,
  canViewFiles,
  canViewNotifications,
}: Props) {
  const searchParams = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [invitationApps, setInvitationApps] = useState<Map<string, InvitationAppAccess>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const initialView = searchParams.get('view');
  const [filter, setFilter] = useState<FilterValue>(
    initialView === 'active' || initialView === 'invited' || initialView === 'suspended' ||
    initialView === 'removed' || initialView === 'portal' || initialView === 'expired' || initialView === 'revoked'
      ? initialView
      : 'all',
  );

  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE_FORM);
  const [roleEditor, setRoleEditor] = useState<RoleEditor>(EMPTY_ROLE_EDITOR);
  const [appEditor, setAppEditor] = useState<AppEditor>(EMPTY_APP_EDITOR);
  const [companyEditor, setCompanyEditor] = useState<CompanyEditor>(EMPTY_COMPANY_EDITOR);
  const [lifecycle, setLifecycle] = useState<LifecycleDialog>(EMPTY_LIFECYCLE_DIALOG);
  const [invitationAction, setInvitationAction] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AccessRecord | null>(null);

  useEffect(() => {
    const value = searchParams.get('view');
    if (value === 'active' || value === 'invited' || value === 'suspended' || value === 'removed' || value === 'portal' || value === 'expired' || value === 'revoked') {
      setFilter(value);
    }
  }, [searchParams]);

  const loadAccessDirectory = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const jobs: Promise<void>[] = [];

      if (canViewUsers) {
        jobs.push((async () => {
          const response = await fetch('/api/workspace/members', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          const data = await readJson<DirectoryResponse>(response);
          if (!response.ok || !data?.success || !data.directory) {
            throw new Error(data?.error || 'Workspace employees could not be loaded.');
          }
          setMembers(data.directory.members);
        })());
      } else {
        setMembers([]);
      }

      if (canViewInvitations) {
        jobs.push((async () => {
          const [invitationResponse, appResponse] = await Promise.all([
            fetch('/api/workspace/invitations?status=all&limit=200', {
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { Accept: 'application/json' },
            }),
            fetch('/api/workspace/invitation-apps', {
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { Accept: 'application/json' },
            }),
          ]);

          const data = await readJson<InvitationsResponse>(invitationResponse);
          if (!invitationResponse.ok || !data?.success) {
            throw new Error(data?.error || 'Workspace invitations could not be loaded.');
          }
          setInvitations((data.invitations || []).filter(invitation => invitation.status !== 'accepted'));

          const appData = await readJson<InvitationAppsResponse>(appResponse);
          if (appResponse.ok && appData?.success) {
            setInvitationApps(new Map((appData.accesses || []).map(access => [access.invitationId, access])));
          } else {
            setInvitationApps(new Map());
          }
        })());
      } else {
        setInvitations([]);
        setInvitationApps(new Map());
      }

      await Promise.all(jobs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'People & Access could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewUsers, canViewInvitations]);

  useEffect(() => {
    void loadAccessDirectory();
  }, [loadAccessDirectory]);

  const records = useMemo<AccessRecord[]>(() => {
    const result: AccessRecord[] = [];

    for (const member of members) {
      result.push({
        kind: 'member',
        id: member.membershipId,
        email: member.email,
        name: memberName(member),
        memberType: member.memberType,
        status: memberStatus(member),
        appAccessMode: member.appAccessMode,
        roles: member.roles.map(role => ({ id: role.id, name: role.name })),
        apps: member.apps,
        companies: member.companies,
        date: member.lastActiveAt || member.joinedAt || member.suspendedAt || member.deletedAt,
        member,
      });
    }

    for (const invitation of invitations) {
      const appAccess = invitationApps.get(invitation.id);
      result.push({
        kind: 'invitation',
        id: invitation.id,
        email: invitation.email,
        name: invitation.email,
        memberType: invitation.memberType,
        status: invitationStatus(invitation),
        appAccessMode: appAccess?.mode || 'role_based',
        roles: invitation.roles.map(role => ({ id: role.id, name: role.name })),
        apps: appAccess?.selectedApps || [],
        companies: invitation.companies.map(company => ({ id: company.id, name: company.name, isDefault: company.isDefault })),
        date: invitation.lastSentAt || invitation.createdAt,
        invitation,
      });
    }

    const order: Record<AccessStatus, number> = {
      active: 0,
      invited: 1,
      suspended: 2,
      removed: 3,
      expired: 4,
      revoked: 5,
    };

    result.sort((a, b) => {
      if (a.kind === 'member' && a.member.isOwner) return -1;
      if (b.kind === 'member' && b.member.isOwner) return 1;
      const status = order[a.status] - order[b.status];
      return status !== 0 ? status : a.name.localeCompare(b.name);
    });

    return result;
  }, [members, invitations, invitationApps]);

  const summary = useMemo(() => ({
    total: records.length,
    active: records.filter(record => record.status === 'active').length,
    invited: records.filter(record => record.status === 'invited').length,
    suspended: records.filter(record => record.status === 'suspended').length,
    removed: records.filter(record => record.status === 'removed').length,
    portal: records.filter(record => record.memberType === 'portal').length,
  }), [records]);

  const filteredRecords = useMemo(() => {
    const query = normalize(search);
    return records.filter(record => {
      if (filter === 'active' && record.status !== 'active') return false;
      if (filter === 'invited' && record.status !== 'invited') return false;
      if (filter === 'suspended' && record.status !== 'suspended') return false;
      if (filter === 'removed' && record.status !== 'removed') return false;
      if (filter === 'portal' && record.memberType !== 'portal') return false;
      if (filter === 'expired' && record.status !== 'expired') return false;
      if (filter === 'revoked' && record.status !== 'revoked') return false;
      if (!query) return true;

      return normalize([
        record.name,
        record.email,
        record.status,
        record.memberType,
        record.roles.map(role => role.name).join(' '),
        record.apps.map(app => app.name).join(' '),
        record.companies.map(company => company.name).join(' '),
      ].join(' ')).includes(query);
    });
  }, [records, filter, search]);

  /* ==============================================================
     INVITATION FORM
     ============================================================== */

  async function loadInvitationOptions(): Promise<InvitationOptions> {
    const response = await fetch('/api/workspace/invitations/options', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const data = await readJson<InvitationOptionsResponse>(response);
    if (!response.ok || !data?.success || !data.options) {
      throw new Error(data?.error || 'Invitation options could not be loaded.');
    }
    return data.options;
  }

  async function loadInviteForm(source?: WorkspaceInvitation) {
    if (!canManageInvitations) return;

    setInviteForm({
      ...EMPTY_INVITE_FORM,
      open: true,
      loading: true,
      email: source?.email || '',
      memberType: source?.memberType || 'internal',
      message: source?.message || '',
    });

    try {
      const options = await loadInvitationOptions();
      const availableRoleIds = new Set(options.roles.map(role => role.id));
      const availableCompanyIds = new Set(options.companies.map(company => company.id));

      const sourceRoleIds = source?.roles.map(role => role.id).filter(roleId => availableRoleIds.has(roleId)) || [];
      const sourceCompanyIds = source?.companies.map(company => company.id).filter(companyId => availableCompanyIds.has(companyId)) || [];

      const roleIds = source?.memberType === 'portal'
        ? new Set<string>()
        : new Set<string>(sourceRoleIds.length > 0 ? sourceRoleIds : options.defaultRoleId ? [options.defaultRoleId] : []);

      const companyIds = new Set<string>(sourceCompanyIds.length > 0
        ? sourceCompanyIds
        : options.defaultCompanyId ? [options.defaultCompanyId] : []);

      const defaultCompanyId = source?.defaultCompanyId && companyIds.has(source.defaultCompanyId)
        ? source.defaultCompanyId
        : options.defaultCompanyId && companyIds.has(options.defaultCompanyId)
          ? options.defaultCompanyId
          : [...companyIds][0] || '';

      const eligibleIds = roleEligibleAppIds(options.roles, roleIds);
      const priorAccess = source ? invitationApps.get(source.id) : null;
      const sourceAppIds = new Set(
        (priorAccess?.selectedApps || [])
          .map(app => app.id)
          .filter(appId => eligibleIds.has(appId)),
      );

      const appIds = source
        ? sourceAppIds
        : new Set<string>(eligibleIds);

      setInviteForm({
        ...EMPTY_INVITE_FORM,
        open: true,
        options,
        email: source?.email || '',
        memberType: source?.memberType || 'internal',
        roleIds,
        appAccessMode: source ? (priorAccess?.mode || 'selected') : 'selected',
        appIds,
        companyIds,
        defaultCompanyId,
        message: source?.message || '',
        expiresInDays: 7,
      });
    } catch (requestError) {
      setInviteForm(current => ({
        ...current,
        loading: false,
        error: requestError instanceof Error ? requestError.message : 'Invitation options could not be loaded.',
      }));
    }
  }

  function closeInvite() {
    if (!inviteForm.saving) setInviteForm(EMPTY_INVITE_FORM);
  }

  function toggleInviteRole(roleId: string) {
    setInviteForm(current => {
      const roleIds = new Set(current.roleIds);
      roleIds.has(roleId) ? roleIds.delete(roleId) : roleIds.add(roleId);
      const eligible = roleEligibleAppIds(current.options?.roles || [], roleIds);
      const appIds = new Set([...current.appIds].filter(appId => eligible.has(appId)));
      return { ...current, roleIds, appIds };
    });
  }

  function toggleInviteApp(appId: string) {
    setInviteForm(current => {
      const eligible = roleEligibleAppIds(current.options?.roles || [], current.roleIds);
      if (!eligible.has(appId)) return current;
      const appIds = new Set(current.appIds);
      appIds.has(appId) ? appIds.delete(appId) : appIds.add(appId);
      return { ...current, appIds };
    });
  }

  function toggleInviteCompany(companyId: string) {
    setInviteForm(current => {
      const companyIds = new Set(current.companyIds);
      companyIds.has(companyId) ? companyIds.delete(companyId) : companyIds.add(companyId);
      let defaultCompanyId = current.defaultCompanyId;
      if (!companyIds.has(defaultCompanyId)) defaultCompanyId = [...companyIds][0] || '';
      return { ...current, companyIds, defaultCompanyId };
    });
  }

  async function sendInvitation() {
    if (inviteForm.saving) return;
    const email = inviteForm.email.trim().toLowerCase();

    if (!email) {
      setInviteForm(current => ({ ...current, error: 'Enter the user email address.' }));
      return;
    }
    if (inviteForm.memberType === 'internal' && inviteForm.roleIds.size === 0) {
      setInviteForm(current => ({ ...current, error: 'An internal employee must have at least one role.' }));
      return;
    }
    if (inviteForm.companyIds.size === 0) {
      setInviteForm(current => ({ ...current, error: 'Select at least one company.' }));
      return;
    }
    if (!inviteForm.defaultCompanyId || !inviteForm.companyIds.has(inviteForm.defaultCompanyId)) {
      setInviteForm(current => ({ ...current, error: 'Select a default company.' }));
      return;
    }

    const eligible = roleEligibleAppIds(inviteForm.options?.roles || [], inviteForm.roleIds);
    for (const appId of inviteForm.appIds) {
      if (!eligible.has(appId)) {
        setInviteForm(current => ({ ...current, error: 'One selected app is not enabled by the selected role set.' }));
        return;
      }
    }

    setInviteForm(current => ({ ...current, saving: true, error: null }));

    try {
      const response = await fetch('/api/workspace/invitations/create-with-access', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          memberType: inviteForm.memberType,
          roleIds: inviteForm.memberType === 'internal' ? [...inviteForm.roleIds] : [],
          appAccessMode: inviteForm.memberType === 'internal' ? inviteForm.appAccessMode : 'selected',
          appIds: inviteForm.memberType === 'internal' && inviteForm.appAccessMode === 'selected' ? [...inviteForm.appIds] : [],
          companyIds: [...inviteForm.companyIds],
          defaultCompanyId: inviteForm.defaultCompanyId,
          message: inviteForm.message.trim() || null,
          expiresInDays: inviteForm.expiresInDays,
        }),
      });

      const data = await readJson<InvitationsResponse>(response);
      if (!response.ok && !data?.invitation) {
        throw new Error(data?.error || 'The invitation could not be created.');
      }

      setInviteForm(EMPTY_INVITE_FORM);
      setSuccess(data?.emailSent === false
        ? 'Invitation and access created. Email delivery is not currently available.'
        : 'Invitation sent with role, app and company access.');
      await loadAccessDirectory(true);
    } catch (requestError) {
      setInviteForm(current => ({
        ...current,
        saving: false,
        error: requestError instanceof Error ? requestError.message : 'The invitation could not be created.',
      }));
    }
  }

  /* ==============================================================
     INVITATION MUTATIONS
     ============================================================== */

  async function invitationMutation(invitation: WorkspaceInvitation, action: 'resend' | 'revoke') {
    if (!canManageInvitations || invitationAction) return;
    setInvitationAction(`${action}:${invitation.id}`);
    setError(null);

    try {
      const response = await fetch('/api/workspace/invitations', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, invitationId: invitation.id }),
      });
      const data = await readJson<InvitationsResponse>(response);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Invitation could not be ${action === 'resend' ? 'resent' : 'revoked'}.`);
      }
      setSuccess(data.message || (action === 'resend' ? 'Invitation resent.' : 'Invitation revoked.'));
      setSelectedRecord(null);
      await loadAccessDirectory(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Invitation could not be updated.');
    } finally {
      setInvitationAction(null);
    }
  }

  /* ==============================================================
     ROLE EDITOR
     ============================================================== */

  async function openRoleEditor(member: DirectoryMember) {
    if (!canManageRoles || member.isOwner || member.memberType !== 'internal' || member.membershipStatus !== 'active' || member.deletedAt) return;
    setSelectedRecord(null);
    setRoleEditor({ ...EMPTY_ROLE_EDITOR, member, loading: true });

    try {
      const response = await fetch(`/api/workspace/member-roles?userId=${encodeURIComponent(member.userId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson<MemberRolesResponse>(response);
      if (!response.ok || !data?.success || !data.roles || !data.member) {
        throw new Error(data?.error || 'Employee roles could not be loaded.');
      }
      const original = new Set(data.member.roles.map(role => role.id));
      setRoleEditor({
        member,
        roles: data.roles,
        selected: new Set(original),
        original,
        loading: false,
        saving: false,
        error: null,
      });
    } catch (requestError) {
      setRoleEditor(current => ({
        ...current,
        loading: false,
        error: requestError instanceof Error ? requestError.message : 'Employee roles could not be loaded.',
      }));
    }
  }

  function toggleRole(roleId: string) {
    setRoleEditor(current => {
      const selected = new Set(current.selected);
      selected.has(roleId) ? selected.delete(roleId) : selected.add(roleId);
      return { ...current, selected };
    });
  }

  async function saveRoles() {
    if (!roleEditor.member || roleEditor.saving) return;
    if (roleEditor.selected.size === 0) {
      setRoleEditor(current => ({ ...current, error: 'An active internal employee must have at least one role.' }));
      return;
    }

    setRoleEditor(current => ({ ...current, saving: true, error: null }));
    try {
      const response = await fetch('/api/workspace/member-roles', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userId: roleEditor.member.userId, roleIds: [...roleEditor.selected] }),
      });
      const data = await readJson<MemberRolesResponse>(response);
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Employee roles could not be updated.');
      const member = roleEditor.member;
      setRoleEditor(EMPTY_ROLE_EDITOR);
      setSuccess('Employee roles updated. Review App Access if you changed which apps these roles permit.');
      await loadAccessDirectory(true);
      if (canManageUsers) void openMemberAppEditor(member);
    } catch (requestError) {
      setRoleEditor(current => ({
        ...current,
        saving: false,
        error: requestError instanceof Error ? requestError.message : 'Employee roles could not be updated.',
      }));
    }
  }

  const rolePreviewApps = useMemo(() => {
    if (!roleEditor.member) return [];
    const byId = new Map<string, AccessApp>();
    for (const role of roleEditor.roles) {
      if (!roleEditor.selected.has(role.id)) continue;
      for (const app of role.apps || []) byId.set(app.id, app);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [roleEditor]);

  /* ==============================================================
     APP EDITOR
     ============================================================== */

  async function openMemberAppEditor(member: DirectoryMember) {
    if (!canManageUsers || member.isOwner || member.userId === user.id) return;
    setSelectedRecord(null);
    setAppEditor({ ...EMPTY_APP_EDITOR, target: { kind: 'member', member }, loading: true });

    try {
      const response = await fetch(`/api/workspace/member-apps?userId=${encodeURIComponent(member.userId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson<MemberAppResponse>(response);
      if (!response.ok || !data?.success || !data.access) {
        throw new Error(data?.error || 'Employee app access could not be loaded.');
      }
      const access = data.access;
      const selectedIds = new Set(access.selectedApps.map(app => app.id));
      setAppEditor({
        target: { kind: 'member', member },
        mode: access.mode,
        installedApps: access.installedApps,
        eligibleApps: access.roleEligibleApps,
        selected: selectedIds,
        original: new Set(selectedIds),
        loading: false,
        saving: false,
        error: null,
      });
    } catch (requestError) {
      setAppEditor(current => ({
        ...current,
        loading: false,
        error: requestError instanceof Error ? requestError.message : 'Employee app access could not be loaded.',
      }));
    }
  }

  async function openInvitationAppEditor(invitation: WorkspaceInvitation) {
    if (!canManageInvitations || invitation.status !== 'pending') return;
    setSelectedRecord(null);
    setAppEditor({ ...EMPTY_APP_EDITOR, target: { kind: 'invitation', invitation }, loading: true });

    try {
      const options = await loadInvitationOptions();
      const roleIds = new Set(invitation.roles.map(role => role.id));
      const eligibleIds = roleEligibleAppIds(options.roles, roleIds);
      const access = invitationApps.get(invitation.id);
      const selected = new Set((access?.selectedApps || []).map(app => app.id).filter(id => eligibleIds.has(id)));
      setAppEditor({
        target: { kind: 'invitation', invitation },
        mode: access?.mode || 'selected',
        installedApps: options.apps,
        eligibleApps: options.apps.filter(app => eligibleIds.has(app.id)),
        selected,
        original: new Set(selected),
        loading: false,
        saving: false,
        error: null,
      });
    } catch (requestError) {
      setAppEditor(current => ({
        ...current,
        loading: false,
        error: requestError instanceof Error ? requestError.message : 'Invitation app access could not be loaded.',
      }));
    }
  }

  function toggleAppEditorApp(appId: string) {
    setAppEditor(current => {
      const eligible = new Set(current.eligibleApps.map(app => app.id));
      if (!eligible.has(appId)) return current;
      const selected = new Set(current.selected);
      selected.has(appId) ? selected.delete(appId) : selected.add(appId);
      return { ...current, selected };
    });
  }

  async function saveAppEditor() {
    const target = appEditor.target;

    if (!target || appEditor.saving) return;

    setAppEditor(current => ({ ...current, saving: true, error: null }));

    try {
      let endpoint: string;
      let payload: Record<string, unknown>;
      let successMessage: string;

      if (target.kind === 'member') {
        endpoint = '/api/workspace/member-apps';
        payload = {
          userId: target.member.userId,
          mode: appEditor.mode,
          appIds: appEditor.mode === 'selected' ? [...appEditor.selected] : [],
        };
        successMessage = 'Employee app access updated.';
      } else {
        endpoint = '/api/workspace/invitation-apps';
        payload = {
          invitationId: target.invitation.id,
          mode: appEditor.mode,
          appIds: appEditor.mode === 'selected' ? [...appEditor.selected] : [],
        };
        successMessage = 'Invitation app access updated.';
      }

      const response = await fetch(endpoint, {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await readJson<MemberAppResponse & InvitationAppsResponse>(response);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'App access could not be updated.');
      }

      setAppEditor(EMPTY_APP_EDITOR);
      setSuccess(successMessage);
      await loadAccessDirectory(true);
    } catch (requestError) {
      setAppEditor(current => ({
        ...current,
        saving: false,
        error: requestError instanceof Error ? requestError.message : 'App access could not be updated.',
      }));
    }
  }

  /* ==============================================================
     COMPANY EDITOR
     ============================================================== */

  async function openCompanyEditor(member: DirectoryMember) {
    if (!canManageUsers || member.isOwner || member.userId === user.id) return;
    setSelectedRecord(null);
    setCompanyEditor({ ...EMPTY_COMPANY_EDITOR, member, loading: true });

    try {
      const response = await fetch(`/api/workspace/member-companies?userId=${encodeURIComponent(member.userId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson<MemberCompanyResponse>(response);
      if (!response.ok || !data?.success || !data.access) {
        throw new Error(data?.error || 'Employee company access could not be loaded.');
      }
      setCompanyEditor({
        member,
        companies: data.access.companies,
        selected: new Set(data.access.companyIds),
        defaultCompanyId: data.access.defaultCompanyId,
        loading: false,
        saving: false,
        error: null,
      });
    } catch (requestError) {
      setCompanyEditor(current => ({
        ...current,
        loading: false,
        error: requestError instanceof Error ? requestError.message : 'Employee company access could not be loaded.',
      }));
    }
  }

  function toggleCompanyEditorCompany(companyId: string) {
    setCompanyEditor(current => {
      const selected = new Set(current.selected);
      selected.has(companyId) ? selected.delete(companyId) : selected.add(companyId);
      let defaultCompanyId = current.defaultCompanyId;
      if (!selected.has(defaultCompanyId)) defaultCompanyId = [...selected][0] || '';
      return { ...current, selected, defaultCompanyId };
    });
  }

  async function saveCompanyEditor() {
    if (!companyEditor.member || companyEditor.saving) return;
    if (companyEditor.selected.size === 0) {
      setCompanyEditor(current => ({ ...current, error: 'Select at least one company.' }));
      return;
    }
    if (!companyEditor.defaultCompanyId || !companyEditor.selected.has(companyEditor.defaultCompanyId)) {
      setCompanyEditor(current => ({ ...current, error: 'Select a default company.' }));
      return;
    }

    setCompanyEditor(current => ({ ...current, saving: true, error: null }));
    try {
      const response = await fetch('/api/workspace/member-companies', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          userId: companyEditor.member.userId,
          companyIds: [...companyEditor.selected],
          defaultCompanyId: companyEditor.defaultCompanyId,
        }),
      });
      const data = await readJson<MemberCompanyResponse>(response);
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Employee company access could not be updated.');
      setCompanyEditor(EMPTY_COMPANY_EDITOR);
      setSuccess(data.message || 'Employee company access updated.');
      await loadAccessDirectory(true);
    } catch (requestError) {
      setCompanyEditor(current => ({
        ...current,
        saving: false,
        error: requestError instanceof Error ? requestError.message : 'Employee company access could not be updated.',
      }));
    }
  }

  /* ==============================================================
     LIFECYCLE
     ============================================================== */

  function openLifecycleAction(member: DirectoryMember, action: LifecycleAction) {
    if (!canManageUsers || member.isOwner || member.userId === user.id) return;
    setSelectedRecord(null);
    setLifecycle({
      open: true,
      member,
      action,
      reason: '',
      saving: false,
      error: null,
    });
  }

  async function runLifecycleAction() {
    if (!lifecycle.member || !lifecycle.action || lifecycle.saving) return;
    const reason = lifecycle.reason.trim();
    if ((lifecycle.action === 'suspend' || lifecycle.action === 'remove') && !reason) {
      setLifecycle(current => ({ ...current, error: 'Enter an administrative reason for this action.' }));
      return;
    }

    setLifecycle(current => ({ ...current, saving: true, error: null }));
    try {
      const response = await fetch('/api/workspace/members/lifecycle', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: lifecycle.action,
          userId: lifecycle.member.userId,
          reason: reason || null,
        }),
      });
      const data = await readJson<{ success?: boolean; error?: string; message?: string }>(response);
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Employee access could not be updated.');
      setLifecycle(EMPTY_LIFECYCLE_DIALOG);
      setSuccess(data.message || 'Employee access updated.');
      await loadAccessDirectory(true);
    } catch (requestError) {
      setLifecycle(current => ({
        ...current,
        saving: false,
        error: requestError instanceof Error ? requestError.message : 'Employee access could not be updated.',
      }));
    }
  }

  /* ==============================================================
     RENDER
     ============================================================== */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
      <div className="flex min-h-screen">
        <WorkspaceSidebar
          user={user}
          tenant={tenant}
          membership={membership}
          subscription={subscription}
          modules={modules}
          capabilities={{
            aiEnabled: canUseAi,
            filesEnabled: canViewFiles,
            notificationsEnabled: canViewNotifications,
          }}
          unreadNotifications={0}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="min-w-0 flex-1 lg:pl-[286px]">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0">
                <p className="truncate text-sm font-bold">People & Access</p>
                <p className="hidden truncate text-[10px] text-slate-400 sm:block">
                  Employees, invitations, roles, apps and company scope
                </p>
              </div>

              {tenant && (
                <div className="ml-2 hidden min-w-0 border-l border-slate-200 pl-4 md:block dark:border-white/10">
                  <p className="max-w-[260px] truncate text-xs text-slate-400">{tenant.name}</p>
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void loadAccessDirectory(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>

                {canManageInvitations && (
                  <button
                    type="button"
                    onClick={() => void loadInviteForm()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="hidden sm:inline">Invite user</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8">
            {error && <Notice tone="error" text={error} onClose={() => setError(null)} />}
            {success && <Notice tone="success" text={success} onClose={() => setSuccess(null)} />}

            <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Workspace access</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">People & Access</h1>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Assign business roles, explicitly grant apps, set company scope, manage invitations and control the full employee lifecycle from one place.
                </p>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <SummaryCard label="Total" value={summary.total} active={filter === 'all'} onClick={() => setFilter('all')} />
              <SummaryCard label="Active" value={summary.active} active={filter === 'active'} onClick={() => setFilter('active')} tone="success" />
              <SummaryCard label="Invited" value={summary.invited} active={filter === 'invited'} onClick={() => setFilter('invited')} tone="info" />
              <SummaryCard label="Suspended" value={summary.suspended} active={filter === 'suspended'} onClick={() => setFilter('suspended')} tone="warning" />
              <SummaryCard label="Removed" value={summary.removed} active={filter === 'removed'} onClick={() => setFilter('removed')} tone="danger" />
              <SummaryCard label="Portal" value={summary.portal} active={filter === 'portal'} onClick={() => setFilter('portal')} />
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search name, email, role, app, company or status"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto">
                  <Filter className="h-4 w-4 shrink-0 text-slate-400" />
                  {(['all', 'active', 'invited', 'suspended', 'removed', 'portal', 'expired', 'revoked'] as FilterValue[]).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold capitalize transition ${
                        filter === value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hidden border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:border-white/10 dark:bg-white/[0.025] xl:grid xl:grid-cols-[minmax(230px,1.35fr)_80px_minmax(150px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_95px_110px_165px] xl:gap-3">
                <span>Person</span>
                <span>Type</span>
                <span>Roles</span>
                <span>Apps</span>
                <span>Companies</span>
                <span>Status</span>
                <span>Activity</span>
                <span className="text-right">Actions</span>
              </div>

              {loading ? (
                <div className="flex min-h-[340px] items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center">
                  <UsersRound className="h-9 w-9 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold">No matching people</p>
                  <p className="mt-1 max-w-md text-xs text-slate-400">No employees or invitations match the current search and filter.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/10">
                  {filteredRecords.map(record => (
                    <AccessRow
                      key={`${record.kind}:${record.id}`}
                      record={record}
                      currentUserId={user.id}
                      canManageUsers={canManageUsers}
                      canManageRoles={canManageRoles}
                      canManageInvitations={canManageInvitations}
                      invitationAction={invitationAction}
                      onDetails={setSelectedRecord}
                      onEditRoles={openRoleEditor}
                      onEditMemberApps={openMemberAppEditor}
                      onEditCompanies={openCompanyEditor}
                      onEditInvitationApps={openInvitationAppEditor}
                      onLifecycle={openLifecycleAction}
                      onResend={invitation => void invitationMutation(invitation, 'resend')}
                      onRevoke={invitation => void invitationMutation(invitation, 'revoke')}
                      onInviteAgain={invitation => void loadInviteForm(invitation)}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <AccessPrinciple icon={Shield} title="Roles define actions" text="Roles determine what the employee can read, create, approve, manage or administer." />
              <AccessPrinciple icon={AppWindow} title="Apps define availability" text="Selected app grants restrict which role-enabled business apps actually become available to the employee." />
              <AccessPrinciple icon={Building2} title="Companies define scope" text="Company assignments determine where those role and app permissions may operate." />
            </div>
          </div>
        </div>
      </div>

      {/* DETAILS */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[115] flex justify-end bg-black/30">
          <button type="button" aria-label="Close details" className="absolute inset-0" onClick={() => setSelectedRecord(null)} />
          <aside className="relative z-10 h-full w-full max-w-[540px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">
            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">
              <div>
                <h2 className="text-sm font-bold">Access details</h2>
                <p className="text-[10px] text-slate-400">Role → App → Company authorization</p>
              </div>
              <button type="button" onClick={() => setSelectedRecord(null)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-center gap-3">
                  {selectedRecord.kind === 'member' ? (
                    <UserAvatar
                      avatarFileId={selectedRecord.member.avatarFileId}
                      displayName={selectedRecord.name}
                      initials={memberInitials(selectedRecord.member)}
                      size="md"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30"><Mail className="h-4 w-4" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{selectedRecord.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{selectedRecord.email}</p>
                  </div>
                  <StatusBadge status={selectedRecord.status} />
                </div>
              </div>

              <DetailSection title="Workspace access">
                <DetailRow label="Type" value={selectedRecord.memberType === 'internal' ? 'Internal user' : 'Portal user'} />
                <DetailRow label="App policy" value={selectedRecord.appAccessMode === 'selected' ? 'Selected apps' : 'All apps permitted by roles'} />
                <DetailRow label={selectedRecord.kind === 'member' ? 'Last activity' : 'Invitation activity'} value={formatDate(selectedRecord.date)} />
                {selectedRecord.kind === 'member' && <DetailRow label="Can enter workspace" value={selectedRecord.member.canEnterWorkspace ? 'Yes' : 'No'} />}
              </DetailSection>

              <DetailSection title="Roles">
                {selectedRecord.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedRecord.roles.map(role => <Chip key={role.id} label={role.name} tone="blue" />)}
                  </div>
                ) : <p className="text-xs text-slate-400">No internal roles assigned.</p>}
              </DetailSection>

              <DetailSection title="Apps">
                {selectedRecord.apps.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedRecord.apps.map(app => (
                      <div key={app.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30"><AppWindow className="h-3.5 w-3.5" /></div>
                        <span className="min-w-0 truncate text-xs font-semibold">{app.name}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">No business apps currently effective.</p>}
              </DetailSection>

              <DetailSection title="Companies">
                {selectedRecord.companies.length > 0 ? (
                  <div className="space-y-2">
                    {selectedRecord.companies.map(company => (
                      <div key={company.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10">
                        <span className="text-xs font-medium">{company.name}</span>
                        {company.isDefault && <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">Default</span>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">No company assignments.</p>}
              </DetailSection>

              <div className="border-t border-slate-200 pt-5 dark:border-white/10">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {selectedRecord.kind === 'member' && canManageRoles && selectedRecord.member.memberType === 'internal' && selectedRecord.status === 'active' && !selectedRecord.member.isOwner && (
                    <ActionButton icon={Pencil} label="Edit roles" onClick={() => void openRoleEditor(selectedRecord.member)} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && (
                    <ActionButton icon={AppWindow} label="Edit apps" onClick={() => void openMemberAppEditor(selectedRecord.member)} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && (
                    <ActionButton icon={Building2} label="Edit companies" onClick={() => void openCompanyEditor(selectedRecord.member)} />
                  )}
                  {selectedRecord.kind === 'invitation' && selectedRecord.invitation.status === 'pending' && canManageInvitations && (
                    <ActionButton icon={AppWindow} label="Edit apps" onClick={() => void openInvitationAppEditor(selectedRecord.invitation)} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && selectedRecord.status === 'active' && (
                    <ActionButton icon={PauseCircle} label="Suspend" tone="warning" onClick={() => openLifecycleAction(selectedRecord.member, 'suspend')} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && selectedRecord.status === 'suspended' && (
                    <ActionButton icon={PlayCircle} label="Reactivate" tone="success" onClick={() => openLifecycleAction(selectedRecord.member, 'reactivate')} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && selectedRecord.status !== 'removed' && (
                    <ActionButton icon={Trash2} label="Remove" tone="danger" onClick={() => openLifecycleAction(selectedRecord.member, 'remove')} />
                  )}
                  {selectedRecord.kind === 'member' && canManageUsers && !selectedRecord.member.isOwner && selectedRecord.member.userId !== user.id && selectedRecord.status === 'removed' && (
                    <ActionButton icon={ArchiveRestore} label="Restore" onClick={() => openLifecycleAction(selectedRecord.member, 'restore')} />
                  )}
                  {selectedRecord.kind === 'invitation' && selectedRecord.invitation.status === 'pending' && canManageInvitations && (
                    <>
                      <ActionButton icon={RefreshCw} label="Resend" onClick={() => void invitationMutation(selectedRecord.invitation, 'resend')} />
                      <ActionButton icon={Ban} label="Revoke" tone="danger" onClick={() => void invitationMutation(selectedRecord.invitation, 'revoke')} />
                    </>
                  )}
                  {selectedRecord.kind === 'invitation' && (selectedRecord.status === 'expired' || selectedRecord.status === 'revoked') && canManageInvitations && (
                    <ActionButton icon={Send} label="Invite again" onClick={() => {
                      const invitation = selectedRecord.invitation;
                      setSelectedRecord(null);
                      void loadInviteForm(invitation);
                    }} />
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* INVITE DRAWER */}
      {inviteForm.open && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/30">
          <button type="button" aria-label="Close invitation form" onClick={closeInvite} className="absolute inset-0" />
          <aside className="relative z-10 h-full w-full max-w-[620px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">
            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">
              <div>
                <h2 className="text-sm font-bold">Invite user</h2>
                <p className="text-[11px] text-slate-400">Role → Apps → Companies</p>
              </div>
              <button type="button" disabled={inviteForm.saving} onClick={closeInvite} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>

            {inviteForm.loading ? (
              <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            ) : (
              <div className="space-y-6 p-5">
                {inviteForm.error && <InlineError text={inviteForm.error} />}

                <Field label="Email address">
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={event => setInviteForm(current => ({ ...current, email: event.target.value }))}
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                  />
                </Field>

                <Field label="Access type">
                  <div className="grid grid-cols-2 gap-2">
                    {(['internal', 'portal'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setInviteForm(current => ({
                          ...current,
                          memberType: type,
                          roleIds: type === 'portal' ? new Set() : current.roleIds,
                          appIds: type === 'portal' ? new Set() : current.appIds,
                        }))}
                        className={`rounded-xl border p-3 text-left transition ${inviteForm.memberType === type ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}
                      >
                        <p className="text-xs font-semibold capitalize">{type}</p>
                        <p className="mt-1 text-[10px] leading-4 text-slate-400">{type === 'internal' ? 'Employee or internal workspace user.' : 'Restricted external portal identity.'}</p>
                      </button>
                    ))}
                  </div>
                </Field>

                {inviteForm.memberType === 'internal' && (
                  <>
                    <Field label="1. Business roles">
                      {inviteForm.options?.roles.length ? (
                        <div className="space-y-2">
                          {inviteForm.options.roles.map(role => (
                            <CheckRow
                              key={role.id}
                              checked={inviteForm.roleIds.has(role.id)}
                              title={role.name}
                              description={`${role.description || `${role.permissionCount} permissions`} · ${role.appIds.length} app${role.appIds.length === 1 ? '' : 's'}`}
                              onClick={() => toggleInviteRole(role.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <InlineWarning text="No assignable roles are available. Create or configure a role before inviting an internal employee." />
                      )}
                    </Field>

                    <Field label="2. App access">
                      <AppModeSelector
                        mode={inviteForm.appAccessMode}
                        onChange={mode => setInviteForm(current => ({ ...current, appAccessMode: mode }))}
                      />

                      {inviteForm.appAccessMode === 'selected' && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(inviteForm.options?.apps || []).map(app => {
                            const eligible = roleEligibleAppIds(inviteForm.options?.roles || [], inviteForm.roleIds).has(app.id);
                            return (
                              <AppChoice
                                key={app.id}
                                app={app}
                                eligible={eligible}
                                checked={inviteForm.appIds.has(app.id)}
                                onClick={() => toggleInviteApp(app.id)}
                              />
                            );
                          })}
                        </div>
                      )}

                      <p className="mt-2 text-[10px] leading-4 text-slate-400">
                        Selecting an app does not create permissions. The selected roles must already contain permissions for that app.
                      </p>
                    </Field>
                  </>
                )}

                <Field label="3. Company access">
                  <div className="space-y-2">
                    {inviteForm.options?.companies.map(company => {
                      const checked = inviteForm.companyIds.has(company.id);
                      return (
                        <div key={company.id} className={`rounded-xl border p-3 ${checked ? 'border-blue-300 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/15' : 'border-slate-200 dark:border-white/10'}`}>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => toggleInviteCompany(company.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                              {checked && <Check className="h-3 w-3" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">{company.name}</p>
                              <p className="mt-0.5 truncate text-[9px] text-slate-400">{company.currency} · {company.timezone}</p>
                            </div>
                            {checked && (
                              <button
                                type="button"
                                onClick={() => setInviteForm(current => ({ ...current, defaultCompanyId: company.id }))}
                                className={`rounded-md px-2 py-1 text-[9px] font-semibold ${inviteForm.defaultCompanyId === company.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}
                              >
                                {inviteForm.defaultCompanyId === company.id ? 'Default' : 'Set default'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Invitation message">
                  <textarea
                    value={inviteForm.message}
                    onChange={event => setInviteForm(current => ({ ...current, message: event.target.value }))}
                    rows={3}
                    placeholder="Optional welcome or access instructions"
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                  />
                </Field>

                <Field label="Invitation validity">
                  <select
                    value={inviteForm.expiresInDays}
                    onChange={event => setInviteForm(current => ({ ...current, expiresInDays: Number(event.target.value) }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-[#11151D]"
                  >
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </Field>

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <button type="button" disabled={inviteForm.saving} onClick={closeInvite} className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Cancel</button>
                  <button type="button" disabled={inviteForm.saving} onClick={() => void sendInvitation()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                    {inviteForm.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send invitation
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ROLE EDITOR */}
      {roleEditor.member && (
        <div className="fixed inset-0 z-[130] flex justify-end bg-black/30">
          <button type="button" aria-label="Close role editor" className="absolute inset-0" onClick={() => !roleEditor.saving && setRoleEditor(EMPTY_ROLE_EDITOR)} />
          <aside className="relative z-10 h-full w-full max-w-[540px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">
            <DrawerHeader title="Employee roles" subtitle={memberName(roleEditor.member)} onClose={() => setRoleEditor(EMPTY_ROLE_EDITOR)} disabled={roleEditor.saving} />
            {roleEditor.loading ? (
              <DrawerLoader />
            ) : (
              <div className="p-5">
                {roleEditor.error && <InlineError text={roleEditor.error} />}
                <div className="mb-5 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Roles define permissions</p>
                  <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">Roles are additive. Apps are a separate allow-list boundary and never create permissions on their own.</p>
                </div>

                <div className="space-y-2">
                  {roleEditor.roles.map(role => (
                    <CheckRow
                      key={role.id}
                      checked={roleEditor.selected.has(role.id)}
                      title={role.name}
                      description={`${role.description || (typeof role.permissionCount === 'number' ? `${role.permissionCount} permissions` : 'Role')} · ${(role.appIds || []).length} app${(role.appIds || []).length === 1 ? '' : 's'}`}
                      disabled={role.assignable === false}
                      onClick={() => toggleRole(role.id)}
                    />
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Apps enabled by selected roles</p>
                  {rolePreviewApps.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">{rolePreviewApps.map(app => <Chip key={app.id} label={app.name} tone="blue" />)}</div>
                  ) : <p className="mt-2 text-xs text-slate-400">These roles do not currently grant a business app.</p>}
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <button type="button" disabled={roleEditor.saving} onClick={() => setRoleEditor(EMPTY_ROLE_EDITOR)} className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Cancel</button>
                  <button type="button" disabled={roleEditor.saving || roleEditor.selected.size === 0 || setsEqual(roleEditor.selected, roleEditor.original)} onClick={() => void saveRoles()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {roleEditor.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save roles
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* APP EDITOR */}
      {appEditor.target && (
        <div className="fixed inset-0 z-[135] flex justify-end bg-black/30">
          <button type="button" aria-label="Close app editor" className="absolute inset-0" onClick={() => !appEditor.saving && setAppEditor(EMPTY_APP_EDITOR)} />
          <aside className="relative z-10 h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">
            <DrawerHeader
              title="App access"
              subtitle={appEditor.target.kind === 'member' ? memberName(appEditor.target.member) : appEditor.target.invitation.email}
              onClose={() => setAppEditor(EMPTY_APP_EDITOR)}
              disabled={appEditor.saving}
            />

            {appEditor.loading ? <DrawerLoader /> : (
              <div className="p-5">
                {appEditor.error && <InlineError text={appEditor.error} />}

                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Direct app grant boundary</p>
                  <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">An app can only be selected when the employee's roles contain at least one permission for that app.</p>
                </div>

                <div className="mt-5">
                  <AppModeSelector mode={appEditor.mode} onChange={mode => setAppEditor(current => ({ ...current, mode }))} />
                </div>

                {appEditor.mode === 'selected' && (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {appEditor.installedApps.map(app => {
                      const eligible = appEditor.eligibleApps.some(item => item.id === app.id);
                      return <AppChoice key={app.id} app={app} eligible={eligible} checked={appEditor.selected.has(app.id)} onClick={() => toggleAppEditorApp(app.id)} />;
                    })}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <button type="button" disabled={appEditor.saving} onClick={() => setAppEditor(EMPTY_APP_EDITOR)} className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Cancel</button>
                  <button type="button" disabled={appEditor.saving || (appEditor.mode === 'selected' && setsEqual(appEditor.selected, appEditor.original))} onClick={() => void saveAppEditor()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {appEditor.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save app access
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* COMPANY EDITOR */}
      {companyEditor.member && (
        <div className="fixed inset-0 z-[138] flex justify-end bg-black/30">
          <button type="button" aria-label="Close company editor" className="absolute inset-0" onClick={() => !companyEditor.saving && setCompanyEditor(EMPTY_COMPANY_EDITOR)} />
          <aside className="relative z-10 h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">
            <DrawerHeader title="Company access" subtitle={memberName(companyEditor.member)} onClose={() => setCompanyEditor(EMPTY_COMPANY_EDITOR)} disabled={companyEditor.saving} />
            {companyEditor.loading ? <DrawerLoader /> : (
              <div className="p-5">
                {companyEditor.error && <InlineError text={companyEditor.error} />}
                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Company scope</p>
                  <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">Roles define actions and app grants define which apps exist. Company access defines where that authorization can operate.</p>
                </div>

                <div className="mt-5 space-y-2">
                  {companyEditor.companies.map(company => {
                    const checked = companyEditor.selected.has(company.id);
                    return (
                      <div key={company.id} className={`rounded-xl border p-3 ${checked ? 'border-blue-300 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/15' : 'border-slate-200 dark:border-white/10'}`}>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => toggleCompanyEditorCompany(company.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                            {checked && <Check className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{company.name}</p>
                            <p className="mt-0.5 truncate text-[9px] text-slate-400">{company.currency} · {company.timezone}</p>
                          </div>
                          {checked && (
                            <button type="button" onClick={() => setCompanyEditor(current => ({ ...current, defaultCompanyId: company.id }))} className={`rounded-md px-2 py-1 text-[9px] font-semibold ${companyEditor.defaultCompanyId === company.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>
                              {companyEditor.defaultCompanyId === company.id ? 'Default' : 'Set default'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <button type="button" disabled={companyEditor.saving} onClick={() => setCompanyEditor(EMPTY_COMPANY_EDITOR)} className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Cancel</button>
                  <button type="button" disabled={companyEditor.saving || companyEditor.selected.size === 0} onClick={() => void saveCompanyEditor()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {companyEditor.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save company access
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* LIFECYCLE */}
      {lifecycle.open && lifecycle.member && lifecycle.action && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5">
          <button type="button" aria-label="Close" className="absolute inset-0" onClick={() => !lifecycle.saving && setLifecycle(EMPTY_LIFECYCLE_DIALOG)} />
          <div className="relative z-10 w-full rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#15181F] sm:max-w-[480px] sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400">Employee lifecycle</p>
                <h2 className="mt-1 text-lg font-semibold">{lifecycleTitle(lifecycle.action)}</h2>
              </div>
              <button type="button" disabled={lifecycle.saving} onClick={() => setLifecycle(EMPTY_LIFECYCLE_DIALOG)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <UserAvatar avatarFileId={lifecycle.member.avatarFileId} displayName={memberName(lifecycle.member)} initials={memberInitials(lifecycle.member)} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{memberName(lifecycle.member)}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{lifecycle.member.email}</p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{lifecycleDescription(lifecycle.action)}</p>

            <label className="mt-5 block">
              <span className="text-xs font-semibold">{lifecycle.action === 'suspend' || lifecycle.action === 'remove' ? 'Administrative reason' : 'Reason / note'}</span>
              <textarea
                rows={3}
                maxLength={500}
                value={lifecycle.reason}
                onChange={event => setLifecycle(current => ({ ...current, reason: event.target.value }))}
                placeholder={lifecycle.action === 'suspend' || lifecycle.action === 'remove' ? 'Required' : 'Optional'}
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
              />
            </label>

            {lifecycle.error && <InlineError text={lifecycle.error} />}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={lifecycle.saving} onClick={() => setLifecycle(EMPTY_LIFECYCLE_DIALOG)} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">Cancel</button>
              <button
                type="button"
                disabled={lifecycle.saving}
                onClick={() => void runLifecycleAction()}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50 ${
                  lifecycle.action === 'remove' ? 'bg-red-600 hover:bg-red-700' : lifecycle.action === 'suspend' ? 'bg-amber-600 hover:bg-amber-700' : lifecycle.action === 'reactivate' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {lifecycle.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ================================================================
   ROW
   ================================================================ */

function AccessRow({
  record,
  currentUserId,
  canManageUsers,
  canManageRoles,
  canManageInvitations,
  invitationAction,
  onDetails,
  onEditRoles,
  onEditMemberApps,
  onEditCompanies,
  onEditInvitationApps,
  onLifecycle,
  onResend,
  onRevoke,
  onInviteAgain,
}: {
  record: AccessRecord;
  currentUserId: string;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canManageInvitations: boolean;
  invitationAction: string | null;
  onDetails: (record: AccessRecord) => void;
  onEditRoles: (member: DirectoryMember) => void;
  onEditMemberApps: (member: DirectoryMember) => void;
  onEditCompanies: (member: DirectoryMember) => void;
  onEditInvitationApps: (invitation: WorkspaceInvitation) => void;
  onLifecycle: (member: DirectoryMember, action: LifecycleAction) => void;
  onResend: (invitation: WorkspaceInvitation) => void;
  onRevoke: (invitation: WorkspaceInvitation) => void;
  onInviteAgain: (invitation: WorkspaceInvitation) => void;
}) {
  const protectedMember = record.kind === 'member' && (record.member.isOwner || record.member.userId === currentUserId);

  return (
    <div className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.02] xl:grid-cols-[minmax(230px,1.35fr)_80px_minmax(150px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_95px_110px_165px] xl:items-center">
      <button type="button" onClick={() => onDetails(record)} className="flex min-w-0 items-center gap-3 text-left">
        {record.kind === 'member' ? (
          <UserAvatar avatarFileId={record.member.avatarFileId} displayName={record.name} initials={memberInitials(record.member)} size="sm" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"><Mail className="h-4 w-4" /></div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold">{record.name}</p>
            {record.kind === 'member' && record.member.isOwner && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {record.kind === 'member' && record.member.userId === currentUserId && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500 dark:bg-white/10">You</span>}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-400">{record.email}</p>
        </div>
      </button>

      <span className="text-[10px] font-semibold capitalize text-slate-500 dark:text-slate-400">{record.memberType}</span>
      <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{record.roles.length ? record.roles.map(role => role.name).join(', ') : record.kind === 'member' && record.member.isOwner ? 'Workspace Owner' : 'No internal roles'}</p>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{record.apps.length ? record.apps.map(app => app.name).join(', ') : 'No apps'}</p>
        <p className="mt-0.5 text-[9px] text-slate-400">{record.appAccessMode === 'selected' ? 'Selected apps' : 'From roles'}</p>
      </div>
      <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">{record.companies.length ? record.companies.map(company => company.isDefault ? `${company.name} · Default` : company.name).join(', ') : 'No companies'}</p>
      <StatusBadge status={record.status} />
      <p className="truncate text-[10px] text-slate-400">{formatDate(record.date)}</p>

      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={() => onDetails(record)} className="flex h-8 items-center justify-center rounded-lg px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">Details</button>

        {record.kind === 'member' && canManageRoles && record.member.memberType === 'internal' && record.status === 'active' && !record.member.isOwner && (
          <IconButton title="Edit roles" icon={Pencil} onClick={() => onEditRoles(record.member)} />
        )}
        {record.kind === 'member' && canManageUsers && !protectedMember && record.member.memberType === 'internal' && (
          <IconButton title="Edit apps" icon={AppWindow} onClick={() => onEditMemberApps(record.member)} />
        )}
        {record.kind === 'member' && canManageUsers && !protectedMember && (
          <IconButton title="Edit companies" icon={Building2} onClick={() => onEditCompanies(record.member)} />
        )}
        {record.kind === 'member' && canManageUsers && !protectedMember && record.status === 'active' && (
          <IconButton title="Suspend" icon={PauseCircle} tone="warning" onClick={() => onLifecycle(record.member, 'suspend')} />
        )}
        {record.kind === 'member' && canManageUsers && !protectedMember && record.status === 'suspended' && (
          <IconButton title="Reactivate" icon={PlayCircle} tone="success" onClick={() => onLifecycle(record.member, 'reactivate')} />
        )}
        {record.kind === 'member' && canManageUsers && !protectedMember && record.status === 'removed' && (
          <IconButton title="Restore" icon={ArchiveRestore} onClick={() => onLifecycle(record.member, 'restore')} />
        )}

        {record.kind === 'invitation' && record.invitation.status === 'pending' && canManageInvitations && (
          <>
            <IconButton title="Edit apps" icon={AppWindow} onClick={() => onEditInvitationApps(record.invitation)} />
            <IconButton
              title="Resend invitation"
              icon={invitationAction === `resend:${record.invitation.id}` ? Loader2 : RefreshCw}
              spin={invitationAction === `resend:${record.invitation.id}`}
              disabled={invitationAction !== null}
              onClick={() => onResend(record.invitation)}
            />
            <IconButton
              title="Revoke invitation"
              icon={invitationAction === `revoke:${record.invitation.id}` ? Loader2 : Ban}
              spin={invitationAction === `revoke:${record.invitation.id}`}
              tone="danger"
              disabled={invitationAction !== null}
              onClick={() => onRevoke(record.invitation)}
            />
          </>
        )}

        {record.kind === 'invitation' && (record.status === 'expired' || record.status === 'revoked') && canManageInvitations && (
          <IconButton title="Invite again" icon={Send} onClick={() => onInviteAgain(record.invitation)} />
        )}
      </div>
    </div>
  );
}

/* ================================================================
   UI HELPERS
   ================================================================ */

function StatusBadge({ status }: { status: AccessStatus }) {
  const classes = status === 'active'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
    : status === 'invited'
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
      : status === 'suspended'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
        : status === 'removed'
          ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
          : status === 'expired'
            ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';

  return <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-semibold capitalize ${classes}`}>{status}</span>;
}

function SummaryCard({
  label,
  value,
  active,
  onClick,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger';
}) {
  const numberClass = tone === 'success'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'info'
      ? 'text-blue-600 dark:text-blue-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-950 dark:text-white';

  return (
    <button type="button" onClick={onClick} className={`rounded-xl border bg-white p-4 text-left transition dark:bg-white/[0.035] ${active ? 'border-blue-500 ring-2 ring-blue-500/10 dark:border-blue-500' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className={`mt-2 text-xl font-bold ${numberClass}`}>{value}</p>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</p>{children}</div>;
}

function CheckRow({
  checked,
  title,
  description,
  disabled = false,
  onClick,
}: {
  checked: boolean;
  title: string;
  description: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{checked && <Check className="h-3 w-3" />}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        {description && <p className="mt-1 text-[10px] leading-4 text-slate-400">{description}</p>}
      </div>
    </button>
  );
}

function AppModeSelector({ mode, onChange }: { mode: AppAccessMode; onChange: (mode: AppAccessMode) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" onClick={() => onChange('selected')} className={`rounded-xl border p-3 text-left ${mode === 'selected' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-white/10'}`}>
        <p className="flex items-center gap-2 text-xs font-semibold"><Layers3 className="h-4 w-4" /> Selected apps</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-400">Explicitly choose a subset of apps already permitted by the assigned roles.</p>
      </button>
      <button type="button" onClick={() => onChange('role_based')} className={`rounded-xl border p-3 text-left ${mode === 'role_based' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-white/10'}`}>
        <p className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4" /> From roles</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-400">Automatically allow every installed app represented by the employee's role permissions.</p>
      </button>
    </div>
  );
}

function AppChoice({
  app,
  eligible,
  checked,
  onClick,
}: {
  app: AccessApp;
  eligible: boolean;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={!eligible} onClick={onClick} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${checked ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${eligible ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-white/10'}`}><AppWindow className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{app.name}</p>
        <p className="mt-0.5 text-[9px] text-slate-400">{eligible ? 'Allowed by selected role(s)' : 'No permission from selected role(s)'}</p>
      </div>
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{checked && <Check className="h-3 w-3" />}</div>
    </button>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{title}</p><div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">{children}</div></section>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0 dark:border-white/10"><span className="text-[10px] font-medium text-slate-400">{label}</span><span className="max-w-[65%] text-right text-xs font-semibold">{value}</span></div>;
}

function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'blue' }) {
  return <span className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${tone === 'blue' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{label}</span>;
}

function AccessPrinciple({ icon: Icon, title, text }: { icon: typeof Shield; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"><Icon className="h-4 w-4" /></div>
      <div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{text}</p></div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone = 'neutral' }: { icon: typeof Pencil; label: string; onClick: () => void; tone?: 'neutral' | 'warning' | 'success' | 'danger' }) {
  const classes = tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
    : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
        : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300';
  return <button type="button" onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${classes}`}><Icon className="h-4 w-4" />{label}</button>;
}

function IconButton({
  title,
  icon: Icon,
  onClick,
  tone = 'neutral',
  disabled = false,
  spin = false,
}: {
  title: string;
  icon: typeof Pencil;
  onClick: () => void;
  tone?: 'neutral' | 'warning' | 'success' | 'danger';
  disabled?: boolean;
  spin?: boolean;
}) {
  const classes = tone === 'warning' ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
    : tone === 'success' ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
      : tone === 'danger' ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
        : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30';
  return <button type="button" disabled={disabled} title={title} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50 ${classes}`}><Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} /></button>;
}

function DrawerHeader({ title, subtitle, onClose, disabled }: { title: string; subtitle: string; onClose: () => void; disabled?: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">
      <div><h2 className="text-sm font-bold">{title}</h2><p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p></div>
      <button type="button" disabled={disabled} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>
  );
}

function DrawerLoader() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>;
}

function InlineError({ text }: { text: string }) {
  return <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{text}</div>;
}

function InlineWarning({ text }: { text: string }) {
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">{text}</div>;
}

function Notice({ tone, text, onClose }: { tone: 'error' | 'success'; text: string; onClose: () => void }) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'}`}>
      <span>{text}</span><button type="button" onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
  );
}
