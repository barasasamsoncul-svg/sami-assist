import crypto from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  hashPassword,
} from '@/lib/auth/password';

import {
  createRegistrationDraft,
  clearRegistrationDraftCookieOptions,
  registrationDraftCookieOptions,
  REGISTRATION_DRAFT_COOKIE_NAME,
} from '@/lib/auth/registration-draft';

import {
  queryControl,
} from '@/lib/db/control';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


const GOOGLE_SIGNUP_COOKIE =
  'sami_google_signup_state';

const MAX_NAME_LENGTH =
  120;

const MAX_EMAIL_LENGTH =
  254;

const MAX_PASSWORD_LENGTH =
  128;

const MAX_PHONE_LENGTH =
  40;


function normalizeEmail(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
        .slice(
          0,
          MAX_EMAIL_LENGTH,
        )
    : '';
}


function normalizeName(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .replace(
          /\s+/g,
          ' ',
        )
        .slice(
          0,
          MAX_NAME_LENGTH,
        )
    : '';
}


function normalizePhone(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const phone =
    value
      .trim()
      .slice(
        0,
        MAX_PHONE_LENGTH,
      );

  return phone ||
    null;
}


function validEmail(
  value:
    string,
) {
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


function json(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
      },
    },
  );
}


function error(
  status:
    number,
  code:
    string,
  message:
    string,
  extra:
    Record<
      string,
      unknown
    > = {},
) {
  return json(
    {
      success:
        false,
      code,
      error:
        message,
      ...extra,
    },
    status,
  );
}


function hashOpaqueToken(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}


async function loadGoogleSignupState(
  request:
    NextRequest,
) {
  const raw =
    request.cookies
      .get(
        GOOGLE_SIGNUP_COOKIE,
      )
      ?.value;

  if (
    !raw
  ) {
    return null;
  }

  const stateHash =
    hashOpaqueToken(
      raw,
    );

  const result =
    await queryControl(
      `
        SELECT
          state_hash,
          email,
          first_name,
          last_name,
          expires_at
        FROM google_signup_states
        WHERE state_hash = $1
          AND expires_at >
              NOW()
        LIMIT 1
      `,
      [
        stateHash,
      ],
    );

  return result.rows[0] ||
    null;
}


async function loadUserByEmail(
  email:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          first_name,
          last_name,
          phone,
          status,
          email_verified,
          email_verified_at,
          deleted_at
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [
        email,
      ],
    );

  return result.rows[0] ||
    null;
}


function safeDraftSummary(
  input: {
    mode:
      'email' |
      'google' |
      'existing';

    email:
      string;

    firstName:
      string;

    lastName:
      string;

    businessName:
      string;
  },
) {
  return {
    mode:
      input.mode,

    email:
      input.email,

    firstName:
      input.firstName,

    lastName:
      input.lastName,

    businessName:
      input.businessName,

    existingAccount:
      input.mode ===
      'existing',
  };
}


