"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
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
import {
  FloorPicker,
  FoldedStack,
  MAX_SPIDER_LEGS,
  OFF_FLOOR_OPACITY,
  StackRolls,
  drawLevelLabel,
  floorsKey,
  floorsOf,
  folds,
  labelText,
  spiderReach,
  stacksOf,
  type PinStack,
} from "./levels";
import { OffscreenHint } from "./offscreen-hint";

/**
 * MapLibre 6, loaded by URL instead of bundled, so the main thread and its worker share one download of
 * maplibre-gl-shared.mjs (served by app/maplibre/*, see lib/server/maplibre-asset.ts). Started once, on
 * the first map; the import is left alone by the bundler.
 */
const MAPLIBRE_URL = `/maplibre/${process.env.MAPLIBRE_VERSION}/maplibre-gl.mjs`;
let mapLib: Promise<typeof import("maplibre-gl")> | null = null;
function loadMapLib() {
  mapLib ??= (import(/* webpackIgnore: true */ MAPLIBRE_URL) as Promise<typeof import("maplibre-gl")>).catch((e: unknown) => {
    // No signal: let the next map try again instead of keeping the failure.
    mapLib = null;
    throw e;
  });
  return mapLib;
}

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
    layers: [
      {
        id: "onemap",
        type: "raster",
        source: "onemap",
        // Turned down, not recoloured: MRT lines, parks and water keep their hues, but OneMap's own labels and
        // icons step back so the toilet pins lead. Night is only lightly capped (0.9, was 0.7) so streets still
        // read in Singapore sun; the pins' rims and shadows keep them ahead.
        paint: dark
          ? { "raster-saturation": -0.25, "raster-brightness-max": 0.9, "raster-contrast": -0.05 }
          : { "raster-saturation": -0.3, "raster-brightness-min": 0.06, "raster-contrast": -0.1 },
      },
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

/** Clusters break up past this zoom; from the next whole zoom up, a building's floors stack instead. */
const CLUSTER_MAX_ZOOM = 16;
const STACK_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;
/** Pins say their level from here in, where a building fills enough of the screen for it to matter. */
const LEVEL_LABEL_MIN_ZOOM = 17;

/** Draws the toilet-roll pin for a tier onto a canvas (synchronously, so the missing-image resolver can use it). */
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
  /** How far off the user's fix may be, in metres: drawn as a ring around the dot. */
  accuracy?: number | null;
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
  /**
   * A tapped cluster that zooming can't split (toilets on different floors at one spot) or that is all
   * one building: list these toilets instead, lowest level first, with the building's id when they share
   * one (so the list can ask for the building once). Without it, every cluster zooms in.
   */
  onSelectGroup?: (ids: string[], venueId: string | null) => void;
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
  /** Start the map credit folded to its "i" (the phone home map, where the expanded line runs into the locate button). */
  foldCredit?: boolean;
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

interface Cluster {
  id: number;
  lat: number;
  lng: number;
  count: number;
  /** Every toilet in it is at this venue; "" when they're at several (clusterProperties below). */
  venue: string;
}

/**
 * Sources: each point's venueId, reduced to the shared one or "". A cluster that is one building
 * opens as a list of its floors instead of zooming in.
 */
const CLUSTER_PROPERTIES = {
  venue: [
    ["case", ["==", ["accumulated"], ["get", "venue"]], ["accumulated"], ""],
    ["get", "venueId"],
  ],
} as const;

/** Below this the ring hides under the dot anyway; above it, it would cover the whole map. */
const ACCURACY_RING_MIN_M = 15;
const ACCURACY_RING_MAX_M = 3000;
/** "You are here" is sky blue by map convention, the one off-palette colour (DESIGN.md Map Markers). */
const USER_BLUE = "#0284c7";

/** A circle of `radiusM` metres around `c`, as a GeoJSON polygon (flat-earth, fine at city scale). */
function circlePolygon(c: LatLng, radiusM: number) {
  const steps = 48;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

export default function ToiletMap({
  center,
  recenterKey,
  zoom = 16,
  user,
  accuracy,
  showPins = true,
  features = [],
  openNow,
  areaType,
  selectedId,
  focus,
  focusHint = true,
  focusInset,
  onSelect,
  onSelectGroup,
  route,
  destination,
  fitPoints,
  onCenterChange,
  onViewChange,
  padding,
  viewPadding,
  dimPins = false,
  interactive = true,
  foldCredit = false,
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
  // The map never started (no WebGL2, which MapLibre 6 requires, or its module didn't arrive): hand it to
  // MapErrorBoundary (./index.tsx) so the page says so instead of showing an empty box. Tile errors don't count.
  const [fatal, setFatal] = useState<unknown>(null);
  if (fatal) throw fatal;
  const [clusters, setClusters] = useState<Cluster[]>([]);
  /** Clusters whose expansion zoom is past clustering (their toilets share a spot), by cluster id. */
  const [coincident, setCoincident] = useState<ReadonlyMap<number, boolean>>(() => new globalThis.Map());
  const [zoomLevel, setZoomLevel] = useState(zoom);
  /** The camera is moving (a drag, a zoom, a flight); the region says so, for tests to wait on. */
  const [moving, setMoving] = useState(false);
  /** The floor picked in the floor picker; null is All. */
  const [floor, setFloor] = useState<string | null>(null);
  /** The folded stack that is fanned out, by key. */
  const [spider, setSpider] = useState<string | null>(null);
  /** The map is panning to make room for a fan: that move mustn't fold it. */
  const roomForSpider = useRef(false);
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
    // On (re)mount the style isn't attached yet; onLoad / the missing-image resolver add the pins then.
    const m = liveMap();
    if (!m) return;
    for (const tier of TIERS) if (m.hasImage(`pin-${tier}`)) m.removeImage(`pin-${tier}`);
    addPinImages(m, dark);
    // Level tags are redrawn on demand (the missing-image resolver) in the new colours.
    for (const id of m.listImages()) if (id.startsWith("lvl-")) m.removeImage(id);
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
          properties: {
            id: p.id,
            tier: p.tier,
            hasIssue: p.hasIssue,
            // Pins saved offline before levels came in have none of these: they never group or stack.
            venueId: p.venueId ?? "",
            levelOrder: p.levelOrder ?? null,
            label: labelText(p.level) ?? "",
            floors: floorsKey(p.level),
          },
        })),
    }),
    [pins],
  );
  // Cluster ids only mean something for the data they were made from.
  const [coincidentFor, setCoincidentFor] = useState(geojson);
  if (coincidentFor !== geojson) {
    setCoincidentFor(geojson);
    setCoincident(new globalThis.Map());
  }

  // Past clustering, a building's toilets at one spot become a stack instead of pins on top of each other.
  const stacks = useMemo(() => (showPins && zoomLevel >= STACK_MIN_ZOOM ? stacksOf(pins) : []), [showPins, zoomLevel, pins]);
  const stackedIds = useMemo(() => stacks.flatMap((s) => s.pins.map((p) => p.id)), [stacks]);
  const stackOf = useMemo(() => new globalThis.Map(stacks.flatMap((s) => s.pins.map((p) => [p.id, s.key] as const))), [stacks]);
  if (spider && !stacks.some((s) => s.key === spider)) setSpider(null);

  // The floor picker: at building zoom, when a building in view has toilets on two or more floors.
  const floors = useMemo(() => {
    if (!showPins || !interactive || zoomLevel < STACK_MIN_ZOOM || !bounds) return [];
    const inView = pins.filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.lat >= bounds.minLat && p.lat <= bounds.maxLat && p.lng >= bounds.minLng && p.lng <= bounds.maxLng,
    );
    const byVenue = new globalThis.Map<string, ToiletPin[]>();
    for (const p of inView) if (p.venueId) byVenue.set(p.venueId, [...(byVenue.get(p.venueId) ?? []), p]);
    const multiLevel = [...byVenue.values()].some((list) => floorsOf(list).length >= 2);
    return multiLevel ? floorsOf(inView) : [];
  }, [showPins, interactive, zoomLevel, bounds, pins]);
  // The picker going away (zoomed out, panned off the building) puts every floor back.
  const floorShown = floor !== null && floors.some((f) => f.level === floor);
  if (floor !== null && !floorShown) setFloor(null);

  /** Data-driven opacity: the filters' dim for every pin, the floor picker's for pins on other floors. */
  const pinOpacity = useMemo(() => {
    const base = dim ? 0.35 : 1;
    if (!floor) return base;
    return ["case", ["in", `;${floor};`, ["get", "floors"]], base, Math.min(base, OFF_FLOOR_OPACITY)] as ExpressionSpecification;
  }, [dim, floor]);
  /** Stacked toilets are drawn by their stack, never twice. */
  const notStacked = useMemo(
    () => ["!", ["in", ["get", "id"], ["literal", stackedIds]]] as ExpressionSpecification,
    [stackedIds],
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

  // The accuracy ring, as a real circle on the ground so it scales with the zoom. Too small to see is left off.
  const accuracyRing = useMemo(
    () =>
      user && accuracy && accuracy >= ACCURACY_RING_MIN_M
        ? circlePolygon(user, Math.min(accuracy, ACCURACY_RING_MAX_M))
        : null,
    [user, accuracy],
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
    const next: Cluster[] = [];
    for (const f of m.querySourceFeatures("toilets", { filter: ["has", "point_count"] })) {
      const id = f.properties?.cluster_id as number;
      if (seen.has(id) || f.geometry.type !== "Point") continue;
      seen.add(id);
      const [lng, lat] = f.geometry.coordinates as [number, number];
      next.push({ id, lat, lng, count: f.properties?.point_count as number, venue: (f.properties?.venue as string) ?? "" });
    }
    setClusters((prev) =>
      prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.count === next[i].count && p.venue === next[i].venue)
        ? prev
        : next,
    );
    // Whether zooming in can split each cluster at all, so its button can say what a tap will do.
    const src = m.getSource("toilets") as GeoJSONSource | undefined;
    if (!src) return;
    for (const c of next) {
      src
        .getClusterExpansionZoom(c.id)
        .then((z) =>
          setCoincident((prev) => {
            const same = z > CLUSTER_MAX_ZOOM;
            if (prev.get(c.id) === same) return prev;
            return new globalThis.Map(prev).set(c.id, same);
          }),
        )
        .catch(() => {});
    }
  }, [liveMap]);

  const onMoveEnd = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(readBounds, 350);
    updateClusters();
    roomForSpider.current = false;
    setMoving(false);
    const m = mapRef.current;
    if (m) setZoomLevel(m.getZoom());
  }, [readBounds, updateClusters]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  /*
   * A camera move we start (locate-me, a search result, a route fit, a cluster tap) runs to its end. MapLibre's
   * easeTo stops whatever move is running, so a padding change that lands mid-flight (the list under the sheet
   * changing as the map arrives) waits for it instead of stopping the map halfway.
   */
  const flying = useRef(false);
  const padPending = useRef<(() => void) | null>(null);
  const flown = useCallback(() => {
    const m = mapRef.current?.getMap();
    // Not moving: it was instant (reduced motion), so it is already over. (MapLibre 6 keeps isEasing on its
    // internal camera; isMoving is the public equivalent and is set as soon as easeTo/flyTo starts.)
    if (!m?.isMoving()) return;
    flying.current = true;
    m.once("moveend", () => {
      flying.current = false;
      const pad = padPending.current;
      padPending.current = null;
      pad?.();
    });
  }, []);

  // Re-centre when asked (locate-me, search result).
  const firstCenter = useRef(true);
  useEffect(() => {
    if (firstCenter.current) {
      firstCenter.current = false;
      return;
    }
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 800, ...cameraMotion() });
    flown();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked to re-centre (recenterKey), not on every new fix.
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
      flown();
    };
    fitRef.current(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fit only for a new fit request or route, not on every prop change.
  }, [fitKey, routeGeo]);

  /** Taps within ~22px of a pin count, so a thumb doesn't need to land on the glyph. */
  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      // Taps on a marker (a stack's roll, a cluster) also reach the map: the marker has handled them.
      if ((e.originalEvent?.target as Element | null)?.closest?.(".maplibregl-marker")) return;
      // A tap anywhere else folds a fanned-out stack.
      setSpider(null);
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

  /**
   * Zooms into a cluster, unless zooming can't help: its toilets share one spot (different floors of a
   * mall: zoomed in, one pin would sit on the others) or they are all one building. Those open as a list.
   */
  const openCluster = useCallback(async (c: Cluster) => {
    const m = liveMap();
    const src = m?.getSource("toilets") as GeoJSONSource | undefined;
    if (!m || !src) return;
    try {
      const z = await src.getClusterExpansionZoom(c.id);
      if (onSelectGroup && (z > CLUSTER_MAX_ZOOM || c.venue)) {
        const leaves = await src.getClusterLeaves(c.id, 200, 0);
        const ids = leaves
          .map((f) => ({ id: f.properties?.id as string, order: f.properties?.levelOrder as number | null | undefined }))
          .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
          .map((l) => l.id);
        onSelectGroup(ids, c.venue || null);
        return;
      }
      m.easeTo({ center: [c.lng, c.lat], zoom: z + 0.5, duration: 500, ...cameraMotion() });
    } catch {
      m.easeTo({ center: [c.lng, c.lat], zoom: m.getZoom() + 2, ...cameraMotion() });
    }
    flown();
  }, [liveMap, onSelectGroup, flown]);

  /** Fans a stack out, first nudging the map so the whole ring lands in the open part of it. */
  const openSpider = useCallback(
    (s: PinStack | null) => {
      setSpider(s?.key ?? null);
      const m = liveMap();
      if (!s || !m) return;
      const reach = spiderReach(s);
      const { x, y } = m.project([s.lng, s.lat]);
      const { offsetWidth: w, offsetHeight: h } = m.getContainer();
      const { top = 0, bottom = 0 } = m.getPadding();
      const dx = x < reach ? x - reach : x > w - reach ? x - (w - reach) : 0;
      const dy = y < top + reach ? y - top - reach : y > h - bottom - reach ? y - (h - bottom - reach) : 0;
      if (!dx && !dy) return;
      roomForSpider.current = true;
      m.panBy([dx, dy], { duration: reducedMotion() ? 0 : 300 });
      flown();
    },
    [liveMap, flown],
  );

  // Keep the user and the nearest pins in the visible part of the map as the sheet moves.
  const padTop = viewPadding?.top ?? 0;
  const padBottom = viewPadding?.bottom ?? 0;
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m || !viewPadding) return;
    // Pans on the sheet's own curve and duration so map and sheet move as one.
    const pad = () =>
      m.easeTo({
        padding: { top: padTop, bottom: padBottom, left: 0, right: 0 },
        duration: reducedMotion() ? 0 : SHEET_SETTLE_MS,
        easing: easeSheet,
        essential: true,
      });
    if (flying.current) padPending.current = pad;
    else pad();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the padding values only; the map and refs are stable.
  }, [padTop, padBottom]);

  const issueColor = dark ? PIN_COLORS.dark.danger : PIN_COLORS.light.danger;

  // Read through a ref, like darkRef: `phone` can settle after the first render, before the map loads.
  const foldCreditRef = useRef(foldCredit);
  useEffect(() => {
    foldCreditRef.current = foldCredit;
  }, [foldCredit]);

  return (
    <div
      ref={boxRef}
      className={cx("relative", className)}
      role="region"
      aria-label={label}
      // A picture-only map (a route preview) is out of the tab order and hidden from screen readers;
      // the card around it says everything it shows.
      inert={!interactive || undefined}
      // Where the camera settled, so e2e tests wait for the map instead of for a guessed time.
      data-zoom={zoomLevel.toFixed(2)}
      data-moving={moving}
    >
      <Map
        ref={mapRef}
        mapLib={loadMapLib()}
        onError={(e) => {
          // react-map-gl reports a failed start with no target; everything else is a map event (a tile, say).
          if (!e.target) setFatal(e.error ?? new Error("The map could not start"));
          else console.error(e.error);
        }}
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
          // MapLibre opens the compact credit until the first interaction, which never comes on a picture-only
          // map, so on a route preview it would sit across the route. Start it folded to its "i" there.
          if (!interactive || foldCreditRef.current) {
            const attrib = m.getContainer().querySelector(".maplibregl-ctrl-attrib");
            attrib?.classList.remove("maplibregl-compact-show");
            attrib?.removeAttribute("open");
          }
          if (viewPadding) m.setPadding({ top: viewPadding.top, bottom: viewPadding.bottom, left: 0, right: 0 });
          addPinImages(m, darkRef.current);
          // MapLibre 6: `styleimagemissing` only notifies; a resolver is what supplies the image.
          m.setMissingStyleImageResolver((id) => {
            if (id.startsWith("pin-")) addPinImages(m, darkRef.current);
            else if (id.startsWith("lvl-") && !m.hasImage(id)) {
              const tag = drawLevelLabel(id.slice(4), darkRef.current);
              if (tag) m.addImage(id, tag.image, { pixelRatio: 2 });
            }
          });
          readBounds();
          fitRef.current(false);
        }}
        onMoveEnd={onMoveEnd}
        // Moving the map folds a fanned-out stack; it would drift off its spot otherwise.
        onMoveStart={() => {
          setMoving(true);
          if (!roomForSpider.current) setSpider(null);
        }}
        onSourceData={(e) => {
          if (e.sourceId === "toilets" && e.isSourceLoaded) updateClusters();
        }}
        style={{ width: "100%", height: "100%" }}
        cursor={interactive ? "grab" : "default"}
      >
        <AttributionControl compact position="bottom-left" customAttribution={hasImported ? OSM_ATTRIBUTION : undefined} />
        {interactive ? <NavigationControl position="top-right" showCompass={false} /> : null}

        {accuracyRing ? (
          <Source id="user-accuracy" type="geojson" data={accuracyRing}>
            {/* Under the pins, so a wide ring never hides a toilet. */}
            <Layer
              id="user-accuracy-fill"
              type="fill"
              beforeId={showPins ? "toilet-points" : undefined}
              paint={{ "fill-color": USER_BLUE, "fill-opacity": dark ? 0.16 : 0.12 }}
            />
            <Layer
              id="user-accuracy-line"
              type="line"
              beforeId={showPins ? "toilet-points" : undefined}
              paint={{ "line-color": USER_BLUE, "line-width": 1.5, "line-opacity": 0.6 }}
            />
          </Source>
        ) : null}

        {showPins ? (
          <Source
            id="toilets"
            type="geojson"
            data={geojson}
            cluster
            clusterRadius={44}
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            clusterProperties={CLUSTER_PROPERTIES}
          >
            {/* Toilet-roll pins; fill encodes tier (The Honest Pin Rule). */}
            <Layer
              id="toilet-points"
              type="symbol"
              filter={["all", ["!", ["has", "point_count"]], notStacked]}
              layout={{
                "icon-image": ["concat", "pin-", ["get", "tier"]],
                "icon-anchor": "bottom",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": ["match", ["get", "tier"], "VERIFIED", 2, "COMMUNITY", 1, 0],
              }}
              paint={{ "icon-opacity": pinOpacity, "icon-opacity-transition": pinFade }}
            />
            {/*
              The level under each pin once a building fills the screen. Drawn as images like the pins: the
              raster basemap has no glyph server for MapLibre text.
            */}
            <Layer
              id="toilet-levels"
              type="symbol"
              minzoom={LEVEL_LABEL_MIN_ZOOM}
              filter={["all", ["!", ["has", "point_count"]], ["!=", ["get", "label"], ""], notStacked]}
              layout={{
                "icon-image": ["concat", "lvl-", ["get", "label"]],
                "icon-anchor": "top",
                "icon-offset": [0, 1],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": ["match", ["get", "tier"], "VERIFIED", 2, "COMMUNITY", 1, 0],
              }}
              paint={{ "icon-opacity": pinOpacity, "icon-opacity-transition": pinFade }}
            />
            <Layer
              id="toilet-issues"
              type="circle"
              filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "hasIssue"], true], notStacked]}
              paint={{
                "circle-radius": 5,
                "circle-color": issueColor,
                "circle-stroke-color": dark ? PIN_COLORS.dark.bg : PIN_COLORS.light.surface,
                "circle-stroke-width": 2,
                "circle-translate": [14, -34],
                "circle-opacity": pinOpacity,
                "circle-opacity-transition": pinFade,
                "circle-stroke-opacity": pinOpacity,
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
          ? clusters.map((c) => {
              // Say what a tap does: a building's floors and a single spot open as a list, the rest zoom.
              const building = !!onSelectGroup && !!c.venue;
              const spot = !!onSelectGroup && coincident.get(c.id) === true;
              return (
                // Keyed by place and size, not the cluster id: ids are renumbered whenever the pins are refetched
                // (every pan), and a new key would replay the pop on every bubble that didn't change.
                <Marker key={`c${c.lng},${c.lat},${c.count}`} longitude={c.lng} latitude={c.lat} anchor="center">
                  <button
                    type="button"
                    onClick={() => void openCluster(c)}
                    className={cx(
                      "pin-pop flex size-11 items-center justify-center rounded-full border-[3px] border-bg bg-tier font-display text-sm text-tier-fg shadow-card transition-[scale,opacity] duration-200 active:scale-90",
                      dim && "opacity-40",
                    )}
                    aria-label={
                      building
                        ? `${c.count} toilets in this building, see levels`
                        : spot
                          ? `${c.count} toilets at this spot, see the list`
                          : `${c.count} toilets here, zoom in`
                    }
                    data-testid="pin-cluster"
                  >
                    {c.count}
                  </button>
                </Marker>
              );
            })
          : null}

        {stacks.map((s) => {
          const folded = folds(s);
          return (
            <Marker
              key={`k${s.key}`}
              longitude={s.lng}
              latitude={s.lat}
              anchor="bottom"
              // A fanned-out stack lies over its neighbours; a picked one rises like the picked pin.
              style={{ zIndex: spider === s.key ? 3 : s.pins.some((p) => p.id === selectedId) ? 2 : 1 }}
            >
              {folded ? (
                <FoldedStack
                  stack={s}
                  open={spider === s.key}
                  dim={dim}
                  floor={floor}
                  selectedId={selectedId ?? null}
                  onToggle={(open) =>
                    // Too many floors to fan out on a phone: list them like a building's cluster.
                    open && onSelectGroup && s.pins.length > MAX_SPIDER_LEGS
                      ? onSelectGroup(s.pins.map((p) => p.id), s.pins[0].venueId ?? null)
                      : openSpider(open ? s : null)
                  }
                  onSelect={(id) => onSelect?.(id)}
                />
              ) : (
                <StackRolls stack={s} dim={dim} floor={floor} selectedId={selectedId ?? null} onSelect={(id) => onSelect?.(id)} />
              )}
            </Marker>
          );
        })}

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

        {/* A stacked toilet is marked by its own roll in the stack. */}
        {showPins && mark && !stackOf.has(mark.id) ? (
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

        {interactive && showPins && focus && focusHint ? <OffscreenHint focus={focus} inset={focusInset} /> : null}

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

      {floors.length ? (
        <FloorPicker
          floors={floors}
          value={floorShown ? floor : null}
          onChange={setFloor}
          // On the left, opposite the locate button, in the band the search and the sheet leave open.
          style={{ top: padTop + 12, maxHeight: `calc(100% - ${padTop + padBottom + 24}px)` }}
        />
      ) : null}

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
