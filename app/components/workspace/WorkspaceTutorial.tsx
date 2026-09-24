'use client';

import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  X,
} from 'lucide-react';

import {
  useEffect,
  useState,
} from 'react';


export type WorkspaceTutorialStep = {
  id: string;
  title: string;
  description: string;
  section?: string;
  tip?: string;
};


type TutorialPreferenceDetail = {
  userId: string;
  enabled: boolean;
};


type TutorialStartDetail = {
  userId: string;
  moduleKey: string;
};


const PREFERENCE_EVENT =
  'sami:tutorial-preference';

const START_EVENT =
  'sami:tutorial-start';


const durablePreferenceCache =
  new Map<
    string,
    Promise<boolean>
  >();


function enabledKey(
  userId: string,
) {
  return (
    'sami:tutorials:' +
    userId +
    ':enabled'
  );
}


function seenKey(
  userId: string,
  moduleKey: string,
) {
  return (
    'sami:tutorials:' +
    userId +
    ':' +
    moduleKey +
    ':seen'
  );
}


function readEnabled(
  userId: string,
) {
  try {
    const stored =
      window.localStorage
        .getItem(
          enabledKey(
            userId,
          ),
        );

    if (
      stored ===
        'false'
    ) {
      return false;
    }

    if (
      stored ===
        'true'
    ) {
      return true;
    }
  } catch {
    // SaMi remains usable when browser storage is unavailable.
  }

  return true;
}


function storeEnabled(
  userId:
    string,
  enabled:
    boolean,
) {
  try {
    window.localStorage
      .setItem(
        enabledKey(
          userId,
        ),
        String(
          enabled,
        ),
      );
  } catch {
    // Browser storage is only a local cache for the durable account preference.
  }
}


export function syncWorkspaceTutorialPreference(
  userId:
    string,
  enabled:
    boolean,
) {
  storeEnabled(
    userId,
    enabled,
  );

  durablePreferenceCache.set(
    userId,
    Promise.resolve(
      enabled,
    ),
  );

  window.dispatchEvent(
    new CustomEvent<TutorialPreferenceDetail>(
      PREFERENCE_EVENT,
      {
        detail: {
          userId,
          enabled,
        },
      },
    ),
  );
}


async function readDurableEnabled(
  userId:
    string,
) {
  const cached =
    durablePreferenceCache.get(
      userId,
    );

  if (
    cached
  ) {
    return cached;
  }

  const promise =
    (
      async () => {
        try {
          const response =
            await fetch(
              '/api/account/preferences',
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

          const body =
            await response
              .json()
              .catch(
                () => ({}),
              ) as {
                success?:
                  boolean;
                preferences?: {
                  tutorialsEnabled?:
                    boolean;
                };
              };

          if (
            response.ok &&
            body.success ===
              true &&
            typeof body.preferences
              ?.tutorialsEnabled ===
              'boolean'
          ) {
            storeEnabled(
              userId,
              body.preferences
                .tutorialsEnabled,
            );

            return body.preferences
              .tutorialsEnabled;
          }
        } catch {
          // The workspace remains usable with the local cached preference.
        }

        return readEnabled(
          userId,
        );
      }
    )();

  durablePreferenceCache.set(
    userId,
    promise,
  );

  return promise;
}


async function saveDurableEnabled(
  userId:
    string,
  enabled:
    boolean,
) {
  const response =
    await fetch(
      '/api/account/preferences',
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
            tutorialsEnabled:
              enabled,
          }),
      },
    );

  const body =
    await response
      .json()
      .catch(
        () => ({}),
      ) as {
        success?:
          boolean;
        error?:
          string;
        preferences?: {
          tutorialsEnabled?:
            boolean;
        };
      };

  if (
    !response.ok ||
    body.success !==
      true ||
    typeof body.preferences
      ?.tutorialsEnabled !==
      'boolean'
  ) {
    throw new Error(
      body.error ||
      'SaMi could not save your tutorial preference.',
    );
  }

  syncWorkspaceTutorialPreference(
    userId,
    body.preferences
      .tutorialsEnabled,
  );

  return body.preferences
    .tutorialsEnabled;
}


