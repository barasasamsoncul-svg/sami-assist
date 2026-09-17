'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  Crown,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import SaMiOverlay, {
  type SaMiOverlayAction,
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';


/* ============================================================
   TYPES
   ============================================================ */

type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;

  lifecycle: {
    archivedAt: string | null;
    deletionPending: boolean;
    deletionRequestedAt: string | null;
    deletionScheduledFor: string | null;
    deletionCancelledAt: string | null;
  };
};


type WorkspaceAccess = {
  isOwner: boolean;
  canManageWorkspace: boolean;
  canManageLifecycle: boolean;
  canTransferOwnership: boolean;
};


type WorkspaceOwner = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
};


type OwnershipTransfer = {
  id: string;
  status: string;

  fromUserId: string;
  toUserId: string;

  fromEmail: string;
  fromName: string;

  toEmail: string;
  toName: string;

  requestedAt: string | null;
  expiresAt: string | null;

  isIncoming: boolean;
  isOutgoing: boolean;
};


type TransferCandidate = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
};


type WorkspaceResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;

  workspace?: WorkspaceRecord;

  access?: WorkspaceAccess;

  owner?:
    | WorkspaceOwner
    | null;

  ownershipTransfer?:
    | OwnershipTransfer
    | null;

  transferCandidates?:
    TransferCandidate[];

  deletion?: {
    pending?: boolean;
    scheduledFor?: string | null;
    graceDays?: number;
  };

  transfer?: {
    id?: string;
    status?: string;
    fromUserId?: string;
    toUserId?: string;
    requestedAt?: string | null;
    expiresAt?: string | null;
  };
};


type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};


type WorkspaceView =
  | 'overview'
  | 'details'
  | 'ownership'
  | 'lifecycle';


/* ============================================================
   CONSTANTS
   ============================================================ */

const CLOSED_OVERLAY:
  OverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};


const VALID_VIEWS =
  new Set<WorkspaceView>([
    'overview',
    'details',
    'ownership',
    'lifecycle',
  ]);


/* ============================================================
   HELPERS
   ============================================================ */

function formatStatus(
  value?: string | null,
) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase(),
    );
}


function formatDateTime(
  value?: string | null,
) {
  if (!value) {
    return 'Not available';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    },
  ).format(
    date,
  );
}


function getPersonName(
  person:
    | WorkspaceOwner
    | TransferCandidate,
) {
  const fullName =
    person.fullName?.trim();

  if (
    fullName
  ) {
    return fullName;
  }

  const combined =
    `${person.firstName || ''} ${
      person.lastName || ''
    }`
      .trim();

  return (
    combined ||
    person.email
  );
}


function normalizeView(
  value:
    string | null,
): WorkspaceView {
  if (
    value &&
    VALID_VIEWS.has(
      value as WorkspaceView,
    )
  ) {
    return value as WorkspaceView;
  }

  return 'overview';
}


async function readResponse(
  response:
    Response,
): Promise<WorkspaceResponse> {
  try {
    return (
      await response.json()
    ) as WorkspaceResponse;
  } catch {
    return {
      success:
        false,

      code:
        'INVALID_SERVER_RESPONSE',

      error:
        'SaMi returned an invalid response.',
    };
  }
}


/* ============================================================
   COMPONENT
   ============================================================ */

