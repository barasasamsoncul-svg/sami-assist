import {
  getSession,
} from '@/lib/auth/session';

import {
  prepareInvitationAcceptance,
  InvitationServiceError,
} from '@/lib/services/invitations';

import InvitationAcceptClient from './InvitationAcceptClient';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


type Props = {
  params:
    Promise<{
      token:
        string;
    }>;
};


type InvitationPageState =
  | {
      available: true;
      preparation:
        Awaited<
          ReturnType<
            typeof prepareInvitationAcceptance
          >
        >;
      session:
        Awaited<
          ReturnType<
            typeof getSession
          >
        >;
    }
  | {
      available: false;
      message: string;
    };


async function loadInvitationPageState(
  token: string,
): Promise<InvitationPageState> {
  try {
    const [
      preparation,
      session,
    ] =
      await Promise.all([
        prepareInvitationAcceptance(
          token,
        ),

        getSession(),
      ]);

    return {
      available: true,
      preparation,
      session,
    };
  } catch (
    error
  ) {
    let message =
      'This invitation is invalid or no longer available.';

    if (
      error instanceof
        InvitationServiceError
    ) {
      message =
        error.message;
    }

    return {
      available: false,
      message,
    };
  }
}


/* ================================================================
   INVITATION PAGE
   ================================================================ */

export default async function InvitationPage({
  params,
}: Props) {
  const {
    token,
  } =
    await params;

  const state =
    await loadInvitationPageState(
      token,
    );

  if (
    !state.available
  ) {
    return (
      <InvitationAcceptClient
        token=""
        invitation={
          null
        }
        accountExists={
          false
        }
        accountEmailVerified={
          false
        }
        signedInUser={
          null
        }
        signedInEmailMatches={
          false
        }
        unavailableMessage={
          state.message
        }
      />
    );
  }

  const {
    preparation,
    session,
  } =
    state;

  const invitation =
    preparation.invitation;

  const signedInUser =
    session
      ? {
          id:
            session.user.id,

          email:
            session.user.email,

          fullName:
            session.user.fullName,
        }
      : null;

  const signedInEmailMatches =
    Boolean(
      signedInUser &&
      signedInUser.email
        .trim()
        .toLowerCase() ===
      invitation.email
        .trim()
        .toLowerCase(),
    );

  return (
    <InvitationAcceptClient
      token={
        token
      }

      invitation={{
        email:
          invitation.email,

        workspaceName:
          invitation.workspaceName,

        memberType:
          invitation.memberType,

        message:
          invitation.message,

        expiresAt:
          invitation.expiresAt,

        inviterName:
          invitation.invitedBy
            .fullName ||
          'Workspace administrator',

        roles:
          invitation.roles
            .filter(
              role =>
                role.available,
            )
            .map(
              role => ({
                id:
                  role.id,

                name:
                  role.name,
              }),
            ),

        companies:
          invitation.companies
            .filter(
              company =>
                company.available,
            )
            .map(
              company => ({
                id:
                  company.id,

                name:
                  company.name,

                isDefault:
                  company.isDefault,
              }),
            ),
      }}

      accountExists={
        preparation
          .accountExists
      }

      accountEmailVerified={
        preparation
          .accountEmailVerified
      }

      signedInUser={
        signedInUser
      }

      signedInEmailMatches={
        signedInEmailMatches
      }
    />
  );
}
