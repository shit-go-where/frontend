#!/usr/bin/env node
/**
 * Regenerates the STATIONS list in lib/stations.ts from the backend's committed data, so the
 * bundled "where am I" list never relies on coordinates typed from memory.
 *
 *   node scripts/gen-stations.mjs        (from frontend/)
 *
 * Sources, in order of preference:
 *   1. backend/data/curated/fieldwork-2024.json + venues.geocoded.json: the stations and bus
 *      interchanges of the March 2024 pilot survey, geocoded with OneMap (the most accurate
 *      coordinates we have).
 *   2. backend/data/curated/fieldwork-2024b.json + survey2-venues.geocoded.json (the expanded
 *      Aug–Oct 2024 survey), when those files exist: stations and interchanges the pilot didn't
 *      visit (TE23–TE29, EW13 …). Optional: until the backend's survey2 import has written them the
 *      script carries on without them, and a venue with no geocode yet is skipped with a warning
 *      instead of failing. Venue coordinates may also sit on the venue itself (lat/lng, or
 *      geocode.lat/lng), and the geocodes may fall back to venues.geocoded.json by key.
 *   3. backend/data/raw/wikidata/stations.json: every other in-use MRT/LRT station, plus the
 *      bus interchanges Wikidata knows. Its line list is also merged into surveyed stations so
 *      interchanges such as Bukit Panjang (DT + BP) carry every line.
 *
 * The pilot wins on position (a station both surveys visited keeps the pilot's geocode); the
 * expanded survey's geocode is only used for places Wikidata doesn't list (new interchanges).
 * Only the block between the generated markers in lib/stations.ts is replaced.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "backend", "data");
const OUT = join(here, "..", "lib", "stations.ts");

const read = (p) => JSON.parse(readFileSync(join(DATA, p), "utf8"));
/** For the expanded survey's files, which may not exist yet. */
const readIfExists = (p) => (existsSync(join(DATA, p)) ? read(p) : null);
const fieldwork = read("curated/fieldwork-2024.json");
const geocoded = read("curated/venues.geocoded.json");
const wikidata = read("raw/wikidata/stations.json").stations;
const fieldwork2 = readIfExists("curated/fieldwork-2024b.json");
const geocoded2 = readIfExists("curated/survey2-venues.geocoded.json") ?? {};
const matches2 = readIfExists("curated/survey2-venue-matches.json");

// Line names as printed on the network map; LRT lines use their usual short names.
const LINE_CODES = { NSL: "NS", EWL: "EW", NEL: "NE", CCL: "CC", DTL: "DT", TEL: "TE", BPLRT: "BP", SKLRT: "SK", PGLRT: "PG" };
const LINE_ORDER = Object.values(LINE_CODES);

// Opened after the Wikidata snapshot marked them in use (Teck Lee LRT opened August 2024).
const OPENED_SINCE_SNAPSHOT = new Set(["Teck Lee"]);

const round = (n) => Math.round(n * 1e5) / 1e5; // ~1 m, plenty for a place search
const codes = (lines) =>
  [...new Set(lines.map((l) => LINE_CODES[l]).filter(Boolean))].sort((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b));
const isBusInterchange = (name) => /\bBus Interchange$/.test(name);

/**
 * `bus` comes from the venue type for surveyed venues (the expanded survey calls several
 * interchanges "… Integrated Transport Hub") and from the name for Wikidata ones. Bus
 * interchanges carry no lines.
 * @type {Map<string, {name: string, lines: string[], lat: number, lng: number, bus: boolean, from2?: boolean}>}
 */
const byName = new Map();
const key = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

for (const v of fieldwork.venues) {
  if (v.type !== "MRT_STATION" && v.type !== "BUS_INTERCHANGE") continue;
  const g = geocoded[v.key];
  if (!g) throw new Error(`No geocode for surveyed venue ${v.key}`);
  byName.set(key(v.name), { name: v.name, lines: v.lines ?? [], lat: g.lat, lng: g.lng, bus: v.type === "BUS_INTERCHANGE" });
}

/** "Outram Park NEL", "Promenade DTL / CCL", "Bishan MRT Station" → the station's own name. */
const stationName = (name) =>
  name
    .replace(/\s+(?:(?:NSL|EWL|NEL|CCL|DTL|TEL|CEL|CGL)\s*\/?\s*)+$/i, "")
    .replace(/\s+(?:MRT|LRT)(?:\s+Station)?$/i, "")
    .trim();

