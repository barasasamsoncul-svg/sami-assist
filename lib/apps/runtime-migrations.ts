import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  ACCOUNTING_2_3_0_TO_2_4_0,
} from '@/lib/apps/accounting/migrations/2.3.0-to-2.4.0';

import {
  ACCOUNTING_2_4_0_TO_2_5_0,
} from '@/lib/apps/accounting/migrations/2.4.0-to-2.5.0';

import {
  INVOICING_1_0_0_TO_2_0_0,
} from '@/lib/apps/invoicing/migrations/1.0.0-to-2.0.0';

import {
  INVOICING_2_0_0_TO_2_1_0,
} from '@/lib/apps/invoicing/migrations/2.0.0-to-2.1.0';

import {
  INVOICING_2_1_0_TO_2_2_0,
} from '@/lib/apps/invoicing/migrations/2.1.0-to-2.2.0';

import {
  INVOICING_2_2_0_TO_2_3_0,
} from '@/lib/apps/invoicing/migrations/2.2.0-to-2.3.0';

import {
  INVOICING_2_3_0_TO_2_4_0,
} from '@/lib/apps/invoicing/migrations/2.3.0-to-2.4.0';

import {
  INVOICING_2_4_0_TO_2_5_0,
} from '@/lib/apps/invoicing/migrations/2.4.0-to-2.5.0';

import {
  INVOICING_2_5_0_TO_2_6_0,
} from '@/lib/apps/invoicing/migrations/2.5.0-to-2.6.0';

import {
  INVOICING_2_6_0_TO_2_7_0,
} from '@/lib/apps/invoicing/migrations/2.6.0-to-2.7.0';

import {
  INVOICING_2_7_0_TO_2_8_0,
} from '@/lib/apps/invoicing/migrations/2.7.0-to-2.8.0';

import {
  INVOICING_2_8_0_TO_2_9_0,
} from '@/lib/apps/invoicing/migrations/2.8.0-to-2.9.0';

import {
  INVOICING_2_9_0_TO_2_10_0,
} from '@/lib/apps/invoicing/migrations/2.9.0-to-2.10.0';

import {
  INVOICING_2_10_0_TO_2_11_0,
} from '@/lib/apps/invoicing/migrations/2.10.0-to-2.11.0';

import {
  INVOICING_2_11_0_TO_2_12_0,
} from '@/lib/apps/invoicing/migrations/2.11.0-to-2.12.0';

import {
  INVOICING_2_12_0_TO_2_13_0,
} from '@/lib/apps/invoicing/migrations/2.12.0-to-2.13.0';

import {
  INVOICING_2_13_0_TO_2_14_0,
} from '@/lib/apps/invoicing/migrations/2.13.0-to-2.14.0';

import {
  INVOICING_2_14_0_TO_2_15_0,
} from '@/lib/apps/invoicing/migrations/2.14.0-to-2.15.0';

import {
  INVOICING_2_15_0_TO_2_16_0,
} from '@/lib/apps/invoicing/migrations/2.15.0-to-2.16.0';

import {
  INVOICING_2_16_0_TO_2_17_0,
} from '@/lib/apps/invoicing/migrations/2.16.0-to-2.17.0';

import {
  INVOICING_2_17_0_TO_2_18_0,
} from '@/lib/apps/invoicing/migrations/2.17.0-to-2.18.0';

import {
  INVOICING_2_18_0_TO_2_19_0,
} from '@/lib/apps/invoicing/migrations/2.18.0-to-2.19.0';

import {
  INVOICING_2_19_0_TO_2_20_0,
} from '@/lib/apps/invoicing/migrations/2.19.0-to-2.20.0';

import {
  INVOICING_2_20_0_TO_2_21_0,
} from '@/lib/apps/invoicing/migrations/2.20.0-to-2.21.0';

import {
  SALES_1_0_0_TO_2_0_0,
} from '@/lib/apps/sales/migrations/1.0.0-to-2.0.0';

import {
  SALES_2_0_0_TO_2_1_0,
} from '@/lib/apps/sales/migrations/2.0.0-to-2.1.0';

import {
  SALES_2_1_0_TO_2_2_0,
} from '@/lib/apps/sales/migrations/2.1.0-to-2.2.0';

import {
  ENTERPRISE_SPECIALIST_DEPTH_MIGRATIONS,
  ENTERPRISE_STRICT_PARITY_MIGRATIONS,
  ENTERPRISE_SUITE_COMPLETION_MIGRATIONS,
  ENTERPRISE_SUITE_MIGRATIONS,
} from '@/lib/apps/enterprise/hardening';


/*
 * Migration definitions need a bootstrap-safe app-owned registry.
 *
 * The migration executor can be reached while other runtime providers are
 * still loading (for example Search -> service -> module upgrade). Keeping
 * this registry free of Search/AI/Automation service imports prevents a
 * circular initialization path while preserving app-owned migrations and a
 * module-agnostic migration kernel.
 */

export const ENTERPRISE_RUNTIME_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] = [
    ...ENTERPRISE_SUITE_MIGRATIONS,
    ...ENTERPRISE_SUITE_COMPLETION_MIGRATIONS,
    ...ENTERPRISE_SPECIALIST_DEPTH_MIGRATIONS,
    ...ENTERPRISE_STRICT_PARITY_MIGRATIONS,
    ACCOUNTING_2_3_0_TO_2_4_0,
    ACCOUNTING_2_4_0_TO_2_5_0,
  ];

export const SALES_RUNTIME_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] = [
    SALES_1_0_0_TO_2_0_0,
    SALES_2_0_0_TO_2_1_0,
    SALES_2_1_0_TO_2_2_0,
  ];

export const INVOICING_RUNTIME_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] = [
    INVOICING_1_0_0_TO_2_0_0,
    INVOICING_2_0_0_TO_2_1_0,
    INVOICING_2_1_0_TO_2_2_0,
    INVOICING_2_2_0_TO_2_3_0,
    INVOICING_2_3_0_TO_2_4_0,
    INVOICING_2_4_0_TO_2_5_0,
    INVOICING_2_5_0_TO_2_6_0,
    INVOICING_2_6_0_TO_2_7_0,
    INVOICING_2_7_0_TO_2_8_0,
    INVOICING_2_8_0_TO_2_9_0,
    INVOICING_2_9_0_TO_2_10_0,
    INVOICING_2_10_0_TO_2_11_0,
    INVOICING_2_11_0_TO_2_12_0,
    INVOICING_2_12_0_TO_2_13_0,
    INVOICING_2_13_0_TO_2_14_0,
    INVOICING_2_14_0_TO_2_15_0,
    INVOICING_2_15_0_TO_2_16_0,
    INVOICING_2_16_0_TO_2_17_0,
    INVOICING_2_17_0_TO_2_18_0,
    INVOICING_2_18_0_TO_2_19_0,
    INVOICING_2_19_0_TO_2_20_0,
    INVOICING_2_20_0_TO_2_21_0,
  ];

export const APP_RUNTIME_MODULE_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] = [
    ...ENTERPRISE_RUNTIME_MIGRATIONS,
    ...SALES_RUNTIME_MIGRATIONS,
    ...INVOICING_RUNTIME_MIGRATIONS,
  ];
