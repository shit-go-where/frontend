import { ImageResponse } from "next/og";
import { getToiletServer } from "@/lib/api/server";
import type { Feature, ToiletDetail } from "@/lib/api/types";
import { FEATURE_LABELS, TIER_LABELS, VENUE_TYPE_LABELS, scoreNumber, toiletTag } from "@/lib/format";
import { OG, OG_SIZE, OgChip, OgFrame, OgLogo, OgSticker, ogVerdict, ogVerifiedText } from "@/lib/og";
import { isUnnamed, nearPhrase } from "@/lib/unnamed-toilet";

/*
 * A toilet's share card (GROWTH.md 1.6), so a link pasted into a chat says what it is before anyone
 * opens it: the place and its label, the tier with how long ago it was last verified (always shown,
 * the Honest Pin Rule), the cleanliness out of 10 when there is one, up to three key features, and a
 * verdict word on the score (lib/og.tsx ogVerdict). The verdict is the joke; every fact beside it is
 * plain. page.tsx prefers a real photo when the toilet has one. If the API is down the card falls back
 * to the plain brand, never a broken image.
 *
 * Sized for the small previews Telegram and WhatsApp show (often about a quarter of 1200 px wide):
 * the name, the score and the verdict are the big type; nothing on the card goes under 30 px.
 */

export const alt = "A toilet on Shit Go Where?";
export const size = OG_SIZE;
export const contentType = "image/png";

/** What people ask first, in order; the first three the toilet has make the card. */
const KEY_FEATURES: Feature[] = ["BIDET", "ACCESSIBLE", "BABY_CHANGE", "FREE", "NURSING_ROOM", "SHOWER", "TOILET_PAPER"];

/** The Honest Pin Rule, in share-card form: verified fills caramel, community outlines it, imported fades. */
function TierPill({ t }: { t: ToiletDetail }) {
  const pending = t.status === "PENDING";
  const label = pending ? "Pending review" : TIER_LABELS[t.tier];
  const style: React.CSSProperties = pending
    ? { border: `3px dashed ${OG.yellow}`, color: OG.yellow }
    : t.tier === "VERIFIED"
      ? { background: OG.caramel, border: `3px solid ${OG.caramel}`, color: OG.caramelInk }
      : t.tier === "COMMUNITY"
        ? { border: `3px solid ${OG.caramel}`, color: OG.caramel }
        : { border: `3px solid ${OG.toffee}`, color: OG.toffee };
  return <div style={{ display: "flex", padding: "6px 22px", borderRadius: 999, fontSize: 32, ...style }}>{label}</div>;
}

/** Drawn, not a glyph: the bundled font has no star, and a missing glyph would be fetched at render time. */
function Star({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" fill={OG.gold} />
    </svg>
  );
}

/** Cleanliness out of 10 as a sticker-like tile, like the detail page's verdict card, with the verdict on its corner. */
function ScoreTile({ score, verdict }: { score: number; verdict: string | null }) {
  return (
    <div style={{ display: "flex", position: "relative", flexShrink: 0, paddingTop: verdict ? 30 : 0 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 300,
          padding: verdict ? "48px 24px 24px" : "24px 24px 24px",
          borderRadius: 40,
          background: OG.surface,
          border: `3px solid ${OG.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4 }}>{scoreNumber(score)}</div>
          <div style={{ fontSize: 44, color: OG.toffee, marginLeft: 6 }}>/10</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 30, color: OG.toffee }}>
          <Star size={30} />
          Cleanliness
        </div>
      </div>
      {verdict ? (
        <div style={{ display: "flex", position: "absolute", top: 0, right: -22 }}>
          <OgSticker>{verdict}</OgSticker>
        </div>
      ) : null}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getToiletServer(id);
  const t = r.kind === "ok" ? r.data : null;

  // Name and label apart, so the label and who it's for ("Women's · DTL side") get their own line instead of a bracket.
  const name = !t ? "A toilet in Singapore" : isUnnamed(t) && t.near ? `${t.venue.name} ${nearPhrase(t.near)}` : t.venue.name;
  const kind = t ? (t.venue.type !== "OTHER" ? VENUE_TYPE_LABELS[t.venue.type] : null) : null;
  const sub = t ? [toiletTag(t), kind, t.venue.planningArea].filter(Boolean).join(" · ") : "";
  const status = t?.status === "CLOSED" ? "Closed" : t?.status === "RENOVATION" ? "Under renovation" : null;
  const score = t && !status ? t.scoreCleanliness : null;
  // A verdict only for a live toilet; "Shiok!" on a pending or closed one would oversell it.
  const verdict = t?.status === "ACTIVE" ? ogVerdict(score) : null;
  const features = t ? KEY_FEATURES.filter((f) => t.features.includes(f)).slice(0, 3) : [];

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <OgLogo size={56} />
          <div style={{ fontSize: 30, color: OG.toffee }}>Shit Go Where?</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "block",
                fontSize: name.length > 28 ? 56 : 72,
                lineHeight: 1.08,
                letterSpacing: -1,
                lineClamp: 2,
                overflow: "hidden",
              }}
            >
              {name}
            </div>
            {sub ? (
              <div style={{ display: "block", marginTop: 14, fontSize: 34, color: OG.toffee, lineClamp: 1, overflow: "hidden" }}>
                {sub}
              </div>
            ) : null}
            {features.length ? (
              <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
                {features.map((f) => (
                  <OgChip key={f}>{FEATURE_LABELS[f]}</OgChip>
                ))}
              </div>
            ) : null}
          </div>
          {score !== null ? <ScoreTile score={score} verdict={verdict} /> : null}
        </div>

        {t ? (
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <TierPill t={t} />
            <div style={{ fontSize: 30, color: OG.toffee }}>{ogVerifiedText(t.lastVerifiedAt)}</div>
            {status ? (
              <div style={{ fontSize: 32, color: OG.red }}>{`· ${status}`}</div>
            ) : score === null ? (
              <div style={{ fontSize: 30, color: OG.toffee }}>· No cleanliness score yet</div>
            ) : null}
          </div>
        ) : null}
      </OgFrame>
    ),
    size,
  );
}
