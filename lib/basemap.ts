export type BasemapKey = "positron" | "voyager" | "dark";

/**
 * Free CARTO raster basemaps (no API key required).
 *   Attribution: "© OpenStreetMap contributors, © CARTO".
 *
 * Returned as Leaflet TileLayer URL templates (subdomains a/b/c/d are
 * substituted into {s}).
 */
const CARTO_RASTER_TILES: Record<BasemapKey, string> = {
  positron: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  voyager: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
};

export function basemapTileUrl(key: BasemapKey): string {
  return CARTO_RASTER_TILES[key];
}

export const BASEMAP_SUBDOMAINS = ["a", "b", "c", "d"];
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>';
