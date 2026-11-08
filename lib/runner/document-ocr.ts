
import "server-only";

import { createSign } from "node:crypto";

export type RunnerContentDecision =
  | "passed"
  | "manual_review"
  | "rejected";

export type RunnerContentCheck = {
  provider: "google-document-ai" | "google-vision";
  decision: RunnerContentDecision;
  reasonCodes: string[];
  qualityScore: number | null;
  pageCount: number;
  detectedSignalCount: number;
  message: string;
};

type ServiceAccountCredentials = {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type AccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type DocumentAiPage = {
  pageNumber?: number;
  imageQualityScores?: {
    qualityScore?: number;
    detectedDefects?: Array<{
      type?: string;
      confidence?: number;
    }>;
  };
};

type DocumentAiResponse = {
  document?: {
    text?: string;
    pages?: DocumentAiPage[];
  };
  error?: {
    message?: string;
    code?: number;
  };
};

type VisionResponse = {
  responses?: Array<{
    faceAnnotations?: Array<{
      detectionConfidence?: number;
    }>;
    error?: {
      message?: string;
      code?: number;
    };
  }>;
};

type DocumentRule = {
  minimumTextLength: number;
  minimumSignals: number;
  signals: string[];
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CLOUD_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

const ACCESS_TOKEN_EARLY_REFRESH_SECONDS = 120;
const GOOGLE_REQUEST_TIMEOUT_MS = 45_000;
const MINIMUM_DOCUMENT_QUALITY = 0.5;
const REVIEW_DOCUMENT_QUALITY = 0.65;

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;
let accessTokenRequest: Promise<string> | null = null;

export class RunnerOcrConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerOcrConfigurationError";
  }
}

export class RunnerOcrServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerOcrServiceError";
  }
}

function getRequiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new RunnerOcrConfigurationError(
      `Missing server configuration: ${name}`,
    );
  }

  return value;
}

function getServiceAccountCredentials(): ServiceAccountCredentials {
  const raw = getRequiredEnvironmentValue(
    "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON",
  );

  let credentials: ServiceAccountCredentials;

  try {
    credentials = JSON.parse(raw) as ServiceAccountCredentials;
  } catch {
    throw new RunnerOcrConfigurationError(
      "Google Cloud service account configuration is not valid JSON.",
    );
  }

  if (
    credentials.type !== "service_account" ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new RunnerOcrConfigurationError(
      "Google Cloud service account configuration is incomplete.",
    );
  }

  return credentials;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function createGoogleAccessToken(): Promise<string> {
  const credentials = getServiceAccountCredentials();

  const now = Math.floor(Date.now() / 1000);

  const header = encodeBase64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );

  const claims = encodeBase64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_CLOUD_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const unsignedToken = `${header}.${claims}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(credentials.private_key!)
    .toString("base64url");

  const assertion = `${unsignedToken}.${signature}`;

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new RunnerOcrServiceError(
      "Google Cloud authentication is temporarily unavailable.",
    );
  }

  const payload = (await response.json().catch(
    () => ({}),
  )) as AccessTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new RunnerOcrServiceError(
      "Google Cloud authentication failed. Check the service account permissions and configuration.",
    );
  }

  const expiresIn =
    typeof payload.expires_in === "number"
      ? payload.expires_in
      : 3600;

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiry =
    Date.now() + expiresIn * 1000;

  return cachedAccessToken;
}

async function getGoogleAccessToken(): Promise<string> {
  const stillValid =
    cachedAccessToken &&
    Date.now() <
      cachedAccessTokenExpiry -
        ACCESS_TOKEN_EARLY_REFRESH_SECONDS * 1000;

  if (stillValid) {
    return cachedAccessToken!;
  }

  if (!accessTokenRequest) {
    accessTokenRequest = createGoogleAccessToken().finally(
      () => {
        accessTokenRequest = null;
      },
    );
  }

  return accessTokenRequest;
}

function getDocumentAiConfiguration() {
  const projectId = getRequiredEnvironmentValue(
    "GOOGLE_CLOUD_PROJECT_ID",
  );

  const location = getRequiredEnvironmentValue(
    "GOOGLE_DOCUMENT_AI_LOCATION",
  );

  const processorId = getRequiredEnvironmentValue(
    "GOOGLE_DOCUMENT_AI_PROCESSOR_ID",
  );

  if (!/^[a-z0-9][a-z0-9-]*$/i.test(location)) {
    throw new RunnerOcrConfigurationError(
      "Google Document AI location is invalid.",
    );
  }

  if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
    throw new RunnerOcrConfigurationError(
      "Google Cloud project ID is invalid.",
    );
  }

  if (!/^[a-zA-Z0-9-]+$/.test(processorId)) {
    throw new RunnerOcrConfigurationError(
      "Google Document AI processor ID is invalid.",
    );
  }

  return {
    endpoint:
      `https://${location}-documentai.googleapis.com/v1/` +
      `projects/${encodeURIComponent(projectId)}/` +
      `locations/${encodeURIComponent(location)}/` +
      `processors/${encodeURIComponent(processorId)}:process`,
  };
}

