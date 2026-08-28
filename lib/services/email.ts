import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.EMAIL_FROM || 'SaMi <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Email exception:', error);
    return { success: false, error };
  }
}

export async function sendVerificationEmail(to: string, token: string, appUrl: string) {
  const link = `${appUrl}/auth/verify-email?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; text-align: center;">
        <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0; font-style: italic;">SaMi</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">AI-powered business workspace</p>
        <h2 style="color: #111827; font-size: 20px; margin-top: 30px;">Verify your email address</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Click the button below to verify your email and activate your account.</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">Verify Email</a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">If you didn't create an account, ignore this email.</p>
      </div>
    </div>
  `;

  return sendEmail(to, 'Verify your SaMi email', html);
}

export async function sendWelcomeEmail(to: string, fullName: string, tenantName: string, appUrl: string) {
  const dashboardLink = `${appUrl}/dashboard`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px;">
        <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0; font-style: italic;">SaMi</h1>
        <h2 style="color: #111827; font-size: 20px; margin-top: 30px;">Welcome to SaMi, ${fullName}! 🎉</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Your workspace <strong>${tenantName}</strong> is ready.</p>
        <a href="${dashboardLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">Go to Dashboard</a>
      </div>
    </div>
  `;

  return sendEmail(to, 'Welcome to SaMi!', html);
}

export async function sendPasswordResetEmail(to: string, token: string, appUrl: string) {
  const link = `${appUrl}/auth/reset-password?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; text-align: center;">
        <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0; font-style: italic;">SaMi</h1>
        <h2 style="color: #111827; font-size: 20px; margin-top: 30px;">Reset your password</h2>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour.</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">Reset Password</a>
      </div>
    </div>
  `;

  return sendEmail(to, 'Reset your SaMi password', html);
}

export async function sendTwoFactorCode(to: string, code: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; text-align: center;">
        <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0; font-style: italic;">SaMi</h1>
        <h2 style="color: #111827; font-size: 20px; margin-top: 30px;">Your verification code</h2>
        <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; margin-top: 20px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">This code expires in 10 minutes.</p>
      </div>
    </div>
  `;

  return sendEmail(to, 'Your SaMi verification code', html);
}

export async function sendInviteEmail(to: string, inviteLink: string, tenantName: string, inviterName: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 12px; padding: 40px; text-align: center;">
        <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0; font-style: italic;">SaMi</h1>
        <h2 style="color: #111827; font-size: 20px; margin-top: 30px;">You've been invited! 🎉</h2>
        <p style="color: #6b7280; font-size: 14px;">${inviterName} invited you to join <strong>${tenantName}</strong> on SaMi.</p>
        <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">Accept Invite</a>
      </div>
    </div>
  `;

  return sendEmail(to, `Invitation to join ${tenantName} on SaMi`, html);
}