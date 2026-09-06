import nodemailer from 'nodemailer';

export interface SendPasswordResetEmailInput {
  email: string;
  firstName?: string | null;
  resetUrl: string;
}

export interface SendPasswordResetEmailResult {
  success: boolean;
  provider: 'smtp';
  error?: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getSenderEmail(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    'SaMi <no-reply@sami.local>'
  );
}

function buildTextEmail(
  firstName: string,
  resetUrl: string
): string {
  return [
    `Hello ${firstName || 'there'},`,
    '',
    'We received a request to reset your SaMi account password.',
    '',
    'Open this link to reset your password:',
    resetUrl,
    '',
    'This link expires in 30 minutes.',
    '',
    'If you did not request this, you can ignore this email.',
    '',
    'SaMi Technologies',
  ].join('\n');
}

function buildHtmlEmail(
  firstName: string,
  resetUrl: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:20px; padding:32px; border:1px solid #e2e8f0;">
        <h1 style="margin:0 0 12px; color:#020617; font-size:24px;">
          Reset your SaMi password
        </h1>

        <p style="color:#475569; line-height:1.7; font-size:15px;">
          Hello ${firstName || 'there'},
        </p>

        <p style="color:#475569; line-height:1.7; font-size:15px;">
          We received a request to reset your SaMi account password.
          Click the button below to create a new password.
        </p>

        <a href="${resetUrl}" style="display:inline-block; margin:20px 0; background:#020617; color:#ffffff; text-decoration:none; padding:14px 20px; border-radius:14px; font-weight:700;">
          Reset password
        </a>

        <p style="color:#64748b; line-height:1.7; font-size:13px;">
          This link expires in 30 minutes. If you did not request this,
          you can safely ignore this email.
        </p>

        <p style="color:#94a3b8; line-height:1.7; font-size:12px; word-break:break-all;">
          ${resetUrl}
        </p>

        <p style="margin-top:28px; color:#020617; font-weight:700;">
          SaMi Technologies
        </p>
      </div>
    </div>
  `;
}

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<SendPasswordResetEmailResult> {
  try {
    const host = getRequiredEnv('SMTP_HOST');

    const port = Number(
      process.env.SMTP_PORT || '587'
    );

    const user = getRequiredEnv('SMTP_USER');

    const pass = getRequiredEnv('SMTP_PASSWORD');

    const transporter =
      nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });

    const firstName = input.firstName || '';

    await transporter.sendMail({
      from: getSenderEmail(),
      to: input.email,
      subject: 'Reset your SaMi password',
      text: buildTextEmail(
        firstName,
        input.resetUrl
      ),
      html: buildHtmlEmail(
        firstName,
        input.resetUrl
      ),
    });

    return {
      success: true,
      provider: 'smtp',
    };
  } catch (error) {
    console.error(
      '[Password Reset Email] Failed:',
      error
    );

    return {
      success: false,
      provider: 'smtp',
      error:
        error instanceof Error
          ? error.message
          : 'Failed to send password reset email.',
    };
  }
}