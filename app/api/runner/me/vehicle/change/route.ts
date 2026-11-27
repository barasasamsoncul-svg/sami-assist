
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse } from "@/apps/runner/server/http";
import {
  deleteR2Object,
  uploadR2Object,
} from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 10;

type StoredVehicleType =
  | "bicycle"
  | "motorcycle"
  | "car";

type VehicleRequirement = {
  requirement_key: string;
  category_key: string | null;
  document_type: string;
  is_required: boolean;
  requires_expiry: boolean;
};

type SupportedDocument = {
  extension: "pdf" | "jpg" | "png" | "webp";
  contentType: string;
};

type PreparedUpload = {
  requirementKey: string;
  file: File;
  bytes: Uint8Array;
  format: SupportedDocument;
  validUntil: string | null;
};

type ParsedSubmission = {
  vehicleType: StoredVehicleType;
  vehicleModel: string | null;
  vehicleRegistration: string | null;
  uploads: Array<{
    requirementKey: string;
    file: File;
    validUntil: string | null;
  }>;
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

function isValidDateOnly(value: string): boolean {
  const parts = value.split("-");

  if (
    parts.length !== 3 ||
    parts[0].length !== 4 ||
    parts[1].length !== 2 ||
    parts[2].length !== 2 ||
    parts.some((part) => !/^[0-9]+$/.test(part))
  ) {
    return false;
  }

  const [yearText, monthText, dayText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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

function isCurrentExpiryDate(value: string): boolean {
  return (
    isValidDateOnly(value) &&
    value >= todayInNairobi()
  );
}

function normalizeVehicleType(
  value: string,
): StoredVehicleType | null {
  switch (value.trim().toLowerCase()) {
    case "bike":
    case "bicycle":
      return "bicycle";

    case "motorbike":
    case "motorcycle":
      return "motorcycle";

    case "vehicle":
    case "car":
      return "car";

    default:
      return null;
  }
}

function compactRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatRegistration(
  value: string,
  vehicleType: StoredVehicleType,
): string {
  const compact = compactRegistration(value);

  if (vehicleType === "motorcycle") {
    return compact.length > 4
      ? `${compact.slice(0, 4)} ${compact.slice(4)}`
      : compact;
  }

  if (vehicleType === "car") {
    return compact.length > 3
      ? `${compact.slice(0, 3)} ${compact.slice(3)}`
      : compact;
  }

  return "";
}

function validRegistration(
  value: string,
  vehicleType: StoredVehicleType,
): boolean {
  const compact = compactRegistration(value);

  if (vehicleType === "motorcycle") {
    // Example: KMFQ 314F
    return /^KM[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(
      compact,
    );
  }

  if (vehicleType === "car") {
    // Example: KEA 123A
    return /^K[A-HJ-NP-Z]{2}[0-9]{3}[A-HJ-NP-Z]$/.test(
      compact,
    );
  }

  return true;
}

function registrationError(
  vehicleType: StoredVehicleType,
): string {
  return vehicleType === "motorcycle"
    ? "Enter a valid Kenyan motorcycle registration number, for example KMFQ 314F."
    : "Enter a valid Kenyan vehicle registration number, for example KEA 123A.";
}

function isFileValue(
  value: FormDataEntryValue | null,
): value is File {
  return (
    typeof File !== "undefined" &&
    value instanceof File
  );
}

function detectDocumentFormat(
  bytes: Uint8Array,
): SupportedDocument | null {
  // PDF
  if (
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-"
  ) {
    return {
      extension: "pdf",
      contentType: "application/pdf",
    };
  }

  // JPEG
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      extension: "jpg",
      contentType: "image/jpeg",
    };
  }

  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      extension: "png",
      contentType: "image/png",
    };
  }

  // WEBP
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return {
      extension: "webp",
      contentType: "image/webp",
    };
  }

  return null;
}

