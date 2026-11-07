
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/lib/runner/auth";
import { query } from "@/lib/runner/db";
import {
  deleteR2Object,
  uploadR2Object,
} from "@/lib/storage/r2";

import { errorResponse } from "@/lib/runner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

type RunnerOnboardingProfile = {
  vehicle_type: string | null;
};

type Requirement = {
  requirement_key: string;
  category_key: string | null;
  vehicle_type: string;
  document_type: string;
  title: string;
};

type UploadedDocument = {
  id: string;
  document_type: string;
  category_key: string | null;
  requirement_key: string;
  review_status: string;
  submitted_at: string;
};

type SupportedDocument = {
  extension: "pdf" | "jpg" | "png" | "webp";
  contentType: string;
};

/**
 * Detect the actual file format from its binary signature.
 * The original filename and client-supplied MIME type are
 * never used to determine the storage extension.
 */
function detectDocumentFormat(
  bytes: Uint8Array,
): SupportedDocument | null {
  // PDF: %PDF-
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

  // WEBP: RIFF....WEBP
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

export async function POST(request: Request) {
  const auth = await authenticateRunner(request);

  if (auth.response) {
    return auth.response;
  }

  if (
    ["suspended", "closed"].includes(
      auth.runner.account_status,
    )
  ) {
    return errorResponse(
      "This Runner account cannot upload verification documents.",
      403,
    );
  }

  if (auth.runner.verification_status === "approved") {
    return errorResponse(
      "Your Runner application is already approved.",
      409,
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "Send the document using a multipart form upload.",
    );
  }

  const requirementKeyValue =
    formData.get("requirementKey");

  const fileValue = formData.get("file");

  if (
    typeof requirementKeyValue !== "string" ||
    !/^[a-z0-9_-]{2,100}$/.test(
      requirementKeyValue.trim(),
    )
  ) {
    return errorResponse(
      "Choose a valid onboarding document requirement.",
    );
  }

  const requirementKey = requirementKeyValue.trim();

  if (
    typeof File === "undefined" ||
    !(fileValue instanceof File)
  ) {
    return errorResponse(
      "Select a document to upload.",
    );
  }

  if (fileValue.size <= 0) {
    return errorResponse(
      "The selected document is empty.",
    );
  }

  if (fileValue.size > MAX_DOCUMENT_SIZE) {
    return errorResponse(
      "Each verification document must be 10 MB or smaller.",
      413,
    );
  }

  try {
    // A transport type is necessary to resolve vehicle-specific
    // requirements. The client cannot choose arbitrary requirements.
    const profileResult = await query<RunnerOnboardingProfile>(
      `SELECT vehicle_type
       FROM public.runner_profiles
       WHERE runner_id = $1
       LIMIT 1`,
      [auth.runner.id],
    );

    const profile = profileResult.rows[0];

    if (!profile?.vehicle_type) {
      return errorResponse(
        "Complete your transport details before uploading verification documents.",
        409,
      );
    }

    const categoryResult = await query<{
      category_key: string;
    }>(
      `SELECT category_key
       FROM public.runner_account_service_categories
       WHERE runner_id = $1`,
      [auth.runner.id],
    );

    const categoryKeys = categoryResult.rows.map(
      (row) => row.category_key,
    );

    if (categoryKeys.length === 0) {
      return errorResponse(
        "Select at least one task category before uploading documents.",
        409,
      );
    }

    // Confirm that this requirement is active and applies
    // to one of this Runner's categories and vehicle types.
    const requirementResult = await query<Requirement>(
      `SELECT
         requirement_key,
         category_key,
         vehicle_type,
         document_type,
         title
       FROM public.runner_onboarding_document_requirements
       WHERE requirement_key = $1
         AND is_active = true
         AND (
           category_key IS NULL
           OR category_key = ANY($2::text[])
         )
         AND (
           vehicle_type = 'any'
           OR vehicle_type = $3
         )
       LIMIT 1`,
      [
        requirementKey,
        categoryKeys,
        profile.vehicle_type,
      ],
    );

    const requirement = requirementResult.rows[0];

    if (!requirement) {
      return errorResponse(
        "That document is not a valid requirement for your selected tasks and transport type.",
        403,
      );
    }

    // Read and inspect the actual file contents.
    const bytes = new Uint8Array(
      await fileValue.arrayBuffer(),
    );

    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_DOCUMENT_SIZE
    ) {
      return errorResponse(
        "The selected document is empty or exceeds the 10 MB limit.",
        413,
      );
    }

    const format = detectDocumentFormat(bytes);

    if (!format) {
      return errorResponse(
        "Unsupported document format. Upload a PDF, JPEG, PNG or WEBP file.",
        415,
      );
    }

    // Use an opaque storage key. No email, phone number or
    // original filename is exposed in the R2 object path.
    const storageKey =
      `runners/${auth.runner.id}/verification/` +
      `${requirement.requirement_key}/${randomUUID()}.${format.extension}`;

    await uploadR2Object({
      key: storageKey,
      bytes,
      contentType: format.contentType,
    });

    try {
      // The R2 upload is completed before adding the database
      // record. Clean up the object if the database insert fails.
      const documentResult =
        await query<UploadedDocument>(
          `INSERT INTO public.runner_verification_documents (
             runner_id,
             document_type,
             storage_key,
             category_key,
             requirement_key,
             review_status,
             submitted_at
           )
           VALUES ($1, $2, $3, $4, $5, 'pending', now())
           RETURNING
             id,
             document_type,
             category_key,
             requirement_key,
             review_status,
             submitted_at`,
          [
            auth.runner.id,
            requirement.document_type,
            storageKey,
            requirement.category_key,
            requirement.requirement_key,
          ],
        );

      const document = documentResult.rows[0];

      if (!document) {
        throw new Error(
          "RUNNER_DOCUMENT_RECORD_CREATION_FAILED",
        );
      }

      return NextResponse.json(
        {
          ok: true,
          message: "Your document has been uploaded for review.",
          document: {
            id: document.id,
            documentType: document.document_type,
            categoryKey: document.category_key,
            requirementKey: document.requirement_key,
            reviewStatus: document.review_status,
            submittedAt: document.submitted_at,
          },
        },
        {
          headers: {
            "Cache-Control": "no-store, private",
          },
        },
      );
    } catch (cause) {
      await deleteR2Object(storageKey).catch(
        (cleanupCause) => {
          console.error(
            "[SaMi Runner documents] R2 cleanup failed.",
            cleanupCause instanceof Error
              ? cleanupCause.message
              : "unknown error",
          );
        },
      );

      throw cause;
    }
  } catch (cause) {
    console.error(
      "[SaMi Runner documents] Upload failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse(
      "Your verification document could not be uploaded. Please try again.",
      503,
    );
  }
}

