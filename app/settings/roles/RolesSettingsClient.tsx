'use client';

import Link from 'next/link';

import {
  Check,
  ChevronRight,
  CirclePlus,
  Edit3,
  KeyRound,
  Loader2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Power,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';


/* ================================================================
   TYPES
   ================================================================ */

type UserData = {
  id:
    string;

  email:
    string;

  fullName:
    string;

  firstName:
    string;

  lastName:
    string;

  avatarFileId:
    string | null;
};


type TenantData =
  | {
      id:
        string;

      name:
        string;

      slug:
        string;

      status:
        string;
    }
  | null;


type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';

      isOwner:
        boolean;

      isAdmin:
        boolean;

      label:
        string;
    }
  | null;


type SubscriptionData =
  | {
      status:
        string;

      planKey:
        string | null;

      planName:
        string | null;
    }
  | null;


type ModuleData = {
  key:
    string;

  name:
    string;

  status:
    string;

  href?:
    string | null;

  description?:
    string | null;
};


type WorkspaceRole = {
  id:
    string;

  tenantId:
    string | null;

  key:
    string;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  status:
    'active'
    | 'disabled';

  permissionCount:
    number;

  assignedUserCount:
    number;

  createdAt:
    string | null;

  updatedAt:
    string | null;

  deletedAt:
    string | null;

  editable:
    boolean;
};


type PermissionItem = {
  id:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  resource:
    string;

  action:
    string;

  moduleKey:
    string | null;

  scope:
    'workspace'
    | 'company'
    | 'module'
    | 'record';

  isSystem:
    boolean;

  assigned:
    boolean;
};


type RolePermissionMatrix = {
  role: {
    id:
      string;

    tenantId:
      string | null;

    key:
      string;

    name:
      string;

    description:
      string | null;

    isSystem:
      boolean;

    status:
      'active'
      | 'disabled';

    editable:
      boolean;
  };

  permissions:
    PermissionItem[];

  assignedPermissionKeys:
    string[];

  availablePermissionCount:
    number;

  assignedPermissionCount:
    number;

  editable:
    boolean;
};


type Props = {
  user:
    UserData;

  tenant:
    TenantData;

  membership:
    MembershipData;

  subscription:
    SubscriptionData;

  modules:
    ModuleData[];

  canManage:
    boolean;
};


type RolesResponse = {
  success?:
    boolean;

  error?:
    string;

  roles?:
    WorkspaceRole[];

  role?:
    WorkspaceRole;
};


type MatrixResponse = {
  success?:
    boolean;

  error?:
    string;

  matrix?:
    RolePermissionMatrix;
};


type EditorState = {
  open:
    boolean;

  mode:
    'create'
    | 'edit';

  roleId:
    string | null;

  name:
    string;

  description:
    string;
};


const EMPTY_EDITOR:
  EditorState = {
  open:
    false,

  mode:
    'create',

  roleId:
    null,

  name:
    '',

  description:
    '',
};


/* ================================================================
   HELPERS
   ================================================================ */

async function readJson<T>(
  response:
    Response,
): Promise<T | null> {
  try {
    return (
      await response.json()
    ) as T;
  } catch {
    return null;
  }
}


function formatLabel(
  value:
    string,
) {
  return value
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character
          .toUpperCase(),
    );
}


function moduleLabel(
  value:
    string,
) {
  if (
    value ===
    'platform'
  ) {
    return 'Platform';
  }


  return formatLabel(
    value,
  );
}


/* ================================================================
   CLIENT
   ================================================================ */

