import 'server-only';

import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

import type {
  WorkspaceInvitation,
} from '@/lib/services/invitations';


/* ================================================================
   SaMi INVITATION EMAIL DELIVERY

   Category 9.3

   PURPOSE

   Dedicated email delivery for workspace invitations.

   This file DOES NOT:

   - create invitations
   - generate invitation tokens
   - store invitation tokens
   - accept invitations
   - grant memberships
   - grant roles
   - grant company access

   Those responsibilities remain inside the invitation/access
   services.

   SECURITY

   - raw invitation token is used only to construct the email URL
   - token is never logged
   - recipient email is never logged
   - APP_URL controls the destination origin
   - SMTP credentials never leave the server

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export interface SendWorkspaceInvitationEmailInput {
  invitation:
    WorkspaceInvitation;

  token:
    string;
}


export interface SendWorkspaceInvitationEmailResult {
  success:
    boolean;

  messageId?:
    string;
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const MAX_EMAIL_LENGTH =
  254;


const MAX_TOKEN_LENGTH =
  500;


/* ================================================================
   TRANSPORTER
   ================================================================ */

let transporter:
  Transporter | null =
  null;


/* ================================================================
   HTML ESCAPE
   ================================================================ */

function escapeHtml(
  value:
    string,
): string {
  return value
    .replace(
      /&/g,
      '&amp;',
    )
    .replace(
      /</g,
      '&lt;',
    )
    .replace(
      />/g,
      '&gt;',
    )
    .replace(
      /"/g,
      '&quot;',
    )
    .replace(
      /'/g,
      '&#039;',
    );
}


/* ================================================================
   EMAIL
   ================================================================ */

function normalizeEmail(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase();
}


function isValidEmail(
  value:
    string,
): boolean {
  return (
    value.length >
      0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  );
}


/* ================================================================
   APP URL
   ================================================================ */

function getAppUrl():
  string {
  const configured =
    process.env.APP_URL
      ?.trim();


  if (
    !configured
  ) {
    throw new Error(
      'APP_URL is required.',
    );
  }


  let url:
    URL;


  try {
    url =
      new URL(
        configured,
      );
  } catch {
    throw new Error(
      'APP_URL must be a valid URL.',
    );
  }


  if (
    url.protocol !==
      'https:' &&
    url.protocol !==
      'http:'
  ) {
    throw new Error(
      'APP_URL must use HTTP or HTTPS.',
    );
  }


  return url
    .toString()
    .replace(
      /\/+$/,
      '',
    );
}


/* ================================================================
   INVITATION URL
   ================================================================ */

function buildInvitationUrl(
  token:
    string,
): string {
  const normalizedToken =
    token.trim();


  if (
    normalizedToken.length <
      32 ||
    normalizedToken.length >
      MAX_TOKEN_LENGTH
  ) {
    throw new Error(
      'Invalid invitation token.',
    );
  }


  const baseUrl =
    getAppUrl();


  return new URL(
    `/invite/${encodeURIComponent(
      normalizedToken,
    )}`,
    `${baseUrl}/`,
  ).toString();
}


/* ================================================================
   SMTP
   ================================================================ */

function isSmtpConfigured():
  boolean {
  return (
    Boolean(
      process.env
        .SMTP_HOST
        ?.trim(),
    ) &&
    Boolean(
      process.env
        .SMTP_USER
        ?.trim(),
    ) &&
    Boolean(
      process.env
        .SMTP_PASSWORD,
    )
  );
}


function ensureEmailDeliveryAvailable():
  boolean {
  if (
    isSmtpConfigured()
  ) {
    return true;
  }


  if (
    process.env.NODE_ENV ===
    'production'
  ) {
    throw new Error(
      'SMTP is not configured. Invitation email delivery is required in production.',
    );
  }


  console.warn(
    '[SaMi] SMTP is not configured. Invitation email was not delivered.',
  );


  return false;
}


