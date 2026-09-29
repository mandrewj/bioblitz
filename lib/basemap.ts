export type BasemapKey = "light" | "topo" | "satellite" | "dark";

export const BASEMAP_KEYS = ["light", "topo", "satellite", "dark"] as const;

/**
 * Legacy CARTO key names (pre-2026-09) → current keys. CARTO started
 * requiring an API key for its basemap tiles (every tile became an
 * "API KEY REQUIRED" placeholder), so we moved to Esri's keyless
 * ArcGIS Online tile services. Old config values keep working.
 */
export const LEGACY_BASEMAP_ALIASES: Record<string, BasemapKey> = {
  positron: "light",
  voyager: "topo",
};

type BasemapDef = {
  label: string;
  url: string;
  attribution: string;
  /** Highest zoom the service has tiles for; Leaflet upscales beyond it. */
  maxNativeZoom: number;
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ESRI_CANVAS_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors";

/** Esri raster tiles — no API key. Note the {z}/{y}/{x} order. */
const BASEMAPS: Record<BasemapKey, BasemapDef> = {
  light: {
    label: "Light",
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_CANVAS_ATTRIBUTION,
    maxNativeZoom: 16,
  },
  topo: {
    label: "Topo",
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution:
      "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, FAO, NOAA, &copy; OpenStreetMap contributors",
    maxNativeZoom: 19,
  },
  satellite: {
    label: "Satellite",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxNativeZoom: 19,
  },
  dark: {
    label: "Dark",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_CANVAS_ATTRIBUTION,
    maxNativeZoom: 16,
  },
};

export function basemap(key: BasemapKey): BasemapDef {
  return BASEMAPS[key];
}

export const BASEMAP_OPTIONS = BASEMAP_KEYS.map((k) => ({ value: k, label: BASEMAPS[k].label }));
