# Observer leaderboard

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `lib/queries.ts`, `components/dashboard.tsx`,
new `app/api/views/[slug]/contributors/route.ts`,
new `components/contributors-card.tsx`

## Intent

Surface the top people contributing records to each view, attribute them
properly, and let curious readers click through to learn more.

## UX

A new card titled **"Top contributors"** in the main column, just below
the iNat-vs-GBIF card. Single merged list, top 15 rows, ranked by total
records. Each row:

```
1.  pterygotuscoleopteran      iNat   213 records · 47 species
2.  Carnegie Museum staff      GBIF    87 records · 31 species
3.  ndmcclai                   iNat    66 records · 22 species
…
Showing top 15 of 142 · See all
```

- **Source pill** between name and counts. iNat = orange (`ok-orange`),
  GBIF = brand blue (`forest-600`); same encoding we use on the map and
  the iNat-vs-GBIF card.
- **iNat rows link** to `https://www.inaturalist.org/people/<login>` in
  a new tab. GBIF rows render as plain text (the `recordedBy` field is
  free-text and doesn't map to a profile URL).
- **Species column** is the distinct species count contributed by that
  observer. Reads "X species" with a smaller text scale, muted color.
- **Footer line** shows total observer count and a "See all" button
  that expands the card inline to top 50 (no separate route).

## Implementation sketch

### Normalization

GBIF `recordedBy` is messy free-text. Group with a small canonical
form:

```ts
function canonicalize(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
```

- Drop rows where canonical name is empty, `"anonymous"`, `"unknown"`,
  `"n/a"`, `"not specified"`, `"-"`, or `"."`.
- Bucket by `${source}:${canonicalize(name)}` so iNat and GBIF
  contributors stay in separate identity spaces (no cross-source
  attempt to match — they're not the same registries).
- Display the **most frequent original casing** seen in the dataset
  (preserve "Smith, J.A." over "smith, j.a.").

### Query

```ts
// lib/queries.ts
export interface ContributorRow {
  source: "inat" | "gbif";
  name: string;       // display form
  records: number;
  species: number;    // distinct taxon count
}
export function getTopContributors(
  slug: string,
  researchOnly: boolean,
  limit = 15
): { rows: ContributorRow[]; total: number };
```

- Single pass over `filteredOccurrences`. Build a
  `Map<string, ContributorRow & { _species: Set<string> }>`. Resolve
  display name as you go.
- Resolve distinct-species count by tracking `Set<taxonScientificName>`
  per bucket; output its `size` and discard the set.
- Sort by `records` desc; tiebreaker `species` desc.

### API route

`app/api/views/[slug]/contributors/route.ts` — thin reader, mirrors
the existing routes. Query params: `rg`, `limit` (default 15, max 50).

### Component

`components/contributors-card.tsx` — table inside a `Card`. Reuses
the source-pill component idea from the iNat-vs-GBIF card. Internal
state holds `expanded: boolean` to flip between limit=15 and limit=50.

### Dashboard wiring

Insert as a new card in `dashboard.tsx` main column, between the iNat-
vs-GBIF card and the footer:

```
… Map · Accumulation · iNat-vs-GBIF · **Contributors** · (Taxonomy) ·
(Datasets) · Footer
```

(See [taxonomy-breakdown.md](taxonomy-breakdown.md) and
[datasets-summary.md](datasets-summary.md) for the other two cards
landing in the same row of the main column.)

## Risks

- **GBIF `recordedBy` is genuinely messy.** Expect institution
  strings, semicolons, multiple authors squashed into one field, etc.
  Acceptable for v1; we won't try to parse multi-author fields. If a
  row reads weirdly, the source pill explains why.
- **Distinct-species count cost.** Builds one `Set` per contributor;
  worst case is small (a few hundred contributors × a few dozen
  species each). Trivial at our data scale.

## Open questions

- **Should we attempt cross-source identity matching** (an iNat user
  whose `recordedBy` on GBIF says their real name)? Punt for now —
  too brittle, not worth the false-match risk.
- **Click-through to filter the rest of the dashboard** by contributor
  is a natural follow-up but out of scope here.

## Out of scope

- Per-contributor map highlighting / panel filtering.
- Email contact / messaging.
- Time-window leaderboards (this year vs all time).
- "Verified iNaturalist users" badge style or similar trust signals.

## Acceptance checklist (when implemented)

- [ ] Card renders top 15 by records with source pills.
- [ ] iNat names link to `inaturalist.org/people/<login>` (new tab,
      `rel="noreferrer"`).
- [ ] Empty / placeholder GBIF `recordedBy` values are excluded.
- [ ] Display preserves the most common original casing per name.
- [ ] "See all" expands inline to top 50 without a re-fetch flicker.
- [ ] `?rg=1` (research-grade) toggle re-filters the leaderboard.
- [ ] Query under 50 ms at current data scale.
