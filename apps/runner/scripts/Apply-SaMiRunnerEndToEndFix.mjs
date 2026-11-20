import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const STAMP = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function replaceOnce(source, oldText, newText, label) {
  const input = normalize(oldText);
  const output = normalize(newText);
  const count = source.split(input).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one match for '${label}', found ${count}.`);
  }
  return source.replace(input, output);
}

function requireText(source, value, label) {
  if (!source.includes(value)) {
    throw new Error(`The current ${label} does not match the reviewed source revision.`);
  }
}

function loadText(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required file is missing: ${relativePath}`);
  }
  const original = fs.readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    original,
    newline: original.includes("\r\n") ? "\r\n" : "\n",
    text: normalize(original),
  };
}

const staged = new Map();

function stageText(relativePath, transform) {
  const file = loadText(relativePath);
  const next = transform(file.text);
  if (next === file.text) {
    throw new Error(`No changes were produced for ${relativePath}.`);
  }
  staged.set(relativePath, {
    ...file,
    next: file.newline === "\r\n" ? next.replace(/\n/g, "\r\n") : next,
  });
}

const availabilityRoute = `import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

function optionalNumber(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= minimum && value <= maximum ? value : null;
}

function readLocation(value: unknown): RunnerLocation | null {
  if (!isRecord(value)) return null;
  const latitude = value.latitude;
  const longitude = value.longitude;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: optionalNumber(value.accuracy, 0, 10000),
    heading: optionalNumber(value.heading, 0, 360),
    speed: optionalNumber(value.speed, 0, 150),
  };
}

export async function POST(request: Request) {
  try {
    // Restricted accounts may still go offline. Permission to go online
    // is checked again under the account lock below.
    const auth = await authenticateRunner(request, {
      allowRestricted: true,
    });
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.isOnline !== "boolean") {
      return errorResponse("Choose whether you want to go online or offline.");
    }

    const location = body.isOnline ? readLocation(body.location) : null;
    if (body.isOnline && !location) {
      return errorResponse("A valid current GPS location is required before going online.");
    }

    const client = await databasePool().connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      // All availability and acceptance operations lock the account first.
      // This serializes GO changes against concurrent errand acceptance.
      const accountResult = await client.query<{
        account_status: string;
        verification_status: string;
        full_name: string | null;
        service_area: string | null;
        vehicle_type: string | null;
      }>(
        \`SELECT
           a.account_status,
           a.verification_status,
           a.full_name,
           rp.service_area,
           rp.vehicle_type
         FROM public.runner_accounts AS a
         LEFT JOIN public.runner_profiles AS rp
           ON rp.runner_id = a.id
         WHERE a.id = $1
         FOR UPDATE OF a\`,
        [auth.runner.id],
      );

      const account = accountResult.rows[0];
      if (!account) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse("Runner account could not be found.", 404);
      }

      const activeResult = await client.query<{ id: string; status: string }>(
        \`SELECT id, status
         FROM public.runner_jobs
         WHERE accepted_runner_id = $1
           AND status IN ('accepted', 'in_progress', 'completion_submitted')
         ORDER BY accepted_at DESC
         LIMIT 1
         FOR UPDATE\`,
        [auth.runner.id],
      );
      const activeJob = activeResult.rows[0] ?? null;

      if (body.isOnline) {
        const profileIsComplete =
          typeof account.full_name === "string" && account.full_name.trim().length > 0 &&
          typeof account.service_area === "string" && account.service_area.trim().length > 0 &&
          typeof account.vehicle_type === "string" && account.vehicle_type.trim().length > 0;

        const isEligible =
          account.account_status === "active" &&
          account.verification_status === "approved" &&
          profileIsComplete;

        if (!isEligible) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Your profile and verification must be approved before you can go online.",
            403,
          );
        }

        if (activeJob) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Finish your current errand and wait for customer confirmation before going online for another errand.",
            409,
          );
        }
      } else if (activeJob && activeJob.status !== "completion_submitted") {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse(
          "You cannot go offline while an errand is in progress.",
          409,
        );
      }

      const result = await client.query<{
        is_online: boolean;
        last_heartbeat_at: string | null;
      }>(
        \`INSERT INTO public.runner_availability (
           runner_id, is_online, last_heartbeat_at, updated_at
         )
         VALUES (
           $1,
           $2,
           CASE WHEN $2 THEN now() ELSE NULL END,
           now()
         )
         ON CONFLICT (runner_id)
         DO UPDATE SET
           is_online = EXCLUDED.is_online,
           last_heartbeat_at = CASE
             WHEN EXCLUDED.is_online THEN now()
             ELSE runner_availability.last_heartbeat_at
           END,
           updated_at = now()
         RETURNING is_online, last_heartbeat_at\`,
        [auth.runner.id, body.isOnline],
      );

      if (body.isOnline && location) {
        await client.query(
          \`INSERT INTO public.runner_presence_locations (
             runner_id, latitude, longitude, accuracy_meters,
             heading_degrees, speed_meters_per_second, captured_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (runner_id)
           DO UPDATE SET
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             accuracy_meters = EXCLUDED.accuracy_meters,
             heading_degrees = EXCLUDED.heading_degrees,
             speed_meters_per_second = EXCLUDED.speed_meters_per_second,
             captured_at = now()\`,
          [
            auth.runner.id,
            location.latitude,
            location.longitude,
            location.accuracy,
            location.heading,
            location.speed,
          ],
        );
      } else {
        await client.query(
          "DELETE FROM public.runner_presence_locations WHERE runner_id = $1",
          [auth.runner.id],
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        {
          ok: true,
          availability: {
            isOnline: result.rows[0].is_online,
            lastHeartbeatAt: result.rows[0].last_heartbeat_at,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      return errorResponse("Your availability could not be updated.", 503);
    } finally {
      client.release();
    }
  } catch {
    return errorResponse("Your availability could not be updated.", 503);
  }
}
`;

