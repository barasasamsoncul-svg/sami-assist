
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import {
  deleteR2Object,
  uploadR2Object,
} from "@/lib/storage/r2";

import { errorResponse } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

const NATIONAL_ID_FRONT_KEY = "identity_national_id_front";
const NATIONAL_ID_BACK_KEY = "identity_national_id_back";

type Requirement = {
  requirement_key: string;
  category_key: string | null;
  vehicle_type: string;
  document_type: string;
  title: string;
};

type SupportedDocument = {
  extension: "pdf" | "jpg" | "png" | "webp";
  contentType: string;
};

type UploadInput = {
  requirementKey: string;
  file: File;
  bytes: Uint8Array;
  format: SupportedDocument;
};

type UploadedDocument = {
  id: string;
  document_type: string;
  category_key: string | null;
  requirement_key: string;
  review_status: string;
  submitted_at: Date | string;
};

type RunnerProfile = {
  vehicle_type: string | null;
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

/**
 * Detect the actual binary file format.
 * Client MIME type and original filename are not trusted.
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

function isFileValue(
  value: FormDataEntryValue | null,
): value is File {
  return (
    typeof File !== "undefined" &&
    value instanceof File
  );
}

function validRequirementKey(value: string): boolean {
  return /^[a-z0-9_-]{2,100}$/.test(value);
}

async function prepareUpload(
  requirementKey: string,
  file: File,
): Promise<UploadInput> {
  if (file.size <= 0) {
    throw new Error("The selected document is empty.");
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error(
      "Each verification document must be 10 MB or smaller.",
    );
  }

  const bytes = new Uint8Array(
    await file.arrayBuffer(),
  );

  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_DOCUMENT_SIZE
  ) {
    throw new Error(
      "The selected document is empty or exceeds the 10 MB limit.",
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
  };
}

/**
 * Accepts either:
 *
 * 1. A single document:
 *    requirementKey + file
 *
 * 2. A National ID pair:
 *    requirementKeyFront + fileFront
 *    requirementKeyBack + fileBack
 *
 * The two National ID sides are validated and inserted
 * together. One side cannot be submitted independently.
 */
function parseUploadInputs(
  formData: FormData,
): {
  inputs: Array<{
    requirementKey: string;
    file: File;
  }>;
  isNationalIdPair: boolean;
} {
  const groupValues = [
    formData.get("requirementKeyFront"),
    formData.get("fileFront"),
    formData.get("requirementKeyBack"),
    formData.get("fileBack"),
  ];

  const groupedRequestStarted = groupValues.some(
    (value) => value !== null,
  );

  if (groupedRequestStarted) {
    const [
      frontKeyValue,
      frontFileValue,
      backKeyValue,
      backFileValue,
    ] = groupValues;

    if (
      typeof frontKeyValue !== "string" ||
      typeof backKeyValue !== "string" ||
      !isFileValue(frontFileValue) ||
      !isFileValue(backFileValue)
    ) {
      throw new Error(
        "Upload both the front and back of your National ID before submitting.",
      );
    }

    const frontKey = frontKeyValue.trim();
    const backKey = backKeyValue.trim();

    if (
      frontKey !== NATIONAL_ID_FRONT_KEY ||
      backKey !== NATIONAL_ID_BACK_KEY
    ) {
      throw new Error(
        "The National ID upload requirements are invalid. Refresh the page and try again.",
      );
    }

    return {
      isNationalIdPair: true,
      inputs: [
        {
          requirementKey: frontKey,
          file: frontFileValue,
        },
        {
          requirementKey: backKey,
          file: backFileValue,
        },
      ],
    };
  }

  const requirementKeyValue =
    formData.get("requirementKey");

  const fileValue = formData.get("file");

  if (
    typeof requirementKeyValue !== "string" ||
    !validRequirementKey(requirementKeyValue.trim())
  ) {
    throw new Error(
      "Choose a valid onboarding document requirement.",
    );
  }

  if (!isFileValue(fileValue)) {
    throw new Error("Select a document to upload.");
  }

  const requirementKey = requirementKeyValue.trim();

  // National ID must always be submitted as one two-sided
  // document flow, not as separate one-sided uploads.
  if (
    requirementKey === NATIONAL_ID_FRONT_KEY ||
    requirementKey === NATIONAL_ID_BACK_KEY
  ) {
    throw new Error(
      "Submit both sides of your National ID together.",
    );
  }

  return {
    isNationalIdPair: false,
    inputs: [
      {
        requirementKey,
        file: fileValue,
      },
    ],
  };
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

  let parsed: ReturnType<typeof parseUploadInputs>;

  try {
    parsed = parseUploadInputs(formData);
  } catch (cause) {
    return errorResponse(
      cause instanceof Error
        ? cause.message
        : "The selected document upload is invalid.",
    );
  }

  let preparedUploads: UploadInput[];

  try {
    preparedUploads = await Promise.all(
      parsed.inputs.map((input) =>
        prepareUpload(
          input.requirementKey,
          input.file,
        ),
      ),
    );
  } catch (cause) {
    return errorResponse(
      cause instanceof Error
        ? cause.message
        : "One or more selected documents could not be read.",
      415,
    );
  }

  const client = await databasePool().connect();
  const uploadedKeys: string[] = [];

  let transactionStarted = false;

  async function rejectTransaction(
    message: string,
    status = 409,
  ) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
      transactionStarted = false;
    }

    return errorResponse(message, status);
  }

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the Runner account while checking the onboarding
    // state and creating document records.
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
      return await rejectTransaction(
        "Runner account not found.",
        404,
      );
    }

    if (
      ["suspended", "closed"].includes(
        account.account_status,
      )
    ) {
      return await rejectTransaction(
        "This Runner account cannot upload verification documents.",
        403,
      );
    }

    if (account.verification_status === "approved") {
      return await rejectTransaction(
        "Your Runner application is already approved.",
        409,
      );
    }

    const profileResult =
      await client.query<RunnerProfile>(
        `SELECT vehicle_type
         FROM public.runner_profiles
         WHERE runner_id = $1
         LIMIT 1`,
        [auth.runner.id],
      );

    const profile = profileResult.rows[0];

    if (!profile?.vehicle_type) {
      return await rejectTransaction(
        "Complete your transport details before uploading verification documents.",
        409,
      );
    }

    const categoryResult = await client.query<{
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
      return await rejectTransaction(
        "Select at least one task category before uploading documents.",
        409,
      );
    }

    const requirementKeys = preparedUploads.map(
      (item) => item.requirementKey,
    );

    const requirementResult =
      await client.query<Requirement>(
        `SELECT
           requirement_key,
           category_key,
           vehicle_type,
           document_type,
           title
         FROM public.runner_onboarding_document_requirements
         WHERE requirement_key = ANY($1::text[])
           AND is_active = true
           AND (
             category_key IS NULL
             OR category_key = ANY($2::text[])
           )
           AND (
             vehicle_type = 'any'
             OR vehicle_type = $3
           )
         FOR SHARE`,
        [
          requirementKeys,
          categoryKeys,
          profile.vehicle_type,
        ],
      );

    if (
      requirementResult.rows.length !==
      preparedUploads.length
    ) {
      return await rejectTransaction(
        "One or more documents are not valid requirements for your selected tasks and transport type.",
        403,
      );
    }

    const requirementMap = new Map(
      requirementResult.rows.map((item) => [
        item.requirement_key,
        item,
      ]),
    );

    if (parsed.isNationalIdPair) {
      const front = requirementMap.get(
        NATIONAL_ID_FRONT_KEY,
      );

      const back = requirementMap.get(
        NATIONAL_ID_BACK_KEY,
      );

      if (
        !front ||
        !back ||
        front.document_type !== "national_id_front" ||
        back.document_type !== "national_id_back"
      ) {
        return await rejectTransaction(
          "The National ID front and back requirements are not configured correctly. Contact SaMi support.",
          409,
        );
      }
    }

    // Upload all files to the existing R2 bucket.
    // Each key is tracked so failed database work can clean
    // up every successfully uploaded object.
    const uploadedDocuments: Array<{
      upload: UploadInput;
      requirement: Requirement;
      storageKey: string;
    }> = [];

    for (const upload of preparedUploads) {
      const requirement = requirementMap.get(
        upload.requirementKey,
      );

      if (!requirement) {
        throw new Error(
          "RUNNER_DOCUMENT_REQUIREMENT_NOT_FOUND",
        );
      }

      const storageKey =
        `runners/${auth.runner.id}/verification/` +
        `${requirement.requirement_key}/${randomUUID()}.${upload.format.extension}`;

      await uploadR2Object({
        key: storageKey,
        bytes: upload.bytes,
        contentType: upload.format.contentType,
      });

      uploadedKeys.push(storageKey);

      uploadedDocuments.push({
        upload,
        requirement,
        storageKey,
      });
    }

    // Insert every document record in the same database
    // transaction. The National ID pair therefore cannot
    // be recorded as complete with only one side.
    const savedDocuments: UploadedDocument[] = [];

    for (const item of uploadedDocuments) {
      const documentResult =
        await client.query<UploadedDocument>(
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
            item.requirement.document_type,
            item.storageKey,
            item.requirement.category_key,
            item.requirement.requirement_key,
          ],
        );

      const document = documentResult.rows[0];

      if (!document) {
        throw new Error(
          "RUNNER_DOCUMENT_RECORD_CREATION_FAILED",
        );
      }

      savedDocuments.push(document);
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const documents = savedDocuments.map((document) => ({
      id: document.id,
      documentType: document.document_type,
      categoryKey: document.category_key,
      requirementKey: document.requirement_key,
      reviewStatus: document.review_status,
      submittedAt: document.submitted_at,
    }));

    return response({
      ok: true,
      message: parsed.isNationalIdPair
        ? "Both sides of your National ID have been uploaded for review."
        : "Your document has been uploaded for review.",
      documents,
      document: documents[0],
      uploadCount: documents.length,
    });
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
      transactionStarted = false;
    }

    // Remove every R2 object uploaded during this request.
    // This prevents orphaned objects when either side of
    // the National ID pair or its database record fails.
    await Promise.all(
      uploadedKeys.map((key) =>
        deleteR2Object(key).catch((cleanupCause) => {
          console.error(
            "[SaMi Runner documents] R2 cleanup failed.",
            cleanupCause instanceof Error
              ? cleanupCause.message
              : "unknown error",
          );
        }),
      ),
    );

    console.error(
      "[SaMi Runner documents] Upload failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your verification document could not be uploaded. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
