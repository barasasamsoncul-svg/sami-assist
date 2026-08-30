import nodemailer from 'nodemailer';

export async function sendVerificationEmail(email: string, code: string, name: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'SaMi - Email Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 12px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c; font-size: 24px; margin: 0;">SaMi</h1>
            <p style="color: #718096; font-size: 14px; margin: 5px 0 0;">AI-powered business workspace</p>
          </div>
          
          <h2 style="color: #1a202c; margin-bottom: 20px;">Welcome to SaMi, ${name}! 👋</h2>
          
          <p style="color: #4a5568; margin-bottom: 20px; line-height: 1.6;">
            Thanks for signing up! To get started, please verify your email address by entering the code below.
          </p>
          
          <div style="background-color: #ebf8ff; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0; border: 1px solid #bee3f8;">
            <span style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #2b6cb0; font-family: monospace;">${code}</span>
          </div>
          
          <p style="color: #4a5568; font-size: 14px; margin-bottom: 10px;">
            ⏰ This code will expire in <strong>15 minutes</strong>.
          </p>
          
          <p style="color: #718096; font-size: 13px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            If you didn't create an account with SaMi, please ignore this email.
          </p>
          
          <div style="margin-top: 30px; text-align: center; color: #a0aec0; font-size: 12px;">
            <p>© ${new Date().getFullYear()} SaMi. All rights reserved.</p>
          </div>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Welcome to SaMi - Your AI-Powered Workspace',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 12px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c; font-size: 24px; margin: 0;">SaMi</h1>
            <p style="color: #718096; font-size: 14px; margin: 5px 0 0;">AI-powered business workspace</p>
          </div>
          
          <h2 style="color: #1a202c; margin-bottom: 20px;">Welcome to SaMi, ${name}! 🎉</h2>
          
          <p style="color: #4a5568; margin-bottom: 20px; line-height: 1.6;">
            Your account has been successfully verified and your workspace is ready.
          </p>
          
          <div style="background-color: #f0fff4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c6f6d5;">
            <h3 style="color: #276749; margin: 0 0 10px 0;">What's next?</h3>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Login to your SaMi workspace</li>
              <li>Configure your apps and settings</li>
              <li>Start managing your business with AI</li>
            </ul>
          </div>
          
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/auth/login" 
             style="display: inline-block; background-color: #3182ce; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 10px 0;">
            Login to SaMi →
          </a>
          
          <p style="color: #718096; font-size: 13px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            Need help? Check out our <a href="${process.env.NEXT_PUBLIC_APP_URL}/help" style="color: #3182ce;">Help Center</a>.
          </p>
          
          <div style="margin-top: 30px; text-align: center; color: #a0aec0; font-size: 12px;">
            <p>© ${new Date().getFullYear()} SaMi. All rights reserved.</p>
          </div>
        </div>
      </div>
    `,
  });
}