const locationRoute = `import { NextResponse } from "next/server";

import { authenticateRunner } from "@/apps/runner/server/auth";
import { databasePool } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalNumber(value: unknown, minimum: number, maximum: number): number | null {
  const number = finiteNumber(value);
  if (number === null || number < minimum || number > maximum) return null;
  return number;
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (auth.response) return auth.response;

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return errorResponse("A location update is required.");

    const latitude = finiteNumber(body.latitude);
    const longitude = finiteNumber(body.longitude);
    const accuracy = optionalNumber(body.accuracy, 0, 10000);
    const heading = optionalNumber(body.heading, 0, 360);
    const speed = optionalNumber(body.speed, 0, 150);

    if (
      latitude === null || longitude === null ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return errorResponse("The supplied coordinates are invalid.");
    }

    const client = await databasePool().connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      const accountResult = await client.query<{
        account_status: string;
        verification_status: string;
      }>(
        \`SELECT account_status, verification_status
         FROM public.runner_accounts
         WHERE id = $1
         FOR UPDATE\`,
        [auth.runner.id],
      );
      const account = accountResult.rows[0];

      if (!account) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse("Runner account could not be found.", 404);
      }

      const availabilityResult = await client.query<{ is_online: boolean }>(
        \`SELECT is_online
         FROM public.runner_availability
         WHERE runner_id = $1
         FOR UPDATE\`,
        [auth.runner.id],
      );
      const isOnline = availabilityResult.rows[0]?.is_online === true;

      const activeResult = await client.query<{ id: string; status: string }>(
        \`SELECT id, status
         FROM public.runner_jobs
         WHERE accepted_runner_id = $1
           AND status IN ('accepted', 'in_progress', 'completion_submitted')
         ORDER BY accepted_at DESC
         LIMIT 1
         FOR UPDATE\`,
        [auth.runner.id],
      );
      const activeJob = activeResult.rows[0] ?? null;

      if (activeJob?.status === "completion_submitted") {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return errorResponse(
          "Live location sharing pauses while the customer confirms your completed errand.",
          409,
        );
      }

      if (activeJob && (activeJob.status === "accepted" || activeJob.status === "in_progress")) {
        if (account.account_status !== "active" || account.verification_status !== "approved") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse("Your account is not authorised to share errand location.", 403);
        }

        await client.query(
          \`INSERT INTO public.runner_live_locations (
             runner_id, job_id, latitude, longitude, accuracy_meters,
             heading_degrees, speed_meters_per_second, captured_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (runner_id)
           DO UPDATE SET
             job_id = EXCLUDED.job_id,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             accuracy_meters = EXCLUDED.accuracy_meters,
             heading_degrees = EXCLUDED.heading_degrees,
             speed_meters_per_second = EXCLUDED.speed_meters_per_second,
             captured_at = now()\`,
          [auth.runner.id, activeJob.id, latitude, longitude, accuracy, heading, speed],
        );

        await client.query(
          "DELETE FROM public.runner_presence_locations WHERE runner_id = $1",
          [auth.runner.id],
        );
      } else {
        if (
          !isOnline ||
          account.account_status !== "active" ||
          account.verification_status !== "approved"
        ) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return errorResponse(
            "Location can only be shared while you are online or completing an active errand.",
            409,
          );
        }

        await client.query(
          \`INSERT INTO public.runner_presence_locations (
             runner_id, latitude, longitude, accuracy_meters,
             heading_degrees, speed_meters_per_second, captured_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (runner_id)
           DO UPDATE SET
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             accuracy_meters = EXCLUDED.accuracy_meters,
             heading_degrees = EXCLUDED.heading_degrees,
             speed_meters_per_second = EXCLUDED.speed_meters_per_second,
             captured_at = now()\`,
          [auth.runner.id, latitude, longitude, accuracy, heading, speed],
        );
      }

      await client.query(
        "UPDATE public.runner_availability SET last_heartbeat_at = now(), updated_at = now() WHERE runner_id = $1",
        [auth.runner.id],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        { ok: true, receivedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      return errorResponse("Your location could not be updated.", 503);
    } finally {
      client.release();
    }
  } catch {
    return errorResponse("Your location could not be updated.", 503);
  }
}
`;

