"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Send, ThumbsUp } from "lucide-react";
import { useId, useState } from "react";
import { Mascot } from "@/components/mascot";
import { TriToggle, type Tri } from "@/components/tri-toggle";
import { Button, Field, cx, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import { FEATURES, type AreaType, type EditToiletPayload, type Feature, type ToiletDetail } from "@/lib/api/types";
import { AREA_TYPE_LABELS, FEATURE_GROUPS, FEATURE_LABELS } from "@/lib/format";

// ---------------------------------------------------------------------------
// "What's inside?": Yes / No / Not sure per feature, plus level and fare gates.
// Answers that differ from the listing go out as an EDIT_TOILET submission for
// people nearby to confirm; no changes after a check-in counts as "all correct".
// ---------------------------------------------------------------------------

export type FactsOutcome = "verified" | "submitted" | "flagged";

const GATED_VENUES: ReadonlySet<string> = new Set(["MRT_STATION", "BUS_INTERCHANGE"]);
const GATE_CHOICES: AreaType[] = ["PAID_AREA", "UNPAID_AREA", "UNKNOWN"];

interface Draft {
  features: Partial<Record<Feature, Tri>>;
  level: string;
  areaType: AreaType;
  note: string;
}

function listedTri(t: ToiletDetail): Partial<Record<Feature, Tri>> {
  const out: Partial<Record<Feature, Tri>> = {};
  for (const d of t.featureDetails) out[d.feature] = d.present ? "yes" : "no";
  return out;
}

const draftOf = (t: ToiletDetail): Draft => ({ features: listedTri(t), level: t.level ?? "", areaType: t.areaType, note: "" });

/** Only real answers that differ from the listing. "Not sure" never clears a recorded fact. */
function changesOf(t: ToiletDetail, d: Draft): EditToiletPayload["changes"] {
  const listed = listedTri(t);
  const features: Partial<Record<Feature, boolean>> = {};
  for (const f of FEATURES) {
    const v = d.features[f];
    if (v && v !== "unknown" && v !== listed[f]) features[f] = v === "yes";
  }
  const level = d.level.trim();
  return {
    ...(Object.keys(features).length ? { features } : {}),
    ...(level && level !== (t.level ?? "") ? { level } : {}),
    ...(d.areaType !== "UNKNOWN" && d.areaType !== t.areaType ? { areaType: d.areaType } : {}),
  };
}

const countChanges = (c: EditToiletPayload["changes"]) =>
  Object.keys(c.features ?? {}).length + (c.level ? 1 : 0) + (c.areaType ? 1 : 0);

/**
 * The form's fields and its submit button, split so a Dialog can pin the button in its footer.
 * `coords` is where the visitor stands; the backend refuses edits without it or from farther
 * than 150 m. `checkedIn` adds the "All correct" path. `lead` features go first; the
 * rest fold away under "Everything else".
 */
export function useFactsForm({
  toilet,
  lead,
  coords,
  checkedIn = false,
  onDone,
}: {
  toilet: ToiletDetail;
  lead?: Feature[];
  coords: { lat: number; lng: number } | null;
  checkedIn?: boolean;
  onDone: (outcome: FactsOutcome) => void;
}) {
  const qc = useQueryClient();
  const ids = useId();
  const [d, setD] = useState(() => draftOf(toilet));
  const changes = changesOf(toilet, d);
  const n = countChanges(changes);
  const note = d.note.trim();

  const send = useMutation({
    mutationFn: async (): Promise<FactsOutcome> => {
      if (n) {
        await api.createSubmission({
          kind: "EDIT_TOILET",
          toiletId: toilet.id,
          ...(coords ?? {}),
          payload: { changes, note: note || undefined },
        });
        return "submitted";
      }
      if (coords && checkedIn) {
        await api.verify(toilet.id, { ...coords, accurate: !note, note: note || undefined });
        return note ? "flagged" : "verified";
      }
      await api.flagToilet(toilet.id, note);
      return "flagged";
    },
    onSuccess: (outcome) => {
      void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
      if (outcome === "submitted") void qc.invalidateQueries({ queryKey: ["my-submissions"] });
      onDone(outcome);
    },
  });

  function reset() {
    setD(draftOf(toilet));
    send.reset();
  }

  const setFeature = (f: Feature, v: Tri) => setD((x) => ({ ...x, features: { ...x.features, [f]: v } }));
  const row = (f: Feature) => (
    <li key={f}>
      <TriToggle label={FEATURE_LABELS[f]} value={d.features[f] ?? "unknown"} onChange={(v) => setFeature(f, v)} />
    </li>
  );

  const gated = GATED_VENUES.has(toilet.venue.type);
  // After a check-in, only ask where it is when we don't know; the full form always offers it.
  const showWhere = !checkedIn || !toilet.level || (gated && toilet.areaType === "UNKNOWN");
  const leadSet = new Set(lead ?? []);
  const groups = FEATURE_GROUPS.map((g) => ({ ...g, features: g.features.filter((f) => !leadSet.has(f)) })).filter(
    (g) => g.features.length,
  );
  const groupList = groups.map((g) => (
    <div key={g.title}>
      <h3 className="mb-2 font-display text-lg">{g.title}</h3>
      <ul className="flex flex-col gap-2">{g.features.map(row)}</ul>
    </div>
  ));

  const fields = (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium text-muted">
        Only change what you can see right now. A wrong &ldquo;Yes&rdquo; is worse than a blank.
      </p>

      {lead?.length ? <ul className="flex flex-col gap-2">{lead.map(row)}</ul> : null}

      {showWhere ? (
        <div className="flex flex-col gap-4">
          <Field label="Level" htmlFor={`${ids}-level`} hint="B1, L1, L3…">
            <input
              id={`${ids}-level`}
              className={inputClass}
              maxLength={20}
              value={d.level}
              onChange={(e) => setD((x) => ({ ...x, level: e.target.value }))}
            />
          </Field>
          {gated ? (
            <fieldset>
              <legend className="mb-2 font-bold">Fare gates</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {GATE_CHOICES.map((a) => (
                  <label
                    key={a}
                    className={cx(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-full border-2 px-4 py-2 text-sm transition-colors",
                      d.areaType === a
                        ? "border-primary bg-primary-soft font-extrabold"
                        : "border-border/70 bg-surface font-bold shadow-rest hover:border-primary/60",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${ids}-area`}
                      value={a}
                      checked={d.areaType === a}
                      onChange={() => setD((x) => ({ ...x, areaType: a }))}
                      className="size-5 shrink-0 appearance-none rounded-full border-2 border-muted bg-surface transition-[border-width,border-color] checked:border-[6px] checked:border-primary focus-visible:rounded-full"
                    />
                    {AREA_TYPE_LABELS[a]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {lead?.length ? (
        <details className="group">
          <summary className="-mx-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            Everything else
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 flex flex-col gap-5">{groupList}</div>
        </details>
      ) : (
        groupList
      )}

      <Field
        label="Anything else? (optional)"
        htmlFor={`${ids}-note`}
        hint={n ? "Reviewers see this with your changes." : "Goes to the moderators."}
      >
        <textarea
          id={`${ids}-note`}
          rows={2}
          maxLength={500}
          className={inputClass}
          placeholder="E.g. bidet is broken, only the accessible toilet has paper…"
          value={d.note}
          onChange={(e) => setD((x) => ({ ...x, note: e.target.value }))}
        />
      </Field>
    </div>
  );

  const label = n
    ? `Send ${n} change${n === 1 ? "" : "s"} for review`
    : note
      ? "Send note to moderators"
      : checkedIn
        ? "All correct"
        : "Nothing changed yet";
  const footer = (
    <div className="flex flex-col gap-2">
      {send.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(send.error)}
        </p>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        disabled={!n && (note ? note.length < 3 : !checkedIn)}
        loading={send.isPending}
        onClick={() => send.mutate()}
      >
        {n || note ? <Send className="size-5" aria-hidden /> : checkedIn ? <ThumbsUp className="size-5" aria-hidden /> : null}
        {label}
      </Button>
    </div>
  );

  return { fields, footer, reset };
}

const THANKS: Record<FactsOutcome, { title: string; body: string }> = {
  verified: { title: "Thanks, legend!", body: "You just made this listing more trustworthy for everyone." },
  submitted: {
    title: "Sent for review",
    body: "Your changes go live once people nearby confirm them. You get +20 points when they're approved.",
  },
  flagged: { title: "Thanks!", body: "A moderator will take a look." },
};

export function FactsThanks({ outcome, onClose }: { outcome: FactsOutcome; onClose: () => void }) {
  const copy = THANKS[outcome];
  return (
    <div className="flex flex-col items-center gap-3 text-center" role="status">
      <Mascot mood="happy" className="size-20" />
      <h3 className="font-display text-2xl leading-tight">{copy.title}</h3>
      <p className="font-medium text-muted">{copy.body}</p>
      <Button className="w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
