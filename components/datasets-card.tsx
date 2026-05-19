"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardBody, Button } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";

interface DatasetRow {
  key: string | null;
  source: "inat" | "gbif";
  title: string;
  records: number;
  pct: number;
}

interface DatasetsResponse {
  top: DatasetRow[];
  tail: { count: number; records: number; pct: number };
  total: number;
  all: DatasetRow[];
}

export function DatasetsCard({
  slug,
  researchOnly,
}: {
  slug: string;
  researchOnly: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["datasets", slug, researchOnly],
    queryFn: async () => {
      const res = await fetch(
        `/api/views/${slug}/datasets?rg=${researchOnly ? 1 : 0}&topN=5`
      );
      if (!res.ok) throw new Error("datasets failed");
      return (await res.json()) as DatasetsResponse;
    },
  });

  const visible = expanded ? data?.all ?? [] : data?.top ?? [];
  const showTail = !expanded && (data?.tail?.count ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top data sources</CardTitle>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="text-sm text-moss-600">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-moss-600">No data sources yet.</div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {visible.map((r, i) => (
                <li
                  key={`${r.source}:${r.key ?? "agg"}:${i}`}
                  className="flex items-baseline gap-3 text-sm"
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      r.source === "inat" ? "bg-ok-orange" : "bg-ok-green"
                    }`}
                  />
                  <DatasetTitle row={r} />
                  <span className="font-bold tabular-nums text-forest-800">
                    {formatNumber(r.records)}
                  </span>
                  <span className="w-14 text-right text-xs tabular-nums text-moss-600">
                    {(r.pct * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
            {showTail && data ? (
              <p className="mt-3 border-t border-cream-300 pt-3 text-xs text-moss-600">
                …and {data.tail.count} more datasets contributing{" "}
                {formatNumber(data.tail.records)} records (
                {(data.tail.pct * 100).toFixed(1)}%)
              </p>
            ) : null}
            {data && (data.tail?.count ?? 0) > 0 ? (
              <div className="mt-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((s) => !s)}
                >
                  {expanded ? "Show top 5" : "Show all"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function DatasetTitle({ row }: { row: DatasetRow }) {
  const href =
    row.source === "inat"
      ? "https://www.inaturalist.org/"
      : row.key
        ? `https://www.gbif.org/dataset/${row.key}`
        : null;
  if (!href) {
    return (
      <span className="min-w-0 flex-1 truncate text-bark-600" title={row.title}>
        {row.title}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="min-w-0 flex-1 truncate text-bark-600 hover:text-forest-700 hover:underline"
      title={row.title}
    >
      {row.title}
    </a>
  );
}
