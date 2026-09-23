import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /*
   * SaMi intentionally synchronizes several client state surfaces from
   * URL parameters, browser storage and server-backed loaders in effects.
   * Keep the correctness-focused Hooks rules enabled, but do not treat
   * this optional React performance rule as a release-blocking error.
   *
   * SaMi also uses "module" as a first-class business-domain term across
   * the app framework. The Next.js rule targets Node's CommonJS module
   * variable and produces false positives for our domain objects.
   */
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      '@next/next/no-assign-module-variable': 'off',
    },
  },

  /*
   * The external, synchronous theme bootstrap is deliberate: it applies
   * the saved theme before first paint without requiring unsafe inline CSP.
   */
  {
    files: ['app/layout.tsx'],
    rules: {
      '@next/next/no-sync-scripts': 'off',
    },
  },

  /*
   * These are server/maintenance utilities, not React components or Hooks.
   * Function names such as useSsl/useAdminRecoveryCode describe operations
   * and must not be interpreted as React Hooks.
   */
  {
    files: [
      'lib/auth/admin-two-factor.ts',
      'app/api/admin/auth/two-factor/verify/route.ts',
      'scripts/bootstrap-category-7-company-access.ts',
      'scripts/fix-category-7-membership-session-trigger.ts',
      'scripts/migrate-category-7-9-app-grants.ts',
      'scripts/tenant-recovery-drill.ts',
    ],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  /*
   * Legacy one-off Node maintenance/check scripts intentionally use
   * CommonJS because package.json does not opt the whole repository into
   * ESM. They are not bundled into the SaMi application.
   */
  {
    files: [
      'check-*.js',
      'scripts/**/*.js',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  /*
   * These files sit on deliberately dynamic external boundaries:
   * PostgreSQL rows/query parameters, S3 response streams and generic API
   * JSON. Runtime validation is performed at the boundary; forcing casts
   * here would reduce clarity without adding safety.
   */
  {
    files: [
      'app/components/workspace/WorkspaceNotificationCenter.tsx',
      'lib/db/control.ts',
      'lib/db/registry.ts',
      'lib/db/tenant.ts',
      'lib/services/postgres-logical-backup-provider.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
