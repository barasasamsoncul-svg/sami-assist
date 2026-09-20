export type WorkspaceSearchKind =
  | 'page'
  | 'app'
  | 'company'
  | 'person'
  | 'file'
  | 'record';

export type WorkspaceSearchAction =
  | {
      type: 'switch_company';
      companyId: string;
    }
  | {
      type: 'message_user';
      userId: string;
    }
  | {
      type: 'download_file';
      fileId: string;
    };

export type WorkspaceSearchResult = {
  id: string;
  kind: WorkspaceSearchKind;
  title: string;
  subtitle: string | null;
  description: string | null;
  href: string | null;
  iconKey: string | null;
  badge: string | null;
  score: number;
  action: WorkspaceSearchAction | null;
  source: string;
};

export type WorkspaceSearchContext = {
  userId: string;
  tenantId: string;
  companyId: string;
  isOwner: boolean;
  permissionSet: ReadonlySet<string>;
  accessibleModuleKeys: string[];
};

export interface WorkspaceSearchProvider {
  key: string;
  search: (
    context: WorkspaceSearchContext,
    query: string,
  ) => Promise<WorkspaceSearchResult[]>;
}