export default function WorkspaceSettings() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();


  const [
    view,
    setView,
  ] =
    useState<WorkspaceView>(
      'overview',
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    );


  const [
    savingDetails,
    setSavingDetails,
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
    >(null);


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      WorkspaceRecord | null
    >(null);


  const [
    access,
    setAccess,
  ] =
    useState<
      WorkspaceAccess | null
    >(null);


  const [
    owner,
    setOwner,
  ] =
    useState<
      WorkspaceOwner | null
    >(null);


  const [
    ownershipTransfer,
    setOwnershipTransfer,
  ] =
    useState<
      OwnershipTransfer | null
    >(null);


  const [
    transferCandidates,
    setTransferCandidates,
  ] =
    useState<
      TransferCandidate[]
    >([]);


  const [
    name,
    setName,
  ] =
    useState(
      '',
    );


  const [
    slug,
    setSlug,
  ] =
    useState(
      '',
    );


  const [
    selectedTransferUserId,
    setSelectedTransferUserId,
  ] =
    useState(
      '',
    );


  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>(
      CLOSED_OVERLAY,
    );


  /* ==========================================================
     VIEW ROUTING
     ========================================================== */

  useEffect(
    () => {
      setView(
        normalizeView(
          searchParams.get(
            'workspace',
          ),
        ),
      );
    },
    [
      searchParams,
    ],
  );


  const navigate =
    useCallback(
      (
        nextView:
          WorkspaceView,
      ) => {
        const params =
          new URLSearchParams(
            searchParams.toString(),
          );

        params.set(
          'tab',
          'workspace',
        );

        if (
          nextView ===
          'overview'
        ) {
          params.delete(
            'workspace',
          );
        } else {
          params.set(
            'workspace',
            nextView,
          );
        }

        router.push(
          `/settings?${params.toString()}`,
          {
            scroll:
              false,
          },
        );
      },
      [
        router,
        searchParams,
      ],
    );


  /* ==========================================================
     OVERLAY
     ========================================================== */

  const closeOverlay =
    useCallback(
      () => {
        setOverlay(
          CLOSED_OVERLAY,
        );
      },
      [],
    );


  const showMessage =
    useCallback(
      (
        type:
          SaMiOverlayType,

        title:
          string,

        message:
          string,
      ) => {
        setOverlay({
          open:
            true,

          type,

          title,

          message,

          primaryAction: {
            label:
              'OK',

            onClick:
              closeOverlay,
          },
        });
      },
      [
        closeOverlay,
      ],
    );


  /* ==========================================================
     LOAD WORKSPACE
     ========================================================== */

  const loadWorkspace =
    useCallback(
      async (
        silent =
          false,
      ) => {
        if (
          silent
        ) {
          setRefreshing(
            true,
          );
        } else {
          setLoading(
            true,
          );
        }

        try {
          const response =
            await fetch(
              '/api/workspace',
              {
                method:
                  'GET',

                headers: {
                  Accept:
                    'application/json',
                },

                credentials:
                  'same-origin',

                cache:
                  'no-store',
              },
            );


          const data =
            await readResponse(
              response,
            );


          if (
            !response.ok ||
            !data.success ||
            !data.workspace ||
            !data.access
          ) {
            throw new Error(
              data.error ||
                'Workspace settings could not be loaded.',
            );
          }


          setWorkspace(
            data.workspace,
          );


          setAccess(
            data.access,
          );


          setOwner(
            data.owner ||
              null,
          );


          setOwnershipTransfer(
            data.ownershipTransfer ||
              null,
          );


          setTransferCandidates(
            Array.isArray(
              data.transferCandidates,
            )
              ? data.transferCandidates
              : [],
          );


          setName(
            data.workspace
              .name,
          );


          setSlug(
            data.workspace
              .slug,
          );


          setSelectedTransferUserId(
            current => {
              if (
                current &&
                data.transferCandidates?.some(
                  candidate =>
                    candidate.id ===
                    current,
                )
              ) {
                return current;
              }

              return '';
            },
          );
        } catch (
          error
        ) {
          showMessage(
            'error',
            'Workspace unavailable',
            error instanceof
              Error
              ? error.message
              : 'Workspace settings could not be loaded.',
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },
      [
        showMessage,
      ],
    );


  useEffect(
    () => {
      void loadWorkspace();
    },
    [
      loadWorkspace,
    ],
  );


  /* ==========================================================
     DERIVED
     ========================================================== */

  const detailsChanged =
    useMemo(
      () => {
        if (
          !workspace
        ) {
          return false;
        }

        return (
          name
            .trim() !==
            workspace.name ||
          slug
            .trim()
            .toLowerCase() !==
            workspace.slug
        );
      },
      [
        name,
        slug,
        workspace,
      ],
    );


  const selectedCandidate =
    useMemo(
      () =>
        transferCandidates.find(
          candidate =>
            candidate.id ===
            selectedTransferUserId,
        ) ||
        null,
      [
        transferCandidates,
        selectedTransferUserId,
      ],
    );


  /* ==========================================================
     SAVE DETAILS
     ========================================================== */

  async function saveWorkspaceDetails() {
    if (
      !workspace ||
      !access
        ?.canManageWorkspace ||
      savingDetails
    ) {
      return;
    }


    const nextName =
      name
        .trim()
        .replace(
          /\s+/g,
          ' ',
        );


    const nextSlug =
      slug
        .trim()
        .toLowerCase();


    if (
      nextName.length <
      2
    ) {
      showMessage(
        'warning',
        'Check workspace name',
        'Enter a workspace name with at least 2 characters.',
      );

      return;
    }


    if (
      nextSlug.length <
      3
    ) {
      showMessage(
        'warning',
        'Check workspace address',
        'Enter a workspace address with at least 3 characters.',
      );

      return;
    }


    setSavingDetails(
      true,
    );


    try {
      const response =
        await fetch(
          '/api/workspace',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                name:
                  nextName,

                slug:
                  nextSlug,
              }),
          },
        );


      const data =
        await readResponse(
          response,
        );


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Workspace details could not be saved.',
        );
      }


      await loadWorkspace(
        true,
      );


      router.refresh();


      showMessage(
        'success',
        'Workspace updated',
        data.message ||
          'Workspace details were updated.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Update failed',
        error instanceof
          Error
          ? error.message
          : 'Workspace details could not be saved.',
      );
    } finally {
      setSavingDetails(
        false,
      );
    }
  }


  /* ==========================================================
     ACTION REQUEST
     ========================================================== */

  async function runWorkspaceAction(
    action:
      string,

    payload:
      Record<
        string,
        unknown
      > = {},
  ) {
    if (
      actionLoading
    ) {
      return null;
    }


    setActionLoading(
      action,
    );


    try {
      const response =
        await fetch(
          '/api/workspace',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                action,
                ...payload,
              }),
          },
        );


      const data =
        await readResponse(
          response,
        );


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'The workspace action could not be completed.',
        );
      }


      await loadWorkspace(
        true,
      );


      router.refresh();


      return data;
    } finally {
      setActionLoading(
        null,
      );
    }
  }


  /* ==========================================================
     CLOSE WORKSPACE
     ========================================================== */

  function confirmWorkspaceClosure() {
    if (
      !workspace ||
      !access
        ?.canManageLifecycle
    ) {
      return;
    }


    setOverlay({
      open:
        true,

      type:
        'warning',

      title:
        'Close workspace?',

      message:
        'The workspace will be scheduled for closure. You can cancel the closure during the grace period before permanent deletion.',

      primaryAction: {
        label:
          'Schedule closure',

        onClick:
          () => {
            closeOverlay();

            void requestWorkspaceClosure();
          },
      },

      secondaryAction: {
        label:
          'Keep workspace',

        onClick:
          closeOverlay,
      },
    });
  }


  async function requestWorkspaceClosure() {
    try {
      const data =
        await runWorkspaceAction(
          'request_deletion',
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Workspace closure scheduled',
        data.deletion
          ?.scheduledFor
          ? `The workspace is scheduled for closure on ${formatDateTime(
              data.deletion
                .scheduledFor,
            )}.`
          : data.message ||
              'Workspace closure was scheduled.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Closure could not be scheduled',
        error instanceof
          Error
          ? error.message
          : 'The workspace could not be scheduled for closure.',
      );
    }
  }


  function confirmCancelClosure() {
    setOverlay({
      open:
        true,

      type:
        'info',

      title:
        'Keep this workspace?',

      message:
        'This will cancel the scheduled workspace closure and keep the workspace available.',

      primaryAction: {
        label:
          'Cancel closure',

        onClick:
          () => {
            closeOverlay();

            void cancelWorkspaceClosure();
          },
      },

      secondaryAction: {
        label:
          'Back',

        onClick:
          closeOverlay,
      },
    });
  }


  async function cancelWorkspaceClosure() {
    try {
      const data =
        await runWorkspaceAction(
          'cancel_deletion',
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Workspace kept open',
        data.message ||
          'The scheduled workspace closure was cancelled.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Could not cancel closure',
        error instanceof
          Error
          ? error.message
          : 'The scheduled workspace closure could not be cancelled.',
      );
    }
  }


  /* ==========================================================
     OWNERSHIP TRANSFER
     ========================================================== */

  function confirmOwnershipTransfer() {
    if (
      !selectedCandidate
    ) {
      showMessage(
        'warning',
        'Choose a new owner',
        'Select an active workspace member before transferring ownership.',
      );

      return;
    }


    setOverlay({
      open:
        true,

      type:
        'warning',

      title:
        'Transfer workspace ownership?',

      message:
        `Ownership will be offered to ${getPersonName(
          selectedCandidate,
        )}. You remain the owner until they accept.`,

      primaryAction: {
        label:
          'Send transfer',

        onClick:
          () => {
            closeOverlay();

            void requestOwnershipTransfer();
          },
      },

      secondaryAction: {
        label:
          'Cancel',

        onClick:
          closeOverlay,
      },
    });
  }


  async function requestOwnershipTransfer() {
    if (
      !selectedCandidate
    ) {
      return;
    }


    try {
      const data =
        await runWorkspaceAction(
          'request_ownership_transfer',
          {
            targetUserId:
              selectedCandidate.id,
          },
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Ownership transfer sent',
        data.message ||
          'The selected member can now accept or decline the ownership transfer.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Transfer could not be sent',
        error instanceof
          Error
          ? error.message
          : 'Workspace ownership could not be transferred.',
      );
    }
  }


  function confirmCancelTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    setOverlay({
      open:
        true,

      type:
        'warning',

      title:
        'Cancel ownership transfer?',

      message:
        'The pending ownership transfer will be cancelled and you will remain the workspace owner.',

      primaryAction: {
        label:
          'Cancel transfer',

        onClick:
          () => {
            closeOverlay();

            void cancelOwnershipTransfer();
          },
      },

      secondaryAction: {
        label:
          'Back',

        onClick:
          closeOverlay,
      },
    });
  }


  async function cancelOwnershipTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    try {
      const data =
        await runWorkspaceAction(
          'cancel_ownership_transfer',
          {
            transferId:
              ownershipTransfer.id,
          },
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Ownership transfer cancelled',
        data.message ||
          'The ownership transfer was cancelled.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Transfer could not be cancelled',
        error instanceof
          Error
          ? error.message
          : 'The ownership transfer could not be cancelled.',
      );
    }
  }


  function confirmAcceptTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    setOverlay({
      open:
        true,

      type:
        'warning',

      title:
        'Accept workspace ownership?',

      message:
        'You will become the workspace owner and receive final control of workspace management.',

      primaryAction: {
        label:
          'Accept ownership',

        onClick:
          () => {
            closeOverlay();

            void acceptOwnershipTransfer();
          },
      },

      secondaryAction: {
        label:
          'Not now',

        onClick:
          closeOverlay,
      },
    });
  }


  async function acceptOwnershipTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    try {
      const data =
        await runWorkspaceAction(
          'accept_ownership_transfer',
          {
            transferId:
              ownershipTransfer.id,
          },
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Ownership accepted',
        data.message ||
          'You are now the workspace owner.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Ownership could not be accepted',
        error instanceof
          Error
          ? error.message
          : 'The ownership transfer could not be accepted.',
      );
    }
  }


  function confirmRejectTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    setOverlay({
      open:
        true,

      type:
        'warning',

      title:
        'Decline workspace ownership?',

      message:
        'The ownership transfer will be declined and the current owner will keep control of the workspace.',

      primaryAction: {
        label:
          'Decline ownership',

        onClick:
          () => {
            closeOverlay();

            void rejectOwnershipTransfer();
          },
      },

      secondaryAction: {
        label:
          'Back',

        onClick:
          closeOverlay,
      },
    });
  }


  async function rejectOwnershipTransfer() {
    if (
      !ownershipTransfer
    ) {
      return;
    }


    try {
      const data =
        await runWorkspaceAction(
          'reject_ownership_transfer',
          {
            transferId:
              ownershipTransfer.id,
          },
        );


      if (
        !data
      ) {
        return;
      }


      showMessage(
        'success',
        'Ownership declined',
        data.message ||
          'The ownership transfer was declined.',
      );
    } catch (
      error
    ) {
      showMessage(
        'error',
        'Ownership could not be declined',
        error instanceof
          Error
          ? error.message
          : 'The ownership transfer could not be declined.',
      );
    }
  }


  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[26px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0d121b]">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

          <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
            Loading workspace…
          </p>
        </div>
      </section>
    );
  }


  /* ==========================================================
     EMPTY
     ========================================================== */

  if (
    !workspace ||
    !access
  ) {
    return (
      <>
        <section className="flex min-h-[420px] items-center justify-center rounded-[26px] border border-slate-200 bg-white px-6 text-center dark:border-slate-800 dark:bg-[#0d121b]">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Building2 className="h-5 w-5" />
            </div>

            <h2 className="mt-4 text-sm font-black">
              Workspace unavailable
            </h2>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              SaMi could not load this workspace.
            </p>
          </div>
        </section>

        <Overlay
          state={
            overlay
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }


  /* ==========================================================
     OVERVIEW
     ========================================================== */

  if (
    view ===
    'overview'
  ) {
    return (
      <>
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">
            <div className="p-5 sm:p-7">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <Building2 className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-black text-slate-950 dark:text-white">
                    {workspace.name}
                  </h2>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {workspace.slug}
                    </span>

                    <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />

                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {formatStatus(
                        workspace.status,
                      )}
                    </span>
                  </div>
                </div>

                {refreshing && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>
          </section>


          {ownershipTransfer
            ?.isIncoming && (
            <button
              type="button"
              onClick={
                () =>
                  navigate(
                    'ownership',
                  )
              }
              className="flex w-full items-center gap-4 rounded-[22px] border border-violet-200 bg-violet-50/70 p-5 text-left transition hover:border-violet-300 dark:border-violet-900/60 dark:bg-violet-950/20"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
                <Crown className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Ownership offered to you
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">
                  Review the pending ownership transfer.
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-violet-500" />
            </button>
          )}


          {workspace.lifecycle
            .deletionPending && (
            <button
              type="button"
              onClick={
                () =>
                  navigate(
                    'lifecycle',
                  )
              }
              className="flex w-full items-center gap-4 rounded-[22px] border border-red-200 bg-red-50/70 p-5 text-left transition hover:border-red-300 dark:border-red-900/60 dark:bg-red-950/20"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white">
                <CalendarClock className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-red-700 dark:text-red-300">
                  Workspace closure scheduled
                </p>

                <p className="mt-1 text-xs leading-5 text-red-700/70 dark:text-red-200/70">
                  Scheduled for{' '}
                  {formatDateTime(
                    workspace.lifecycle
                      .deletionScheduledFor,
                  )}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-red-500" />
            </button>
          )}


          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">
            <WorkspaceMenuRow
              icon={
                Building2
              }
              title="Workspace details"
              description="Name, workspace address and workspace information."
              value={
                access.canManageWorkspace
                  ? 'Manage'
                  : 'View'
              }
              onClick={
                () =>
                  navigate(
                    'details',
                  )
              }
            />

            <WorkspaceMenuRow
              icon={
                Crown
              }
              title="Ownership"
              description="Workspace owner and ownership transfer."
              value={
                ownershipTransfer
                  ? ownershipTransfer.isIncoming
                    ? 'Action required'
                    : 'Transfer pending'
                  : access.isOwner
                    ? 'You are owner'
                    : owner
                      ? getPersonName(
                          owner,
                        )
                      : 'Owner'
              }
              onClick={
                () =>
                  navigate(
                    'ownership',
                  )
              }
            />

            <WorkspaceMenuRow
              icon={
                ShieldCheck
              }
              title="Workspace status"
              description="Workspace availability, closure and lifecycle controls."
              value={
                workspace.lifecycle
                  .deletionPending
                  ? 'Closure pending'
                  : formatStatus(
                      workspace.status,
                    )
              }
              onClick={
                () =>
                  navigate(
                    'lifecycle',
                  )
              }
              last
            />
          </section>
        </div>


        <Overlay
          state={
            overlay
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }


  /* ==========================================================
     WORKSPACE DETAILS
     ========================================================== */

  if (
    view ===
    'details'
  ) {
    return (
      <>
        <DetailShell
          title="Workspace details"
          description="Manage the identity of this workspace."
          onBack={
            () =>
              navigate(
                'overview',
              )
          }
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <Field>
              <FieldLabel>
                Workspace name
              </FieldLabel>

              <input
                value={
                  name
                }
                onChange={
                  event =>
                    setName(
                      event.target
                        .value,
                    )
                }
                disabled={
                  !access.canManageWorkspace ||
                  savingDetails
                }
                maxLength={
                  200
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
              />
            </Field>


            <Field>
              <FieldLabel>
                Workspace address
              </FieldLabel>

              <input
                value={
                  slug
                }
                onChange={
                  event =>
                    setSlug(
                      event.target
                        .value,
                    )
                }
                disabled={
                  !access.canManageWorkspace ||
                  savingDetails
                }
                maxLength={
                  200
                }
                spellCheck={
                  false
                }
                autoCapitalize="none"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
              />
            </Field>
          </div>


          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <InfoCard
              label="Workspace status"
              value={formatStatus(
                workspace.status,
              )}
            />

            <InfoCard
              label="Created"
              value={formatDateTime(
                workspace.createdAt,
              )}
            />

            <InfoCard
              label="Last updated"
              value={formatDateTime(
                workspace.updatedAt,
              )}
            />

            <InfoCard
              label="Your access"
              value={
                access.isOwner
                  ? 'Workspace Owner'
                  : 'Workspace Member'
              }
            />
          </div>


          {access.canManageWorkspace ? (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={
                  () =>
                    void saveWorkspaceDetails()
                }
                disabled={
                  !detailsChanged ||
                  savingDetails
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingDetails ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                Save changes
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Workspace identity is controlled by the workspace owner.
              </p>
            </div>
          )}
        </DetailShell>


        <Overlay
          state={
            overlay
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }


  /* ==========================================================
     OWNERSHIP
     ========================================================== */

  if (
    view ===
    'ownership'
  ) {
    return (
      <>
        <DetailShell
          title="Ownership"
          description="Review workspace ownership and transfer control when required."
          onBack={
            () =>
              navigate(
                'overview',
              )
          }
        >
          {owner ? (
            <div className="flex flex-col gap-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                  <UserRound className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {getPersonName(
                      owner,
                    )}
                  </p>

                  <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {owner.email}
                  </p>
                </div>
              </div>

              <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-black text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <Crown className="h-3.5 w-3.5" />

                Workspace Owner
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Workspace ownership information is unavailable.
              </p>
            </div>
          )}


          {ownershipTransfer
            ?.isOutgoing && (
            <div className="mt-5 rounded-[20px] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <ArrowRightLeft className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950 dark:text-white">
                    Ownership transfer pending
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Waiting for{' '}
                    <strong>
                      {ownershipTransfer.toName ||
                        ownershipTransfer.toEmail}
                    </strong>{' '}
                    to accept.
                  </p>

                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    Expires{' '}
                    {formatDateTime(
                      ownershipTransfer.expiresAt,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={
                    confirmCancelTransfer
                  }
                  disabled={
                    actionLoading !==
                    null
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {actionLoading ===
                  'cancel_ownership_transfer' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}

                  Cancel transfer
                </button>
              </div>
            </div>
          )}


          {ownershipTransfer
            ?.isIncoming && (
            <div className="mt-5 rounded-[20px] border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                  <Crown className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950 dark:text-white">
                    Ownership offered to you
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {ownershipTransfer.fromName ||
                      ownershipTransfer.fromEmail}{' '}
                    has offered you ownership of this workspace.
                  </p>

                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    Expires{' '}
                    {formatDateTime(
                      ownershipTransfer.expiresAt,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    confirmRejectTransfer
                  }
                  disabled={
                    actionLoading !==
                    null
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <X className="h-4 w-4" />

                  Decline
                </button>

                <button
                  type="button"
                  onClick={
                    confirmAcceptTransfer
                  }
                  disabled={
                    actionLoading !==
                    null
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
                >
                  {actionLoading ===
                  'accept_ownership_transfer' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}

                  Accept ownership
                </button>
              </div>
            </div>
          )}


          {access.canTransferOwnership &&
            !ownershipTransfer && (
              <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
                <div className="mb-4">
                  <p className="text-xs font-black text-slate-950 dark:text-white">
                    Transfer ownership
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Ownership can be transferred to an active workspace member.
                  </p>
                </div>


                {transferCandidates.length >
                0 ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <FieldLabel>
                        New owner
                      </FieldLabel>

                      <select
                        value={
                          selectedTransferUserId
                        }
                        onChange={
                          event =>
                            setSelectedTransferUserId(
                              event.target
                                .value,
                            )
                        }
                        disabled={
                          actionLoading !==
                          null
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="">
                          Select a member
                        </option>

                        {transferCandidates.map(
                          candidate => (
                            <option
                              key={
                                candidate.id
                              }
                              value={
                                candidate.id
                              }
                            >
                              {getPersonName(
                                candidate,
                              )}{' '}
                              —{' '}
                              {candidate.email}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={
                        confirmOwnershipTransfer
                      }
                      disabled={
                        !selectedTransferUserId ||
                        actionLoading !==
                          null
                      }
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <ArrowRightLeft className="h-4 w-4" />

                      Transfer ownership
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      There are no other active workspace members available for ownership transfer.
                    </p>
                  </div>
                )}
              </div>
            )}
        </DetailShell>


        <Overlay
          state={
            overlay
          }
          onClose={
            closeOverlay
          }
        />
      </>
    );
  }


  /* ==========================================================
     LIFECYCLE
     ========================================================== */

  return (
    <>
      <DetailShell
        title="Workspace status"
        description="Review workspace availability and protected lifecycle controls."
        onBack={
          () =>
            navigate(
              'overview',
            )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            label="Current status"
            value={formatStatus(
              workspace.status,
            )}
          />

          <InfoCard
            label="Created"
            value={formatDateTime(
              workspace.createdAt,
            )}
          />

          <InfoCard
            label="Last updated"
            value={formatDateTime(
              workspace.updatedAt,
            )}
          />

          <InfoCard
            label="Closure"
            value={
              workspace.lifecycle
                .deletionPending
                ? 'Scheduled'
                : 'Not scheduled'
            }
          />
        </div>


        {workspace.lifecycle
          .deletionPending && (
          <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50/70 p-5 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />

              <div className="min-w-0">
                <p className="text-sm font-black text-red-700 dark:text-red-300">
                  Workspace closure scheduled
                </p>

                <p className="mt-2 text-xs leading-5 text-red-700/80 dark:text-red-200/80">
                  Closure is scheduled for{' '}
                  <strong>
                    {formatDateTime(
                      workspace.lifecycle
                        .deletionScheduledFor,
                    )}
                  </strong>
                  .
                </p>

                <p className="mt-2 text-xs leading-5 text-red-700/70 dark:text-red-200/70">
                  Requested{' '}
                  {formatDateTime(
                    workspace.lifecycle
                      .deletionRequestedAt,
                  )}
                </p>
              </div>
            </div>


            {access.canManageLifecycle && (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={
                    confirmCancelClosure
                  }
                  disabled={
                    actionLoading !==
                    null
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                >
                  {actionLoading ===
                  'cancel_deletion' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}

                  Cancel closure
                </button>
              </div>
            )}
          </div>
        )}


        {!workspace.lifecycle
          .deletionPending &&
          access.canManageLifecycle && (
            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <div className="rounded-[20px] border border-red-200 bg-red-50/40 p-5 dark:border-red-950/60 dark:bg-red-950/10">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    <AlertTriangle className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      Close this workspace
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Schedule the workspace for closure. The workspace owner can cancel during the grace period.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={
                      confirmWorkspaceClosure
                    }
                    disabled={
                      actionLoading !==
                      null
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                  >
                    {actionLoading ===
                    'request_deletion' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}

                    Close workspace
                  </button>
                </div>
              </div>
            </div>
          )}


        {!access.canManageLifecycle && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Workspace lifecycle controls are available to the workspace owner.
            </p>
          </div>
        )}
      </DetailShell>


      <Overlay
        state={
          overlay
        }
        onClose={
          closeOverlay
        }
      />
    </>
  );
}


/* ============================================================
   DETAIL SHELL
   ============================================================ */

function DetailShell({
  title,
  description,
  onBack,
  children,
}: {
  title:
    string;

  description:
    string;

  onBack:
    () => void;

  children:
    React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-7 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={
              onBack
            }
            aria-label="Back to workspace settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>

          <div className="min-w-0 pt-1">
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              {title}
            </h2>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {children}
      </div>
    </section>
  );
}


/* ============================================================
   MENU ROW
   ============================================================ */

function WorkspaceMenuRow({
  icon:
    Icon,
  title,
  description,
  value,
  onClick,
  last =
    false,
}: {
  icon:
    typeof Building2;

  title:
    string;

  description:
    string;

  value:
    string;

  onClick:
    () => void;

  last?:
    boolean;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-slate-50 sm:px-7 dark:hover:bg-slate-900/60 ${
        last
          ? ''
          : 'border-b border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-slate-950 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="max-w-[180px] truncate text-[11px] font-bold text-slate-400">
          {value}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-700" />
    </button>
  );
}


/* ============================================================
   FIELD
   ============================================================ */

function Field({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div>
      {children}
    </div>
  );
}


function FieldLabel({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <label className="text-[11px] font-black uppercase tracking-[0.07em] text-slate-500 dark:text-slate-400">
      {children}
    </label>
  );
}


/* ============================================================
   INFO CARD
   ============================================================ */

function InfoCard({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-extrabold text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}


/* ============================================================
   OVERLAY
   ============================================================ */

function Overlay({
  state,
  onClose,
}: {
  state:
    OverlayState;

  onClose:
    () => void;
}) {
  return (
    <SaMiOverlay
      open={
        state.open
      }
      type={
        state.type
      }
      title={
        state.title
      }
      message={
        state.message
      }
      primaryAction={
        state.primaryAction
      }
      secondaryAction={
        state.secondaryAction
      }
      onClose={
        onClose
      }
    />
  );
}