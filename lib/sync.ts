import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { loadDashboardConfig, getViewBySlug, type DashboardView } from "@/lib/config";
import { loadRegionGeoJSON, extractPolygon, computeBBox, bboxAsWKT } from "@/lib/region";
import {
  iterateInatObservations,
  inatAttribution,
  resolveInatTaxon,
  resolveInatTaxonAncestry,
  resolveInatTaxonPhotos,
  type InatObservation,
  type InatTaxonAncestry,
} from "@/lib/inat";
import {
  iterateGbifOccurrences,
  resolveGbifTaxon,
  gbifAttribution,
  resolveGbifDatasetTitles,
  type GbifOccurrence,
} from "@/lib/gbif";
import {
  loadView,
  saveView,
  type StoredOccurrence,
  type StoredView,
} from "@/lib/store";

export interface SyncResult {
  slug: string;
  inatFetched: number;
  inatKept: number;
  gbifFetched: number;
  gbifKept: number;
  gbifDroppedAsInat: number;
  outsidePolygon: number;
  totalAfter: number;
  durationMs: number;
}

function pickInatPhoto(obs: InatObservation): string | null {
  const p = obs.photos?.find((ph) => ph.license_code && ph.license_code !== "");
  if (!p) return null;
  return p.url.replace(/\/square\.(\w+)$/i, "/medium.$1");
}

function obsCoords(obs: InatObservation): [number, number] | null {
  if (obs.geojson) return obs.geojson.coordinates;
  if (obs.location) {
    const [lat, lng] = obs.location.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  }
  return null;
}

function inPolygon(
  lng: number,
  lat: number,
  feature: Feature<Polygon | MultiPolygon>
): boolean {
  return turf.booleanPointInPolygon(turf.point([lng, lat]), feature);
}

async function resolveTaxon(
  view: DashboardView,
  contactEmail: string,
  prior: StoredView | null
) {
  let inatId = view.taxon.inatTaxonId ?? prior?.taxon.inatTaxonId ?? null;
  let gbifKey = view.taxon.gbifTaxonKey ?? prior?.taxon.gbifTaxonKey ?? null;
  let commonName: string | null = prior?.taxon.commonName ?? null;
  let rank: string | null = prior?.taxon.rank ?? null;

  if (!inatId) {
    const r = await resolveInatTaxon(view.taxon.name, contactEmail);
    if (!r) throw new Error(`iNat: could not resolve taxon "${view.taxon.name}"`);
    inatId = r.id;
    commonName ??= r.commonName ?? null;
    rank ??= r.rank ?? null;
  }
  if (!gbifKey) {
    const r = await resolveGbifTaxon(view.taxon.name, contactEmail);
    if (!r) throw new Error(`GBIF: could not resolve taxon "${view.taxon.name}"`);
    gbifKey = r.key;
    commonName ??= r.commonName ?? null;
    rank ??= r.rank ?? null;
  }
  return { inatId, gbifKey, commonName, rank };
}

export interface SyncOptions {
  /** Force a full refresh (ignore lastSyncedAt cursor). */
  full?: boolean;
}

