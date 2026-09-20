'use client';

import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Factory,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Settings2,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import SaMiOverlay, {
  type SaMiOverlayAction,
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

type CompanyProfile = {
  id: string;
  name: string;
  legalName: string | null;
  companyCode: string | null;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  currency: string;
  timezone: string;
  locale: string;
  fiscalCountry: string | null;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  taxId: string | null;
  registrationNumber: string | null;
  industry: string | null;
  businessType: string | null;
  foundedYear: number | null;
  employeeCount: number | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

type BranchProfile = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type CompanySummary = {
  id: string;
  name: string;
  legalName: string | null;
  companyCode: string | null;
  logoUrl: string | null;
  country: string | null;
  countryCode: string | null;
  currency: string;
  timezone: string;
  isCurrent: boolean;
  isDefault: boolean;
  isSelected: boolean;
  isActive: boolean;
  archivedAt: string | null;
};

type HistoryItem = {
  id: string;
  action: string;
  userId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

type OrganizationState = {
  profile: CompanyProfile | null;
  branches: BranchProfile[];
  companies: CompanySummary[];
  history: HistoryItem[];
  capabilities: {
    canViewOrganization: boolean;
    canManageOrganization: boolean;
    canViewCompanies: boolean;
    canManageCompanies: boolean;
  };
};

type ApiResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  organization?: OrganizationState;
};

type View =
  | 'profile'
  | 'branches'
  | 'companies'
  | 'history';

type ProfileDraft = {
  name: string;
  legalName: string;
  companyCode: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  currency: string;
  timezone: string;
  locale: string;
  fiscalCountry: string;
  fiscalYearStartMonth: string;
  fiscalYearStartDay: string;
  taxId: string;
  registrationNumber: string;
  industry: string;
  businessType: string;
  foundedYear: string;
  employeeCount: string;
};

type BranchDraft = {
  id: string | null;
  name: string;
  code: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  phone: string;
  email: string;
  isMain: boolean;
};

type CompanyDraft = {
  name: string;
  legalName: string;
  companyCode: string;
  country: string;
  countryCode: string;
  currency: string;
  timezone: string;
  locale: string;
};

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};

const CLOSED_OVERLAY: OverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};

const EMPTY_BRANCH: BranchDraft = {
  id: null,
  name: '',
  code: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  countryCode: '',
  phone: '',
  email: '',
  isMain: false,
};

const EMPTY_COMPANY: CompanyDraft = {
  name: '',
  legalName: '',
  companyCode: '',
  country: '',
  countryCode: '',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  locale: 'en',
};

function profileToDraft(
  profile: CompanyProfile,
): ProfileDraft {
  return {
    name: profile.name || '',
    legalName: profile.legalName || '',
    companyCode: profile.companyCode || '',
    email: profile.email || '',
    phone: profile.phone || '',
    website: profile.website || '',
    addressLine1: profile.addressLine1 || '',
    addressLine2: profile.addressLine2 || '',
    city: profile.city || '',
    state: profile.state || '',
    postalCode: profile.postalCode || '',
    country: profile.country || '',
    countryCode: profile.countryCode || '',
    currency: profile.currency || 'KES',
    timezone: profile.timezone || 'Africa/Nairobi',
    locale: profile.locale || 'en',
    fiscalCountry: profile.fiscalCountry || '',
    fiscalYearStartMonth:
      String(profile.fiscalYearStartMonth || 1),
    fiscalYearStartDay:
      String(profile.fiscalYearStartDay || 1),
    taxId: profile.taxId || '',
    registrationNumber:
      profile.registrationNumber || '',
    industry: profile.industry || '',
    businessType: profile.businessType || '',
    foundedYear:
      profile.foundedYear === null
        ? ''
        : String(profile.foundedYear),
    employeeCount:
      profile.employeeCount === null
        ? ''
        : String(profile.employeeCount),
  };
}

function branchToDraft(
  branch: BranchProfile,
): BranchDraft {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code || '',
    addressLine1: branch.addressLine1 || '',
    addressLine2: branch.addressLine2 || '',
    city: branch.city || '',
    state: branch.state || '',
    postalCode: branch.postalCode || '',
    country: branch.country || '',
    countryCode: branch.countryCode || '',
    phone: branch.phone || '',
    email: branch.email || '',
    isMain: branch.isMain,
  };
}

