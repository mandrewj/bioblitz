import Image from "next/image";
import Link from "next/link";
import { loadDashboardConfig } from "@/lib/config";
import { Card, CardBody } from "@/components/ui/primitives";

export const dynamic = "force-static";

export default function Home() {
  const cfg = loadDashboardConfig();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="mb-10 flex items-center gap-5">
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
            className="h-14 w-auto sm:h-16"
          />
        </a>
        <div className="min-w-0">
          <h1 className="leaf-rule text-3xl font-bold tracking-tight text-forest-800 sm:text-4xl">
            Bioblitz Dashboards
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-bark-600">
            Bioblitz projects the Insect Diversity and Diagnostics Lab has
            taken part in, with occurrence records aggregated from iNaturalist
            and GBIF. Pick a project below to explore species, geography, and
            trends.
          </p>
        </div>
      </div>

      <h2 className="leaf-rule mb-4 text-xs font-bold uppercase tracking-[0.2em] text-moss-600">
        Projects
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cfg.views.map((v) => (
          <Link
            key={v.slug}
            href={`/${v.slug}`}
            className="block group focus:outline-none"
          >
            <Card className="nature-card-accent h-full transition group-hover:border-forest-300 group-hover:shadow-leaf">
              <CardBody className="flex h-full flex-col">
                <p className="text-[11px] uppercase tracking-[0.2em] text-moss-600">
                  {v.region.name}
                </p>
                <h3 className="mt-1 text-lg font-bold leading-tight text-forest-800 group-hover:underline">
                  {v.displayName}
                </h3>
                <p className="mt-1 text-sm italic text-bark-600">
                  {v.taxon.name}
                </p>
                <div className="mt-auto pt-3 flex items-center justify-between text-xs text-moss-600">
                  <span>
                    {v.dateRange?.start
                      ? `Records since ${v.dateRange.start.slice(0, 4)}`
                      : "All records"}
                  </span>
                  <span className="font-medium text-forest-600 transition group-hover:translate-x-0.5">
                    View →
                  </span>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