function getTransporter():
  Transporter {
  if (
    transporter
  ) {
    return transporter;
  }


  const host =
    process.env.SMTP_HOST
      ?.trim();


  const user =
    process.env.SMTP_USER
      ?.trim();


  const password =
    process.env
      .SMTP_PASSWORD;


  if (
    !host ||
    !user ||
    !password
  ) {
    throw new Error(
      'SMTP configuration is incomplete.',
    );
  }


  const port =
    Number.parseInt(
      process.env.SMTP_PORT ||
        '587',
      10,
    );


  if (
    !Number.isInteger(
      port,
    ) ||
    port <=
      0 ||
    port >
      65535
  ) {
    throw new Error(
      'Invalid SMTP_PORT configuration.',
    );
  }


  const secure =
    process.env.SMTP_SECURE ===
      'true' ||
    port ===
      465;


  transporter =
    nodemailer.createTransport({
      host,

      port,

      secure,

      auth: {
        user,

        pass:
          password,
      },

      connectionTimeout:
        10_000,

      greetingTimeout:
        10_000,

      socketTimeout:
        20_000,
    });


  return transporter;
}


/* ================================================================
   FROM
   ================================================================ */

function getFromAddress():
  string {
  const configured =
    process.env.EMAIL_FROM
      ?.trim();


  if (
    configured
  ) {
    return configured;
  }


  const smtpUser =
    process.env.SMTP_USER
      ?.trim();


  if (
    !smtpUser
  ) {
    throw new Error(
      'Email sender is not configured.',
    );
  }


  return `SaMi <${smtpUser}>`;
}


/* ================================================================
   REPLY TO
   ================================================================ */

function getReplyTo():
  string | undefined {
  const configured =
    process.env.EMAIL_REPLY_TO
      ?.trim();


  if (
    !configured
  ) {
    return undefined;
  }


  const normalized =
    normalizeEmail(
      configured,
    );


  if (
    !isValidEmail(
      normalized,
    )
  ) {
    console.warn(
      '[SaMi] EMAIL_REPLY_TO is invalid and will be ignored.',
    );


    return undefined;
  }


  return normalized;
}


/* ================================================================
   DATE
   ================================================================ */

function formatExpiry(
  value:
    string,
): string {
  const date =
    new Date(
      value,
    );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'the invitation expiry date';
  }


  return new Intl.DateTimeFormat(
    'en',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',

      timeZone:
        'UTC',
    },
  ).format(
    date,
  ) +
    ' UTC';
}


/* ================================================================
   ROLE SUMMARY
   ================================================================ */

function getRoleNames(
  invitation:
    WorkspaceInvitation,
): string[] {
  return invitation.roles
    .filter(
      role =>
        role.available,
    )
    .map(
      role =>
        role.name,
    )
    .filter(
      Boolean,
    );
}


/* ================================================================
   COMPANY SUMMARY
   ================================================================ */

function getCompanyNames(
  invitation:
    WorkspaceInvitation,
): string[] {
  return invitation.companies
    .filter(
      company =>
        company.available,
    )
    .map(
      company =>
        company.name,
    )
    .filter(
      Boolean,
    );
}


/* ================================================================
   TEXT EMAIL
   ================================================================ */

function buildTextEmail(
  invitation:
    WorkspaceInvitation,

  invitationUrl:
    string,
): string {
  const inviterName =
    invitation.invitedBy
      .fullName ||
    invitation.invitedBy
      .email ||
    'A workspace administrator';


  const roleNames =
    getRoleNames(
      invitation,
    );


  const companyNames =
    getCompanyNames(
      invitation,
    );


  const lines = [
    `You have been invited to ${invitation.workspaceName} on SaMi.`,

    '',

    `${inviterName} invited you to join this workspace.`,

    '',

    `Access type: ${
      invitation.memberType ===
      'portal'
        ? 'Portal User'
        : 'Internal User'
    }`,
  ];


  if (
    roleNames.length >
      0
  ) {
    lines.push(
      `Roles: ${roleNames.join(
        ', ',
      )}`,
    );
  }


  if (
    companyNames.length >
      0
  ) {
    lines.push(
      `Companies: ${companyNames.join(
        ', ',
      )}`,
    );
  }


  if (
    invitation.message
  ) {
    lines.push(
      '',
      'Message:',
      invitation.message,
    );
  }


  lines.push(
    '',
    `Accept invitation: ${invitationUrl}`,

    '',

    `This invitation expires on ${formatExpiry(
      invitation.expiresAt,
    )}.`,

    '',

    'If you were not expecting this invitation, you can ignore this email.',

    '',

    'SaMi',

    'AI Powered Business Workspace',
  );


  return lines.join(
    '\n',
  );
}


