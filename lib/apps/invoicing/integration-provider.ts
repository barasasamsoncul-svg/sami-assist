import 'server-only';

import type {
  SamiIntegrationProviderDefinition,
} from '@/lib/integrations/types';
import type {
  SamiAppIntegrationWebhookHandler,
} from '@/lib/apps/runtime-integrations-types';
import {
  recordVerifiedExternalInvoiceSettlement,
} from '@/lib/apps/invoicing/external-settlement';

export const INVOICING_PAYMENT_GATEWAY_PROVIDER:SamiIntegrationProviderDefinition={
  key:'invoicing_payment_gateway',
  name:'Invoice Payment Gateway',
  description:'Receive verified normalized payment events from a gateway or provider bridge and settle SaMi invoices automatically.',
  category:'commerce',
  iconKey:'credit-card',
  connectionType:'webhook',
  websiteUrl:null,
  docsUrl:null,
  capabilities:['inbound_webhook','automation_triggers'],
  moduleKey:'invoicing',
};

export const handleInvoicingPaymentGatewayWebhook:SamiAppIntegrationWebhookHandler=
  async context=>{
    if(context.eventKey!=='invoicing.payment.succeeded'){
      return {handled:false,reason:'unsupported_event'};
    }

    if(
      !context.accessibleModuleKeys.includes('invoicing')||
      (
        !context.isOwner&&
        !context.permissionSet.has('invoicing.payment.record')
      )
    ){
      throw new Error(
        'The payment-gateway connection owner no longer has permission to record invoice payments.',
      );
    }

    const externalEventId=context.externalEventId||context.integrationEventId;
    const result=await recordVerifiedExternalInvoiceSettlement({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.ownerUserId,
      providerKey:context.providerKey,
      externalEventId,
      payload:context.payload,
    });

    return {
      handled:true,
      paymentId:result.paymentId,
      invoiceId:result.invoiceId,
      status:result.status,
      reused:result.reused,
    };
  };
