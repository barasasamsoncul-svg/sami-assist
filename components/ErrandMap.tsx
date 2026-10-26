"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LocationPoint = { lat: number; lng: number };
export type CalculatedRoadRoute = { distanceKm: number; durationMinutes: number };

type Props = {
  mode: "pick" | "track";
  pickup: LocationPoint | null;
  destination: LocationPoint | null;
  provider: LocationPoint | null;
  onPickupChange?: (point: LocationPoint, label?: string) => void;
  onDestinationChange?: (point: LocationPoint, label?: string) => void;
  onRouteCalculated?: (route: CalculatedRoadRoute | null) => void;
};

declare global {
  interface Window {
    L?: any;
    __samiLeafletPromise?: Promise<void>;
  }
}

const DEFAULT_CENTER: [number, number] = [-1.286389, 36.817223];

function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps are only available in a browser."));
  if (window.L) return Promise.resolve();
  if (window.__samiLeafletPromise) return window.__samiLeafletPromise;

  window.__samiLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-sami-leaflet="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.samiLeaflet = "true";
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-sami-leaflet="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("The map library could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.samiLeaflet = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      window.__samiLeafletPromise = undefined;
      reject(new Error("The map library could not be loaded. Check the connection and try again."));
    };
    document.head.appendChild(script);
  });
  return window.__samiLeafletPromise;
}

function pointLabel(point: LocationPoint | null) {
  if (!point) return "Not selected";
  return point.lat.toFixed(5) + ", " + point.lng.toFixed(5);
}

