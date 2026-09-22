export type SamiModuleCategory =
  | 'finance'
  | 'documents'
  | 'sales'
  | 'commerce'
  | 'supply_chain'
  | 'operations'
  | 'people'
  | 'marketing'
  | 'work'
  | 'technical'
  | 'other';

export type SamiModuleViewType =
  | 'workspace'
  | 'list'
  | 'form'
  | 'kanban'
  | 'calendar'
  | 'graph'
  | 'pivot'
  | 'activity'
  | 'search'
  | 'dashboard';

export type SamiModuleActionType =
  | 'route'
  | 'record'
  | 'wizard'
  | 'report'
  | 'client';

export type SamiModuleOperation =
  | 'read'
  | 'create'
  | 'write'
  | 'delete';

export type SamiModuleScope =
  | 'user'
  | 'company'
  | 'selected_companies'
  | 'workspace';

export type SamiModuleNavigationItem = {
  key: string;
  label: string;
  href: string;
  iconKey?: string;
  parentKey?: string | null;
  actionKey?: string | null;
  order?: number;
};

export type SamiModuleAction = {
  key: string;
  name: string;
  type: SamiModuleActionType;
  resourceKey?: string | null;
  href?: string | null;
  viewKeys?: string[];
  target?: 'current' | 'dialog';
};

export type SamiModuleView = {
  key: string;
  name: string;
  type: SamiModuleViewType;
  resourceKey?: string | null;
  route?: string | null;
  priority?: number;
  inherits?: string[];
};

export type SamiModuleField = {
  key: string;
  label: string;
  type:
    | 'string'
    | 'text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'money'
    | 'selection'
    | 'relation'
    | 'json';
  required?: boolean;
  readonly?: boolean;
  readPermissions?: string[];
  writePermissions?: string[];
};

export type SamiModuleResource = {
  key: string;
  label: string;
  table?: string | null;
  companyScoped: boolean;
  ownerField?: string | null;
  permissions: Partial<
    Record<
      SamiModuleOperation,
      string[]
    >
  >;
  fields?: SamiModuleField[];
};

export type SamiModuleRecordPolicy = {
  key: string;
  name: string;
  resourceKey: string;
  operations: SamiModuleOperation[];
  scope: SamiModuleScope;
  requiredPermissions?: string[];
};

export type SamiModuleFieldPolicy = {
  key: string;
  resourceKey: string;
  fieldKey: string;
  readPermissions?: string[];
  writePermissions?: string[];
};

export type SamiModuleExtensions = {
  dashboard: boolean;
  search: boolean;
  notifications: boolean;
  activity: boolean;
  automationTriggers: boolean;
  automationActions: boolean;
  aiTools: boolean;
  integrationProviders: boolean;
  apiEndpoints: boolean;
};

export type SamiModuleManifest = {
  key: string;
  name: string;
  version: string;
  description: string;
  category: SamiModuleCategory;
  icon: string;
  route: string;

  application: boolean;
  installable: boolean;
  autoInstall: boolean;
  recommended: boolean;

  depends: string[];
  optionalDepends: string[];

  schemaPath: string | null;
  migrationNamespace: string;

  navigation: SamiModuleNavigationItem[];
  actions: SamiModuleAction[];
  views: SamiModuleView[];
  resources: SamiModuleResource[];

  security: {
    permissions: string[];
    recordPolicies: SamiModuleRecordPolicy[];
    fieldPolicies: SamiModuleFieldPolicy[];
  };

  settings: string[];
  extensions: SamiModuleExtensions;
};

export function defineSamiModule(
  manifest: SamiModuleManifest,
): SamiModuleManifest {
  return manifest;
}
