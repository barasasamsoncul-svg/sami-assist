import 'server-only';

import {
  normalizeSmsPhone,
} from '@/lib/services/sms';


export type SamiWhatsAppProvider =
  | 'meta'
  | 'twilio'
  | 'disabled';

export type SendWhatsAppResult = {
  success: boolean;
  provider: SamiWhatsAppProvider;
  messageId?: string;
  errorCode?: string;
};


function clean(
  value:
    string |
    undefined,
) {
  return value?.trim() || '';
}


export function getSamiWhatsAppProvider():
  SamiWhatsAppProvider {
  const value =
    clean(
      process.env
        .SAMI_WHATSAPP_PROVIDER,
    )
      .toLowerCase();

  if (
    value ===
      'meta' ||
    value ===
      'twilio'
  ) {
    return value;
  }

  return 'disabled';
}


function absoluteHttpUrl(
  value:
    string |
    null |
    undefined,
) {
  if (!value) {
    return null;
  }

  try {
    const parsed =
      new URL(
        value,
      );

    return (
      parsed.protocol ===
        'https:' ||
      parsed.protocol ===
        'http:'
    )
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}


function normalizeCaption(
  value:
    string,
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      ' ',
    )
    .slice(
      0,
      1000,
    );
}


async function sendMetaWhatsApp(
  to:
    string,
  input: {
    caption:
      string;
    documentUrl?:
      string |
      null;
    filename?:
      string |
      null;
  },
): Promise<SendWhatsAppResult> {
  const accessToken =
    clean(
      process.env
        .META_WHATSAPP_ACCESS_TOKEN,
    );

  const phoneNumberId =
    clean(
      process.env
        .META_WHATSAPP_PHONE_NUMBER_ID,
    );

  const apiVersion =
    clean(
      process.env
        .META_WHATSAPP_API_VERSION,
    ) ||
    'v23.0';

  const configuredEndpoint =
    clean(
      process.env
        .META_WHATSAPP_MESSAGES_ENDPOINT,
    );

  if (
    !accessToken ||
    !phoneNumberId
  ) {
    return {
      success: false,
      provider: 'meta',
      errorCode:
        'WHATSAPP_NOT_CONFIGURED',
    };
  }

  const endpoint =
    configuredEndpoint ||
    (
      'https://graph.facebook.com/' +
      encodeURIComponent(
        apiVersion,
      ) +
      '/' +
      encodeURIComponent(
        phoneNumberId,
      ) +
      '/messages'
    );

  const documentUrl =
    absoluteHttpUrl(
      input.documentUrl,
    );

  const payload =
    documentUrl
      ? {
          messaging_product:
            'whatsapp',
          recipient_type:
            'individual',
          to:
            to.replace(
              /^\+/,
              '',
            ),
          type:
            'document',
          document: {
            link:
              documentUrl,
            filename:
              (
                input.filename ||
                'invoice.pdf'
              ).slice(
                0,
                120,
              ),
            caption:
              normalizeCaption(
                input.caption,
              ),
          },
        }
      : {
          messaging_product:
            'whatsapp',
          recipient_type:
            'individual',
          to:
            to.replace(
              /^\+/,
              '',
            ),
          type:
            'text',
          text: {
            preview_url:
              true,
            body:
              normalizeCaption(
                input.caption,
              ),
          },
        };

  const response =
    await fetch(
      endpoint,
      {
        method:
          'POST',
        headers: {
          Authorization:
            'Bearer ' +
            accessToken,
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify(
            payload,
          ),
        cache:
          'no-store',
      },
    );

  const data =
    await response
      .json()
      .catch(
        () => null,
      ) as
        | {
            messages?: Array<{
              id?: string;
            }>;
            error?: {
              code?: number;
            };
          }
        | null;

  const messageId =
    data?.messages?.[0]?.id;

  return {
    success:
      response.ok &&
      Boolean(
        messageId,
      ),
    provider:
      'meta',
    messageId:
      messageId ||
      undefined,
    errorCode:
      response.ok
        ? undefined
        : 'META_' +
          (
            data?.error?.code ??
            response.status
          ),
  };
}


async function sendTwilioWhatsApp(
  to:
    string,
  input: {
    caption:
      string;
    documentUrl?:
      string |
      null;
  },
): Promise<SendWhatsAppResult> {
  const accountSid =
    clean(
      process.env
        .TWILIO_ACCOUNT_SID,
    );

  const authToken =
    clean(
      process.env
        .TWILIO_AUTH_TOKEN,
    );

  const rawFrom =
    clean(
      process.env
        .TWILIO_WHATSAPP_FROM,
    ) ||
    clean(
      process.env
        .TWILIO_FROM_NUMBER,
    );

  if (
    !accountSid ||
    !authToken ||
    !rawFrom
  ) {
    return {
      success: false,
      provider: 'twilio',
      errorCode:
        'WHATSAPP_NOT_CONFIGURED',
    };
  }

  const fromNumber =
    normalizeSmsPhone(
      rawFrom.replace(
        /^whatsapp:/i,
        '',
      ),
    );

  if (!fromNumber) {
    return {
      success: false,
      provider: 'twilio',
      errorCode:
        'WHATSAPP_INVALID_FROM',
    };
  }

  const form =
    new URLSearchParams();

  form.set(
    'To',
    'whatsapp:' +
    to,
  );

  form.set(
    'From',
    'whatsapp:' +
    fromNumber,
  );

  form.set(
    'Body',
    normalizeCaption(
      input.caption,
    ),
  );

  const documentUrl =
    absoluteHttpUrl(
      input.documentUrl,
    );

  if (documentUrl) {
    form.set(
      'MediaUrl',
      documentUrl,
    );
  }

  const auth =
    Buffer.from(
      accountSid +
      ':' +
      authToken,
      'utf8',
    )
      .toString(
        'base64',
      );

  const response =
    await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' +
      encodeURIComponent(
        accountSid,
      ) +
      '/Messages.json',
      {
        method:
          'POST',
        headers: {
          Authorization:
            'Basic ' +
            auth,
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          form,
        cache:
          'no-store',
      },
    );

  const data =
    await response
      .json()
      .catch(
        () => null,
      ) as
        | {
            sid?: string;
            code?: number;
          }
        | null;

  return {
    success:
      response.ok &&
      Boolean(
        data?.sid,
      ),
    provider:
      'twilio',
    messageId:
      data?.sid ||
      undefined,
    errorCode:
      response.ok
        ? undefined
        : 'TWILIO_' +
          (
            data?.code ??
            response.status
          ),
  };
}


export async function sendInvoiceWhatsApp(
  phone:
    string |
    null |
    undefined,
  input: {
    caption:
      string;
    documentUrl?:
      string |
      null;
    filename?:
      string |
      null;
  },
): Promise<SendWhatsAppResult> {
  const provider =
    getSamiWhatsAppProvider();

  if (
    provider ===
      'disabled'
  ) {
    return {
      success: false,
      provider,
      errorCode:
        'WHATSAPP_DISABLED',
    };
  }

  const to =
    normalizeSmsPhone(
      phone,
    );

  if (!to) {
    return {
      success: false,
      provider,
      errorCode:
        'WHATSAPP_INVALID_PHONE',
    };
  }

  try {
    return provider ===
      'meta'
      ? await sendMetaWhatsApp(
          to,
          input,
        )
      : await sendTwilioWhatsApp(
          to,
          input,
        );
  } catch (
    error
  ) {
    console.error(
      '[SaMi WhatsApp] Delivery failed:',
      {
        provider,
        error,
      },
    );

    return {
      success: false,
      provider,
      errorCode:
        'WHATSAPP_PROVIDER_FAILED',
    };
  }
}