export default function ErrandMap({
  mode,
  pickup,
  destination,
  provider,
  onPickupChange,
  onDestinationChange,
  onRouteCalculated,
}: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const routeLineRef = useRef<any>(null);
  const movedRef = useRef(false);
  const selectedStopRef = useRef<"pickup" | "destination">("pickup");
  const callbacksRef = useRef({ onPickupChange, onDestinationChange, onRouteCalculated });
  const pointsRef = useRef({ pickup, destination, provider, mode });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [activeStop, setActiveStop] = useState<"pickup" | "destination">("pickup");
  const [searchText, setSearchText] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState("");
  const [routeInfo, setRouteInfo] = useState<CalculatedRoadRoute | null>(null);

  useEffect(() => {
    callbacksRef.current = { onPickupChange, onDestinationChange, onRouteCalculated };
  }, [onPickupChange, onDestinationChange, onRouteCalculated]);
  useEffect(() => {
    pointsRef.current = { pickup, destination, provider, mode };
  }, [pickup, destination, provider, mode]);
  useEffect(() => {
    selectedStopRef.current = activeStop;
  }, [activeStop]);

  const applyPoint = useCallback((stop: "pickup" | "destination", point: LocationPoint, label?: string) => {
    if (stop === "pickup") callbacksRef.current.onPickupChange?.(point, label);
    else callbacksRef.current.onDestinationChange?.(point, label);
    setMapStatus((stop === "pickup" ? "Pickup" : "Destination") + " location selected.");
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    loadLeaflet().then(() => {
      if (cancelled || !mapElement.current || !window.L) return;
      const L = window.L;
      map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true }).setView(DEFAULT_CENTER, 12);
      const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      map.on("movestart", () => { movedRef.current = true; });
      map.on("click", (event: any) => {
        const current = pointsRef.current;
        if (current.mode !== "pick") return;
        const point = { lat: Number(event.latlng.lat), lng: Number(event.latlng.lng) };
        applyPoint(selectedStopRef.current, point);
      });
      mapRef.current = map;
      setMapError("");
      setMapReady(true);
      window.setTimeout(() => map?.invalidateSize(true), 120);
    }).catch(error => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : "Unable to load the map.");
    });
    return () => {
      cancelled = true;
      setMapReady(false);
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
      markersRef.current = {};
      routeLineRef.current = null;
    };
  }, [applyPoint]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L || !mapReady) return;
    const current = { pickup, destination, provider };
    const configs: Array<{ key: string; point: LocationPoint | null; label: string; color: string; glyph: string; draggable: boolean }> = [
      { key: "pickup", point: current.pickup, label: "Pickup", color: "#16836d", glyph: "P", draggable: mode === "pick" },
      { key: "destination", point: current.destination, label: "Drop-off", color: "#d97706", glyph: "D", draggable: mode === "pick" },
      { key: "provider", point: current.provider, label: "Provider live location", color: "#2b5cff", glyph: "↗", draggable: false },
    ];

    for (const config of configs) {
      const oldMarker = markersRef.current[config.key];
      if (!config.point) {
        if (oldMarker) { map.removeLayer(oldMarker); delete markersRef.current[config.key]; }
        continue;
      }
      if (!oldMarker) {
        const icon = L.divIcon({
          className: "sami-map-marker",
          html: '<span style="--marker-color:' + config.color + '">' + config.glyph + '</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const marker = L.marker([config.point.lat, config.point.lng], { icon, draggable: config.draggable, title: config.label })
          .addTo(map)
          .bindPopup(config.label);
        if (config.draggable) {
          marker.on("dragend", (event: any) => {
            const latlng = event.target.getLatLng();
            applyPoint(config.key as "pickup" | "destination", { lat: Number(latlng.lat), lng: Number(latlng.lng) });
          });
        }
        markersRef.current[config.key] = marker;
      } else {
        oldMarker.setLatLng([config.point.lat, config.point.lng]);
        oldMarker.setOpacity(1);
      }
    }

    const displayPoints = configs.filter(c => c.point).map(c => [c.point!.lat, c.point!.lng]);
    if (!movedRef.current && displayPoints.length === 1) map.setView(displayPoints[0], 15);
    if (!movedRef.current && displayPoints.length > 1) {
      const bounds = L.latLngBounds(displayPoints);
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
    }
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, provider?.lat, provider?.lng, mode, mapReady, applyPoint, pickup, destination, provider]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L || !mapReady) return;
    let aborted = false;
    const hasRoute = Boolean(pickup && destination);
    if (!hasRoute) {
      if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
      setRouteInfo(null);
      callbacksRef.current.onRouteCalculated?.(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          action: "route",
          fromLat: String(pickup!.lat),
          fromLng: String(pickup!.lng),
          toLat: String(destination!.lat),
          toLng: String(destination!.lng),
        });
        const response = await fetch("/api/location?" + params.toString(), { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !body.route) throw new Error(body.error || "Road route not available.");
        if (aborted) return;
        const route = body.route;
        const coords = (route.coordinates || []).map((p: [number, number]) => [Number(p[0]), Number(p[1])]);
        if (coords.length < 2) throw new Error("The road route did not include a path.");
        if (routeLineRef.current) map.removeLayer(routeLineRef.current);
        routeLineRef.current = L.polyline(coords, { color: "#2b5cff", weight: 5, opacity: 0.82, lineCap: "round", lineJoin: "round" }).addTo(map);
        const calculated = { distanceKm: Number(route.distanceKm), durationMinutes: Math.max(1, Math.round(Number(route.durationSeconds || 0) / 60)) };
        setRouteInfo(calculated);
        callbacksRef.current.onRouteCalculated?.(calculated);
        setMapStatus("Road route calculated from the selected points.");
        if (!movedRef.current) map.fitBounds(routeLineRef.current.getBounds().pad(0.18), { maxZoom: 15 });
      } catch (error) {
        if (aborted) return;
        setRouteInfo(null);
        callbacksRef.current.onRouteCalculated?.(null);
        setMapStatus(error instanceof Error ? error.message : "Unable to calculate a road route.");
      }
    }, 450);
    return () => { aborted = true; window.clearTimeout(timer); };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, mapReady]);

  async function searchAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "pick" || searchBusy) return;
    setSearchBusy(true);
    setMapStatus("");
    try {
      const params = new URLSearchParams({ action: "geocode", q: searchText.trim() });
      const response = await fetch("/api/location?" + params.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.point) throw new Error(body.error || "Location search failed.");
      applyPoint(activeStop, body.point, body.label);
      setSearchText(body.label || searchText);
      mapRef.current?.setView([body.point.lat, body.point.lng], 16);
      markersRef.current[activeStop]?.openPopup();
    } catch (error) {
      setMapStatus(error instanceof Error ? error.message : "Location search failed.");
    } finally {
      setSearchBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setMapStatus("This browser does not support location access."); return; }
    setLocationBusy(true);
    setMapStatus("");
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      applyPoint(activeStop, point, "Current device location");
      mapRef.current?.setView([point.lat, point.lng], 16);
      setLocationBusy(false);
    }, error => {
      setMapStatus(error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Allow location access in your browser and try again."
        : "Could not determine your location. Move to an area with better GPS reception and retry.");
      setLocationBusy(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }

  const selectedPoint = activeStop === "pickup" ? pickup : destination;

  return (
    <section className={"errand-map-card" + (mode === "track" ? " errand-map-card--tracking" : "")}>
      <div className="errand-map-heading">
        <div>
          <h3>{mode === "pick" ? "Choose locations on the map" : "Live errand map"}</h3>
          <p>{mode === "pick" ? "Search a place, use your location, or click and drag either marker. Road distance updates the service fee." : "Shows the pickup, destination and latest provider location shared from their device."}</p>
        </div>
        {mode === "pick" && <button type="button" className="map-location-button" onClick={useMyLocation} disabled={locationBusy}>{locationBusy ? "Finding you…" : "◎ Use my location"}</button>}
      </div>
      {mode === "pick" && (
        <div className="map-pick-toolbar">
          <button type="button" className={activeStop === "pickup" ? "map-stop-choice active" : "map-stop-choice"} onClick={() => setActiveStop("pickup")}><span className="map-stop-dot pickup"></span><span><b>Pickup</b><small>{pointLabel(pickup)}</small></span></button>
          <button type="button" className={activeStop === "destination" ? "map-stop-choice active" : "map-stop-choice"} onClick={() => setActiveStop("destination")}><span className="map-stop-dot destination"></span><span><b>Drop-off</b><small>{pointLabel(destination)}</small></span></button>
        </div>
      )}
      {mode === "pick" && (
        <form className="map-search-form" onSubmit={searchAddress}>
          <input aria-label="Search for a pickup or destination" value={searchText} onChange={event => setSearchText(event.target.value)} maxLength={250} placeholder="Search a street, building or landmark…" />
          <button type="submit" disabled={searchBusy || searchText.trim().length < 3}>{searchBusy ? "Searching…" : "Find location"}</button>
        </form>
      )}
      <div className="errand-map-frame">
        {!mapReady && !mapError && <div className="errand-map-loading">Loading interactive map…</div>}
        {mapError && <div className="errand-map-error">{mapError}</div>}
        <div ref={mapElement} className="errand-map-canvas" aria-label="Interactive map showing errand locations" />
      </div>
      <div className="errand-map-footer">
        <div className="map-legend"><span><i className="pickup"></i> Pickup</span><span><i className="destination"></i> Drop-off</span>{mode === "track" && <span><i className="provider"></i> Provider</span>}</div>
        {mode === "pick" && routeInfo ? <div className="map-route-stats"><b>{routeInfo.distanceKm.toFixed(1)} km road distance</b><span>About {routeInfo.durationMinutes} min by road</span></div> : null}
        {mode === "track" && <div className="map-route-stats"><b>{provider ? "Provider location available" : "Waiting for provider GPS"}</b><span>{provider ? "Coordinates: " + pointLabel(provider) : "The provider must share location while the task is active."}</span></div>}
      </div>
      {mapStatus && <p className="errand-map-status" role="status">{mapStatus}</p>}
      <p className="map-attribution-note">Map data © OpenStreetMap contributors · {mode === "pick" ? "Click the map to set the selected stop." : "Location is only visible to people authorised to view this errand."}</p>
    </section>
  );
}
