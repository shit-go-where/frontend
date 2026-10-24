import { ImageResponse } from "next/og";
import { OG_SIZE, OgFrame, OgLogo } from "@/lib/og";
import { NAME } from "./content";

/* /creator's share card: the name big, then what he made. Text only, so it reads at chat-preview size. */

export const alt = `${NAME}, creator of Shit Go Where`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 112, lineHeight: 1, letterSpacing: -2 }}>{NAME}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 40 }}>
            <OgLogo size={80} />
            <div style={{ fontSize: 52, lineHeight: 1.2 }}>Creator of Shit Go Where</div>
          </div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
