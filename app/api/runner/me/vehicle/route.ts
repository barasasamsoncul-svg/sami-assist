
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { query } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerAccountRow = {
  account_status: string;
  verification_status: string;
  service_area: string | null;
};

type VehicleRow = {
  id: string;
  vehicle_type: string;
  vehicle_model: string | null;
  vehicle_registration: string | null;
  status: string;
  is_active: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChangeRequestRow = {
  id: string;
  vehicle_id: string | null;
  vehicle_type: string;
  vehicle_model: string | null;
  vehicle_registration: string | null;
  status: string;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type VehicleDocumentRow = {
  id: string;
  vehicle_id: string | null;
  vehicle_change_request_id: string | null;
  document_type: string;
  requirement_key: string | null;
  review_status: string;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  valid_until: string | null;
};

type RequirementRow = {
  requirement_key: string;
  category_key: string | null;
  vehicle_type: string;
  document_type: string;
  title: string;
  instructions: string;
  is_required: boolean;
  requires_expiry: boolean;
  display_order: number;
};

type ActiveJobRow = {
  status: string;
};

type ReactivationResult = {
  canReactivate: boolean;
  blockReason: string | null;
};

function response(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
    },
  });
}

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isCurrentExpiryDate(
  value: string | null,
): boolean {
  return Boolean(
    value && value >= todayInNairobi(),
  );
}

function normalizeVehicleType(value: string) {
  switch (value.trim().toLowerCase()) {
    case "bicycle":
    case "bike":
      return "bike";

    case "motorcycle":
    case "motorbike":
      return "motorbike";

    case "car":
    case "van":
    case "other":
    case "vehicle":
      return "vehicle";

    default:
      return value;
  }
}

function vehicleLabel(value: string): string {
  switch (value) {
    case "bicycle":
      return "Bicycle";

    case "motorcycle":
      return "Motorbike";

    case "car":
      return "Vehicle";

    case "van":
      return "Van";

    case "other":
      return "Other vehicle";

    default:
      return value;
  }
}

function shapeDocument(document: VehicleDocumentRow) {
  return {
    id: document.id,
    vehicleId: document.vehicle_id,
    documentType: document.document_type,
    requirementKey: document.requirement_key,
    reviewStatus: document.review_status,
    rejectionReason: document.rejection_reason,
    submittedAt: document.submitted_at,
    reviewedAt: document.reviewed_at,
    validUntil: document.valid_until,
  };
}

function shapeRequirement(requirement: RequirementRow) {
  return {
    key: requirement.requirement_key,
    categoryKey: requirement.category_key,
    vehicleType: normalizeVehicleType(
      requirement.vehicle_type,
    ),
    storedVehicleType: requirement.vehicle_type,
    documentType: requirement.document_type,
    title: requirement.title,
    instructions: requirement.instructions,
    required: requirement.is_required,
    requiresExpiry: requirement.requires_expiry,
    displayOrder: requirement.display_order,
  };
}

