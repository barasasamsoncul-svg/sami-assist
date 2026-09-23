'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code2,
  Globe2,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wrench,
  Zap,
} from 'lucide-react';

import type {
  PlatformSettings,
  PlatformSettingsHistoryItem,
  PlatformSettingsSnapshot,
} from '@/lib/admin/platform-settings';


type Props = {
  initialSnapshot:
    PlatformSettingsSnapshot;
  initialHistory:
    PlatformSettingsHistoryItem[];
  canManage:
    boolean;
};

type ApiPayload = {
  success?: boolean;
  code?: string;
  error?: string;
  field?: string;
  snapshot?: PlatformSettingsSnapshot;
  history?: PlatformSettingsHistoryItem[];
};


function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange:
    (value: boolean) =>
      void;
  disabled: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <span className="min-w-0">
        <span className="block text-sm font-black text-zinc-950 dark:text-white">
          {label}
        </span>

        <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={
          checked
        }
        onClick={
          () =>
            onChange(
              !checked,
            )
        }
        disabled={
          disabled
        }
        className={
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ' +
          (
            checked
              ? 'bg-blue-600'
              : 'bg-zinc-300 dark:bg-zinc-700'
          )
        }
      >
        <span
          className={
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ' +
            (
              checked
                ? 'left-6'
                : 'left-1'
            )
          }
        />
      </button>
    </label>
  );
}


