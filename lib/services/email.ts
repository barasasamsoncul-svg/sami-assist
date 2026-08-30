import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const FROM_EMAIL = process.env.EMAIL_FROM || 'SaMi <no-reply@sami.tech>';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
      console.error('Email not configured');
      return { success: false, error: 'Email not configured' };
    }

    const mailer = getTransporter();
    const info = await mailer.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    return { success: true, data: info };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}

function brandedTemplate(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7fb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f5f7fb; padding: 30px 0;">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
            <tr><td style="background: #ffffff; border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
              <span style="font-size: 32px; font-weight: 900; font-style: italic; letter-spacing: -1px;">
                <span style="color: #1e40af;">Sa</span><span style="color: #111827;">Mi</span>
              </span>
              <p style="margin: 8px 0 0; color: #6b7280; font-size: 13px;">AI-powered business workspace</p>
            </td></tr>
            <tr><td style="background: #ffffff; padding: 0 40px 40px; text-align: center;">${content}</td></tr>
            <tr><td style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 30px 40px; text-align: center; border-top: 1px solid #f0f0f0;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">© ${new Date().getFullYear()} SaMi Technologies. All rights reserved.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendVerificationEmail(to: string, token: string, appUrl: string) {
  const link = `${appUrl}/auth/verify-email?token=${token}`;
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">Verify your email address</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;">Click below to verify your email and activate your account.</p>
    <a href="${link}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">Verify Email</a>
  `;
  return sendEmail(to, 'Verify your SaMi email', brandedTemplate('Verify Email', content));
}

export async function sendWelcomeEmail(to: string, fullName: string, tenantName: string, appUrl: string) {
  const dashboardLink = `${appUrl}/dashboard`;
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">Welcome to SaMi, ${fullName}! 🎉</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;">Your workspace <strong>${tenantName}</strong> is ready.</p>
    <a href="${dashboardLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">Go to Dashboard</a>
  `;
  return sendEmail(to, 'Welcome to SaMi!', brandedTemplate('Welcome', content));
}

export async function sendPasswordResetEmail(to: string, token: string, appUrl: string) {
  const link = `${appUrl}/auth/reset-password?token=${token}`;
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">Reset your password</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;">Click below to reset your password. Link expires in 1 hour.</p>
    <a href="${link}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">Reset Password</a>
  `;
  return sendEmail(to, 'Reset your SaMi password', brandedTemplate('Reset Password', content));
}

export async function sendTwoFactorCode(to: string, code: string) {
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">Your verification code</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;">Use this code to complete your login:</p>
    <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; margin: 16px 0;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #111827;">${code}</span>
    </div>
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">This code expires in 10 minutes.</p>
  `;
  return sendEmail(to, 'Your SaMi verification code', brandedTemplate('Verification Code', content));
}

export async function sendEmailChangeCode(to: string, code: string) {
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">Your email change code</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;">Enter this code to verify your new email:</p>
    <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; margin: 16px 0;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #111827;">${code}</span>
    </div>
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">This code expires in 10 minutes.</p>
  `;
  return sendEmail(to, 'Your SaMi email change code', brandedTemplate('Email Change', content));
}

export async function sendInviteEmail(to: string, inviteLink: string, tenantName: string, inviterName: string) {
  const content = `
    <h2 style="margin: 0; color: #111827; font-size: 22px; font-weight: 700;">You've been invited! 🎉</h2>
    <p style="margin: 16px 0; color: #6b7280; font-size: 14px;"><strong>${inviterName}</strong> invited you to join <strong>${tenantName}</strong>.</p>
    <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 8px;">Accept Invite</a>
  `;
  return sendEmail(to, `Invitation to join ${tenantName}`, brandedTemplate('Invitation', content));
}