// apps/runner/src/api.ts
stageText("apps/runner/src/api.ts", (source) => {
  const oldAvailability = `export async function setRunnerAvailability(
  isOnline: boolean,
): Promise<{
  availability: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
}> {
  return apiRequest(
    "/api/runner/me/availability",
    {
      method: "POST",
      body: { isOnline },
    },
  );
}`;
  const nextAvailability = `export type RunnerLocationInput = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
};

export async function setRunnerAvailability(
  isOnline: boolean,
  location?: RunnerLocationInput,
): Promise<{
  availability: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
}> {
  if (isOnline && !location) {
    throw new Error("A current GPS location is required before going online.");
  }

  if (
    location &&
    (!Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      location.latitude < -90 || location.latitude > 90 ||
      location.longitude < -180 || location.longitude > 180)
  ) {
    throw new Error("A valid Runner GPS location is required.");
  }

  const safeOptional = (value: number | null | undefined, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
      ? value
      : null;

  const safeLocation = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: safeOptional(location.accuracy, 0, 10000),
        heading: safeOptional(location.heading, 0, 360),
        speed: safeOptional(location.speed, 0, 150),
      }
    : undefined;

  return apiRequest(
    "/api/runner/me/availability",
    {
      method: "POST",
      body: {
        isOnline,
        ...(safeLocation ? { location: safeLocation } : {}),
      },
    },
  );
}`;
  source = replaceOnce(source, oldAvailability, nextAvailability, "Runner availability API client");

  const oldLocationType = `export async function publishRunnerLocation(input: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}): Promise<void> {`;
  const nextLocationType = `export async function publishRunnerLocation(
  input: RunnerLocationInput,
): Promise<void> {`;
  return replaceOnce(source, oldLocationType, nextLocationType, "Runner live-location API client");
});

