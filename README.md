# Bioblitz — Biodiversity Dashboard

A customizable, deploy-on-Vercel dashboard that visualizes
[iNaturalist](https://www.inaturalist.org/) + [GBIF](https://www.gbif.org/)
occurrence data for a configured Area of Interest (AOI) polygon and parent
taxon. Built for the
[Insect Diversity and Diagnostics Lab](https://insectid.org).
Default view: **Eagle Creek Park, Indianapolis × Coleoptera (beetles)**.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 |
| Map | [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) + [leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), CARTO Positron/Voyager/Dark raster tiles |
| Charts | Recharts |
| Storage | **Committed JSON files in `data/<slug>.json`** — no database |
| Spatial | `@turf/turf booleanPointInPolygon` for exact polygon clipping |
| Data fetching | TanStack Query (client), Next fetch caching (server) |
| Refresh | **Local cron → `npm run sync` → `git push`** (re-deploy ships the data) |
| Validation | Zod (config + API responses) |
| Rarefaction | In-house port of iNEXT (Chao et al. 2014), unit-tested |

## What's in the box

- **iNat + GBIF clients** with `id_above` pagination (iNat), offset/limit
  (GBIF), 60-rpm rate limiting, User-Agent identifying the app + contact
  email from the YAML config.
- **GBIF dedup** of records sourced from iNaturalist via
  `datasetKey == 50c9509d-22c7-4a22-a47d-8c48425ef4a7`.
- **Polygon clipping** with Turf — a bbox prefilter goes to the upstream
  APIs, then `booleanPointInPolygon` enforces exact AOI membership before
  records are written to disk.
- **Leaflet map** with hybrid cluster/spider-fy click behavior, AOI
  polygon outline, source-colored points (orange = iNat, green = GBIF),
  React popups, basemap switcher (Light / Voyager / Dark).
- **Species panel** as a sticky right sidebar with paginated list and a
  full drawer (rendered through a portal so it sits above the map),
  phenology bar chart, CC-licensed photos with full attribution, and
  links to iNat + GBIF.
- **Species accumulation curve** — iNEXT interpolation (Hurlbert
  rarefaction with the analytical Heck/Smith-van Belle variance) and
  extrapolation to `2n` (Chao 2014 eq. 9, log-CI). Auto-generated caption
  with the live numbers + collapsible "How to read this curve" explainer.
- **Taxonomic breakdown** — Family / Genus toggle, stacked bar chart
  (iNat orange + GBIF green), top 15 of each rank.
- **Top contributors leaderboard** — top 15 observers across both
  sources with source pills and species-distinct counts. iNat names link
  to `inaturalist.org/people/<login>`.
- **Top data sources** — iNaturalist as one aggregate row, GBIF datasets
  broken out individually with their published titles (resolved at sync
  time from `gbif.org/v1/dataset/<key>`).
- **iNaturalist vs GBIF** source comparison card with the iNat→GBIF
  dedup tally.
- **Research-grade toggle** persisted in the URL.
- **InsectID branding**: logo in the title card, Lato typography, brand
  blue / cream / Okabe-Ito palette, footer attribution to the lab.

## Quickstart

```bash
# 1. Install
npm install

# 2. Configure — set contactEmail (iNat/GBIF etiquette)
#    config/dashboard.config.yaml is committed; edit it directly.

# 3. Pull data — hits iNat + GBIF, writes data/<slug>.json
npm run sync                                            # all views
npm run sync -- eagle-creek-beetles --full              # one view, full refetch

# 4. Run the dashboard
npm run dev
# open http://localhost:3000 → click "Eagle Creek Park — Beetles"
```

For the default view, the first sync takes ~15–30 s and writes a ~640 KB
JSON file with ~1.1k records, ~317 species, 229 cached iNat ancestry
entries. Schema is currently `v2`.

## Configuration

`config/dashboard.config.yaml` defines the views. Parsed at startup and
validated by Zod — a malformed file fails loudly naming the offending field.

```yaml
contactEmail: you@example.com
defaultBasemap: positron                       # positron | voyager | dark
views:
  - slug: eagle-creek-beetles
    displayName: "Eagle Creek Park — Beetles"
    region:
      name: "Eagle Creek Park"
      source:
        kind: geojson                          # or shapefile-zip
        path: config/regions/eagle-creek.geojson
    taxon:
      name: Coleoptera
      inatTaxonId: 47208                       # optional override
      gbifTaxonKey: 1470                       # optional override
    dateRange:
      start: 2000-01-01
      end: ~
```

To add a view, drop another entry into `views[]` and either provide a
GeoJSON polygon or a shapefile `.zip` in `config/regions/`.

## Refresh workflow

Data lives in `data/<slug>.json` and is committed to the repo. To refresh:

```bash
npm run sync
git add data/
git commit -m "data: weekly refresh $(date +%Y-%m-%d)"
git push
```

Deploys pick up the updated files automatically.

To wire this to a **weekly local cron**, drop a wrapper script and add a
`crontab -e` entry:

```bash
# ~/biodiversity-refresh.sh
#!/usr/bin/env bash
set -euo pipefail
cd /path/to/Bioblitz
npm run sync
if [[ -n "$(git status --porcelain data/)" ]]; then
  git add data/
  git commit -m "data: weekly refresh $(date +%Y-%m-%d)"
  git push
fi
```

```cron
# Every Monday at 04:00 local time
0 4 * * 1 /Users/you/biodiversity-refresh.sh >> /tmp/biodiversity.log 2>&1
```

(macOS users may need to grant `cron` Full Disk Access in System
Settings → Privacy & Security so it can access the repo.)

The `--full` flag forces a full re-pull (default is incremental using
`updated_since` / `lastInterpreted` cursors from `lastSyncedAt`). Use
`--full` after any schema bump.

## Deploying to Vercel

No database, no env vars required for the data path. The data files in
`data/` are bundled into the function payload via
`outputFileTracingIncludes` in `next.config.ts`.

```bash
npm i -g vercel
vercel deploy --prod
```

Optional env vars (set via `vercel env add`):
- `DASHBOARD_CONFIG_PATH` — override the config file path.
- `DASHBOARD_DATA_DIR` — override the data directory.

## Embedding in another site

The dashboard is configured to allow iframe embedding from a fixed
allow-list (currently `insectid.org`, `indianabugs.com`, and any
subdomain of either, plus `localhost` for dev). Embed it with:

```html
<iframe
  src="https://your-bioblitz.vercel.app/eagle-creek-beetles"
  width="100%"
  height="900"
  style="border:0"
  loading="lazy"
  title="Eagle Creek Park — Beetles"
></iframe>
```

To embed from another origin, add it to `EMBED_ALLOWED_ORIGINS` in
`next.config.ts` (controls the CSP `frame-ancestors` header) and
redeploy.

## Testing

```bash
npm test          # vitest: iNEXT math + iNat/GBIF clients + config validation
```

18 tests across 3 files: Hurlbert rarefaction at known points, Chao1
asymptotic richness, monotonicity, analytical-CI bracketing on
singleton-heavy data, log-CI lower-bound discipline, CI-width
monotonicity into the extrapolation region, asymptote-CI sanity, iNat
pagination + User-Agent, GBIF iNat-dataset dedup, and malformed-config
error paths.

## Repo layout

```
app/                      Next.js App Router pages + API routes
  /[viewSlug]/page.tsx    Dashboard for a single view
  /api/views/[slug]/…     Read endpoints (summary, species, occurrences,
                          accumulation, contributors, taxonomy, datasets)
components/               Map, sidebar, charts, cards, primitives
  dashboard.tsx           Orchestrator (TanStack Query, layout)
  map-view.tsx            Leaflet map + cluster + popups
  species-panel.tsx       Sticky sidebar list + drawer
  accumulation-chart.tsx  iNEXT chart with caption + explainer
  taxonomy-card.tsx       Family/Genus stacked bar chart
  contributors-card.tsx   Top contributors leaderboard
  datasets-card.tsx       Top data sources
  ui/primitives.tsx       Card, Button, Toggle, Select, Drawer (portal)
config/
  dashboard.config.yaml   View definitions
  dashboard.config.example.yaml
  regions/                Polygon files (GeoJSON or shapefile zips)
data/
  <slug>.json             Sync output (schema v2). Commit these.
lib/
  config.ts               YAML loader + Zod validation singleton
  region.ts               GeoJSON / shapefile loader, bbox + WKT helpers
  inat.ts                 iNat client (id_above pagination, ancestry)
  gbif.ts                 GBIF client (offset/limit, dataset titles)
  sync.ts                 Orchestrates fetch → Turf clip → merge → write JSON
  store.ts                StoredView / StoredOccurrence shape; loader/writer
  inext.ts                Rarefaction / extrapolation (Chao 2014, analytical)
  queries.ts              In-memory filters/aggregations over the JSON store
  basemap.ts              CARTO raster tile URLs
docs/features/            Design docs (all `shipped`)
scripts/
  sync.ts                 CLI entry: `npm run sync [slug] [--full]`
tests/                    inext, clients (fixture-based), config
next.config.ts            outputFileTracingIncludes + CSP headers
```

## Attribution & licensing notes

- **iNat photos**: shown only when `license_code` is non-null (CC). The
  attribution string is built from `user.login` + `license_code`.
- **GBIF**: respects the published etiquette — User-Agent identifies the
  app + contact email read from `contactEmail` in the YAML config. The
  iNaturalist Research-grade dataset
  (`50c9509d-22c7-4a22-a47d-8c48425ef4a7`) is filtered before writing so
  iNat observations are not double-counted.
- **GBIF geometry**: the upstream call uses the AOI bbox as a simple
  POLYGON (GBIF's parser dislikes large MULTIPOLYGONs); exact AOI
  membership is enforced by Turf client-side.

## Out of scope

User accounts / auth, editing config from the UI (it's committed YAML —
redeploy to change), conservation status enrichment, beta diversity,
CSV export.
