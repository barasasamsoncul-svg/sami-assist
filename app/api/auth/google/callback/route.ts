import { NextRequest, NextResponse } from 'next/server';
import { queryControl, getControlPool } from '@/lib/db/control';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/auth/register?error=google', request.url));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/auth/register?error=google_config', request.url));
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL('/auth/register?error=google_token', request.url));
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await userResponse.json();

    if (!googleUser.email) {
      return NextResponse.redirect(new URL('/auth/register?error=google_email', request.url));
    }

    const email = googleUser.email.toLowerCase();
    const firstName = googleUser.given_name || '';
    const lastName = googleUser.family_name || '';
    const fullName = googleUser.name || `${firstName} ${lastName}`.trim();
    const avatarUrl = googleUser.picture || '';

    // Check if user exists
    const existingUser = await queryControl(
      `SELECT id, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      // User exists - check if email verified
      if (existingUser.rows[0].email_verified_at) {
        // Email verified - create session and redirect to dashboard
        // For now, redirect to login with success
        return NextResponse.redirect(new URL('/auth/login?google=true', request.url));
      } else {
        // Update email_verified
        await queryControl(
          `UPDATE users SET email_verified_at = NOW(), status = 'active', updated_at = NOW() WHERE id = $1`,
          [existingUser.rows[0].id]
        );
        return NextResponse.redirect(new URL('/auth/login?google=true', request.url));
      }
    }

    // New user - save Google data and redirect to google-complete
    const tempId = crypto.randomBytes(16).toString('hex');

    // Store temporarily (in production use a proper flow)
    const googleData = {
      tempId,
      email,
      firstName,
      lastName,
      fullName,
      avatarUrl,
      emailVerified: true,
    };

    // Save to sessionStorage via redirect URL params (temporary)
    const redirectUrl = new URL('/auth/google-complete', request.url);
    redirectUrl.searchParams.set('tempId', tempId);
    redirectUrl.searchParams.set('email', email);
    redirectUrl.searchParams.set('firstName', firstName);
    redirectUrl.searchParams.set('lastName', lastName);
    redirectUrl.searchParams.set('avatar', avatarUrl);

    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Google callback error:', error);
    return NextResponse.redirect(new URL('/auth/register?error=google_failed', request.url));
  }
}