"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Check, CircleHelp, LocateFixed, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToiletMap } from "@/components/map";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { PinGlyph } from "@/components/pin";
import { Button, Card, Field, PageHeader, Spinner, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import {
  AREA_TYPES,
  VENUE_TYPES,
  type AreaType,
  type Feature,
  type NearbyVenue,
  type NewToiletPayload,
  type PhotoRef,
  type SubmissionView,
  type ToiletSummary,
  type VenueLite,
  type VenueType,
} from "@/lib/api/types";
import { useRequireAuth } from "@/lib/auth";
import { AREA_TYPE_LABELS, FEATURE_GROUPS, FEATURE_LABELS, VENUE_TYPE_LABELS, formatDistance } from "@/lib/format";
import { haversineM, useLocation, type LatLng } from "@/lib/location";

const STEPS = ["Pin", "Venue", "Details", "Features", "Photo", "Submit"] as const;

type Tri = "yes" | "no" | "unknown";

interface Draft {
  pin: LatLng | null;
  venue: VenueLite | null;
  newVenue: { name: string; type: VenueType } | null;
  label: string;
  level: string;
  areaType: AreaType;
  accessNote: string;
  features: Partial<Record<Feature, Tri>>;
  photos: PhotoRef[];
}

const EMPTY: Draft = {
  pin: null,
  venue: null,
  newVenue: null,
  label: "",
  level: "",
  areaType: "UNKNOWN",
  accessNote: "",
  features: {},
  photos: [],
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Same query key and radius as the venue step, so step 2 opens with its list already loaded. */
function useNearestPlace(pin: LatLng) {
  const p = useDebounced(pin, 400);
  const q = useQuery({
    queryKey: ["venues-nearby", p.lat.toFixed(4), p.lng.toFixed(4)],
    queryFn: () => api.nearbyVenues({ lat: p.lat, lng: p.lng, radius: 300 }),
  });
  const nearest = useMemo(
    () =>
      (q.data?.items ?? []).reduce<NearbyVenue | null>((best, v) => (!best || v.distanceM < best.distanceM ? v : best), null),
    [q.data],
  );
  return { nearest, isLoading: q.isLoading, isError: q.isError };
}

/** "Pin is 20 m from you", or null when we don't know where the person is. */
function fromYouText(pin: LatLng, user: LatLng | null): string | null {
  if (!user) return null;
  const m = haversineM(user, pin);
  return m < 8 ? "Pin is right where you are" : `Pin is ${formatDistance(m)} from you`;
}

/** 409 body: `{ candidateIds, candidates: ToiletSummary[] }` (API_CONTRACT.md, Submissions). */
function duplicateCandidates(e: unknown): ToiletSummary[] | null {
  if (!isApiError(e) || e.status !== 409) return null;
  const b = e.body as Record<string, unknown> | null;
  const list = (b?.candidates ?? b?.duplicates ?? (b?.data as Record<string, unknown> | undefined)?.candidates) as
    | ToiletSummary[]
    | undefined;
  return Array.isArray(list) ? list : [];
}

export function AddClient() {
  const meQ = useRequireAuth();
  const loc = useLocation();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<ToiletSummary[] | null>(null);
  const [done, setDone] = useState<SubmissionView | null>(null);
  const [recenter, setRecenter] = useState(0);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const pin = d.pin ?? loc.coords;

  const canNext = [
    !!d.pin || loc.settled,
    !!d.venue || !!(d.newVenue && d.newVenue.name.trim().length >= 2),
    true,
    true,
    d.photos.length >= 1,
    true,
  ][step];

  const user = loc.source === "gps" ? loc.coords : null;
  const place = useNearestPlace(pin);

  // Move focus to the new step's heading so screen readers and keyboards start at the top of it.
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHeading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  async function submit(force = false) {
    setSubmitting(true);
    setSubmitError(null);
    const features: Partial<Record<Feature, boolean>> = {};
    for (const [f, v] of Object.entries(d.features)) if (v !== "unknown" && v) features[f as Feature] = v === "yes";
    const payload: NewToiletPayload = {
      ...(d.venue ? { venueId: d.venue.id } : { newVenue: { name: d.newVenue!.name.trim(), type: d.newVenue!.type } }),
      lat: pin.lat,
      lng: pin.lng,
      label: d.label.trim() || undefined,
      level: d.level.trim() || undefined,
      areaType: d.areaType,
      accessNote: d.accessNote.trim() || undefined,
      features,
      photoIds: d.photos.map((p) => p.id),
    };
    try {
      const res = await api.createSubmission({
        kind: "NEW_TOILET",
        // Where the submitter is standing (only if we really know).
        ...(loc.source === "gps" ? { lat: loc.coords.lat, lng: loc.coords.lng } : {}),
        payload,
        ...(force ? { force: true } : {}),
      });
      setDone(res);
    } catch (e) {
      const c = duplicateCandidates(e);
      if (c) setDupes(c);
      else setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (meQ.isLoading || !meQ.data) {
    return <Spinner label={meQ.isLoading ? "Checking your account" : "Taking you to sign in"} />;
  }

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pb-8 pt-10" data-testid="add-success">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* The one authored moment: the mascot plops in, squashed, and springs upright. */}
          <Mascot
            mood="celebrating"
            className="size-28 origin-bottom transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] starting:translate-y-3 starting:scale-x-110 starting:scale-y-75"
          />
          <h1 ref={doneHeading} tabIndex={-1} className="text-3xl leading-tight sm:text-4xl">
            Steady lah! Submitted.
          </h1>
          <p className="max-w-sm text-muted">
            Thanks for adding {d.venue?.name ?? d.newVenue?.name ?? "this toilet"}. Here&apos;s what happens next.
          </p>
        </div>

        <ol
          className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest"
          aria-label="What happens next"
        >
          <NextStep icon={<PinGlyph variant="pending" className="size-9" />} title="It's on the map now, as a pending pin">
            The dashed outline means it&apos;s waiting for review. People can see it, but we won&apos;t send anyone there
            for directions yet.
          </NextStep>
          <NextStep
            icon={
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-primary">
                <Users className="size-5" aria-hidden />
              </span>
            }
            title="Two people nearby approve it"
          >
            Or one trusted member does. You&apos;ll see how it&apos;s going under your submissions.
          </NextStep>
          <NextStep icon={<PinGlyph variant="community" className="size-9" />} title="It goes live and you earn 20 points">
            It becomes a Community toilet and can show up in directions.
          </NextStep>
        </ol>

        <div className="flex w-full flex-col gap-2">
          <Link href="/" className={buttonClass("primary", "lg")}>
            Back to the map
          </Link>
          <Link href="/me" className={buttonClass("secondary", "lg")}>
            See my submissions
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setD(EMPTY);
              setStep(0);
              setDone(null);
              setDupes(null);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4 md:pt-10">
      <PageHeader title="Add a toilet" subtitle="Found one that's not on the map? Every toilet added helps someone in a hurry." />

      <ol className="mb-6 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <span
              className={cx(
                "block h-2.5 rounded-full transition-colors duration-300",
                i <= step ? "bg-primary shadow-gloss" : "bg-surface-2",
              )}
            />
            <span
              className={cx(
                "mt-1.5 block text-center text-xs",
                i === step ? "font-extrabold text-fg" : i < step ? "font-bold text-primary" : "font-medium text-muted",
              )}
            >
              <span className="sr-only">Step {i + 1}: </span>
              {s}
              {i === step ? <span className="sr-only"> (current)</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <h2 ref={stepHeading} className="mb-4 text-2xl leading-tight" tabIndex={-1}>
        <span className="text-muted">
          Step {step + 1} of {STEPS.length}:
        </span>{" "}
        {["Where is it?", "Which place is it in?", "Help people find it", "What's inside?", "Snap a photo", "Check and submit"][step]}
      </h2>

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">Drag the map so the pin sits on the toilet entrance.</p>
          <div className="h-[50dvh] overflow-hidden rounded-3xl border border-border/70 shadow-rest">
            <ToiletMap
              className="size-full"
              center={pin}
              recenterKey={recenter}
              zoom={18}
              showPins
              user={user}
              onCenterChange={(c) => set("pin", c)}
              label="Pick the toilet location"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest">
            <PinGlyph variant="picker" className="size-8" />
            <p className="min-w-0 flex-1" aria-live="polite">
              <PinPlaceText place={place} />
              <span className="block text-sm text-muted">
                {fromYouText(pin, user) ?? "Tap “Use my location” to see how far it is from you."}
              </span>
            </p>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={async () => {
                const c = await loc.locate();
                if (c) {
                  set("pin", c);
                  setRecenter((n) => n + 1);
                }
              }}
            >
              <LocateFixed className="size-4" aria-hidden /> Use my location
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 ? <VenueStep pin={pin} d={d} setD={setD} /> : null}

      {step === 2 ? (
        <div className="flex flex-col gap-5">
          <Field label="Label (optional)" htmlFor="label" hint='E.g. "Near Exit B", "Beside food court"'>
            <input id="label" className={inputClass} maxLength={80} value={d.label} onChange={(e) => set("label", e.target.value)} />
          </Field>
          <Field label="Level (optional)" htmlFor="level" hint="B1, L1, L3…">
            <input id="level" className={inputClass} maxLength={10} value={d.level} onChange={(e) => set("level", e.target.value)} />
          </Field>
          <fieldset aria-describedby="area-help">
            <legend className="font-bold">Fare gates</legend>
            <p id="area-help" className="mb-3 text-sm text-muted">
              MRT and bus interchange toilets inside the fare gates need a card tap to reach. Pick &ldquo;No fare gates&rdquo;
              for malls, hawker centres and anywhere else.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AREA_TYPES.map((a) => (
                <label
                  key={a}
                  className={cx(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-full border-2 px-4 py-2 transition-colors",
                    d.areaType === a
                      ? "border-primary bg-primary-soft font-extrabold"
                      : "border-border/70 bg-surface font-bold shadow-rest hover:border-primary/60",
                  )}
                >
                  <input
                    type="radio"
                    name="areaType"
                    value={a}
                    checked={d.areaType === a}
                    onChange={() => set("areaType", a)}
                    className="size-5 shrink-0 appearance-none rounded-full border-2 border-muted bg-surface transition-[border-width,border-color] checked:border-[6px] checked:border-primary focus-visible:rounded-full"
                  />
                  {AREA_TYPE_LABELS[a]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Access note (optional)" htmlFor="access" hint='E.g. "Customers only", "Ask counter for key"'>
            <textarea
              id="access"
              rows={2}
              className={inputClass}
              maxLength={300}
              value={d.accessNote}
              onChange={(e) => set("accessNote", e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-6">
          <p className="text-muted">
            Everything starts as <strong className="font-extrabold text-fg">Not sure</strong>. Only change what you&apos;ve
            seen with your own eyes; a wrong &ldquo;Yes&rdquo; is worse than a blank.
          </p>
          {FEATURE_GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2.5 font-display text-lg">{g.title}</h3>
              <ul className="flex flex-col gap-2">
                {g.features.map((f) => (
                  <li key={f}>
                    <TriToggle
                      label={FEATURE_LABELS[f]}
                      value={d.features[f] ?? "unknown"}
                      onChange={(v) => setD((x) => ({ ...x, features: { ...x.features, [f]: v } }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            A photo of the entrance or signage helps reviewers confirm it. Please don&apos;t include people. We shrink it and
            strip location data before uploading.
          </p>
          <PhotoPicker value={d.photos} onChange={(p) => set("photos", p)} max={3} label="Take or choose photo" required />
          {d.photos.length === 0 ? <p className="text-sm font-bold">At least one photo is required.</p> : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="flex flex-col gap-3">
          <Card className="p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row k="Place" v={d.venue ? d.venue.name : `${d.newVenue?.name} (new ${VENUE_TYPE_LABELS[d.newVenue!.type].toLowerCase()})`} />
              <Row k="Pin" v={pinSummary(place.nearest, fromYouText(pin, user))} />
              <Row k="Label" v={d.label || "—"} />
              <Row k="Level" v={d.level || "—"} />
              <Row k="Fare gates" v={AREA_TYPE_LABELS[d.areaType]} />
              <Row k="Access" v={d.accessNote || "—"} />
              <Row
                k="Has"
                v={
                  Object.entries(d.features)
                    .filter(([, v]) => v === "yes")
                    .map(([f]) => FEATURE_LABELS[f as Feature])
                    .join(", ") || "—"
                }
              />
              <Row
                k="Doesn't have"
                v={
                  Object.entries(d.features)
                    .filter(([, v]) => v === "no")
                    .map(([f]) => FEATURE_LABELS[f as Feature])
                    .join(", ") || "—"
                }
              />
              <Row k="Photos" v={`${d.photos.length}`} />
            </dl>
          </Card>

          {dupes ? (
            <Card className="border-2 border-warn bg-warn-soft p-5" role="alert">
              <h3 className="font-display text-xl">Is it one of these?</h3>
              <p className="mt-1">We already have toilets very close to your pin.</p>
              {dupes.length ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {dupes.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface px-4 py-3 shadow-rest"
                    >
                      <span className="min-w-0">
                        <span className="block font-extrabold">{t.venue.name}</span>
                        <span className="text-sm text-muted">
                          {[t.label, t.level && `Level ${t.level}`, formatDistance(t.distanceM ?? haversineM(pin, t))]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Link href={`/toilets/${t.id}`} className={buttonClass("secondary", "sm", "shrink-0 whitespace-nowrap")}>
                        Yes, view
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button variant="primary" className="mt-3 w-full" loading={submitting} onClick={() => void submit(true)}>
                No, it&apos;s a different toilet
              </Button>
            </Card>
          ) : null}

          {submitError ? (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 font-bold text-danger">
              {submitError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex gap-2">
        {step > 0 ? (
          <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-5" aria-hidden /> Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)} data-testid="add-next">
            Next <ArrowRight className="size-5" aria-hidden />
          </Button>
        ) : !dupes ? (
          <Button size="lg" className="flex-1" loading={submitting} onClick={() => void submit(false)} data-testid="add-submit">
            <Check className="size-5" aria-hidden /> Submit for review
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** "Near Plaza Singapura" (or the closest place we know), for the pin step. */
function PinPlaceText({ place }: { place: ReturnType<typeof useNearestPlace> }) {
  const n = place.nearest;
  if (place.isLoading) return <span className="block font-extrabold">Finding the nearest place…</span>;
  if (!n) {
    return (
      <span className="block font-extrabold">
        {place.isError ? "Couldn't look up places here" : "No place we know of within 300 m"}
      </span>
    );
  }
  return n.distanceM <= 60 ? (
    <span className="block font-extrabold">At or near {n.name}</span>
  ) : (
    <span className="block font-extrabold">
      {formatDistance(n.distanceM)} from {n.name}
    </span>
  );
}

function pinSummary(n: NearbyVenue | null, fromYou: string | null): string {
  const near = n ? (n.distanceM <= 60 ? `At or near ${n.name}` : `${formatDistance(n.distanceM)} from ${n.name}`) : "Set on the map";
  return fromYou ? `${near}. ${fromYou}.` : near;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-bold text-muted">{k}</dt>
      <dd className="font-medium break-words">{v}</dd>
    </div>
  );
}

function NextStep({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block font-extrabold">{title}</span>
        <span className="block text-muted">{children}</span>
      </span>
    </li>
  );
}

function TriToggle({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  const name = useId();
  // Selected Yes is a solid ok fill (text-surface keeps it ≥4.5:1 in both themes); No is soft danger; Not sure is plain.
  const opts: { v: Tri; text: string; icon: React.ReactNode; on: string }[] = [
    { v: "yes", text: "Yes", icon: <Check className="size-4" aria-hidden />, on: "bg-ok text-surface shadow-gloss" },
    { v: "no", text: "No", icon: <X className="size-4" aria-hidden />, on: "bg-danger-soft text-danger ring-2 ring-inset ring-danger" },
    { v: "unknown", text: "Not sure", icon: <CircleHelp className="size-4" aria-hidden />, on: "bg-surface text-fg shadow-rest" },
  ];
  return (
    <fieldset
      className={cx(
        "flex items-center gap-3 rounded-[28px] border-2 bg-surface py-1.5 pl-4 pr-1.5 shadow-rest transition-colors",
        value === "unknown" ? "border-border/70" : "border-primary/70",
      )}
    >
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="min-w-0 flex-1 font-bold">
        {label}
      </span>
      <div className="flex shrink-0 gap-0.5 rounded-full bg-surface-2 p-1">
        {opts.map((o) => (
          <label
            key={o.v}
            className={cx(
              "flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full px-3 text-sm font-extrabold transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === o.v ? o.on : "text-muted hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.v}
              checked={value === o.v}
              onChange={() => onChange(o.v)}
              className="sr-only"
              aria-label={`${label}: ${o.text}`}
            />
            {o.icon}
            <span aria-hidden>{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function VenueStep({ pin, d, setD }: { pin: LatLng; d: Draft; setD: React.Dispatch<React.SetStateAction<Draft>> }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [mode, setMode] = useState<"pick" | "new">(d.newVenue ? "new" : "pick");

  const nearby = useQuery({
    queryKey: ["venues-nearby", pin.lat.toFixed(4), pin.lng.toFixed(4)],
    queryFn: () => api.nearbyVenues({ lat: pin.lat, lng: pin.lng, radius: 300 }),
  });
  const search = useQuery({
    queryKey: ["venues-search", dq, pin.lat.toFixed(3), pin.lng.toFixed(3)],
    queryFn: ({ signal }) => api.searchVenues({ q: dq, lat: pin.lat, lng: pin.lng }, signal),
    enabled: dq.length >= 2,
  });

  const list: (VenueLite & { distanceM?: number })[] = useMemo(
    () => (dq.length >= 2 ? (search.data?.items ?? []) : (nearby.data?.items ?? [])),
    [dq, search.data, nearby.data],
  );
  const loading = dq.length >= 2 ? search.isLoading : nearby.isLoading;
  const err = dq.length >= 2 ? search.error : nearby.error;

  if (mode === "new") {
    return (
      <div className="flex flex-col gap-4">
        <Field label="Place name" htmlFor="venue-name" hint='E.g. "Blk 123 Toa Payoh Coffee Shop"'>
          <input
            id="venue-name"
            className={inputClass}
            maxLength={100}
            value={d.newVenue?.name ?? ""}
            onChange={(e) =>
              setD((x) => ({ ...x, venue: null, newVenue: { name: e.target.value, type: x.newVenue?.type ?? "OTHER" } }))
            }
          />
        </Field>
        <Field label="Type of place" htmlFor="venue-type">
          <select
            id="venue-type"
            className={inputClass}
            value={d.newVenue?.type ?? "OTHER"}
            onChange={(e) =>
              setD((x) => ({ ...x, venue: null, newVenue: { name: x.newVenue?.name ?? "", type: e.target.value as VenueType } }))
            }
          >
            {VENUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VENUE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="ghost"
          onClick={() => {
            setMode("pick");
            setD((x) => ({ ...x, newVenue: null }));
          }}
        >
          Pick an existing place instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-full border-2 border-border bg-surface-2 px-4 focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <label htmlFor="venue-q" className="sr-only">
          Search places
        </label>
        <input
          id="venue-q"
          type="search"
          className="min-h-12 w-full bg-transparent font-medium placeholder:text-muted focus:outline-none"
          placeholder="Search mall, MRT, hawker centre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <p className="mt-1 text-sm font-bold text-muted">{dq.length >= 2 ? "Search results" : "Places near your pin"}</p>
      {loading ? <Spinner label="Looking" /> : null}
      {err ? <p className="text-sm text-danger">{errorMessage(err)}</p> : null}
      {!loading && !err && list.length === 0 ? <p className="text-muted">Nothing found. Add it as a new place below.</p> : null}
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Place">
        {list.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              role="radio"
              aria-checked={d.venue?.id === v.id}
              onClick={() => setD((x) => ({ ...x, venue: v, newVenue: null }))}
              className={cx(
                "flex min-h-16 w-full items-center gap-3 rounded-3xl border-2 px-3 py-2.5 text-left transition-colors",
                d.venue?.id === v.id
                  ? "border-primary bg-primary-soft"
                  : "border-border/70 bg-surface shadow-rest hover:border-primary/60",
              )}
              data-testid="venue-option"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
                <Building2 className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{v.name}</span>
                <span className="text-sm text-muted">
                  {VENUE_TYPE_LABELS[v.type]}
                  {v.distanceM !== undefined ? ` · ${formatDistance(v.distanceM)}` : ""}
                </span>
              </span>
              {d.venue?.id === v.id ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Check className="size-4" aria-hidden />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        onClick={() => {
          setMode("new");
          setD((x) => ({ ...x, venue: null, newVenue: { name: q.trim(), type: "OTHER" } }));
        }}
      >
        <Plus className="size-4" aria-hidden /> It&apos;s a new place
      </Button>
    </div>
  );
}
