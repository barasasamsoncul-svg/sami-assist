import 'server-only';

export type SamiSmsProvider =
  | 'africastalking'
  | 'twilio'
  | 'disabled';

export type SendSmsResult = {
  success:
    boolean;
  provider:
    SamiSmsProvider;
  messageId?:
    string;
  errorCode?:
    string;
};

function clean(
  value:
    string | undefined,
) {
  return value
    ?.trim() ||
    '';
}

export function getSamiSmsProvider():
  SamiSmsProvider {
  const value =
    clean(
      process.env
        .SAMI_SMS_PROVIDER,
    )
      .toLowerCase();

  if (
    value ===
      'africastalking' ||
    value ===
      'twilio'
  ) {
    return value;
  }

  return 'disabled';
}

export function normalizeSmsPhone(
  raw:
    string | null | undefined,
): string | null {
  if (
    !raw
  ) {
    return null;
  }

  let value =
    raw
      .trim()
      .replace(
        /[\s().-]+/g,
        '',
      );

  if (
    value.startsWith(
      '00',
    )
  ) {
    value =
      `+${value.slice(
        2,
      )}`;
  }

  if (
    value.startsWith(
      '+',
    ) &&
    /^\+[1-9]\d{7,14}$/.test(
      value,
    )
  ) {
    return value;
  }

  const countryCode =
    clean(
      process.env
        .SAMI_SMS_DEFAULT_COUNTRY_CODE,
    )
      .replace(
        /^\+/,
        '',
      );

  if (
    countryCode &&
    /^\d{1,4}$/.test(
      countryCode,
    )
  ) {
    if (
      value.startsWith(
        countryCode,
      )
    ) {
      value =
        `+${value}`;
    } else if (
      value.startsWith(
        '0',
      )
    ) {
      value =
        `+${countryCode}${value.slice(
          1,
        )}`;
    }
  }

  return /^\+[1-9]\d{7,14}$/.test(
    value,
  )
    ? value
    : null;
}

function normalizeBody(
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
      640,
    );
}

async function sendAfricaTalkingSms(
  to:
    string,
  body:
    string,
): Promise<SendSmsResult> {
  const username =
    clean(
      process.env
        .AFRICASTALKING_USERNAME,
    );

  const apiKey =
    clean(
      process.env
        .AFRICASTALKING_API_KEY,
    );

  if (
    !username ||
    !apiKey
  ) {
    return {
      success:
        false,
      provider:
        'africastalking',
      errorCode:
        'SMS_NOT_CONFIGURED',
    };
  }

  const environment =
    clean(
      process.env
        .AFRICASTALKING_ENVIRONMENT,
    )
      .toLowerCase();

  const endpoint =
    clean(
      process.env
        .AFRICASTALKING_SMS_ENDPOINT,
    ) ||
    (
      environment ===
        'sandbox'
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging'
    );

  const senderId =
    clean(
      process.env
        .AFRICASTALKING_SENDER_ID,
    );

  const form =
    new URLSearchParams();

  form.set(
    'username',
    username,
  );

  form.set(
    'to',
    to,
  );

  form.set(
    'message',
    body,
  );

  if (
    senderId
  ) {
    form.set(
      'from',
      senderId,
    );
  }

  const response =
    await fetch(
      endpoint,
      {
        method:
          'POST',
        headers: {
          Accept:
            'application/json',
          'Content-Type':
            'application/x-www-form-urlencoded',
          apiKey,
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
            SMSMessageData?: {
              Recipients?: Array<{
                messageId?:
                  string;
                status?:
                  string;
                statusCode?:
                  number;
              }>;
            };
          }
        | null;

  const recipient =
    data
      ?.SMSMessageData
      ?.Recipients
      ?.[0];

  const accepted =
    response.ok &&
    recipient &&
    ![
      'Rejected',
      'Failed',
    ].includes(
      String(
        recipient.status ||
        '',
      ),
    );

  return {
    success:
      Boolean(
        accepted,
      ),
    provider:
      'africastalking',
    messageId:
      recipient
        ?.messageId ||
      undefined,
    errorCode:
      accepted
        ? undefined
        : `AT_${recipient?.statusCode ?? response.status}`,
  };
}

async function sendTwilioSms(
  to:
    string,
  body:
    string,
): Promise<SendSmsResult> {
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

  const from =
    clean(
      process.env
        .TWILIO_FROM_NUMBER,
    );

  const messagingServiceSid =
    clean(
      process.env
        .TWILIO_MESSAGING_SERVICE_SID,
    );

  if (
    !accountSid ||
    !authToken ||
    (
      !from &&
      !messagingServiceSid
    )
  ) {
    return {
      success:
        false,
      provider:
        'twilio',
      errorCode:
        'SMS_NOT_CONFIGURED',
    };
  }

  const form =
    new URLSearchParams();

  form.set(
    'To',
    to,
  );

  form.set(
    'Body',
    body,
  );

  if (
    messagingServiceSid
  ) {
    form.set(
      'MessagingServiceSid',
      messagingServiceSid,
    );
  } else {
    form.set(
      'From',
      from,
    );
  }

  const auth =
    Buffer.from(
      `${accountSid}:${authToken}`,
      'utf8',
    )
      .toString(
        'base64',
      );

  const response =
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        accountSid,
      )}/Messages.json`,
      {
        method:
          'POST',
        headers: {
          Authorization:
            `Basic ${auth}`,
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
            sid?:
              string;
            status?:
              string;
            code?:
              number;
          }
        | null;

  return {
    success:
      response.ok &&
      Boolean(
        data
          ?.sid,
      ),
    provider:
      'twilio',
    messageId:
      data
        ?.sid ||
      undefined,
    errorCode:
      response.ok
        ? undefined
        : `TWILIO_${data?.code ?? response.status}`,
  };
}

export async function sendWorkspaceNotificationSms(
  phone:
    string | null | undefined,
  input: {
    title:
      string;
    message?:
      string | null;
  },
): Promise<SendSmsResult> {
  const provider =
    getSamiSmsProvider();

  if (
    provider ===
      'disabled'
  ) {
    return {
      success:
        false,
      provider,
      errorCode:
        'SMS_DISABLED',
    };
  }

  const to =
    normalizeSmsPhone(
      phone,
    );

  if (
    !to
  ) {
    return {
      success:
        false,
      provider,
      errorCode:
        'SMS_INVALID_PHONE',
    };
  }

  const body =
    normalizeBody(
      [
        'SaMi:',
        input.title,
        input.message ||
          '',
      ]
        .filter(
          Boolean,
        )
        .join(
          ' ',
        ),
    );

  if (
    !body
  ) {
    return {
      success:
        false,
      provider,
      errorCode:
        'SMS_EMPTY',
    };
  }

  try {
    return provider ===
      'africastalking'
      ? await sendAfricaTalkingSms(
          to,
          body,
        )
      : await sendTwilioSms(
          to,
          body,
        );
  } catch (
    error
  ) {
    console.error(
      '[SaMi SMS] Delivery failed:',
      {
        provider,
        error,
      },
    );

    return {
      success:
        false,
      provider,
      errorCode:
        'SMS_PROVIDER_FAILED',
    };
  }
}
