import "server-only";

export type Coordinates = { lat: number; lng: number };
export type RoadRoute = {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  coordinates: [number, number][];
  provider: "google-routes" | "osrm";
};

function validPoint(point: Coordinates) {
  return Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;
}

function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0; shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

function durationSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/s$/, ""));
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

export async function getRoadRoute(from: Coordinates, to: Coordinates): Promise<RoadRoute> {
  if (!validPoint(from) || !validPoint(to)) throw new Error("Both route coordinates must be valid latitude/longitude values.");

  const googleKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (googleKey) {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        polylineQuality: "OVERVIEW",
        polylineEncoding: "ENCODED_POLYLINE",
      }),
    });
    const body = await response.json().catch(() => ({}));
    const route = body?.routes?.[0];
    if (!response.ok || !route?.distanceMeters || !route?.polyline?.encodedPolyline) {
      throw new Error(body?.error?.message || "Google Routes could not calculate a driving route.");
    }
    const distanceMeters = Number(route.distanceMeters);
    const coordinates = decodePolyline(String(route.polyline.encodedPolyline));
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || coordinates.length < 2) {
      throw new Error("The route provider returned an invalid route.");
    }
    return { distanceMeters, distanceKm: distanceMeters / 1000, durationSeconds: durationSeconds(route.duration), coordinates, provider: "google-routes" };
  }

  const base = (process.env.MAP_ROUTING_BASE_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
  const url = new URL(base + "/route/v1/driving/" + from.lng + "," + from.lat + ";" + to.lng + "," + to.lat);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => ({}));
  const route = body?.routes?.[0];
  if (!response.ok || body?.code !== "Ok" || !route?.geometry?.coordinates?.length) {
    throw new Error(body?.message || "Road routing is temporarily unavailable.");
  }
  const distanceMeters = Number(route.distance);
  const coordinates = (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || coordinates.length < 2) {
    throw new Error("The route provider returned an invalid route.");
  }
  return { distanceMeters, distanceKm: distanceMeters / 1000, durationSeconds: durationSeconds(route.duration), coordinates, provider: "osrm" };
}

export async function geocodeAddress(address: string): Promise<{ point: Coordinates; label: string; provider: "google-geocoding" | "nominatim" }> {
  const query = address.trim().slice(0, 250);
  if (query.length < 3) throw new Error("Enter at least three characters for the location search.");

  const googleKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (googleKey) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", googleKey);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const body = await response.json().catch(() => ({}));
    const result = body?.results?.[0];
    if (!response.ok || body?.status !== "OK" || !result?.geometry?.location) {
      throw new Error(result?.formatted_address || body?.error_message || "Google Maps could not find this address.");
    }
    return {
      point: { lat: Number(result.geometry.location.lat), lng: Number(result.geometry.location.lng) },
      label: String(result.formatted_address || query).slice(0, 300),
      provider: "google-geocoding",
    };
  }

  // Nominatim is used only for a user-triggered search (never autocomplete).
  // Keep requests low-volume; configure a commercial/self-hosted endpoint for production scale.
  const base = (process.env.MAP_GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
  const url = new URL(base + "/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const headers: Record<string, string> = { "Accept-Language": "en", "User-Agent": "SaMi-Errands/1.0" };
  if (process.env.MAP_CONTACT_EMAIL) headers["From"] = process.env.MAP_CONTACT_EMAIL;
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => []);
  const result = Array.isArray(body) ? body[0] : null;
  if (!response.ok || !result) throw new Error("No matching location was found. Choose it directly on the map or check the address.");
  const point = { lat: Number(result.lat), lng: Number(result.lon) };
  if (!validPoint(point)) throw new Error("The geocoding service returned an invalid location.");
  return { point, label: String(result.display_name || query).slice(0, 300), provider: "nominatim" };
}
