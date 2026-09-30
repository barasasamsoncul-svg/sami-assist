import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `

  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS public.invoicing_audit_heads (
    company_id UUID PRIMARY KEY,
    last_sequence BIGINT NOT NULL DEFAULT 0
      CHECK (last_sequence >= 0),
    last_hash VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS public.invoicing_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sequence_no BIGINT NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    event_key VARCHAR(160) NOT NULL,
    action VARCHAR(20) NOT NULL
      CHECK (action IN ('insert','update','delete','event')),
    actor_user_id UUID,
    actor_type VARCHAR(20) NOT NULL DEFAULT 'system'
      CHECK (actor_type IN ('user','system','worker','integration')),
    source VARCHAR(40) NOT NULL DEFAULT 'database',
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_hash VARCHAR(64),
    entry_hash VARCHAR(64) NOT NULL,
    hash_version SMALLINT NOT NULL DEFAULT 1
      CHECK (hash_version = 1),
    UNIQUE(company_id, sequence_no),
    UNIQUE(company_id, entry_hash)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_audit_resource
    ON public.invoicing_audit_log(
      company_id,
      resource_type,
      resource_id,
      sequence_no DESC
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_audit_event
    ON public.invoicing_audit_log(
      company_id,
      event_key,
      sequence_no DESC
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_audit_time
    ON public.invoicing_audit_log(
      company_id,
      occurred_at DESC,
      sequence_no DESC
    );

  CREATE OR REPLACE FUNCTION public.invoicing_compute_audit_hash(
    p_id UUID,
    p_company_id UUID,
    p_sequence_no BIGINT,
    p_resource_type TEXT,
    p_resource_id UUID,
    p_event_key TEXT,
    p_action TEXT,
    p_actor_user_id UUID,
    p_actor_type TEXT,
    p_source TEXT,
    p_before_state JSONB,
    p_after_state JSONB,
    p_metadata JSONB,
    p_occurred_at TIMESTAMPTZ,
    p_previous_hash TEXT,
    p_hash_version SMALLINT
  )
  RETURNS TEXT
  LANGUAGE SQL
  IMMUTABLE
  AS $$
    SELECT encode(
      digest(
        concat_ws(
          E'\\x1f',
          COALESCE(p_id::text, ''),
          COALESCE(p_company_id::text, ''),
          COALESCE(p_sequence_no::text, ''),
          COALESCE(p_resource_type, ''),
          COALESCE(p_resource_id::text, ''),
          COALESCE(p_event_key, ''),
          COALESCE(p_action, ''),
          COALESCE(p_actor_user_id::text, ''),
          COALESCE(p_actor_type, ''),
          COALESCE(p_source, ''),
          COALESCE(p_before_state, '{}'::jsonb)::text,
          COALESCE(p_after_state, '{}'::jsonb)::text,
          COALESCE(p_metadata, '{}'::jsonb)::text,
          COALESCE(EXTRACT(EPOCH FROM p_occurred_at)::text, ''),
          COALESCE(p_previous_hash, ''),
          COALESCE(p_hash_version::text, '')
        ),
        'sha256'
      ),
      'hex'
    )
  $$;

  CREATE OR REPLACE FUNCTION public.invoicing_prepare_audit_entry()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  DECLARE
    current_sequence BIGINT;
    current_hash VARCHAR(64);
  BEGIN
    INSERT INTO public.invoicing_audit_heads (
      company_id,
      last_sequence,
      last_hash
    )
    VALUES (
      NEW.company_id,
      0,
      NULL
    )
    ON CONFLICT (company_id)
    DO NOTHING;

    SELECT
      last_sequence,
      last_hash
    INTO
      current_sequence,
      current_hash
    FROM public.invoicing_audit_heads
    WHERE company_id = NEW.company_id
    FOR UPDATE;

    NEW.sequence_no :=
      COALESCE(current_sequence, 0) + 1;

    NEW.previous_hash :=
      current_hash;

    NEW.occurred_at :=
      COALESCE(
        NEW.occurred_at,
        NOW()
      );

    NEW.hash_version :=
      1;

    NEW.entry_hash :=
      public.invoicing_compute_audit_hash(
        NEW.id,
        NEW.company_id,
        NEW.sequence_no,
        NEW.resource_type,
        NEW.resource_id,
        NEW.event_key,
        NEW.action,
        NEW.actor_user_id,
        NEW.actor_type,
        NEW.source,
        NEW.before_state,
        NEW.after_state,
        NEW.metadata,
        NEW.occurred_at,
        NEW.previous_hash,
        NEW.hash_version
      );

    UPDATE public.invoicing_audit_heads
    SET
      last_sequence =
        NEW.sequence_no,
      last_hash =
        NEW.entry_hash,
      updated_at =
        NOW()
    WHERE company_id =
          NEW.company_id;

    RETURN NEW;
  END;
  $$;

  CREATE OR REPLACE FUNCTION public.invoicing_reject_audit_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION
      'Invoicing audit entries are append-only and cannot be updated or deleted.';
  END;
  $$;

  CREATE OR REPLACE FUNCTION public.invoicing_capture_row_audit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  DECLARE
    before_json JSONB;
    after_json JSONB;
    state_json JSONB;
    company_value UUID;
    actor_value UUID;
    actor_text TEXT;
    record_value UUID;
    resource_value TEXT;
    event_value TEXT;
    source_value TEXT;
  BEGIN
    before_json :=
      CASE
        WHEN TG_OP IN ('UPDATE','DELETE')
          THEN to_jsonb(OLD)
        ELSE '{}'::jsonb
      END;

    after_json :=
      CASE
        WHEN TG_OP IN ('INSERT','UPDATE')
          THEN to_jsonb(NEW)
        ELSE '{}'::jsonb
      END;

    before_json :=
      before_json - ARRAY[
        'credential_sealed',
        'communication_key_sealed',
        'public_token_hash',
        'token_hash',
        'xml_payload',
        'request_payload',
        'response_payload',
        'provider_response',
        'initialization_payload',
        'internal_data',
        'receipt_signature'
      ];

    after_json :=
      after_json - ARRAY[
        'credential_sealed',
        'communication_key_sealed',
        'public_token_hash',
        'token_hash',
        'xml_payload',
        'request_payload',
        'response_payload',
        'provider_response',
        'initialization_payload',
        'internal_data',
        'receipt_signature'
      ];

    state_json :=
      CASE
        WHEN TG_OP = 'DELETE'
          THEN before_json
        ELSE after_json
      END;

    company_value :=
      NULLIF(
        state_json ->> 'company_id',
        ''
      )::uuid;

    actor_text :=
      COALESCE(
        NULLIF(state_json ->> 'actor_user_id', ''),
        NULLIF(state_json ->> 'changed_by', ''),
        NULLIF(state_json ->> 'updated_by', ''),
        NULLIF(state_json ->> 'created_by', ''),
        NULLIF(state_json ->> 'submitted_by', ''),
        NULLIF(state_json ->> 'generated_by', ''),
        NULLIF(state_json ->> 'issued_by', ''),
        NULLIF(state_json ->> 'approved_by', ''),
        NULLIF(state_json ->> 'rejected_by', ''),
        NULLIF(state_json ->> 'reversed_by', ''),
        NULLIF(state_json ->> 'cancelled_by', ''),
        NULLIF(state_json ->> 'applied_by', ''),
        NULLIF(state_json ->> 'activated_by', ''),
        NULLIF(state_json ->> 'paused_by', ''),
        NULLIF(state_json ->> 'revoked_by', ''),
        NULLIF(state_json ->> 'sent_by', '')
      );

    IF actor_text IS NOT NULL
       AND actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
      actor_value :=
        actor_text::uuid;
    ELSE
      actor_value :=
        NULL;
    END IF;

    record_value :=
      NULLIF(
        state_json ->> 'id',
        ''
      )::uuid;

    resource_value :=
      regexp_replace(
        TG_TABLE_NAME,
        '^invoicing_',
        ''
      );

    event_value :=
      'row.' ||
      lower(TG_OP);

    source_value :=
      CASE
        WHEN TG_TABLE_NAME LIKE 'invoicing_etims_%'
          THEN 'etims'
        WHEN TG_TABLE_NAME LIKE 'invoicing_einvoice_%'
          THEN 'einvoicing'
        WHEN TG_TABLE_NAME IN (
          'invoicing_recurring_runs',
          'invoicing_reminders'
        )
          THEN 'worker'
        ELSE 'database'
      END;

    IF TG_TABLE_NAME = 'invoicing_events'
       AND NULLIF(state_json ->> 'invoice_id', '') IS NOT NULL
    THEN
      resource_value :=
        'invoice';
      record_value :=
        (state_json ->> 'invoice_id')::uuid;
      event_value :=
        COALESCE(
          NULLIF(
            state_json ->> 'event_key',
            ''
          ),
          event_value
        );
    ELSIF TG_TABLE_NAME = 'invoicing_status_history'
       AND NULLIF(state_json ->> 'invoice_id', '') IS NOT NULL
    THEN
      resource_value :=
        'invoice';
      record_value :=
        (state_json ->> 'invoice_id')::uuid;
      event_value :=
        'invoice.status_history';
    ELSIF TG_TABLE_NAME IN (
      'invoicing_delivery_log',
      'invoicing_document_snapshots'
    )
       AND NULLIF(state_json ->> 'invoice_id', '') IS NOT NULL
    THEN
      resource_value :=
        'invoice';
      record_value :=
        (state_json ->> 'invoice_id')::uuid;
      event_value :=
        CASE
          WHEN TG_TABLE_NAME =
               'invoicing_delivery_log'
            THEN 'invoice.delivery.' ||
                 lower(TG_OP)
          ELSE 'invoice.document_snapshot.' ||
               lower(TG_OP)
        END;
    END IF;

    INSERT INTO public.invoicing_audit_log (
      company_id,
      resource_type,
      resource_id,
      event_key,
      action,
      actor_user_id,
      actor_type,
      source,
      before_state,
      after_state,
      metadata
    )
    VALUES (
      company_value,
      resource_value,
      record_value,
      event_value,
      lower(TG_OP),
      actor_value,
      CASE
        WHEN actor_value IS NOT NULL
          THEN 'user'
        WHEN source_value IN (
          'etims',
          'einvoicing'
        )
          THEN 'integration'
        WHEN source_value = 'worker'
          THEN 'worker'
        ELSE 'system'
      END,
      source_value,
      before_json,
      after_json,
      jsonb_build_object(
        'table',
        TG_TABLE_NAME,
        'operation',
        TG_OP
      )
    );

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_invoicing_audit_prepare
    ON public.invoicing_audit_log;

  CREATE TRIGGER trg_invoicing_audit_prepare
  BEFORE INSERT
  ON public.invoicing_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.invoicing_prepare_audit_entry();

  DROP TRIGGER IF EXISTS trg_invoicing_audit_append_only
    ON public.invoicing_audit_log;

  CREATE TRIGGER trg_invoicing_audit_append_only
  BEFORE UPDATE OR DELETE
  ON public.invoicing_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.invoicing_reject_audit_mutation();

  DO $$
  DECLARE
    table_record RECORD;
  BEGIN
    FOR table_record IN
      SELECT
        schemaname,
        tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename LIKE 'invoicing_%'
        AND tablename NOT IN (
          'invoicing_audit_heads',
          'invoicing_audit_log'
        )
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname =
              'trg_invoicing_row_audit'
          AND tgrelid =
              to_regclass(
                'public.' ||
                table_record.tablename
              )
          AND NOT tgisinternal
      ) THEN
        EXECUTE format(
          'CREATE TRIGGER trg_invoicing_row_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.invoicing_capture_row_audit()',
          table_record.tablename
        );
      END IF;
    END LOOP;
  END
  $$;

  CREATE OR REPLACE VIEW public.invoicing_audit_integrity AS
  WITH ordered AS (
    SELECT
      audit.*,
      lag(audit.entry_hash)
        OVER (
          PARTITION BY audit.company_id
          ORDER BY audit.sequence_no
        )
        AS expected_previous_hash,
      public.invoicing_compute_audit_hash(
        audit.id,
        audit.company_id,
        audit.sequence_no,
        audit.resource_type,
        audit.resource_id,
        audit.event_key,
        audit.action,
        audit.actor_user_id,
        audit.actor_type,
        audit.source,
        audit.before_state,
        audit.after_state,
        audit.metadata,
        audit.occurred_at,
        audit.previous_hash,
        audit.hash_version
      )
        AS expected_entry_hash
    FROM public.invoicing_audit_log audit
  ),
  aggregate_state AS (
    SELECT
      company_id,
      COUNT(*)::BIGINT
        AS entry_count,
      MIN(sequence_no)
        AS first_sequence,
      MAX(sequence_no)
        AS last_sequence,
      (
        ARRAY_AGG(
          entry_hash
          ORDER BY sequence_no DESC
        )
      )[1]
        AS last_entry_hash,
      BOOL_AND(
        entry_hash =
        expected_entry_hash
      )
        AS hashes_valid,
      BOOL_AND(
        previous_hash
        IS NOT DISTINCT FROM
        expected_previous_hash
      )
        AS links_valid
    FROM ordered
    GROUP BY company_id
  )
  SELECT
    aggregate_state.company_id,
    aggregate_state.entry_count,
    aggregate_state.first_sequence,
    aggregate_state.last_sequence,
    aggregate_state.last_entry_hash,
    aggregate_state.hashes_valid,
    aggregate_state.links_valid,
    heads.last_sequence
      AS head_sequence,
    heads.last_hash
      AS head_hash,
    (
      aggregate_state.first_sequence = 1
      AND aggregate_state.last_sequence =
          aggregate_state.entry_count
      AND aggregate_state.hashes_valid
      AND aggregate_state.links_valid
      AND heads.last_sequence =
          aggregate_state.last_sequence
      AND heads.last_hash =
          aggregate_state.last_entry_hash
    )
      AS chain_valid
  FROM aggregate_state
  INNER JOIN public.invoicing_audit_heads heads
    ON heads.company_id =
       aggregate_state.company_id;

`;


export const INVOICING_2_19_0_TO_2_20_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.19.0-to-2.20.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.19.0',
    toVersion:
      '2.20.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
