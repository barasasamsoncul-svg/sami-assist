import nodemailer from 'nodemailer';

type SendVerificationEmailInput = {
  email: string;
  firstName?: string | null;
  code: string;
  verifyUrl: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function getTransporter() {
  const host = requiredEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requiredEnv('SMTP_USER');
  const pass = requiredEnv('SMTP_PASSWORD');

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendVerificationEmail(
  input: SendVerificationEmailInput
): Promise<void> {
  const from =
    process.env.EMAIL_FROM ||
    `SaMi <${process.env.SMTP_USER}>`;

  const firstName = input.firstName || 'there';

  const subject = 'Verify your SaMi account';

  const text = `
Hello ${firstName},

Your SaMi verification code is:

${input.code}

This code expires in 10 minutes.

Open verification page:
${input.verifyUrl}

If you did not create a SaMi account, ignore this email.

SaMi
AI-powered business workspace
`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border:1px solid #e2e8f0;border-radius:24px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:24px">Verify your SaMi account</h1>

    <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.6">
      Hello ${firstName}, use this code to verify your SaMi account.
    </p>

    <div style="font-size:34px;font-weight:800;letter-spacing:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;text-align:center;padding:18px;margin:22px 0">
      ${input.code}
    </div>

    <p style="margin:0 0 18px;color:#64748b;font-size:14px">
      This code expires in 10 minutes.
    </p>

    <a href="${input.verifyUrl}" style="display:inline-block;background:#020617;color:white;text-decoration:none;font-weight:700;border-radius:14px;padding:13px 18px">
      Open verification page
    </a>

    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6">
      If you did not create a SaMi account, ignore this email.
    </p>
  </div>

  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">
    SaMi · AI-powered business workspace
  </p>
</div>
`;

  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to: input.email,
    subject,
    text,
    html,
  });
}