function normalizeOcrText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatchingSignals(
  normalizedText: string,
  signals: string[],
): number {
  return signals.filter((signal) =>
    normalizedText.includes(signal),
  ).length;
}

const DOCUMENT_RULES: Record<string, DocumentRule> = {
  national_id_front: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "REPUBLIC OF KENYA",
      "JAMHURI YA KENYA",
      "IDENTITY CARD",
      "NATIONAL IDENTITY",
      "NATIONAL ID",
      "KITAMBULISHO",
      "ID NO",
      "ID NUMBER",
      "SERIAL NO",
      "SERIAL NUMBER",
    ],
  },

  national_id_back: {
    minimumTextLength: 8,
    minimumSignals: 1,
    signals: [
      "FINGERPRINT",
      "THUMBPRINT",
      "PLACE OF ISSUE",
      "DISTRICT OF BIRTH",
      "DATE OF ISSUE",
      "ISSUING OFFICER",
      "IDENTITY CARD",
      "NATIONAL ID",
      "SERIAL NUMBER",
      "SERIAL NO",
      "SIGNATURE",
    ],
  },

  driving_licence: {
    minimumTextLength: 18,
    minimumSignals: 2,
    signals: [
      "DRIVING LICENCE",
      "DRIVING LICENSE",
      "LICENCE NO",
      "LICENSE NO",
      "LICENCE NUMBER",
      "LICENSE NUMBER",
      "DL NO",
      "DRIVER",
      "NTSA",
      "VEHICLE CLASS",
      "EXPIRY DATE",
    ],
  },

  vehicle_registration: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "LOGBOOK",
      "CERTIFICATE OF REGISTRATION",
      "MOTOR VEHICLE",
      "CHASSIS NUMBER",
      "CHASSIS NO",
      "ENGINE NUMBER",
      "ENGINE NO",
      "REGISTERED OWNER",
      "VEHICLE REGISTRATION",
      "REGISTRATION NUMBER",
      "REGISTRATION NO",
      "NTSA",
    ],
  },

  motor_vehicle_insurance: {
    minimumTextLength: 25,
    minimumSignals: 2,
    signals: [
      "INSURANCE",
      "CERTIFICATE OF INSURANCE",
      "POLICY NO",
      "POLICY NUMBER",
      "COVER NOTE",
      "PREMIUM",
      "INSURER",
      "POLICYHOLDER",
      "MOTOR VEHICLE",
    ],
  },

  vehicle_authorisation: {
    minimumTextLength: 25,
    minimumSignals: 2,
    signals: [
      "AUTHORISATION",
      "AUTHORIZATION",
      "I HEREBY AUTHORISE",
      "I HEREBY AUTHORIZE",
      "CONSENT",
      "PERMISSION",
      "REGISTERED OWNER",
      "VEHICLE REGISTRATION",
      "OWNER",
    ],
  },

  vehicle_inspection: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "INSPECTION",
      "ROADWORTHINESS",
      "INSPECTION CERTIFICATE",
      "MOTOR VEHICLE",
      "NTSA",
      "VEHICLE",
    ],
  },

  food_handling_certificate: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "FOOD HANDLER",
      "FOOD HANDLING",
      "HEALTH CERTIFICATE",
      "PUBLIC HEALTH",
      "MEDICAL CERTIFICATE",
      "COUNTY",
      "MEDICAL EXAMINATION",
    ],
  },

  professional_qualification: {
    minimumTextLength: 25,
    minimumSignals: 2,
    signals: [
      "CERTIFICATE",
      "DIPLOMA",
      "DEGREE",
      "QUALIFICATION",
      "TRAINING",
      "INSTITUTE",
      "UNIVERSITY",
      "TVET",
      "NITA",
      "EXAMINATION",
    ],
  },

  pet_care_qualification: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "VETERINARY",
      "ANIMAL HEALTH",
      "ANIMAL CARE",
      "PET CARE",
      "LIVESTOCK",
      "CERTIFICATE",
      "DIPLOMA",
      "QUALIFICATION",
    ],
  },

  business_permit: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "BUSINESS PERMIT",
      "SINGLE BUSINESS PERMIT",
      "COUNTY GOVERNMENT",
      "TRADING LICENCE",
      "TRADING LICENSE",
      "PERMIT NUMBER",
      "BUSINESS NAME",
    ],
  },

  certificate_of_good_conduct: {
    minimumTextLength: 20,
    minimumSignals: 2,
    signals: [
      "CERTIFICATE OF GOOD CONDUCT",
      "DIRECTORATE OF CRIMINAL INVESTIGATIONS",
      "CRIMINAL INVESTIGATIONS",
      "CRIMINAL RECORDS",
      "KENYA POLICE",
      "FINGERPRINT",
      "DCI",
    ],
  },
};

