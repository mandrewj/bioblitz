# Adding a new bioblitz view

A "view" is a (region, taxon) pair that appears as its own page at
`/<slug>`. The four shipped views (`eagle-creek-beetles`,
`harmonie-beetles`, `harmonie-hymenoptera`, `big-oaks-beetles`) live in
`config/dashboard.config.yaml`. To add a new one you need three things:

1. A polygon for the area of interest (AOI).
2. A YAML entry in `config/dashboard.config.yaml`.
3. A sync run to fetch occurrence data into `data/<slug>.json`.

After that, commit `config/`, `data/`, and the new region file; push;
Vercel redeploys.

## 1. Get a polygon

The polygon lives at `config/regions/<your-slug>.geojson` (or `.zip`
for shapefiles). Three common ways to get one:

### A. From an iNaturalist place — easiest

If the location is already an iNat place (parks, refuges, reserves
usually are), pull the polygon straight from the iNat API. This is what
we did for both Eagle Creek (`places/120856`) and Big Oaks
(`places/119202`).

```bash
# 1. Find the place ID.
curl -sS -H "User-Agent: bioblitz-bootstrap (you@example.com)" \
  "https://api.inaturalist.org/v1/places/autocomplete?q=Big+Oaks+National+Wildlife&per_page=5" \
  | python3 -c "import json,sys; [print(r['id'], r['display_name']) for r in json.load(sys.stdin)['results']]"

# 2. Fetch the place and save its geometry as a GeoJSON FeatureCollection.
curl -sS -H "User-Agent: bioblitz-bootstrap (you@example.com)" \
  "https://api.inaturalist.org/v1/places/119202" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)['results'][0]
json.dump({
  'type':'FeatureCollection',
  'features':[{'type':'Feature','properties':{'name':r['display_name']},'geometry':r['geometry_geojson']}]
}, sys.stdout)
" > config/regions/big-oaks.geojson
```

### B. From a shapefile or GeoJSON you already have

Drop the file into `config/regions/`. Both formats work; for shapefiles
use a `.zip` containing the `.shp` + `.shx` + `.dbf` (the project's
`lib/region.ts` loader expects a single archived zip).

### C. Draw one yourself

