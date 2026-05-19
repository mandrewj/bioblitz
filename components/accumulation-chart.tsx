"use client";

import * as React from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import type { InextResult, InextPoint } from "@/lib/inext";
import { formatNumber } from "@/lib/utils";

interface ChartPoint {
  m: number;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  band: [number, number];
  interpEstimate: number | null;
  extrapEstimate: number | null;
}

function toChartPoint(p: InextPoint): ChartPoint {
  const isExtrap = p.kind === "extrapolation";
  const isInterp = p.kind === "interpolation";
  // The "observed" knot belongs to BOTH lines so the segments meet visually
  // at m=n with no gap.
  return {
    m: p.m,
    estimate: p.estimate,
    ciLow: p.ciLow,
    ciHigh: p.ciHigh,
    band: [p.ciLow, p.ciHigh],
    interpEstimate: isInterp || p.kind === "observed" ? p.estimate : null,
    extrapEstimate: isExtrap || p.kind === "observed" ? p.estimate : null,
  };
}

export function AccumulationChart({ data }: { data: InextResult }) {
  const chartData = data.points.map(toChartPoint);
  return (
    <div className="w-full">
      <Caption result={data} />
      <div className="mt-3 h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 16, right: 24, left: -8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="m"
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fontSize: 10, fill: "#5f6360" }}
              label={{
                value: "Number of records",
                position: "insideBottom",
                offset: -2,
                fontSize: 10,
                fill: "#5f6360",
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#5f6360" }}
              label={{
                value: "Cumulative species observed",
                angle: -90,
                position: "insideLeft",
                offset: 18,
                fontSize: 10,
                fill: "#5f6360",
              }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #E5E7EB" }}
              labelFormatter={(l) => `m = ${Number(l).toLocaleString()}`}
              formatter={(value: number | [number, number], key: string) => {
                if (key === "band" && Array.isArray(value)) {
                  return [`${value[0].toFixed(1)} – ${value[1].toFixed(1)}`, "95% CI"];
                }
                if (typeof value === "number") {
                  return [value.toFixed(1), "Species"];
                }
                return [String(value), key];
              }}
            />
            <Area
              type="monotone"
              dataKey="band"
              fill="#116dff"
              fillOpacity={0.12}
              stroke="none"
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="interpEstimate"
              stroke="#116dff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              name="Observed (rarefaction)"
            />
            <Line
              type="monotone"
              dataKey="extrapEstimate"
              stroke="#116dff"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              name="Predicted (extrapolation)"
            />
            <ReferenceDot
              x={data.nObs}
              y={data.sObs}
              r={5}
              fill="#0A3F95"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              label={{
                value: `current sample (n=${formatNumber(data.nObs)}, S=${data.sObs})`,
                position: "top",
                offset: 10,
                fontSize: 10,
                fill: "#0A3F95",
              }}
            />
            <ReferenceLine
              y={data.asymptoticS}
              stroke="#5f6360"
              strokeDasharray="2 4"
              label={{
                value: `Est. total ≈ ${formatNumber(Math.round(data.asymptoticS))}`,
                position: "right",
                fontSize: 10,
                fill: "#5f6360",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3 text-xs text-moss-600">
        <summary className="cursor-pointer text-forest-700 hover:underline">
          How to read this curve
        </summary>
        <div className="mt-2 space-y-2 text-bark-600">
          <p>
            Each point asks: <em>&ldquo;if we&apos;d seen only this many records, how many
            distinct species would we have counted?&rdquo;</em> We compute it by averaging
            over every possible order in which the records could have arrived
            (Hurlbert rarefaction).
          </p>
          <p>
            <b>Solid</b> covers data we actually have. <b>Dashed</b> projects forward to
            twice the current effort using the Chao1 estimator (Chao 1984), which uses
            how many species we&apos;ve seen exactly once (singletons) and exactly twice
            (doubletons) to predict undetected diversity.
          </p>
          <p>
            The <b>filled dot</b> marks current effort (n records, S species observed).
            The <b>horizontal dashed line</b> is the estimated total richness of the
            community — where the curve would settle with infinite sampling.
          </p>
          <p>
            The <b>shaded band</b> is the analytical 95% confidence interval (Chao et
            al. 2014, eqns 5 and 10). A wide band where the curve is still climbing
            means current effort hasn&apos;t constrained the answer well.
          </p>
        </div>
      </details>
    </div>
  );
}

function Caption({ result }: { result: InextResult }) {
  const { sObs, nObs, asymptoticS, asymptoticCI, points } = result;
  const at2n = points.find((p) => p.m === 2 * nObs) ?? points[points.length - 1];
  const pctSeen = asymptoticS > 0 ? sObs / asymptoticS : 1;
  const unseen = Math.max(0, asymptoticS - sObs);
  const totalRounded = Math.round(asymptoticS);
  const unseenRounded = Math.round(unseen);

  if (pctSeen >= 0.85) {
    return (
      <p className="text-sm text-bark-600">
        <b>
          {formatNumber(sObs)} species in {formatNumber(nObs)} records.
        </b>{" "}
        Sampling is approaching completeness — the asymptote sits at{" "}
        <b>~{formatNumber(totalRounded)}</b> species (95% CI{" "}
        {formatNumber(Math.round(asymptoticCI[0]))}–
        {formatNumber(Math.round(asymptoticCI[1]))}), only ~
        {formatNumber(unseenRounded)} above what&apos;s already documented.
      </p>
    );
  }

  return (
    <p className="text-sm text-bark-600">
      <b>
        {formatNumber(sObs)} species in {formatNumber(nObs)} records.
      </b>{" "}
      The curve hasn&apos;t plateaued — doubling the effort would likely turn up
      ~<b>{formatNumber(Math.round(at2n.estimate))}</b> species (95% CI{" "}
      {formatNumber(Math.round(at2n.ciLow))}–
      {formatNumber(Math.round(at2n.ciHigh))}), and the community here likely
      holds about <b>{formatNumber(totalRounded)}</b> in total (95% CI{" "}
      {formatNumber(Math.round(asymptoticCI[0]))}–
      {formatNumber(Math.round(asymptoticCI[1]))}), meaning ~
      <b>{formatNumber(unseenRounded)}</b> species remain undocumented.
    </p>
  );
}