// apps/runner/app/(app)/index.tsx
stageText("apps/runner/app/(app)/index.tsx", (source) => {
  source = replaceOnce(
    source,
    `import {
  ActivityIndicator,
  Alert,
  Pressable,`,
    `import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,`,
    "React Native AppState import",
  );

  source = replaceOnce(
    source,
    `  const locateMe = useCallback(async () => {
    if (locationBusy || signingOut) return;

    setLocationBusy(true);
    setError("");

    try {
      const result = await requestCurrentLocation();

      await publishRunnerLocation({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.position.coords.accuracy,
        heading: result.position.coords.heading,
        speed: result.position.coords.speed,
      });
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your location could not be detected.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setLocationBusy(false);
      }
    }
  }, [
    locationBusy,
    signingOut,
    requestCurrentLocation,
  ]);`,
    `  const locateMe = useCallback(async () => {
    if (locationBusy || signingOut) return;

    setLocationBusy(true);
    setError("");

    try {
      const result = await requestCurrentLocation();
      const canShareLocation =
        authorized &&
        (activeJobIsTrackable || (isOnline && !activeJob));

      // GPS recentering is useful while offline too. Only publish when
      // the Runner is online and idle, or has an active tracked errand.
      if (canShareLocation) {
        await publishRunnerLocation({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.position.coords.accuracy,
          heading: result.position.coords.heading,
          speed: result.position.coords.speed,
        });
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your location could not be detected.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setLocationBusy(false);
      }
    }
  }, [
    locationBusy,
    signingOut,
    requestCurrentLocation,
    authorized,
    activeJobIsTrackable,
    isOnline,
    activeJob,
  ]);`,
    "offline-safe locate button",
  );

  source = replaceOnce(
    source,
    `      if (
        !authorized ||
        (!isOnline && !activeJobIsTrackable) ||
        signingOut
      ) {
        return;
      }`,
    `      const canShareLocation =
        activeJobIsTrackable || (isOnline && !activeJob);

      if (!authorized || !canShareLocation || signingOut) {
        return;
      }`,
    "idle Runner presence versus active-trip location guard",
  );

  source = replaceOnce(
    source,
    `      activeJobIsTrackable,
      signingOut,
      updateCurrentLocationName,
    ],`,
    `      activeJobIsTrackable,
      activeJob,
      signingOut,
      updateCurrentLocationName,
    ],`,
    "map-location callback dependencies",
  );

  source = replaceOnce(
    source,
    `      if (!isOnline) {
        const result = await requestCurrentLocation();

        await publishRunnerLocation({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.position.coords.accuracy,
          heading: result.position.coords.heading,
          speed: result.position.coords.speed,
        });
      }

      const result = await setRunnerAvailability(!isOnline);`,
    `      let locationForAvailability: Parameters<typeof setRunnerAvailability>[1] = undefined;

      if (!isOnline) {
        const result = await requestCurrentLocation();
        locationForAvailability = {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.position.coords.accuracy,
          heading: result.position.coords.heading,
          speed: result.position.coords.speed,
        };
      }

      // The server writes online status and the initial presence location
      // in one transaction. Do not call the trip-only location endpoint first.
      const result = await setRunnerAvailability(
        !isOnline,
        locationForAvailability,
      );`,
    "atomic GO online transition",
  );

  source = replaceOnce(
    source,
    `      setCameraFollowing(!isOnline);`,
    `      setCameraFollowing(!isOnline);
      if (!isOnline) {
        await loadDashboard(true);
      }`,
    "refresh offers immediately after going online",
  );

  source = replaceOnce(
    source,
    `    isOnline,
    requestCurrentLocation,
    goToSignedOut,
  ]);`,
    `    isOnline,
    requestCurrentLocation,
    loadDashboard,
    goToSignedOut,
  ]);`,
    "availability callback dependencies",
  );

  source = replaceOnce(
    source,
    `    (!activeJob || activeJob.status === "completion_submitted");`,
    `    (!activeJob || (activeJob.status === "completion_submitted" && isOnline));`,
    "availability button guard during customer confirmation",
  );

  const mountCleanup = `  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* LOCATION                                                            */`;
  const mountWithPolling = `  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Offers and active-trip state must not depend on reopening a screen.
  // Refresh only while this dashboard is focused and the app is foregrounded.
  const shouldPollRunnerJobs = Boolean(
    authorized && (isOnline || activeJob) && !signingOut,
  );

  useEffect(() => {
    if (!shouldPollRunnerJobs) return;

    let disposed = false;
    let requestInFlight = false;

    const refreshRunnerJobs = async () => {
      if (
        disposed ||
        !mountedRef.current ||
        AppState.currentState !== "active" ||
        requestInFlight
      ) {
        return;
      }

      requestInFlight = true;
      try {
        const result = await getRunnerJobs();
        if (disposed || !mountedRef.current) return;

        setJobs({
          offers: Array.isArray(result.offers) ? result.offers : [],
          active: Array.isArray(result.active) ? result.active : [],
        });
      } catch (cause) {
        if (disposed || !mountedRef.current) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Runner errands could not be refreshed.";

        if (isSessionError(message)) {
          goToSignedOut();
        }
        // Transient polling errors are intentionally non-blocking. The next
        // poll or the user's manual refresh can recover without a modal loop.
      } finally {
        requestInFlight = false;
      }
    };

    const timer = setInterval(() => {
      void refreshRunnerJobs();
    }, 20000);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void refreshRunnerJobs();
      },
    );

    return () => {
      disposed = true;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [shouldPollRunnerJobs, goToSignedOut]);

  /* ------------------------------------------------------------------ */
  /* LOCATION                                                            */`;
  source = replaceOnce(source, mountCleanup, mountWithPolling, "foreground Runner offer polling");

  return source;
});

