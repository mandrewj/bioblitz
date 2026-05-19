import { notFound } from "next/navigation";
import { loadDashboardConfig } from "@/lib/config";
import { Dashboard } from "@/components/dashboard";
import { Suspense } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ viewSlug: string }>;
}) {
  const { viewSlug } = await params;
  const cfg = loadDashboardConfig();
  const view = cfg.views.find((v) => v.slug === viewSlug);
  return {
    title: view ? `${view.displayName} — Biodiversity Dashboard` : "Biodiversity Dashboard",
  };
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ viewSlug: string }>;
}) {
  const { viewSlug } = await params;
  const cfg = loadDashboardConfig();
  const view = cfg.views.find((v) => v.slug === viewSlug);
  if (!view) notFound();

  const viewOptions = cfg.views.map((v) => ({ value: v.slug, label: v.displayName }));

  return (
    <Suspense fallback={null}>
      <Dashboard
        slug={viewSlug}
        viewOptions={viewOptions}
        defaultBasemap={cfg.defaultBasemap}
        description={view.description}
      />
    </Suspense>
  );
}
