
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getCurrentUser } from "@/lib/auth";
import { databasePool, query } from "@/lib/db";
import { getRoadRoute, type Coordinates } from "@/lib/location";
import { ensureErrandLocationSchema } from "@/lib/errand-location-schema";
import { createR2ReadUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_LOCATION_LENGTH = 300;
const MAX_NOTES_LENGTH = 1000;
const MAX_BUDGET = 100_000_000;

type GroceryPreferredTime = "asap" | "scheduled";
type GroceryPaymentMethod = "cash" | "in_app";

type GroceryRequestBody = {
  title?: unknown;
  description?: unknown;
  serviceArea?: unknown;
  pickupLocation?: unknown;
  pickupLatitude?: unknown;
  pickupLongitude?: unknown;
  destinationLocation?: unknown;
  destinationLatitude?: unknown;
  destinationLongitude?: unknown;
  preferredTime?: unknown;
  scheduledTime?: unknown;
  purchaseBudgetAmount?: unknown;
  customerNotes?: unknown;
  servicePaymentMethod?: unknown;
};

type PricingRule = {
  category: string;
  base_fee: string | number;
  commission_rate: string | number;
  standard_priority_multiplier: string | number;
  distance_rate_per_km: string | number;
  medium_item_fee: string | number;
};

type GroceryPhotoRow = {
  id: string;
  storage_key: string;
  content_type: string;
};

function error(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isNativeClient(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function parseCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum
  ) {
    return null;
  }

  return number;
}

/**
 * Returns a complete coordinate pair or null.
 *
 * Returning the object as a unit ensures TypeScript knows that
 * both latitude and longitude are numbers after validation.
 */
function parseCoordinatePair(
  latitudeValue: unknown,
  longitudeValue: unknown,
): Coordinates | null {
  const lat = parseCoordinate(latitudeValue, -90, 90);
  const lng = parseCoordinate(longitudeValue, -180, 180);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function parseBudget(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MAX_BUDGET
  ) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function randomPublicCode() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  return (
    "SE-" +
    date +
    "-" +
    randomBytes(3).toString("hex").toUpperCase()
  );
}

function calculateGroceryServiceFee(
  rule: PricingRule,
  distanceKm: number,
) {
  const baseFee = Number(rule.base_fee);
  const distanceRate = Number(rule.distance_rate_per_km);
  const mediumItemFee = Number(rule.medium_item_fee);
  const priorityMultiplier = Number(
    rule.standard_priority_multiplier,
  );
  const commissionRate = Number(rule.commission_rate);

  const values = [
    baseFee,
    distanceRate,
    mediumItemFee,
    priorityMultiplier,
    commissionRate,
  ];

  if (
    values.some((value) => !Number.isFinite(value)) ||
    baseFee < 0 ||
    distanceRate < 0 ||
    mediumItemFee < 0 ||
    priorityMultiplier <= 0 ||
    commissionRate < 0 ||
    commissionRate > 100
  ) {
    throw new Error("GROCERY_PRICING_CONFIGURATION_INVALID");
  }

  // The customer's shopping budget is not a SaMi fee surcharge.
  const distanceFeeRaw = distanceKm * distanceRate;
  const itemSizeFeeRaw = mediumItemFee;

  const serviceFee = Math.round(
    (baseFee + distanceFeeRaw + itemSizeFeeRaw) *
      priorityMultiplier,
  );

  const distanceFee =
    Math.round(
      distanceFeeRaw * priorityMultiplier * 100,
    ) / 100;

  const itemSizeFee =
    Math.round(
      itemSizeFeeRaw * priorityMultiplier * 100,
    ) / 100;

  const commission =
    Math.round(serviceFee * commissionRate) / 100;

  const providerEarning =
    Math.round((serviceFee - commission) * 100) / 100;

  return {
    serviceFee,
    baseFee,
    distanceFee,
    itemSizeFee,
    commissionRate,
    commission,
    providerEarning,
  };
}

async function authenticateCustomer(request: Request) {
  if (!isNativeClient(request)) {
    return {
      user: null,
      response: error(
        "Grocery requests are available through the SaMi customer app.",
        403,
      ),
    };
  }

  const user = await getCurrentUser(request).catch(
    () => null,
  );

  if (!user) {
    return {
      user: null,
      response: error("Sign in to continue.", 401),
    };
  }

  if (user.role !== "customer") {
    return {
      user: null,
      response: error(
        "Only customer accounts can create grocery errands.",
        403,
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

async function grocerySchemaReady() {
  try {
    const result = await query<{ ready: boolean }>(
      `SELECT
         to_regclass('public.grocery_errand_details') IS NOT NULL
         AND to_regclass('public.grocery_errand_photos') IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'grocery_errand_details'
             AND column_name = 'preferred_time'
         )
         AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'grocery_errand_details'
             AND column_name = 'scheduled_time'
         )
         AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'grocery_errand_details'
             AND column_name = 'customer_notes'
         ) AS ready`,
    );

    return Boolean(result.rows[0]?.ready);
  } catch {
    return false;
  }
}

/**
 * GET /api/groceries
 *
 * Returns the authenticated customer's grocery errands.
 * Photo URLs are temporary signed R2 URLs.
 */
export async function GET(request: Request) {
  const auth = await authenticateCustomer(request);

  if (auth.response) {
    return auth.response;
  }

  const user = auth.user;

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  try {
    if (!(await grocerySchemaReady())) {
      return error(
        "Grocery database migrations are not fully applied.",
        503,
      );
    }

    const result = await query(
      `SELECT
         e.id,
         e.public_code,
         e.title,
         e.category,
         e.description,
         e.pickup_location,
         e.destination_location,
         e.service_area,
         e.due_at,
         e.distance_km,
         e.service_fee_amount,
         e.currency,
         e.priority,
         e.status,
         e.service_payment_method,
         e.payment_status,
         e.completion_notes,
         e.cancellation_reason,
         e.accepted_at,
         e.started_at,
         e.completed_at,
         e.created_at,
         e.updated_at,

         gd.preferred_time,
         gd.scheduled_time,
         gd.purchase_budget_amount,
         gd.customer_notes,
         gd.workflow_status

       FROM public.errands AS e
       JOIN public.grocery_errand_details AS gd
         ON gd.errand_id = e.id

       WHERE e.customer_id = $1
         AND e.category = 'groceries'

       ORDER BY e.created_at DESC
       LIMIT 100`,
      [user.id],
    );

    const orders = await Promise.all(
      result.rows.map(async (order) => {
        const photosResult = await query<GroceryPhotoRow>(
          `SELECT id, storage_key, content_type
           FROM public.grocery_errand_photos
           WHERE errand_id = $1
             AND uploaded_by = $2
           ORDER BY created_at ASC`,
          [order.id, user.id],
        );

        const photos = await Promise.all(
          photosResult.rows.map(async (photo) => ({
            id: photo.id,
            url: await createR2ReadUrl(photo.storage_key),
            content_type: photo.content_type,
          })),
        );

        return {
          ...order,
          photos,
        };
      }),
    );

    return NextResponse.json(
      { orders },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi groceries] Customer orders retrieval failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "Your grocery errands are temporarily unavailable.",
      503,
    );
  }
}

/**
 * POST /api/groceries
 *
 * Creates a customer grocery errand using the shared errand record
 * and the grocery-specific preference record.
 *
 * Photos are uploaded after creation through:
 * /api/groceries/[errandId]/photos
 */
export async function POST(request: Request) {
  const auth = await authenticateCustomer(request);

  if (auth.response) {
    return auth.response;
  }

  const user = auth.user;

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  let body: GroceryRequestBody;

  try {
    const parsed: unknown = await request.json();

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return error("A valid grocery request is required.");
    }

    body = parsed as GroceryRequestBody;
  } catch {
    return error("The grocery request body is invalid.");
  }

  const title = cleanText(body.title, 160);
  const description = cleanText(
    body.description,
    MAX_DESCRIPTION_LENGTH,
  );
  const serviceArea = cleanText(
    body.serviceArea,
    MAX_LOCATION_LENGTH,
  );

  const pickupLocation = cleanText(
    body.pickupLocation,
    MAX_LOCATION_LENGTH,
  );

  const destinationLocation = cleanText(
    body.destinationLocation,
    MAX_LOCATION_LENGTH,
  );

  if (title.length < 3) {
    return error("Enter a clear title for your grocery errand.");
  }

  if (description.length < 5) {
    return error("Describe what you need your runner to do.");
  }

  if (
    typeof body.description === "string" &&
    body.description.trim().length > MAX_DESCRIPTION_LENGTH
  ) {
    return error(
      `Task instructions cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }

  if (!serviceArea) {
    return error("Select a service area.");
  }

  if (!pickupLocation || !destinationLocation) {
    return error("Enter both pickup and drop-off locations.");
  }

  const pickupPoint = parseCoordinatePair(
    body.pickupLatitude,
    body.pickupLongitude,
  );

  const destinationPoint = parseCoordinatePair(
    body.destinationLatitude,
    body.destinationLongitude,
  );

  if (!pickupPoint || !destinationPoint) {
    return error(
      "Choose valid pickup and drop-off points on the map.",
    );
  }

  const preferredTime: GroceryPreferredTime | null =
    body.preferredTime === "scheduled"
      ? "scheduled"
      : body.preferredTime === "asap"
        ? "asap"
        : null;

  if (!preferredTime) {
    return error("Select your preferred errand time.");
  }

  const scheduledTime =
    preferredTime === "scheduled"
      ? cleanText(body.scheduledTime, 120)
      : null;

  if (
    preferredTime === "scheduled" &&
    (!scheduledTime || scheduledTime.length < 2)
  ) {
    return error("Enter your preferred date and time.");
  }

  const budgetWasProvided =
    body.purchaseBudgetAmount !== "" &&
    body.purchaseBudgetAmount !== null &&
    body.purchaseBudgetAmount !== undefined;

  const purchaseBudgetAmount = parseBudget(
    body.purchaseBudgetAmount,
  );

  if (budgetWasProvided && purchaseBudgetAmount === null) {
    return error(
      "Enter a valid optional budget greater than zero.",
    );
  }

  const customerNotes = cleanText(
    body.customerNotes,
    MAX_NOTES_LENGTH,
  );

  if (
    typeof body.customerNotes === "string" &&
    body.customerNotes.trim().length > MAX_NOTES_LENGTH
  ) {
    return error(
      `Additional notes cannot exceed ${MAX_NOTES_LENGTH} characters.`,
    );
  }

  const servicePaymentMethod: GroceryPaymentMethod =
    body.servicePaymentMethod === "in_app"
      ? "in_app"
      : "cash";

  let roadRoute;

  try {
    roadRoute = await getRoadRoute(
      pickupPoint,
      destinationPoint,
    );
  } catch (cause) {
    console.error(
      "[SaMi groceries] Route calculation failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "SaMi could not calculate the road route. Check both locations and try again.",
      502,
    );
  }

  if (
    !Number.isFinite(roadRoute.distanceKm) ||
    roadRoute.distanceKm <= 0 ||
    roadRoute.distanceKm > 500
  ) {
    return error(
      "The calculated route is outside the supported errand distance.",
    );
  }

  try {
    await ensureErrandLocationSchema();
  } catch (cause) {
    console.error(
      "[SaMi groceries] Errand location schema is not ready.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "SaMi location services are not ready. Apply the errand location migration.",
      503,
    );
  }

  if (!(await grocerySchemaReady())) {
    return error(
      "Grocery database migrations are not fully applied. Apply the grocery errand, preferences and photo migrations.",
      503,
    );
  }

  const pricingResult = await query<PricingRule>(
    `SELECT
       category,
       base_fee,
       commission_rate,
       standard_priority_multiplier,
       distance_rate_per_km,
       medium_item_fee
     FROM public.service_pricing
     WHERE category = 'groceries'
       AND enabled = true
     LIMIT 1`,
  ).catch(() => null);

  const pricingRule = pricingResult?.rows[0];

  if (!pricingRule) {
    return error(
      "Grocery pricing is not configured yet. Enable the groceries service pricing rule before accepting requests.",
      503,
    );
  }

  let price: ReturnType<typeof calculateGroceryServiceFee>;

  try {
    price = calculateGroceryServiceFee(
      pricingRule,
      roadRoute.distanceKm,
    );
  } catch {
    return error(
      "Grocery pricing configuration is invalid. Review the service pricing settings.",
      503,
    );
  }

  const publicCode = randomPublicCode();
  const client = await databasePool().connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const createdResult = await client.query<{
      id: string;
      public_code: string;
      service_fee_amount: string | number;
    }>(
      `INSERT INTO public.errands (
         public_code,
         customer_id,
         title,
         category,
         description,

         pickup_location,
         destination_location,
         service_area,

         pickup_latitude,
         pickup_longitude,
         destination_latitude,
         destination_longitude,

         route_distance_meters,
         route_duration_seconds,
         distance_km,

         item_size,
         distance_fee_amount,
         item_size_fee_amount,
         value_surcharge_amount,

         budget_amount,
         item_budget_amount,

         service_fee_amount,
         commission_rate,
         commission_amount,
         provider_earning_amount,

         currency,
         priority,
         status,
         service_payment_method,
         payment_status
       )
       VALUES (
         $1, $2, $3, 'groceries', $4,
         $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14,
         'medium', $15, $16, 0,
         $17, $17,
         $18, $19, $20, $21,
         'KES', 'standard', 'requested', $22, 'unpaid'
       )
       RETURNING id, public_code, service_fee_amount`,
      [
        publicCode,
        user.id,
        title,
        description,

        pickupLocation,
        destinationLocation,
        serviceArea,

        pickupPoint.lat,
        pickupPoint.lng,
        destinationPoint.lat,
        destinationPoint.lng,

        roadRoute.distanceMeters,
        roadRoute.durationSeconds,
        roadRoute.distanceKm,

        price.distanceFee,
        price.itemSizeFee,

        purchaseBudgetAmount,

        price.serviceFee,
        price.commissionRate,
        price.commission,
        price.providerEarning,

        servicePaymentMethod,
      ],
    );

    const createdErrand = createdResult.rows[0];

    if (!createdErrand?.id) {
      throw new Error("GROCERY_ERRAND_INSERT_FAILED");
    }

    const detailsResult = await client.query<{
      workflow_status: string;
    }>(
      `INSERT INTO public.grocery_errand_details (
         errand_id,
         purchase_budget_amount,
         preferred_time,
         scheduled_time,
         customer_notes
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING workflow_status`,
      [
        createdErrand.id,
        purchaseBudgetAmount,
        preferredTime,
        scheduledTime,
        customerNotes || null,
      ],
    );

    const workflowStatus =
      detailsResult.rows[0]?.workflow_status;

    if (!workflowStatus) {
      throw new Error("GROCERY_DETAILS_INSERT_FAILED");
    }

    await client.query(
      `INSERT INTO public.errand_events (
         errand_id,
         actor_id,
         event_type,
         from_status,
         to_status,
         note,
         metadata
       )
       VALUES (
         $1,
         $2,
         'grocery_request_created',
         NULL,
         'requested',
         $3,
         $4::jsonb
       )`,
      [
        createdErrand.id,
        user.id,
        "Customer submitted a grocery errand request.",
        JSON.stringify({
          category: "groceries",
          preferredTime,
          distanceKm: roadRoute.distanceKm,
          routeProvider: roadRoute.provider,
        }),
      ],
    );

    const admins = await client.query<{ id: string }>(
      `SELECT id
       FROM public.users
       WHERE role = 'admin'
         AND is_active = true`,
    );

    for (const admin of admins.rows) {
      await client.query(
        `INSERT INTO public.notifications (
           user_id,
           kind,
           title,
           body,
           href,
           entity_type,
           entity_id
         )
         VALUES (
           $1,
           'new_grocery_errand',
           'New grocery errand',
           $2,
           '/',
           'errand',
           $3
         )`,
        [
          admin.id,
          `${publicCode} · A customer submitted a grocery errand request.`,
          createdErrand.id,
        ],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        errand: {
          id: createdErrand.id,
          public_code: createdErrand.public_code,
          service_fee_amount: Number(
            createdErrand.service_fee_amount,
          ),
        },
        grocery: {
          workflowStatus,
        },
        price: {
          serviceFee: price.serviceFee,
          distanceKm: roadRoute.distanceKm,
        },
        paymentNotice:
          "Your grocery errand has been submitted. The shopping budget is separate from SaMi's service fee.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
    }

    console.error(
      "[SaMi groceries] Errand creation failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return error(
      "Your grocery errand could not be created. Check that the grocery database migrations and pricing configuration have been applied.",
      503,
    );
  } finally {
    client.release();
  }
}
