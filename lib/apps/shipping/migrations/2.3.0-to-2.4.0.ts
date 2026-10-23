import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/**
 * Brings installed Shipping workspaces up to the quote/label model without
 * rewriting existing carrier, shipment, package or milestone records.
 */
export const SHIPPING_2_3_0_TO_2_4_0: SamiModuleMigrationDefinition = {
  key: 'shipping-2.3.0-to-2.4.0-rate-quotes-label-registers',
  moduleKey: 'shipping',
  namespace: 'shipping',
  fromVersion: '2.3.0',
  toVersion: '2.4.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, [
      'CREATE TABLE IF NOT EXISTS public.shipping_rate_quotes (',
      ' id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      ' company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,',
      ' shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,',
      ' carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,',
      ' quote_reference VARCHAR(120), service_level VARCHAR(100) NOT NULL,',
      ' currency_code VARCHAR(3) NOT NULL,',
      ' base_cost NUMERIC(19,4) NOT NULL DEFAULT 0, surcharge_cost NUMERIC(19,4) NOT NULL DEFAULT 0,',
      ' tax_cost NUMERIC(19,4) NOT NULL DEFAULT 0, total_cost NUMERIC(19,4) NOT NULL DEFAULT 0,',
      ' expires_at TIMESTAMPTZ, status VARCHAR(40) NOT NULL DEFAULT \'active\',',
      ' provider_response JSONB NOT NULL DEFAULT \'{}\'::jsonb,',
      ' created_by UUID, updated_by UUID, metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb,',
      ' created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ',
      ');',
      'CREATE TABLE IF NOT EXISTS public.shipping_labels (',
      ' id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      ' company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,',
      ' shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,',
      ' carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,',
      ' tracking_number VARCHAR(255), label_url TEXT, label_format VARCHAR(40),',
      ' status VARCHAR(40) NOT NULL DEFAULT \'prepared\', provider_reference VARCHAR(255),',
      ' created_by UUID, updated_by UUID, metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb,',
      ' created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_shipments_company_recent',
      ' ON public.shipments(company_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipments_company_number_lookup',
      ' ON public.shipments(company_id, lower(shipment_number)) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipments_company_tracking_lookup',
      ' ON public.shipments(company_id, lower(tracking_number)) WHERE deleted_at IS NULL AND tracking_number IS NOT NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipping_carriers_company_active',
      ' ON public.shipping_carriers(company_id, name) WHERE status = \'active\' AND deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipment_packages_company_shipment_recent',
      ' ON public.shipment_packages(company_id, shipment_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipment_events_company_shipment_recent',
      ' ON public.shipment_events(company_id, shipment_id, occurred_at DESC, id DESC) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipping_rate_quotes_company_recent',
      ' ON public.shipping_rate_quotes(company_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_shipping_labels_company_tracking',
      ' ON public.shipping_labels(company_id, lower(tracking_number), created_at DESC)',
      ' WHERE deleted_at IS NULL AND tracking_number IS NOT NULL;',
    ].join('\n'));
  },
};