const pilotBySourceKey = new Map(fieldwork.venues.map((v) => [`sheet-venue:${v.key}`, v]));
let added2 = 0;
const skipped2 = [];
for (const v of fieldwork2?.venues ?? []) {
  if (v.type !== "MRT_STATION" && v.type !== "BUS_INTERCHANGE") continue;
  // A venue survey2:match tied to a pilot venue is that venue, whatever the index calls it
  // (B7 "Bukit Panjang Integrated Transport Hub" is the pilot's Bukit Panjang Bus Interchange).
  const pilot = pilotBySourceKey.get(matches2?.venues?.[v.key]?.existingVenueSourceKey);
  const name = pilot ? pilot.name : v.type === "MRT_STATION" ? stationName(v.name) : v.name;
  const k = key(name);
  const g = geocoded2[v.key] ?? geocoded[v.key] ?? (v.lat != null ? v : null) ?? v.geocode ?? null;
  const existing = byName.get(k);
  if (existing) {
    existing.lines = [...existing.lines, ...(v.lines ?? [])];
    continue;
  }
  if (typeof g?.lat !== "number" || typeof g?.lng !== "number") {
    skipped2.push({ k, what: v.key ?? v.name });
    continue;
  }
  byName.set(k, { name, lines: v.lines ?? [], lat: g.lat, lng: g.lng, bus: v.type === "BUS_INTERCHANGE", from2: true });
  added2++;
}
if (!fieldwork2) console.log("No curated/fieldwork-2024b.json yet: expanded survey skipped.");
else console.log(`Expanded survey: ${added2} stations or interchanges the pilot didn't visit.`);

for (const s of wikidata) {
  const bus = isBusInterchange(s.name);
  const metro = s.isMetro && (s.inUse || OPENED_SINCE_SNAPSHOT.has(s.name));
  if (!bus && !metro) continue;
  const existing = byName.get(key(s.name));
  if (existing) {
    // Keep the pilot's (OneMap) position; add any lines the survey didn't record, and take
    // Wikidata's official spelling ("HarbourFront", not the sheet's "Harbourfront"). A place only
    // the expanded survey and Wikidata know keeps Wikidata's position, which the list already
    // had before that survey (its geocodes are within ~250 m), so the list doesn't shift under
    // anyone's saved searches.
    existing.lines = [...existing.lines, ...s.lines];
    existing.name = s.name;
    if (existing.from2) Object.assign(existing, { lat: s.lat, lng: s.lng });
    continue;
  }
  byName.set(key(s.name), { name: s.name, lines: s.lines, lat: s.lat, lng: s.lng, bus });
}

// Wikidata fills in most of the ones without a geocode; say which are still missing.
const missing2 = skipped2.filter((s) => !byName.has(s.k)).map((s) => s.what);
if (missing2.length) console.warn(`Expanded survey, skipped (no geocode yet, not in Wikidata): ${missing2.join(", ")}`);

const stations = [...byName.values()]
  .map((s) => ({ name: s.name, lines: s.bus ? [] : codes(s.lines), lat: round(s.lat), lng: round(s.lng), bus: s.bus }))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const s of stations) {
  if (!(s.lat > 1.15 && s.lat < 1.48 && s.lng > 103.6 && s.lng < 104.1)) throw new Error(`${s.name} is outside Singapore`);
  if (!s.bus && !s.lines.length) throw new Error(`${s.name} has no lines`);
}

const body = stations
  .map((s) => `  { name: ${JSON.stringify(s.name)}, lines: ${JSON.stringify(s.lines)}, lat: ${s.lat}, lng: ${s.lng} },`)
  .join("\n");

const START = "// <generated:stations>";
const END = "// </generated:stations>";
const src = readFileSync(OUT, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const a = src.indexOf(START);
const b = src.indexOf(END);
if (a < 0 || b < a) throw new Error(`Markers ${START} / ${END} not found in lib/stations.ts`);
const block = `${START}${eol}// Generated by scripts/gen-stations.mjs. Do not edit by hand.${eol}export const STATIONS: Station[] = [${eol}${body.replace(/\n/g, eol)}${eol}];${eol}`;
writeFileSync(OUT, src.slice(0, a) + block + src.slice(b));

const bus = stations.filter((s) => s.bus).length;
console.log(`Wrote ${stations.length} entries (${stations.length - bus} MRT/LRT stations, ${bus} bus interchanges) to lib/stations.ts`);