Use [geojson.io](https://geojson.io), draw the polygon, copy the
GeoJSON, and save as `config/regions/<your-slug>.geojson`.

### Verify the polygon

A few sanity checks before you commit it:

```bash
python3 -c "
import json
d = json.load(open('config/regions/your-slug.geojson'))
g = d['features'][0]['geometry'] if d.get('type')=='FeatureCollection' else d.get('geometry', d)
print('geom type:', g['type'])  # Polygon or MultiPolygon
# bbox
def coords(g):
    if g['type']=='Polygon':
        for ring in g['coordinates']: yield from ring
    elif g['type']=='MultiPolygon':
        for poly in g['coordinates']:
            for ring in poly: yield from ring
cs = list(coords(g))
xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
print(f'bbox: {min(xs):.4f}, {min(ys):.4f}, {max(xs):.4f}, {max(ys):.4f}  ({len(cs)} verts)')
"
```

Make sure the bbox covers the area you expect. Coordinates are
`[lng, lat]` — the longitude (x) is negative in the Western
Hemisphere.

## 2. Add the YAML entry

Edit `config/dashboard.config.yaml` and append a new entry to `views[]`:

```yaml
  - slug: my-park-beetles            # lowercase + dashes, becomes the URL path
    displayName: "My Park — Beetles"  # appears as the title on the dashboard
    description: >-                  # optional, shown as a card under the title
      Short note about this project. Why was it run? Who participated?
      A sentence or two — YAML's `>-` folds line breaks into spaces.
    region:
      name: "My Park"                # shown as the eyebrow on the dashboard card
      source:
        kind: geojson                # or: shapefile-zip
        path: config/regions/my-park.geojson
    taxon:
      name: Coleoptera               # required; common taxa are listed below
      inatTaxonId: 47208             # optional; auto-resolved by name on first sync
      gbifTaxonKey: 1470             # optional; auto-resolved by name on first sync
    dateRange:
      start: 2000-01-01              # YYYY-MM-DD; lower bound for records
      end: ~                         # ~ = no upper bound; or use a YYYY-MM-DD
```

The slug must be unique across views and must match the polygon file's
base name in `config/regions/` (by convention; not enforced).

### Common taxon IDs

| Taxon | iNat ID | GBIF key |
|---|---|---|
| Insecta (all insects) | 47158 | 216 |
| Coleoptera (beetles) | 47208 | 1470 |
| Hymenoptera (wasps, bees, ants) | 47201 | 1457 |
| Lepidoptera (butterflies, moths) | 47157 | 797 |
| Diptera (flies) | 47822 | 811 |
| Hemiptera (true bugs) | 47744 | 809 |
| Odonata (dragonflies, damselflies) | 47792 | 789 |
| Araneae (spiders) | 47118 | 367 |
| Aves (birds) | 3 | 212 |
| Mammalia (mammals) | 40151 | 359 |

You can leave the IDs out and the sync will resolve them by name on
first run (writes them back into `data/<slug>.json` for traceability).
Including known IDs is slightly faster and avoids ambiguity for taxa
with confusable names.

## 3. Run the sync

```bash
npm run sync -- my-park-beetles --full
```

This hits both iNat (`/v1/observations`) and GBIF
(`/v1/occurrence/search`), clips to the polygon with Turf, dedups
GBIF's iNat mirror (`50c9509d-…`), resolves iNat ancestry for
family/genus breakdown, resolves GBIF dataset titles, and writes
everything to `data/my-park-beetles.json` at schema v3.

Expect 5–30 seconds for small AOIs (~50 records), 1–3 minutes for
larger ones (a thousand-plus records or many photo-less species
needing taxon-photo lookups).

The sync output will tell you:

```
{
  slug: 'my-park-beetles',
  inatFetched: 30,      ← API returned this many candidates
  inatKept: 30,         ← survived bbox + polygon filtering
  gbifFetched: 637,
  gbifKept: 627,        ← excludes records that came in via iNat's GBIF mirror
  gbifDroppedAsInat: 10,
  outsidePolygon: 0,    ← caught by Turf after the bbox prefilter
  totalAfter: 657,
  durationMs: 5361
}
```

If `outsidePolygon` is high, your polygon may be too tight or
mis-coordinates. If `gbifDroppedAsInat` is high, GBIF is mostly
mirroring iNat for this region/taxon (the dedup is working).

## 4. Verify, commit, push

```bash
# Restart dev to refresh the cached config singleton, then visit
# http://localhost:3000/my-park-beetles to eyeball it.
npm run dev

# Once it looks right:
git add config/dashboard.config.yaml \
        config/regions/my-park.geojson \
        data/my-park-beetles.json
git commit -m "view: my-park-beetles"
git push
```

Vercel auto-deploys on push to `main`. The new view appears on the
landing page immediately and at `/my-park-beetles` on the deployment.

## Refresh cadence

Records change over time. To refresh an existing view:

```bash
npm run sync                                # incremental: all views, only new records since lastSyncedAt
npm run sync -- my-park-beetles             # incremental: just one view
npm run sync -- my-park-beetles --full      # full re-fetch (use after schema bumps or to re-resolve titles)
git add data/ && git commit -m "data: refresh $(date +%Y-%m-%d)" && git push
```

A weekly local cron wrapper is sketched in the project `README.md` —
`crontab -e` an entry, give `cron` Full Disk Access on macOS, done.

## Troubleshooting

**"Unsupported data schema version" on `npm run dev`** — schema
bumped since the last sync; run `npm run sync -- <slug> --full`.

**View doesn't appear on the landing page in dev** — the config is
cached as a module singleton. Restart `npm run dev` to pick up the
edit. (Production refreshes per request, so this is dev-only.)

**`outsidePolygon` count is very high** — confirm the polygon's
coordinate order is `[lng, lat]` (GeoJSON spec) not `[lat, lng]` (some
exporters get this wrong).

**iNat 422 errors on taxon resolution** — the taxon name didn't match
exactly. Add `inatTaxonId` and `gbifTaxonKey` to the YAML to skip
auto-resolution.

**GBIF 400 on geometry** — the polygon is too complex or has too many
holes. Already handled: the sync sends the bbox POLYGON to GBIF and
clips client-side with Turf. If you see this, the regression's likely
in `lib/region.ts` or `lib/gbif.ts`.

## Related docs

- `docs/features/` — the shipped feature designs (map, sidebar,
  accumulation curve, taxonomy/contributors/datasets cards, branding).
- `README.md` — project overview, stack, deploy instructions.
- `CLAUDE.md` — internal architecture and gotchas (auto-loaded by
  Claude Code in this repo).