function getReactivationEligibility(
  vehicle: VehicleRow,
  requirements: RequirementRow[],
  documents: VehicleDocumentRow[],
  hasActiveErrand: boolean,
): ReactivationResult {
  // Only previously approved, inactive vehicles can be reactivated.
  if (
    vehicle.status !== "inactive" ||
    vehicle.is_active
  ) {
    return {
      canReactivate: false,
      blockReason: null,
    };
  }

  // Never switch transport while an errand is active.
  if (hasActiveErrand) {
    return {
      canReactivate: false,
      blockReason:
        "Complete your current errand before reactivating another vehicle.",
    };
  }

  // Only the currently supported SaMi Runner vehicle types
  // can use the reactivation workflow.
  if (
    !["bicycle", "motorcycle", "car"].includes(
      vehicle.vehicle_type,
    )
  ) {
    return {
      canReactivate: false,
      blockReason:
        "This vehicle type is not currently supported for reactivation. Contact SaMi Support.",
    };
  }

  const requiredRequirements = requirements.filter(
    (requirement) => requirement.is_required,
  );

  // Do not allow a motorised vehicle to bypass an unconfigured
  // mandatory document checklist.
  if (
    vehicle.vehicle_type !== "bicycle" &&
    requiredRequirements.length === 0
  ) {
    return {
      canReactivate: false,
      blockReason:
        "The mandatory documents for this vehicle could not be verified. Contact SaMi Support.",
    };
  }

  // Documents are already sorted newest first. Only the latest
  // submitted version of each requirement is considered.
  const latestDocumentByRequirement =
    new Map<string, VehicleDocumentRow>();

  for (const document of documents) {
    if (
      !document.requirement_key ||
      latestDocumentByRequirement.has(
        document.requirement_key,
      )
    ) {
      continue;
    }

    latestDocumentByRequirement.set(
      document.requirement_key,
      document,
    );
  }

  for (const requirement of requiredRequirements) {
    const document = latestDocumentByRequirement.get(
      requirement.requirement_key,
    );

    if (!document) {
      return {
        canReactivate: false,
        blockReason:
          `The required ${requirement.title} is missing for this vehicle.`,
      };
    }

    if (document.review_status !== "approved") {
      return {
        canReactivate: false,
        blockReason:
          `Your ${requirement.title} must be approved by Operations before this vehicle can be reactivated.`,
      };
    }

    if (
      requirement.requires_expiry &&
      !isCurrentExpiryDate(document.valid_until)
    ) {
      return {
        canReactivate: false,
        blockReason:
          `Your ${requirement.title} has expired or has no recorded expiry date. Submit a current document for review.`,
      };
    }
  }

  return {
    canReactivate: true,
    blockReason: null,
  };
}

function shapeVehicle(
  vehicle: VehicleRow,
  documents: VehicleDocumentRow[],
  requirements: RequirementRow[],
  hasActiveErrand: boolean,
) {
  const eligibility = getReactivationEligibility(
    vehicle,
    requirements,
    documents,
    hasActiveErrand,
  );

  return {
    id: vehicle.id,
    vehicleType: normalizeVehicleType(vehicle.vehicle_type),
    storedVehicleType: vehicle.vehicle_type,
    vehicleLabel: vehicleLabel(vehicle.vehicle_type),
    vehicleModel: vehicle.vehicle_model,
    vehicleRegistration: vehicle.vehicle_registration,
    status: vehicle.status,
    isActive: vehicle.is_active,
    approvedAt: vehicle.approved_at,
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,

    documents: documents.map(shapeDocument),

    canReactivate: eligibility.canReactivate,
    reactivationBlockReason: eligibility.blockReason,
  };
}

