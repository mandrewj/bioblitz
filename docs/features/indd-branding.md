# INDD branding: logo, favicon, footer attribution

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `app/layout.tsx`, `app/favicon.ico`,
`public/images/insectID.png` (new), `components/dashboard.tsx` (footer),
new `components/site-header.tsx`.

## Intent

Align the Bioblitz dashboard with the Insect Diversity and Diagnostics
Lab's existing visual identity:

- Add the **INDD logo** to a slim site-wide header that appears on every
  page (landing + each view).
- Replace the **default Next.js favicon** with INDD's tab-bar mark.
- Add a small **copyright line** in the footer that credits the lab and
  links to `insectid.org`.

The dashboard's existing per-view Header card (view title + record/species
stats + research-grade toggle) is preserved beneath the new site header.

## UX

### Site header (new, on every page)

```
┌──────────────────────────────────────────────────────────────────────┐
│   [InsectID logo →]   Field Guide · Insect Diversity and Diagnostics │
│                       Lab                                            │
├──────────────────────────────────────────────────────────────────────┤
│   …page content (landing or view)…                                   │
```

- Surface: `bg-cream-50/70 backdrop-blur` with a single
  `border-b border-cream-300` divider. Same treatment INDD uses.
- Logo on the left at `h-12 sm:h-14`, `w-auto`. Aspect ratio 1094×474
  per the style guide — set `width={1094} height={474}` on the
  `<Image>` so Next.js sizes it correctly without CLS.
- Logo wraps an `<a href="https://insectid.org" target="_blank"
  rel="noreferrer">` (external) — mirrors INDD's SiteHeader.tsx
  behavior.
- To the right of the logo, a small eyebrow + label:
  ```html
  <p class="eyebrow">Field Guide</p>
  <p class="text-sm text-moss-600">Insect Diversity and Diagnostics Lab</p>
  ```
  Reads as a cross-property breadcrumb. Doubles as accessible
  attribution.
- The header is **not sticky** (matches INDD). It scrolls away with
  the rest of the page so the species sticky sidebar from
  [sidebar-species-panel.md](sidebar-species-panel.md) gets full
  viewport height to work with.
- Container: `mx-auto max-w-7xl px-4 py-3`. Tight vertical rhythm so
  it doesn't compete with the dashboard's own Header card below.

### Favicon

Copy `INDD_dashboard/app/favicon.ico` (3 KB) over the current
default `Bioblitz/app/favicon.ico` (25 KB Next.js default). Next.js
App Router picks up `app/favicon.ico` automatically — no metadata
plumbing needed.

### Footer copyright

Append to `components/dashboard.tsx`'s existing footer:

```
┌─ existing citation row ──────────────────────────────────────────┐
│  Occurrence data from iNaturalist …                              │
│  Map © OpenStreetMap contributors, © CARTO.                      │
│  [Cite this view]                                                │
├──────────────────────────────────────────────────────────────────┤
│  © 2026 Insect Diversity and Diagnostics Lab · insectid.org      │
└──────────────────────────────────────────────────────────────────┘
```

- A `mt-3 pt-3 border-t border-cream-300` divider inside the existing
  `<footer>`.
- Single line, `text-[11px] text-moss-600`, left-aligned.
- `insectid.org` rendered as a link
  (`href="https://insectid.org"`, brand-blue, underline-on-hover).
- Year is rendered dynamically: `new Date().getFullYear()`. Keeps it
  current without anyone remembering to edit on Jan 1.

## Implementation sketch

### Asset migration

```
cp /Users/andrew/Documents/Research/AI_workflows/INDD_dashboard/public/images/insectID.png \
   /Users/andrew/Documents/Research/AI_workflows/Bioblitz/public/images/insectID.png

cp /Users/andrew/Documents/Research/AI_workflows/INDD_dashboard/app/favicon.ico \
   /Users/andrew/Documents/Research/AI_workflows/Bioblitz/app/favicon.ico
```

Both files are tracked artifacts; commit them with the code changes.

### `components/site-header.tsx`

```tsx
import Image from "next/image";

export function SiteHeader() {
  return (
    <header className="border-b border-cream-300 bg-cream-50/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <a
          href="https://insectid.org"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-sm"
          aria-label="Insect Diversity and Diagnostics Lab (insectid.org)"
        >
          <Image
            src="/images/insectID.png"
            alt="InsectID"
            width={1094}
            height={474}
            priority
            className="h-12 w-auto sm:h-14"
          />
        </a>
        <div className="min-w-0">
          <p className="eyebrow">Field Guide</p>
          <p className="text-sm text-moss-600">
            Insect Diversity and Diagnostics Lab
          </p>
        </div>
      </div>
    </header>
  );
}
```

