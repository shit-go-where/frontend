import type { SexPreference, ToiletSex } from "./api/types";

/**
 * Where a toilet goes among its floor's: the toilets someone uses first, then unisex (the accessible ones),
 * then those not known, then the other sex's. With no preference, men's, women's, unisex, then unknown,
 * the way they usually sit side by side. Lower comes first.
 */
export function sexRank(sex: ToiletSex | null | undefined, pref: SexPreference | null | undefined): number {
  if (!pref) return sex === "MALE" ? 0 : sex === "FEMALE" ? 1 : sex === "UNISEX" ? 2 : 3;
  if (sex === pref) return 0;
  if (sex === "UNISEX") return 1;
  return sex ? 3 : 2;
}