/* ================================================================
   HTML EMAIL
   ================================================================ */

function buildHtmlEmail(
  invitation:
    WorkspaceInvitation,

  invitationUrl:
    string,
): string {
  const workspaceName =
    escapeHtml(
      invitation.workspaceName ||
        'SaMi Workspace',
    );


  const inviterName =
    escapeHtml(
      invitation.invitedBy
        .fullName ||
      invitation.invitedBy
        .email ||
      'A workspace administrator',
    );


  const safeUrl =
    escapeHtml(
      invitationUrl,
    );


  const expiry =
    escapeHtml(
      formatExpiry(
        invitation.expiresAt,
      ),
    );


  const typeLabel =
    invitation.memberType ===
      'portal'
      ? 'Portal User'
      : 'Internal User';


  const roleNames =
    getRoleNames(
      invitation,
    );


  const companyNames =
    getCompanyNames(
      invitation,
    );


  const roleHtml =
    roleNames.length >
      0
      ? `
        <tr>
          <td
            style="
              padding:0 0 12px;
              font-size:13px;
              line-height:20px;
              color:#475569;
            "
          >
            <strong
              style="
                color:#0f172a;
              "
            >
              Roles:
            </strong>
            ${escapeHtml(
              roleNames.join(
                ', ',
              ),
            )}
          </td>
        </tr>
      `
      : '';


  const companyHtml =
    companyNames.length >
      0
      ? `
        <tr>
          <td
            style="
              padding:0 0 12px;
              font-size:13px;
              line-height:20px;
              color:#475569;
            "
          >
            <strong
              style="
                color:#0f172a;
              "
            >
              Companies:
            </strong>
            ${escapeHtml(
              companyNames.join(
                ', ',
              ),
            )}
          </td>
        </tr>
      `
      : '';


  const messageHtml =
    invitation.message
      ? `
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            margin-top:20px;
          "
        >
          <tr>
            <td
              style="
                padding:14px 16px;
                border:1px solid #dbeafe;
                border-radius:10px;
                background:#f8fbff;
                font-size:13px;
                line-height:20px;
                color:#334155;
              "
            >
              <div
                style="
                  margin-bottom:5px;
                  font-size:11px;
                  font-weight:700;
                  color:#2563eb;
                  text-transform:uppercase;
                  letter-spacing:.05em;
                "
              >
                Message
              </div>

              ${escapeHtml(
                invitation.message,
              )}
            </td>
          </tr>
        </table>
      `
      : '';


  const year =
    new Date()
      .getUTCFullYear();


  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>Workspace invitation — SaMi</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f6f7f9;
    font-family:
      Arial,
      Helvetica,
      sans-serif;
  "
>

  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
    "
  >
    You have been invited to ${workspaceName} on SaMi.
  </div>


  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      width:100%;
      background:#f6f7f9;
      padding:30px 12px;
    "
  >
    <tr>
      <td align="center">


        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:600px;
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-radius:16px;
            overflow:hidden;
          "
        >

          <tr>
            <td
              style="
                padding:24px 28px;
                border-bottom:1px solid #e2e8f0;
              "
            >
              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    style="
                      width:42px;
                      height:42px;
                      border-radius:11px;
                      background:#2563eb;
                      color:#ffffff;
                      font-size:17px;
                      font-weight:800;
                      text-align:center;
                      vertical-align:middle;
                    "
                  >
                    S
                  </td>

                  <td
                    style="
                      padding-left:11px;
                    "
                  >
                    <div
                      style="
                        font-size:18px;
                        line-height:22px;
                        font-weight:800;
                        color:#0f172a;
                      "
                    >
                      SaMi
                    </div>

                    <div
                      style="
                        margin-top:2px;
                        font-size:10px;
                        line-height:14px;
                        color:#64748b;
                      "
                    >
                      AI Powered Business Workspace
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>


          <tr>
            <td
              style="
                padding:30px 28px 28px;
              "
            >

              <div
                style="
                  margin-bottom:8px;
                  font-size:11px;
                  line-height:16px;
                  font-weight:800;
                  letter-spacing:.08em;
                  text-transform:uppercase;
                  color:#2563eb;
                "
              >
                Workspace invitation
              </div>


              <h1
                style="
                  margin:0;
                  font-size:24px;
                  line-height:31px;
                  letter-spacing:-.02em;
                  color:#0f172a;
                "
              >
                Join ${workspaceName}
              </h1>


              <p
                style="
                  margin:14px 0 0;
                  font-size:14px;
                  line-height:22px;
                  color:#475569;
                "
              >
                ${inviterName} invited you to join
                <strong
                  style="
                    color:#0f172a;
                  "
                >
                  ${workspaceName}
                </strong>
                on SaMi.
              </p>


              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin-top:24px;
                  border-collapse:collapse;
                "
              >

                <tr>
                  <td
                    style="
                      padding:0 0 12px;
                      font-size:13px;
                      line-height:20px;
                      color:#475569;
                    "
                  >
                    <strong
                      style="
                        color:#0f172a;
                      "
                    >
                      Access type:
                    </strong>
                    ${escapeHtml(
                      typeLabel,
                    )}
                  </td>
                </tr>

                ${roleHtml}

                ${companyHtml}

              </table>


              ${messageHtml}


              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin-top:26px;
                "
              >
                <tr>
                  <td
                    bgcolor="#2563eb"
                    style="
                      border-radius:10px;
                    "
                  >
                    <a
                      href="${safeUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display:inline-block;
                        padding:13px 22px;
                        border-radius:10px;
                        background:#2563eb;
                        color:#ffffff;
                        font-size:13px;
                        line-height:19px;
                        font-weight:800;
                        text-decoration:none;
                      "
                    >
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>


              <p
                style="
                  margin:22px 0 0;
                  font-size:11px;
                  line-height:18px;
                  color:#64748b;
                "
              >
                This invitation expires on
                <strong>
                  ${expiry}
                </strong>.
              </p>


              <p
                style="
                  margin:10px 0 0;
                  font-size:11px;
                  line-height:18px;
                  color:#94a3b8;
                "
              >
                If you were not expecting this invitation,
                you can safely ignore this email.
              </p>

            </td>
          </tr>


          <tr>
            <td
              style="
                padding:18px 28px;
                border-top:1px solid #e2e8f0;
                background:#fafbfc;
                font-size:10px;
                line-height:17px;
                color:#94a3b8;
              "
            >
              SaMi — AI Powered Business Workspace
              <br>
              © ${year} SaMi. All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
}


