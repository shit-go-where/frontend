"use client";

import { ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { EmptyState, cx, inputClass } from "@/components/ui";
import type { AreaSummary, Region } from "@/lib/api/types";
import { REGION_LABELS, plural } from "@/lib/format";
import { PLACE_AREAS, STATION_AREAS } from "./aliases";

const REGION_ORDER: (Region | null)[] = ["CENTRAL", "EAST", "NORTH", "NORTH_EAST", "WEST", null];

type Alias = { name: string; label: string; areas: string[] };

/** Stations first, so "Bugis" reads "Bugis MRT" before the neighbourhood of the same name. */
const ALIASES: Alias[] = [
  ...Object.entries(STATION_AREAS).map(([name, area]) => ({ name, label: `${name} MRT`, areas: [area] })),
  ...Object.entries(PLACE_AREAS).map(([name, areas]) => ({ name, label: name, areas })),
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Word-start match: "bug" finds Bugis and "park" finds Farrer Park, but "ark" finds neither. */
function matches(name: string, q: string) {
  const n = norm(name);
  return n.startsWith(q) || n.includes(` ${q}`);
}

type Hit = { area: AreaSummary; via: string[] };

/** Areas named like the query, then areas holding a station or place named like it. */
function search(areas: AreaSummary[], query: string): Hit[] {
  const q = norm(query);
  if (!q) return [];
  const byName = new Map(areas.map((a) => [a.name.toLowerCase(), a]));
  const hits = new Map<string, Hit & { direct: boolean; names: Set<string> }>();
  for (const a of areas) if (matches(a.name, q)) hits.set(a.slug, { area: a, via: [], direct: true, names: new Set() });
  for (const alias of ALIASES) {
    if (!matches(alias.name, q)) continue;
    for (const areaName of alias.areas) {
      const a = byName.get(areaName.toLowerCase());
      if (!a) continue;
      const h = hits.get(a.slug) ?? { area: a, via: [], direct: false, names: new Set<string>() };
      hits.set(a.slug, h);
      if (h.names.has(alias.name) || norm(alias.name) === norm(a.name)) continue;
      h.names.add(alias.name);
      h.via.push(alias.label);
    }
  }
  return [...hits.values()]
    .sort((x, y) => Number(y.direct) - Number(x.direct) || x.area.name.localeCompare(y.area.name))
    .map(({ area, via }) => ({ area, via }));
}

function AreaRow({ a, via }: { a: AreaSummary; via?: string[] }) {
  return (
    <li>
      <Link
        href={`/areas/${a.slug}`}
        className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold leading-snug">{a.name}</span>
          {via?.length ? <span className="block text-sm font-bold text-fg">Includes {via.join(", ")}</span> : null}
          <span className="block text-sm text-muted tabular-nums">
            {plural(a.toiletCount, "toilet")}
            {` · ${a.verifiedCount ? `${a.verifiedCount} checked in person` : "none checked yet"}`}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden />
      </Link>
    </li>
  );
}

const LIST = "mt-3 divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest";

/**
 * Every area by region, with a search on top that also knows MRT stations and a few
 * neighbourhoods, since people think "Bugis" or "Raffles Place", not "Downtown Core". The server
 * renders the full list (the query starts empty), so search engines and no-JS still get it all.
 */
export function AreaDirectory({ areas }: { areas: AreaSummary[] }) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const hits = useMemo(() => search(areas, q), [areas, q]);
  const searching = norm(q).length > 0;
  const id = useId();
  const groups = useMemo(
    () =>
      REGION_ORDER.map((region) => ({ region, areas: areas.filter((a) => a.region === region) })).filter((g) => g.areas.length),
    [areas],
  );

  return (
    <>
      <div className="mt-6">
        <label htmlFor={`${id}-q`} className="font-bold">
          Find an area
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id={`${id}-q`}
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Area, MRT station or neighbourhood"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby={`${id}-count`}
            className={cx(inputClass, "pr-12 pl-12 [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="tap absolute top-1/2 right-1 -translate-y-1/2 rounded-full text-muted hover:bg-surface hover:text-fg"
              aria-label="Clear search"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p id={`${id}-count`} aria-live="polite" className="sr-only">
          {searching ? `${plural(hits.length, "area")} match` : ""}
        </p>
      </div>

      {searching ? (
        hits.length ? (
          <ul className={LIST} aria-label="Matching areas">
            {hits.map((h) => (
              <AreaRow key={h.area.slug} a={h.area} via={h.via} />
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-3xl border border-border/70 bg-surface shadow-rest">
            <EmptyState mascot="lost" title="Cannot find leh">
              <p>No area, MRT station or neighbourhood matches &ldquo;{q.trim()}&rdquo;. Try a nearby MRT station.</p>
            </EmptyState>
          </div>
        )
      ) : (
        groups.map((g) => {
          const gid = `region-${(g.region ?? "other").toLowerCase()}`;
          return (
            <section key={gid} aria-labelledby={gid} className="mt-10 first:mt-6">
              <h2 id={gid} className="flex items-baseline gap-3 text-2xl leading-tight">
                {g.region ? REGION_LABELS[g.region] : "Elsewhere"}
                <span className="ml-auto font-sans text-sm font-bold text-muted tabular-nums">{plural(g.areas.length, "area")}</span>
              </h2>
              <ul className={LIST}>
                {g.areas.map((a) => (
                  <AreaRow key={a.slug} a={a} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
