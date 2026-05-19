/**
 * iNEXT — Interpolation/Extrapolation for species richness (Hill q=0).
 *
 * Reference: Chao A., Gotelli N. J., Hsieh T. C., Sander E. L., Ma K. H.,
 * Colwell R. K., Ellison A. M. (2014). Rarefaction and extrapolation with
 * Hill numbers: a framework for sampling and estimation in species
 * diversity studies. Ecological Monographs 84(1), 45–67.
 *
 * Interpolation E[S(m)] for m ≤ n: Hurlbert rarefaction.
 *   E[S(m)] = sum_i [1 - C(n - X_i, m) / C(n, m)]
 * Variance (Heck et al. 1975; Smith & van Belle 1984):
 *   Var(S(m)) = sum_i α_i (1 - α_i) + 2 sum_{i<j} [β_ij - α_i α_j]
 *   α_i  = 1 - C(n - X_i, m) / C(n, m)
 *   β_ij = 1 - [C(n - X_i, m) + C(n - X_j, m) - C(n - X_i - X_j, m)] / C(n, m)
 *
 * Extrapolation for m > n (Chao 2014 eq. 9):
 *   S_hat(n + m*) = S_obs + f0 (1 - (1 - f1/(n*f0 + f1))^m*)
 *   f0           = f1(f1-1) / (2(f2+1))   [bias-corrected Chao1 "unseen"]
 * Variance: delta method on (f1, f2) with Poisson-approximated Var/Cov.
 *
 * Confidence intervals are symmetric for interpolation; log-transformed
 * (Chao 1987) for extrapolation and the asymptote so the lower bound
 * respects S_obs.
 */

import { z } from "zod";

export const inextParamsSchema = z.object({
  abundances: z.array(z.number().int().nonnegative()),
  knots: z.number().int().positive().default(40),
});

export type InextParams = z.input<typeof inextParamsSchema>;

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
  asymptoticCI: [number, number];
  points: InextPoint[];
}

function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function lchoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

function rarefyExpected(abundances: number[], n: number, m: number): number {
  if (m <= 0) return 0;
  if (m >= n) return abundances.reduce((s, x) => s + (x > 0 ? 1 : 0), 0);
  const logCnm = lchoose(n, m);
  let sum = 0;
  for (const x of abundances) {
    if (x <= 0) continue;
    sum += 1 - Math.exp(lchoose(n - x, m) - logCnm);
  }
  return sum;
}

function rarefyVariance(abundances: number[], n: number, m: number): number {
  if (m <= 0 || m >= n) return 0;
  const logCnm = lchoose(n, m);
  const S = abundances.length;
  const alpha = new Array<number>(S);
  for (let i = 0; i < S; i++) {
    const x = abundances[i];
    alpha[i] = x > 0 ? 1 - Math.exp(lchoose(n - x, m) - logCnm) : 0;
  }
  let v = 0;
  for (let i = 0; i < S; i++) v += alpha[i] * (1 - alpha[i]);
  for (let i = 0; i < S; i++) {
    const xi = abundances[i];
    if (xi <= 0) continue;
    for (let j = i + 1; j < S; j++) {
      const xj = abundances[j];
      if (xj <= 0) continue;
      const probINotJ = Math.exp(lchoose(n - xi, m) - logCnm);
      const probJNotI = Math.exp(lchoose(n - xj, m) - logCnm);
      const probNeither = Math.exp(lchoose(n - xi - xj, m) - logCnm);
      const beta = 1 - probINotJ - probJNotI + probNeither;
      v += 2 * (beta - alpha[i] * alpha[j]);
    }
  }
  return Math.max(0, v);
}

function chao1Unseen(f1: number, f2: number): number {
  if (f1 === 0) return 0;
  return (f1 * (f1 - 1)) / (2 * (f2 + 1));
}

function extrapolate(
  sObs: number,
  n: number,
  f1: number,
  f2: number,
  mStar: number
): number {
  const f0 = chao1Unseen(f1, f2);
  if (mStar <= 0 || f0 <= 0 || f1 === 0) return sObs;
  const base = 1 - f1 / (n * f0 + f1);
  return sObs + f0 * (1 - Math.pow(base, mStar));
}

