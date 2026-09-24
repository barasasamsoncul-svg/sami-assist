import 'server-only';

import {
  ENTERPRISE_MODULE_TABLES,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import {
  searchEnterpriseModuleRecords,
} from '@/lib/apps/enterprise/service';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';


function canSearch(
  context: {
    isOwner: boolean;
    permissionSet: ReadonlySet<string>;
  },
  moduleKey:
    string,
) {
  if (
    context.isOwner
  ) {
    return true;
  }

  for (
    const permission
    of context.permissionSet
  ) {
    if (
      permission.startsWith(
        moduleKey +
        '.',
      )
    ) {
      return true;
    }
  }

  return false;
}


function provider(
  moduleKey:
    EnterpriseModuleKey,
): WorkspaceSearchProvider {
  return {
    key:
      moduleKey,

    search:
      async (
        context,
        query,
      ) => {
        if (
          !canSearch(
            context,
            moduleKey,
          )
        ) {
          return [];
        }

        const rows =
          await searchEnterpriseModuleRecords(
            moduleKey,
            query,
            12,
          );

        return rows.map(
          (
            row,
            index,
          ) => ({
            id:
              'enterprise:' +
              moduleKey +
              ':' +
              row.table +
              ':' +
              row.id,
            kind:
              'record' as const,
            title:
              row.title,
            subtitle:
              row.subtitle ||
              row.table
                .replaceAll(
                  '_',
                  ' ',
                ),
            description:
              null,
            href:
              '/apps/' +
              moduleKey,
            iconKey:
              'app-window',
            badge:
              row.table
                .replaceAll(
                  '_',
                  ' ',
                ),
            score:
              70 -
              index,
            action:
              null,
            source:
              moduleKey,
          }),
        );
      },
  };
}


export const ENTERPRISE_MODULE_SEARCH_PROVIDERS:
  WorkspaceSearchProvider[] =
  (
    Object.keys(
      ENTERPRISE_MODULE_TABLES,
    ) as
      EnterpriseModuleKey[]
  ).map(
    provider,
  );
