# Layout: species panel as full-height sidebar

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `components/dashboard.tsx`, `components/species-panel.tsx`

## Intent

On desktop, promote the species list from a third-row card into a full-height
sticky sidebar that begins just under the header and runs alongside the map
and the rest of the main column. Browsing the species list and inspecting
the map / charts should feel like two parallel activities, not sequential
ones.

Mobile keeps a stacked single-column layout.

## UX

### Desktop (≥ `lg`)

```
┌─────────────────────────────────────────────────────────────┐
│  Header card (full width)                                   │
├──────────────────────────────────────────┬──────────────────┤
│  Map card                                │ Species panel    │
│                                          │  (sticky)        │
│                                          │  ┌────────────┐  │
│                                          │  │ Header     │  │
├──────────────────────────────────────────┤  │ ────────── │  │
│  Species accumulation curve              │  │ Row        │  │
│                                          │  │ Row        │  │
├──────────────────────────────────────────┤  │ Row (scroll│  │
│  iNaturalist vs GBIF                     │  │ inside)    │  │
│                                          │  │  ⋮         │  │
├──────────────────────────────────────────┤  └────────────┘  │
│  Footer                                  │                  │
└──────────────────────────────────────────┴──────────────────┘
```

- **Grid: `lg:grid-cols-4`, main column `col-span-3`, species panel
  `col-span-1`** (the 3:1 split selected).
- Species panel wrapped in `<aside class="sticky top-4 h-[calc(100vh-2rem)]">`.
  Sticks to the viewport top with a small breathing margin; height clamped
  to viewport minus the same margin top + bottom.
- Inside the panel: a flex column — header (pagination) pinned, body
  (`<ul>` of species rows) `flex-1 overflow-y-auto`. Scrolling the list
  doesn't scroll the page. Pagination buttons stay visible at all times.

### Mobile (< `lg`)

- Grid collapses to a single column.
- Order: header → map → accumulation → iNat vs GBIF → **species panel**
  → footer.
- Species panel reverts to its current natural-height behavior; no sticky,
  no internal scroll. Pagination handles long lists.
- Same as today's mobile experience, just with the panel no longer
  appearing before the bottom-of-page charts.

### Map size note

The map remains at `60vh` / `minHeight: 460`. The 3:1 split makes it
horizontally narrower on `lg` — confirm visually that the AOI bbox still
fits comfortably; if not, drop to `52vh`. Left as an open question.

## Implementation sketch

### `components/dashboard.tsx`

Restructure the body of the main return:

```tsx
<div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4">
  <Header ... />

  <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
    {/* Main column */}
    <div className="space-y-4 lg:col-span-3">
      <Card>
        <CardBody className="p-0"><MapView ... /></CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Species accumulation curve</CardTitle></CardHeader>
        <CardBody>...</CardBody>
      </Card>

      <SourceComparison summary={summary.data} />
    </div>

    {/* Sticky species sidebar */}
    <aside className="lg:col-span-1">
      <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <SpeciesPanel slug={slug} researchOnly={researchOnly} />
      </div>
    </aside>
  </div>

  <Footer summary={summary.data ?? null} />
</div>
```

Notes:
- The `lg:` prefixes on the sticky/height classes scope all sidebar
  behavior to desktop. On mobile the `<aside>` is just a block.
- `space-y-4` on the main column preserves today's vertical rhythm.
- The map card no longer lives outside the grid — it's the first card in
  the left column.

### `components/species-panel.tsx`

Today the panel is `<Card className="h-full overflow-hidden">`. To make
internal scrolling work inside the sticky shell, switch to a flex column
where the header is fixed and the body scrolls:

```tsx
<Card className="flex h-full flex-col overflow-hidden">
  <CardHeader className="flex-shrink-0">…pagination…</CardHeader>
  <CardBody className="flex-1 overflow-y-auto p-0">
    <ul>…</ul>
  </CardBody>
</Card>
```

- `h-full` makes the card fill the parent (which on desktop is
  `h-[calc(100vh-2rem)]`).
- On mobile, the parent has no explicit height, so `h-full` resolves to
  the panel's intrinsic content height — exactly today's behavior.
- `overflow-y-auto` on `CardBody` activates scroll only when content
  exceeds the visible height — which happens on desktop but not in the
  shorter mobile stack.

The pagination row keeps `1–N` indicator + prev/next buttons; nothing
changes structurally there.

## Risks

- **Sticky inside CSS grid track** — Sticky positioning requires a
  scrollable ancestor and works inside grid tracks, but the parent track
  has to be at least as tall as the sticky offset window or the panel
  has nowhere to "stick" while scrolling. With map + accumulation + iNat
  vs GBIF in the left column, the main column will always be taller than
  the sidebar; safe.
- **Layout shift on first paint** — the panel becomes full-height before
  the first `useQuery` resolves; the scroll area will momentarily show
  "Loading…" centered. Acceptable, matches the rest of the dashboard's
  loading states.
- **Map narrower at 3:1** — see "Map size note" above. Open question
  whether to drop map height a bit.
- **Mobile order** — current order on mobile is `header → map → charts →
  species`; new order matches (species moves *after* charts). Confirm
  that's the preferred mobile reading order.

## Open questions

- Trim map height (`60vh` → `52vh`) on the new 3:1 split, or leave it?
- Should the sticky offset be larger if a top app-nav lands later? Today
  there's no nav, so `top-4` is fine.
- Once the [map clusters feature](map-clusters.md) ships, consider a
  "hover species → highlight cluster on map" interaction. Out of scope
  here.

## Out of scope

- Filter/search inputs on the species panel header.
- Sync between species panel and map (hover-highlight, etc.).
- Reorderable / collapsible sidebar.
- Changes to mobile layout beyond the natural stacking that falls out
  of the grid change.

## Acceptance checklist (when implemented)

- [ ] Desktop: species panel sits in a right sidebar starting just under
      the header, running the full page length.
- [ ] Desktop: species list scrolls *inside* the panel; page does not
      scroll when the cursor is over the list area.
- [ ] Desktop: pagination header stays visible while scrolling the list.
- [ ] Desktop: map + accumulation + iNat vs GBIF stack vertically in the
      3-col-wide main column.
- [ ] Mobile: layout collapses to a single column, species panel below
      iNat vs GBIF, no sticky behavior.
- [ ] No layout shift after data loads on either viewport.
- [ ] Map AOI fits comfortably at the new width on a 13" laptop (or
      adjust height per the open question).
