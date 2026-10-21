import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgChip, OgFrame, OgLogo } from "@/lib/og";
import { NAME } from "./content";

/*
 * /creator's share card, so a link sent to a recruiter previews as Dylan's page rather than the app's
 * default card. Text only: Satori can't decode the webp photo, and a name reads at chat-preview size.
 */

export const alt = "Dylan Chua, software engineer in Singapore and maker of Shit Go Where?";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 104, lineHeight: 1, letterSpacing: -2 }}>{NAME}</div>
          <div style={{ marginTop: 28, fontSize: 44, color: OG.toffee, lineHeight: 1.3 }}>Software engineer in Singapore</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 40 }}>
            {["Full-stack", "Cloud", "Data and AI"].map((s) => (
              <OgChip key={s}>{s}</OgChip>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <OgLogo size={64} />
          <div style={{ fontSize: 34, color: OG.cream }}>Made Shit Go Where?</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
