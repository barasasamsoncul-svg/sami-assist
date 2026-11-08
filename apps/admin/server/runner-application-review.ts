import "server-only";

import { NextResponse } from "next/server";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import {
  databasePool,
  query as runnerQuery,
} from "@/apps/runner/server/db";
import { deleteR2Object } from "@/lib/storage/r2";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ApplicationDecision = "approved" | "rejected";

type DocumentDecision =
  | "approved"
  | "rejected"
  | "resubmission_required";

type PendingDeletion = {
  id: string;
  storage_key: string;
};

type RunnerAccountRow = {
  id: string;
  verification_status: string;
  account_status: string;
};

type RunnerDocumentRow = {
  id: string;
  runner_id: string;
  storage_key: string | null;
  review_status: string;
};

type MissingRequirementRow = {
  requirement_key: string;
  title: string;
};

class ReviewError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

function errorResponse(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...details,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function successResponse(data: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBody(request: Request) {
  try {
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readDecision(
  value: unknown,
): ApplicationDecision | null {
  return value === "approved" || value === "rejected"
    ? value
    : null;
}

function readDocumentDecision(
  value: unknown,
): DocumentDecision | null {
  return value === "approved" ||
    value === "rejected" ||
    value === "resubmission_required"
    ? value
    : null;
}

function readReason(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, 1000)
    : "";
}

function validateReason(
  decision: "rejected" | "resubmission_required",
  reason: string,
) {
  if (reason.length < 10) {
    throw new ReviewError(
      "Provide a clear explanation of at least 10 characters for this decision.",
      400,
    );
  }

  return decision;
}

function getDeletionError(cause: unknown) {
  const message =
    cause instanceof Error
      ? cause.message
      : "Unknown storage deletion error.";

  return message.slice(0, 1000);
}

async function queueDocumentDeletion(
  client: import("pg").PoolClient,
  input: {
    document: RunnerDocumentRow;
    adminId: string;
    reason:
      | "document_rejected"
      | "resubmission_required"
      | "application_approved_cleanup";
  },
): Promise<PendingDeletion | null> {
  const storageKey = input.document.storage_key;

  if (!storageKey) {
    return null;
  }

  const result = await client.query<PendingDeletion>(
    `INSERT INTO public.runner_document_storage_deletions (
       document_id,
       runner_id,
       storage_key,
       deletion_reason,
       requested_by_admin_id
     )
     VALUES ($1, $2, $3, $4, $5)

     ON CONFLICT (storage_key)
     DO UPDATE SET
       deletion_reason = EXCLUDED.deletion_reason,
       requested_by_admin_id = EXCLUDED.requested_by_admin_id

     WHERE public.runner_document_storage_deletions.deleted_at IS NULL

     RETURNING id, storage_key`,
    [
      input.document.id,
      input.document.runner_id,
      storageKey,
      input.reason,
      input.adminId,
    ],
  );

  // A previous queue record may already confirm that this
  // exact R2 object was successfully deleted.
  await client.query(
    `UPDATE public.runner_verification_documents
     SET storage_key = NULL
     WHERE id = $1
       AND runner_id = $2`,
    [input.document.id, input.document.runner_id],
  );

  return result.rows[0] ?? null;
}

async function processStorageDeletions(
  deletions: PendingDeletion[],
) {
  let deleted = 0;
  let pending = 0;

  const pool = databasePool();

  for (const deletion of deletions) {
    try {
      // Delete the actual object from Cloudflare R2.
      await deleteR2Object(deletion.storage_key);

      // Mark the queue item complete only after R2 confirms deletion.
      await pool.query(
        `UPDATE public.runner_document_storage_deletions
         SET
           deleted_at = now(),
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           last_error = NULL
         WHERE id = $1
           AND deleted_at IS NULL`,
        [deletion.id],
      );

      deleted += 1;
    } catch (cause) {
      const message = getDeletionError(cause);

      console.error(
        "[SaMi Admin] Runner document R2 deletion failed.",
        {
          deletionId: deletion.id,
          error: message,
        },
      );

      // Keep the queue item pending for a subsequent retry.
      try {
        await pool.query(
          `UPDATE public.runner_document_storage_deletions
           SET
             attempt_count = attempt_count + 1,
             last_attempt_at = now(),
             last_error = $2
           WHERE id = $1
             AND deleted_at IS NULL`,
          [deletion.id, message],
        );
      } catch (databaseCause) {
        console.error(
          "[SaMi Admin] Could not update document deletion queue.",
          databaseCause instanceof Error
            ? databaseCause.message
            : "Unknown database error.",
        );
      }

      pending += 1;
    }
  }

  return {
    deleted,
    pending,
  };
}

/**
 * Approves or rejects an entire Runner application.
 *
 * Approval is blocked until every applicable required
 * onboarding document has an approved review status.
 */
export async function reviewRunnerApplication(
  request: Request,
  runnerId: string,
) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin review requests are not allowed.",
      403,
    );
  }

  if (!UUID_PATTERN.test(runnerId)) {
    return errorResponse(
      "A valid Runner application ID is required.",
      400,
    );
  }

  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return errorResponse("Invalid application review request.");
  }

  const decision = readDecision(body.decision);
  const reason = readReason(body.reason);

  if (!decision) {
    return errorResponse(
      "Choose either approved or rejected.",
    );
  }

  if (decision === "rejected" && reason.length < 10) {
    return errorResponse(
      "Provide a clear rejection reason of at least 10 characters.",
    );
  }

  if (reason.length > 1000) {
    return errorResponse(
      "The review reason is too long.",
    );
  }

  const adminId = auth.user.id;
  const client = await databasePool().connect();

  let queuedDeletions: PendingDeletion[] = [];

  try {
    await client.query("BEGIN");

    const accountResult = await client.query<RunnerAccountRow>(
      `SELECT
         id,
         verification_status,
         account_status
       FROM public.runner_accounts
       WHERE id = $1
       FOR UPDATE`,
      [runnerId],
    );

    const account = accountResult.rows[0];

    if (!account) {
      throw new ReviewError(
        "Runner application was not found.",
        404,
      );
    }

    if (account.verification_status === "approved") {
      throw new ReviewError(
        "This Runner application has already been approved.",
        409,
      );
    }

    if (
      decision === "approved" &&
      ["suspended", "closed"].includes(account.account_status)
    ) {
      throw new ReviewError(
        "A suspended or closed Runner account cannot be approved through application review.",
        409,
      );
    }

    if (decision === "approved") {
      const missingResult =
        await client.query<MissingRequirementRow>(
          `SELECT
             r.requirement_key,
             r.title

           FROM public.runner_onboarding_document_requirements AS r

           LEFT JOIN public.runner_profiles AS p
             ON p.runner_id = $1

           WHERE r.is_active = true
             AND r.is_required = true

             AND (
               r.category_key IS NULL
               OR EXISTS (
                 SELECT 1
                 FROM public.runner_account_service_categories AS sc
                 WHERE sc.runner_id = $1
                   AND sc.category_key = r.category_key
               )
             )

             AND (
               r.vehicle_type = 'any'
               OR r.vehicle_type = p.vehicle_type
             )

             AND NOT EXISTS (
               SELECT 1
               FROM public.runner_verification_documents AS d
               WHERE d.runner_id = $1
                 AND d.requirement_key = r.requirement_key
                 AND d.review_status = 'approved'
             )

           ORDER BY r.display_order, r.requirement_key`,
          [runnerId],
        );

      if (missingResult.rows.length > 0) {
        throw new ReviewError(
          "This application cannot be approved until all required documents have been approved.",
          409,
          {
            missingDocuments: missingResult.rows,
          },
        );
      }
    }

    const previousStatus = account.verification_status;

    await client.query(
      `INSERT INTO public.runner_admin_application_reviews (
         runner_id,
         admin_user_id,
         decision,
         previous_verification_status,
         new_verification_status,
         reason
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        runnerId,
        adminId,
        decision,
        previousStatus,
        decision,
        reason || null,
      ],
    );

    await client.query(
      `UPDATE public.runner_accounts
       SET
         verification_status = $2,
         account_status = $3,
         verification_reviewed_at = now(),
         verification_reviewed_by = $4,
         verification_rejection_reason = $5,
         updated_at = now()
       WHERE id = $1`,
      [
        runnerId,
        decision,
        decision === "approved"
          ? "active"
          : "pending_verification",
        adminId,
        decision === "rejected" ? reason : null,
      ],
    );

    if (decision === "approved") {
      // Approved files stay in R2.
      // Rejected or resubmission-required files are removed.
      const documentResult =
        await client.query<RunnerDocumentRow>(
          `SELECT
             id,
             runner_id,
             storage_key,
             review_status
           FROM public.runner_verification_documents
           WHERE runner_id = $1
             AND review_status IN (
               'rejected',
               'resubmission_required'
             )
             AND storage_key IS NOT NULL
           FOR UPDATE`,
          [runnerId],
        );

      for (const document of documentResult.rows) {
        const queued = await queueDocumentDeletion(client, {
          document,
          adminId,
          reason: "application_approved_cleanup",
        });

        if (queued) {
          queuedDeletions.push(queued);
        }
      }
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (cause instanceof ReviewError) {
      return errorResponse(
        cause.message,
        cause.status,
        cause.details,
      );
    }

    console.error(
      "[SaMi Admin] Runner application review failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown database error.",
    );

    return errorResponse(
      "Runner application review could not be completed.",
      503,
    );
  } finally {
    client.release();
  }

  // R2 deletion happens after the review transaction commits.
  const storageCleanup =
    await processStorageDeletions(queuedDeletions);

  return successResponse({
    runnerId,
    decision,
    storageCleanup,
    message:
      decision === "approved"
        ? "Runner application approved."
        : "Runner application rejected.",
  });
}

/**
 * Reviews one submitted Runner verification document.
 *
 * Rejected and resubmission-required files are queued for
 * deletion and their storage_key is cleared from the document.
 * Approved files remain in R2.
 */
export async function reviewRunnerDocument(
  request: Request,
  runnerId: string,
  documentId: string,
) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin document review requests are not allowed.",
      403,
    );
  }

  if (
    !UUID_PATTERN.test(runnerId) ||
    !UUID_PATTERN.test(documentId)
  ) {
    return errorResponse(
      "Valid Runner and document IDs are required.",
      400,
    );
  }

  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const body = await readBody(request);

  if (!body) {
    return errorResponse("Invalid document review request.");
  }

  const decision = readDocumentDecision(body.decision);
  const reason = readReason(body.reason);

  if (!decision) {
    return errorResponse(
      "Choose approved, rejected or resubmission_required.",
    );
  }

  if (
    decision !== "approved" &&
    reason.length < 10
  ) {
    return errorResponse(
      "Provide a clear rejection or resubmission reason of at least 10 characters.",
    );
  }

  if (reason.length > 1000) {
    return errorResponse(
      "The document review reason is too long.",
    );
  }

  const adminId = auth.user.id;
  const client = await databasePool().connect();

  let queuedDeletion: PendingDeletion | null = null;

  try {
    await client.query("BEGIN");

    const accountResult =
      await client.query<RunnerAccountRow>(
        `SELECT
           id,
           verification_status,
           account_status
         FROM public.runner_accounts
         WHERE id = $1
         FOR UPDATE`,
        [runnerId],
      );

    const account = accountResult.rows[0];

    if (!account) {
      throw new ReviewError(
        "Runner account was not found.",
        404,
      );
    }

    if (account.verification_status === "approved") {
      throw new ReviewError(
        "Documents belonging to an approved Runner cannot be changed through onboarding review.",
        409,
      );
    }

    const documentResult =
      await client.query<RunnerDocumentRow>(
        `SELECT
           id,
           runner_id,
           storage_key,
           review_status
         FROM public.runner_verification_documents
         WHERE id = $1
           AND runner_id = $2
         FOR UPDATE`,
        [documentId, runnerId],
      );

    const document = documentResult.rows[0];

    if (!document) {
      throw new ReviewError(
        "Runner verification document was not found.",
        404,
      );
    }

    if (document.review_status !== "pending") {
      throw new ReviewError(
        "Only pending documents can receive a new review decision. The Runner must submit a replacement document when resubmission is required.",
        409,
      );
    }

    await client.query(
      `INSERT INTO public.runner_admin_document_reviews (
         document_id,
         runner_id,
         admin_user_id,
         previous_review_status,
         new_review_status,
         rejection_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        documentId,
        runnerId,
        adminId,
        document.review_status,
        decision,
        decision === "approved" ? null : reason,
      ],
    );

    if (decision === "approved") {
      await client.query(
        `UPDATE public.runner_verification_documents
         SET
           review_status = 'approved',
           rejection_reason = NULL,
           reviewed_at = now(),
           reviewed_by = $2
         WHERE id = $1
           AND runner_id = $3`,
        [documentId, adminId, runnerId],
      );
    } else {
      await client.query(
        `UPDATE public.runner_verification_documents
         SET
           review_status = $2,
           rejection_reason = $3,
           reviewed_at = now(),
           reviewed_by = $4
         WHERE id = $1
           AND runner_id = $5`,
        [
          documentId,
          decision,
          reason,
          adminId,
          runnerId,
        ],
      );

      // Queue the real R2 object for deletion.
      // Its review record remains in PostgreSQL.
      queuedDeletion = await queueDocumentDeletion(client, {
        document,
        adminId,
        reason:
          decision === "rejected"
            ? "document_rejected"
            : "resubmission_required",
      });

      // Return the application to a state requiring Runner action.
      await client.query(
        `UPDATE public.runner_accounts
         SET
           verification_status = 'pending',
           verification_reviewed_at = NULL,
           verification_reviewed_by = NULL,
           verification_rejection_reason = $2,
           updated_at = now()
         WHERE id = $1`,
        [runnerId, reason],
      );
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (cause instanceof ReviewError) {
      return errorResponse(
        cause.message,
        cause.status,
        cause.details,
      );
    }

    console.error(
      "[SaMi Admin] Runner document review failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown database error.",
    );

    return errorResponse(
      "Runner document review could not be completed.",
      503,
    );
  } finally {
    client.release();
  }

  const storageCleanup = queuedDeletion
    ? await processStorageDeletions([queuedDeletion])
    : {
        deleted: 0,
        pending: 0,
      };

  return successResponse({
    runnerId,
    documentId,
    decision,
    storageCleanup,
    message:
      decision === "approved"
        ? "Document approved and retained in storage."
        : decision === "rejected"
          ? "Document rejected and queued for removal from storage."
          : "Resubmission requested. The previous document was queued for removal from storage.",
  });
}

/**
 * Allows an already queued R2 deletion to be retried.
 * The queue remains the source of truth until deletion succeeds.
 */
export async function retryRunnerDocumentStorageDeletions(
  request: Request,
) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin storage cleanup requests are not allowed.",
      403,
    );
  }

  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const pool = databasePool();

  try {
    const result = await pool.query<PendingDeletion>(
      `SELECT id, storage_key
       FROM public.runner_document_storage_deletions
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 50`,
    );

    const storageCleanup =
      await processStorageDeletions(result.rows);

    return successResponse({
      storageCleanup,
      message: "Runner document storage cleanup retry completed.",
    });
  } catch (cause) {
    console.error(
      "[SaMi Admin] Runner storage cleanup retry failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown database error.",
    );

    return errorResponse(
      "Pending Runner document storage deletions could not be processed.",
      503,
    );
  }
}