"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { api } from "@/lib/api/client";
import type { Feature, ToiletPin, ToiletTier } from "@/lib/api/types";
import type { LatLng } from "@/lib/location";
import { useResolvedTheme } from "@/lib/theme";
import { PIN_PATH, PinGlyph, ROLL_BODY, ROLL_TAIL } from "../pin";
import { cx } from "../ui";
import { MAP_GROUND, TINT_TILES, ensureTintProtocol } from "./tint";

/** [west, south, east, north] */
export const SG_BOUNDS: [number, number, number, number] = [103.55, 1.15, 104.15, 1.49];

const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

ensureTintProtocol();

function basemap(dark: boolean): StyleSpecification {
  const theme = dark ? "dark" : "light";
  return {
    version: 8,
    sources: {
      onemap: {
        type: "raster",
        // Grey keeps OneMap's MRT exits and bus glyphs quiet so the toilets lead; tint.ts recolours it in chocolate.
        tiles: [
          TINT_TILES
            ? `sgw-tint://${theme}/{z}/{x}/{y}`
            : `https://www.onemap.gov.sg/maps/tiles/${dark ? "Night" : "Grey"}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        minzoom: 11,
        maxzoom: 19,
        attribution: ONEMAP_ATTRIBUTION,
      },
    },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": MAP_GROUND[theme] } },
      { id: "onemap", type: "raster", source: "onemap" },
    ],
  };
}

/*
 * MapLibre paint can't read CSS variables, so the pin colours are repeated
 * here for both themes (DESIGN.md, The Literal Map Colour Rule).
 */
const PIN_COLORS = {
  light: { tier: "#8a4b23", onTier: "#ffffff", bg: "#f2d3b1", surface: "#fff5ea", imported: "#ecc7a2", importedInk: "#6a3f22", rim: "#2a160b", danger: "#b42318", urgent: "#c62f16" },
  dark: { tier: "#f0a85e", onTier: "#2a1508", bg: "#1e120b", surface: "#352114", imported: "#cdb79e", importedInk: "#1e120b", rim: "#fff1e0", danger: "#ff7a6b", urgent: "#ff5a3c" },
};

const PIN_PX = 80; // drawn at 2x, shown at 40 css px

/** Draws the toilet-roll pin for a tier onto a canvas (synchronously, so styleimagemissing can use it). */
function drawPin(tier: ToiletTier, dark: boolean): ImageData | null {
  if (typeof document === "undefined") return null;
  const c = dark ? PIN_COLORS.dark : PIN_COLORS.light;
  const s =
    tier === "VERIFIED"
      ? { pin: c.tier, stroke: c.bg, sw: 3, roll: c.onTier }
      : tier === "COMMUNITY"
        ? { pin: c.surface, stroke: c.tier, sw: 5, roll: c.tier }
        : { pin: c.imported, stroke: c.importedInk, sw: 2, roll: "#8a4b23" };
  const canvas = document.createElement("canvas");
  canvas.width = PIN_PX;
  canvas.height = PIN_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Leave room for the shadow.
  ctx.translate(PIN_PX * 0.06, PIN_PX * 0.02);
  ctx.scale((PIN_PX * 0.88) / 64, (PIN_PX * 0.88) / 64);
  ctx.lineJoin = "round";
  const pin = new Path2D(PIN_PATH);
  // Outer rim (cream on the night map, ink on the grey one) with a firm shadow, so pins beat the basemap icons.
  ctx.save();
  ctx.shadowColor = "rgba(10, 5, 2, 0.55)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  ctx.lineWidth = s.sw + 5;
  ctx.strokeStyle = c.rim;
  ctx.stroke(pin);
  ctx.restore();
  ctx.fillStyle = s.pin;
  ctx.fill(pin);
  ctx.lineWidth = s.sw;
  ctx.strokeStyle = s.stroke;
  ctx.stroke(pin);
  ctx.fillStyle = s.roll;
  ctx.fill(new Path2D(ROLL_BODY));
  ctx.fill(new Path2D(ROLL_TAIL));
  ctx.beginPath();
  ctx.ellipse(32, 21, 12, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = s.pin;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = s.roll;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(32, 21, 3.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = s.roll;
  ctx.fill();
  return ctx.getImageData(0, 0, PIN_PX, PIN_PX);
}

const TIERS: ToiletTier[] = ["VERIFIED", "COMMUNITY", "IMPORTED"];

function addPinImages(m: MlMap, dark: boolean) {
  for (const tier of TIERS) {
    const id = `pin-${tier}`;
    if (m.hasImage(id)) continue;
    const img = drawPin(tier, dark);
    if (img) m.addImage(id, img, { pixelRatio: 2 });
  }
}

export interface ToiletMapProps {
  /** Initial centre, and where to fly when `recenterKey` changes. */
  center: LatLng;
  recenterKey?: number | string;
  zoom?: number;
  user?: LatLng | null;
  /** Load pins for the visible area from /toilets/in-bounds. */
  showPins?: boolean;
  features?: Feature[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** [lat, lng] pairs */
  route?: [number, number][] | null;
  destination?: LatLng | null;
  /** Fit these points on change (e.g. user + destination). */
  fitPoints?: LatLng[] | null;
  /** Crosshair picker: reports the map centre as it moves. */
  onCenterChange?: (c: LatLng) => void;
  /** Extra space for overlays (bottom sheet / side panel) when fitting. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Overlays that cover the map (search on top, sheet below): the camera centres in what's left. */
  viewPadding?: { top: number; bottom: number };
  /** False for small preview maps: no panning, zooming or controls. */
  interactive?: boolean;
  className?: string;
  label?: string;
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export default function ToiletMap({
  center,
  recenterKey,
  zoom = 16,
  user,
  showPins = true,
  features = [],
  selectedId,
  onSelect,
  route,
  destination,
  fitPoints,
  onCenterChange,
  padding,
  viewPadding,
  interactive = true,
  className,
  label = "Map of toilets",
}: ToiletMapProps) {
  const mapRef = useRef<MapRef>(null);
  const dark = useResolvedTheme() === "dark";
  const darkRef = useRef(dark);
  const style = useMemo(() => basemap(dark), [dark]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [clusters, setClusters] = useState<{ id: number; lat: number; lng: number; count: number }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A theme switch swaps the style, which drops custom images; redraw them in the new colours.
  useEffect(() => {
    darkRef.current = dark;
    const m = mapRef.current?.getMap();
    if (!m) return;
    for (const tier of TIERS) if (m.hasImage(`pin-${tier}`)) m.removeImage(`pin-${tier}`);
    addPinImages(m, dark);
  }, [dark]);

  const pinsQ = useQuery({
    queryKey: ["in-bounds", bounds, features],
    queryFn: ({ signal }) => api.toiletsInBounds({ ...bounds!, features, includePending: true }, signal),
    enabled: showPins && !!bounds,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const pins = useMemo(() => pinsQ.data?.items ?? [], [pinsQ.data]);
  const pending = useMemo(() => pins.filter((p) => p.status === "PENDING"), [pins]);
  const hasImported = useMemo(() => pins.some((p) => p.tier === "IMPORTED"), [pins]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins
        .filter((p) => p.status !== "PENDING")
        .map((p: ToiletPin) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: { id: p.id, tier: p.tier, hasIssue: p.hasIssue, selected: p.id === selectedId },
        })),
    }),
    [pins, selectedId],
  );

  const routeGeo = useMemo(
    () =>
      route && route.length > 1
        ? {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: route.map(([lat, lng]) => [lng, lat]) },
          }
        : null,
    [route],
  );

  const readBounds = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const b = m.getBounds();
    setBounds({ minLat: r4(b.getSouth()), maxLat: r4(b.getNorth()), minLng: r4(b.getWest()), maxLng: r4(b.getEast()) });
    const c = m.getCenter();
    onCenterChange?.({ lat: c.lat, lng: c.lng });
  }, [onCenterChange]);

  const updateClusters = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (!m || !m.getSource("toilets")) return;
    const seen = new Set<number>();
    const next: { id: number; lat: number; lng: number; count: number }[] = [];
    for (const f of m.querySourceFeatures("toilets", { filter: ["has", "point_count"] })) {
      const id = f.properties?.cluster_id as number;
      if (seen.has(id) || f.geometry.type !== "Point") continue;
      seen.add(id);
      const [lng, lat] = f.geometry.coordinates as [number, number];
      next.push({ id, lat, lng, count: f.properties?.point_count as number });
    }
    setClusters((prev) =>
      prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.count === next[i].count) ? prev : next,
    );
  }, []);

  const onMoveEnd = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(readBounds, 350);
    updateClusters();
  }, [readBounds, updateClusters]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // Re-centre when asked (locate-me, search result).
  const firstCenter = useRef(true);
  useEffect(() => {
    if (firstCenter.current) {
      firstCenter.current = false;
      return;
    }
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  // Fit route / destination.
  const fitKey = fitPoints?.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !fitPoints || fitPoints.length === 0) return;
    const pts = [...fitPoints, ...(route ?? []).map(([lat, lng]) => ({ lat, lng }))];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 60, bottom: 60, left: 40, right: 40, ...padding }, maxZoom: 18, duration: interactive ? 700 : 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, routeGeo]);

  /** Taps within ~22px of a pin count, so a thumb doesn't need to land on the glyph. */
  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      let id = e.features?.[0]?.properties?.id as string | undefined;
      const m = mapRef.current?.getMap();
      if (!id && m && m.getLayer("toilet-points")) {
        const { x, y } = e.point;
        const hits = m.queryRenderedFeatures(
          [
            [x - 22, y - 30],
            [x + 22, y + 14],
          ],
          { layers: ["toilet-points"] },
        );
        let best = Infinity;
        for (const h of hits) {
          if (h.geometry.type !== "Point") continue;
          const p = m.project(h.geometry.coordinates as [number, number]);
          const d = Math.hypot(p.x - x, p.y - 16 - y);
          if (d < best) {
            best = d;
            id = h.properties?.id as string | undefined;
          }
        }
      }
      if (id) onSelect?.(id);
    },
    [onSelect],
  );

  const zoomToCluster = useCallback(async (clusterId: number, lng: number, lat: number) => {
    const m = mapRef.current?.getMap();
    const src = m?.getSource("toilets") as GeoJSONSource | undefined;
    if (!m || !src) return;
    try {
      const z = await src.getClusterExpansionZoom(clusterId);
      m.easeTo({ center: [lng, lat], zoom: z + 0.5, duration: 500 });
    } catch {
      m.easeTo({ center: [lng, lat], zoom: m.getZoom() + 2 });
    }
  }, []);

  // Keep the user and the nearest pins in the visible part of the map as the sheet moves.
  const padTop = viewPadding?.top ?? 0;
  const padBottom = viewPadding?.bottom ?? 0;
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m || !viewPadding) return;
    m.easeTo({ padding: { top: padTop, bottom: padBottom, left: 0, right: 0 }, duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padTop, padBottom]);

  const issueColor = dark ? PIN_COLORS.dark.danger : PIN_COLORS.light.danger;

  return (
    <div className={cx("relative", className)} role="region" aria-label={label}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom }}
        mapStyle={style}
        minZoom={11}
        maxZoom={19}
        maxBounds={SG_BOUNDS}
        attributionControl={false}
        interactive={interactive}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        interactiveLayerIds={showPins ? ["toilet-points"] : []}
        onClick={showPins ? onClick : undefined}
        onLoad={(e) => {
          const m = e.target;
          if (viewPadding) m.setPadding({ top: viewPadding.top, bottom: viewPadding.bottom, left: 0, right: 0 });
          addPinImages(m, darkRef.current);
          m.on("styleimagemissing", (ev: { id: string }) => {
            if (ev.id.startsWith("pin-")) addPinImages(m, darkRef.current);
          });
          readBounds();
        }}
        onMoveEnd={onMoveEnd}
        onSourceData={(e) => {
          if (e.sourceId === "toilets" && e.isSourceLoaded) updateClusters();
        }}
        style={{ width: "100%", height: "100%" }}
        cursor={interactive ? "grab" : "default"}
      >
        <AttributionControl compact position="bottom-left" customAttribution={hasImported ? OSM_ATTRIBUTION : undefined} />
        {interactive ? <NavigationControl position="top-right" showCompass={false} /> : null}

        {showPins ? (
          <Source id="toilets" type="geojson" data={geojson} cluster clusterRadius={44} clusterMaxZoom={16}>
            {/* Toilet-roll pins; fill encodes tier (The Honest Pin Rule). */}
            <Layer
              id="toilet-points"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": ["concat", "pin-", ["get", "tier"]],
                "icon-size": ["case", ["get", "selected"], 1.25, 1],
                "icon-anchor": "bottom",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": [
                  "case",
                  ["get", "selected"],
                  3,
                  ["match", ["get", "tier"], "VERIFIED", 2, "COMMUNITY", 1, 0],
                ],
              }}
            />
            <Layer
              id="toilet-issues"
              type="circle"
              filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "hasIssue"], true]]}
              paint={{
                "circle-radius": 5,
                "circle-color": issueColor,
                "circle-stroke-color": dark ? PIN_COLORS.dark.bg : PIN_COLORS.light.surface,
                "circle-stroke-width": 2,
                "circle-translate": [14, -34],
              }}
            />
          </Source>
        ) : null}

        {routeGeo ? (
          <Source id="route" type="geojson" data={routeGeo}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": dark ? PIN_COLORS.dark.bg : "#ffffff", "line-width": 10, "line-opacity": 0.9 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": dark ? PIN_COLORS.dark.urgent : PIN_COLORS.light.urgent, "line-width": 6 }}
            />
          </Source>
        ) : null}

        {showPins
          ? clusters.map((c) => (
              <Marker key={`c${c.id}`} longitude={c.lng} latitude={c.lat} anchor="center">
                <button
                  type="button"
                  onClick={() => zoomToCluster(c.id, c.lng, c.lat)}
                  className="flex size-11 items-center justify-center rounded-full border-[3px] border-bg bg-tier font-display text-sm text-tier-fg shadow-card"
                  aria-label={`${c.count} toilets here, zoom in`}
                >
                  {c.count}
                </button>
              </Marker>
            ))
          : null}

        {showPins
          ? pending.map((p) => (
              <Marker key={`p${p.id}`} longitude={p.lng} latitude={p.lat} anchor="bottom">
                <button
                  type="button"
                  onClick={() => onSelect?.(p.id)}
                  className="tap flex items-end justify-center"
                  aria-label="Pending community toilet, waiting for review"
                >
                  <PinGlyph variant="pending" className="size-8 drop-shadow" />
                </button>
              </Marker>
            ))
          : null}

        {destination ? (
          <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
            <PinGlyph variant="destination" title="Destination" className="size-12 drop-shadow-md" />
          </Marker>
        ) : null}

        {user ? (
          <Marker longitude={user.lng} latitude={user.lat} anchor="center">
            <span aria-label="You are here" role="img" className="relative flex size-5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-5 rounded-full border-[3px] border-white bg-sky-600 shadow" />
            </span>
          </Marker>
        ) : null}
      </Map>

      {onCenterChange ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          {/* Pin tip sits on the map centre. */}
          <div className="-mt-12 flex flex-col items-center">
            <PinGlyph variant="picker" className="size-12 drop-shadow-md" />
            <span className="-mt-0.5 h-1.5 w-3 rounded-full bg-fg/30" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