async function prepareUpload(
  requirementKey: string,
  file: File,
  validUntil: string | null,
): Promise<PreparedUpload> {
  if (
    file.size <= 0 ||
    file.size > MAX_DOCUMENT_SIZE
  ) {
    throw new Error(
      "Each document must be larger than 0 bytes and no larger than 10 MB.",
    );
  }

  const bytes = new Uint8Array(
    await file.arrayBuffer(),
  );

  if (
    bytes.length === 0 ||
    bytes.length > MAX_DOCUMENT_SIZE
  ) {
    throw new Error(
      "One of the selected documents is empty or exceeds the 10 MB limit.",
    );
  }

  const format = detectDocumentFormat(bytes);

  if (!format) {
    throw new Error(
      "Unsupported document format. Upload a PDF, JPEG, PNG or WEBP file.",
    );
  }

  return {
    requirementKey,
    file,
    bytes,
    format,
    validUntil,
  };
}

function parseFormData(
  formData: FormData,
): ParsedSubmission {
  const vehicleTypeValue = formData.get("vehicleType");
  const vehicleModelValue = formData.get("vehicleModel");
  const registrationValue = formData.get("vehicleRegistration");

  if (typeof vehicleTypeValue !== "string") {
    throw new Error("Choose your replacement vehicle type.");
  }

  const vehicleType = normalizeVehicleType(vehicleTypeValue);

  if (!vehicleType) {
    throw new Error("Choose Bike, Motorbike or Vehicle.");
  }

  const vehicleModel =
    typeof vehicleModelValue === "string"
      ? vehicleModelValue
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 120)
      : "";

  const rawRegistration =
    typeof registrationValue === "string"
      ? registrationValue
      : "";

  if (
    vehicleType !== "bicycle" &&
    vehicleModel.length < 2
  ) {
    throw new Error("Enter your vehicle make and model.");
  }

  if (
    vehicleType !== "bicycle" &&
    !validRegistration(rawRegistration, vehicleType)
  ) {
    throw new Error(registrationError(vehicleType));
  }

  const savedVehicleModel =
    vehicleType === "bicycle"
      ? null
      : vehicleModel;

  const savedVehicleRegistration =
    vehicleType === "bicycle"
      ? null
      : formatRegistration(rawRegistration, vehicleType);

  const requirementKeyValues =
    formData.getAll("requirementKey");

  const fileValues =
    formData.getAll("file");

  const validUntilValues =
    formData.getAll("validUntil");

  if (
    requirementKeyValues.length !== fileValues.length
  ) {
    throw new Error(
      "Each selected document must have a matching document type.",
    );
  }

  if (
    validUntilValues.length !== 0 &&
    validUntilValues.length !== requirementKeyValues.length
  ) {
    throw new Error(
      "Each uploaded document must have a matching expiry-date entry.",
    );
  }

  if (fileValues.length > MAX_DOCUMENT_COUNT) {
    throw new Error(
      "You have selected too many documents. Upload the documents shown in your checklist.",
    );
  }

  const seenKeys = new Set<string>();

  const uploads = requirementKeyValues.map(
    (keyValue, index) => {
      if (
        typeof keyValue !== "string" ||
        !/^[a-z0-9_-]{2,100}$/.test(keyValue.trim())
      ) {
        throw new Error(
          "One of the document types is invalid.",
        );
      }

      const requirementKey = keyValue.trim();

      if (seenKeys.has(requirementKey)) {
        throw new Error(
          "A document has been selected more than once.",
        );
      }

      seenKeys.add(requirementKey);

      const fileValue = fileValues[index];

      if (!isFileValue(fileValue)) {
        throw new Error(
          "Select a valid file for each document.",
        );
      }

      const validUntilValue =
        validUntilValues.length > 0
          ? validUntilValues[index]
          : null;

      if (
        validUntilValue !== null &&
        typeof validUntilValue !== "string"
      ) {
        throw new Error(
          "Enter a valid document expiry date.",
        );
      }

      const validUntil =
        typeof validUntilValue === "string"
          ? validUntilValue.trim() || null
          : null;

      if (
        validUntil &&
        !isValidDateOnly(validUntil)
      ) {
        throw new Error(
          "Enter the expiry date in YYYY-MM-DD format.",
        );
      }

      if (
        validUntil &&
        !isCurrentExpiryDate(validUntil)
      ) {
        throw new Error(
          "The document expiry date cannot be in the past.",
        );
      }

      return {
        requirementKey,
        file: fileValue,
        validUntil,
      };
    },
  );

  return {
    vehicleType,
    vehicleModel: savedVehicleModel,
    vehicleRegistration: savedVehicleRegistration,
    uploads,
  };
}

