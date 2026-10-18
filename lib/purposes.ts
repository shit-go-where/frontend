import { PURPOSES, type Feature, type Purpose } from "./api/types";
import type { FilterKey } from "./filters";

/**
 * The wizard's "what for?" options. The backend turns a purpose into soft ranking preferences
 * (backend/src/routing/purposes.ts); here we only keep what the UI needs.
 */
export interface PurposeOption {
  key: Purpose;
  label: string;
  /** What we'll prioritise, in plain English. */
  hint: string;
  /** Default for the nearest-vs-cleanest slider (0..10) until the user moves it. */
  fussy: number;
  /** Without this the toilet doesn't do the job, so say so when it isn't listed. */
  essential?: Feature;
  /**
   * Must-have filters the wizard marks as suggested: the filterable ones among the backend's
   * preferences for this purpose (PURPOSE_NEEDS in backend/src/routing/purposes.ts). Keep in step.
   * Only ever a suggestion; nothing turns on without a tap.
   */
  suggests: FilterKey[];
}

export const PURPOSE_OPTIONS: PurposeOption[] = [
  { key: "PEE", label: "Quick pee", hint: "Nearest first. Paper and polish matter less.", fussy: 1, suggests: [] },
  {
    key: "POO",
    label: "Number two",
    hint: "Cleaner toilets with paper, a bidet and a sitting toilet first.",
    fussy: 7,
    suggests: ["BIDET", "SITTING"],
  },
  {
    key: "BABY",
    label: "Baby or kids",
    hint: "Baby changing first, then nursing rooms and accessible toilets.",
    fussy: 5,
    essential: "BABY_CHANGE",
    suggests: ["BABY_CHANGE", "NURSING_ROOM", "ACCESSIBLE"],
  },
  {
    key: "SHOWER",
    label: "Shower or change",
    hint: "Toilets with a shower first. Few are listed yet, so check the details.",
    fussy: 3,
    essential: "SHOWER",
    suggests: ["SHOWER"],
  },
  { key: "FRESHEN_UP", label: "Freshen up", hint: "Soap, a mirror and a hand dryer first.", fussy: 6, suggests: [] },
  { key: "PERIOD", label: "Period care", hint: "Sanitary bins, pads or tampons, soap and paper first.", fussy: 6, suggests: [] },
];

const VALID = new Set<string>(PURPOSES);

export function parsePurpose(raw: string | null): PurposeOption | null {
  if (!raw || !VALID.has(raw)) return null;
  return PURPOSE_OPTIONS.find((p) => p.key === raw) ?? null;
}
