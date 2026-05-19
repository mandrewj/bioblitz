# Top data sources

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `lib/store.ts` (schema bump shared with
[taxonomy-breakdown.md](taxonomy-breakdown.md)), `lib/sync.ts`,
`lib/gbif.ts` (new dataset-title resolver), `lib/queries.ts`,
new `app/api/views/[slug]/datasets/route.ts`,
new `components/datasets-card.tsx`, all `data/*.json` (regenerated).

## Intent

A short, attributable summary of where the records come from.
iNaturalist counts as one source. GBIF datasets are broken out
individually with their published titles. Gives readers and
contributors a fair picture of *which* institutions and platforms are
feeding the view.

## UX

New card titled **"Top data sources"** in the main column, below the
taxonomy card.

```
┌─ Top data sources ────────────────────────────────────────────┐
│                                                                │
│  ● iNaturalist Research-grade Observations    641   55.8%     │
│  ● Carnegie Museum of Natural History         180   15.7%     │
│  ● USA National Phenology Network              94    8.2%     │
│  ● BugGuide                                    62    5.4%     │
│  ● Field Museum Insects collection             41    3.6%     │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄                  │
│  …and 18 more datasets contributing 131 records (11.4%)        │
│  Show all                                                      │
└────────────────────────────────────────────────────────────────┘
```

- **iNaturalist always present at top** as a single line. (Per the
  user requirement: "iNat counting as one set.")
- **GBIF datasets broken out individually**, ranked by record count.
- **Bullet color**: iNat row uses `ok-orange`; GBIF rows use
  `forest-600`. Same source palette as the rest of the dashboard.
- **Top 5 visible by default**; tail collapsed into one footnote line
  ("…and N more datasets contributing M records"). The "Show all"
  link toggles a full inline list — no scroll inside the card.
- **Names link out**:
  - iNat row → `https://www.inaturalist.org/`
  - GBIF rows → `https://www.gbif.org/dataset/<datasetKey>`
- Percentages are relative to the current filtered total (respects
  `?rg=1`).

## Schema change

Adds one new field on `StoredView` (the shared `schemaVersion: 1 → 2`
bump captured in [taxonomy-breakdown.md](taxonomy-breakdown.md)):

```ts
interface StoredView {
  // ... existing fields ...
  datasetTitles: Record<string, string>; // NEW — { [datasetKey]: title }
}
```

Built incrementally. On each sync we look up titles only for new
`datasetKey`s; previously-resolved titles persist across syncs.

## Sync changes

### Title resolution (`lib/gbif.ts`)

GBIF dataset titles are at `GET https://api.gbif.org/v1/dataset/<key>`
→ JSON with a `title` field. Add a tiny helper:

```ts
export async function resolveGbifDatasetTitles(
  keys: string[],
  contactEmail: string
): Promise<Record<string, string>>;
```

- Concurrency 4, reuse the existing rate limiter and User-Agent.
- On 404 / error: keep the key in the result map but use a fallback
  display `"GBIF dataset (<short key>)"` so the card always has
  something to render.

### Wiring (`lib/sync.ts`)

After GBIF iteration completes:

1. Collect `Set` of `datasetKey`s from `merged.values()` where
   `source === "gbif"` and `datasetKey != null`.
2. Subtract keys already present in `prior?.datasetTitles`.
3. If any remain, call `resolveGbifDatasetTitles(newKeys, …)`.
4. Merge into the stored view: `{ ...prior?.datasetTitles, ...resolved }`.

Re-syncs are cheap — only newly-seen keys cost an API call.

## Implementation sketch

### Query

```ts
// lib/queries.ts
export interface DatasetRow {
  key: string | null;       // null for the iNat aggregate row
  source: "inat" | "gbif";
  title: string;
  records: number;
  pct: number;              // share of filtered total, 0..1
}

export function getDatasetsSummary(
  slug: string,
  researchOnly: boolean,
  topN = 5
): {
  top: DatasetRow[];                      // length ≤ topN; iNat row guaranteed first
  tail: { count: number; records: number; pct: number };
  total: number;
  all: DatasetRow[];                      // for "Show all"
};
```

Construction:

- Loop `filteredOccurrences`. Count records per `(source, key)`:
  - iNat rows bucket as `inat:_aggregate`.
  - GBIF rows bucket as `gbif:<datasetKey>`; null `datasetKey` rolls
    into `gbif:_unknown` (titled "GBIF (dataset not specified)").
- Resolve titles from `view.datasetTitles` for GBIF buckets.
- iNat title is the constant
  `"iNaturalist Research-grade Observations"`.
- Sort GBIF buckets by `records` desc. Take `topN - 1` (leaving the
  iNat row to slot in at index 0). Tail = sum of the rest.

### API route

`app/api/views/[slug]/datasets/route.ts` — `?rg`, `?topN` (default 5,
max 25). `revalidate: 60`.

### Component

`components/datasets-card.tsx` — minimal markup. Row template:

```tsx
<li className="flex items-baseline gap-3">
  <span className={`h-2 w-2 rounded-full bg-${row.source === "inat" ? "ok-orange" : "forest-600"}`} />
  <a href={titleHref(row)} target="_blank" rel="noreferrer"
     className="min-w-0 flex-1 truncate text-bark-600 hover:underline">
    {row.title}
  </a>
  <span className="text-bark-600 tabular-nums">{fmt(row.records)}</span>
  <span className="text-moss-600 text-xs tabular-nums">{(row.pct*100).toFixed(1)}%</span>
</li>
```

`expanded` state in the component flips between `top + tail line` and
the full `all` list.

## Risks

- **Long dataset titles** wrap awkwardly. Truncate with `truncate` +
  `title` tooltip; full title visible on hover.
- **GBIF title API rate limits.** Sequential calls at 4-concurrent
  with the existing limiter are well under any reasonable cap. First
  full sync of a view may add ~30 extra requests; subsequent syncs
  reuse cached titles.
- **Title drift over time.** If a publisher renames a dataset, we'd
  keep the older title until the next time that key is re-resolved.
  Mitigation: on `--full` sync, force re-resolution of all keys.
  Capture that as part of the sync flag's behavior.

## Open questions

- **Should the "Show all" expansion be capped** (e.g., 25), or truly
  show all? At our data scale full is fine — no scroll. Leaving
  uncapped.
- **Conservation-grade tagging of datasets** (e.g., flag
  museum-curated vs citizen-science aggregator) is interesting but
  outside scope here.
- **Per-dataset filtering of the rest of the dashboard** — natural
  follow-up; out of scope.

## Out of scope

- iNat dataset breakdown by project (iNat's "projects" feature). For
  now iNat is one aggregate.
- Dataset coverage maps (which datasets cover which parts of the
  AOI).
- DOI / citation block per dataset (the footer already carries the
  global citation; per-dataset DOIs are a follow-up).

## Acceptance checklist (when implemented)

- [ ] `schemaVersion: 2` shipped; `datasetTitles` populated on the
      stored view.
- [ ] `npm run sync -- eagle-creek-beetles --full` resolves every
      GBIF `datasetKey` to a title (or fallback) in one pass.
- [ ] Card renders iNat row first, then top 4 GBIF datasets.
- [ ] Tail footnote shows `"…and N more datasets contributing M
      records (P%)"` where the math is internally consistent.
- [ ] "Show all" expands inline.
- [ ] Each row links to the right place (iNat home or
      `gbif.org/dataset/<key>`).
- [ ] Percentages respect `?rg=1`.
- [ ] No requests to GBIF on subsequent (incremental) syncs unless a
      new dataset key appears.