function classifyDocument(
  documentType: string,
  text: string,
): {
  decision: RunnerContentDecision;
  reasonCode: string | null;
  signalCount: number;
  message: string;
} {
  const normalizedText = normalizeOcrText(text);

  if (normalizedText.length < 12) {
    return {
      decision: "rejected",
      reasonCode: "insufficient_readable_text",
      signalCount: 0,
      message:
        "We could not read enough information from this document. Retake the photo in good lighting and make sure the full document is visible.",
    };
  }

  if (documentType === "other") {
    if (normalizedText.length >= 40) {
      return {
        decision: "manual_review",
        reasonCode: "generic_document_type",
        signalCount: 0,
        message:
          "The document text was extracted. SaMi Operations must confirm that it is the correct supporting document.",
      };
    }

    return {
      decision: "rejected",
      reasonCode: "insufficient_document_content",
      signalCount: 0,
      message:
        "The uploaded document does not contain enough readable information.",
    };
  }

  const rule = DOCUMENT_RULES[documentType];

  if (!rule) {
    return {
      decision: "rejected",
      reasonCode: "unsupported_document_type",
      signalCount: 0,
      message:
        "This document requirement has no content-validation rule configured. Contact SaMi support.",
    };
  }

  if (normalizedText.length < rule.minimumTextLength) {
    return {
      decision: "rejected",
      reasonCode: "insufficient_document_content",
      signalCount: 0,
      message:
        "The document does not contain enough readable text. Retake the photo with the full document in focus.",
    };
  }

  const signalCount = countMatchingSignals(
    normalizedText,
    rule.signals,
  );

  if (signalCount >= rule.minimumSignals) {
    return {
      decision: "passed",
      reasonCode: null,
      signalCount,
      message:
        "The document content and expected document type were detected. It will still be reviewed by SaMi Operations.",
    };
  }

  if (signalCount > 0) {
    return {
      decision: "manual_review",
      reasonCode: "document_type_needs_review",
      signalCount,
      message:
        "Some expected document details were detected, but the document type could not be confirmed automatically. SaMi Operations must review it.",
    };
  }

  return {
    decision: "rejected",
    reasonCode: "document_type_mismatch",
    signalCount: 0,
    message:
      "The uploaded content does not match the selected document requirement. Upload the correct document.",
  };
}

