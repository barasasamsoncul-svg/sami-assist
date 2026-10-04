import { NextRequest } from 'next/server';

import {
  confirmInvoicePaymentProviderSetup,
  connectInvoicePaymentProvider,
  disconnectInvoicePaymentProvider,
  getInvoicePaymentProviderState,
  setPrimaryInvoicePaymentProvider,
  testInvoicePaymentProviderConnection,
} from '@/lib/apps/invoicing/payment-provider-connections';
import {
  handleIntegrationApiError,
  integrationJson,
  readIntegrationJson,
  rejectIntegrationCrossOrigin,
} from '@/lib/services/workspace-integrations-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return integrationJson({
      success: true,
      ...(await getInvoicePaymentProviderState()),
    });
  } catch (error) {
    return handleIntegrationApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const rejected = rejectIntegrationCrossOrigin(request);
  if (rejected) return rejected;

  try {
    const body = await readIntegrationJson(request);
    const operation =
      typeof body.operation === 'string'
        ? body.operation.trim().toLowerCase()
        : '';

    if (operation === 'connect') {
      const result = await connectInvoicePaymentProvider({
        provider: body.provider,
        environment: body.environment,
        credentials: body.credentials,
        origin: request.nextUrl.origin,
      });
      return integrationJson({
        success: true,
        result,
      }, 201);
    }

    if (operation === 'confirm_setup') {
      const result = await confirmInvoicePaymentProviderSetup(
        body.connectionId,
      );
      return integrationJson({
        success: true,
        result,
      });
    }

    if (operation === 'test') {
      const result = await testInvoicePaymentProviderConnection(
        body.connectionId,
      );
      return integrationJson({
        success: true,
        result,
      });
    }

    if (operation === 'make_primary') {
      const result = await setPrimaryInvoicePaymentProvider(
        body.connectionId,
      );
      return integrationJson({
        success: true,
        result,
      });
    }

    if (operation === 'disconnect') {
      const result = await disconnectInvoicePaymentProvider(
        body.connectionId,
      );
      return integrationJson({
        success: true,
        result,
      });
    }

    return integrationJson({
      success: false,
      code: 'INVALID_PAYMENT_PROVIDER_OPERATION',
      error: 'Choose a supported payment provider action.',
    }, 400);
  } catch (error) {
    return handleIntegrationApiError(error);
  }
}
