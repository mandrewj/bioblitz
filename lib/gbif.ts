import { z } from "zod";
import { createLimiter } from "@/lib/rate-limit";

const BASE = "https://api.gbif.org/v1";

/** iNaturalist Research-grade Observations dataset on GBIF. */
export const INAT_GBIF_DATASET_KEY = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";

/** Page size used for offset/limit pagination. */
const PAGE_LIMIT = 300;

/** Maximum offset GBIF allows for offset-based pagination. */
const GBIF_OFFSET_CEILING = 100_000;

const limiter = createLimiter(30, 1_000); // GBIF doesn't publish a hard cap; be conservative.

function userAgent(contactEmail: string) {
  return `bioblitz-biodiversity-dashboard/0.1 (${contactEmail})`;
}

async function gbifFetch(url: string, contactEmail: string) {
  await limiter();
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(contactEmail),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GBIF ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const matchSchema = z
  .object({
    usageKey: z.number().optional(),
    scientificName: z.string().optional(),
    canonicalName: z.string().optional(),
    rank: z.string().optional(),
    vernacularName: z.string().optional(),
    matchType: z.string().optional(),
  })
  .passthrough();

export async function resolveGbifTaxon(
  name: string,
  contactEmail: string
): Promise<{ key: number; rank?: string; commonName?: string } | null> {
  const url = `${BASE}/species/match?name=${encodeURIComponent(name)}`;
  const data = await gbifFetch(url, contactEmail);
  const parsed = matchSchema.parse(data);
  if (!parsed.usageKey) return null;
  return {
    key: parsed.usageKey,
    rank: parsed.rank,
    commonName: parsed.vernacularName,
  };
}

const gbifOccSchema = z
  .object({
    gbifID: z.union([z.number(), z.string()]),
    key: z.number().optional(),
    datasetKey: z.string().optional(),
    scientificName: z.string().optional(),
    acceptedScientificName: z.string().optional(),
    vernacularName: z.string().optional(),
    species: z.string().optional(),
    genus: z.string().optional(),
    family: z.string().optional(),
    order: z.string().optional(),
    decimalLatitude: z.number().nullable().optional(),
    decimalLongitude: z.number().nullable().optional(),
    eventDate: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    month: z.number().nullable().optional(),
    recordedBy: z.string().nullable().optional(),
    license: z.string().nullable().optional(),
    basisOfRecord: z.string().optional(),
    occurrenceID: z.string().optional(),
    lastInterpreted: z.string().optional(),
  })
  .passthrough();

export type GbifOccurrence = z.infer<typeof gbifOccSchema>;

const gbifResponseSchema = z.object({
  offset: z.number(),
  limit: z.number(),
  endOfRecords: z.boolean(),
  count: z.number().optional(),
  results: z.array(gbifOccSchema),
});

export interface GbifSearchParams {
  taxonKey: number;
  /** WKT polygon. */
  geometry: string;
  lastInterpreted?: string; // ISO timestamp
  dateStart?: string;
  dateEnd?: string;
  contactEmail: string;
  /** If true, include GBIF records sourced from iNat. Defaults to false. */
  includeInat?: boolean;
}

/**
 * Iterate GBIF occurrences via /occurrence/search. Skips records whose
 * datasetKey matches the iNat Research-grade dataset (dedup vs iNat).
 *
 * For result sets larger than ~100k records (GBIF's offset ceiling) callers
 * should switch to the async Predicate Download API. We log a warning when
 * `count` approaches the limit so the user notices.
 */
export async function* iterateGbifOccurrences(
  params: GbifSearchParams
): AsyncGenerator<{ raw: GbifOccurrence; droppedAsInat: boolean }> {
  const {
    taxonKey,
    geometry,
    lastInterpreted,
    dateStart,
    dateEnd,
    contactEmail,
    includeInat = false,
  } = params;
  let offset = 0;
  let warned = false;
  while (true) {
    const url = new URL(`${BASE}/occurrence/search`);
    url.searchParams.set("taxonKey", String(taxonKey));
    url.searchParams.set("geometry", geometry);
    url.searchParams.set("hasCoordinate", "true");
    url.searchParams.set("hasGeospatialIssue", "false");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));
    if (dateStart && dateEnd) {
      url.searchParams.set("eventDate", `${dateStart},${dateEnd}`);
    } else if (dateStart) {
      // GBIF accepts an open-ended range with a wildcard upper bound.
      url.searchParams.set("eventDate", `${dateStart},*`);
    } else if (dateEnd) {
      url.searchParams.set("eventDate", `*,${dateEnd}`);
    }
    if (lastInterpreted) {
      // GBIF's lastInterpreted parameter accepts YYYY-MM-DD, not full ISO
      // timestamps — a millisecond-precision string returns 400.
      url.searchParams.set("lastInterpreted", `${lastInterpreted.slice(0, 10)},*`);
    }
    const data = await gbifFetch(url.toString(), contactEmail);
    const parsed = gbifResponseSchema.parse(data);
    if (!warned && parsed.count && parsed.count > 90_000) {
      console.warn(
        `[gbif] result set is large (count=${parsed.count}); approaching GBIF offset ceiling (${GBIF_OFFSET_CEILING}). Predicate Download flow recommended.`
      );
      warned = true;
    }
    for (const r of parsed.results) {
      const fromInat = r.datasetKey === INAT_GBIF_DATASET_KEY;
      const drop = fromInat && !includeInat;
      yield { raw: r, droppedAsInat: drop };
    }
    if (parsed.endOfRecords || parsed.results.length < PAGE_LIMIT) return;
    offset += PAGE_LIMIT;
    if (offset >= GBIF_OFFSET_CEILING) {
      console.warn(
        `[gbif] reached offset ceiling ${GBIF_OFFSET_CEILING}; remaining results require Predicate Download API (stub)`
      );
      return;
    }
  }
}

export function gbifOccurrenceUrl(gbifID: number | string): string {
  return `https://www.gbif.org/occurrence/${gbifID}`;
}

export function gbifAttribution(occ: GbifOccurrence): string {
  const who = occ.recordedBy?.trim() || "unknown";
  const lic = occ.license ?? "see GBIF";
  return `© ${who}, ${lic}, via GBIF`;
}

const datasetTitleSchema = z
  .object({
    key: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

/**
 * Resolve GBIF dataset keys to their published titles.
 * Sequential through the existing rate limiter (concurrency-1 keeps this
 * simple; total request count is small — one per unique dataset per view).
 * On any failure (404, network), falls back to a stable placeholder so the
 * UI always has something to render.
 */
export async function resolveGbifDatasetTitles(
  keys: string[],
  contactEmail: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    try {
      const data = await gbifFetch(`${BASE}/dataset/${key}`, contactEmail);
      const parsed = datasetTitleSchema.parse(data);
      out[key] = parsed.title?.trim() || `GBIF dataset ${key.slice(0, 8)}`;
    } catch {
      out[key] = `GBIF dataset ${key.slice(0, 8)}`;
    }
  }
  return out;
}
