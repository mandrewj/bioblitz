"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { cn, formatNumber } from "@/lib/utils";

interface TaxonomyRow {
  name: string;
  records: number;
  inatRecords: number;
  gbifRecords: number;
  species: number;
}

type Rank = "family" | "genus";

export function TaxonomyCard({
  slug,
  researchOnly,
}: {
  slug: string;
  researchOnly: boolean;
}) {
  const [rank, setRank] = React.useState<Rank>("family");
  const { data, isLoading } = useQuery({
    queryKey: ["taxonomy", slug, researchOnly, rank],
    queryFn: async () => {
      const res = await fetch(
        `/api/views/${slug}/taxonomy?rg=${researchOnly ? 1 : 0}&rank=${rank}&limit=15`
      );
      if (!res.ok) throw new Error("taxonomy failed");
      return (await res.json()) as {
        rank: Rank;
        rows: TaxonomyRow[];
        total: number;
        rankCount: number;
        unranked: number;
      };
    },
  });

  const rows = data?.rows ?? [];
  const tallestBar = rows.reduce((m, r) => Math.max(m, r.records), 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Taxonomic breakdown</CardTitle>
        <div className="flex items-center gap-3">
          <RankToggle value={rank} onChange={setRank} />
          {data ? (
            <span className="text-[11px] uppercase tracking-[0.18em] text-moss-600">
              Top {rows.length} of {formatNumber(data.rankCount)}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="h-60 animate-pulse rounded bg-cream-200" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-moss-600">
            No {rank}-level identifications in this view.
          </div>
        ) : (
          <>
            <div style={{ height: Math.max(220, rows.length * 22 + 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="#E5E7EB" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#5f6360" }}
                    domain={[0, Math.ceil(tallestBar * 1.05)]}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    tick={{ fontSize: 11, fill: "#1F2222" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(17,109,255,0.06)" }}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: "1px solid #E5E7EB",
                    }}
                    formatter={(value: number, key: string, item) => {
                      const payload = item?.payload as TaxonomyRow | undefined;
                      if (key === "inatRecords") return [formatNumber(value), "iNat"];
                      if (key === "gbifRecords") return [formatNumber(value), "GBIF"];
                      return [
                        `${formatNumber(value)} (${formatNumber(payload?.species ?? 0)} species)`,
                        "Total",
                      ];
                    }}
                  />
                  <Bar
                    dataKey="inatRecords"
                    stackId="src"
                    fill="#E69F00"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="gbifRecords"
                    stackId="src"
                    fill="#009E73"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {data && data.unranked > 0 ? (
              <p className="mt-2 text-[11px] text-moss-600">
                {formatNumber(data.unranked)} records identified above the {rank} rank
                are not shown.
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-4 text-[11px] text-moss-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-ok-orange" />
                iNaturalist
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-ok-green" />
                GBIF
              </span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function RankToggle({
  value,
  onChange,
}: {
  value: Rank;
  onChange: (v: Rank) => void;
}) {
  const options: Rank[] = ["family", "genus"];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-cream-300">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1 text-xs font-medium capitalize transition",
            value === opt
              ? "bg-forest-600 text-white"
              : "bg-cream-50 text-forest-800 hover:bg-cream-100"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