export async function syncView(slug: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const t0 = Date.now();
  const cfg = loadDashboardConfig();
  const view = getViewBySlug(slug);
  if (!view) throw new Error(`Unknown view slug: ${slug}`);

  const regionGeo = await loadRegionGeoJSON(view);
  const feature = extractPolygon(regionGeo);
  const bbox = computeBBox(feature);
  // For GBIF we send a bbox POLYGON (their parser dislikes large
  // MULTIPOLYGONs and complex rings); exact polygon membership is enforced
  // client-side by `inPolygon` below using Turf.
  const wktBbox = bboxAsWKT(feature);

  // On a full re-sync we don't read the prior — it may be at an older
  // schema version that loadView would reject. That's expected: --full
  // is also the migration path between schema bumps.
  const prior = opts.full ? null : loadView(slug);
  const taxon = await resolveTaxon(view, cfg.contactEmail, prior);

  // Cursor: omit on full refresh
  const inatCursor = !opts.full && prior?.lastSyncedAt ? prior.lastSyncedAt : undefined;
  const gbifCursor = !opts.full && prior?.lastSyncedAt ? prior.lastSyncedAt : undefined;

  // Map existing records by (source, sourceRecordId) so we can dedup + merge.
  const merged = new Map<string, StoredOccurrence>();
  if (!opts.full && prior) {
    for (const o of prior.occurrences) {
      merged.set(`${o.source}:${o.sourceRecordId}`, o);
    }
  }

  // ----- iNat -----
  let inatFetched = 0;
  let inatKept = 0;
  let outsidePolygon = 0;
  // Map sourceRecordId → obs.taxon.id, so we can apply ancestry by row
  // after a batched lookup completes.
  const inatTaxonIdByRecord = new Map<string, number>();
  for await (const obs of iterateInatObservations({
    taxonId: taxon.inatId,
    bbox,
    updatedSince: inatCursor,
    dateStart: view.dateRange?.start,
    dateEnd: view.dateRange?.end,
    contactEmail: cfg.contactEmail,
  })) {
    inatFetched++;
    const coords = obsCoords(obs);
    if (!coords) continue;
    const [lng, lat] = coords;
    if (!inPolygon(lng, lat, feature)) {
      outsidePolygon++;
      continue;
    }
    const row: StoredOccurrence = {
      source: "inat",
      sourceRecordId: String(obs.id),
      taxonScientificName: obs.taxon?.name ?? view.taxon.name,
      taxonCommonName: obs.taxon?.preferred_common_name ?? null,
      taxonOrder: null,
      taxonFamily: null,
      taxonGenus: null,
      observedOn: obs.observed_on ?? obs.observed_on_details?.date ?? null,
      observedYear: obs.observed_on_details?.year ?? null,
      observedMonth: obs.observed_on_details?.month ?? null,
      lat,
      lng,
      observer: obs.user?.login ?? null,
      license: obs.license_code ?? null,
      qualityGrade: obs.quality_grade ?? null,
      basisOfRecord: null,
      datasetKey: null,
      photoUrl: pickInatPhoto(obs),
      attributionText: inatAttribution(obs),
    };
    merged.set(`inat:${row.sourceRecordId}`, row);
    if (obs.taxon?.id) inatTaxonIdByRecord.set(row.sourceRecordId, obs.taxon.id);
    inatKept++;
  }

  // Resolve iNat taxon ancestry for any taxon IDs we don't have cached.
  const priorAncestry: Record<string, InatTaxonAncestry> =
    prior?.inatTaxonAncestry ?? {};
  const seenTaxonIds = new Set(inatTaxonIdByRecord.values());
  const newTaxonIds = Array.from(seenTaxonIds).filter(
    (id) => !(String(id) in priorAncestry)
  );
  const resolvedAncestry =
    newTaxonIds.length > 0
      ? await resolveInatTaxonAncestry(newTaxonIds, cfg.contactEmail)
      : {};
  const inatTaxonAncestry: Record<string, InatTaxonAncestry> = {
    ...priorAncestry,
    ...resolvedAncestry,
  };
  // Patch ranks onto each newly-fetched iNat row. Rows merged in from a
  // prior incremental sync already carry their order/family/genus.
  for (const [recordId, taxonId] of inatTaxonIdByRecord) {
    const row = merged.get(`inat:${recordId}`);
    if (!row) continue;
    const ranks = inatTaxonAncestry[String(taxonId)];
    if (!ranks) continue;
    row.taxonOrder = ranks.order;
    row.taxonFamily = ranks.family;
    row.taxonGenus = ranks.genus;
  }

  // ----- GBIF -----
  let gbifFetched = 0;
  let gbifKept = 0;
  let gbifDroppedAsInat = 0;
  for await (const { raw: occ, droppedAsInat } of iterateGbifOccurrences({
    taxonKey: taxon.gbifKey,
    geometry: wktBbox,
    lastInterpreted: gbifCursor,
    dateStart: view.dateRange?.start,
    dateEnd: view.dateRange?.end,
    contactEmail: cfg.contactEmail,
  })) {
    gbifFetched++;
    if (droppedAsInat) {
      gbifDroppedAsInat++;
      continue;
    }
    if (occ.decimalLatitude == null || occ.decimalLongitude == null) continue;
    const lat = occ.decimalLatitude;
    const lng = occ.decimalLongitude;
    if (!inPolygon(lng, lat, feature)) {
      outsidePolygon++;
      continue;
    }
    const id = String(occ.gbifID);
    const row: StoredOccurrence = {
      source: "gbif",
      sourceRecordId: id,
      taxonScientificName:
        occ.acceptedScientificName ?? occ.scientificName ?? occ.species ?? view.taxon.name,
      taxonCommonName: occ.vernacularName ?? null,
      taxonOrder: occ.order ?? null,
      taxonFamily: occ.family ?? null,
      taxonGenus: occ.genus ?? null,
      observedOn: occ.eventDate ? occ.eventDate.slice(0, 10) : null,
      observedYear: occ.year ?? null,
      observedMonth: occ.month ?? null,
      lat,
      lng,
      observer: occ.recordedBy ?? null,
      license: occ.license ?? null,
      qualityGrade: null,
      basisOfRecord: occ.basisOfRecord ?? null,
      datasetKey: occ.datasetKey ?? null,
      photoUrl: null,
      attributionText: gbifAttribution(occ),
    };
    merged.set(`gbif:${id}`, row);
    gbifKept++;
  }

  // Resolve fallback iNat taxon photos for species that lack a
  // CC-licensed iNat observation photo. Cached per scientific name and
  // reused across incremental syncs; null is a valid cached result.
  const priorTaxonPhotos: Record<string, string | null> = prior?.taxonPhotos ?? {};
  const speciesNeedingPhoto = new Set<string>();
  const speciesWithInatPhoto = new Set<string>();
  for (const o of merged.values()) {
    if (o.source === "inat" && o.photoUrl && o.license) {
      speciesWithInatPhoto.add(o.taxonScientificName);
    }
  }
  for (const o of merged.values()) {
    if (speciesWithInatPhoto.has(o.taxonScientificName)) continue;
    if (o.taxonScientificName in priorTaxonPhotos) continue;
    speciesNeedingPhoto.add(o.taxonScientificName);
  }
  const resolvedTaxonPhotos =
    speciesNeedingPhoto.size > 0
      ? await resolveInatTaxonPhotos(
          Array.from(speciesNeedingPhoto),
          cfg.contactEmail
        )
      : {};
  const taxonPhotos: Record<string, string | null> = {
    ...priorTaxonPhotos,
    ...resolvedTaxonPhotos,
  };

  // Resolve GBIF dataset titles for any keys we don't have cached.
  const priorTitles: Record<string, string> = prior?.datasetTitles ?? {};
  const datasetKeys = new Set<string>();
  for (const o of merged.values()) {
    if (o.source === "gbif" && o.datasetKey) datasetKeys.add(o.datasetKey);
  }
  const newDatasetKeys = Array.from(datasetKeys).filter((k) => !(k in priorTitles));
  const resolvedTitles =
    newDatasetKeys.length > 0
      ? await resolveGbifDatasetTitles(newDatasetKeys, cfg.contactEmail)
      : {};
  const datasetTitles: Record<string, string> = { ...priorTitles, ...resolvedTitles };

  const occurrences = Array.from(merged.values()).sort((a, b) => {
    const ad = a.observedOn ?? "";
    const bd = b.observedOn ?? "";
    if (ad === bd) return 0;
    return ad < bd ? 1 : -1;
  });

  const stored: StoredView = {
    schemaVersion: 3,
    slug,
    displayName: view.displayName,
    taxon: {
      name: view.taxon.name,
      inatTaxonId: taxon.inatId,
      gbifTaxonKey: taxon.gbifKey,
      commonName: taxon.commonName,
      rank: taxon.rank,
    },
    region: {
      name: view.region.name,
      bbox,
      geometry: feature,
    },
    lastSyncedAt: new Date().toISOString(),
    stats: {
      inatFetched: (prior?.stats.inatFetched ?? 0) + inatFetched,
      inatKept,
      gbifFetched: (prior?.stats.gbifFetched ?? 0) + gbifFetched,
      gbifKept,
      gbifDroppedAsInat: (prior?.stats.gbifDroppedAsInat ?? 0) + gbifDroppedAsInat,
      outsidePolygon,
    },
    inatTaxonAncestry,
    datasetTitles,
    taxonPhotos,
    occurrences,
  };
  saveView(stored);

  return {
    slug,
    inatFetched,
    inatKept,
    gbifFetched,
    gbifKept,
    gbifDroppedAsInat,
    outsidePolygon,
    totalAfter: occurrences.length,
    durationMs: Date.now() - t0,
  };
}

export async function syncAllViews(opts: SyncOptions = {}): Promise<SyncResult[]> {
  const cfg = loadDashboardConfig();
  const out: SyncResult[] = [];
  for (const v of cfg.views) {
    const r = await syncView(v.slug, opts);
    out.push(r);
    console.log("[sync]", r);
  }
  return out;
}
