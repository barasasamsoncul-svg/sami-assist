'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Layers3,
  LayoutTemplate,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { useMemo, useState } from 'react';

import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

type Template = SalesWorkspaceData['templates'][number];

const HEX_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function safeColor(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (!HEX_PATTERN.test(value.trim())) return fallback;
  return value.trim();
}

export default function SalesTemplatesManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>(data.templates);
  const [formKey, setFormKey] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = data.capabilities.canManageSettings;
  const busyAny = busy || saving || deleting;

  const stats = useMemo(() => {
    const defaults = templates.filter((t) => t.isDefault).length;
    const complete = templates.filter(
      (t) => t.notes && t.terms && t.footerText,
    ).length;
    return { total: templates.length, defaults, complete };
  }, [templates]);

  function resetForm() {
    setEditingTemplate(null);
    setFormKey((value) => value + 1);
  }

  function beginEdit(template: Template) {
    setEditingTemplate(template);
    setFormKey((value) => value + 1);
  }

  async function save(form: HTMLFormElement) {
    const values = new FormData(form);

    setSaving(true);
    try {
      const result = await request({
        action: 'save_template',
        templateId: editingTemplate?.id,
        name: values.get('name'),
        primaryColor: values.get('primaryColor'),
        secondaryColor: values.get('secondaryColor'),
        footerText: values.get('footerText'),
        notes: values.get('notes'),
        terms: values.get('terms'),
        isDefault: values.get('isDefault') === 'on',
      });

      const id = typeof result.id === 'string' ? result.id : '';
      const name = String(values.get('name') || '').trim();
      const isDefault = values.get('isDefault') === 'on';

      if (id && name) {
        setTemplates((current) => [
          {
            id,
            name,
            isDefault,
            notes: String(values.get('notes') || '') || null,
            terms: String(values.get('terms') || '') || null,
            footerText: String(values.get('footerText') || '') || null,
            primaryColor: String(
              values.get('primaryColor') || data.settings.primaryColor,
            ),
            secondaryColor: String(
              values.get('secondaryColor') || data.settings.secondaryColor,
            ),
          },
          ...current
            .map((template) => ({
              ...template,
              isDefault: isDefault ? false : template.isDefault,
            }))
            .filter((template) => template.id !== id),
        ]);
      }

      form.reset();
      resetForm();

      showSuccess(
        editingTemplate ? 'Template updated' : 'Template saved',
        'The quotation template is ready for new quotations.',
      );
    } catch (error) {
      showError(
        'Template could not be saved',
        error instanceof Error
          ? error.message
          : 'SaMi could not save the quotation template.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const template = deleteTarget;
    if (!template) return;
    setDeleting(true);
    try {
      await request({ action: 'delete_template', templateId: template.id });

      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (editingTemplate?.id === template.id) resetForm();

      showSuccess(
        'Template deleted',
        'The template was removed from the library. Existing quotations remain unchanged.',
      );
    } catch (error) {
      showError(
        'Template could not be deleted',
        error instanceof Error
          ? error.message
          : 'SaMi could not delete this quotation template.',
      );
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
<h2 className="mt-1 text-xl font-black">Quotation templates</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Create reusable quotation presentation defaults for notes, commercial terms,
              footer copy and document branding. Templates stay separate from global Sales
              policy.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<Layers3 className="h-3 w-3" />} label="Total" value={stats.total} />
            <Stat icon={<Star className="h-3 w-3" />} label="Default" value={stats.defaults} />
            <Stat
              icon={<CheckCircle2 className="h-3 w-3" />}
              label="Complete"
              value={stats.complete}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        {/* Editor */}
        {canManage ? (
          <form
            key={formKey}
            className="sami-surface rounded-[24px] p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await save(event.currentTarget);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                {editingTemplate ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              <h3 className="text-sm font-black">
                {editingTemplate ? 'Edit template' : 'New template'}
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              {editingTemplate ? (
                <input type="hidden" name="templateId" value={editingTemplate.id} />
              ) : null}
              <Field
                name="name"
                label="Template name"
                defaultValue={editingTemplate?.name || ''}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="primaryColor"
                  label="Primary color"
                  defaultValue={editingTemplate?.primaryColor || data.settings.primaryColor}
                  hint="HEX, e.g. #4f46e5"
                />
                <Field
                  name="secondaryColor"
                  label="Secondary color"
                  defaultValue={
                    editingTemplate?.secondaryColor || data.settings.secondaryColor
                  }
                  hint="HEX, e.g. #0ea5e9"
                />
              </div>
              <Area
                name="notes"
                label="Default notes"
                defaultValue={editingTemplate?.notes || ''}
              />
              <Area
                name="terms"
                label="Default terms"
                defaultValue={editingTemplate?.terms || ''}
              />
              <Area
                name="footerText"
                label="Document footer"
                defaultValue={editingTemplate?.footerText || ''}
              />

              <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={editingTemplate?.isDefault || false}
                  className="h-4 w-4"
                />
                Make this the default quotation template
              </label>

              <button
                type="submit"
                disabled={busyAny}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {saving
                  ? 'Saving…'
                  : editingTemplate
                    ? 'Update template'
                    : 'Save template'}
              </button>
              {editingTemplate ? (
                <button
                  type="button"
                  disabled={busyAny}
                  onClick={resetForm}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-4 text-sm font-bold disabled:opacity-60"
                >
                  <X className="h-4 w-4" /> Cancel editing
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="sami-surface rounded-[24px] p-4">
            <div className="flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                You can view quotation templates, but managing templates requires
                settings-management permission.
              </span>
            </div>
          </div>
        )}

        {/* Library */}
        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                <LayoutTemplate className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-black">Template library</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {templates.length} quotation template
                  {templates.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {templates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--sami-border)] px-4 py-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <LayoutTemplate className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-black">No templates yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Create your first quotation template to reuse notes, terms and branding
                  across new quotations.
                </p>
              </div>
            ) : (
              templates.map((template) => {
                const isEditing = editingTemplate?.id === template.id;
                const primary = safeColor(template.primaryColor, data.settings.primaryColor);
                const secondary = safeColor(
                  template.secondaryColor,
                  data.settings.secondaryColor,
                );
                return (
                  <div
                    key={template.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      isEditing
                        ? 'border-blue-500/60 bg-blue-500/[0.06] ring-1 ring-blue-500/30'
                        : 'border-[var(--sami-border)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-xl border border-[var(--sami-border)] p-2">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{template.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {template.notes ||
                              template.terms ||
                              'Reusable quotation presentation defaults.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 rounded-full border border-[var(--sami-border)]"
                          style={{ backgroundColor: primary }}
                          title={`Primary ${primary}`}
                        />
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 rounded-full border border-[var(--sami-border)]"
                          style={{ backgroundColor: secondary }}
                          title={`Secondary ${secondary}`}
                        />
                        {template.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30">
                            <Star className="h-3 w-3" /> Default
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {canManage ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(template)}
                          disabled={busyAny}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-60"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit template
                        </button>
                        <button
                          type="button"
                          disabled={busyAny}
                          onClick={() => setDeleteTarget(template)}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-500/30 px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete template
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sami-border)] px-2 py-1">
                        <Palette className="h-3 w-3" /> Branding
                      </span>
                      <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                        Notes{template.notes ? ' set' : ' empty'}
                      </span>
                      <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                        Terms{template.terms ? ' set' : ' empty'}
                      </span>
                      <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                        Footer{template.footerText ? ' set' : ' empty'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm (Sami overlay style) */}
      {deleteTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-template-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--sami-border)] bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p id="delete-template-title" className="text-sm font-black">
                  Delete this quotation template?
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <strong>{deleteTarget.name}</strong> will be removed from the template
                  library. Existing quotations and their history will be kept unchanged.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete template'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--sami-border)] px-3 py-1.5 text-center">
      <p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </p>
      <p className="text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required = false,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
      {hint ? (
        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Area({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">{label}</span>
      <textarea
        name={name}
        rows={4}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}