Server component (no `"use client"` — pure markup + `<Image>`).

### `app/layout.tsx`

Insert `<SiteHeader />` between `<body>` and `{children}`:

```tsx
<body className="min-h-full flex flex-col font-sans text-bark-600">
  <QueryProvider>
    <SiteHeader />
    {children}
  </QueryProvider>
</body>
```

`QueryProvider` wraps the header too so any future client features
inside it can hit React Query without a re-mount.

### Dashboard footer (`components/dashboard.tsx`)

Replace the existing `<footer>` body with:

```tsx
<footer className="mt-4 border-t border-cream-300 pt-4 text-xs text-moss-600">
  {/* existing citation row */}
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
    {/* …unchanged… */}
  </div>
  {showCitation && summary ? (
    /* …unchanged citation pre-block… */
  ) : null}

  {/* NEW: lab attribution */}
  <div className="mt-3 pt-3 border-t border-cream-300 text-[11px] text-moss-600">
    © {new Date().getFullYear()} Insect Diversity and Diagnostics Lab ·{" "}
    <a
      href="https://insectid.org"
      target="_blank"
      rel="noreferrer"
      className="text-forest-600 hover:underline"
    >
      insectid.org
    </a>
  </div>
</footer>
```

### Landing page (`app/page.tsx`)

No change — the site header from layout covers it. The landing's
existing eyebrow ("Field Guide · iNaturalist + GBIF") and `<h1>`
remain inside the page (now visually subordinate to the site header
above). If the duplication of "Field Guide" reads awkwardly once
both are visible, drop the eyebrow on the landing page — flagged as
an open question.

## Risks

- **Logo CLS.** Next.js `<Image>` with explicit `width`/`height`
  reserves the slot. The `priority` flag preloads the asset so the
  first paint includes it.
- **External link to `insectid.org`** uses `rel="noreferrer"` — no
  referrer leak, no tabnabbing risk.
- **License / permission.** The logo is shared with INDD; we're
  using it on a sister property. No external publication / press
  use; if that ever changes, double-check usage rights with the lab.
- **Year fencepost.** `new Date().getFullYear()` is evaluated on the
  server for SSR'd routes and client for client-rendered ones. Both
  resolve to "now" — fine.

## Open questions

- **Landing-page eyebrow duplication.** "Field Guide" appears in the
  site header *and* the landing page's hero eyebrow. Acceptable
  redundancy or drop the landing one? Inclined to drop it; trivial
  to revert.
- **Sticky vs not.** INDD's header is non-sticky and we proposed the
  same. If the dashboard ever gets a tall main column where the
  species sidebar runs past the header offscreen, the user can
  decide whether to revisit.
- **Logo size at mobile widths.** `h-12 sm:h-14` matches INDD. For
  very narrow viewports (< 360 px), the eyebrow text may wrap below
  the logo — confirm visually; if needed, hide the eyebrow under
  `sm:` and only show the logo at the smallest sizes.

## Out of scope

- A navigation menu in the site header (search, links to other
  Bioblitz views via a dropdown). The dashboard's own Header card
  already has a view-switcher `<select>`.
- Dark-mode variants of the logo or favicon. INDD is light-only; we
  match that.
- Per-page branding overrides. The site header is global.

## Acceptance checklist (when implemented)

- [ ] `public/images/insectID.png` and `app/favicon.ico` copied from
      INDD; both tracked in git.
- [ ] Browser tab on `localhost:3000` shows the INDD favicon.
- [ ] Site header renders on `/` and `/[viewSlug]` with the logo at
      `h-12 sm:h-14`, no CLS on first paint.
- [ ] Logo link opens `https://insectid.org` in a new tab.
- [ ] Eyebrow + lab name render to the right of the logo on
      `sm+` widths; logo stays prominent on mobile.
- [ ] Existing dashboard Header card remains visible below the site
      header with no overlap.
- [ ] Footer copyright line shows `© {currentYear} Insect Diversity
      and Diagnostics Lab · insectid.org` with the URL linked in
      brand-blue.
- [ ] No layout shift between SSR markup and client hydration on
      either route.
