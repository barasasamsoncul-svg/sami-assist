import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { geocodeAddress, getRoadRoute } from "@/lib/location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const finiteCoordinate = (value: string | null, min: number, max: number) => {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in to use SaMi location tools." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const action = params.get("action");
  try {
    if (action === "route") {
      const fromLat = finiteCoordinate(params.get("fromLat"), -90, 90);
      const fromLng = finiteCoordinate(params.get("fromLng"), -180, 180);
      const toLat = finiteCoordinate(params.get("toLat"), -90, 90);
      const toLng = finiteCoordinate(params.get("toLng"), -180, 180);
      if ([fromLat, fromLng, toLat, toLng].some(value => value === null)) {
        return NextResponse.json({ error: "Provide valid pickup and destination coordinates." }, { status: 400 });
      }
      const route = await getRoadRoute(
        { lat: fromLat as number, lng: fromLng as number },
        { lat: toLat as number, lng: toLng as number },
      );
      return NextResponse.json({ route });
    }

    if (action === "geocode") {
      const query = params.get("q") || "";
      if (query.trim().length < 3) return NextResponse.json({ error: "Enter a longer address or landmark." }, { status: 400 });
      const result = await geocodeAddress(query);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown location action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Location service unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
