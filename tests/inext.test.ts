import { describe, it, expect } from "vitest";
import { computeInext } from "@/lib/inext";

describe("computeInext", () => {
  it("returns S_obs at m = n", () => {
    const r = computeInext({ abundances: [2, 2, 2, 2, 2], knots: 10 });
    expect(r.sObs).toBe(5);
    expect(r.nObs).toBe(10);
    const atN = r.points.find((p) => p.m === 10);
    expect(atN).toBeDefined();
    expect(atN!.estimate).toBeCloseTo(5, 6);
    expect(atN!.kind).toBe("observed");
  });

  it("interpolation is monotonic non-decreasing", () => {
    const r = computeInext({
      abundances: [10, 5, 4, 3, 2, 2, 1, 1, 1, 1],
      knots: 20,
    });
    const interp = r.points.filter((p) => p.kind !== "extrapolation");
    for (let i = 1; i < interp.length; i++) {
      expect(interp[i].estimate).toBeGreaterThanOrEqual(interp[i - 1].estimate - 1e-9);
    }
  });

  it("matches the rarefaction reference for a small dataset", () => {
    // abundances [3, 2, 1], n=6, S=3: E[S(3)] = 0.95 + 0.80 + 0.50 = 2.25.
    const r = computeInext({ abundances: [3, 2, 1], knots: 10 });
    const p = r.points.find((x) => x.m === 3);
    expect(p).toBeDefined();
    expect(p!.estimate).toBeCloseTo(2.25, 6);
  });

  it("Chao1 unseen is computed correctly", () => {
    // f1=4, f2=1 → f0 = 4·3 / (2·2) = 3, S_hat = S_obs + 3
    const r = computeInext({
      abundances: [1, 1, 1, 1, 2, 5, 5],
      knots: 10,
    });
    expect(r.sObs).toBe(7);
    expect(r.asymptoticS).toBeCloseTo(10, 6);
  });

  it("extrapolation reaches asymptote at infinity", () => {
    const r = computeInext({
      abundances: [10, 5, 4, 3, 2, 2, 1, 1, 1, 1],
      knots: 50,
    });
    const tail = r.points[r.points.length - 1];
    expect(tail.estimate).toBeLessThanOrEqual(r.asymptoticS + 1e-6);
  });

  it("analytical CI brackets the point estimate (singleton-heavy data)", () => {
    // Heavy singletons: previously broke naive bootstrap (resamples lost
    // singletons → CI sat below the point estimate). The analytical
    // variance must keep the estimate inside its CI at every knot.
    const r = computeInext({
      abundances: [50, 30, 20, 15, 10, 8, 5, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      knots: 30,
    });
    for (const p of r.points) {
      expect(p.ciLow).toBeLessThanOrEqual(p.estimate + 1e-6);
      expect(p.ciHigh).toBeGreaterThanOrEqual(p.estimate - 1e-6);
    }
  });

  it("log-CI lower bound never drops below S_obs in extrapolation region", () => {
    const r = computeInext({
      abundances: [10, 5, 4, 3, 2, 2, 1, 1, 1, 1],
      knots: 40,
    });
    for (const p of r.points) {
      if (p.kind === "extrapolation") {
        expect(p.ciLow).toBeGreaterThanOrEqual(r.sObs - 1e-9);
      }
    }
  });

  it("CI width grows monotonically across the extrapolation region", () => {
    const r = computeInext({
      abundances: [50, 30, 20, 15, 10, 8, 5, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      knots: 40,
    });
    const extrap = r.points.filter((p) => p.kind === "extrapolation");
    for (let i = 1; i < extrap.length; i++) {
      const prev = extrap[i - 1].ciHigh - extrap[i - 1].ciLow;
      const curr = extrap[i].ciHigh - extrap[i].ciLow;
      expect(curr).toBeGreaterThanOrEqual(prev - 1e-9);
    }
  });

  it("asymptote CI is reported and brackets asymptoticS", () => {
    const r = computeInext({
      abundances: [10, 5, 4, 3, 2, 2, 1, 1, 1, 1],
      knots: 20,
    });
    expect(r.asymptoticCI[0]).toBeLessThanOrEqual(r.asymptoticS + 1e-6);
    expect(r.asymptoticCI[1]).toBeGreaterThanOrEqual(r.asymptoticS - 1e-6);
    expect(r.asymptoticCI[0]).toBeGreaterThanOrEqual(r.sObs - 1e-9);
  });
});