function formatDate(
  value: string | null,
) {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionLabel(
  value: string,
) {
  return value
    .replace(/^organization\./, '')
    .replace(/\./g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

async function readJson(
  response: Response,
): Promise<ApiResponse> {
  try {
    return await response.json() as ApiResponse;
  } catch {
    return {
      success: false,
      error: 'SaMi returned an invalid response.',
    };
  }
}

function textOrNull(
  value: string,
) {
  const trimmed = value.trim();
  return trimmed || null;
}

export default function OrganizationSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [organization, setOrganization] =
    useState<OrganizationState | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState<string | null>(null);

  const [overlay, setOverlay] =
    useState<OverlayState>(
      CLOSED_OVERLAY,
    );

  const [profile, setProfile] =
    useState<ProfileDraft | null>(null);

  const [branchDraft, setBranchDraft] =
    useState<BranchDraft>(EMPTY_BRANCH);

  const [companyDraft, setCompanyDraft] =
    useState<CompanyDraft>(EMPTY_COMPANY);

  function closeOverlay() {
    setOverlay(
      CLOSED_OVERLAY,
    );
  }

  function showOverlay(
    type: SaMiOverlayType,
    title: string,
    message: string,
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
    });
  }

  const requestedView =
    searchParams.get('organization');

  const requestedNormalized: View =
    requestedView === 'branches' ||
    requestedView === 'companies' ||
    requestedView === 'history'
      ? requestedView
      : 'profile';

  const view: View =
    organization
      ? (
          requestedNormalized === 'companies' &&
          organization.capabilities.canViewCompanies
            ? 'companies'
            : requestedNormalized !== 'companies' &&
              organization.capabilities.canViewOrganization
              ? requestedNormalized
              : organization.capabilities.canViewOrganization
                ? 'profile'
                : 'companies'
        )
      : requestedNormalized;

  const load = useCallback(
    async () => {
      setLoading(true);
      try {
        const response = await fetch(
          '/api/workspace/organization',
          {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
            },
          },
        );

        const data = await readJson(response);

        if (
          !response.ok ||
          !data.success ||
          !data.organization
        ) {
          throw new Error(
            data.error ||
            'Organization details could not be loaded.',
          );
        }

        setOrganization(data.organization);
        setProfile(
          data.organization.profile
            ? profileToDraft(data.organization.profile)
            : null,
        );
      } catch (candidate) {
        showOverlay(
          'error',
          'Organization unavailable',
          candidate instanceof Error
            ? candidate.message
            : 'Organization details could not be loaded.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(
    () => {
      void load();
    },
    [load],
  );

  const canManageOrganization =
    organization?.capabilities
      .canManageOrganization === true;

  const canManageCompanies =
    organization?.capabilities
      .canManageCompanies === true;

  const views = useMemo(
    () => {
      const items: Array<{
        key: View;
        label: string;
        icon: typeof Building2;
      }> = [];

      if (
        organization?.capabilities
          .canViewOrganization
      ) {
        items.push(
          {
            key: 'profile',
            label: 'Profile',
            icon: Building2,
          },
          {
            key: 'branches',
            label: 'Branches',
            icon: MapPin,
          },
        );
      }

      if (
        organization?.capabilities
          .canViewCompanies
      ) {
        items.push({
          key: 'companies',
          label: 'Companies',
          icon: Factory,
        });
      }

      if (
        organization?.capabilities
          .canViewOrganization
      ) {
        items.push({
          key: 'history',
          label: 'History',
          icon: Clock3,
        });
      }

      return items;
    },
    [organization],
  );

  function navigate(next: View) {
    const params =
      new URLSearchParams(
        searchParams.toString(),
      );

    params.set('tab', 'organization');
    params.set('organization', next);

    router.push(
      `/settings?${params.toString()}`,
    );
  }

  async function saveProfile() {
    if (!profile || !canManageOrganization) return;

    setSaving('profile');
    try {
      const response = await fetch(
        '/api/workspace/organization',
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            ...profile,
            legalName: textOrNull(profile.legalName),
            companyCode: textOrNull(profile.companyCode),
            email: textOrNull(profile.email),
            phone: textOrNull(profile.phone),
            website: textOrNull(profile.website),
            addressLine1: textOrNull(profile.addressLine1),
            addressLine2: textOrNull(profile.addressLine2),
            city: textOrNull(profile.city),
            state: textOrNull(profile.state),
            postalCode: textOrNull(profile.postalCode),
            country: textOrNull(profile.country),
            countryCode: textOrNull(profile.countryCode),
            fiscalCountry: textOrNull(profile.fiscalCountry),
            taxId: textOrNull(profile.taxId),
            registrationNumber:
              textOrNull(profile.registrationNumber),
            industry: textOrNull(profile.industry),
            businessType: textOrNull(profile.businessType),
            foundedYear:
              profile.foundedYear.trim()
                ? Number(profile.foundedYear)
                : null,
            employeeCount:
              profile.employeeCount.trim()
                ? Number(profile.employeeCount)
                : null,
            fiscalYearStartMonth:
              Number(profile.fiscalYearStartMonth),
            fiscalYearStartDay:
              Number(profile.fiscalYearStartDay),
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Organization profile could not be saved.',
        );
      }

      showOverlay(
        'success',
        'Organization updated',
        data.message ||
        'Organization profile updated.',
      );

      await load();
      router.refresh();
    } catch (candidate) {
      showOverlay(
        'error',
        'Organization update failed',
        candidate instanceof Error
          ? candidate.message
          : 'Organization profile could not be saved.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveBranch() {
    if (!canManageOrganization) return;

    setSaving('branch');
    try {
      const target =
        branchDraft.id
          ? `/api/workspace/organization/branches/${branchDraft.id}`
          : '/api/workspace/organization/branches';

      const response = await fetch(
        target,
        {
          method:
            branchDraft.id
              ? 'PATCH'
              : 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: branchDraft.name,
            code: textOrNull(branchDraft.code),
            addressLine1:
              textOrNull(branchDraft.addressLine1),
            addressLine2:
              textOrNull(branchDraft.addressLine2),
            city: textOrNull(branchDraft.city),
            state: textOrNull(branchDraft.state),
            postalCode:
              textOrNull(branchDraft.postalCode),
            country: textOrNull(branchDraft.country),
            countryCode:
              textOrNull(branchDraft.countryCode),
            phone: textOrNull(branchDraft.phone),
            email: textOrNull(branchDraft.email),
            isMain: branchDraft.isMain,
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Branch could not be saved.',
        );
      }

      setBranchDraft(EMPTY_BRANCH);
      showOverlay(
        'success',
        'Branch saved',
        data.message ||
        'Branch saved.',
      );

      await load();
    } catch (candidate) {
      showOverlay(
        'error',
        'Branch update failed',
        candidate instanceof Error
          ? candidate.message
          : 'Branch could not be saved.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function archiveBranch(
    branchId: string,
  ) {
    if (!canManageOrganization) return;

    setSaving(`branch:${branchId}`);
    try {
      const response = await fetch(
        `/api/workspace/organization/branches/${branchId}`,
        {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Branch could not be archived.',
        );
      }

      if (branchDraft.id === branchId) {
        setBranchDraft(EMPTY_BRANCH);
      }

      showOverlay(
        'success',
        'Branch archived',
        data.message ||
        'Branch archived.',
      );

      await load();
    } catch (candidate) {
      showOverlay(
        'error',
        'Branch archive failed',
        candidate instanceof Error
          ? candidate.message
          : 'Branch could not be archived.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function reactivateBranch(
    branchId: string,
  ) {
    if (!canManageOrganization) return;

    setSaving(`branch:reactivate:${branchId}`);
    try {
      const response = await fetch(
        `/api/workspace/organization/branches/${branchId}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'reactivate',
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Branch could not be reactivated.',
        );
      }

      showOverlay(
        'success',
        'Branch reactivated',
        data.message ||
        'Branch reactivated.',
      );

      await load();
    } catch (candidate) {
      showOverlay(
        'error',
        'Branch reactivation failed',
        candidate instanceof Error
          ? candidate.message
          : 'Branch could not be reactivated.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function createCompany() {
    if (!canManageCompanies) return;

    setSaving('company:create');
    try {
      const response = await fetch(
        '/api/workspace/companies',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            ...companyDraft,
            legalName:
              textOrNull(companyDraft.legalName),
            companyCode:
              textOrNull(companyDraft.companyCode),
            country:
              textOrNull(companyDraft.country),
            countryCode:
              textOrNull(companyDraft.countryCode),
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Company could not be created.',
        );
      }

      setCompanyDraft({
        ...EMPTY_COMPANY,
        currency:
          organization?.profile?.currency ||
          organization?.companies.find(item => item.isCurrent)?.currency ||
          'KES',
        timezone:
          organization?.profile?.timezone ||
          organization?.companies.find(item => item.isCurrent)?.timezone ||
          'Africa/Nairobi',
        locale:
          organization?.profile?.locale ||
          'en',
        country:
          organization?.profile?.country ||
          organization?.companies.find(item => item.isCurrent)?.country ||
          '',
        countryCode:
          organization?.profile?.countryCode ||
          organization?.companies.find(item => item.isCurrent)?.countryCode ||
          '',
      });

      showOverlay(
        'success',
        'Company created',
        data.message ||
        'Company created.',
      );

      await load();
    } catch (candidate) {
      showOverlay(
        'error',
        'Company creation failed',
        candidate instanceof Error
          ? candidate.message
          : 'Company could not be created.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function switchCompany(
    companyId: string,
  ) {
    setSaving(`switch:${companyId}`);
    try {
      const response = await fetch(
        '/api/workspace/company-context',
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'set_current',
            companyId,
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Company could not be selected.',
        );
      }

      await load();
      router.refresh();

      showOverlay(
        'success',
        'Company changed',
        'Current company changed.',
      );
    } catch (candidate) {
      showOverlay(
        'error',
        'Company switch failed',
        candidate instanceof Error
          ? candidate.message
          : 'Company could not be selected.',
      );
    } finally {
      setSaving(null);
    }
  }

  async function companyLifecycle(
    companyId: string,
    action: 'archive' | 'reactivate',
  ) {
    if (!canManageCompanies) return;

    setSaving(`${action}:${companyId}`);
    try {
      const response = await fetch(
        `/api/workspace/companies/${companyId}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action,
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          `Company could not be ${action}d.`,
        );
      }

      showOverlay(
        'success',
        action === 'archive'
          ? 'Company archived'
          : 'Company reactivated',
        data.message ||
        (
          action === 'archive'
            ? 'Company archived.'
            : 'Company reactivated.'
        ),
      );

      await load();
    } catch (candidate) {
      showOverlay(
        'error',
        'Company action failed',
        candidate instanceof Error
          ? candidate.message
          : 'Company lifecycle action failed.',
      );
    } finally {
      setSaving(null);
    }
  }

  function confirmArchiveBranch(
    branchId: string,
  ) {
    const branch =
      organization
        ?.branches
        .find(
          item =>
            item.id === branchId,
        );

    setOverlay({
      open: true,
      type: 'warning',
      title: 'Archive branch?',
      message:
        branch
          ? `Archive ${branch.name}? It will stop being available for active work until reactivated.`
          : 'Archive this branch? It will stop being available for active work until reactivated.',
      primaryAction: {
        label: 'Archive branch',
        onClick: () => {
          closeOverlay();
          void archiveBranch(
            branchId,
          );
        },
      },
      secondaryAction: {
        label: 'Cancel',
        onClick: closeOverlay,
      },
    });
  }

  function confirmCompanyLifecycle(
    companyId: string,
    action: 'archive' | 'reactivate',
  ) {
    if (
      action ===
      'reactivate'
    ) {
      void companyLifecycle(
        companyId,
        action,
      );

      return;
    }

    const company =
      organization
        ?.companies
        .find(
          item =>
            item.id === companyId,
        );

    setOverlay({
      open: true,
      type: 'warning',
      title: 'Archive company?',
      message:
        company
          ? `Archive ${company.name}? SaMi will first verify that no user, default-company setting, or live session would be stranded.`
          : 'Archive this company? SaMi will first verify that no user or active context would be stranded.',
      primaryAction: {
        label: 'Archive company',
        onClick: () => {
          closeOverlay();
          void companyLifecycle(
            companyId,
            'archive',
          );
        },
      },
      secondaryAction: {
        label: 'Cancel',
        onClick: closeOverlay,
      },
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[380px] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0F131B]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
        Organization details are unavailable. Refresh this page or try again.
      </div>
    );
  }

  const headerCompany =
    organization.profile ||
    organization.companies.find(item => item.isCurrent) ||
    organization.companies[0] ||
    null;

  return (
    <div className="space-y-5">
      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        primaryAction={overlay.primaryAction}
        secondaryAction={overlay.secondaryAction}
        onClose={closeOverlay}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-sm font-bold text-white dark:bg-white dark:text-slate-950">
                {headerCompany?.logoUrl ? (
                  <img
                    src={headerCompany.logoUrl}
                    alt={`${headerCompany.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (headerCompany?.name || 'SaMi')
                    .trim()
                    .slice(0, 2)
                    .toUpperCase()
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-base font-bold">
                  {headerCompany?.name || 'Organization'}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {headerCompany?.legalName ||
                    'Legal name not set'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:ml-auto">
              {views.map(item => {
                const Icon = item.icon;
                const selected = view === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.key)}
                    className={
                      selected
                        ? 'inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950'
                        : 'inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {view === 'profile' &&
          profile && (
          <ProfileView
            draft={profile}
            setDraft={setProfile}
            canManage={canManageOrganization}
            saving={saving === 'profile'}
            onSave={() => void saveProfile()}
          />
        )}

        {view === 'branches' && (
          <BranchesView
            branches={organization.branches}
            draft={branchDraft}
            setDraft={setBranchDraft}
            canManage={canManageOrganization}
            saving={saving}
            onSave={() => void saveBranch()}
            onArchive={confirmArchiveBranch}
            onReactivate={id => void reactivateBranch(id)}
          />
        )}

        {view === 'companies' &&
          organization.capabilities.canViewCompanies && (
            <CompaniesView
              companies={organization.companies}
              draft={companyDraft}
              setDraft={setCompanyDraft}
              canManage={canManageCompanies}
              saving={saving}
              onCreate={() => void createCompany()}
              onSwitch={id => void switchCompany(id)}
              onLifecycle={confirmCompanyLifecycle}
            />
          )}

        {view === 'history' && (
          <HistoryView
            history={organization.history}
          />
        )}
      </section>
    </div>
  );
}

function ProfileView({
  draft,
  setDraft,
  canManage,
  saving,
  onSave,
}: {
  draft: ProfileDraft;
  setDraft: (value: ProfileDraft) => void;
  canManage: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const [
    mobileSection,
    setMobileSection,
  ] =
    useState<
      | 'identity'
      | 'business'
      | 'contact'
      | 'address'
      | 'localization'
    >(
      'identity',
    );

  function set<K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) {
    setDraft({
      ...draft,
      [key]: value,
    });
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="sticky top-16 z-10 -mx-1 overflow-x-auto bg-white/95 px-1 py-1 backdrop-blur dark:bg-[#0F131B]/95 md:hidden">
        <div className="flex min-w-max gap-2">
          {[
            ['identity', 'Identity'],
            ['business', 'Business'],
            ['contact', 'Contact'],
            ['address', 'Address'],
            ['localization', 'Locale'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setMobileSection(
                  key as typeof mobileSection,
                )
              }
              className={
                mobileSection === key
                  ? 'h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950'
                  : 'h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${mobileSection === 'identity' ? 'block' : 'hidden'} space-y-4 md:block`}>
        <SectionHeader
          icon={Building2}
          title="Organization identity"
          description="Core legal identity for the current company."
        />

        <FieldGrid>
          <TextField label="Company name" value={draft.name} disabled={!canManage} onChange={value => set('name', value)} />
          <TextField label="Legal name" value={draft.legalName} disabled={!canManage} onChange={value => set('legalName', value)} />
          <TextField label="Company code" value={draft.companyCode} disabled={!canManage} onChange={value => set('companyCode', value)} />
          <TextField label="Registration number" value={draft.registrationNumber} disabled={!canManage} onChange={value => set('registrationNumber', value)} />
          <TextField label="Tax ID" value={draft.taxId} disabled={!canManage} onChange={value => set('taxId', value)} />
        </FieldGrid>
      </div>

      <div className={`${mobileSection === 'business' ? 'block' : 'hidden'} space-y-4 border-t border-slate-200 pt-5 md:block dark:border-white/10`}>
        <SectionHeader
          icon={Factory}
          title="Business details"
          description="Classification and operating profile."
        />

        <FieldGrid>
          <TextField label="Industry" value={draft.industry} disabled={!canManage} onChange={value => set('industry', value)} />
          <TextField label="Business type" value={draft.businessType} disabled={!canManage} onChange={value => set('businessType', value)} />
          <TextField label="Founded year" value={draft.foundedYear} inputMode="numeric" disabled={!canManage} onChange={value => set('foundedYear', value)} />
          <TextField label="Employee count" value={draft.employeeCount} inputMode="numeric" disabled={!canManage} onChange={value => set('employeeCount', value)} />
        </FieldGrid>
      </div>

      <div className={`${mobileSection === 'contact' ? 'block' : 'hidden'} space-y-4 border-t border-slate-200 pt-5 md:block dark:border-white/10`}>
        <SectionHeader
          icon={Building2}
          title="Contact"
          description="Business contact channels."
        />

        <FieldGrid>
          <TextField label="Email" value={draft.email} type="email" disabled={!canManage} onChange={value => set('email', value)} />
          <TextField label="Phone" value={draft.phone} disabled={!canManage} onChange={value => set('phone', value)} />
          <TextField label="Website" value={draft.website} disabled={!canManage} onChange={value => set('website', value)} />
        </FieldGrid>
      </div>

      <div className={`${mobileSection === 'address' ? 'block' : 'hidden'} space-y-4 border-t border-slate-200 pt-5 md:block dark:border-white/10`}>
        <SectionHeader
          icon={MapPin}
          title="Address"
          description="Registered or operating address."
        />

        <FieldGrid>
          <TextField label="Address line 1" value={draft.addressLine1} disabled={!canManage} onChange={value => set('addressLine1', value)} />
          <TextField label="Address line 2" value={draft.addressLine2} disabled={!canManage} onChange={value => set('addressLine2', value)} />
          <TextField label="City" value={draft.city} disabled={!canManage} onChange={value => set('city', value)} />
          <TextField label="State / region" value={draft.state} disabled={!canManage} onChange={value => set('state', value)} />
          <TextField label="Postal code" value={draft.postalCode} disabled={!canManage} onChange={value => set('postalCode', value)} />
          <TextField label="Country" value={draft.country} disabled={!canManage} onChange={value => set('country', value)} />
          <TextField label="Country code" value={draft.countryCode} maxLength={2} disabled={!canManage} onChange={value => set('countryCode', value.toUpperCase())} />
        </FieldGrid>
      </div>

      <div className={`${mobileSection === 'localization' ? 'block' : 'hidden'} space-y-4 border-t border-slate-200 pt-5 md:block dark:border-white/10`}>
        <SectionHeader
          icon={Settings2}
          title="Localization & fiscal"
          description="Company-specific currency, time, locale and fiscal defaults."
        />

        <FieldGrid>
          <TextField label="Currency (ISO 4217)" value={draft.currency} maxLength={3} disabled={!canManage} onChange={value => set('currency', value.toUpperCase())} />
          <TextField label="Timezone" value={draft.timezone} disabled={!canManage} onChange={value => set('timezone', value)} />
          <TextField label="Locale" value={draft.locale} disabled={!canManage} onChange={value => set('locale', value)} />
          <TextField label="Fiscal country code" value={draft.fiscalCountry} maxLength={2} disabled={!canManage} onChange={value => set('fiscalCountry', value.toUpperCase())} />
          <TextField label="Fiscal year start month" value={draft.fiscalYearStartMonth} inputMode="numeric" disabled={!canManage} onChange={value => set('fiscalYearStartMonth', value)} />
          <TextField label="Fiscal year start day" value={draft.fiscalYearStartDay} inputMode="numeric" disabled={!canManage} onChange={value => set('fiscalYearStartDay', value)} />
        </FieldGrid>
      </div>

      {canManage && (
        <div className="sticky bottom-3 flex justify-end border-t border-slate-200 bg-white/95 pt-4 backdrop-blur md:static dark:border-white/10 dark:bg-[#0F131B]/95">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-60 sm:w-auto dark:bg-white dark:text-slate-950"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save organization
          </button>
        </div>
      )}
    </div>
  );
}

function BranchesView({
  branches,
  draft,
  setDraft,
  canManage,
  saving,
  onSave,
  onArchive,
  onReactivate,
}: {
  branches: BranchProfile[];
  draft: BranchDraft;
  setDraft: (value: BranchDraft) => void;
  canManage: boolean;
  saving: string | null;
  onSave: () => void;
  onArchive: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  return (
    <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-3">
        <SectionHeader
          icon={MapPin}
          title="Branches & locations"
          description="Operating locations for the current company."
        />

        {branches.length === 0 ? (
          <EmptyState
            title="No branches yet"
            description="Add a main office, shop, warehouse or another operating location."
          />
        ) : (
          branches.map(branch => (
            <div
              key={branch.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
            >
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5">
                  <MapPin className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {branch.name}
                    </p>

                    {branch.isMain && (
                      <Badge>Primary</Badge>
                    )}

                    {!branch.isActive && (
                      <Badge>Archived</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {[
                      branch.code,
                      branch.city,
                      branch.country,
                    ].filter(Boolean).join(' · ') ||
                      'No location details'}
                  </p>
                </div>

                {canManage && branch.isActive && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft(branchToDraft(branch))
                      }
                      className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold dark:border-white/10"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={saving === `branch:${branch.id}`}
                      onClick={() => onArchive(branch.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-600 disabled:opacity-60 dark:border-rose-500/20 dark:text-rose-300"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>
                )}

                {canManage && !branch.isActive && (
                  <button
                    type="button"
                    disabled={saving === `branch:reactivate:${branch.id}`}
                    onClick={() => onReactivate(branch.id)}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-60 dark:border-white/10"
                  >
                    {saving === `branch:reactivate:${branch.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {canManage && (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">
                {draft.id ? 'Edit branch' : 'Add branch'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Keep location details scoped to this company.
              </p>
            </div>

            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft(EMPTY_BRANCH)}
                className="text-xs font-semibold text-slate-500"
              >
                New
              </button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <TextField label="Branch name" value={draft.name} onChange={value => setDraft({ ...draft, name: value })} />
            <TextField label="Code" value={draft.code} onChange={value => setDraft({ ...draft, code: value.toUpperCase() })} />
            <TextField label="Address line 1" value={draft.addressLine1} onChange={value => setDraft({ ...draft, addressLine1: value })} />
            <TextField label="Address line 2" value={draft.addressLine2} onChange={value => setDraft({ ...draft, addressLine2: value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="City" value={draft.city} onChange={value => setDraft({ ...draft, city: value })} />
              <TextField label="State / region" value={draft.state} onChange={value => setDraft({ ...draft, state: value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Country" value={draft.country} onChange={value => setDraft({ ...draft, country: value })} />
              <TextField label="Country code" value={draft.countryCode} maxLength={2} onChange={value => setDraft({ ...draft, countryCode: value.toUpperCase() })} />
            </div>
            <TextField label="Postal code" value={draft.postalCode} onChange={value => setDraft({ ...draft, postalCode: value })} />
            <TextField label="Phone" value={draft.phone} onChange={value => setDraft({ ...draft, phone: value })} />
            <TextField label="Email" value={draft.email} type="email" onChange={value => setDraft({ ...draft, email: value })} />

            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={draft.isMain}
                onChange={event =>
                  setDraft({
                    ...draft,
                    isMain: event.target.checked,
                  })
                }
              />
              Primary branch
            </label>

            <button
              type="button"
              onClick={onSave}
              disabled={saving === 'branch'}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {saving === 'branch' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : draft.id ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {draft.id ? 'Save branch' : 'Add branch'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompaniesView({
  companies,
  draft,
  setDraft,
  canManage,
  saving,
  onCreate,
  onSwitch,
  onLifecycle,
}: {
  companies: CompanySummary[];
  draft: CompanyDraft;
  setDraft: (value: CompanyDraft) => void;
  canManage: boolean;
  saving: string | null;
  onCreate: () => void;
  onSwitch: (id: string) => void;
  onLifecycle: (
    id: string,
    action: 'archive' | 'reactivate',
  ) => void;
}) {
  return (
    <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-3">
        <SectionHeader
          icon={Factory}
          title="Companies"
          description="Legal or operational entities inside this workspace. Company access and role permissions remain separate."
        />

        {companies.map(company => (
          <div
            key={company.id}
            className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5">
                  {company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt={`${company.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">
                      {company.name}
                    </p>
                    {company.isCurrent && <Badge>Current</Badge>}
                    {company.isDefault && <Badge>Default</Badge>}
                    {!company.isActive && <Badge>Archived</Badge>}
                  </div>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {[
                      company.companyCode,
                      company.countryCode || company.country,
                      company.currency,
                      company.timezone,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {company.isActive && !company.isCurrent && (
                  <button
                    type="button"
                    disabled={saving === `switch:${company.id}`}
                    onClick={() => onSwitch(company.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-60 dark:border-white/10"
                  >
                    {saving === `switch:${company.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Switch
                  </button>
                )}

                {canManage && !company.isCurrent && (
                  <button
                    type="button"
                    disabled={
                      saving === `archive:${company.id}` ||
                      saving === `reactivate:${company.id}`
                    }
                    onClick={() =>
                      onLifecycle(
                        company.id,
                        company.isActive
                          ? 'archive'
                          : 'reactivate',
                      )
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-60 dark:border-white/10"
                  >
                    {company.isActive ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {company.isActive
                      ? 'Archive'
                      : 'Reactivate'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <p className="text-sm font-bold">
            Create company
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            The workspace owner and creator receive access automatically.
          </p>

          <div className="mt-4 space-y-3">
            <TextField label="Company name" value={draft.name} onChange={value => setDraft({ ...draft, name: value })} />
            <TextField label="Legal name" value={draft.legalName} onChange={value => setDraft({ ...draft, legalName: value })} />
            <TextField label="Company code" value={draft.companyCode} onChange={value => setDraft({ ...draft, companyCode: value.toUpperCase() })} />
            <TextField label="Country" value={draft.country} onChange={value => setDraft({ ...draft, country: value })} />
            <TextField label="Country code" value={draft.countryCode} maxLength={2} onChange={value => setDraft({ ...draft, countryCode: value.toUpperCase() })} />
            <TextField label="Currency" value={draft.currency} maxLength={3} onChange={value => setDraft({ ...draft, currency: value.toUpperCase() })} />
            <TextField label="Timezone" value={draft.timezone} onChange={value => setDraft({ ...draft, timezone: value })} />
            <TextField label="Locale" value={draft.locale} onChange={value => setDraft({ ...draft, locale: value })} />

            <button
              type="button"
              onClick={onCreate}
              disabled={saving === 'company:create'}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {saving === 'company:create' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create company
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryView({
  history,
}: {
  history: HistoryItem[];
}) {
  return (
    <div className="space-y-4 p-5 sm:p-6">
      <SectionHeader
        icon={Clock3}
        title="Organization history"
        description="Recent organization and company configuration activity for the current company."
      />

      {history.length === 0 ? (
        <EmptyState
          title="No organization history yet"
          description="Profile, branch and company changes will appear here."
        />
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
          {history.map(item => (
            <div
              key={item.id}
              className="flex gap-3 p-4"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {actionLabel(item.action)}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(item.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-bold">
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function FieldGrid({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  inputMode?:
    | 'text'
    | 'numeric'
    | 'decimal'
    | 'email'
    | 'tel'
    | 'url';
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-300 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/10 dark:bg-[#0B0E14] dark:focus:border-white/25 dark:disabled:bg-white/5 dark:disabled:text-slate-500"
      />
    </label>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center dark:border-white/15">
      <p className="text-sm font-semibold">
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

function Badge({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
      {children}
    </span>
  );
}
