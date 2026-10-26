import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../components/ErrandMap.tsx", import.meta.url), "utf8");
const locations = readFileSync(new URL("../lib/location.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/location/route.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../app/api/dispatch/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../lib/errand-location-schema.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ErrandsApp.tsx", import.meta.url), "utf8");
const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("the errands request form offers map-picked pickup and drop-off points", () => {
  assert.ok(map.includes("Choose locations on the map"));
  assert.ok(map.includes("onPickupChange"));
  assert.ok(map.includes("onDestinationChange"));
  assert.ok(map.includes("Use my location"));
  assert.ok(map.includes("dragstart"));
  assert.ok(map.includes("tile.openstreetmap.org"));
  assert.ok(map.includes("OpenStreetMap contributors"));
  assert.ok(ui.includes('name="pickupLatitude"'));
  assert.ok(ui.includes('name="destinationLongitude"'));
  assert.ok(ui.includes("<ErrandMap"));
});

test("road routing is server-calculated and supports free or configured providers", () => {
  assert.ok(locations.includes("https://router.project-osrm.org"));
  assert.ok(locations.includes("MAP_ROUTING_BASE_URL"));
  assert.ok(locations.includes("GOOGLE_ROUTES_API_KEY"));
  assert.ok(locations.includes("routes.googleapis.com/directions/v2:computeRoutes"));
  assert.ok(locations.includes("distanceMeters"));
  assert.ok(api.includes('action === "route"'));
  assert.ok(dispatch.includes("const route = await getRoadRoute"));
  assert.ok(dispatch.includes("distanceKm = Math.round(route.distanceKm * 100) / 100"));
  assert.ok(dispatch.includes("route_distance_meters"));
  assert.ok(dispatch.includes("route_duration_seconds"));
});

test("address lookup is explicit, supports Google/Nominatim, and does not rely on autocomplete", () => {
  assert.ok(locations.includes("https://nominatim.openstreetmap.org"));
  assert.ok(locations.includes("GOOGLE_GEOCODING_API_KEY"));
  assert.ok(locations.includes("user-triggered search"));
  assert.ok(api.includes('action === "geocode"'));
  assert.ok(map.includes("searchAddress"));
  assert.ok(map.includes("Find location"));
});

test("provider GPS is restricted to the assigned provider during an active errand", () => {
  assert.ok(dispatch.includes('action === "updateProviderLocation"'));
  assert.ok(dispatch.includes('user.role !== "provider"'));
  assert.ok(dispatch.includes("errand.provider_id !== user.id"));
  assert.ok(dispatch.includes('["accepted","in_progress"].includes(errand.status)'));
  assert.ok(dispatch.includes("ON CONFLICT(errand_id) DO UPDATE"));
  assert.ok(dispatch.includes("LEFT JOIN errand_live_locations live"));
  assert.ok(ui.includes("navigator.geolocation.watchPosition"));
  assert.ok(ui.includes("updateProviderLocation"));
});

test("location schema migration is additive and does not need credentials to run", () => {
  for (const field of ["pickup_latitude","pickup_longitude","destination_latitude","destination_longitude","route_distance_meters","route_duration_seconds"]) {
    assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS " + field));
    assert.ok(schema.includes(field));
  }
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS errand_live_locations"));
  assert.ok(migration.includes("2026-10-26-sami-errands-location-tracking"));
});

test("map and payment configuration is documented outside committed secrets", () => {
  for (const key of ["NEXT_PUBLIC_MAP_TILE_URL","MAP_ROUTING_BASE_URL","MAP_GEOCODING_BASE_URL","GOOGLE_ROUTES_API_KEY","GOOGLE_GEOCODING_API_KEY","GOOGLE_MAPS_API_KEY","MPESA_CONSUMER_KEY","MPESA_CONSUMER_SECRET"]) {
    assert.ok(env.includes(key), "missing environment variable: " + key);
  }
  assert.ok(ignore.split(/\r?\n/).includes(".env"));
  assert.ok(ignore.split(/\r?\n/).includes(".env.*"));
  assert.ok(env.includes("https://tile.openstreetmap.org/{z}/{x}/{y}.png"));
});
