"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Coins,
  LocateFixed,
  MapPinCheck,
  Plus,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ToiletMap } from "@/components/map";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { PinGlyph } from "@/components/pin";
import { TriToggle, type Tri } from "@/components/tri-toggle";
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

const STEPS = ["Pin", "Place", "Details", "Inside"] as const;
/** The API's "on site" distance: a submitter this close to the pin, with a photo, puts it live straight away. */
const ON_SITE_M = 150;
const STEP_TITLES = ["Where is it?", "Which place is it in?", "Help people find it", "What's inside?"] as const;

/** Asked up front: what people filter on in a hurry. The rest folds under "Everything else". */
const LEAD_FEATURES: Feature[] = ["ACCESSIBLE", "BIDET", "TOILET_PAPER", "SITTING", "BABY_CHANGE", "FREE"];
const LEAD_SET: ReadonlySet<Feature> = new Set(LEAD_FEATURES);
const MORE_GROUPS = FEATURE_GROUPS.map((g) => ({ ...g, features: g.features.filter((f) => !LEAD_SET.has(f)) })).filter(
  (g) => g.features.length,
);

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

/*
 * The draft survives the tab being thrown away, which phones do to free memory while the camera is
 * open. localStorage rather than sessionStorage so a closed tab keeps it too; it expires after a few
 * hours, since an old half-added toilet is more confusing than helpful.
 */
const DRAFT_KEY = "sgw:add-draft";
const DRAFT_TTL_MS = 6 * 3_600_000;

interface Saved {
  at: number;
  step: number;
  d: Draft;
}

function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Saved | null;
    if (!v || typeof v.step !== "number" || !v.d || Date.now() - v.at > DRAFT_TTL_MS) return null;
    return { ...v, step: Math.min(Math.max(0, v.step), STEPS.length - 1), d: { ...EMPTY, ...v.d } };
  } catch {
    return null;
  }
}