export async function POST(
  request:
    NextRequest,
) {
  try {
    let body:
      Record<
        string,
        unknown
      >;

    try {
      const parsed =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed,
        )
      ) {
        return error(
          400,
          'INVALID_REQUEST',
          'Invalid registration draft request.',
        );
      }

      body =
        parsed as
          Record<
            string,
            unknown
          >;
    } catch {
      return error(
        400,
        'INVALID_REQUEST',
        'Invalid registration draft request.',
      );
    }

    const source =
      typeof body.source ===
        'string'
        ? body.source
            .trim()
            .toLowerCase()
        : 'email';

    const businessName =
      normalizeName(
        body.businessName,
      );

    if (
      businessName.length <
        2
    ) {
      return error(
        400,
        'INVALID_BUSINESS_NAME',
        'Business name must contain at least 2 characters.',
      );
    }

    const session =
      await getSession();

    if (
      source ===
        'existing'
    ) {
      if (
        !session
      ) {
        return error(
          401,
          'AUTHENTICATION_REQUIRED',
          'Sign in before creating another SaMi workspace.',
          {
            next:
              '/workspaces/new',
          },
        );
      }

      const user =
        await loadUserByEmail(
          normalizeEmail(
            session.user
              .email,
          ),
        );

      if (
        !user ||
        String(
          user.id,
        ) !==
          session.user.id ||
        user.deleted_at ||
        String(
          user.status ||
          '',
        )
          .trim()
          .toLowerCase() !==
          'active' ||
        (
          user.email_verified !==
            true &&
          !user
            .email_verified_at
        )
      ) {
        return error(
          409,
          'ACCOUNT_UNAVAILABLE',
          'The signed-in SaMi account is not available for creating another workspace.',
        );
      }

      const draft =
        createRegistrationDraft({
          mode:
            'existing',

          email:
            normalizeEmail(
              user.email,
            ),

          firstName:
            normalizeName(
              user.first_name ||
              session.user
                .firstName,
            ),

          lastName:
            normalizeName(
              user.last_name ||
              session.user
                .lastName,
            ),

          phone:
            normalizePhone(
              user.phone,
            ),

          businessName,

          passwordHash:
            null,

          userId:
            String(
              user.id,
            ),

          googleStateHash:
            null,
        });

      const response =
        json({
          success:
            true,
          code:
            'WORKSPACE_DRAFT_CREATED',
          draft:
            safeDraftSummary({
              mode:
                'existing',
              email:
                normalizeEmail(
                  user.email,
                ),
              firstName:
                normalizeName(
                  user.first_name ||
                  session.user
                    .firstName,
                ),
              lastName:
                normalizeName(
                  user.last_name ||
                  session.user
                    .lastName,
                ),
              businessName,
            }),
        });

      response.cookies.set(
        REGISTRATION_DRAFT_COOKIE_NAME,
        draft,
        registrationDraftCookieOptions(),
      );

      return response;
    }

    if (
      source ===
        'google'
    ) {
      const google =
        await loadGoogleSignupState(
          request,
        );

      if (
        !google
      ) {
        return error(
          409,
          'GOOGLE_SIGNUP_EXPIRED',
          'Your Google registration has expired. Please start again.',
        );
      }

      const email =
        normalizeEmail(
          google.email,
        );

      if (
        !validEmail(
          email,
        )
      ) {
        return error(
          409,
          'GOOGLE_SIGNUP_INVALID',
          'SaMi could not verify the Google email for this registration.',
        );
      }

      const existing =
        await loadUserByEmail(
          email,
        );

      if (
        existing
      ) {
        return error(
          409,
          'ACCOUNT_SIGN_IN_REQUIRED',
          'A SaMi account already exists for this Google email. Sign in to create another workspace.',
          {
            next:
              '/workspaces/new',
          },
        );
      }

      const draft =
        createRegistrationDraft({
          mode:
            'google',

          email,

          firstName:
            normalizeName(
              google.first_name,
            ),

          lastName:
            normalizeName(
              google.last_name,
            ),

          phone:
            normalizePhone(
              body.phone,
            ),

          businessName,

          passwordHash:
            null,

          userId:
            null,

          googleStateHash:
            String(
              google.state_hash,
            ),
        });

      const response =
        json({
          success:
            true,
          code:
            'GOOGLE_REGISTRATION_DRAFT_CREATED',
          draft:
            safeDraftSummary({
              mode:
                'google',
              email,
              firstName:
                normalizeName(
                  google.first_name,
                ),
              lastName:
                normalizeName(
                  google.last_name,
                ),
              businessName,
            }),
        });

      response.cookies.set(
        REGISTRATION_DRAFT_COOKIE_NAME,
        draft,
        registrationDraftCookieOptions(),
      );

      return response;
    }

    if (
      source !==
        'email'
    ) {
      return error(
        400,
        'INVALID_REGISTRATION_SOURCE',
        'Choose a supported SaMi registration method.',
      );
    }

    const firstName =
      normalizeName(
        body.firstName,
      );

    const lastName =
      normalizeName(
        body.lastName,
      );

    const email =
      normalizeEmail(
        body.email,
      );

    const phone =
      normalizePhone(
        body.phone,
      );

    const password =
      typeof body.password ===
        'string'
        ? body.password
        : '';

    if (
      !firstName ||
      !lastName ||
      !validEmail(
        email,
      )
    ) {
      return error(
        400,
        'REGISTRATION_IDENTITY_INVALID',
        'First name, last name and a valid email are required.',
      );
    }

    if (
      password.length <
        8 ||
      password.length >
        MAX_PASSWORD_LENGTH
    ) {
      return error(
        400,
        'PASSWORD_WEAK',
        'Password must be between 8 and 128 characters.',
      );
    }

    const existing =
      await loadUserByEmail(
        email,
      );

    if (
      existing
    ) {
      if (
        existing.deleted_at
      ) {
        return error(
          409,
          'ACCOUNT_PREVIOUSLY_DELETED',
          'An account previously associated with this email exists. Please contact SaMi support.',
        );
      }

      if (
        !existing
          .email_verified_at &&
        existing
          .email_verified !==
          true
      ) {
        return error(
          409,
          'EMAIL_VERIFICATION_REQUIRED',
          'An account with this email already exists and is awaiting email verification.',
        );
      }

      if (
        session &&
        session.user.id ===
          String(
            existing.id,
          )
      ) {
        const draft =
          createRegistrationDraft({
            mode:
              'existing',

            email:
              normalizeEmail(
                existing.email,
              ),

            firstName:
              normalizeName(
                existing.first_name ||
                session.user
                  .firstName,
              ),

            lastName:
              normalizeName(
                existing.last_name ||
                session.user
                  .lastName,
              ),

            phone:
              normalizePhone(
                existing.phone,
              ),

            businessName,

            passwordHash:
              null,

            userId:
              String(
                existing.id,
              ),

            googleStateHash:
              null,
          });

        const response =
          json({
            success:
              true,
            code:
              'EXISTING_ACCOUNT_WORKSPACE_DRAFT_CREATED',
            draft:
              safeDraftSummary({
                mode:
                  'existing',
                email:
                  normalizeEmail(
                    existing.email,
                  ),
                firstName:
                  normalizeName(
                    existing.first_name ||
                    session.user
                      .firstName,
                  ),
                lastName:
                  normalizeName(
                    existing.last_name ||
                    session.user
                      .lastName,
                  ),
                businessName,
              }),
          });

        response.cookies.set(
          REGISTRATION_DRAFT_COOKIE_NAME,
          draft,
          registrationDraftCookieOptions(),
        );

        return response;
      }

      return error(
        409,
        'ACCOUNT_SIGN_IN_REQUIRED',
        'This email already has a SaMi account. Sign in with it to create another workspace or accept workspace invitations.',
        {
          next:
            '/workspaces/new',
        },
      );
    }

    if (
      session
    ) {
      return error(
        409,
        'AUTHENTICATED_ACCOUNT_MISMATCH',
        'You are already signed in. Create the new workspace under your current SaMi account, or sign out before creating a different account.',
        {
          next:
            '/workspaces/new',
        },
      );
    }

    const passwordHash =
      await hashPassword(
        password,
      );

    const draft =
      createRegistrationDraft({
        mode:
          'email',

        email,

        firstName,

        lastName,

        phone,

        businessName,

        passwordHash,

        userId:
          null,

        googleStateHash:
          null,
      });

    const response =
      json({
        success:
          true,
        code:
          'REGISTRATION_DRAFT_CREATED',
        draft:
          safeDraftSummary({
            mode:
              'email',
            email,
            firstName,
            lastName,
            businessName,
          }),
      });

    response.cookies.set(
      REGISTRATION_DRAFT_COOKIE_NAME,
      draft,
      registrationDraftCookieOptions(),
    );

    return response;
  } catch (
    errorValue
  ) {
    console.error(
      '[SaMi Registration] Draft creation failed:',
      errorValue,
    );

    return error(
      500,
      'REGISTRATION_DRAFT_ERROR',
      'SaMi could not prepare this registration securely. Please try again.',
    );
  }
}


export async function DELETE() {
  const response =
    json({
      success:
        true,
    });

  response.cookies.set(
    REGISTRATION_DRAFT_COOKIE_NAME,
    '',
    clearRegistrationDraftCookieOptions(),
  );

  return response;
}