/* ================================================================
   SEND
   ================================================================ */

export async function sendWorkspaceInvitationEmail(
  input:
    SendWorkspaceInvitationEmailInput,
): Promise<SendWorkspaceInvitationEmailResult> {
  const invitation =
    input.invitation;


  const email =
    normalizeEmail(
      invitation.email,
    );


  if (
    !isValidEmail(
      email,
    )
  ) {
    throw new Error(
      'A valid invitation recipient email is required.',
    );
  }


  const invitationUrl =
    buildInvitationUrl(
      input.token,
    );


  if (
    !ensureEmailDeliveryAvailable()
  ) {
    return {
      success:
        false,
    };
  }


  const text =
    buildTextEmail(
      invitation,
      invitationUrl,
    );


  const html =
    buildHtmlEmail(
      invitation,
      invitationUrl,
    );


  const mailer =
    getTransporter();


  try {
    const info =
      await mailer.sendMail({
        from:
          getFromAddress(),

        to:
          email,

        replyTo:
          getReplyTo(),

        subject:
          `Invitation to ${invitation.workspaceName} — SaMi`,

        text,

        html,

        headers: {
          'X-SaMi-Email-Type':
            'workspace-invitation',

          'X-SaMi-Audience':
            'workspace',

          'X-Auto-Response-Suppress':
            'All',

          'Auto-Submitted':
            'auto-generated',
        },
      });


    /*
     * Never log:
     *
     * - recipient email
     * - invitation token
     * - invitation URL
     */
    console.log(
      '[SaMi] Workspace invitation email delivered successfully.',
      {
        messageId:
          info.messageId,
      },
    );


    return {
      success:
        true,

      messageId:
        info.messageId,
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Workspace invitation email delivery failed:',
      error,
    );


    throw new Error(
      'Workspace invitation email could not be sent.',
    );
  }
}