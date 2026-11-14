
import { apiRequest } from "@/api";

import type {
  RunnerAuthenticatedAccount,
  RunnerNextStep,
  RunnerOnboardingStatus,
} from "@/api";

export type RunnerAuthenticatedSession = {
  ok: true;
  flow: "authenticated";
  sessionToken: string;
  expiresInDays: number;
  profileComplete: boolean;
  onboardingStatus: RunnerOnboardingStatus;
  nextStep: RunnerNextStep;
  runner: RunnerAuthenticatedAccount;
};

export type RunnerCustomerConfirmationRequired = {
  ok: true;
  flow: "confirm_registration";
  confirmationToken: string;
  customerMatch: {
    fullName: string;
    matchedBy: "email" | "phone";
  };
  message: string;
};

export type RunnerOtpFlowResult =
  | RunnerAuthenticatedSession
  | RunnerCustomerConfirmationRequired;

type BackendSessionResponse = {
  ok: true;
  sessionToken: string;
  expiresInDays: number;
  profileComplete: boolean;
  onboardingStatus: RunnerOnboardingStatus;
  nextStep: RunnerNextStep;
  runner: RunnerAuthenticatedAccount;
};

type BackendCustomerConfirmationResponse = {
  ok: true;
  nextAction: "confirm_registration";
  confirmationToken: string;
  customerMatch: {
    fullName: string;
    matchedBy: "email" | "phone";
  };
  message: string;
};

type BackendOtpResponse =
  | BackendSessionResponse
  | BackendCustomerConfirmationResponse;

function requireCode(
  challengeId: string,
  code: string,
): void {
  if (!challengeId.trim()) {
    throw new Error(
      "Your verification request is missing. Request a new code.",
    );
  }

  if (!/^[0-9]{6}$/.test(code.trim())) {
    throw new Error(
      "Enter the complete six-digit verification code.",
    );
  }
}

function normalizeOtpResponse(
  response: BackendOtpResponse,
): RunnerOtpFlowResult {
  if (
    response?.ok === true &&
    "sessionToken" in response &&
    typeof response.sessionToken === "string" &&
    response.sessionToken.length >= 40 &&
    response.runner?.id
  ) {
    return {
      ...response,
      flow: "authenticated",
    };
  }

  if (
    response?.ok === true &&
    "nextAction" in response &&
    response.nextAction === "confirm_registration" &&
    typeof response.confirmationToken === "string" &&
    response.confirmationToken.length >= 32 &&
    typeof response.customerMatch?.fullName === "string" &&
    response.customerMatch.fullName.trim().length > 0 &&
    (
      response.customerMatch.matchedBy === "email" ||
      response.customerMatch.matchedBy === "phone"
    )
  ) {
    return {
      ok: true,
      flow: "confirm_registration",
      confirmationToken: response.confirmationToken,
      customerMatch: {
        fullName: response.customerMatch.fullName.trim(),
        matchedBy: response.customerMatch.matchedBy,
      },
      message: response.message,
    };
  }

  throw new Error(
    "The verification server returned an incomplete response. Request a new code and try again.",
  );
}

function normalizeSessionResponse(
  response: BackendSessionResponse,
): RunnerAuthenticatedSession {
  if (
    response?.ok !== true ||
    typeof response.sessionToken !== "string" ||
    response.sessionToken.length < 40 ||
    !response.runner?.id
  ) {
    throw new Error(
      "The server did not return a complete Runner session. Please try again.",
    );
  }

  return {
    ...response,
    flow: "authenticated",
  };
}

/**
 * Verify the single email OTP used for Runner login or registration.
 *
 * Registration may return:
 * - An authenticated session for ordinary registration.
 * - A consent confirmation when an optional Customer match exists.
 */
export async function verifyRunnerEmailOtp(
  challengeId: string,
  code: string,
): Promise<RunnerOtpFlowResult> {
  requireCode(challengeId, code);

  const response = await apiRequest<BackendOtpResponse>(
    "/api/runner/auth/verify-otp",
    {
      method: "POST",
      body: {
        challengeId: challengeId.trim(),
        code: code.trim(),
      },
    },
  );

  return normalizeOtpResponse(response);
}

/**
 * Create a separate Runner account after explicit user consent.
 *
 * The Customer database is not modified by this operation.
 */
export async function confirmRunnerRegistration(
  confirmationToken: string,
): Promise<RunnerAuthenticatedSession> {
  if (
    !confirmationToken ||
    confirmationToken.trim().length < 32
  ) {
    throw new Error(
      "Your registration confirmation has expired. Start again.",
    );
  }

  const response = await apiRequest<BackendSessionResponse>(
    "/api/runner/auth/confirm-registration",
    {
      method: "POST",
      body: {
        confirmationToken: confirmationToken.trim(),
      },
    },
  );

  return normalizeSessionResponse(response);
}

/**
 * Cancel a pending Runner registration when the user declines.
 */
export async function cancelRunnerRegistration(
  confirmationToken: string,
): Promise<void> {
  if (
    !confirmationToken ||
    confirmationToken.trim().length < 32
  ) {
    return;
  }

  const response = await apiRequest<{ ok: boolean }>(
    "/api/runner/auth/cancel-registration",
    {
      method: "POST",
      body: {
        confirmationToken: confirmationToken.trim(),
      },
    },
  );

  if (response?.ok !== true) {
    throw new Error(
      "The pending Runner registration could not be cancelled.",
    );
  }
}
