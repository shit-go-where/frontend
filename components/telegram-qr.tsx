import { cx } from "./styles";

/** The link the code below opens. /about shows the code only while TELEGRAM_BOT_URL is still this link. */
export const TELEGRAM_QR_URL = "https://t.me/ShitGoWhereBot";

/*
 * Generated once, not at runtime (no QR library ships):
 *   npx qrcode@1.5.4 -t svg -e M -q 0 -o bot.svg "https://t.me/ShitGoWhereBot"
 * then the dark-module path copied in. 29 x 29 modules, error correction M. Regenerate if the URL changes.
 */
const MODULES = 29;
const PATH =
  "M0 0.5h7m5 0h1m1 0h1m4 0h1m2 0h7M0 1.5h1m5 0h1m1 0h2m2 0h2m5 0h2m1 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m4 0h2m2 0h1m2 0h1m3 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m3 0h4m2 0h1m1 0h2m2 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m2 0h1m1 0h2m2 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m3 0h1m3 0h6m2 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 7.5h4m2 0h1m1 0h3M0 8.5h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h2m3 0h1m2 0h2m3 0h1m2 0h1M2 9.5h4m1 0h1m2 0h2m1 0h1m1 0h3m2 0h4m1 0h1m2 0h1M0 10.5h1m5 0h2m1 0h1m2 0h1m1 0h5m2 0h1m1 0h2m1 0h3M1 11.5h2m1 0h2m2 0h1m1 0h1m2 0h2m1 0h2m2 0h1m1 0h1m4 0h1M3 12.5h4m1 0h1m3 0h1m1 0h2m1 0h1m3 0h2m2 0h1m1 0h2M1 13.5h4m3 0h3m3 0h2m3 0h2m4 0h1m2 0h1M1 14.5h1m2 0h4m1 0h3m1 0h1m3 0h1m4 0h4m1 0h2M0 15.5h1m2 0h1m4 0h2m5 0h1m1 0h2m1 0h1m1 0h1m1 0h2m1 0h1M2 16.5h1m1 0h3m1 0h1m2 0h2m3 0h2m1 0h4m2 0h1m1 0h2M1 17.5h1m3 0h1m1 0h4m2 0h1m1 0h4m1 0h3m2 0h2m1 0h1M0 18.5h1m2 0h2m1 0h3m2 0h2m1 0h3m10 0h2M1 19.5h1m1 0h2m6 0h1m1 0h2m1 0h2m2 0h2m2 0h2m1 0h1M0 20.5h1m2 0h4m1 0h2m4 0h2m2 0h1m1 0h5M8 21.5h3m1 0h1m1 0h2m3 0h2m3 0h1m1 0h3M0 22.5h7m6 0h1m3 0h1m2 0h1m1 0h1m1 0h2m1 0h2M0 23.5h1m5 0h1m3 0h2m3 0h1m4 0h1m3 0h2m2 0h1M0 24.5h1m1 0h3m1 0h1m1 0h3m5 0h1m3 0h5M0 25.5h1m1 0h3m1 0h1m2 0h4m2 0h3m1 0h1m3 0h2m1 0h1M0 26.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h2m1 0h2m1 0h3m3 0h2m2 0h1M0 27.5h1m5 0h1m5 0h1m1 0h1m1 0h3m1 0h4m3 0h1M0 28.5h7m1 0h1m2 0h3m1 0h1m2 0h8m1 0h2";

/**
 * A QR code for the bot as a cream sticker: Poo Ink modules on Sticker Rim Cream in both themes, so a phone
 * camera reads it whatever the page's theme. The viewBox keeps the four-module quiet zone scanners need.
 */
export function TelegramQr({ label, className }: { label: string; className?: string }) {
  return (
    <svg
      viewBox={`-4 -4 ${MODULES + 8} ${MODULES + 8}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={cx("block bg-rim", className)}
    >
      <path d={PATH} className="stroke-poo-ink" fill="none" />
    </svg>
  );
}
