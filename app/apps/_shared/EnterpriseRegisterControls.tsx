'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  CalendarDays,
  Columns3,
  LayoutList,
  Save,
  Trash2,
} from 'lucide-react';

import type {
  EnterpriseTable,
} from '@/lib/apps/enterprise/service';


type LayoutMode =
  | 'list'
  | 'kanban'
  | 'calendar';

type SavedView = {
  id: string;
  name: string;
  layout: LayoutMode;
  search_text: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  columns: unknown;
  is_default: boolean;
  updated_at: string;
};


export default function EnterpriseRegisterControls({
  moduleKey,
  table,
  search,
  setSearch,
  layout,
  setLayout,
}: {
  moduleKey:
    string;
  table:
    EnterpriseTable;
  search:
    string;
  setSearch:
    (
      value:
        string,
    ) =>
      void;
  layout:
    LayoutMode;
  setLayout:
    (
      value:
        LayoutMode,
    ) =>
      void;
}) {
  const [
    savedViews,
    setSavedViews,
  ] =
    useState<
      SavedView[]
    >(
      [],
    );

  const [
    selectedView,
    setSelectedView,
  ] =
    useState(
      '',
    );

  const [
    saveMode,
    setSaveMode,
  ] =
    useState(
      false,
    );

  const [
    name,
    setName,
  ] =
    useState(
      '',
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      '',
    );

  const workflowAvailable =
    table.workflows.length >
      0;

  const calendarAvailable =
    table.fields.some(
      field =>
        field.inputType ===
          'date' ||
        field.inputType ===
          'datetime',
    );

  async function load() {
    try {
      const params =
        new URLSearchParams({
          mode:
            'table_completion',
          table:
            table.key,
        });

      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
          ) +
          '/records?' +
          params.toString(),
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const body =
        await response
          .json() as {
            success?:
              boolean;
            error?:
              string;
            completion?: {
              savedViews?:
                SavedView[];
            };
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load saved views.',
        );
      }

      const views =
        body.completion
          ?.savedViews ||
        [];

      setSavedViews(
        views,
      );

      const defaultView =
        views.find(
          view =>
            view.is_default,
        );

      if (
        defaultView
      ) {
        setSelectedView(
          defaultView.id,
        );
        setSearch(
          defaultView
            .search_text ||
          '',
        );
        setLayout(
          defaultView
            .layout,
        );
      }
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not load saved views.',
      );
    }
  }

  useEffect(
    () => {
      setSelectedView(
        '',
      );
      setSaveMode(
        false,
      );
      setName(
        '',
      );
      setError(
        '',
      );
      void load();
    },
    [
      moduleKey,
      table.key,
    ],
  );

  async function saveView() {
    const viewName =
      name.trim();

    if (
      !viewName
    ) {
      return;
    }

    setBusy(
      true,
    );
    setError(
      '',
    );

    try {
      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
          ) +
          '/records',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'save_view',
                table:
                  table.key,
                name:
                  viewName,
                layout,
                searchText:
                  search,
                filters:
                  {},
                sort:
                  {},
                columns:
                  table.displayFields,
                isDefault:
                  false,
              }),
          },
        );

      const body =
        await response
          .json() as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not save this view.',
        );
      }

      setSaveMode(
        false,
      );
      setName(
        '',
      );
      await load();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not save this view.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function removeView() {
    const viewId =
      selectedView;

    if (
      !viewId
    ) {
      return;
    }

    setBusy(
      true,
    );
    setError(
      '',
    );

    try {
      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
          ) +
          '/records',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'delete_view',
                table:
                  table.key,
                viewId,
              }),
          },
        );

      const body =
        await response
          .json() as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not delete this view.',
        );
      }

      setSelectedView(
        '',
      );
      await load();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not delete this view.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  function applyView(
    value:
      string,
  ) {
    setSelectedView(
      value,
    );

    const view =
      savedViews.find(
        item =>
          item.id ===
          value,
      );

    if (
      !view
    ) {
      return;
    }

    setSearch(
      view.search_text ||
      '',
    );

    if (
      view.layout ===
        'kanban' &&
      !workflowAvailable
    ) {
      setLayout(
        'list',
      );
      return;
    }

    if (
      view.layout ===
        'calendar' &&
      !calendarAvailable
    ) {
      setLayout(
        'list',
      );
      return;
    }

    setLayout(
      view.layout,
    );
  }

  const layoutButton =
    (
      mode:
        LayoutMode,
      label:
        string,
      Icon:
        typeof LayoutList,
      disabled =
        false,
    ) => (
      <button
        type="button"
        disabled={
          disabled
        }
        onClick={
          () =>
            setLayout(
              mode,
            )
        }
        className={[
          'inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40',
          layout ===
            mode
            ? 'bg-blue-600 text-white'
            : 'border border-[var(--sami-border)]',
        ].join(
          ' ',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {
          label
        }
      </button>
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {
            layoutButton(
              'list',
              'List',
              LayoutList,
            )
          }
          {
            layoutButton(
              'kanban',
              'Kanban',
              Columns3,
              !workflowAvailable,
            )
          }
          {
            layoutButton(
              'calendar',
              'Calendar',
              CalendarDays,
              !calendarAvailable,
            )
          }
        </div>

        <select
          value={
            selectedView
          }
          onChange={
            event =>
              applyView(
                event
                  .target
                  .value,
              )
          }
          className="h-9 min-w-40 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-[10px] font-black"
        >
          <option value="">
            Saved views
          </option>
          {
            savedViews.map(
              view => (
                <option
                  key={
                    view.id
                  }
                  value={
                    view.id
                  }
                >
                  {
                    view.name
                  }
                  {
                    view.is_default
                      ? ' · default'
                      : ''
                  }
                </option>
              ),
            )
          }
        </select>

        <button
          type="button"
          onClick={
            () =>
              setSaveMode(
                value =>
                  !value,
              )
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-2.5 text-[10px] font-black"
        >
          <Save className="h-3.5 w-3.5" />
          Save view
        </button>

        {
          selectedView &&
          (
            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  void removeView()
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-500/25 px-2.5 text-[10px] font-black text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )
        }
      </div>

      {
        saveMode &&
        (
          <div className="flex max-w-xl gap-2">
            <input
              value={
                name
              }
              onChange={
                event =>
                  setName(
                    event
                      .target
                      .value,
                  )
              }
              placeholder="View name"
              className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
            />
            <button
              type="button"
              disabled={
                busy ||
                !name
                  .trim()
              }
              onClick={
                () =>
                  void saveView()
              }
              className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )
      }

      {
        error &&
        (
          <p className="text-[10px] font-bold text-red-600">
            {
              error
            }
          </p>
        )
      }
    </div>
  );
}
