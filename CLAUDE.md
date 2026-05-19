@AGENTS.md

# Bioblitz — project context

A Next.js 16 / App Router dashboard that visualizes iNaturalist + GBIF
occurrence data for a configured polygon (AOI) and parent taxon. Built
for the Insect Diversity and Diagnostics Lab (https://insectid.org).

**Live**: https://bioblitz-dashboard.vercel.app/
**GitHub**: https://github.com/mandrewj/bioblitz

**Views shipped** (in `config/dashboard.config.yaml`):
- `eagle-creek-beetles` — Eagle Creek Park × Coleoptera, ~1,149 records / 317 species (all iNat)
- `harmonie-beetles` — Harmonie State Park × Coleoptera
- `harmonie-hymenoptera` — Harmonie State Park × Hymenoptera
- `big-oaks-beetles` — Big Oaks NWR × Coleoptera, ~657 records (30 iNat + 627 GBIF museum records from IDDL's own dataset)

See `docs/adding-views.md` for the workflow to add another.

## Storage architecture (read before changing data flow)

**No database.** Data lives in `data/<slug>.json`, committed to git. The
sync script (`npm run sync`) runs **locally** (or via a local cron) and
writes JSON files. The user pushes the result to deploy. Vercel functions
read the JSON at request time via `outputFileTracingIncludes` in
`next.config.ts`.

There is **no Vercel Cron**, **no Vercel Blob**, **no Postgres**, **no
CRON_SECRET**, **no admin/resync route**. The earlier Postgres/PostGIS
scaffold was removed on 2026-05-18.

Schema is currently **v3**. Bump history:
- v1: initial.
- v2 (2026-05-19): added `taxonOrder/Family/Genus` to each occurrence,
  plus `inatTaxonAncestry` and `datasetTitles` to the stored view.
- v3 (2026-05-19): added `taxonPhotos: Record<name, url|null>` to the
  stored view for fallback thumbnails on GBIF-only species (looked up
  via iNat `/taxa?q=<binomial>` at sync time).

`loadView` throws on older versions with a hint to run `npm run sync --
<slug> --full`. `--full` also skips loading the prior so the version
check doesn't block a schema-bump re-sync.

If data volume ever outgrows ~10 MB per view, revisit the choice. See
`memory/project_storage_decision.md`.

## Key files

| Path | What it does |
|---|---|
| `config/dashboard.config.yaml` | View definitions (region + taxon pairs, optional `description:` block scalar). Zod-validated at load — bad config dies loud. |
| `config/regions/eagle-creek.geojson` | Real iNat MultiPolygon for Eagle Creek Park (fetched once from `/v1/places/120856`). |
| `data/<slug>.json` | The sync output. Committed to git, ~640 KB for the default view. Schema v2 — see `lib/store.ts`. |
| `lib/config.ts` | YAML loader + Zod schema. Singleton; `resetConfigCache()` for tests. |
| `lib/region.ts` | GeoJSON / shapefile-zip loader; `toWKT` + `bboxAsWKT`; `extractPolygon`. shpjs is lazy-imported (it references `self` at module load — breaks Node). |
| `lib/inat.ts` | iNat client. `id_above` pagination (NOT `page=`, capped at 10k), 60-rpm limiter, User-Agent from `contactEmail`. Also `resolveInatTaxonAncestry` (path-style `/taxa/<id1>,<id2>` — the array-bracket form returns bare taxa without ancestors). |
| `lib/gbif.ts` | GBIF client. `INAT_GBIF_DATASET_KEY` constant for dedup. `eventDate` uses `start,*` / `*,end` / `start,end` — a trailing comma triggers 400. `resolveGbifDatasetTitles` resolves `datasetKey → title`. |
| `lib/sync.ts` | Orchestrates fetch → Turf clip → dedup → merge with prior → write JSON. Incremental via `lastSyncedAt` cursor; `--full` forces refetch *and* skips loading the prior (so a schema bump doesn't trip the version check). |
| `lib/queries.ts` | In-memory filters/aggregations over the JSON store. All sync — no async. Powers the 7 API routes. |
| `lib/inext.ts` | iNEXT rarefaction. Hurlbert interpolation with Heck/Smith-van Belle analytical variance; Chao1 extrapolation to `2n` with delta-method variance and log-CI (Chao 2014 eq. 5 + eq. 10). Unit-tested. |
| `lib/basemap.ts` | CARTO raster tile URL templates; no API key. |
| `components/map-view.tsx` | Leaflet — see "Map (Leaflet) gotchas" below. |
| `components/dashboard.tsx` | Client wrapper, lays out the page. Uses TanStack Query against `/api/views/[slug]/*`. |
| `components/species-panel.tsx` | Sticky right sidebar with paginated list + a `<Drawer>` rendered via portal (z-[1000]) for the species detail view. |
| `components/{accumulation-chart,taxonomy-card,contributors-card,datasets-card,phenology-chart}.tsx` | One card per data view. |
| `components/ui/primitives.tsx` | `Card`, `Button`, `Toggle`, `Select`, `Drawer` (portaled to `document.body`). |
| `app/api/views/[slug]/{summary,species,occurrences,accumulation,contributors,taxonomy,datasets}/route.ts` | Thin JSON readers — call `lib/queries.ts`. |
| `app/api/views/[slug]/checklist.csv/route.ts` | Darwin Core species checklist CSV. Columns: `order,family,genus,scientificName,scientificNameAuthorship,taxonRank,recordCount,inInaturalist,inGbif`. Includes species + genus-only + family-only rows. Linked from the species panel's "↓ CSV" chip. |
| `scripts/sync.ts` | CLI entry. `npm run sync [slug] [--full]`. |
| `next.config.ts` | `outputFileTracingIncludes` ships `data/` + `config/` into server functions. `headers()` sets the CSP `frame-ancestors` allow-list for iframe embedding. |

## Map (Leaflet) gotchas

Two things to know about the Leaflet integration:

1. **Client-only**: `MapView` is loaded via `dynamic(ssr: false)` in
   `dashboard.tsx`. Leaflet touches `window` at import time; SSR will
   throw without this. The bailout shows up in dev-server logs as
   `BAILOUT_TO_CLIENT_SIDE_RENDERING` — that's expected, not an error.
2. **`leaflet.markercluster` is a side-effect import** that monkey-
   patches the global `L`. Must be imported *after* `leaflet` in the
   same client bundle. `components/map-view.tsx` does it with
   `import "leaflet.markercluster";` right under the `import L` line —
   don't break the ordering.

We use `CircleMarker`, not `Marker`, so the standard Leaflet default-icon
404 problem is sidestepped. If you ever add a `<Marker>` (the pin icon),
you'll need the canonical
`L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })`
workaround.

**Drawer overlay z-index**: the species drawer is rendered via
`createPortal(..., document.body)` in `components/ui/primitives.tsx`. The
sticky sidebar's containing block can otherwise trap `position: fixed`
descendants and let the map render through them. Keep the portal.

## API quirks worth remembering

- **iNat** caps `page=` pagination at 10,000 results total. We use
  `id_above` cursor instead. Incremental via `updated_since`.
- **iNat `/taxa` ancestry** must use the path form
  `/taxa/<id1>,<id2>` — the `taxon_id[]=` filter (used on `/observations`)
  returns bare taxa with no `ancestors` array on this endpoint.
- **GBIF** dislikes large MULTIPOLYGON geometries (returns 400). The
  sync sends a bbox POLYGON via `bboxAsWKT()` and lets Turf
  `booleanPointInPolygon` enforce exact AOI membership client-side.
  Incremental via `lastInterpreted`.
- **GBIF eventDate** must be `start,end`, `start,*`, or `*,end`. A bare
  `start,` (trailing comma, no upper) is a 400.
- **iNat dataset on GBIF** is `50c9509d-22c7-4a22-a47d-8c48425ef4a7`.
  Stored as `INAT_GBIF_DATASET_KEY`. Don't hardcode it elsewhere.
- **iNat photos**: only show photos with `license_code !== null`. The
  default-view JSON drops `photoUrl` when `license` is empty.

## How to run

```bash
npm install
npm run dev                                          # http://localhost:3000
npm run sync                                         # refresh all views
npm run sync -- eagle-creek-beetles --full           # full refetch one view
npm test                                             # vitest, 18 tests
npx next build                                       # build check
```

## Adding a new view

1. Drop a `.geojson` or shapefile `.zip` into `config/regions/`.
2. Add an entry to `views[]` in `config/dashboard.config.yaml`.
3. `npm run sync -- <new-slug> --full` to populate `data/<new-slug>.json`.
4. `git add data/ config/ && git commit && git push`.

Taxon IDs are optional — the sync resolves them from the name on first
run and persists them in the data file.

## Tests

Three files in `tests/`:
- `inext.test.ts` (9 tests) — Hurlbert rarefaction at known points,
  Chao1 asymptote, monotonicity, **analytical-CI bracketing on
  singleton-heavy data** (the case that previously broke naive
  bootstrap), log-CI lower-bound discipline, CI-width monotonicity
  into the extrapolation region, asymptote-CI sanity.
- `clients.test.ts` (4 tests) — iNat pagination + User-Agent, GBIF
  iNat-dataset dedup, against committed JSON fixtures in
  `lib/__fixtures__/`.
- `config.test.ts` (5 tests) — Valid + malformed YAML scenarios; uses
  `DASHBOARD_CONFIG_PATH` env var override.

## Embedding

The dashboard is meant to be iframed into other lab properties. The
allow-list lives in `next.config.ts` as `EMBED_ALLOWED_ORIGINS`; it
sets the CSP `frame-ancestors` header. Current allow-list:
`'self'`, `https://insectid.org` + subdomains,
`https://indianabugs.com` + subdomains, `https://*.vercel.app`,
`http://localhost:*`. Edit and redeploy to add origins.

Sample embed (from any allow-listed page):

```html
<iframe src="https://bioblitz-dashboard.vercel.app/eagle-creek-beetles"
        width="100%" height="900" style="border:0" loading="lazy"></iframe>
```

## What's NOT built (intentional, per spec)

- User accounts / auth
- Editing config from the UI (it's committed YAML — redeploy to change)
- Conservation status enrichment, beta diversity
- Vercel Cron (replaced by local cron → git push)
- Time-window filters (e.g., "show only 2024 records")
- Filtering map / cards by selected contributor or dataset
