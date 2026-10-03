import 'server-only';

import type { SamiIntegrationProviderDefinition } from '@/lib/integrations/types';
import type { SamiAppIntegrationWebhookHandler } from '@/lib/apps/runtime-integrations-types';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  ingestNormalizedFeedTrusted,
} from '@/lib/apps/accounting/statements';
import {
  recordExternalAccountingDocumentExtraction,
} from '@/lib/apps/accounting/document-extraction';

export const ACCOUNTING_BANK_FEED_PROVIDER:SamiIntegrationProviderDefinition={
  key:'accounting_bank_feed',
  name:'Accounting Bank Feed',
  description:'Receive verified normalized bank, cash or mobile-money transactions from a bank, aggregator or provider bridge and import them into Accounting.',
  category:'finance',
  iconKey:'landmark',
  connectionType:'webhook',
  websiteUrl:null,
  docsUrl:null,
  capabilities:['inbound_webhook','automation_triggers'],
  moduleKey:'accounting',
};

function object(value:unknown) {
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

export const handleAccountingBankFeedWebhook:SamiAppIntegrationWebhookHandler=
  async context=>{
    if (context.eventKey!=='accounting.bank_feed.transactions') {
      return {handled:false,reason:'unsupported_event'};
    }

    if(
      !context.accessibleModuleKeys.includes('accounting')||
      (
        !context.isOwner&&
        !context.permissionSet.has('accounting.record.create')&&
        !context.permissionSet.has('accounting.record.edit')
      )
    ){
      throw new Error(
        'The bank-feed connection owner no longer has Accounting write permission.',
      );
    }

    const payload=object(context.payload);
    const feedConnectionId=
      typeof payload.feedConnectionId==='string'
        ? payload.feedConnectionId.trim()
        : '';

    if (!feedConnectionId) {
      throw new Error('Bank-feed webhook payload requires feedConnectionId.');
    }

    const pool=await getTenantPoolByTenantId(context.tenantId);
    const connection=await pool.query(
      `SELECT id::text
       FROM accounting_bank_feed_connections
       WHERE company_id=$1
         AND id=$2::uuid
         AND deleted_at IS NULL
       LIMIT 1`,
      [context.companyId,feedConnectionId],
    );

    if (!connection.rows[0]) {
      throw new Error('Accounting bank-feed connection was not found in this company.');
    }

    const requestKey=context.integrationEventId;

    const result=await ingestNormalizedFeedTrusted(
      {
        tenantId:context.tenantId,
        companyId:context.companyId,
        userId:context.ownerUserId,
        pool,
      },
      {
        connectionId:feedConnectionId,
        requestKey,
        cursor:typeof payload.cursor==='string'?payload.cursor:null,
        transactions:Array.isArray(payload.transactions)?payload.transactions:[],
      },
    );

    return {
      handled:true,
      feedConnectionId,
      ...result,
    };
  };


export const ACCOUNTING_DOCUMENT_EXTRACTOR_PROVIDER:SamiIntegrationProviderDefinition={
  key:'accounting_document_extractor',
  name:'Accounting Document Extractor',
  description:'Receive verified OCR/document extraction results for private Accounting documents, including PDFs that are processed by an external provider bridge.',
  category:'finance',
  iconKey:'scan-line',
  connectionType:'webhook',
  websiteUrl:null,
  docsUrl:null,
  capabilities:['inbound_webhook','automation_triggers'],
  moduleKey:'accounting',
};

export const handleAccountingDocumentExtractorWebhook:SamiAppIntegrationWebhookHandler=
  async context=>{
    if (context.eventKey!=='accounting.document.extracted') {
      return {handled:false,reason:'unsupported_event'};
    }
    if(
      !context.accessibleModuleKeys.includes('accounting')||
      (
        !context.isOwner&&
        !context.permissionSet.has('accounting.record.create')&&
        !context.permissionSet.has('accounting.record.edit')
      )
    ){
      throw new Error(
        'The document-extractor connection owner no longer has Accounting write permission.',
      );
    }

    const externalEventId=context.externalEventId||context.integrationEventId;
    const result=await recordExternalAccountingDocumentExtraction({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.ownerUserId,
      providerKey:context.providerKey,
      externalEventId,
      requestKey:context.integrationEventId,
      payload:context.payload,
    });
    return {
      handled:true,
      extractionId:String(result.id),
      status:String(result.status),
    };
  };
