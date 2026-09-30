import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  /*
   * Part 24 — retry-safe mutation ledger.
   *
   * The ledger stores only a canonical request hash plus the committed
   * response. The submitted invoice payload is never persisted here.
   */
  CREATE TABLE IF NOT EXISTS public.invoicing_idempotency_requests (
    company_id UUID NOT NULL
      REFERENCES public.companies(id)
      ON DELETE CASCADE,
    idempotency_key VARCHAR(160) NOT NULL,
    action VARCHAR(80) NOT NULL,
    request_hash VARCHAR(64) NOT NULL
      CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    record_id UUID,
    response_json JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (
      company_id,
      idempotency_key
    )
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_idempotency_created
    ON public.invoicing_idempotency_requests(
      company_id,
      created_at DESC
    );

  DO $$
  BEGIN
    IF to_regprocedure(
         'public.invoicing_capture_row_audit()'
       ) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_trigger
         WHERE tgname =
               'trg_invoicing_row_audit'
           AND tgrelid =
               to_regclass(
                 'public.invoicing_idempotency_requests'
               )
           AND NOT tgisinternal
       )
    THEN
      EXECUTE
        'CREATE TRIGGER trg_invoicing_row_audit
         AFTER INSERT OR UPDATE OR DELETE
         ON public.invoicing_idempotency_requests
         FOR EACH ROW
         EXECUTE FUNCTION public.invoicing_capture_row_audit()';
    END IF;
  END
  $$;
`;


export const INVOICING_2_20_0_TO_2_21_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.20.0-to-2.21.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.20.0',
    toVersion:
      '2.21.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
