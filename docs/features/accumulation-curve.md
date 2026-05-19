# Species accumulation curve — fix CI, separate observed/predicted, rewrite captions

**Status:** shipped 2026-05-19
**Owner:** —
**Affects:** `lib/inext.ts`, `components/accumulation-chart.tsx`,
`tests/inext.test.ts`, `app/api/views/[slug]/accumulation/route.ts` (minor)

## Intent

Make the species accumulation curve actually correct *and* readable for a
non-statistician.

What's wrong today (confirmed empirically against the live dev API on
`eagle-creek-beetles`):

1. **The 95% CI is biased downward and doesn't cover the point
   estimate.** At `m = n = 1,149` the estimate is **317** species, but
   the bootstrap CI is **[232, 258]** — the estimate sits ~60 species
   *above* its own upper bound. The CI band renders as a ribbon
   detached from the estimate curve. That's the "two lines" the user
   sees.

   Root cause: the bootstrap multinomially resamples the observed
   abundance vector. Resamples necessarily drop a random subset of
   singletons, so each bootstrap rep produces `S' < S_obs`. The
   distribution sits below the point estimate. This is the well-known
   bias that Chao et al. (2014, Appendix S2) addresses by reweighting
   the resample distribution and adding `f_hat0` "unseen species"
   placeholders — neither of which we do.

2. **Interpolation and extrapolation render as a single
   indistinguishable line.** The canonical iNEXT convention is solid
   for `m ≤ n` (rarefaction over data we *have*), dashed for `m > n`
   (forecast). We draw both as the same solid line; users have no
   visual cue for where measurement ends and prediction begins.

3. **The caption is citation-style, not interpretive.** Today:

   > Method: iNEXT rarefaction/extrapolation, q=0 (Chao et al. 2014).
   > n=1,149, S_obs=317, S_est=593.8.

   Accurate, but doesn't help anyone read the chart. A reader who
   doesn't already know what rarefaction is gets nothing.

## What we're doing

- **Replace bootstrap CIs with analytical variance** from Chao et al.
  (2014) eq. (5) (interpolation) and eq. (10) (extrapolation), plus
  the standard Chao1 variance for the asymptote. Deterministic, matches
  the canonical iNEXT R package, no bootstrap noise.
- **Render interpolation as a solid line, extrapolation as dashed**,
  with a prominent dot at `m = n` and a labeled asymptote line at
  `S_hat`.
- **Replace the caption with an auto-generated 1–2 line summary** that
  uses the live numbers, plus a `<details>` "How to read this curve"
  block beneath the chart for the longer explanation.

## UX

### Chart

```
   ▲ Species
   │
S∞ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  asymptote (Chao1) ≈ 594
   │                                ┄  ┄
   │                       ┄ ┄ ┄ ┄
   │                  ●─ ─ ─                       ← extrapolation
S₀ │              ╱   ↑ n=1,149                       (dashed)
   │           ╱      observed
   │        ╱
   │      ╱
   │    ╱                                              ← interpolation
   │  ╱                                                  (solid)
   │╱
   └────────────────────────────────────▶ Number of records
   0                  n                 2n
```

Concretely in Recharts terms:

- **Two `<Line>` series** sharing the same x/y axes. Split the
  `data.points` array at `m === n`:
  - `interpData` = points with `kind` ∈ {`interpolation`, `observed`}.
  - `extrapData` = points with `kind` ∈ {`observed`, `extrapolation`}
    (include the `observed` point so the two segments visually meet).
- Interpolation: solid, `stroke="#116dff"`, `strokeWidth={2}`.
- Extrapolation: dashed, `strokeDasharray="6 4"`, same color/width.
- **One `<Area>` series** for the 95% CI band over the full range
  (`fillOpacity={0.15}`, `stroke="none"`). Now actually centered on the
  estimate.
- **`<ReferenceDot x={n} y={sObs}>`** — 6px filled brand-blue dot with
  a small label "current sample (n=1,149)" anchored above-right.
- **`<ReferenceLine y={asymptoticS}>`** — dotted horizontal at the
  Chao1 asymptote, labeled "Estimated total ≈ 594" on the right.
- **Axes:**
  - X-axis label: `"Number of records"` (not "Individuals" — friendlier).
  - Y-axis label: `"Cumulative species observed"`.
- Keep the chart at `h-60` (240 px) on desktop. On mobile the chart
  card collapses to `h-48` for readability.

### Caption (above chart)

Auto-generated from the data. One or two short sentences with the live
numbers; use commas, spell out interpretation:

> **317 species in 1,149 records.** The curve hasn't plateaued —
> extrapolating to twice the effort we'd expect ~441 species (95% CI
> 412–470), and the community here likely holds **about 594 in total**,
> meaning roughly half of beetle diversity remains undocumented.

The exact phrasing comes from a small template function:

```ts
function captionFor(r: InextResult): React.ReactNode {
  const at2n = r.points.find(p => p.m === 2 * r.nObs);
  const unseen = Math.max(0, r.asymptoticS - r.sObs);
  const pctSeen = r.sObs / r.asymptoticS;
  return (
    <>
      <b>{fmt(r.sObs)} species in {fmt(r.nObs)} records.</b>{" "}
      {pctSeen < 0.85
        ? <>The curve hasn't plateaued — doubling the effort would likely turn up ~{fmt(at2n?.estimate)} species (95% CI {fmt(at2n?.ciLow)}–{fmt(at2n?.ciHigh)}), and the community here likely holds <b>about {fmt(r.asymptoticS)} in total</b>, meaning ~{fmt(unseen)} species remain undocumented.</>
        : <>Sampling is approaching completeness — the asymptote sits at <b>~{fmt(r.asymptoticS)}</b>, only ~{fmt(unseen)} species above what's already documented.</>}
    </>
  );
}
```

Two branches handle the "curve still climbing" vs "nearly saturated"
cases. We can refine the wording per-view later.

### "How to read this curve" (below chart)

A collapsed `<details>` element by default. Open it to see:

> **The curve.** Each point asks: *"if we'd seen only this many
> records, how many distinct species would we have counted?"*. We
> compute it by averaging over every possible order in which the
> records could have arrived (Hurlbert rarefaction).
>
> **Solid vs dashed.** Solid is over data we actually have; dashed
> projects forward to twice the current effort using the Chao1
> estimator (Chao 1984), which uses how many singletons (species seen
> once) and doubletons (species seen twice) we have to predict
> undetected diversity.
>
> **The dot** marks current effort (n records, S species observed).
> The **horizontal line at the top** is the estimated total richness
> of the community — where the curve would settle with infinite
> sampling.
>
> **The shaded band** is the analytical 95% confidence interval from
> Chao et al. (2014), eqns. 5 and 10. A wide band where the curve is
> still climbing means current effort hasn't constrained the answer
> well.

This block stays minimal — the caption above carries the load for the
casual reader; the details block is for the curious.

## Implementation sketch

### `lib/inext.ts` — math

Replace the bootstrap with analytical variance. The reference formulas
(adapted from Chao et al. 2014):

**Interpolation, `m ≤ n`** — variance of `E[S(m)]` (eq. 5):

```
Var(E[S(m)]) = sum_i [α_i (1 - α_i)] + 2 * sum_{i<j} [β_ij - α_i α_j]
where
  α_i  = 1 - C(n - X_i, m) / C(n, m)
  β_ij = 1 - [C(n - X_i, m) + C(n - X_j, m) - C(n - X_i - X_j, m)] / C(n, m)
```

The double sum can be evaluated in O(S²) which is fine — S is at most
a few thousand and we already pay O(S × knots) for the estimates.

**Extrapolation, `m > n`** — variance (Chao 2014, eq. 10) uses the
delta method on the Chao1 expression. We propagate the Var(f1),
Var(f2), and Cov(f1, f2) given the multinomial model:

```
Var(f_hat0) ≈ derived from Var/Cov(f1, f2)
Var(S_hat(n + m*)) = (∂S/∂f1)² Var(f1) + (∂S/∂f2)² Var(f2)
                   + 2 (∂S/∂f1)(∂S/∂f2) Cov(f1, f2)
```

Closed-form partials are in Chao 2014 Appendix S2 — port them.

**Log-transformed CI** (Chao recommends this so the CI lower bound
respects `S_obs`). Define:

```
K = exp(1.96 * sqrt(log(1 + Var / (S_hat - S_obs)²)))
ciLow  = S_obs + (S_hat - S_obs) / K
ciHigh = S_obs + (S_hat - S_obs) * K
```

with a safe fallback to symmetric `S_hat ± 1.96 * sqrt(Var)` when
`S_hat ≈ S_obs` (avoids divide-by-zero).

**Asymptote CI** — separate analytic variance for the Chao1 estimator,
returned as `asymptoticCI: [low, high]` so the caption and the
asymptote `ReferenceLine` can both use it.

### `lib/inext.ts` — API shape