async function callDocumentAi(
  bytes: Uint8Array,
  mimeType: string,
): Promise<DocumentAiResponse> {
  const { endpoint } = getDocumentAiConfiguration();
  const accessToken = await getGoogleAccessToken();

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        rawDocument: {
          content: Buffer.from(bytes).toString("base64"),
          mimeType,
        },
        processOptions: {
          ocrConfig: {
            enableNativePdfParsing: true,
            enableImageQualityScores: true,
            hints: {
              languageHints: ["en"],
            },
          },
        },
        fieldMask:
          "text,pages.pageNumber,pages.imageQualityScores",
      }),
      signal: AbortSignal.timeout(
        GOOGLE_REQUEST_TIMEOUT_MS,
      ),
      cache: "no-store",
    });
  } catch {
    throw new RunnerOcrServiceError(
      "Document OCR is temporarily unavailable. Please try again.",
    );
  }

  const payload = (await response.json().catch(
    () => ({}),
  )) as DocumentAiResponse;

  if (!response.ok || payload.error) {
    // Do not expose the provider's raw response or document
    // content to the Runner application or application logs.
    throw new RunnerOcrServiceError(
      "Document OCR could not process this upload. Please try again.",
    );
  }

  if (!payload.document) {
    throw new RunnerOcrServiceError(
      "Document OCR returned an invalid response.",
    );
  }

  return payload;
}

async function checkProfilePhoto(
  bytes: Uint8Array,
  mimeType: string,
): Promise<RunnerContentCheck> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      mimeType,
    )
  ) {
    return {
      provider: "google-vision",
      decision: "rejected",
      reasonCodes: ["profile_photo_must_be_an_image"],
      qualityScore: null,
      pageCount: 1,
      detectedSignalCount: 0,
      message:
        "A profile photo must be a JPEG, PNG or WEBP image.",
    };
  }

  const accessToken = await getGoogleAccessToken();

  let response: Response;

  try {
    response = await fetch(
      "https://vision.googleapis.com/v1/images:annotate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: Buffer.from(bytes).toString("base64"),
              },
              features: [
                {
                  type: "FACE_DETECTION",
                  maxResults: 5,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(
          GOOGLE_REQUEST_TIMEOUT_MS,
        ),
        cache: "no-store",
      },
    );
  } catch {
    throw new RunnerOcrServiceError(
      "Profile photo verification is temporarily unavailable.",
    );
  }

  const payload = (await response.json().catch(
    () => ({}),
  )) as VisionResponse;

  const firstResult = payload.responses?.[0];

  if (!response.ok || firstResult?.error) {
    throw new RunnerOcrServiceError(
      "Profile photo verification could not process this image.",
    );
  }

  const faces = firstResult?.faceAnnotations ?? [];

  if (faces.length === 0) {
    return {
      provider: "google-vision",
      decision: "rejected",
      reasonCodes: ["no_face_detected"],
      qualityScore: null,
      pageCount: 1,
      detectedSignalCount: 0,
      message:
        "We could not detect a clear face. Upload a recent photo showing your face directly, with good lighting.",
    };
  }

  if (faces.length > 1) {
    return {
      provider: "google-vision",
      decision: "rejected",
      reasonCodes: ["multiple_faces_detected"],
      qualityScore: null,
      pageCount: 1,
      detectedSignalCount: faces.length,
      message:
        "Your profile photo must show one person only. Choose a photo with just yourself.",
    };
  }

  const confidence = faces[0].detectionConfidence ?? 0;

  if (confidence < 0.8) {
    return {
      provider: "google-vision",
      decision: "manual_review",
      reasonCodes: ["face_detection_uncertain"],
      qualityScore: confidence,
      pageCount: 1,
      detectedSignalCount: 1,
      message:
        "A possible face was detected, but automatic verification was inconclusive. SaMi Operations must review this photo.",
    };
  }

  return {
    provider: "google-vision",
    decision: "passed",
    reasonCodes: [],
    qualityScore: confidence,
    pageCount: 1,
    detectedSignalCount: 1,
    message:
      "One face was detected in the profile photo. SaMi Operations will still review it.",
  };
}

