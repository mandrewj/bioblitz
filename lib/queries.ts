import { loadView, type StoredOccurrence, type StoredView } from "@/lib/store";

export interface ViewSummary {
  slug: string;
  displayName: string;
  totalCount: number;
  speciesCount: number;
  inatCount: number;
  gbifCount: number;
  gbifDroppedAsInat: number;
  lastSyncedAt: string | null;
  region: { name: string; bbox: [number, number, number, number] };
}

export interface SpeciesRow {
  scientificName: string;
  commonName: string | null;
  count: number;
  inatCount: number;
  gbifCount: number;
  representativePhoto: string | null;
}

export interface OccurrenceFeature {
  id: number;
  source: "inat" | "gbif";
  sourceRecordId: string;
  taxon: string;
  observedOn: string | null;
  observer: string | null;
  lng: number;
  lat: number;
  photo: string | null;
  attribution: string;
  qualityGrade: string | null;
  sourceUrl: string;
}

const inatUrl = (id: string) => `https://www.inaturalist.org/observations/${id}`;
const gbifUrl = (id: string) => `https://www.gbif.org/occurrence/${id}`;

function passRG(o: StoredOccurrence, researchOnly: boolean): boolean {
  if (!researchOnly) return true;
  if (o.source === "gbif") return true;
  return o.qualityGrade === "research";
}

function filteredOccurrences(view: StoredView, researchOnly: boolean): StoredOccurrence[] {
  return researchOnly ? view.occurrences.filter((o) => passRG(o, true)) : view.occurrences;
}