```ts
export interface InextPoint {
  m: number;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  kind: "interpolation" | "observed" | "extrapolation";
}

export interface InextResult {
  nObs: number;
  sObs: number;
  asymptoticS: number;
  asymptoticCI: [number, number]; // NEW
  points: InextPoint[];
}
```

Drop `bootstrap`, `seed` from `inextParamsSchema` (no longer
applicable). Keep `knots`. Backward-compat note: the API route at
`app/api/views/[slug]/accumulation/route.ts` strips the bootstrap query
param — leave the route accepting (and ignoring) it for one cycle to
avoid breaking cached clients.

### `components/accumulation-chart.tsx`

- Split `data.points` into `interpData` and `extrapData` by `kind`.
- Render two `<Line>` series + one `<Area>` band.
- Add `<ReferenceDot>` for current effort and `<ReferenceLine>` for
  asymptote.
- Move the caption into a sibling `<p>` above the chart.
- Move the method explanation into a sibling `<details>` below.
- Color palette stays brand-blue throughout; CI band at 12% opacity so
  it doesn't compete with the line at the asymptote.

### `tests/inext.test.ts`

- Remove the "bootstrap CI brackets the point estimate" test (the
  bootstrap is gone).
- Add: "analytical CI brackets the point estimate at every knot" —
  this should pass on the Eagle Creek-shaped dataset (high `f1`),
  which is exactly the case the old test missed.
- Add: "CI width grows monotonically into the extrapolation region"
  — the analytical variance should increase with `m` past `n`.
- Add: "log-CI lower bound never drops below `S_obs`" — a property of
  the log-transformed CI.
- Optional but high-value: a reference test against R's `iNEXT::iNEXT`
  output for a tiny dataset. Hardcode 3–5 expected values; tolerate
  ±0.5% drift. Catches future regressions.

## Risks

- **Analytical variance is delicate to implement.** The Chao 2014
  formulas are not hard but easy to miswrite. Cross-check against R's
  `iNEXT` package output for at least one fixture during
  implementation.
- **`Cov(f1, f2)` sign convention** — different papers flip signs.
  Verify the partial derivatives against Chao 2014 Appendix S2 (not
  Chao 1987 — those use a slightly different parameterization).
- **`f1 = 0` edge case** — `f_hat0 = 0` and the log-CI formula
  divides by zero. Fall back to `ciLow = ciHigh = sObs` and emit
  `asymptoticCI = [sObs, sObs]`.
- **Removing `bootstrap`/`seed` params** is a (tiny) API surface break.
  The chart is the only caller and lives in the same monorepo, so
  low risk; flagged for awareness.

## Open questions

- **Should the caption switch tone per `pctSeen` threshold (e.g., add a
  third "curve is essentially flat" branch at >95%)?** Started with
  two branches; can split later as we see more views.
- **Asymptote label placement** — right-edge label can collide with
  the CI band at large `m`. Worth eyeballing once implemented.
- **Citation density.** Current explainer mentions "Chao 1984" for the
  estimator and "Chao et al. 2014, eqns 5 and 10" for the variance.
  Keep, or drop the year? Inclined to keep — they're load-bearing
  reproducibility breadcrumbs for the few users who'll click through.

## Out of scope

- Coverage-based rarefaction (sample-completeness curves).
- Hill numbers q=1, q=2 (Shannon, Simpson) — q=0 only here.
- Per-source curves (iNat-only vs GBIF-only). Possible follow-up.
- Caching the iNEXT result on disk during sync. Right now it's
  recomputed per request — fine at this scale.

## Acceptance checklist (when implemented)

- [ ] At `m = n`, the CI brackets the point estimate (`ciLow ≤ est ≤
      ciHigh`) on the Eagle Creek-beetles data. No more "two lines"
      visual.
- [ ] CI band visibly hugs the curve through interpolation and widens
      gently through extrapolation.
- [ ] Interpolation segment is solid; extrapolation segment is dashed;
      they meet at the `m = n` dot with no visible kink.
- [ ] Current-effort dot is labeled with `n` and `S_obs`.
- [ ] Asymptote line is labeled with `S_hat` and a tasteful CI hint.
- [ ] Caption above the chart reads in plain English and uses the live
      numbers; switches branches at `pctSeen ≈ 0.85`.
- [ ] "How to read this curve" `<details>` block opens to the
      explainer described above.
- [ ] `npm test` passes; new analytical-CI tests cover the previously
      missing case (high `f1`).
- [ ] At least one fixture compared against R `iNEXT` reference output
      within ±0.5%.
- [ ] Removed: bootstrap code path, `seed` param, `bootstrap` param
      (route still accepts and ignores them for one cycle).
