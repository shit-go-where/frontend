import { addProtocol } from "maplibre-gl";

/*
 * OneMap only ships fixed raster styles (cool navy Night, neutral Grey), so the
 * basemap is gradient-mapped in the browser: each Grey tile pixel's lightness
 * is looked up on a chocolate ramp. Tiles come in through the `sgw-tint://`
 * protocol, e.g. `sgw-tint://dark/16/51672/32531`.
 *
 * Set to false to fall back to OneMap's own Night and Grey tiles.
 */
export const TINT_TILES = true;

type Stop = [at: number, hex: string];

/**
 * Dark: the ramp folds back at the top, so Grey's white roads land on toffee
 * above a chocolate ground and its dark labels turn cream (The Literal Map Colour Rule:
 * these mirror --bg, --border and --fg).
 */
const DARK: Stop[] = [
  [0, "#fff1e0"],
  [0.45, "#c9a17c"],
  [0.7, "#4a3020"],
  [0.82, "#2e1c11"],
  [0.93, "#1e120b"],
  [0.97, "#3d2717"],
  [1, "#5a3b25"],
];

/** Light: a straight caramel duotone from ink brown to cream paper. */
const LIGHT: Stop[] = [
  [0, "#2a160b"],
  [0.45, "#7a4a2a"],
  [0.72, "#cf9f76"],
  [0.9, "#efcba5"],
  [1, "#fff3e4"],
];

/** Ground colour shown before tiles arrive, matched to each ramp's land tone. */
export const MAP_GROUND = { dark: "#1e120b", light: "#efcba5" };

function lut(stops: Stop[]): Uint8ClampedArray {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const a = rgb(c0);
    const b = rgb(c1);
    for (let j = 0; j < 3; j++) out[i * 3 + j] = a[j] + (b[j] - a[j]) * f;
  }
  return out;
}

const RAMPS = { dark: lut(DARK), light: lut(LIGHT) };

async function loadTile(url: string, signal: AbortSignal): Promise<{ data: ArrayBuffer }> {
  const [theme, z, x, y] = url.slice("sgw-tint://".length).split("/");
  const res = await fetch(`https://www.onemap.gov.sg/maps/tiles/Grey/${z}/${x}/${y}.png`, { signal });
  if (!res.ok) throw new Error(`Tile ${z}/${x}/${y}: ${res.status}`);
  const blob = await res.blob();
  // Older browsers without OffscreenCanvas get the plain Grey tile.
  if (typeof OffscreenCanvas === "undefined") return { data: await blob.arrayBuffer() };

  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { data: await blob.arrayBuffer() };
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  // TEMP: palette comparison hook, removed once a ramp is picked.
  const trial = (globalThis as { __SGW_RAMPS?: { dark: Stop[]; light: Stop[] } }).__SGW_RAMPS;
  const ramp = trial ? lut(theme === "light" ? trial.light : trial.dark) : theme === "light" ? RAMPS.light : RAMPS.dark;
  for (let i = 0; i < px.length; i += 4) {
    // Rec. 709 luma in integer maths (weights sum to 256).
    const l = (54 * px[i] + 183 * px[i + 1] + 19 * px[i + 2]) >> 8;
    px[i] = ramp[l * 3];
    px[i + 1] = ramp[l * 3 + 1];
    px[i + 2] = ramp[l * 3 + 2];
  }
  ctx.putImageData(img, 0, 0);
  const out = await canvas.convertToBlob({ type: "image/png" });
  return { data: await out.arrayBuffer() };
}

let registered = false;

/** Registers the tint protocol once per page. Client only. */
export function ensureTintProtocol() {
  if (registered || !TINT_TILES) return;
  addProtocol("sgw-tint", (params, abort) => loadTile(params.url, abort.signal));
  registered = true;
}
