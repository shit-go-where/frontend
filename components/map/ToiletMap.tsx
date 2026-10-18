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
import type { AreaType, Feature, ToiletPin, ToiletTier } from "@/lib/api/types";
import type { LatLng } from "@/lib/location";
import { cameraMotion, easeSheet, reducedMotion } from "@/lib/motion";
import { useResolvedTheme } from "@/lib/theme";
import { SHEET_SETTLE_MS } from "../bottom-sheet";
import { PIN_PATH, PinGlyph, ROLL_BODY, ROLL_TAIL, tierPinVariant } from "../pin";
import { cx } from "../ui";
import type { MapFocus } from "./focus";
import { OffscreenHint } from "./offscreen-hint";

/** [west, south, east, north] */
export const SG_BOUNDS: [number, number, number, number] = [103.55, 1.15, 104.15, 1.49];

const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

function basemap(dark: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      onemap: {
        type: "raster",
        // OneMap's own full-colour styles: parks, water and MRT line colours stay readable.
        tiles: [`https://www.onemap.gov.sg/maps/tiles/${dark ? "Night" : "Default"}/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 11,
        maxzoom: 19,
        attribution: ONEMAP_ATTRIBUTION,
      },
    },
    layers: [{ id: "onemap", type: "raster", source: "onemap" }],
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
  /** The same filters the page's list uses, so pins and list agree. */
  openNow?: boolean;
  areaType?: AreaType;
  selectedId?: string | null;
  /** Overrides `selectedId`: marks this toilet (picked or just looked at), wherever its pin is. */
  focus?: MapFocus | null;
  /** Point at the focused toilet from the edge of the open map when its pin is out of view. */
  focusHint?: boolean;
  /** Extra room the pill keeps from the open map's edges, for controls floating over the map. */
  focusInset?: { top?: number; bottom?: number };
  onSelect?: (id: string) => void;
  /** [lat, lng] pairs */
  route?: [number, number][] | null;
  destination?: LatLng | null;
  /** Fit these points on change (e.g. user + destination). */
  fitPoints?: LatLng[] | null;
  /** Crosshair picker: reports the map centre as it moves. */
  onCenterChange?: (c: LatLng) => void;
  /** Reports the part of the map left open by the overlays once it settles after a move. */
  onViewChange?: (v: MapView) => void;
  /** Extra space for overlays (bottom sheet / side panel) when fitting. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Overlays that cover the map (search on top, sheet below): the camera centres in what's left. */
  viewPadding?: { top: number; bottom: number };
  /** The page's filters changed and fresh pins are on the way: fade the stale ones back. */
  dimPins?: boolean;
  /** False for small preview maps: no panning, zooming or controls. */
  interactive?: boolean;
  className?: string;
  label?: string;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** The map as the person sees it: `open` leaves out what the `viewPadding` overlays cover. */
export interface MapView {
  center: LatLng;
  open: Bounds;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export default function ToiletMap({
  center,
  recenterKey,
  zoom = 16,
  user,
  showPins = true,
  features = [],
  openNow,
  areaType,
  selectedId,
  focus,
  focusHint = true,
  focusInset,
  onSelect,
  route,
  destination,
  fitPoints,
  onCenterChange,
  onViewChange,
  padding,
  viewPadding,
  dimPins = false,
  interactive = true,
  className,
  label = "Map of toilets",
}: ToiletMapProps) {
  const mapRef = useRef<MapRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // MapLibre labels every marker wrapper `button "Map marker"`, though the wrapper does nothing;
  // our markers carry their own names (a cluster button, "You are here"), so drop the wrapper's.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const unlabel = () =>
      box.querySelectorAll(".maplibregl-marker[role='button']").forEach((el) => {
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      });
    unlabel();
    const mo = new MutationObserver(unlabel);
    mo.observe(box, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const dark = useResolvedTheme() === "dark";
  const darkRef = useRef(dark);
  const style = useMemo(() => basemap(dark), [dark]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [clusters, setClusters] = useState<{ id: number; lat: number; lng: number; count: number }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The map, but only while it has a style. Before the style attaches (on remount) and after
   * remove() (which calls setStyle(null) while late events still fire), style calls would throw.
   */
  const liveMap = useCallback(() => {
    const m = mapRef.current?.getMap();
    return m?.style ? m : null;
  }, []);

  // A theme switch swaps the style, which drops custom images; redraw them in the new colours.
  useEffect(() => {
    darkRef.current = dark;
    // On (re)mount the style isn't attached yet; onLoad / styleimagemissing add the pins then.
    const m = liveMap();
    if (!m) return;
    for (const tier of TIERS) if (m.hasImage(`pin-${tier}`)) m.removeImage(`pin-${tier}`);
    addPinImages(m, dark);
  }, [dark, liveMap]);

  const pinsQ = useQuery({
    queryKey: ["in-bounds", bounds, features, openNow ?? false, areaType ?? null],
    queryFn: ({ signal }) =>
      api.toiletsInBounds({ ...bounds!, features, openNow: openNow || undefined, areaType, includePending: true }, signal),
    enabled: showPins && !!bounds,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const pins = useMemo(() => pinsQ.data?.items ?? [], [pinsQ.data]);
  // Also dim while this map's own pins for new filters are still in flight (not while merely panning).
  const filterKey = `${features.join(",")}|${openNow ? 1 : 0}|${areaType ?? ""}`;
  const [shownFilters, setShownFilters] = useState(filterKey);
  if (pinsQ.data && !pinsQ.isPlaceholderData && shownFilters !== filterKey) setShownFilters(filterKey);
  const dim = dimPins || (pinsQ.isPlaceholderData && shownFilters !== filterKey);
  const pinFade = { duration: 220, delay: 0 };
  const pending = useMemo(() => pins.filter((p) => p.status === "PENDING"), [pins]);
  const hasImported = useMemo(() => pins.some((p) => p.tier === "IMPORTED"), [pins]);
  // Selection is drawn as its own marker, so hovering or tapping never re-uploads the pin data.
  const selectedPin = useMemo(
    () => (selectedId ? (pins.find((p) => p.id === selectedId && p.status !== "PENDING") ?? null) : null),
    [pins, selectedId],
  );
  // A focus is drawn from its own coordinates, so it shows even before (or without) its pin loading.
  // Pending pins are already their own markers. No focus yet (a tapped pin still loading): mark the pin itself.
  const mark = focus
    ? focus.pending
      ? null
      : { id: focus.id, lat: focus.lat, lng: focus.lng, tier: focus.tier, picked: focus.picked }
    : selectedPin
        ? { id: selectedPin.id, lat: selectedPin.lat, lng: selectedPin.lng, tier: selectedPin.tier, picked: true }
        : null;

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins
        .filter((p) => p.status !== "PENDING")
        .map((p: ToiletPin) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: { id: p.id, tier: p.tier, hasIssue: p.hasIssue },
        })),
    }),
    [pins],
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

  // Read through a ref so the debounced and onLoad calls always reach the page's latest handler.
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  const readBounds = useCallback(() => {
    const m = mapRef.current;
    // Hidden on another tab (the map page stays mounted): its size is zero, so its "bounds" are meaningless.
    if (!m || !m.getContainer().offsetWidth) return;
    const b = m.getBounds();
    setBounds({ minLat: r4(b.getSouth()), maxLat: r4(b.getNorth()), minLng: r4(b.getWest()), maxLng: r4(b.getEast()) });
    const c = m.getCenter();
    onCenterChange?.({ lat: c.lat, lng: c.lng });
    if (onViewChangeRef.current) {
      // The corners of the area between the overlays (the map never rotates, so two corners are enough).
      const { offsetWidth: w, offsetHeight: h } = m.getContainer();
      const { top = 0, bottom = 0, left = 0, right = 0 } = m.getPadding();
      const nw = m.unproject([left, top]);
      const se = m.unproject([w - right, Math.max(top, h - bottom)]);
      onViewChangeRef.current({
        center: { lat: c.lat, lng: c.lng },
        open: { minLat: se.lat, maxLat: nw.lat, minLng: nw.lng, maxLng: se.lng },
      });
    }
  }, [onCenterChange]);

  const updateClusters = useCallback(() => {
    const m = liveMap();
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
  }, [liveMap]);

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
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 800, ...cameraMotion() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  // Fit route / destination.
  const fitKey = fitPoints?.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  // The first run usually comes before react-map-gl hands over the map, so onLoad fits again
  // (at once: the map was never shown at its starting view).
  const fitRef = useRef<(animate: boolean) => void>(() => {});
  useEffect(() => {
    fitRef.current = (animate) => {
      const m = mapRef.current;
      if (!m || !fitPoints || fitPoints.length === 0) return;
      const pts = [...fitPoints, ...(route ?? []).map(([lat, lng]) => ({ lat, lng }))];
      const lats = pts.map((p) => p.lat);
      const lngs = pts.map((p) => p.lng);
      const glide = animate && interactive;
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 60, bottom: 60, left: 40, right: 40, ...padding }, maxZoom: 18, duration: glide ? 700 : 0, ...(glide ? cameraMotion() : {}) },
      );
    };
    fitRef.current(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, routeGeo]);

  /** Taps within ~22px of a pin count, so a thumb doesn't need to land on the glyph. */
  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      let id = e.features?.[0]?.properties?.id as string | undefined;
      const m = liveMap();
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
    [onSelect, liveMap],
  );

  const zoomToCluster = useCallback(async (clusterId: number, lng: number, lat: number) => {
    const m = liveMap();
    const src = m?.getSource("toilets") as GeoJSONSource | undefined;
    if (!m || !src) return;
    try {
      const z = await src.getClusterExpansionZoom(clusterId);
      m.easeTo({ center: [lng, lat], zoom: z + 0.5, duration: 500, ...cameraMotion() });
    } catch {
      m.easeTo({ center: [lng, lat], zoom: m.getZoom() + 2, ...cameraMotion() });
    }
  }, [liveMap]);

  // Keep the user and the nearest pins in the visible part of the map as the sheet moves.
  const padTop = viewPadding?.top ?? 0;
  const padBottom = viewPadding?.bottom ?? 0;
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m || !viewPadding) return;
    // Pans on the sheet's own curve and duration so map and sheet move as one.
    m.easeTo({
      padding: { top: padTop, bottom: padBottom, left: 0, right: 0 },
      duration: reducedMotion() ? 0 : SHEET_SETTLE_MS,
      easing: easeSheet,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padTop, padBottom]);

  const issueColor = dark ? PIN_COLORS.dark.danger : PIN_COLORS.light.danger;

  return (
    <div
      ref={boxRef}
      className={cx("relative", className)}
      role="region"
      aria-label={label}
      // A picture-only map (a route preview) is out of the tab order and hidden from screen readers;
      // the card around it says everything it shows.
      inert={!interactive || undefined}
    >
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom }}
        mapStyle={style}
        minZoom={11}
        maxZoom={19}
        maxBounds={SG_BOUNDS}
        attributionControl={false}
        interactive={interactive}
        // Pan inertia follows the motion setting in force when the map is created (the map persists across tabs).
        reduceMotion={reducedMotion()}
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
          fitRef.current(false);
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
                "icon-anchor": "bottom",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": ["match", ["get", "tier"], "VERIFIED", 2, "COMMUNITY", 1, 0],
              }}
              paint={{ "icon-opacity": dim ? 0.35 : 1, "icon-opacity-transition": pinFade }}
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
                "circle-opacity": dim ? 0.35 : 1,
                "circle-opacity-transition": pinFade,
                "circle-stroke-opacity": dim ? 0.35 : 1,
                "circle-stroke-opacity-transition": pinFade,
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
                  className={cx(
                    "pin-pop flex size-11 items-center justify-center rounded-full border-[3px] border-bg bg-tier font-display text-sm text-tier-fg shadow-card transition-[transform,opacity] duration-200 active:scale-90",
                    dim && "opacity-40",
                  )}
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

        {showPins && mark ? (
          <Marker
            key={`${mark.picked ? "s" : "e"}${mark.id}`}
            longitude={mark.lng}
            latitude={mark.lat}
            anchor="bottom"
            style={{ zIndex: 2 }}
          >
            {mark.picked ? (
              /* "You picked this": a candy-pink puddle under the pin, which plops down onto it. */
              <span className="pointer-events-none relative flex flex-col items-center" aria-hidden>
                <PinGlyph variant={tierPinVariant(mark.tier)} className="pin-plop size-[50px] drop-shadow-[0_3px_3px_rgb(10_5_2/0.55)]" />
                <span className="pin-puddle absolute -bottom-1 h-2.5 w-7 rounded-[50%] bg-primary/80" />
              </span>
            ) : (
              /* "You're looking at this": the card's pin lifts above its neighbours, no puddle (nothing is picked yet). */
              <span className="pointer-events-none flex" aria-hidden>
                <PinGlyph variant={tierPinVariant(mark.tier)} className="rise-in size-12 drop-shadow-[0_5px_4px_rgb(10_5_2/0.5)]" />
              </span>
            )}
          </Marker>
        ) : null}

        {interactive && showPins && focus && focusHint ? <OffscreenHint key={focus.id} focus={focus} inset={focusInset} /> : null}

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