function saveDraft(step: number, d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), step, d } satisfies Saved));
  } catch {
    // Private mode or full storage: the wizard still works, it just won't survive a reload.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** `/add?lat=…&lng=…` (from an empty map area) starts the pin there instead of where you stand. */
function pinFromUrl(): LatLng | null {
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  return q.has("lat") && q.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Client only: the page shows a spinner until hydration is done, so the server never renders the wizard. */
function initialDraft(): Draft {
  if (typeof window === "undefined") return EMPTY;
  return { ...EMPTY, pin: pinFromUrl() };
}

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
  const [restored] = useState(() => (typeof window === "undefined" ? null : loadSaved()));
  const [showRestored, setShowRestored] = useState(!!restored);
  const [step, setStep] = useState(restored?.step ?? 0);
  // Which way the last Next / Back went, so the new step slides in from that side.
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  const [d, setD] = useState<Draft>(() => restored?.d ?? initialDraft());
  const [photoBusy, setPhotoBusy] = useState(false);
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
    // A photo still uploading would be dropped from the submission, so wait for it.
    !photoBusy,
  ][step];

  // Keep the draft as it changes; a finished submission clears it.
  useEffect(() => {
    if (!done) saveDraft(step, d);
  }, [step, d, done]);

  function startOver() {
    clearDraft();
    setD(initialDraft());
    setStepDir(-1);
    setStep(0);
    setDupes(null);
    setSubmitError(null);
    setShowRestored(false);
  }

  const featureRow = (f: Feature) => (
    <li key={f}>
      <TriToggle
        label={FEATURE_LABELS[f]}
        value={d.features[f] ?? "unknown"}
        onChange={(v) => setD((x) => ({ ...x, features: { ...x.features, [f]: v } }))}
      />
    </li>
  );
  // Shown on the folded "Everything else", so answers inside it aren't out of sight and out of mind.
  const moreAnswered = Object.entries(d.features).filter(([f, v]) => v && v !== "unknown" && !LEAD_SET.has(f as Feature)).length;

  const user = loc.source === "gps" ? loc.coords : null;
  const place = useNearestPlace(pin);
  // Within 150 m of the pin by GPS: the API counts it as added on site, and with a photo it goes live at once.
  const onSite = !!user && haversineM(user, pin) <= ON_SITE_M;

  /** Steps slide in the way you're going (globals.css "Wizard steps"). */
  function goStep(dir: 1 | -1) {
    setStepDir(dir);
    setStep((s) => s + dir);
  }

  // Move focus to the new step's heading so screen readers and keyboards start at the top of it.
  // A layout effect, so any scroll to the heading lands before the new step paints.
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useLayoutEffect(() => {
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
      clearDraft();
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
    // Which rule decides it (trust model v2). An older API sends no path: that was always the two-approvals story.
    const path = done.path ?? "nearby_quorum";
    const live = path === "auto";
    const pendingPin = (
      <NextStep icon={<PinGlyph variant="pending" className="size-9" />} title="It's on the map now, as a pending pin">
        The dashed outline means it&apos;s waiting for review. People can see it, but we won&apos;t send anyone there for
        directions yet.
      </NextStep>
    );
    const goesLive = (
      <NextStep icon={<PinGlyph variant="community" className="size-9" />} title="It goes live and you earn 20 points">
        It becomes a Community toilet and can show up in directions.
      </NextStep>
    );
    const iconDisc = (icon: React.ReactNode) => (
      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-primary">{icon}</span>
    );
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pb-8 pt-10" data-testid="add-success">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* The celebration: the mascot plops in, squashed, and springs upright (shared with check-in). */}
          <Mascot mood="celebrating" className="celebrate-in size-28" />
          <h1 ref={doneHeading} tabIndex={-1} className="text-3xl leading-tight sm:text-4xl">
            {live ? "Shiok! It's live now." : "Steady lah! Submitted."}
          </h1>
          <p className="max-w-sm text-muted">
            Thanks for adding {d.venue?.name ?? d.newVenue?.name ?? "this toilet"}.{" "}
            {live ? "You added it on site with a photo, so it's on the map straight away." : "Here's what happens next."}
          </p>
        </div>

        <ol
          className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest"
          aria-label={live ? "What happened" : "What happens next"}
        >
          {live ? (
            <>
              <NextStep icon={<PinGlyph variant="community" className="size-9" />} title="It's live now, as a Community toilet">
                People can find it and get directions to it.
              </NextStep>
              <NextStep icon={iconDisc(<Coins className="size-5 text-accent" aria-hidden />)} title="+5 points now">
                And +15 more when someone else checks in there.
              </NextStep>
            </>
          ) : path === "on_site_check_in" ? (
            <>
              {pendingPin}
              <NextStep
                icon={iconDisc(<MapPinCheck className="size-5" aria-hidden />)}
                title="Live once one other person checks in there, or a moderator confirms it"
              >
                You added it on site, so one check-in by someone else is enough. You&apos;ll see how it&apos;s going under your
                submissions.
              </NextStep>
              {goesLive}
            </>
          ) : (
            <>
              {pendingPin}
              <NextStep icon={iconDisc(<Users className="size-5" aria-hidden />)} title="Two people nearby approve it">
                Or one trusted member does. Checking in there counts as approving. You&apos;ll see how it&apos;s going under your
                submissions.
              </NextStep>
              {goesLive}
            </>
          )}
        </ol>

        <div className="flex w-full flex-col gap-2">
          <Link href="/" className={buttonClass("primary", "lg")}>
            Back to the map
          </Link>
          <Link href="/me?tab=activity" className={buttonClass("secondary", "lg")}>
            See my submissions
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setD(EMPTY);
              setStep(0);
              setDone(null);
              setDupes(null);
              setShowRestored(false);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    // Bottom padding on phones clears the fixed action bar (below) as well as the nav. Clipped
    // sideways on phones, so a step sliding in never widens the page and makes the browser zoom out.
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 max-md:overflow-x-clip md:pb-0 md:pt-10">
      <PageHeader title="Add a toilet">
        {/* Phones need the room for the step itself, so the pin step fits above the action bar. */}
        <p className="text-muted max-sm:hidden">Found one that&apos;s not on the map? Every toilet added helps someone in a hurry.</p>
      </PageHeader>

      {meQ.data.openSubmissions.count >= meQ.data.openSubmissions.limit ? (
        // Said before they pin anything: the API refuses a new one at the cap, and finding out at Submit wastes the walk.
        <p role="status" className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-bold text-fg">
          You have {meQ.data.openSubmissions.count} submissions waiting for review, the most you can have at once. A slot frees up
          when one is decided, or 14 days after you sent it.{" "}
          <Link href="/me?tab=activity" className="inline-flex min-h-11 items-center text-primary underline">
            See your submissions
          </Link>
        </p>
      ) : null}

      {showRestored ? (
        <p role="status" className="-mt-2 mb-4 flex flex-wrap items-center gap-x-3 font-bold text-muted">
          Picked up where you left off.
          <button
            type="button"
            onClick={startOver}
            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
          >
            <RotateCcw className="size-4" aria-hidden /> Start over
          </button>
        </p>
      ) : null}

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

      {/* Keyed by step, so each Next / Back replays the entrance. Never blocks taps while it plays. */}
      <div key={step} className={step === 0 && stepDir > 0 ? undefined : stepDir > 0 ? "step-in-next" : "step-in-back"}>
        <h2 ref={stepHeading} className="mb-4 text-2xl leading-tight" tabIndex={-1}>
          {/* The progress bar above already says where you are; screen readers still hear the step count. */}
          <span className="sr-only">
            Step {step + 1} of {STEPS.length}:{" "}
          </span>
          {STEP_TITLES[step]}
        </h2>

        {step === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted">Drag the map so the pin sits on the toilet entrance.</p>
            {/* Sized so the whole step fits above the action bar on a typical phone and laptop. */}
            <div className="relative h-[max(15rem,38dvh)] overflow-hidden rounded-3xl border border-border/70 shadow-rest md:h-[max(15rem,42dvh)]">
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
              {/* On the map, where the eyes already are; top left, clear of the zoom buttons. */}
              <Button
                variant="secondary"
                size="sm"
                className="absolute left-3 top-3 border-2 border-border bg-surface shadow-card active:scale-[0.96]"
                onClick={async () => {
                  const c = await loc.locate();
                  if (c) {
                    set("pin", c);
                    setRecenter((n) => n + 1);
                  }
                }}
              >
                <LocateFixed className={cx("size-4 text-primary", loc.status === "locating" && "animate-pulse")} aria-hidden />{" "}
                Use my location
              </Button>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-surface px-4 py-3 shadow-rest">
              <PinGlyph variant="picker" className="size-8 shrink-0" />
              <p className="min-w-0 flex-1" aria-live="polite">
                <PinPlaceText place={place} />
                <span className="block text-sm text-muted">
                  {fromYouText(pin, user) ?? "Tap “Use my location” to see how far it is from you."}
                </span>
              </p>
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
            <div>
              <p className="font-bold">Photo (optional)</p>
              {/* Only promised when it's true: within 150 m of the pin by GPS (the API's on-site rule). */}
              {onSite ? (
                <p className="mt-1 rounded-2xl bg-mint-soft px-3 py-2 text-sm font-bold text-fg">
                  Add a photo while you&apos;re here and it goes live straight away, without waiting for review.
                </p>
              ) : null}
              <p className="mb-3 mt-1 text-sm text-muted">
                {onSite
                  ? "The entrance or a sign is best (up to 3 toilets a day go live this way)."
                  : "The entrance or a sign helps people nearby confirm it."}{" "}
                No people, please. We shrink it and strip location data before uploading.
              </p>
              <PhotoPicker
                value={d.photos}
                onChange={(p) => set("photos", p)}
                onBusyChange={setPhotoBusy}
                max={3}
                label="Take or choose photo"
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-5">
            <p className="text-muted">
              Only answer what you&apos;ve seen and leave the rest as{" "}
              <strong className="font-extrabold text-fg">Not sure</strong>. A wrong &ldquo;Yes&rdquo; is worse than a blank.
            </p>
            <ul className="flex flex-col gap-2">{LEAD_FEATURES.map(featureRow)}</ul>
            <details className="group">
              <summary className="-mx-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                Everything else
                {moreAnswered ? <span className="font-bold text-muted">· {moreAnswered} answered</span> : null}
                <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-3 flex flex-col gap-5">
                {MORE_GROUPS.map((g) => (
                  <div key={g.title}>
                    <h3 className="mb-2.5 font-display text-lg">{g.title}</h3>
                    <ul className="flex flex-col gap-2">{g.features.map(featureRow)}</ul>
                  </div>
                ))}
              </div>
            </details>

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
      </div>

      {/*
        Always in reach: on phones a bar fixed above the bottom nav (its padding runs down behind
        the nav and clears the bar's bump), from md up a bar stuck to the window bottom.
      */}
      <div
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 rounded-t-[28px] border-t border-border bg-surface px-4 pt-3 shadow-card",
          "pb-[calc(var(--nav-h)+var(--nav-crown)+0.75rem+env(safe-area-inset-bottom))]",
          "md:sticky md:inset-x-auto md:-mx-4 md:mt-6 md:rounded-none md:bg-bg md:pb-6 md:pt-4 md:shadow-none",
        )}
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          {step > 0 ? (
            <Button variant="secondary" size="lg" onClick={() => goStep(-1)}>
              <ArrowLeft className="size-5" aria-hidden /> Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={!canNext}
              loading={step === 2 && photoBusy}
              onClick={() => goStep(1)}
              data-testid="add-next"
            >
              Next <ArrowRight className="size-5" aria-hidden />
            </Button>
          ) : !dupes ? (
            <Button size="lg" className="flex-1" loading={submitting} onClick={() => void submit(false)} data-testid="add-submit">
              <Check className="size-5" aria-hidden /> Submit for review
            </Button>
          ) : null}
        </div>
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
      <div className="flex items-center gap-2 rounded-full border-2 border-border-strong bg-surface-2 px-4 focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
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