// Runner API handlers. These are complete server-side replacements so the
// online/idle-presence and active-trip location paths cannot be confused.
stageText("app/api/runner/me/availability/route.ts", (source) => {
  requireText(source, "allowRestricted: true", "availability API route");
  requireText(source, "runner_availability", "availability API route");
  return availabilityRoute.trimEnd();
});

stageText("app/api/runner/location/route.ts", (source) => {
  requireText(source, "Location can only be shared during an active errand.", "Runner location API route");
  requireText(source, "runner_live_locations", "Runner location API route");
  return locationRoute.trimEnd();
});

// Prevent a runner from accepting a second task while another is active.
stageText("app/api/runner/jobs/[id]/accept/route.ts", (source) => {
  source = replaceOnce(
    source,
    `    const offerResult = await client.query<{`,
    `    const existingActiveJob = await client.query<{ id: string }>(
      \`SELECT id
       FROM public.runner_jobs
       WHERE accepted_runner_id = $1
         AND status IN ('accepted', 'in_progress', 'completion_submitted')
       LIMIT 1
       FOR UPDATE\`,
      [auth.runner.id],
    );

    if (existingActiveJob.rows[0]) {
      await client.query("ROLLBACK");
      return errorResponse(
        "Complete your current errand and wait for customer confirmation before accepting another.",
        409,
      );
    }

    const offerResult = await client.query<{`,
    "single active Runner errand guard",
  );

  source = replaceOnce(
    source,
    `    await client.query("COMMIT");`,
    `    // A Runner may complete only one errand at a time. Once an offer is
    // accepted, take the account offline for new work while active-trip
    // GPS continues through runner_live_locations.
    await client.query(
      "UPDATE public.runner_availability SET is_online = false, updated_at = now() WHERE runner_id = $1",
      [auth.runner.id],
    );

    await client.query(
      "DELETE FROM public.runner_presence_locations WHERE runner_id = $1",
      [auth.runner.id],
    );

    await client.query("COMMIT");`,
    "clear idle presence after errand acceptance",
  );
  return source;
});

// Stop trip-location retention when the runner submits completion.
stageText("app/api/runner/jobs/[id]/status/route.ts", (source) => {
  source = replaceOnce(
    source,
    `    await client.query("COMMIT");`,
    `    if (transition.to === "completion_submitted") {
      await client.query(
        "DELETE FROM public.runner_live_locations WHERE runner_id = $1 AND job_id = $2",
        [auth.runner.id, id],
      );
    }

    await client.query("COMMIT");`,
    "stop active-trip location after completion submission",
  );
  return source;
});

