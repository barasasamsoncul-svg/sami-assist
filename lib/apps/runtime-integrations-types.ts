import type { SamiIntegrationRuntimeContext } from '@/lib/integrations/types';

export type SamiAppIntegrationWebhookContext={
  tenantId:string;
  companyId:string;
  connectionId:string|null;
  endpointId:string;
  ownerUserId:string;
  providerKey:string;
  eventKey:string;
  externalEventId:string|null;
  integrationEventId:string;
  deliveryId:string;
  payload:Record<string,unknown>;
  accessibleModuleKeys:string[];
  permissionSet:Set<string>;
  isOwner:boolean;
};

export type SamiAppIntegrationWebhookHandler=(
  context:SamiAppIntegrationWebhookContext,
)=>Promise<Record<string,unknown>>;

export type SamiAppIntegrationSyncHandler=(
  context:SamiIntegrationRuntimeContext,
  input:{
    connectionId:string;
    cursor:Record<string,unknown>;
  },
)=>Promise<{
  cursor?:Record<string,unknown>;
  result?:Record<string,unknown>;
}>;
