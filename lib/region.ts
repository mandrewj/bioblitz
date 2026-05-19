import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon, Geometry } from "geojson";
import type { DashboardView } from "@/lib/config";

export type RegionGeoJSON =
  | Feature<Geometry>
  | FeatureCollection<Geometry>;

const EAGLE_CREEK_FALLBACK: Feature<Polygon> = {
  type: "Feature",
  properties: { name: "Eagle Creek Park (bbox fallback)", fallback: true },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-86.32, 39.835],
        [-86.28, 39.835],
        [-86.28, 39.87],
        [-86.32, 39.87],
        [-86.32, 39.835],
      ],
    ],
  },
};

async function readBytes(source: string): Promise<Buffer> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Region fetch failed: ${res.status} ${source}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const abs = path.isAbsolute(source)
    ? source
    : path.join(process.cwd(), source);
  return fs.promises.readFile(abs);
}

function fileExists(source: string): boolean {
  if (/^https?:\/\//.test(source)) return true;
  const abs = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
  return fs.existsSync(abs);
}

export async function loadRegionGeoJSON(view: DashboardView): Promise<RegionGeoJSON> {
  const { kind, path: source } = view.region.source;

  if (!fileExists(source)) {
    if (view.slug === "eagle-creek-beetles") {
      console.warn(
        `[region] ${source} missing — falling back to Eagle Creek bbox polygon`
      );
      return {
        type: "FeatureCollection",
        features: [EAGLE_CREEK_FALLBACK],
      };
    }
    throw new Error(`Region file not found: ${source}`);
  }

  const buf = await readBytes(source);

  if (kind === "geojson") {
    const text = buf.toString("utf8");
    const data = JSON.parse(text) as RegionGeoJSON;
    return data;
  }

  if (kind === "shapefile-zip") {
    // shpjs is browser-targeted and references `self` at module load. Lazy-
    // import it so geojson-only callers (i.e. the dev server) don't crash.
    if (typeof globalThis.self === "undefined") {
      (globalThis as unknown as { self: typeof globalThis }).self = globalThis;
    }
    const mod = (await import("shpjs")) as unknown as
      | { default: (b: Buffer) => Promise<unknown> }
      | ((b: Buffer) => Promise<unknown>);
    const shp = typeof mod === "function" ? mod : mod.default;
    const fc = (await shp(buf)) as RegionGeoJSON;
    return fc;
  }

  throw new Error(`Unsupported region source kind: ${kind}`);
}

export function extractPolygon(
  data: RegionGeoJSON
): Feature<Polygon | MultiPolygon> {
  if (data.type === "Feature") {
    const gType = (data.geometry as Geometry).type;
    if (gType !== "Polygon" && gType !== "MultiPolygon") {
      throw new Error(`Region geometry must be Polygon or MultiPolygon, got ${gType}`);
    }
    return data as Feature<Polygon | MultiPolygon>;
  }
  const feat = data.features.find(
    (f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
  );
  if (!feat) throw new Error("Region FeatureCollection has no Polygon/MultiPolygon feature");
  return feat as Feature<Polygon | MultiPolygon>;
}

export function computeBBox(
  feature: Feature<Polygon | MultiPolygon>
): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = turf.bbox(feature);
  return [minX, minY, maxX, maxY];
}

/**
 * Convert geometry to a WKT POLYGON / MULTIPOLYGON string in lng lat order.
 * Applies right-hand-rule winding (counter-clockwise exterior, clockwise
 * holes) which GBIF's geometry parser requires.
 */
export function toWKT(feature: Feature<Polygon | MultiPolygon>): string {
  const rewound = turf.rewind(feature, { reverse: false }) as Feature<Polygon | MultiPolygon>;
  const g = rewound.geometry;
  const ring = (coords: number[][]) =>
    `(${coords.map(([x, y]) => `${x} ${y}`).join(", ")})`;
  if (g.type === "Polygon") {
    return `POLYGON(${g.coordinates.map(ring).join(", ")})`;
  }
  const polys = g.coordinates
    .map((poly) => `(${poly.map(ring).join(", ")})`)
    .join(", ");
  return `MULTIPOLYGON(${polys})`;
}

/**
 * Build a single WKT POLYGON from the feature's bounding box. GBIF's
 * /occurrence/search geometry parameter is happiest with a small simple
 * polygon — when the AOI is a MultiPolygon we fetch the bbox superset and
 * let the client-side `booleanPointInPolygon` enforce exact membership.
 */
export function bboxAsWKT(feature: Feature<Polygon | MultiPolygon>): string {
  const [w, s, e, n] = computeBBox(feature);
  // Counter-clockwise (right-hand rule): SW → SE → NE → NW → SW
  return `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}
