"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardBody, Button, Drawer } from "@/components/ui/primitives";
import { PhenologyChart } from "@/components/phenology-chart";
import type { OccurrenceFeature, SpeciesRow } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

interface SpeciesPanelProps {
  slug: string;
  researchOnly: boolean;
  inatTaxonId?: number;
  gbifTaxonKey?: number;
}

export function SpeciesPanel({ slug, researchOnly }: SpeciesPanelProps) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [offset, setOffset] = React.useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["species", slug, researchOnly, offset, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/views/${slug}/species?rg=${researchOnly ? 1 : 0}&limit=${limit}&offset=${offset}`
      );
      if (!res.ok) throw new Error("Failed to load species");
      return (await res.json()) as { species: SpeciesRow[] };
    },
  });

  const species = data?.species ?? [];

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden">
        <CardHeader className="flex flex-shrink-0 items-center justify-between">
          <CardTitle>Species</CardTitle>
          <div className="flex items-center gap-2 text-xs text-moss-600">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              ←
            </Button>
            <span>{offset + 1}–{offset + species.length}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={species.length < limit}
              onClick={() => setOffset(offset + limit)}
            >
              →
            </Button>
          </div>
        </CardHeader>
        <CardBody className="min-h-0 flex-1 overflow-y-auto p-0">
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-moss-600">Loading…</div>
          ) : species.length === 0 ? (
            <div className="px-4 py-8 text-sm text-moss-600">
              No species yet. Run the sync to populate occurrences.
            </div>
          ) : (
            <ul className="divide-y divide-cream-300">
              {species.map((s) => (
                <li
                  key={s.scientificName}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-cream-100"
                  onClick={() => setOpen(s.scientificName)}
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-cream-200">
                    {s.representativePhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.representativePhoto}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm italic text-bark-600">{s.scientificName}</div>
                    {s.commonName ? (
                      <div className="truncate text-xs text-moss-600">{s.commonName}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-bold text-forest-800 tabular-nums">{formatNumber(s.count)}</div>
                    <div className="text-[10px] text-moss-600">
                      {s.inatCount} iNat · {s.gbifCount} GBIF
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <SpeciesDrawer
        slug={slug}
        researchOnly={researchOnly}
        scientificName={open}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function SpeciesDrawer({
  slug,
  researchOnly,
  scientificName,
  onClose,
}: {
  slug: string;
  researchOnly: boolean;
  scientificName: string | null;
  onClose: () => void;
}) {
  const enabled = !!scientificName;
  const { data } = useQuery({
    enabled,
    queryKey: ["species-detail", slug, researchOnly, scientificName],
    queryFn: async () => {
      const url = new URL(`/api/views/${slug}/species`, window.location.origin);
      url.searchParams.set("rg", researchOnly ? "1" : "0");
      url.searchParams.set("scientificName", scientificName ?? "");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load species detail");
      return (await res.json()) as {
        scientificName: string;
        photos: OccurrenceFeature[];
        phenology: Array<{ month: number; count: number }>;
      };
    },
  });

  return (
    <Drawer open={!!scientificName} onOpenChange={(v) => !v && onClose()} title={
      <span>
        <span className="italic">{scientificName}</span>
      </span>
    }>
      {data ? (
        <div className="space-y-4">
          <SpeciesLinks scientificName={data.scientificName} />
          <section>
            <h4 className="leaf-rule mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-moss-600">
              Phenology — observations by month
            </h4>
            <PhenologyChart data={data.phenology} />
          </section>
          <section>
            <h4 className="leaf-rule mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-moss-600">
              Photos ({data.photos.length})
            </h4>
            {data.photos.length === 0 ? (
              <div className="text-sm text-moss-600">
                No CC-licensed photos found for this species in the view.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden rounded border border-cream-300 bg-cream-50"
                  >
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-32 w-full object-cover transition group-hover:scale-105" />
                    ) : null}
                    <div className="p-1 text-[10px] leading-tight text-moss-600">
                      {p.attribution}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="text-sm text-moss-600">Loading…</div>
      )}
    </Drawer>
  );
}

function SpeciesLinks({ scientificName }: { scientificName: string }) {
  const inat = `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(scientificName)}`;
  const gbif = `https://www.gbif.org/species/search?q=${encodeURIComponent(scientificName)}`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <a
        href={inat}
        target="_blank"
        rel="noreferrer"
        className="rounded border border-cream-300 bg-cream-50 px-2 py-1 font-medium text-forest-800 hover:bg-cream-100"
      >
        <span className="mr-1 text-ok-orange">●</span>iNaturalist →
      </a>
      <a
        href={gbif}
        target="_blank"
        rel="noreferrer"
        className="rounded border border-cream-300 bg-cream-50 px-2 py-1 font-medium text-forest-800 hover:bg-cream-100"
      >
        <span className="mr-1 text-ok-green">●</span>GBIF →
      </a>
    </div>
  );
}
