import { ImageResponse } from "next/og";
import { formatDate } from "@/lib/format";
import { OG, OG_SIZE, OgFrame, OgLogo } from "@/lib/og";
import { CURRENT_ROLE, NAME, UPDATED_AT } from "./content";

/*
 * /creator's share card, laid out like a toilet's (app/toilets/[id]/opengraph-image.tsx): the name big,
 * the Verified pill with its last-verified date, then the current role. Text only: Satori can't decode
 * the webp photo, and a name reads at chat-preview size.
 */

export const alt = `${NAME}, ${CURRENT_ROLE.title} at ${CURRENT_ROLE.company} and creator of Shit Go Where`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** lucide's badge-check, drawn: the bundled font has no check glyph. */
function BadgeCheck({ size: s, color }: { size: number; color: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 112, lineHeight: 1, letterSpacing: -2 }}>{NAME}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34 }}>
            {/* The Honest Pin Rule's verified pill: caramel fill and edge, with the check-badge shape. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 24px 6px 18px",
                borderRadius: 999,
                background: OG.caramel,
                border: `3px solid ${OG.caramel}`,
                color: OG.caramelInk,
                fontSize: 34,
              }}
            >
              <BadgeCheck size={34} color={OG.caramelInk} />
              Verified
            </div>
            <div style={{ fontSize: 30, color: OG.toffee }}>{`Last verified: ${formatDate(UPDATED_AT)}`}</div>
          </div>
          <div style={{ marginTop: 40, fontSize: 46, lineHeight: 1.25 }}>{CURRENT_ROLE.title}</div>
          <div style={{ marginTop: 6, fontSize: 36, color: OG.toffee }}>
            {`Now at ${CURRENT_ROLE.company}${CURRENT_ROLE.location ? `, ${CURRENT_ROLE.location}` : ""}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <OgLogo size={64} />
          <div style={{ fontSize: 34, color: OG.cream }}>Creator of Shit Go Where</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