export async function checkRunnerDocumentContent(input: {
  requirementKey: string;
  documentType: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<RunnerContentCheck> {
  if (
    !input.bytes.byteLength ||
    !input.mimeType ||
    !input.documentType
  ) {
    return {
      provider: "google-document-ai",
      decision: "rejected",
      reasonCodes: ["invalid_document_input"],
      qualityScore: null,
      pageCount: 0,
      detectedSignalCount: 0,
      message:
        "The selected document could not be checked. Select it again and retry.",
    };
  }

  if (input.documentType === "profile_photo") {
    return checkProfilePhoto(
      input.bytes,
      input.mimeType,
    );
  }

  const supportedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!supportedMimeTypes.has(input.mimeType)) {
    return {
      provider: "google-document-ai",
      decision: "rejected",
      reasonCodes: ["unsupported_document_format"],
      qualityScore: null,
      pageCount: 0,
      detectedSignalCount: 0,
      message:
        "Upload a PDF, JPEG, PNG or WEBP document.",
    };
  }

  const result = await callDocumentAi(
    input.bytes,
    input.mimeType,
  );

  const document = result.document!;
  const text = document.text ?? "";
  const pages = document.pages ?? [];

  if (pages.length === 0) {
    return {
      provider: "google-document-ai",
      decision: "rejected",
      reasonCodes: ["no_document_pages_detected"],
      qualityScore: null,
      pageCount: 0,
      detectedSignalCount: 0,
      message:
        "No readable document page was detected. Retake the photo or choose another file.",
    };
  }

  if (pages.length > 15) {
    return {
      provider: "google-document-ai",
      decision: "rejected",
      reasonCodes: ["too_many_document_pages"],
      qualityScore: null,
      pageCount: pages.length,
      detectedSignalCount: 0,
      message:
        "This document has too many pages. Upload only the pages required for this verification.",
    };
  }

  const qualityScores = pages
    .map((page) => page.imageQualityScores?.qualityScore)
    .filter(
      (score): score is number =>
        typeof score === "number" &&
        Number.isFinite(score),
    );

  const averageQuality =
    qualityScores.length > 0
      ? qualityScores.reduce(
          (sum, score) => sum + score,
          0,
        ) / qualityScores.length
      : null;

  if (
    averageQuality !== null &&
    averageQuality < MINIMUM_DOCUMENT_QUALITY
  ) {
    const defectCodes = pages.flatMap(
      (page) =>
        page.imageQualityScores?.detectedDefects
          ?.filter(
            (defect) =>
              (defect.confidence ?? 0) > 0.5 &&
              typeof defect.type === "string",
          )
          .map((defect) =>
            defect.type!.replace(/^quality\//, ""),
          ) ?? [],
    );

    const reasons = [
      "poor_document_image_quality",
      ...new Set(defectCodes),
    ];

    return {
      provider: "google-document-ai",
      decision: "rejected",
      reasonCodes: reasons,
      qualityScore: averageQuality,
      pageCount: pages.length,
      detectedSignalCount: 0,
      message:
        "This document is too blurry, dark, faint or cropped to verify. Retake it in good lighting and include all document edges.",
    };
  }

  const classification = classifyDocument(
    input.documentType,
    text,
  );

  const reasonCodes = classification.reasonCode
    ? [classification.reasonCode]
    : [];

  let decision = classification.decision;
  let message = classification.message;

  if (averageQuality === null) {
    if (decision === "passed") {
      decision = "manual_review";
      reasonCodes.push("quality_score_unavailable");
      message =
        "The document type was detected, but image quality could not be scored automatically. SaMi Operations must review it.";
    }
  } else if (
    averageQuality < REVIEW_DOCUMENT_QUALITY &&
    decision === "passed"
  ) {
    decision = "manual_review";
    reasonCodes.push("borderline_document_quality");
    message =
      "The document appears to match this requirement, but its image quality needs a manual check.";
  }

  return {
    provider: "google-document-ai",
    decision,
    reasonCodes,
    qualityScore: averageQuality,
    pageCount: pages.length,
    detectedSignalCount: classification.signalCount,
    message,
  };
}
