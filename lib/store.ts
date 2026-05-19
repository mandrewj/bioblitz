import fs from "node:fs";
import path from "node:path";
import type { Feature, MultiPolygon, Polygon } from "geojson";

export interface StoredOccurrence {
  source: "inat" | "gbif";
  sourceRecordId: string;
  taxonScientificName: string;
  taxonCommonName: string | null;
  taxonOrder: string | null;
  taxonFamily: string | null;
  taxonGenus: string | null;
  observedOn: string | null;
  observedYear: number | null;
  observedMonth: number | null;
  lat: number;
  lng: number;
  observer: string | null;
  license: string | null;
  qualityGrade: string | null;
  basisOfRecord: string | null;
  datasetKey: string | null;
  photoUrl: string | null;
  attributionText: string;
}

export interface StoredView {
  schemaVersion: 3;
  slug: string;
  displayName: string;
  taxon: {
    name: string;
    inatTaxonId: number | null;
    gbifTaxonKey: number | null;
    commonName: string | null;
    rank: string | null;
  };
  region: {
    name: string;
    bbox: [number, number, number, number];
    geometry: Feature<Polygon | MultiPolygon>;
  };
  lastSyncedAt: string; // ISO
  stats: {
    inatFetched: number;
    inatKept: number;
    gbifFetched: number;
    gbifKept: number;
    gbifDroppedAsInat: number;
    outsidePolygon: number;
  };
  /** iNat taxon ancestry cache; reused across incremental syncs. */
  inatTaxonAncestry: Record<
    string,
    { order: string | null; family: string | null; genus: string | null }
  >;
  /** GBIF dataset titles, keyed by datasetKey. Resolved at sync time. */
  datasetTitles: Record<string, string>;
  /**
   * Fallback iNat taxon-photo URLs for species without a CC-licensed
   * observation photo (typically GBIF-only museum records). Keyed by the
   * exact `taxonScientificName` stored on the occurrence. `null` means
   * "looked up, no photo available" — caching the miss prevents repeated
   * queries on incremental syncs.
   */
  taxonPhotos: Record<string, string | null>;
  occurrences: StoredOccurrence[];
}

export function dataDir(): string {
  return process.env.DASHBOARD_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function viewFilePath(slug: string): string {
  return path.join(dataDir(), `${slug}.json`);
}

export function loadView(slug: string): StoredView | null {
  const p = viewFilePath(slug);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw) as StoredView;
  if (parsed.schemaVersion !== 3) {
    throw new Error(
      `Unsupported data schema version: ${parsed.schemaVersion}. Run \`npm run sync -- ${path.basename(p, ".json")} --full\` to regenerate at v3.`
    );
  }
  return parsed;
}

export function saveView(view: StoredView): void {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = viewFilePath(view.slug);
  fs.writeFileSync(p, JSON.stringify(view) + "\n");
}
