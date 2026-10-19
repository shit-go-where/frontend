import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgLogo } from "@/lib/og";

/*
 * The default share image, so a link to any page without a photo of its own still previews with
 * the brand. Pages that set their own `openGraph` replace the parent's wholesale (images too), so
 * those pages point at this route (`/opengraph-image`) themselves.
 */

export const alt = "Shit Go Where? Find the nearest clean toilet in Singapore, fast.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
          <OgLogo size={220} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: -2 }}>Shit Go Where?</div>
            <div style={{ marginTop: 28, fontSize: 40, color: OG.toffee, lineHeight: 1.3 }}>
              Find the nearest clean toilet in Singapore, fast.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 40 }}>
              {["Walk time", "Cleanliness", "Bidet"].map((s) => (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    padding: "10px 24px",
                    borderRadius: 999,
                    background: OG.surface,
                    border: `2px solid ${OG.line}`,
                    fontSize: 28,
                    color: OG.cream,
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