export default function RolesSettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canManage,
}: Props) {
  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );


  const [
    roles,
    setRoles,
  ] =
    useState<
      WorkspaceRole[]
    >(
      [],
    );


  const [
    selectedRoleId,
    setSelectedRoleId,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    matrix,
    setMatrix,
  ] =
    useState<
      RolePermissionMatrix | null
    >(
      null,
    );


  const [
    selectedKeys,
    setSelectedKeys,
  ] =
    useState<
      Set<string>
    >(
      new Set(),
    );


  const [
    loadingRoles,
    setLoadingRoles,
  ] =
    useState(
      true,
    );


  const [
    loadingMatrix,
    setLoadingMatrix,
  ] =
    useState(
      false,
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );


  const [
    actionLoading,
    setActionLoading,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    permissionSearch,
    setPermissionSearch,
  ] =
    useState(
      '',
    );


  const [
    activeGroup,
    setActiveGroup,
  ] =
    useState(
      'all',
    );


  const [
    editor,
    setEditor,
  ] =
    useState<EditorState>(
      EMPTY_EDITOR,
    );


  const [
    editorSaving,
    setEditorSaving,
  ] =
    useState(
      false,
    );


  const menuRef =
    useRef<
      HTMLDivElement | null
    >(
      null,
    );


  const [
    roleMenuOpen,
    setRoleMenuOpen,
  ] =
    useState(
      false,
    );


  const selectedRole =
    useMemo(
      () =>
        roles.find(
          role =>
            role.id ===
            selectedRoleId,
        ) ||
        null,

      [
        roles,
        selectedRoleId,
      ],
    );


  /* ==========================================================
     LOAD ROLES
     ========================================================== */

  const loadRoles =
    useCallback(
      async (
        preferredRoleId?:
          string | null,
      ) => {
        setLoadingRoles(
          true,
        );

        setError(
          null,
        );


        try {
          const response =
            await fetch(
              '/api/workspace/roles',
              {
                method:
                  'GET',

                credentials:
                  'same-origin',

                cache:
                  'no-store',

                headers: {
                  Accept:
                    'application/json',
                },
              },
            );


          const data =
            await readJson<RolesResponse>(
              response,
            );


          if (
            !response.ok ||
            !data?.success ||
            !data.roles
          ) {
            throw new Error(
              data?.error ||
              'Roles could not be loaded.',
            );
          }


          setRoles(
            data.roles,
          );


          const preferred =
            preferredRoleId &&
            data.roles.some(
              role =>
                role.id ===
                preferredRoleId,
            )
              ? preferredRoleId
              : null;


          setSelectedRoleId(
            current => {
              if (
                preferred
              ) {
                return preferred;
              }


              if (
                current &&
                data.roles?.some(
                  role =>
                    role.id ===
                    current,
                )
              ) {
                return current;
              }


              return (
                data.roles?.[0]
                  ?.id ||
                null
              );
            },
          );
        } catch (
          cause
        ) {
          setError(
            cause instanceof
              Error
              ? cause.message
              : 'Roles could not be loaded.',
          );
        } finally {
          setLoadingRoles(
            false,
          );
        }
      },

      [],
    );


  useEffect(
    () => {
      void loadRoles();
    },

    [
      loadRoles,
    ],
  );


  /* ==========================================================
     LOAD MATRIX
     ========================================================== */

  const loadMatrix =
    useCallback(
      async (
        roleId:
          string,
      ) => {
        setLoadingMatrix(
          true,
        );

        setError(
          null,
        );

        setSuccess(
          null,
        );


        try {
          const response =
            await fetch(
              `/api/workspace/roles/permissions?roleId=${encodeURIComponent(
                roleId,
              )}`,
              {
                method:
                  'GET',

                credentials:
                  'same-origin',

                cache:
                  'no-store',

                headers: {
                  Accept:
                    'application/json',
                },
              },
            );


          const data =
            await readJson<MatrixResponse>(
              response,
            );


          if (
            !response.ok ||
            !data?.success ||
            !data.matrix
          ) {
            throw new Error(
              data?.error ||
              'Permissions could not be loaded.',
            );
          }


          setMatrix(
            data.matrix,
          );


          setSelectedKeys(
            new Set(
              data.matrix
                .assignedPermissionKeys,
            ),
          );


          setActiveGroup(
            'all',
          );

          setPermissionSearch(
            '',
          );
        } catch (
          cause
        ) {
          setMatrix(
            null,
          );

          setError(
            cause instanceof
              Error
              ? cause.message
              : 'Permissions could not be loaded.',
          );
        } finally {
          setLoadingMatrix(
            false,
          );
        }
      },

      [],
    );


  useEffect(
    () => {
      if (
        !selectedRoleId
      ) {
        setMatrix(
          null,
        );

        return;
      }


      void loadMatrix(
        selectedRoleId,
      );
    },

    [
      selectedRoleId,
      loadMatrix,
    ],
  );


  useEffect(
    () => {
      function handleOutside(
        event:
          PointerEvent,
      ) {
        if (
          menuRef.current &&
          !menuRef.current
            .contains(
              event.target as Node,
            )
        ) {
          setRoleMenuOpen(
            false,
          );
        }
      }


      window.addEventListener(
        'pointerdown',
        handleOutside,
      );


      return () =>
        window.removeEventListener(
          'pointerdown',
          handleOutside,
        );
    },

    [],
  );


  /* ==========================================================
     MATRIX HELPERS
     ========================================================== */

  const dirty =
    useMemo(
      () => {
        if (
          !matrix
        ) {
          return false;
        }


        const original =
          new Set(
            matrix.assignedPermissionKeys,
          );


        if (
          original.size !==
          selectedKeys.size
        ) {
          return true;
        }


        for (
          const key
          of original
        ) {
          if (
            !selectedKeys.has(
              key,
            )
          ) {
            return true;
          }
        }


        return false;
      },

      [
        matrix,
        selectedKeys,
      ],
    );


  const permissionGroups =
    useMemo(
      () => {
        if (
          !matrix
        ) {
          return [];
        }


        return [
          ...new Set(
            matrix.permissions.map(
              permission =>
                permission.moduleKey ||
                'platform',
            ),
          ),
        ].sort(
          (
            left,
            right,
          ) => {
            if (
              left ===
              'platform'
            ) {
              return -1;
            }


            if (
              right ===
              'platform'
            ) {
              return 1;
            }


            return left.localeCompare(
              right,
            );
          },
        );
      },

      [
        matrix,
      ],
    );


  const visiblePermissions =
    useMemo(
      () => {
        if (
          !matrix
        ) {
          return [];
        }


        const query =
          permissionSearch
            .trim()
            .toLowerCase();


        return matrix.permissions
          .filter(
            permission =>
              activeGroup ===
                'all' ||
              (
                permission.moduleKey ||
                'platform'
              ) ===
                activeGroup,
          )
          .filter(
            permission => {
              if (
                !query
              ) {
                return true;
              }


              return [
                permission.name,
                permission.key,
                permission.resource,
                permission.action,
                permission.description ||
                  '',
              ]
                .join(
                  ' ',
                )
                .toLowerCase()
                .includes(
                  query,
                );
            },
          );
      },

      [
        matrix,
        activeGroup,
        permissionSearch,
      ],
    );


  const groupedPermissions =
    useMemo(
      () => {
        const groups =
          new Map<
            string,
            PermissionItem[]
          >();


        for (
          const permission
          of visiblePermissions
        ) {
          const resource =
            permission.resource ||
            'general';


          const current =
            groups.get(
              resource,
            ) ||
            [];


          current.push(
            permission,
          );


          groups.set(
            resource,
            current,
          );
        }


        return [
          ...groups.entries(),
        ];
      },

      [
        visiblePermissions,
      ],
    );


  const canEditSelectedRole =
    Boolean(
      canManage &&
      matrix?.editable &&
      selectedRole?.editable &&
      selectedRole.status ===
        'active',
    );


  function togglePermission(
    key:
      string,
  ) {
    if (
      !canEditSelectedRole
    ) {
      return;
    }


    setSelectedKeys(
      current => {
        const next =
          new Set(
            current,
          );


        if (
          next.has(
            key,
          )
        ) {
          next.delete(
            key,
          );
        } else {
          next.add(
            key,
          );
        }


        return next;
      },
    );
  }


  /* ==========================================================
     SAVE PERMISSIONS
     ========================================================== */

  async function savePermissions() {
    if (
      !selectedRoleId ||
      !canEditSelectedRole ||
      !dirty ||
      saving
    ) {
      return;
    }


    setSaving(
      true,
    );

    setError(
      null,
    );

    setSuccess(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/roles/permissions',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                roleId:
                  selectedRoleId,

                permissionKeys: [
                  ...selectedKeys,
                ],
              }),
          },
        );


      const data =
        await readJson<MatrixResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success ||
        !data.matrix
      ) {
        throw new Error(
          data?.error ||
          'Permissions could not be saved.',
        );
      }


      setMatrix(
        data.matrix,
      );


      setSelectedKeys(
        new Set(
          data.matrix
            .assignedPermissionKeys,
        ),
      );


      setSuccess(
        'Role permissions updated.',
      );


      await loadRoles(
        selectedRoleId,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : 'Permissions could not be saved.',
      );
    } finally {
      setSaving(
        false,
      );
    }
  }


  /* ==========================================================
     ROLE EDITOR
     ========================================================== */

  function openCreateRole() {
    setEditor({
      open:
        true,

      mode:
        'create',

      roleId:
        null,

      name:
        '',

      description:
        '',
    });
  }


  function openEditRole() {
    if (
      !selectedRole ||
      !selectedRole.editable
    ) {
      return;
    }


    setEditor({
      open:
        true,

      mode:
        'edit',

      roleId:
        selectedRole.id,

      name:
        selectedRole.name,

      description:
        selectedRole.description ||
        '',
    });


    setRoleMenuOpen(
      false,
    );
  }


  async function saveRoleEditor() {
    if (
      !editor.name.trim() ||
      editorSaving
    ) {
      return;
    }


    setEditorSaving(
      true,
    );

    setError(
      null,
    );


    try {
      const creating =
        editor.mode ===
        'create';


      const response =
        await fetch(
          '/api/workspace/roles',
          {
            method:
              creating
                ? 'POST'
                : 'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify(
                creating
                  ? {
                      name:
                        editor.name,

                      description:
                        editor.description,
                    }
                  : {
                      action:
                        'update',

                      roleId:
                        editor.roleId,

                      name:
                        editor.name,

                      description:
                        editor.description,
                    },
              ),
          },
        );


      const data =
        await readJson<RolesResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success ||
        !data.role
      ) {
        throw new Error(
          data?.error ||
          'Role could not be saved.',
        );
      }


      setEditor(
        EMPTY_EDITOR,
      );


      setSuccess(
        creating
          ? 'Role created.'
          : 'Role updated.',
      );


      await loadRoles(
        data.role.id,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : 'Role could not be saved.',
      );
    } finally {
      setEditorSaving(
        false,
      );
    }
  }


  /* ==========================================================
     ROLE LIFECYCLE
     ========================================================== */

  async function roleAction(
    action:
      'enable'
      | 'disable',
  ) {
    if (
      !selectedRole ||
      selectedRole.isSystem ||
      actionLoading
    ) {
      return;
    }


    setActionLoading(
      action,
    );

    setRoleMenuOpen(
      false,
    );

    setError(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/roles',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                action,

                roleId:
                  selectedRole.id,
              }),
          },
        );


      const data =
        await readJson<RolesResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success ||
        !data.role
      ) {
        throw new Error(
          data?.error ||
          'Role could not be updated.',
        );
      }


      setSuccess(
        action ===
          'enable'
          ? 'Role enabled.'
          : 'Role disabled.',
      );


      await loadRoles(
        selectedRole.id,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : 'Role could not be updated.',
      );
    } finally {
      setActionLoading(
        null,
      );
    }
  }


  async function deleteRole() {
    if (
      !selectedRole ||
      selectedRole.isSystem ||
      actionLoading
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        `Delete "${selectedRole.name}"?\n\nUsers assigned to this role will lose this role assignment.`,
      );


    if (
      !confirmed
    ) {
      return;
    }


    setActionLoading(
      'delete',
    );

    setRoleMenuOpen(
      false,
    );

    setError(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/roles',
          {
            method:
              'DELETE',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                roleId:
                  selectedRole.id,
              }),
          },
        );


      const data =
        await readJson<RolesResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          'Role could not be deleted.',
        );
      }


      setMatrix(
        null,
      );

      setSelectedRoleId(
        null,
      );

      setSuccess(
        'Role deleted.',
      );


      await loadRoles();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : 'Role could not be deleted.',
      );
    } finally {
      setActionLoading(
        null,
      );
    }
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
      <div className="flex min-h-screen">

        <WorkspaceSidebar
          user={
            user
          }

          tenant={
            tenant
          }

          membership={
            membership
          }

          subscription={
            subscription
          }

          modules={
            modules
          }

          capabilities={{
            aiEnabled:
              true,

            filesEnabled:
              false,

            notificationsEnabled:
              false,
          }}

          unreadNotifications={
            0
          }

          open={
            sidebarOpen
          }

          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />


        <div className="min-w-0 flex-1 lg:pl-[286px]">

          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">

              <button
                type="button"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                aria-label="Open navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  Roles & Permissions
                </p>

                <p className="hidden truncate text-[11px] text-slate-400 sm:block">
                  {tenant?.name ||
                    'SaMi Workspace'}
                </p>
              </div>


              <div className="ml-auto flex items-center gap-2">

                <Link
                  href="/settings/users"
                  className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300 sm:flex"
                >
                  <Users className="h-4 w-4" />

                  Users
                </Link>


                {canManage && (
                  <button
                    type="button"
                    onClick={
                      openCreateRole
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    <CirclePlus className="h-4 w-4" />

                    <span className="hidden sm:inline">
                      New role
                    </span>

                    <span className="sm:hidden">
                      New
                    </span>
                  </button>
                )}
              </div>
            </div>
          </header>


          <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">

            {error && (
              <Message
                type="error"
                text={
                  error
                }
                onClose={() =>
                  setError(
                    null,
                  )
                }
              />
            )}


            {success && (
              <Message
                type="success"
                text={
                  success
                }
                onClose={() =>
                  setSuccess(
                    null,
                  )
                }
              />
            )}


            <section className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Access management
                </p>

                <h1 className="mt-1 text-xl font-bold tracking-[-0.025em] sm:text-2xl">
                  Roles & permissions
                </h1>

                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                  Define what users can do. Company access separately controls where those permissions apply.
                </p>
              </div>


              <button
                type="button"
                onClick={() =>
                  void loadRoles(
                    selectedRoleId,
                  )
                }
                disabled={
                  loadingRoles
                }
                title="Refresh"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
              >
                <RefreshCw
                  className={[
                    'h-4 w-4',
                    loadingRoles
                      ? 'animate-spin'
                      : '',
                  ].join(
                    ' ',
                  )}
                />
              </button>
            </section>


            {/* MOBILE ROLE SWITCHER */}

            <div className="mb-4 lg:hidden">
              {loadingRoles ? (
                <div className="flex h-12 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {roles.map(
                    role => (
                      <button
                        key={
                          role.id
                        }
                        type="button"
                        onClick={() =>
                          setSelectedRoleId(
                            role.id,
                          )
                        }
                        className={[
                          'flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition',
                          selectedRoleId ===
                          role.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300',
                        ].join(
                          ' ',
                        )}
                      >
                        {role.isSystem ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}

                        {role.name}

                        {role.status ===
                          'disabled' && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>


            <div className="grid min-h-0 gap-4 lg:grid-cols-[285px_minmax(0,1fr)]">

              {/* ROLE LIST */}

              <aside className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035] lg:block">

                <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      Roles
                    </p>

                    <span className="text-[10px] text-slate-400">
                      {roles.length}
                    </span>
                  </div>
                </div>


                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
                  {loadingRoles ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    </div>
                  ) : (
                    roles.map(
                      role => (
                        <RoleListItem
                          key={
                            role.id
                          }
                          role={
                            role
                          }
                          active={
                            selectedRoleId ===
                            role.id
                          }
                          onClick={() =>
                            setSelectedRoleId(
                              role.id,
                            )
                          }
                        />
                      ),
                    )
                  )}
                </div>
              </aside>


              {/* PERMISSION PANEL */}

              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

                {!selectedRole ? (
                  <div className="flex min-h-[420px] items-center justify-center p-8 text-center">
                    <div>
                      <Shield className="mx-auto h-8 w-8 text-slate-300" />

                      <p className="mt-3 text-sm font-semibold">
                        Select a role
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Choose a role to review its permissions.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">

                      <div className="flex items-start gap-3">
                        <div
                          className={[
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            selectedRole.isSystem
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                          ].join(
                            ' ',
                          )}
                        >
                          {selectedRole.isSystem ? (
                            <ShieldCheck className="h-5 w-5" />
                          ) : (
                            <Shield className="h-5 w-5" />
                          )}
                        </div>


                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-base font-semibold">
                              {selectedRole.name}
                            </h2>

                            {selectedRole.isSystem && (
                              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                System
                              </span>
                            )}

                            {selectedRole.status ===
                              'disabled' && (
                              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                Disabled
                              </span>
                            )}
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                            {selectedRole.description ||
                              'No role description.'}
                          </p>


                          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <KeyRound className="h-3 w-3" />

                              {
                                selectedRole.permissionCount
                              }{' '}
                              permissions
                            </span>

                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />

                              {
                                selectedRole.assignedUserCount
                              }{' '}
                              users
                            </span>
                          </div>
                        </div>


                        {canManage &&
                          selectedRole.editable && (
                          <div
                            ref={
                              menuRef
                            }
                            className="relative"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setRoleMenuOpen(
                                  current =>
                                    !current,
                                )
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                            >
                              <MoreHorizontal className="h-5 w-5" />
                            </button>


                            {roleMenuOpen && (
                              <div className="absolute right-0 top-10 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#15181F]">

                                <RoleMenuButton
                                  icon={
                                    Edit3
                                  }
                                  label="Edit role"
                                  onClick={
                                    openEditRole
                                  }
                                />


                                {selectedRole.status ===
                                  'active' ? (
                                  <RoleMenuButton
                                    icon={
                                      Power
                                    }
                                    label="Disable role"
                                    onClick={() =>
                                      void roleAction(
                                        'disable',
                                      )
                                    }
                                  />
                                ) : (
                                  <RoleMenuButton
                                    icon={
                                      Power
                                    }
                                    label="Enable role"
                                    onClick={() =>
                                      void roleAction(
                                        'enable',
                                      )
                                    }
                                  />
                                )}


                                <div className="my-1 border-t border-slate-100 dark:border-white/10" />


                                <RoleMenuButton
                                  icon={
                                    Trash2
                                  }
                                  label="Delete role"
                                  danger
                                  onClick={() =>
                                    void deleteRole()
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>


                    {loadingMatrix ? (
                      <div className="flex min-h-[420px] items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      </div>
                    ) : matrix ? (
                      <>
                        <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                            <div className="relative min-w-0 flex-1">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                              <input
                                value={
                                  permissionSearch
                                }
                                onChange={
                                  event =>
                                    setPermissionSearch(
                                      event.target.value,
                                    )
                                }
                                placeholder="Search permissions"
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
                              />
                            </div>


                            <div className="flex gap-1.5 overflow-x-auto">
                              <GroupButton
                                active={
                                  activeGroup ===
                                  'all'
                                }
                                label="All"
                                onClick={() =>
                                  setActiveGroup(
                                    'all',
                                  )
                                }
                              />

                              {permissionGroups.map(
                                group => (
                                  <GroupButton
                                    key={
                                      group
                                    }
                                    active={
                                      activeGroup ===
                                      group
                                    }
                                    label={
                                      moduleLabel(
                                        group,
                                      )
                                    }
                                    onClick={() =>
                                      setActiveGroup(
                                        group,
                                      )
                                    }
                                  />
                                ),
                              )}
                            </div>
                          </div>
                        </div>


                        <div className="max-h-[58vh] overflow-y-auto lg:max-h-[calc(100vh-355px)]">
                          {groupedPermissions.length >
                          0 ? (
                            groupedPermissions.map(
                              ([
                                resource,
                                permissions,
                              ]) => (
                                <div
                                  key={
                                    resource
                                  }
                                >
                                  <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-[#11141A]/95 sm:px-5">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                      {formatLabel(
                                        resource,
                                      )}
                                    </p>
                                  </div>


                                  {permissions.map(
                                    permission => (
                                      <PermissionRow
                                        key={
                                          permission.id
                                        }
                                        permission={
                                          permission
                                        }
                                        checked={
                                          selectedKeys.has(
                                            permission.key,
                                          )
                                        }
                                        disabled={
                                          !canEditSelectedRole
                                        }
                                        onToggle={() =>
                                          togglePermission(
                                            permission.key,
                                          )
                                        }
                                      />
                                    ),
                                  )}
                                </div>
                              ),
                            )
                          ) : (
                            <div className="py-14 text-center">
                              <Search className="mx-auto h-6 w-6 text-slate-300" />

                              <p className="mt-2 text-xs font-semibold">
                                No permissions match
                              </p>
                            </div>
                          )}
                        </div>


                        <div className="flex min-h-[58px] items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-[#101319] sm:px-5">

                          <div className="min-w-0">
                            {selectedRole.isSystem ? (
                              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <LockKeyhole className="h-3.5 w-3.5" />

                                Protected SaMi system role
                              </p>
                            ) : selectedRole.status ===
                              'disabled' ? (
                              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                                Enable this role before editing permissions.
                              </p>
                            ) : !canManage ? (
                              <p className="text-[11px] text-slate-400">
                                You have read-only access.
                              </p>
                            ) : (
                              <p className="truncate text-[11px] text-slate-400">
                                {
                                  selectedKeys.size
                                }{' '}
                                permissions selected
                              </p>
                            )}
                          </div>


                          {canEditSelectedRole && (
                            <button
                              type="button"
                              disabled={
                                !dirty ||
                                saving
                              }
                              onClick={() =>
                                void savePermissions()
                              }
                              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}

                              Save
                            </button>
                          )}
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>


      {/* ROLE EDITOR */}

      {editor.open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5">

          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close role editor"
            onClick={() =>
              !editorSaving &&
              setEditor(
                EMPTY_EDITOR,
              )
            }
          />


          <div className="relative z-10 w-full rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#15181F] sm:max-w-lg sm:rounded-2xl sm:p-6">

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Access role
                </p>

                <h2 className="mt-1 text-lg font-semibold">
                  {editor.mode ===
                  'create'
                    ? 'Create role'
                    : 'Edit role'}
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Define the role identity here. Permissions are managed separately.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  editorSaving
                }
                onClick={() =>
                  setEditor(
                    EMPTY_EDITOR,
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>


            <div className="mt-5 space-y-4">

              <label className="block">
                <span className="text-xs font-semibold">
                  Role name
                </span>

                <input
                  autoFocus
                  value={
                    editor.name
                  }
                  maxLength={
                    120
                  }
                  onChange={
                    event =>
                      setEditor(
                        current => ({
                          ...current,

                          name:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="e.g. Sales Manager"
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
                />
              </label>


              <label className="block">
                <span className="text-xs font-semibold">
                  Description
                </span>

                <textarea
                  value={
                    editor.description
                  }
                  maxLength={
                    1000
                  }
                  onChange={
                    event =>
                      setEditor(
                        current => ({
                          ...current,

                          description:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="What should this role be used for?"
                  rows={
                    3
                  }
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
                />
              </label>
            </div>


            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={
                  editorSaving
                }
                onClick={() =>
                  setEditor(
                    EMPTY_EDITOR,
                  )
                }
                className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  editorSaving ||
                  !editor.name.trim()
                }
                onClick={() =>
                  void saveRoleEditor()
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                {editorSaving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {editor.mode ===
                'create'
                  ? 'Create role'
                  : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


/* ================================================================
   ROLE LIST ITEM
   ================================================================ */

function RoleListItem({
  role,
  active,
  onClick,
}: {
  role:
    WorkspaceRole;

  active:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition',
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
          : 'hover:bg-slate-50 dark:hover:bg-white/[0.05]',
      ].join(
        ' ',
      )}
    >
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          active
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
            : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
        ].join(
          ' ',
        )}
      >
        {role.isSystem ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <Shield className="h-4 w-4" />
        )}
      </div>


      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-semibold">
            {role.name}
          </p>

          {role.status ===
            'disabled' && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          )}
        </div>

        <p className="mt-0.5 text-[10px] text-slate-400">
          {role.permissionCount}{' '}
          permissions ·{' '}
          {role.assignedUserCount}{' '}
          users
        </p>
      </div>


      <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
    </button>
  );
}


/* ================================================================
   PERMISSION ROW
   ================================================================ */

function PermissionRow({
  permission,
  checked,
  disabled,
  onToggle,
}: {
  permission:
    PermissionItem;

  checked:
    boolean;

  disabled:
    boolean;

  onToggle:
    () => void;
}) {
  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onToggle
      }
      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-blue-50/40 disabled:cursor-default dark:border-white/10 dark:hover:bg-blue-500/[0.05] sm:px-5"
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition',
          checked
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-300 bg-white dark:border-white/20 dark:bg-transparent',
          disabled
            ? 'opacity-70'
            : '',
        ].join(
          ' ',
        )}
      >
        {checked && (
          <Check className="h-3.5 w-3.5" />
        )}
      </span>


      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {permission.name}
          </p>

          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium uppercase text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            {permission.scope}
          </span>
        </div>


        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {permission.key}
        </p>
      </div>


      <span className="hidden shrink-0 text-[10px] text-slate-400 sm:block">
        {formatLabel(
          permission.action,
        )}
      </span>
    </button>
  );
}


/* ================================================================
   GROUP BUTTON
   ================================================================ */

function GroupButton({
  active,
  label,
  onClick,
}: {
  active:
    boolean;

  label:
    string;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'h-8 shrink-0 rounded-lg px-3 text-[10px] font-semibold transition',
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-700 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-300',
      ].join(
        ' ',
      )}
    >
      {label}
    </button>
  );
}


/* ================================================================
   ROLE MENU BUTTON
   ================================================================ */

function RoleMenuButton({
  icon:
    Icon,
  label,
  onClick,
  danger =
    false,
}: {
  icon:
    typeof Edit3;

  label:
    string;

  onClick:
    () => void;

  danger?:
    boolean;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
          : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-300',
      ].join(
        ' ',
      )}
    >
      <Icon className="h-4 w-4" />

      {label}
    </button>
  );
}


/* ================================================================
   MESSAGE
   ================================================================ */

function Message({
  type,
  text,
  onClose,
}: {
  type:
    'error'
    | 'success';

  text:
    string;

  onClose:
    () => void;
}) {
  return (
    <div
      className={[
        'mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs',
        type ===
          'error'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
      ].join(
        ' ',
      )}
    >
      <span>
        {text}
      </span>

      <button
        type="button"
        onClick={
          onClose
        }
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}