// Route-level session failures from the Offers screen should return to login,
// not leave a dead card that can no longer accept work.
stageText("apps/runner/app/(app)/runner-section.tsx", (source) => {
  const helperAnchor = `const TITLES: Record<Section, string> = {`;
  requireText(source, helperAnchor, "Runner section screen");
  source = replaceOnce(
    source,
    helperAnchor,
    `function isRunnerSessionError(message: string): boolean {
  return /\\b401\\b|session has expired|sign in to continue/i.test(message);
}

function returnToRunnerSignIn(): void {
  router.dismissAll();
  router.replace({ pathname: "/", params: { signedOut: "1" } });
}

${helperAnchor}`,
    "Runner section session helper",
  );

  source = replaceOnce(
    source,
    `    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Offers could not be loaded.");
    } finally {`,
    `    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Offers could not be loaded.";
      if (isRunnerSessionError(message)) {
        returnToRunnerSignIn();
        return;
      }
      setError(message);
    } finally {`,
    "Offers screen expired-session handling",
  );

  source = replaceOnce(
    source,
    `    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This errand could not be accepted.");
    } finally {`,
    `    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This errand could not be accepted.";
      if (isRunnerSessionError(message)) {
        returnToRunnerSignIn();
        return;
      }
      setError(message);
    } finally {`,
    "errand acceptance expired-session handling",
  );
  return source;
});

const migrationPath = "apps/runner/database/migrations/2026-11-20-runner-online-presence-locations.sql";
const migrationAbsolute = path.join(ROOT, migrationPath);
const migrationSql = `BEGIN;

-- Idle online presence is separate from customer-visible active-trip tracking.
-- runner_live_locations.job_id remains NOT NULL and continues to represent
-- only accepted/in-progress errand movement.
CREATE TABLE IF NOT EXISTS public.runner_presence_locations (
  runner_id uuid PRIMARY KEY
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  latitude double precision NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision
    CHECK (accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 10000),
  heading_degrees double precision
    CHECK (heading_degrees IS NULL OR heading_degrees BETWEEN 0 AND 360),
  speed_meters_per_second double precision
    CHECK (speed_meters_per_second IS NULL OR speed_meters_per_second BETWEEN 0 AND 150),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_presence_locations_captured_idx
  ON public.runner_presence_locations(captured_at DESC);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-20-runner-online-presence-locations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
`;

let migrationAlreadyExists = false;
if (fs.existsSync(migrationAbsolute)) {
  const existing = normalize(fs.readFileSync(migrationAbsolute, "utf8"));
  if (existing !== normalize(migrationSql)) {
    throw new Error(`A different file already exists at ${migrationPath}. Nothing has been written.`);
  }
  migrationAlreadyExists = true;
}

// All transformations and exact-match checks have completed before backups
// or source writes begin.
for (const [relativePath, file] of staged) {
  const backupPath = `${file.absolutePath}.before-e2e-fix-${STAMP}.bak`;
  fs.copyFileSync(file.absolutePath, backupPath);
}

for (const [relativePath, file] of staged) {
  fs.writeFileSync(file.absolutePath, file.next, "utf8");
}

if (!migrationAlreadyExists) {
  fs.mkdirSync(path.dirname(migrationAbsolute), { recursive: true });
  fs.writeFileSync(
    migrationAbsolute,
    staged.get("apps/runner/src/api.ts")?.newline === "\r\n"
      ? migrationSql.replace(/\n/g, "\r\n")
      : migrationSql,
    "utf8",
  );
}

console.log("SaMi Runner end-to-end fixes applied successfully.");
console.log(`Updated source files: ${staged.size}`);
console.log("Backups created beside every modified source file with suffix:");
console.log(`  .before-e2e-fix-${STAMP}.bak`);
console.log(migrationAlreadyExists ? "Presence-location migration already exists and matches." : `Added Runner database migration: ${migrationPath}`);
console.log("No GitHub files were changed by this script.");
console.log("No EAS profiles, credentials, signing identities, project IDs or update channels were changed.");
