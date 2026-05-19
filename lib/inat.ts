import { z } from "zod";
import { createLimiter } from "@/lib/rate-limit";

const BASE = "https://api.inaturalist.org/v1";

const limiter = createLimiter(60, 60_000); // be a good citizen; iNat allows up to 100/min

function userAgent(contactEmail: string) {
  return `bioblitz-biodiversity-dashboard/0.1 (${contactEmail})`;
}

async function inatFetch(url: string, contactEmail: string) {
  await limiter();
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(contactEmail),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`iNat ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const taxonHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  rank: z.string().optional(),
  preferred_common_name: z.string().optional(),
});
const taxaResponseSchema = z.object({
  results: z.array(taxonHitSchema),
});

export async function resolveInatTaxon(
  name: string,
  contactEmail: string
): Promise<{ id: number; rank?: string; commonName?: string } | null> {
  const url = `${BASE}/taxa?q=${encodeURIComponent(name)}&per_page=5`;
  const data = await inatFetch(url, contactEmail);
  const parsed = taxaResponseSchema.parse(data);
  const exact =
    parsed.results.find((r) => r.name.toLowerCase() === name.toLowerCase()) ??
    parsed.results[0];
  if (!exact) return null;
  return {
    id: exact.id,
    rank: exact.rank,
    commonName: exact.preferred_common_name,
  };
}

// iNat observation API response: we only validate the subset of fields we use.
const obsSchema = z
  .object({
    id: z.number(),
    observed_on_details: z
      .object({
        date: z.string().optional(),
        year: z.number().optional(),
        month: z.number().optional(),
      })
      .nullable()
      .optional(),
    observed_on: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    geojson: z
      .object({
        type: z.literal("Point"),
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .nullable()
      .optional(),
    taxon: z
      .object({
        id: z.number(),
        name: z.string(),
        preferred_common_name: z.string().optional(),
        rank: z.string().optional(),
      })
      .nullable()
      .optional(),
    user: z
      .object({
        login: z.string(),
        name: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    license_code: z.string().nullable().optional(),
    quality_grade: z.string().nullable().optional(),
    photos: z
      .array(
        z.object({
          url: z.string(),
          license_code: z.string().nullable().optional(),
          attribution: z.string().nullable().optional(),
        })
      )
      .optional(),
    uri: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type InatObservation = z.infer<typeof obsSchema>;

const obsResponseSchema = z.object({
  total_results: z.number(),
  results: z.array(obsSchema),
});

export interface InatSearchParams {
  taxonId: number;
  // Either bbox prefilter or polygon via geo=true (server-side polygon
  // filtering is not exposed; we use bbox here and do polygon clipping
  // in Postgres with ST_Within after fetch).
  bbox: [number, number, number, number];
  updatedSince?: string; // ISO timestamp
  dateStart?: string; // YYYY-MM-DD
  dateEnd?: string; // YYYY-MM-DD
  perPage?: number;
  contactEmail: string;
}

/**
 * Iterate over iNat observations using id_above pagination.
 *
 * iNat caps page= pagination at 10,000 results total, so we use the
 * id_above cursor instead — see https://www.inaturalist.org/pages/api+recommended+practices
 */
export async function* iterateInatObservations(
  params: InatSearchParams
): AsyncGenerator<InatObservation> {
  const { bbox, taxonId, updatedSince, dateStart, dateEnd, contactEmail } = params;
  const perPage = params.perPage ?? 200;
  const [swlng, swlat, nelng, nelat] = bbox;
  let idAbove = 0;
  while (true) {
    const url = new URL(`${BASE}/observations`);
    url.searchParams.set("taxon_id", String(taxonId));
    url.searchParams.set("verifiable", "true");
    url.searchParams.set("geo", "true");
    url.searchParams.set("nelat", String(nelat));
    url.searchParams.set("nelng", String(nelng));
    url.searchParams.set("swlat", String(swlat));
    url.searchParams.set("swlng", String(swlng));
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("order_by", "id");
    url.searchParams.set("order", "asc");
    if (idAbove > 0) url.searchParams.set("id_above", String(idAbove));
    if (updatedSince) url.searchParams.set("updated_since", updatedSince);
    if (dateStart) url.searchParams.set("d1", dateStart);
    if (dateEnd) url.searchParams.set("d2", dateEnd);

    const data = await inatFetch(url.toString(), contactEmail);
    const parsed = obsResponseSchema.parse(data);
    if (parsed.results.length === 0) return;
    for (const r of parsed.results) {
      yield r;
      if (r.id > idAbove) idAbove = r.id;
    }
    if (parsed.results.length < perPage) return;
  }
}

export function inatObservationUrl(id: number): string {
  return `https://www.inaturalist.org/observations/${id}`;
}

/** Build attribution text: "© <observer>, <license>, via iNaturalist". */
export function inatAttribution(obs: InatObservation): string {
  const who = obs.user?.name?.trim() || obs.user?.login || "unknown";
  const license = obs.license_code ?? "all rights reserved";
  return `© ${who}, ${license}, via iNaturalist`;
}

