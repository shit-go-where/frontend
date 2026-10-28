/**
 * MapLibre's module didn't arrive (a dropped connection, usually). Kept out of ToiletMap.tsx so the error
 * boundary in ./index.tsx can tell it apart from "no WebGL" without pulling the map chunk in.
 */
export class MapLibreLoadError extends Error {
  constructor(cause: unknown) {
    super("MapLibre did not load", { cause });
    this.name = "MapLibreLoadError";
  }
}
