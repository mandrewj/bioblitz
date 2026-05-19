"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Card, CardBody, CardHeader, CardTitle, Stat, Toggle, Select, Button } from "@/components/ui/primitives";
import { SpeciesPanel } from "@/components/species-panel";
import { AccumulationChart } from "@/components/accumulation-chart";
import { ContributorsCard } from "@/components/contributors-card";
import { TaxonomyCard } from "@/components/taxonomy-card";
import { DatasetsCard } from "@/components/datasets-card";
import { formatDate, formatNumber } from "@/lib/utils";
import type { OccurrenceFeature, ViewSummary } from "@/lib/queries";
import type { InextResult } from "@/lib/inext";
import type { BasemapKey } from "@/lib/basemap";

const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] w-full animate-pulse rounded-lg bg-cream-200" />
  ),
});

interface DashboardProps {
  slug: string;
  viewOptions: Array<{ value: string; label: string }>;
  defaultBasemap: BasemapKey;
  description?: string;
}

export function Dashboard({ slug, viewOptions, defaultBasemap, description }: DashboardProps) {
  const router = useRouter();
  const search = useSearchParams();
  const researchOnly = search.get("rg") === "1";

  const toggleResearchOnly = (next: boolean) => {
    const params = new URLSearchParams(Array.from(search.entries()));
    if (next) params.set("rg", "1");
    else params.delete("rg");
    router.replace(`/${slug}${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const summary = useQuery({
    queryKey: ["summary", slug, researchOnly],
    queryFn: async () => {
      const r = await fetch(`/api/views/${slug}/summary?rg=${researchOnly ? 1 : 0}`);
      if (!r.ok) throw new Error("summary failed");
      return (await r.json()) as ViewSummary;
    },
  });

  const occurrences = useQuery({
    queryKey: ["occurrences", slug, researchOnly],
    queryFn: async () => {
      const r = await fetch(`/api/views/${slug}/occurrences?rg=${researchOnly ? 1 : 0}&limit=10000`);
      if (!r.ok) throw new Error("occurrences failed");
      return (await r.json()) as {
        occurrences: OccurrenceFeature[];
        region: {
          type: "Feature";
          properties: Record<string, unknown>;
          geometry: unknown;
          bbox: [number, number, number, number];
        } | null;
      };
    },
  });

  const accumulation = useQuery({
    queryKey: ["accumulation", slug, researchOnly],
    queryFn: async () => {
      const r = await fetch(`/api/views/${slug}/accumulation?rg=${researchOnly ? 1 : 0}`);
      if (!r.ok) throw new Error("accumulation failed");
      return (await r.json()) as InextResult;
    },
  });


  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4">
      <Header
        slug={slug}
        viewOptions={viewOptions}
        summary={summary.data ?? null}
        researchOnly={researchOnly}
        onToggleResearchOnly={toggleResearchOnly}
      />

      {description ? (
        <Card>
          <CardBody>
            <p className="text-sm leading-relaxed text-bark-600">
              {description}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardBody className="p-0">
              <MapView
                occurrences={occurrences.data?.occurrences ?? []}
                region={occurrences.data?.region ?? null}
                defaultBasemap={defaultBasemap}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Species accumulation curve</CardTitle>
            </CardHeader>
            <CardBody>
              {accumulation.isLoading ? (
                <div className="h-60 animate-pulse rounded bg-cream-200" />
              ) : accumulation.data ? (
                <AccumulationChart data={accumulation.data} />
              ) : (
                <div className="text-sm text-moss-600">No data.</div>
              )}
            </CardBody>
          </Card>
          <TaxonomyCard slug={slug} researchOnly={researchOnly} />
          <ContributorsCard slug={slug} researchOnly={researchOnly} />
          <DatasetsCard slug={slug} researchOnly={researchOnly} />
          <SourceComparison summary={summary.data} />
        </div>
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <SpeciesPanel slug={slug} researchOnly={researchOnly} />
          </div>
        </aside>
      </div>

      <Footer summary={summary.data ?? null} />
    </div>
  );
}

function Header({
  slug,
  viewOptions,
  summary,
  researchOnly,
  onToggleResearchOnly,
}: {
  slug: string;
  viewOptions: Array<{ value: string; label: string }>;
  summary: ViewSummary | null;
  researchOnly: boolean;
  onToggleResearchOnly: (next: boolean) => void;
}) {
  const router = useRouter();
  return (
    <Card className="nature-card-accent">
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
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
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-forest-600 hover:underline"
            >
              <span aria-hidden>←</span> All projects
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-forest-800 sm:text-3xl">
              {summary?.displayName ?? slug}
            </h1>
            {summary?.region.name ? (
              <div className="mt-1 text-xs text-moss-600">
                Region: {summary.region.name}
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Stat label="Observations" value={summary ? formatNumber(summary.totalCount) : "—"} />
          <Stat label="Species" value={summary ? formatNumber(summary.speciesCount) : "—"} />
          <Stat label="Last sync" value={summary ? formatDate(summary.lastSyncedAt) : "—"} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle pressed={researchOnly} onPressedChange={onToggleResearchOnly}>
            Research-grade only
          </Toggle>
          <Select
            aria-label="View"
            value={slug}
            onChange={(v) => router.push(`/${v}${researchOnly ? "?rg=1" : ""}`)}
            options={viewOptions}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function SourceComparison({ summary }: { summary: ViewSummary | undefined }) {
  const droppedAsInat = summary?.gbifDroppedAsInat ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>iNaturalist vs GBIF</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-md border border-cream-300 bg-cream-100 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-ok-orange">iNaturalist</div>
            <div className="mt-1 text-2xl font-bold text-forest-800 tabular-nums">
              {summary ? formatNumber(summary.inatCount) : "—"}
            </div>
            <div className="text-xs text-moss-600">observations</div>
          </div>
          <div className="rounded-md border border-cream-300 bg-cream-100 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-ok-green">GBIF</div>
            <div className="mt-1 text-2xl font-bold text-forest-800 tabular-nums">
              {summary ? formatNumber(summary.gbifCount) : "—"}
            </div>
            <div className="text-xs text-moss-600">observations (post-dedup)</div>
          </div>
          <div className="rounded-md border border-cream-300 bg-cream-100 p-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-moss-600">
              GBIF dropped as iNat dup
            </div>
            <div className="mt-1 text-2xl font-bold text-forest-800 tabular-nums">
              {formatNumber(droppedAsInat)}
            </div>
            <div className="text-xs text-moss-600">dataset 50c9509d-…</div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Footer({ summary }: { summary: ViewSummary | null }) {
  const [showCitation, setShowCitation] = React.useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const citation = summary
    ? `Occurrence data for ${summary.displayName}, downloaded via the biodiversity-dashboard from iNaturalist (${summary.inatCount.toLocaleString()} records) and GBIF.org (${summary.gbifCount.toLocaleString()} records) on ${summary.lastSyncedAt ? summary.lastSyncedAt.slice(0, 10) : today}.\n\niNaturalist contributors. iNaturalist Research-grade Observations. iNaturalist.org. https://www.inaturalist.org\n\nGBIF.org (${today}). GBIF Occurrence Download via Occurrence Search API. https://www.gbif.org/occurrence/search`
    : "";
  return (
    <footer className="mt-4 border-t border-cream-300 pt-4 text-xs text-moss-600">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          Occurrence data from{" "}
          <a className="underline hover:text-forest-700" href="https://www.inaturalist.org">iNaturalist</a>
          {summary ? ` (${formatNumber(summary.inatCount)} records)` : ""} and{" "}
          <a className="underline hover:text-forest-700" href="https://www.gbif.org">GBIF.org</a>
          {summary ? ` (${formatNumber(summary.gbifCount)} records, ${summary.lastSyncedAt ? formatDate(summary.lastSyncedAt) : "—"})` : ""}.
          {" "}Map © <a className="underline hover:text-forest-700" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ©{" "}
          <a className="underline hover:text-forest-700" href="https://carto.com/attributions">CARTO</a>.
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCitation((s) => !s)}>
          {showCitation ? "Hide" : "Cite this view"}
        </Button>
      </div>
      {showCitation && summary ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-cream-300 bg-cream-100 p-3 text-[11px] text-bark-600">{citation}</pre>
      ) : null}
      <div className="mt-3 border-t border-cream-300 pt-3 text-[11px] text-moss-600">
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
  );
}