/**
 * GET /api/runner/me/vehicle
 *
 * Returns:
 * - The currently active vehicle.
 * - All saved vehicle records and their documents.
 * - Document review and expiry information.
 * - Recent replacement requests and their document reviews.
 * - Requirements for replacement vehicles.
 * - Replacement and reactivation eligibility.
 *
 * This endpoint is read-only. It does not modify availability,
 * vehicle activation, Runner profile or document review states.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request);

    if (auth.response) {
      return auth.response;
    }

    // Check the account's actual approval state.
    const accountResult = await query<RunnerAccountRow>(
      `SELECT
         a.account_status,
         a.verification_status,
         p.service_area
       FROM public.runner_accounts AS a
       LEFT JOIN public.runner_profiles AS p
         ON p.runner_id = a.id
       WHERE a.id = $1
       LIMIT 1`,
      [auth.runner.id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      return errorResponse(
        "Runner account not found.",
        404,
      );
    }

    if (
      account.account_status !== "active" ||
      account.verification_status !== "approved"
    ) {
      return errorResponse(
        "Vehicle management is available after your Runner account has been approved.",
        403,
      );
    }

    // Read the Runner's permitted work categories.
    const categoryResult = await query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1
       ORDER BY category_key`,
      [auth.runner.id],
    );

    const categoryKeys = categoryResult.rows.map(
      (item) => item.category_key,
    );

    // Read every saved vehicle, with the active one first.
    const vehiclesResult = await query<VehicleRow>(
      `SELECT
         id,
         vehicle_type,
         vehicle_model,
         vehicle_registration,
         status,
         is_active,
         approved_at,
         created_at,
         updated_at
       FROM public.runner_vehicles
       WHERE runner_id = $1
       ORDER BY
         is_active DESC,
         created_at DESC`,
      [auth.runner.id],
    );

    const vehicleRows = vehiclesResult.rows;

    const vehicleIds = vehicleRows.map(
      (vehicle) => vehicle.id,
    );

    // Read every document attached to a saved vehicle.
    // This includes onboarding documents migrated to the
    // active vehicle and replacement documents.
    // R2 storage keys are deliberately excluded.
    let vehicleDocuments: VehicleDocumentRow[] = [];

    if (vehicleIds.length > 0) {
      const vehicleDocumentsResult =
        await query<VehicleDocumentRow>(
          `SELECT
             id,
             vehicle_id,
             vehicle_change_request_id,
             document_type,
             requirement_key,
             review_status,
             rejection_reason,
             submitted_at,
             reviewed_at,
             valid_until
           FROM public.runner_verification_documents
           WHERE runner_id = $1
             AND vehicle_id = ANY($2::uuid[])
           ORDER BY
             submitted_at DESC NULLS LAST,
             id DESC`,
          [
            auth.runner.id,
            vehicleIds,
          ],
        );

      vehicleDocuments = vehicleDocumentsResult.rows;
    }

    const documentsByVehicle = new Map<
      string,
      VehicleDocumentRow[]
    >();

    for (const document of vehicleDocuments) {
      if (!document.vehicle_id) {
        continue;
      }

      const existing =
        documentsByVehicle.get(document.vehicle_id) ?? [];

      existing.push(document);

      documentsByVehicle.set(
        document.vehicle_id,
        existing,
      );
    }

    // Read the configured document requirements for the vehicle
    // types available in SaMi Runner.
    const requirementsResult =
      await query<RequirementRow>(
        `SELECT
           requirement_key,
           category_key,
           vehicle_type,
           document_type,
           title,
           instructions,
           is_required,
           requires_expiry,
           display_order
         FROM public.runner_onboarding_document_requirements
         WHERE is_active = true
           AND vehicle_type IN (
             'bicycle',
             'motorcycle',
             'car'
           )
           AND (
             category_key IS NULL
             OR category_key = ANY($1::text[])
           )
         ORDER BY
           vehicle_type,
           category_key NULLS FIRST,
           display_order,
           requirement_key`,
        [categoryKeys],
      );

    const requirementRows = requirementsResult.rows;

    const requirementsByVehicleType = new Map<
      string,
      RequirementRow[]
    >();

    for (const requirement of requirementRows) {
      const existing =
        requirementsByVehicleType.get(
          requirement.vehicle_type,
        ) ?? [];

      existing.push(requirement);

      requirementsByVehicleType.set(
        requirement.vehicle_type,
        existing,
      );
    }

    // A Runner cannot change vehicles in the middle of an errand.
    const activeJobResult = await query<ActiveJobRow>(
      `SELECT status
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN (
           'accepted',
           'in_progress',
           'completion_submitted'
         )
       ORDER BY accepted_at DESC
       LIMIT 1`,
      [auth.runner.id],
    );

    const activeJob = activeJobResult.rows[0] ?? null;
    const hasActiveErrand = activeJob !== null;

    // Shape vehicles only after checking active errand state,
    // so reactivation eligibility is consistent for all vehicles.
    const savedVehicles = vehicleRows.map((vehicle) =>
      shapeVehicle(
        vehicle,
        documentsByVehicle.get(vehicle.id) ?? [],
        requirementsByVehicleType.get(
          vehicle.vehicle_type,
        ) ?? [],
        hasActiveErrand,
      ),
    );

    const activeVehicles = savedVehicles.filter(
      (vehicle) =>
        vehicle.isActive &&
        vehicle.status === "approved",
    );

    if (activeVehicles.length > 1) {
      console.error(
        "[SaMi Runner vehicles] Multiple active vehicles detected.",
        { runnerId: auth.runner.id },
      );

      return errorResponse(
        "Your active vehicle information could not be verified. Contact SaMi Support.",
        503,
      );
    }

    const activeVehicle = activeVehicles[0] ?? null;

    // Read recent replacement requests. This includes rejected and
    // approved history, not just requests that are still open.
    const requestsResult =
      await query<ChangeRequestRow>(
        `SELECT
           id,
           vehicle_id,
           vehicle_type,
           vehicle_model,
           vehicle_registration,
           status,
           review_reason,
           reviewed_at,
           created_at,
           updated_at
         FROM public.runner_vehicle_change_requests
         WHERE runner_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [auth.runner.id],
      );

    const requestIds = requestsResult.rows.map(
      (item) => item.id,
    );

    // Read document review state for recent replacement requests.
    // Expiry information is included, but R2 storage keys are not.
    let requestDocuments: VehicleDocumentRow[] = [];

    if (requestIds.length > 0) {
      const documentsResult =
        await query<VehicleDocumentRow>(
          `SELECT
             id,
             vehicle_id,
             vehicle_change_request_id,
             document_type,
             requirement_key,
             review_status,
             rejection_reason,
             submitted_at,
             reviewed_at,
             valid_until
           FROM public.runner_verification_documents
           WHERE runner_id = $1
             AND document_purpose = 'vehicle_update'
             AND vehicle_change_request_id = ANY($2::uuid[])
           ORDER BY
             submitted_at DESC NULLS LAST,
             id DESC`,
          [
            auth.runner.id,
            requestIds,
          ],
        );

      requestDocuments = documentsResult.rows;
    }

    const documentsByRequest = new Map<
      string,
      VehicleDocumentRow[]
    >();

    for (const document of requestDocuments) {
      if (!document.vehicle_change_request_id) {
        continue;
      }

      const existing =
        documentsByRequest.get(
          document.vehicle_change_request_id,
        ) ?? [];

      existing.push(document);

      documentsByRequest.set(
        document.vehicle_change_request_id,
        existing,
      );
    }

    const replacementRequests =
      requestsResult.rows.map((item) => ({
        id: item.id,
        vehicleId: item.vehicle_id,
        vehicleType: normalizeVehicleType(
          item.vehicle_type,
        ),
        storedVehicleType: item.vehicle_type,
        vehicleLabel: vehicleLabel(item.vehicle_type),
        vehicleModel: item.vehicle_model,
        vehicleRegistration: item.vehicle_registration,
        status: item.status,
        reviewReason: item.review_reason,
        reviewedAt: item.reviewed_at,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        documents: (
          documentsByRequest.get(item.id) ?? []
        ).map(shapeDocument),
      }));

    // The newest unresolved replacement request, if any.
    const pendingReplacement =
      replacementRequests.find(
        (item) =>
          item.status === "pending_review" ||
          item.status === "changes_required",
      ) ?? null;

    const replacementRequirements =
      requirementRows.map(shapeRequirement);

    const hasOpenReplacement =
      pendingReplacement !== null;

    const canSubmitReplacement = Boolean(
      activeVehicle &&
      !hasOpenReplacement &&
      !hasActiveErrand,
    );

    let replacementBlockReason: string | null = null;

    if (!activeVehicle) {
      replacementBlockReason =
        "An approved active vehicle is required before you can submit a replacement.";
    } else if (hasOpenReplacement) {
      replacementBlockReason =
        pendingReplacement.status === "changes_required"
          ? "Your previous replacement request needs attention."
          : "Your replacement vehicle is awaiting review.";
    } else if (hasActiveErrand) {
      replacementBlockReason =
        "Finish your current errand before submitting a replacement.";
    }

    return response({
      ok: true,

      runner: {
        id: auth.runner.id,
        accountStatus: account.account_status,
        verificationStatus: account.verification_status,
        serviceArea: account.service_area,
        selectedCategories: categoryKeys,
      },

      activeVehicle,

      savedVehicles,

      pendingReplacement,

      replacementRequests,

      replacementRequirements,

      replacementEligibility: {
        canSubmit: canSubmitReplacement,
        hasActiveVehicle: Boolean(activeVehicle),
        hasOpenReplacement,
        hasActiveErrand,
        activeErrandStatus: activeJob?.status ?? null,
        blockReason: replacementBlockReason,
      },

      reactivationEligibility: {
        hasActiveErrand,
        activeErrandStatus: activeJob?.status ?? null,
        eligibleVehicleIds: savedVehicles
          .filter((vehicle) => vehicle.canReactivate)
          .map((vehicle) => vehicle.id),
      },
    });
  } catch (cause) {
    console.error(
      "[SaMi Runner vehicles] Read failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your vehicle information could not be loaded. Please try again.",
      503,
    );
  }
}
