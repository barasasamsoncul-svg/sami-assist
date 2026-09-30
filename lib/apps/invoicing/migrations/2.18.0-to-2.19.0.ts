import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `

  /*
   * Part 21 — company-bound financial authority graph.
   *
   * Every relationship below already has a normal ID foreign key. These
   * composite constraints add the missing invariant that the child and parent
   * must belong to the same company. Constraints are added NOT VALID first so
   * an old tenant with historical bad data can still upgrade; clean tenants
   * are validated immediately. New/updated rows are always enforced.
   */

  DO $$
  DECLARE
    parent_table TEXT;
  BEGIN
    FOREACH parent_table IN ARRAY ARRAY[
      'invoicing_payment_terms',
      'invoicing_tax_rates',
      'invoicing_tax_groups',
      'invoicing_templates',
      'invoicing_customers',
      'invoicing_catalog_items',
      'invoicing_invoices',
      'invoicing_invoice_items',
      'invoicing_payments',
      'invoicing_credit_notes',
      'invoicing_payment_plans',
      'invoicing_recurring_templates',
      'invoicing_dunning_policies',
      'invoicing_dunning_stages',
      'invoicing_portal_access',
      'invoicing_etims_submissions',
      'invoicing_einvoice_profiles',
      'invoicing_einvoice_participants',
      'invoicing_einvoice_documents'
    ]
    LOOP
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(company_id, id)',
        'uq_' || parent_table || '_company_id_id',
        parent_table
      );
    END LOOP;
  END
  $$;

  DO $$
  DECLARE
    relation RECORD;
    has_mismatch BOOLEAN;
  BEGIN
    FOR relation IN
      SELECT *
      FROM (
        VALUES
          ('invoicing_customers','payment_terms_id','invoicing_payment_terms','SET NULL','fk_inv_customer_terms_company'),
          ('invoicing_catalog_items','default_tax_rate_id','invoicing_tax_rates','SET NULL','fk_inv_item_tax_company'),
          ('invoicing_settings','default_payment_terms_id','invoicing_payment_terms','SET NULL','fk_inv_settings_terms_company'),
          ('invoicing_settings','default_tax_rate_id','invoicing_tax_rates','SET NULL','fk_inv_settings_tax_company'),
          ('invoicing_settings','default_template_id','invoicing_templates','SET NULL','fk_inv_settings_template_company'),

          ('invoicing_invoices','customer_id','invoicing_customers','RESTRICT','fk_inv_invoice_customer_company'),
          ('invoicing_invoices','template_id','invoicing_templates','SET NULL','fk_inv_invoice_template_company'),

          ('invoicing_invoice_items','invoice_id','invoicing_invoices','CASCADE','fk_inv_line_invoice_company'),
          ('invoicing_invoice_items','catalog_item_id','invoicing_catalog_items','SET NULL','fk_inv_line_catalog_company'),
          ('invoicing_invoice_items','tax_rate_id','invoicing_tax_rates','SET NULL','fk_inv_line_tax_company'),
          ('invoicing_invoice_items','tax_group_id','invoicing_tax_groups','SET NULL','fk_inv_line_tax_group_company'),

          ('invoicing_payments','customer_id','invoicing_customers','SET NULL','fk_inv_payment_customer_company'),
          ('invoicing_payment_allocations','payment_id','invoicing_payments','CASCADE','fk_inv_alloc_payment_company'),
          ('invoicing_payment_allocations','invoice_id','invoicing_invoices','RESTRICT','fk_inv_alloc_invoice_company'),
          ('invoicing_payment_refunds','payment_id','invoicing_payments','RESTRICT','fk_inv_refund_payment_company'),

          ('invoicing_credit_notes','invoice_id','invoicing_invoices','RESTRICT','fk_inv_credit_invoice_company'),
          ('invoicing_credit_notes','customer_id','invoicing_customers','RESTRICT','fk_inv_credit_customer_company'),
          ('invoicing_credit_note_items','credit_note_id','invoicing_credit_notes','CASCADE','fk_inv_credit_line_note_company'),
          ('invoicing_credit_note_items','invoice_item_id','invoicing_invoice_items','SET NULL','fk_inv_credit_line_invoice_line_company'),
          ('invoicing_credit_note_applications','credit_note_id','invoicing_credit_notes','RESTRICT','fk_inv_credit_apply_note_company'),
          ('invoicing_credit_note_applications','target_invoice_id','invoicing_invoices','RESTRICT','fk_inv_credit_apply_invoice_company'),
          ('invoicing_credit_note_refunds','credit_note_id','invoicing_credit_notes','RESTRICT','fk_inv_credit_refund_note_company'),

          ('invoicing_retainers','customer_id','invoicing_customers','RESTRICT','fk_inv_retainer_customer_company'),
          ('invoicing_retainers','payment_id','invoicing_payments','RESTRICT','fk_inv_retainer_payment_company'),

          ('invoicing_payment_plans','invoice_id','invoicing_invoices','RESTRICT','fk_inv_plan_invoice_company'),
          ('invoicing_payment_plans','customer_id','invoicing_customers','RESTRICT','fk_inv_plan_customer_company'),
          ('invoicing_payment_plan_installments','plan_id','invoicing_payment_plans','CASCADE','fk_inv_installment_plan_company'),
          ('invoicing_payment_plan_installments','invoice_id','invoicing_invoices','RESTRICT','fk_inv_installment_invoice_company'),

          ('invoicing_recurring_templates','customer_id','invoicing_customers','RESTRICT','fk_inv_recurring_customer_company'),
          ('invoicing_recurring_templates','source_invoice_id','invoicing_invoices','SET NULL','fk_inv_recurring_source_company'),
          ('invoicing_recurring_templates','last_invoice_id','invoicing_invoices','SET NULL','fk_inv_recurring_last_company'),
          ('invoicing_recurring_runs','recurring_template_id','invoicing_recurring_templates','CASCADE','fk_inv_run_template_company'),
          ('invoicing_recurring_runs','invoice_id','invoicing_invoices','SET NULL','fk_inv_run_invoice_company'),

          ('invoicing_dunning_stages','policy_id','invoicing_dunning_policies','CASCADE','fk_inv_stage_policy_company'),
          ('invoicing_reminders','invoice_id','invoicing_invoices','CASCADE','fk_inv_reminder_invoice_company'),
          ('invoicing_reminders','dunning_policy_id','invoicing_dunning_policies','SET NULL','fk_inv_reminder_policy_company'),
          ('invoicing_reminders','dunning_stage_id','invoicing_dunning_stages','SET NULL','fk_inv_reminder_stage_company'),

          ('invoicing_portal_access','customer_id','invoicing_customers','CASCADE','fk_inv_portal_customer_company'),
          ('invoicing_portal_messages','customer_id','invoicing_customers','CASCADE','fk_inv_portal_msg_customer_company'),
          ('invoicing_portal_messages','invoice_id','invoicing_invoices','SET NULL','fk_inv_portal_msg_invoice_company'),
          ('invoicing_portal_messages','portal_access_id','invoicing_portal_access','SET NULL','fk_inv_portal_msg_access_company'),

          ('invoicing_etims_item_mappings','catalog_item_id','invoicing_catalog_items','CASCADE','fk_inv_etims_item_company'),
          ('invoicing_etims_tax_mappings','tax_rate_id','invoicing_tax_rates','CASCADE','fk_inv_etims_tax_rate_company'),
          ('invoicing_etims_tax_mappings','tax_group_id','invoicing_tax_groups','CASCADE','fk_inv_etims_tax_group_company'),
          ('invoicing_etims_submissions','invoice_id','invoicing_invoices','RESTRICT','fk_inv_etims_invoice_company'),
          ('invoicing_etims_submissions','credit_note_id','invoicing_credit_notes','RESTRICT','fk_inv_etims_credit_company'),
          ('invoicing_etims_submission_attempts','submission_id','invoicing_etims_submissions','CASCADE','fk_inv_etims_attempt_company'),

          ('invoicing_einvoice_participants','customer_id','invoicing_customers','CASCADE','fk_inv_einvoice_customer_company'),
          ('invoicing_einvoice_documents','profile_id','invoicing_einvoice_profiles','RESTRICT','fk_inv_einvoice_profile_company'),
          ('invoicing_einvoice_documents','participant_id','invoicing_einvoice_participants','RESTRICT','fk_inv_einvoice_participant_company'),
          ('invoicing_einvoice_documents','invoice_id','invoicing_invoices','RESTRICT','fk_inv_einvoice_invoice_company'),
          ('invoicing_einvoice_documents','credit_note_id','invoicing_credit_notes','RESTRICT','fk_inv_einvoice_credit_company'),
          ('invoicing_einvoice_attempts','document_id','invoicing_einvoice_documents','CASCADE','fk_inv_einvoice_attempt_company')
      ) AS relationships(
        child_table,
        child_column,
        parent_table,
        delete_action,
        constraint_name
      )
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname =
              relation.constraint_name
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id, %I) REFERENCES public.%I(company_id, id) ON DELETE %s NOT VALID',
          relation.child_table,
          relation.constraint_name,
          relation.child_column,
          relation.parent_table,
          relation.delete_action
        );
      END IF;

      EXECUTE format(
        'SELECT EXISTS (
           SELECT 1
           FROM public.%I child
           INNER JOIN public.%I parent
             ON parent.id = child.%I
           WHERE child.%I IS NOT NULL
             AND child.company_id <> parent.company_id
         )',
        relation.child_table,
        relation.parent_table,
        relation.child_column,
        relation.child_column
      )
      INTO has_mismatch;

      IF NOT has_mismatch THEN
        EXECUTE format(
          'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
          relation.child_table,
          relation.constraint_name
        );
      END IF;
    END LOOP;
  END
  $$;

`;


export const INVOICING_2_18_0_TO_2_19_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.18.0-to-2.19.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.18.0',
    toVersion:
      '2.19.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
