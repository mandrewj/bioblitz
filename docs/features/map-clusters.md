# Map: clusters + individual points

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `components/map-view.tsx`, `lib/basemap.ts`, `app/globals.css`, `package.json`, `CLAUDE.md` (gotchas section), `memory/maplibre_gotchas.md`

## Intent

Replace the existing MapLibre heatmap / cluster toggle with a single, polished
cluster-and-points experience powered by Leaflet + `leaflet.markercluster`.
Density is conveyed by cluster size; individual records are conveyed by colored
points (iNat orange / GBIF blue) once you're zoomed in enough that a cluster
would obscure them. No more heatmap.

Why now: we're already removing the heatmap (the one feature MapLibre uniquely
shines at for this use case). With the dataset capped around a few thousand
points per view, Leaflet's smaller bundle, friendlier React popups, and
spider-fy-on-cluster-click win on every axis that matters here.

## UX

### Default state

- Brand-blue circular clusters, sized by count.
- White count label centered, tabular numerals.
- Region polygon as today: 6% brand-blue fill, 2px brand-blue outline.
- Bbox-fit on first load.
- Top-left toolbar: basemap selector (Light / Voyager / Dark). The heatmap /
  cluster toggle goes away.
- Bottom-right legend: source dot swatches (iNat orange, GBIF blue) and a small
  cluster-size hint.

### Cluster sizing