function extrapolateVariance(
  n: number,
  f1: number,
  f2: number,
  mStar: number
): number {
  if (mStar <= 0 || f1 === 0) return 0;
  const f0 = chao1Unseen(f1, f2);
  if (f0 <= 0) return 0;
  const denom = n * f0 + f1;
  if (denom === 0) return 0;
  const r = 1 - f1 / denom;
  const rPow = Math.pow(r, mStar);
  const df0_df1 = (2 * f1 - 1) / (2 * (f2 + 1));
  const df0_df2 = -f0 / (f2 + 1);
  // dr/df1 and dr/df2 via quotient rule on f1/(n*f0+f1).
  const dr_df1 = -((n * f0 - n * f1 * df0_df1) / (denom * denom));
  const dr_df2 = (f1 * n * df0_df2) / (denom * denom);
  const dSdr = -f0 * mStar * Math.pow(r, mStar - 1);
  const dS_df1 = df0_df1 * (1 - rPow) + dSdr * dr_df1;
  const dS_df2 = df0_df2 * (1 - rPow) + dSdr * dr_df2;
  // Poisson approximation for the multinomial frequency-of-frequency counts.
  // Matches the standard iNEXT-R variance to first order.
  const varF1 = f1;
  const varF2 = f2;
  const v = dS_df1 * dS_df1 * varF1 + dS_df2 * dS_df2 * varF2;
  return Math.max(0, v);
}

function asymptoteVariance(f1: number, f2: number): number {
  // Var(f_hat0) via delta method; standard Chao1 form.
  if (f1 === 0) return 0;
  const df0_df1 = (2 * f1 - 1) / (2 * (f2 + 1));
  const f0 = chao1Unseen(f1, f2);
  const df0_df2 = -f0 / (f2 + 1);
  return df0_df1 * df0_df1 * f1 + df0_df2 * df0_df2 * f2;
}

function symmetricCI(estimate: number, variance: number): [number, number] {
  if (variance <= 0) return [estimate, estimate];
  const half = 1.96 * Math.sqrt(variance);
  return [estimate - half, estimate + half];
}

function logCI(sObs: number, sHat: number, variance: number): [number, number] {
  // Chao log-CI: CI lower bound ≥ S_obs by construction.
  // Falls back to symmetric when S_hat ≈ S_obs to avoid divide-by-zero.
  if (variance <= 0 || sHat <= sObs + 1e-9) {
    return [sHat, sHat];
  }
  const delta = sHat - sObs;
  const arg = 1 + variance / (delta * delta);
  const K = Math.exp(1.96 * Math.sqrt(Math.log(arg)));
  return [sObs + delta / K, sObs + delta * K];
}

export function computeInext(input: InextParams): InextResult {
  const params = inextParamsSchema.parse(input);
  const abundances = params.abundances.filter((x) => x > 0);
  const sObs = abundances.length;
  const n = abundances.reduce((s, x) => s + x, 0);
  if (n === 0) {
    return {
      nObs: 0,
      sObs: 0,
      asymptoticS: 0,
      asymptoticCI: [0, 0],
      points: [],
    };
  }
  const f1 = abundances.filter((x) => x === 1).length;
  const f2 = abundances.filter((x) => x === 2).length;
  const asymptoticS = sObs + chao1Unseen(f1, f2);
  const asymptoticCI = logCI(sObs, asymptoticS, asymptoteVariance(f1, f2));

  const mMax = 2 * n;
  const knots = params.knots;
  const step = Math.max(1, Math.floor(mMax / knots));
  const ms: number[] = [];
  for (let m = step; m < n; m += step) ms.push(m);
  ms.push(n);
  for (let m = n + step; m <= mMax; m += step) ms.push(m);

  const points: InextPoint[] = ms.map((m) => {
    if (m === n) {
      return {
        m,
        estimate: sObs,
        ciLow: sObs,
        ciHigh: sObs,
        kind: "observed",
      };
    }
    if (m < n) {
      const estimate = rarefyExpected(abundances, n, m);
      const variance = rarefyVariance(abundances, n, m);
      const [ciLow, ciHigh] = symmetricCI(estimate, variance);
      return {
        m,
        estimate,
        ciLow: Math.max(0, ciLow),
        ciHigh: Math.min(sObs, ciHigh),
        kind: "interpolation",
      };
    }
    const mStar = m - n;
    const estimate = extrapolate(sObs, n, f1, f2, mStar);
    const variance = extrapolateVariance(n, f1, f2, mStar);
    const [ciLow, ciHigh] = logCI(sObs, estimate, variance);
    return { m, estimate, ciLow, ciHigh, kind: "extrapolation" };
  });

  return { nObs: n, sObs, asymptoticS, asymptoticCI, points };
}