async function rollback(
  client: PoolClient,
  transactionStarted: boolean,
) {
  if (transactionStarted) {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  if (
    ["suspended", "closed"].includes(auth.runner.account_status)
  ) {
    return errorResponse(
      "This Runner account cannot submit a vehicle replacement.",
      403,
    );
  }

  if (auth.runner.verification_status !== "approved") {
    return errorResponse(
      "Only approved Runners can submit a vehicle replacement.",
      403,
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "Your vehicle details and documents could not be read.",
    );
  }

  let parsed: ParsedSubmission;

  try {
    parsed = parseFormData(formData);
  } catch (cause) {
    return errorResponse(
      cause instanceof Error
        ? cause.message
        : "Check your vehicle details and selected documents.",
    );
  }

  let preparedUploads: PreparedUpload[];

  try {
    preparedUploads = await Promise.all(
      parsed.uploads.map((item) =>
        prepareUpload(
          item.requirementKey,
          item.file,
          item.validUntil,
        ),
      ),
    );
  } catch (cause) {
    return errorResponse(
      cause instanceof Error
        ? cause.message
        : "One of the selected documents could not be read.",
      415,
    );
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  const uploadedStorageKeys: string[] = [];

  try {
    client = await databasePool().connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the Runner account. This serializes replacement submission
    // against availability changes and other account-level actions.
    const accountResult = await client.query<{
      account_status: string;
      verification_status: string;
    }>(
      `SELECT
         account_status,
         verification_status
       FROM public.runner_accounts
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Runner account not found.",
        404,
      );
    }

    if (
      ["suspended", "closed"].includes(account.account_status)
    ) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "This Runner account cannot submit a vehicle replacement.",
        403,
      );
    }

    if (account.verification_status !== "approved") {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Only approved Runners can submit a vehicle replacement.",
        403,
      );
    }

    // A Runner must complete an active errand before changing vehicles.
    // This does not take an otherwise idle Runner offline.
    const activeJobResult = await client.query<{ id: string }>(
      `SELECT id
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN (
           'accepted',
           'in_progress',
           'completion_submitted'
         )
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    if (activeJobResult.rows.length > 0) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Finish your current errand before submitting a vehicle replacement.",
        409,
      );
    }

    // Confirm that the current approved vehicle still exists.
    // It remains active while the replacement is being reviewed.
    const activeVehicleResult = await client.query<{
      id: string;
    }>(
      `SELECT id
       FROM public.runner_vehicles
       WHERE runner_id = $1
         AND is_active = true
         AND status = 'approved'
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    if (!activeVehicleResult.rows[0]) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Your current approved vehicle could not be verified. Contact SaMi Support.",
        409,
      );
    }

    // Do not allow more than one unresolved replacement request.
    const existingRequestResult = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM public.runner_vehicle_change_requests
       WHERE runner_id = $1
         AND status IN (
           'pending_review',
           'changes_required'
         )
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [auth.runner.id],
    );

    const existingRequest = existingRequestResult.rows[0];

    if (existingRequest) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        existingRequest.status === "changes_required"
          ? "Your previous vehicle replacement requires attention. Resolve that request before submitting another replacement."
          : "You already have a vehicle replacement awaiting review.",
        409,
      );
    }

    // Read the Runner's two permitted service selections.
    const categoriesResult = await client.query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1`,
      [auth.runner.id],
    );

    const categoryKeys = categoriesResult.rows.map(
      (row) => row.category_key,
    );

    if (categoryKeys.length === 0) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Your Runner service details could not be verified. Contact SaMi Support.",
        409,
      );
    }

    // Only vehicle-specific requirements are requested again.
    // Universal onboarding identity documents are not repeated.
    const requirementsResult =
      await client.query<VehicleRequirement>(
        `SELECT
           requirement_key,
           category_key,
           document_type,
           is_required,
           requires_expiry
         FROM public.runner_onboarding_document_requirements
         WHERE is_active = true
           AND vehicle_type = $1
           AND (
             category_key IS NULL
             OR category_key = ANY($2::text[])
           )
         ORDER BY
           category_key NULLS FIRST,
           display_order,
           requirement_key
         FOR SHARE`,
        [
          parsed.vehicleType,
          categoryKeys,
        ],
      );

    const requirementMap = new Map(
      requirementsResult.rows.map((item) => [
        item.requirement_key,
        item,
      ]),
    );

    const requiredRequirements =
      requirementsResult.rows.filter(
        (item) => item.is_required,
      );

    // Motorised replacements must have their configured mandatory
    // document checklist. Do not silently accept an empty checklist.
    if (
      parsed.vehicleType !== "bicycle" &&
      requiredRequirements.length === 0
    ) {
      console.error(
        "[SaMi Runner vehicle change] No mandatory vehicle requirements are configured.",
        {
          runnerId: auth.runner.id,
          vehicleType: parsed.vehicleType,
        },
      );

      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Your vehicle document checklist could not be verified. Please try again later.",
        503,
      );
    }

    const missingRequiredDocuments =
      requiredRequirements.filter(
        (requirement) =>
          !preparedUploads.some(
            (upload) =>
              upload.requirementKey ===
              requirement.requirement_key,
          ),
      );

    if (missingRequiredDocuments.length > 0) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "Upload all required documents for your replacement vehicle before submitting.",
        400,
      );
    }

    const invalidUpload = preparedUploads.find(
      (upload) =>
        !requirementMap.has(upload.requirementKey),
    );

    if (invalidUpload) {
      await rollback(client, transactionStarted);
      transactionStarted = false;

      return errorResponse(
        "One or more selected documents do not match your replacement vehicle requirements.",
        403,
      );
    }

    // Validate expiry dates against the configured requirement.
    // Dates are supplied in YYYY-MM-DD format and evaluated
    // using the Africa/Nairobi calendar date.
    for (const upload of preparedUploads) {
      const requirement = requirementMap.get(
        upload.requirementKey,
      );

      if (!requirement) {
        continue;
      }

      if (
        requirement.requires_expiry &&
        !upload.validUntil
      ) {
        await rollback(client, transactionStarted);
        transactionStarted = false;

        return errorResponse(
          `Enter the expiry date for ${requirement.document_type.replace(/_/g, " ")}.`,
          400,
        );
      }

      if (
        requirement.requires_expiry &&
        upload.validUntil &&
        !isCurrentExpiryDate(upload.validUntil)
      ) {
        await rollback(client, transactionStarted);
        transactionStarted = false;

        return errorResponse(
          "One of your vehicle documents has an expired or invalid expiry date.",
          400,
        );
      }

      if (
        !requirement.requires_expiry &&
        upload.validUntil
      ) {
        await rollback(client, transactionStarted);
        transactionStarted = false;

        return errorResponse(
          "An expiry date was provided for a document that does not require one.",
          400,
        );
      }
    }

    // Check the saved vehicle history before allowing another record
    // with the same registration.
    if (parsed.vehicleRegistration) {
      const compactPlate = compactRegistration(
        parsed.vehicleRegistration,
      );

      const duplicateResult = await client.query<{
        runner_id: string;
        status: string;
      }>(
        `SELECT runner_id, status
         FROM public.runner_vehicles
         WHERE regexp_replace(
           upper(btrim(vehicle_registration)),
           '[^A-Z0-9]',
           '',
           'g'
         ) = $1
           AND status <> 'rejected'
         LIMIT 1`,
        [compactPlate],
      );

      const duplicate = duplicateResult.rows[0];

      if (duplicate) {
        await rollback(client, transactionStarted);
        transactionStarted = false;

        if (duplicate.runner_id === auth.runner.id) {
          return errorResponse(
            duplicate.status === "inactive"
              ? "This vehicle is already saved in your vehicle list. Use the Reactivate option instead of registering it again."
              : "This vehicle is already recorded in your SaMi Runner account.",
            409,
          );
        }

        return errorResponse(
          "This vehicle registration is already registered to another SaMi Runner.",
          409,
        );
      }
    }

    // Create the replacement as pending and inactive.
    // The current approved active vehicle is never modified here.
    const vehicleResult = await client.query<{
      id: string;
    }>(
      `INSERT INTO public.runner_vehicles (
         runner_id,
         vehicle_type,
         vehicle_model,
         vehicle_registration,
         status,
         is_active
       )
       VALUES ($1, $2, $3, $4, 'pending_review', false)
       RETURNING id`,
      [
        auth.runner.id,
        parsed.vehicleType,
        parsed.vehicleModel,
        parsed.vehicleRegistration,
      ],
    );

    const vehicleId = vehicleResult.rows[0]?.id;

    if (!vehicleId) {
      throw new Error(
        "RUNNER_VEHICLE_CREATE_FAILED",
      );
    }

    // Create the separate replacement review request.
    const requestResult = await client.query<{
      id: string;
    }>(
      `INSERT INTO public.runner_vehicle_change_requests (
         runner_id,
         vehicle_id,
         vehicle_type,
         vehicle_model,
         vehicle_registration,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'pending_review')
       RETURNING id`,
      [
        auth.runner.id,
        vehicleId,
        parsed.vehicleType,
        parsed.vehicleModel,
        parsed.vehicleRegistration,
      ],
    );

    const changeRequestId = requestResult.rows[0]?.id;

    if (!changeRequestId) {
      throw new Error(
        "RUNNER_VEHICLE_CHANGE_REQUEST_CREATE_FAILED",
      );
    }

    // Upload and register each document against this replacement vehicle.
    const savedDocuments: Array<{
      id: string;
      requirementKey: string;
      reviewStatus: string;
      validUntil: string | null;
    }> = [];

    for (const upload of preparedUploads) {
      const requirement = requirementMap.get(
        upload.requirementKey,
      );

      if (!requirement) {
        throw new Error(
          "RUNNER_VEHICLE_REQUIREMENT_NOT_FOUND",
        );
      }

      const storageKey =
        `runners/${auth.runner.id}/vehicles/${vehicleId}/` +
        `${requirement.requirement_key}/` +
        `${randomUUID()}.${upload.format.extension}`;

      await uploadR2Object({
        key: storageKey,
        bytes: upload.bytes,
        contentType: upload.format.contentType,
      });

      uploadedStorageKeys.push(storageKey);

      const documentResult = await client.query<{
        id: string;
        review_status: string;
        valid_until: string | null;
      }>(
        `INSERT INTO public.runner_verification_documents (
           runner_id,
           document_type,
           storage_key,
           category_key,
           requirement_key,
           review_status,
           submitted_at,
           valid_until,
           document_purpose,
           vehicle_id,
           vehicle_change_request_id
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           'pending',
           now(),
           $6,
           'vehicle_update',
           $7,
           $8
         )
         RETURNING id, review_status, valid_until`,
        [
          auth.runner.id,
          requirement.document_type,
          storageKey,
          requirement.category_key,
          requirement.requirement_key,
          upload.validUntil,
          vehicleId,
          changeRequestId,
        ],
      );

      const savedDocument = documentResult.rows[0];

      if (!savedDocument) {
        throw new Error(
          "RUNNER_VEHICLE_DOCUMENT_CREATE_FAILED",
        );
      }

      savedDocuments.push({
        id: savedDocument.id,
        requirementKey: requirement.requirement_key,
        reviewStatus: savedDocument.review_status,
        validUntil: savedDocument.valid_until,
      });
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return response({
      ok: true,
      message:
        "Your replacement vehicle and documents have been submitted for review. Your current approved vehicle remains active.",
      requestId: changeRequestId,
      vehicleId,
      vehicleStatus: "pending_review",
      vehicleIsActive: false,
      documents: savedDocuments,
    });
  } catch (cause) {
    if (client) {
      await rollback(client, transactionStarted);
    }

    // Remove uploaded R2 objects if the database transaction failed.
    await Promise.all(
      uploadedStorageKeys.map((key) =>
        deleteR2Object(key).catch((cleanupCause) => {
          console.error(
            "[SaMi Runner vehicle change] R2 cleanup failed.",
            cleanupCause instanceof Error
              ? cleanupCause.message
              : "unknown error",
          );
        }),
      ),
    );

    const databaseError: {
      code?: unknown;
      constraint?: unknown;
    } =
      cause !== null && typeof cause === "object"
        ? (cause as {
            code?: unknown;
            constraint?: unknown;
          })
        : {};

    if (databaseError.code === "23505") {
      return errorResponse(
        "This vehicle registration or replacement request is already recorded.",
        409,
      );
    }

    console.error(
      "[SaMi Runner vehicle change] Submission failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your vehicle replacement could not be submitted. Please try again.",
      503,
    );
  } finally {
    client?.release();
  }
}
