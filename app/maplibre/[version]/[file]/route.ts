import { MAPLIBRE_FILES, maplibreAsset, maplibreVersion } from "@/lib/server/maplibre-asset";

/** MapLibre's three ES modules at /maplibre/<installed version>/<file>, prerendered (lib/server/maplibre-asset.ts). */
export function generateStaticParams() {
  const version = maplibreVersion();
  return MAPLIBRE_FILES.map((file) => ({ version, file }));
}

export async function GET(_req: Request, { params }: RouteContext<"/maplibre/[version]/[file]">) {
  const { version, file } = await params;
  return maplibreAsset(version, file);
}
