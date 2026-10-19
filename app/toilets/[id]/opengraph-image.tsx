import { ImageResponse } from "next/og";
import { getToiletServer } from "@/lib/api/server";
import type { ToiletDetail } from "@/lib/api/types";
import { TIER_LABELS, VENUE_TYPE_LABELS, scoreNumber } from "@/lib/format";
import { OG, OG_SIZE, OgFrame, OgLogo } from "@/lib/og";
import { toiletDisplayTitle } from "@/lib/unnamed-toilet";

/*
 * A toilet's share card: its name, tier and cleanliness, so a link pasted into a chat says what it
 * is before anyone opens it. page.tsx prefers a real photo when the toilet has one. If the API is
 * down the card falls back to the plain brand, never a broken image.
 */

export const alt = "A toilet on Shit Go Where?";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The Honest Pin Rule, in share-card form: verified fills caramel, community outlines it, imported fades. */
function TierPill({ t }: { t: ToiletDetail }) {
  const pending = t.status === "PENDING";
  const label = pending ? "Pending review" : TIER_LABELS[t.tier];
  const style: React.CSSProperties = pending
    ? { border: `3px dashed #ffd76b`, color: "#ffd76b" }
    : t.tier === "VERIFIED"
      ? { background: OG.caramel, border: `3px solid ${OG.caramel}`, color: OG.caramelInk }
      : t.tier === "COMMUNITY"
        ? { border: `3px solid ${OG.caramel}`, color: OG.caramel }
        : { border: `3px solid ${OG.toffee}`, color: OG.toffee };
  return <div style={{ display: "flex", padding: "8px 22px", borderRadius: 999, fontSize: 30, ...style }}>{label}</div>;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getToiletServer(id);
  const t = r.kind === "ok" ? r.data : null;
  const title = t ? toiletDisplayTitle(t) : "A toilet in Singapore";
  const kind = t ? [t.venue.type !== "OTHER" ? VENUE_TYPE_LABELS[t.venue.type] : null, t.venue.planningArea].filter(Boolean).join(" · ") : "";
  const status = t?.status === "CLOSED" ? "Closed" : t?.status === "RENOVATION" ? "Under renovation" : null;

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <OgLogo size={64} />
          <div style={{ fontSize: 34, color: OG.toffee }}>Shit Go Where?</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ fontSize: title.length > 40 ? 64 : 80, lineHeight: 1.1, letterSpacing: -1 }}>{title}</div>
          {kind ? (
            <div style={{ marginTop: 18, fontSize: 36, color: OG.toffee }}>{kind}</div>
          ) : null}
        </div>
        {t ? (
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <TierPill t={t} />
            {status ? (
              <div style={{ fontSize: 34, color: "#ff7a6b" }}>{status}</div>
            ) : t.scoreCleanliness !== null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Drawn, not a glyph: the bundled font has no star, and a missing glyph would be fetched at render time. */}
                <svg width={34} height={34} viewBox="0 0 24 24">
                  <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" fill={OG.gold} />
                </svg>
                <div style={{ fontSize: 44 }}>{scoreNumber(t.scoreCleanliness)}/10</div>
                <div style={{ fontSize: 30, color: OG.toffee }}>clean</div>
              </div>
            ) : (
              <div style={{ fontSize: 30, color: OG.toffee }}>No cleanliness score yet</div>
            )}
          </div>
        ) : null}
      </OgFrame>
    ),
    size,
  );
}