function Section({
  title,
  description,
  icon:
    Icon,
  children,
}: {
  title: string;
  description: string;
  icon:
    React.ElementType;
  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </span>

        <div>
          <h2 className="font-black text-zinc-950 dark:text-white">
            {title}
          </h2>

          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}


function FieldLabel({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="text-xs font-black text-zinc-700 dark:text-zinc-300">
      {children}
    </span>
  );
}


function cloneSettings(
  value:
    PlatformSettings,
) {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as
    PlatformSettings;
}


export default function PlatformSettingsForm({
  initialSnapshot,
  initialHistory,
  canManage,
}: Props) {
  const [
    snapshot,
    setSnapshot,
  ] =
    useState(
      initialSnapshot,
    );

  const [
    draft,
    setDraft,
  ] =
    useState(
      cloneSettings(
        initialSnapshot.settings,
      ),
    );

  const [
    history,
    setHistory,
  ] =
    useState(
      initialHistory,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    notice,
    setNotice,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    failure,
    setFailure,
  ] =
    useState<
      string |
      null
    >(null);

  const changed =
    useMemo(
      () =>
        JSON.stringify(
          draft,
        ) !==
        JSON.stringify(
          snapshot.settings,
        ),
      [
        draft,
        snapshot.settings,
      ],
    );

  const disabled =
    !canManage ||
    saving ||
    !snapshot.ready;

  function update<
    SectionKey extends
      keyof PlatformSettings,
    FieldKey extends
      keyof PlatformSettings[SectionKey],
  >(
    section:
      SectionKey,
    field:
      FieldKey,
    value:
      PlatformSettings[SectionKey][FieldKey],
  ) {
    setDraft(
      current => ({
        ...current,
        [section]: {
          ...current[
            section
          ],
          [field]:
            value,
        },
      }),
    );
  }

  async function reload() {
    setFailure(
      null,
    );

    const response =
      await fetch(
        '/api/admin/settings/platform',
        {
          cache:
            'no-store',
          credentials:
            'same-origin',
        },
      );

    const payload =
      await response.json() as
        ApiPayload;

    if (
      !response.ok ||
      !payload.snapshot
    ) {
      setFailure(
        payload.error ||
        'SaMi could not reload Platform Settings.',
      );

      return;
    }

    setSnapshot(
      payload.snapshot,
    );

    setDraft(
      cloneSettings(
        payload.snapshot.settings,
      ),
    );

    if (
      payload.history
    ) {
      setHistory(
        payload.history,
      );
    }
  }

  async function save() {
    if (
      disabled ||
      !changed
    ) {
      return;
    }

    setSaving(
      true,
    );

    setNotice(
      null,
    );

    setFailure(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/admin/settings/platform',
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
            },
            body:
              JSON.stringify({
                revision:
                  snapshot.revision,
                settings:
                  draft,
              }),
          },
        );

      const payload =
        await response.json() as
          ApiPayload;

      if (
        response.status ===
          409 &&
        payload.snapshot
      ) {
        setSnapshot(
          payload.snapshot,
        );

        setDraft(
          cloneSettings(
            payload.snapshot.settings,
          ),
        );

        setFailure(
          payload.error ||
          'The settings changed elsewhere. The latest revision has been loaded.',
        );

        return;
      }

      if (
        !response.ok ||
        !payload.snapshot
      ) {
        throw new Error(
          payload.error ||
          'SaMi could not save Platform Settings.',
        );
      }

      setSnapshot(
        payload.snapshot,
      );

      setDraft(
        cloneSettings(
          payload.snapshot.settings,
        ),
      );

      setNotice(
        'Platform Settings saved. Runtime services will pick up the new values automatically.',
      );

      await reload();
    } catch (
      error
    ) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'SaMi could not save Platform Settings.',
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Category 25
        </p>

        <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
          Platform Settings
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Global runtime defaults and governance for SaMi. Secrets, provider credentials, database connections and infrastructure tokens remain server-only environment configuration and are not editable here.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 font-black text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Revision {snapshot.revision}
          </span>

          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {snapshot.updatedAt
              ? 'Updated ' +
                new Date(
                  snapshot.updatedAt,
                ).toLocaleString()
              : 'No database update yet'}
          </span>

          {!canManage ? (
            <span className="rounded-full bg-amber-500/10 px-3 py-1.5 font-black text-amber-700 dark:text-amber-300">
              Read only
            </span>
          ) : null}
        </div>
      </section>

      {!snapshot.ready ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Category 25 migration 007 has not been applied to the Control DB yet. SaMi is safely using built-in defaults; editing stays disabled until you run the control migration on the PC.
          </span>
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {notice}
          </span>
        </div>
      ) : null}

      {failure ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {failure}
          </span>
        </div>
      ) : null}

      <Section
        title="Regional defaults"
        description="Defaults used for users who have not yet saved personal preferences. Existing personal choices continue to win."
        icon={
          Globe2
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5">
            <FieldLabel>
              Locale
            </FieldLabel>

            <input
              value={
                draft.defaults.locale
              }
              onChange={
                event =>
                  update(
                    'defaults',
                    'locale',
                    event.target.value,
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>

          <label className="space-y-1.5">
            <FieldLabel>
              Timezone
            </FieldLabel>

            <input
              value={
                draft.defaults.timezone
              }
              onChange={
                event =>
                  update(
                    'defaults',
                    'timezone',
                    event.target.value,
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>

          <label className="space-y-1.5">
            <FieldLabel>
              First day of week
            </FieldLabel>

            <select
              value={
                draft.defaults.firstDayOfWeek
              }
              onChange={
                event =>
                  update(
                    'defaults',
                    'firstDayOfWeek',
                    Number(
                      event.target.value,
                    ),
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value={0}>
                Sunday
              </option>
              <option value={1}>
                Monday
              </option>
              <option value={6}>
                Saturday
              </option>
            </select>
          </label>

          <label className="space-y-1.5">
            <FieldLabel>
              Date format
            </FieldLabel>

            <select
              value={
                draft.defaults.dateFormat
              }
              onChange={
                event =>
                  update(
                    'defaults',
                    'dateFormat',
                    event.target.value as
                      PlatformSettings['defaults']['dateFormat'],
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option>
                DD/MM/YYYY
              </option>
              <option>
                MM/DD/YYYY
              </option>
              <option>
                YYYY-MM-DD
              </option>
            </select>
          </label>

          <label className="space-y-1.5">
            <FieldLabel>
              Time format
            </FieldLabel>

            <select
              value={
                draft.defaults.timeFormat
              }
              onChange={
                event =>
                  update(
                    'defaults',
                    'timeFormat',
                    event.target.value as
                      PlatformSettings['defaults']['timeFormat'],
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="24h">
                24-hour
              </option>
              <option value="12h">
                12-hour
              </option>
            </select>
          </label>
        </div>
      </Section>

      <Section
        title="Registration & workspace creation"
        description="Control how new accounts and additional workspaces can be created without affecting existing memberships or invitations."
        icon={
          UserPlus
        }
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Toggle
            checked={
              draft.registration.publicRegistrationEnabled
            }
            onChange={
              value =>
                update(
                  'registration',
                  'publicRegistrationEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Public registration"
            description="Allow signed-out users to create a new SaMi account and first workspace."
          />

          <Toggle
            checked={
              draft.registration.googleRegistrationEnabled
            }
            onChange={
              value =>
                update(
                  'registration',
                  'googleRegistrationEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Google registration"
            description="Allow Google OAuth to start a new-account registration. Existing Google login remains separate."
          />

          <Toggle
            checked={
              draft.registration.selfServiceWorkspaceCreationEnabled
            }
            onChange={
              value =>
                update(
                  'registration',
                  'selfServiceWorkspaceCreationEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Additional workspaces"
            description="Allow signed-in users to create another workspace under their existing SaMi identity."
          />
        </div>
      </Section>

      <Section
        title="User session policy"
        description="Applies to newly created ordinary user sessions. Platform Administrator sessions retain their stricter administrator policy."
        icon={
          LockKeyhole
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-1.5">
            <FieldLabel>
              Normal session hours
            </FieldLabel>

            <input
              type="number"
              min={1}
              max={168}
              value={
                draft.security.normalSessionHours
              }
              onChange={
                event =>
                  update(
                    'security',
                    'normalSessionHours',
                    Number(
                      event.target.value,
                    ),
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>

          <label className="space-y-1.5">
            <FieldLabel>
              Remember-me days
            </FieldLabel>

            <input
              type="number"
              min={1}
              max={90}
              value={
                draft.security.rememberMeDays
              }
              onChange={
                event =>
                  update(
                    'security',
                    'rememberMeDays',
                    Number(
                      event.target.value,
                    ),
                  )
              }
              disabled={
                disabled
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>

          <Toggle
            checked={
              draft.security.allowMultipleActiveSessions
            }
            onChange={
              value =>
                update(
                  'security',
                  'allowMultipleActiveSessions',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Multiple active sessions"
            description="When off, a new ordinary user session revokes previous active sessions unless a caller explicitly overrides the policy."
          />
        </div>
      </Section>

      <Section
        title="Core feature governance"
        description="Emergency platform-level availability controls. Subscription entitlements and workspace permissions still apply when a feature is enabled here."
        icon={
          Sparkles
        }
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Toggle
            checked={
              draft.features.samiAiEnabled
            }
            onChange={
              value =>
                update(
                  'features',
                  'samiAiEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="SaMi AI"
            description="Allow new AI provider runs. Conversation history remains intact when disabled."
          />

          <Toggle
            checked={
              draft.features.automationEnabled
            }
            onChange={
              value =>
                update(
                  'features',
                  'automationEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Automation"
            description="Allow automation management and worker execution across workspaces."
          />

          <Toggle
            checked={
              draft.features.developerApiEnabled
            }
            onChange={
              value =>
                update(
                  'features',
                  'developerApiEnabled',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Developer API"
            description="Allow workspace API credentials to authenticate against SaMi's external developer API."
          />
        </div>
      </Section>

      <Section
        title="Maintenance control"
        description="A deliberate workspace-level maintenance switch. Authentication and Platform Administration remain available for recovery and operations."
        icon={
          Wrench
        }
      >
        <div className="space-y-4">
          <Toggle
            checked={
              draft.operations.maintenanceMode
            }
            onChange={
              value =>
                update(
                  'operations',
                  'maintenanceMode',
                  value,
                )
            }
            disabled={
              disabled
            }
            label="Workspace maintenance mode"
            description="Redirect ordinary authenticated workspace pages to a maintenance screen while keeping admin recovery paths available."
          />

          <label className="block space-y-1.5">
            <FieldLabel>
              Maintenance message
            </FieldLabel>

            <textarea
              value={
                draft.operations.maintenanceMessage
              }
              onChange={
                event =>
                  update(
                    'operations',
                    'maintenanceMessage',
                    event.target.value,
                  )
              }
              maxLength={500}
              rows={3}
              disabled={
                disabled
              }
              className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>
        </div>
      </Section>

      <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black text-zinc-950 dark:text-white">
              Apply settings
            </h2>

            <p className="mt-1 text-xs text-zinc-500">
              Every save is revisioned and also written to the Platform Admin audit trail.
            </p>
          </div>

          <button
            type="button"
            onClick={
              save
            }
            disabled={
              disabled ||
              !changed
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving
              ? 'Saving…'
              : 'Save Platform Settings'}
          </button>
        </div>
      </section>

      <Section
        title="Recent setting revisions"
        description="Compact change history for operational review. Detailed actor/request information also remains in Platform Audit Logs."
        icon={
          Clock3
        }
      >
        {history.length ===
        0 ? (
          <p className="text-sm text-zinc-500">
            No settings revisions have been recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {history.map(
              item => (
                <div
                  key={
                    item.revision
                  }
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-black text-zinc-950 dark:text-white">
                      Revision {item.revision}
                    </p>

                    <p className="mt-1 text-[11px] text-zinc-500">
                      {item.changedKeys.length
                        ? item.changedKeys.join(
                            ', ',
                          )
                        : 'Initial settings'}
                    </p>
                  </div>

                  <div className="text-[11px] text-zinc-500 sm:text-right">
                    <p>
                      {item.createdAt
                        ? new Date(
                            item.createdAt,
                          ).toLocaleString()
                        : 'Unknown time'}
                    </p>

                    <p className="mt-1 font-mono text-[10px]">
                      {item.changedByAdminId ||
                        'system'}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-sm font-black">
            Secrets excluded
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Provider tokens, SMTP passwords, database credentials and signing secrets cannot be written here.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <Zap className="h-5 w-5 text-blue-600" />
          <p className="mt-3 text-sm font-black">
            Runtime applied
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Settings are consumed by registration, sessions, AI, automation, Developer API and workspace maintenance boundaries.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <Code2 className="h-5 w-5 text-violet-600" />
          <p className="mt-3 text-sm font-black">
            Module-safe
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Business-module settings remain inside their modules and tenant scope; this page controls SaMi itself.
          </p>
        </div>
      </section>
    </div>
  );
}