export interface InatTaxonAncestry {
  order: string | null;
  family: string | null;
  genus: string | null;
}

const taxonAncestrySchema = z.object({
  results: z.array(
    z
      .object({
        id: z.number(),
        rank: z.string().optional(),
        name: z.string().optional(),
        ancestors: z
          .array(
            z.object({
              rank: z.string().optional(),
              name: z.string().optional(),
            })
          )
          .optional(),
      })
      .passthrough()
  ),
});

/**
 * Strip authorship from a scientific name. GBIF often stores
 * `"Genus species (Author, 1900)"`; iNat search wants the bare binomial
 * (or trinomial). Cuts at the first opening paren or comma; trims trailing
 * extras like `J.Lec., 1876`.
 */
export function cleanScientificName(name: string): string {
  // Strip authorship paren first.
  const noParen = name.replace(/\s*\(.*$/, "");
  // Common GBIF pattern: "Genus species J.Lec., 1876" — take just the first
  // two whitespace-separated tokens (binomial), or three (trinomial) if
  // tokens look like Latin names (start lowercase or known modifier).
  const parts = noParen.split(/\s+/).filter(Boolean);
  // Keep the first 2–3 tokens but stop at the first token that looks like
  // an author surname or year (capital initial after a lowercase, or digits).
  const out: string[] = [];
  for (let i = 0; i < parts.length && out.length < 3; i++) {
    const p = parts[i];
    if (/^\d/.test(p)) break;
    // Author surnames usually start uppercase and follow the species epithet.
    if (i >= 2 && /^[A-Z]/.test(p)) break;
    out.push(p);
  }
  return out.join(" ").trim();
}

const taxonPhotoSchema = z.object({
  results: z.array(
    z
      .object({
        id: z.number(),
        name: z.string(),
        rank: z.string().optional(),
        is_active: z.boolean().optional(),
        default_photo: z
          .object({
            medium_url: z.string().nullable().optional(),
            url: z.string().nullable().optional(),
            square_url: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      })
      .passthrough()
  ),
});

/**
 * Resolve representative iNat taxon photos for a batch of scientific names.
 * For each name, queries iNat `/taxa?q=<binomial>` and picks the active
 * taxon whose `name` matches the cleaned input exactly. Returns
 * `Record<originalName, url | null>` — null is cached too, so we don't
 * retry hopeless names on every sync.
 */
export async function resolveInatTaxonPhotos(
  names: string[],
  contactEmail: string
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const original of names) {
    const clean = cleanScientificName(original);
    if (!clean) {
      out[original] = null;
      continue;
    }
    try {
      const url = new URL(`${BASE}/taxa`);
      url.searchParams.set("q", clean);
      url.searchParams.set("is_active", "true");
      url.searchParams.set("per_page", "5");
      const data = await inatFetch(url.toString(), contactEmail);
      const parsed = taxonPhotoSchema.parse(data);
      const match =
        parsed.results.find(
          (t) => t.name.toLowerCase() === clean.toLowerCase() && t.is_active !== false
        ) ?? parsed.results[0];
      const p = match?.default_photo;
      out[original] = p?.medium_url || p?.url || p?.square_url || null;
    } catch {
      out[original] = null;
    }
  }
  return out;
}

/**
 * Look up order/family/genus for a batch of iNat taxon IDs.
 * Calls `/taxa/<id1>,<id2>` (up to 30 IDs/request — path-style, not the
 * `taxon_id[]=` filter which doesn't include `ancestors`).
 * Returns a map keyed by taxon ID (as string for JSON-friendliness).
 */
export async function resolveInatTaxonAncestry(
  taxonIds: number[],
  contactEmail: string
): Promise<Record<string, InatTaxonAncestry>> {
  const out: Record<string, InatTaxonAncestry> = {};
  if (taxonIds.length === 0) return out;
  const batchSize = 30;
  for (let i = 0; i < taxonIds.length; i += batchSize) {
    const batch = taxonIds.slice(i, i + batchSize);
    // iNat /taxa filters by a comma-separated `id` list. The /observations
    // endpoint uses `taxon_id[]=…`; the /taxa endpoint does not.
    const url = new URL(`${BASE}/taxa/${batch.join(",")}`);
    url.searchParams.set("per_page", String(batch.length));
    const data = await inatFetch(url.toString(), contactEmail);
    const parsed = taxonAncestrySchema.parse(data);
    for (const t of parsed.results) {
      const ranks: InatTaxonAncestry = { order: null, family: null, genus: null };
      const all = [...(t.ancestors ?? []), { rank: t.rank, name: t.name }];
      for (const a of all) {
        if (!a.rank || !a.name) continue;
        if (a.rank === "order") ranks.order = a.name;
        else if (a.rank === "family") ranks.family = a.name;
        else if (a.rank === "genus") ranks.genus = a.name;
      }
      out[String(t.id)] = ranks;
    }
  }
  return out;
}