function hasSeen(
  userId: string,
  moduleKey: string,
) {
  try {
    return (
      window.localStorage
        .getItem(
          seenKey(
            userId,
            moduleKey,
          ),
        ) ===
      'true'
    );
  } catch {
    return false;
  }
}


function markSeen(
  userId: string,
  moduleKey: string,
) {
  try {
    window.localStorage
      .setItem(
        seenKey(
          userId,
          moduleKey,
        ),
        'true',
      );
  } catch {
    // Tutorial completion persistence is optional.
  }
}


export function startWorkspaceTutorial(
  userId: string,
  moduleKey: string,
) {
  window.dispatchEvent(
    new CustomEvent<TutorialStartDetail>(
      START_EVENT,
      {
        detail: {
          userId,
          moduleKey,
        },
      },
    ),
  );
}


export function WorkspaceTutorialToggle({
  userId,
}: {
  userId: string;
}) {
  const [
    enabled,
    setEnabled,
  ] =
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      let active =
        true;

      setEnabled(
        readEnabled(
          userId,
        ),
      );

      void readDurableEnabled(
        userId,
      ).then(
        value => {
          if (
            !active
          ) {
            return;
          }

          setEnabled(
            value,
          );

          syncWorkspaceTutorialPreference(
            userId,
            value,
          );
        },
      );

      const onPreference =
        (
          event:
            Event,
        ) => {
          const detail =
            (
              event as
                CustomEvent<TutorialPreferenceDetail>
            ).detail;

          if (
            detail?.userId ===
              userId
          ) {
            setEnabled(
              detail.enabled,
            );
          }
        };

      window.addEventListener(
        PREFERENCE_EVENT,
        onPreference,
      );

      return () => {
        active =
          false;

        window.removeEventListener(
          PREFERENCE_EVENT,
          onPreference,
        );
      };
    },
    [
      userId,
    ],
  );

  async function toggle() {
    if (
      saving
    ) {
      return;
    }

    const previous =
      enabled;

    const next =
      !previous;

    setEnabled(
      next,
    );

    syncWorkspaceTutorialPreference(
      userId,
      next,
    );

    setSaving(
      true,
    );

    try {
      const saved =
        await saveDurableEnabled(
          userId,
          next,
        );

      setEnabled(
        saved,
      );
    } catch (
      error
    ) {
      setEnabled(
        previous,
      );

      syncWorkspaceTutorialPreference(
        userId,
        previous,
      );

      console.error(
        '[SaMi Tutorials] Preference update failed:',
        error,
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <button
      type="button"
      aria-pressed={
        enabled
      }
      aria-label={
        enabled
          ? 'Turn workspace tutorials off'
          : 'Turn workspace tutorials on'
      }
      title={
        enabled
          ? 'Tutorials are on'
          : 'Tutorials are off'
      }
      disabled={
        saving
      }
      onClick={
        () =>
          void toggle()
      }
      className={[
        'inline-flex h-10 items-center gap-2 rounded-xl border px-2.5 text-[10px] font-black shadow-[var(--sami-shadow-sm)] transition sm:px-3',
        enabled
          ? 'border-blue-200/80 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
          : 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 dark:text-slate-400',
      ].join(
        ' ',
      )}
    >
      <GraduationCap className="h-4 w-4" />

      <span className="hidden xl:inline">
        {
          enabled
            ? 'Tutorials On'
            : 'Tutorials Off'
        }
      </span>
    </button>
  );
}


export default function WorkspaceTutorial({
  userId,
  moduleKey,
  title,
  steps,
  onStepChange,
}: {
  userId: string;
  moduleKey: string;
  title: string;
  steps:
    WorkspaceTutorialStep[];
  onStepChange?:
    (
      step:
        WorkspaceTutorialStep,
    ) =>
      void;
}) {
  const [
    enabled,
    setEnabled,
  ] =
    useState(
      true,
    );

  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );

  const [
    index,
    setIndex,
  ] =
    useState(
      0,
    );

  function openAt(
    nextIndex:
      number,
  ) {
    const bounded =
      Math.max(
        0,
        Math.min(
          nextIndex,
          Math.max(
            0,
            steps.length -
              1,
          ),
        ),
      );

    setIndex(
      bounded,
    );

    setOpen(
      true,
    );

    const step =
      steps[
        bounded
      ];

    if (
      step
    ) {
      onStepChange?.(
        step,
      );
    }
  }

  useEffect(
    () => {
      let active =
        true;

      setEnabled(
        readEnabled(
          userId,
        ),
      );

      void readDurableEnabled(
        userId,
      ).then(
        currentEnabled => {
          if (
            !active
          ) {
            return;
          }

          setEnabled(
            currentEnabled,
          );

          syncWorkspaceTutorialPreference(
            userId,
            currentEnabled,
          );

          if (
            currentEnabled &&
            steps.length >
              0 &&
            !hasSeen(
              userId,
              moduleKey,
            )
          ) {
            markSeen(
              userId,
              moduleKey,
            );

            openAt(
              0,
            );
          }
        },
      );

      const onPreference =
        (
          event:
            Event,
        ) => {
          const detail =
            (
              event as
                CustomEvent<TutorialPreferenceDetail>
            ).detail;

          if (
            detail?.userId !==
              userId
          ) {
            return;
          }

          setEnabled(
            detail.enabled,
          );

          if (
            !detail.enabled
          ) {
            setOpen(
              false,
            );
          }
        };

      const onStart =
        (
          event:
            Event,
        ) => {
          const detail =
            (
              event as
                CustomEvent<TutorialStartDetail>
            ).detail;

          if (
            detail?.userId ===
              userId &&
            detail?.moduleKey ===
              moduleKey
          ) {
            markSeen(
              userId,
              moduleKey,
            );

            openAt(
              0,
            );
          }
        };

      window.addEventListener(
        PREFERENCE_EVENT,
        onPreference,
      );

      window.addEventListener(
        START_EVENT,
        onStart,
      );

      return () => {
        active =
          false;

        window.removeEventListener(
          PREFERENCE_EVENT,
          onPreference,
        );

        window.removeEventListener(
          START_EVENT,
          onStart,
        );
      };
      // Tutorial definitions are static per module.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      userId,
      moduleKey,
    ],
  );

  if (
    !open ||
    steps.length ===
      0
  ) {
    return null;
  }

  const step =
    steps[
      index
    ];

  const last =
    index ===
      steps.length -
        1;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[90] overflow-hidden rounded-[24px] border border-blue-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-blue-500/20 dark:bg-[#10151e] sm:left-auto sm:right-5 sm:w-[390px]"
    >
      <div className="flex items-start gap-3 border-b border-blue-100 bg-blue-50/80 px-4 py-3 dark:border-blue-500/15 dark:bg-blue-500/10">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <BookOpenCheck className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
            {
              title
            } · {
              index +
              1
            }/{steps.length}
          </p>

          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
            {
              step.title
            }
          </p>
        </div>

        <button
          type="button"
          aria-label="Close tutorial"
          onClick={
            () =>
              setOpen(
                false,
              )
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
          {
            step.description
          }
        </p>

        {
          step.tip &&
          (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-semibold leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              {
                step.tip
              }
            </div>
          )
        }

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={
              index ===
                0
            }
            onClick={
              () =>
                openAt(
                  index -
                    1,
                )
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <div className="text-center">
            <p className="text-[10px] font-semibold text-slate-400">
              {
                enabled
                  ? 'Tutorials are on'
                  : 'Tutorials are off'
              }
            </p>
          </div>

          <button
            type="button"
            onClick={
              () => {
                if (
                  last
                ) {
                  setOpen(
                    false,
                  );

                  return;
                }

                openAt(
                  index +
                    1,
                );
              }
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition hover:bg-blue-700"
          >
            {
              last
                ? 'Finish'
                : 'Next'
            }

            {
              !last &&
              (
                <ChevronRight className="h-4 w-4" />
              )
            }
          </button>
        </div>
      </div>
    </aside>
  );
}