function syntheticId(o: StoredOccurrence): number {
  // Stable numeric id from "source:sourceRecordId" for React keys. Not used
  // for any business logic.
  let h = 5381;
  const s = `${o.source}:${o.sourceRecordId}`;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function toFeature(o: StoredOccurrence): OccurrenceFeature {
  return {
    id: syntheticId(o),
    source: o.source,
    sourceRecordId: o.sourceRecordId,
    taxon: o.taxonScientificName,
    observedOn: o.observedOn,
    observer: o.observer,
    photo: o.license ? o.photoUrl : null,
    attribution: o.attributionText,
    qualityGrade: o.qualityGrade,
    lng: o.lng,
    lat: o.lat,
    sourceUrl: o.source === "inat" ? inatUrl(o.sourceRecordId) : gbifUrl(o.sourceRecordId),
  };
}

export function getViewSummary(slug: string, researchOnly: boolean): ViewSummary | null {
  const view = loadView(slug);
  if (!view) return null;
  const occ = filteredOccurrences(view, researchOnly);
  const species = new Set<string>();
  let inat = 0;
  let gbif = 0;
  for (const o of occ) {
    species.add(o.taxonScientificName);
    if (o.source === "inat") inat++;
    else gbif++;
  }
  return {
    slug: view.slug,
    displayName: view.displayName,
    totalCount: occ.length,
    speciesCount: species.size,
    inatCount: inat,
    gbifCount: gbif,
    gbifDroppedAsInat: view.stats.gbifDroppedAsInat,
    lastSyncedAt: view.lastSyncedAt,
    region: { name: view.region.name, bbox: view.region.bbox },
  };
}

export function getSpeciesList(
  slug: string,
  researchOnly: boolean,
  limit = 100,
  offset = 0
): SpeciesRow[] {
  const view = loadView(slug);
  if (!view) return [];
  const occ = filteredOccurrences(view, researchOnly);

  type Bucket = {
    scientificName: string;
    commonName: string | null;
    count: number;
    inatCount: number;
    gbifCount: number;
    photo: string | null;
    photoDate: string | null;
  };
  const buckets = new Map<string, Bucket>();
  for (const o of occ) {
    let b = buckets.get(o.taxonScientificName);
    if (!b) {
      b = {
        scientificName: o.taxonScientificName,
        commonName: null,
        count: 0,
        inatCount: 0,
        gbifCount: 0,
        photo: null,
        photoDate: null,
      };
      buckets.set(o.taxonScientificName, b);
    }
    b.count++;
    if (o.source === "inat") b.inatCount++;
    else b.gbifCount++;
    if (!b.commonName && o.taxonCommonName) b.commonName = o.taxonCommonName;
    if (o.source === "inat" && o.photoUrl && o.license) {
      const d = o.observedOn ?? "";
      if (!b.photo || (d && (!b.photoDate || d > b.photoDate))) {
        b.photo = o.photoUrl;
        b.photoDate = d || null;
      }
    }
  }
  const all = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const taxonPhotos = view.taxonPhotos ?? {};
  return all.slice(offset, offset + limit).map((b) => ({
    scientificName: b.scientificName,
    commonName: b.commonName,
    count: b.count,
    inatCount: b.inatCount,
    gbifCount: b.gbifCount,
    // Prefer an actual iNat observation photo; fall back to the iNat
    // taxon's curated photo (resolved at sync time) so GBIF-only species
    // still have a thumbnail.
    representativePhoto: b.photo ?? taxonPhotos[b.scientificName] ?? null,
  }));
}

export function getOccurrences(
  slug: string,
  researchOnly: boolean,
  limit = 5000
): OccurrenceFeature[] {
  const view = loadView(slug);
  if (!view) return [];
  const occ = filteredOccurrences(view, researchOnly);
  // occurrences are already sorted by observedOn DESC from the sync
  return occ.slice(0, limit).map(toFeature);
}

export function getPhenology(
  slug: string,
  scientificName: string | null,
  researchOnly: boolean
): Array<{ month: number; count: number }> {
  const view = loadView(slug);
  if (!view) return [];
  const occ = filteredOccurrences(view, researchOnly);
  const counts = new Map<number, number>();
  for (const o of occ) {
    if (scientificName && o.taxonScientificName !== scientificName) continue;
    if (!o.observedMonth) continue;
    counts.set(o.observedMonth, (counts.get(o.observedMonth) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([month, count]) => ({ month, count }));
}

export function getSpeciesPhotos(
  slug: string,
  scientificName: string,
  limit = 24
): OccurrenceFeature[] {
  const view = loadView(slug);
  if (!view) return [];
  const photos = view.occurrences
    .filter(
      (o) =>
        o.source === "inat" &&
        o.taxonScientificName === scientificName &&
        o.photoUrl &&
        o.license
    )
    .slice(0, limit);
  return photos.map(toFeature);
}

export function getAbundanceForAccumulation(slug: string, researchOnly: boolean): number[] {
  const view = loadView(slug);
  if (!view) return [];
  const occ = filteredOccurrences(view, researchOnly);
  const counts = new Map<string, number>();
  for (const o of occ) {
    counts.set(o.taxonScientificName, (counts.get(o.taxonScientificName) ?? 0) + 1);
  }
  return Array.from(counts.values());
}

export interface RegionResponse {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
  bbox: [number, number, number, number];
}

export function getRegionGeoJSON(slug: string): RegionResponse | null {
  const view = loadView(slug);
  if (!view) return null;
  return {
    type: "Feature",
    properties: { name: view.region.name },
    geometry: view.region.geometry.geometry,
    bbox: view.region.bbox,
  };
}

// ----- Contributors (observer leaderboard) -----

export interface ContributorRow {
  source: "inat" | "gbif";
  name: string;
  records: number;
  species: number;
}

const BLANK_OBSERVER_VALUES = new Set([
  "",
  "anonymous",
  "unknown",
  "n/a",
  "not specified",
  "-",
  ".",
]);

function canonicalizeObserver(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getTopContributors(
  slug: string,
  researchOnly: boolean,
  limit = 15
): { rows: ContributorRow[]; total: number } {
  const view = loadView(slug);
  if (!view) return { rows: [], total: 0 };
  const occ = filteredOccurrences(view, researchOnly);

  type Bucket = {
    source: "inat" | "gbif";
    displayName: string;
    displayCount: Map<string, number>;
    records: number;
    species: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  for (const o of occ) {
    if (!o.observer) continue;
    const original = o.observer.trim();
    const canonical = canonicalizeObserver(original);
    if (BLANK_OBSERVER_VALUES.has(canonical)) continue;
    const key = `${o.source}:${canonical}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        source: o.source,
        displayName: original,
        displayCount: new Map<string, number>(),
        records: 0,
        species: new Set<string>(),
      };
      buckets.set(key, b);
    }
    b.records++;
    b.species.add(o.taxonScientificName);
    b.displayCount.set(original, (b.displayCount.get(original) ?? 0) + 1);
    // Track the most-frequent casing as the display name.
    if ((b.displayCount.get(original) ?? 0) > (b.displayCount.get(b.displayName) ?? 0)) {
      b.displayName = original;
    }
  }

  const rows: ContributorRow[] = Array.from(buckets.values())
    .map((b) => ({
      source: b.source,
      name: b.displayName,
      records: b.records,
      species: b.species.size,
    }))
    .sort((a, b) => b.records - a.records || b.species - a.species);

  return { rows: rows.slice(0, limit), total: rows.length };
}

// ----- Taxonomy breakdown (family / genus) -----

export type TaxonRank = "family" | "genus";

export interface TaxonomyRow {
  name: string;
  records: number;
  inatRecords: number;
  gbifRecords: number;
  species: number;
}

export function getTaxonomyBreakdown(
  slug: string,
  researchOnly: boolean,
  rank: TaxonRank,
  limit = 15
): {
  rows: TaxonomyRow[];
  total: number;
  rankCount: number;
  unranked: number;
} {
  const view = loadView(slug);
  if (!view) return { rows: [], total: 0, rankCount: 0, unranked: 0 };
  const occ = filteredOccurrences(view, researchOnly);

  type Bucket = {
    name: string;
    records: number;
    inat: number;
    gbif: number;
    species: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  let unranked = 0;

  for (const o of occ) {
    const name = rank === "family" ? o.taxonFamily : o.taxonGenus;
    if (!name) {
      unranked++;
      continue;
    }
    let b = buckets.get(name);
    if (!b) {
      b = { name, records: 0, inat: 0, gbif: 0, species: new Set<string>() };
      buckets.set(name, b);
    }
    b.records++;
    if (o.source === "inat") b.inat++;
    else b.gbif++;
    b.species.add(o.taxonScientificName);
  }

  const rows: TaxonomyRow[] = Array.from(buckets.values())
    .map((b) => ({
      name: b.name,
      records: b.records,
      inatRecords: b.inat,
      gbifRecords: b.gbif,
      species: b.species.size,
    }))
    .sort((a, b) => b.records - a.records);

  return {
    rows: rows.slice(0, limit),
    total: rows.reduce((s, r) => s + r.records, 0),
    rankCount: rows.length,
    unranked,
  };
}

// ----- Top data sources (datasets summary) -----

export interface DatasetRow {
  key: string | null;
  source: "inat" | "gbif";
  title: string;
  records: number;
  pct: number;
}

export function getDatasetsSummary(
  slug: string,
  researchOnly: boolean,
  topN = 5
): {
  top: DatasetRow[];
  tail: { count: number; records: number; pct: number };
  total: number;
  all: DatasetRow[];
} {
  const view = loadView(slug);
  if (!view) {
    return {
      top: [],
      tail: { count: 0, records: 0, pct: 0 },
      total: 0,
      all: [],
    };
  }
  const occ = filteredOccurrences(view, researchOnly);
  const titles = view.datasetTitles ?? {};

  let inatRecords = 0;
  const gbifByKey = new Map<string, number>();
  let gbifUnknown = 0;

  for (const o of occ) {
    if (o.source === "inat") {
      inatRecords++;
    } else {
      const k = o.datasetKey;
      if (!k) gbifUnknown++;
      else gbifByKey.set(k, (gbifByKey.get(k) ?? 0) + 1);
    }
  }

  const total = occ.length || 1; // avoid division by zero in pct
  const inatRow: DatasetRow = {
    key: null,
    source: "inat",
    title: "iNaturalist Research-grade Observations",
    records: inatRecords,
    pct: inatRecords / total,
  };
  const gbifRows: DatasetRow[] = Array.from(gbifByKey.entries()).map(
    ([key, records]) => ({
      key,
      source: "gbif" as const,
      title: titles[key] ?? `GBIF dataset ${key.slice(0, 8)}`,
      records,
      pct: records / total,
    })
  );
  if (gbifUnknown > 0) {
    gbifRows.push({
      key: null,
      source: "gbif",
      title: "GBIF (dataset not specified)",
      records: gbifUnknown,
      pct: gbifUnknown / total,
    });
  }

  // All rows ranked strictly by record count — including the iNat
  // aggregate. Previously iNat was pinned to index 0, which buried larger
  // GBIF datasets (e.g., a curated museum collection bigger than the iNat
  // contribution at the same site).
  const allRows: DatasetRow[] = [inatRow, ...gbifRows].sort(
    (a, b) => b.records - a.records
  );

  const top: DatasetRow[] = allRows.slice(0, topN);
  const tailRows = allRows.slice(topN);
  const tail = {
    count: tailRows.length,
    records: tailRows.reduce((s, r) => s + r.records, 0),
    pct: tailRows.reduce((s, r) => s + r.pct, 0),
  };
  return { top, tail, total: occ.length, all: allRows };
}