Three buckets, all in brand blue (`forest-600` = #116dff) with white text:

| Bucket | Count | Diameter |
|---|---|---|
| small | < 25 | 28 px |
| medium | 25–99 | 36 px |
| large | 100+ | 46 px |

Slight 90% opacity so overlapping clusters don't fully mask each other.

### Individual points

- 6 px circle, white 1.5 px stroke.
- Fill = source color (iNat → `#E69F00`, GBIF → `#116dff`).
- Shown when zoom > `clusterMaxZoom` (default 14) OR when the user clicks a
  cluster small enough to spider-fy (see below).

### Cluster click behavior — hybrid

`leaflet.markercluster` supports both. Wire them this way:

- **Low zoom (zoom < 12)** → zoom-to-cluster (use cluster's `getBounds()` and
  `fitBounds`). Tap once to descend.
- **Mid zoom (12 ≤ zoom < 16)** → if zooming further would still keep all
  children inside one cluster (test via `cluster.getChildCount() > 1 &&
  zoom + 1` won't break them apart), spider-fy. Otherwise zoom.
- **High zoom (zoom ≥ 16)** → always spider-fy. The map is already as deep as
  meaningful.

`leaflet.markercluster` exposes `spiderfyOnMaxZoom: true` plus an
`onClusterClick` handler — we'll use the handler to apply the rule above
instead of the default zoom-only behavior.

### Popup (on individual-point click)

A React component rendered into Leaflet's popup container via
`react-leaflet`'s `<Popup>`. Replaces the inline-HTML string we currently
build. Fields:

- Photo (if CC-licensed and present)
- Scientific name (italic)
- Observed-on date · observer
- Attribution (small, muted)
- Source pill + link ("View on iNaturalist →" / "View on GBIF →")
  styled with brand chips already used in `species-panel.tsx`.

### Spider-fy lines

Default `leaflet.markercluster` draws hairline lines from the spider-fy center
to each leg. Override the CSS so lines and leg circles match brand blue at low
opacity — keeps the swarm visually coherent.

## Implementation sketch

### Dependencies

- Add: `leaflet`, `react-leaflet`, `leaflet.markercluster`, `@types/leaflet`,
  `@types/leaflet.markercluster`.
- Drop: `maplibre-gl`.

### Files

- **`lib/basemap.ts`** — change from MapLibre style URLs to raster tile URL
  templates. CARTO offers raster equivalents of all three current basemaps:
  - Light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`
  - Voyager: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`
  - Dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`
  Subdomains `a`, `b`, `c`, `d`. Drop the `maptilerKey` plumbing (no longer
  needed; CARTO raster tiles are public, no API key).
- **`components/map-view.tsx`** — rewrite. Keep the `dynamic(ssr: false)`
  pattern; Leaflet hits `window` at import time.
- **`app/globals.css`** — replace
  `@import "maplibre-gl/dist/maplibre-gl.css"` with
  `@import "leaflet/dist/leaflet.css"` and
  `@import "leaflet.markercluster/dist/MarkerCluster.css"` /
  `MarkerCluster.Default.css`. Add a small override block to recolor cluster
  bubbles and spider lines to brand blue.
- **`next.config.ts`** — no change. Leaflet's CSS is included via globals;
  data still ships via `outputFileTracingIncludes`.
- **`CLAUDE.md` + `memory/maplibre_gotchas.md`** — the four MapLibre fixes
  become obsolete after this lands. Replace that section with a much shorter
  "Leaflet gotchas" note (likely just: import client-only, register markercluster
  side-effect before use).

### Component shape

```tsx
// components/map-view.tsx (sketch)
"use client";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster"; // typed wrapper
import L from "leaflet";

export default function MapView({ occurrences, region, defaultBasemap }) {
  return (
    <div className="relative w-full" style={{ height: "60vh", minHeight: 460 }}>
      <MapContainer bounds={regionBounds} className="h-full w-full rounded-lg">
        <BasemapSwitcher initial={defaultBasemap} />
        {region && <GeoJSON data={region} style={REGION_STYLE} />}
        <MarkerClusterGroup
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          iconCreateFunction={makeClusterIcon}
          onClusterClick={handleClusterClick}
        >
          {occurrences.map((o) => (
            <CircleMarker key={o.id} center={[o.lat, o.lng]} {...pointStyle(o)}>
              <Popup>
                <OccurrencePopup o={o} />
              </Popup>
            </CircleMarker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      <MapControls />  {/* basemap selector + legend overlays */}
    </div>
  );
}
```

The basemap swap becomes trivial (change `<TileLayer>`'s `url` prop). No
`style.load` race, no `setStyle()`, no epoch counter.

### Cluster icon factory

`leaflet.markercluster`'s `iconCreateFunction(cluster)` returns an
`L.DivIcon` — pure HTML/CSS. We render a `<div>` with our brand-blue circle +
white count, sized by `cluster.getChildCount()`. No canvas, no shaders; just
DOM that the existing Tailwind tokens cover.

### Render order

`occurrences` is up to ~1.1k features today. `MarkerClusterGroup` handles that
trivially. If a future view ever pushes past ~20k, we'd need to either switch
to `leaflet.markercluster`'s `chunkedLoading` mode or revisit — well outside
current scope.

## Risks

- **Leaflet must stay client-only.** Already handled via `next/dynamic({ ssr:
  false })`; same constraint as today.
- **`leaflet.markercluster` is a side-effect import** — it monkey-patches `L`.
  Must be imported *after* `leaflet` in the same client bundle. Easy, but the
  one thing to remember.
- **Marker icon default 404s** in some bundlers (Leaflet ships PNG paths
  relative to a CDN). We don't use the default marker (we use `CircleMarker`),
  so this risk is dodged — but if anyone adds a `<Marker>` later, they'll need
  the standard `L.Icon.Default.mergeOptions` workaround.
- **Bbox fit** — `MapContainer`'s `bounds` prop only applies at mount. A
  region change after mount would need a child component using `useMap()` to
  call `fitBounds`. We currently only swap regions via a full-page nav, so
  mount-time is enough.
- **Existing MapLibre CSS classes in `components/map-view.tsx` (`.maplibregl-*`)**
  — none used; we own all the styling via Tailwind. No cleanup beyond the file
  rewrite.

## Open questions

- **Min-zoom for individual points to appear**: default `clusterMaxZoom: 14`
  matches the current behavior. Worth checking against the Eagle Creek view to
  confirm 14 is comfortable; might lower to 13 if clusters feel sticky.
- **Cluster polygon-on-hover**: `leaflet.markercluster` can outline the convex
  hull of a cluster's children on hover. Cute but possibly noisy. Default off;
  revisit if useful.
- **Should we keep `maptilerKey` plumbing for future vector use?** Proposing
  no — the env var, the `lib/basemap.ts` signature, and the `next.config.ts`
  reference all get simpler if we drop it. Easy to re-add later if needed.

## Out of scope

- New basemap providers (e.g., Esri imagery, OSM).
- Time-slider / phenology animation over the map.
- Per-species filtering on the map (could be added later — would feed the
  filter into `occurrences` prop client-side).
- Server-side cluster pre-aggregation (irrelevant at current scale).

## Acceptance checklist (when implemented)

- [ ] Heatmap mode and its toggle removed.
- [ ] Clusters render in brand blue with size buckets; counts visible at all
      basemap variants.
- [ ] Click low-zoom cluster → zooms in.
- [ ] Click high-zoom cluster → spider-fies; lines/legs visible against all
      three basemaps.
- [ ] Click individual point → React popup renders with photo (if any),
      scientific name italic, observed date, observer, attribution, source
      link.
- [ ] Basemap selector switches Light / Voyager / Dark cleanly with no flash
      of unstyled tiles.
- [ ] `npm run build` succeeds; bundle size for the dashboard route drops
      relative to baseline (sanity check the swap actually shed weight).
- [ ] `CLAUDE.md` and `memory/maplibre_gotchas.md` updated (MapLibre fixes
      removed; brief Leaflet notes added if any).
- [ ] `maplibre-gl` removed from `package.json`.
