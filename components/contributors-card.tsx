"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardBody, Button } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";

interface ContributorRow {
  source: "inat" | "gbif";
  name: string;
  records: number;
  species: number;
}

export function ContributorsCard({
  slug,
  researchOnly,
}: {
  slug: string;
  researchOnly: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const limit = expanded ? 50 : 15;
  const { data, isLoading } = useQuery({
    queryKey: ["contributors", slug, researchOnly, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/views/${slug}/contributors?rg=${researchOnly ? 1 : 0}&limit=${limit}`
      );
      if (!res.ok) throw new Error("contributors failed");
      return (await res.json()) as { rows: ContributorRow[]; total: number };
    },
  });

  const rows = data?.rows ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top contributors</CardTitle>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="text-sm text-moss-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-moss-600">No identifiable observers yet.</div>
        ) : (
          <>
            <ol className="space-y-1.5">
              {rows.map((r, i) => (
                <li
                  key={`${r.source}:${r.name}:${i}`}
                  className="flex items-baseline gap-3 text-sm"
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-moss-600">
                    {i + 1}.
                  </span>
                  <ContributorName row={r} />
                  <SourcePill source={r.source} />
                  <span className="ml-auto font-bold tabular-nums text-forest-800">
                    {formatNumber(r.records)}
                  </span>
                  <span className="w-24 text-right text-xs tabular-nums text-moss-600">
                    {formatNumber(r.species)} species
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center justify-between border-t border-cream-300 pt-3 text-xs text-moss-600">
              <span>
                Showing top {rows.length} of {formatNumber(data?.total ?? rows.length)}
              </span>
              {(data?.total ?? 0) > rows.length || expanded ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((s) => !s)}
                >
                  {expanded ? "Show less" : "See all"}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ContributorName({ row }: { row: ContributorRow }) {
  if (row.source === "inat") {
    const href = `https://www.inaturalist.org/people/${encodeURIComponent(row.name)}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate text-forest-800 hover:underline"
        title={row.name}
      >
        {row.name}
      </a>
    );
  }
  return (
    <span className="min-w-0 flex-1 truncate text-bark-600" title={row.name}>
      {row.name}
    </span>
  );
}

function SourcePill({ source }: { source: "inat" | "gbif" }) {
  const color = source === "inat" ? "bg-ok-orange" : "bg-ok-green";
  const label = source === "inat" ? "iNat" : "GBIF";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold tracking-wider text-white ${color}`}
    >
      {label}
    </span>
  );
}
