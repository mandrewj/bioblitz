import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StoredOccurrence, StoredView } from "@/lib/store";

// NOTE: these tests exercise the species-identity merge — iNat stores the bare
// binomial ("Harmonia axyridis") while GBIF carries authorship ("Harmonia
// axyridis (Pallas, 1773)"). Grouping must treat them as one species, or GBIF
// records vanish from per-species counts and richness is double-counted.

type Occ = Partial<StoredOccurrence> &
  Pick<StoredOccurrence, "source" | "sourceRecordId" | "taxonScientificName">;

function occ(o: Occ): StoredOccurrence {
  return {
    taxonCommonName: null,
    taxonOrder: "Coleoptera",
    taxonFamily: null,
    taxonGenus: null,
    observedOn: "2026-05-16",
    observedYear: 2026,
    observedMonth: 5,
    lat: 39.88,
    lng: -86.31,
    observer: null,
    license: null,
    qualityGrade: o.source === "inat" ? "research" : null,
    basisOfRecord: null,
    datasetKey: null,
    photoUrl: null,
    attributionText: "",
    ...o,
  } as StoredOccurrence;
}

const SLUG = "merge-fixture";
let dir: string;

const view: StoredView = {
  schemaVersion: 3,
  slug: SLUG,
  displayName: "Merge fixture",
  taxon: { name: "Coleoptera", inatTaxonId: 47208, gbifTaxonKey: 1470, commonName: null, rank: null },
  region: {
    name: "Test",
    bbox: [-87, 39, -86, 40],
    geometry: {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[-87, 39], [-86, 39], [-86, 40], [-87, 40], [-87, 39]]] },
    },
  },
  lastSyncedAt: "2026-06-05T00:00:00.000Z",
  stats: { inatFetched: 0, inatKept: 0, gbifFetched: 0, gbifKept: 0, gbifDroppedAsInat: 0, outsidePolygon: 0 },
  inatTaxonAncestry: {},
  datasetTitles: {},
  // Keyed by the raw stored name (with authorship), as the sync writes it.
  taxonPhotos: { "Chlaenius tomentosus (Say, 1823)": "https://example.test/chlaenius.jpg" },
  occurrences: [
    occ({ source: "inat", sourceRecordId: "i1", taxonScientificName: "Harmonia axyridis", taxonGenus: "Harmonia", taxonFamily: "Coccinellidae" }),
    occ({ source: "inat", sourceRecordId: "i2", taxonScientificName: "Harmonia axyridis", taxonGenus: "Harmonia", taxonFamily: "Coccinellidae" }),
    occ({ source: "gbif", sourceRecordId: "g1", taxonScientificName: "Harmonia axyridis (Pallas, 1773)", taxonGenus: "Harmonia", taxonFamily: "Coccinellidae" }),
    occ({ source: "gbif", sourceRecordId: "g2", taxonScientificName: "Harmonia axyridis (Pallas, 1773)", taxonGenus: "Harmonia", taxonFamily: "Coccinellidae" }),
    // A GBIF-only species whose fallback photo is stored under its authority name.
    occ({ source: "gbif", sourceRecordId: "g3", taxonScientificName: "Chlaenius tomentosus (Say, 1823)", taxonGenus: "Chlaenius", taxonFamily: "Carabidae" }),
  ],
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bioblitz-q-"));
  fs.writeFileSync(path.join(dir, `${SLUG}.json`), JSON.stringify(view));
  process.env.DASHBOARD_DATA_DIR = dir;
});

afterAll(() => {
  delete process.env.DASHBOARD_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("species identity merge (iNat binomial vs GBIF authorship)", () => {
  it("merges iNat and GBIF names into one species row with combined source counts", async () => {
    const { getSpeciesList } = await import("@/lib/queries");
    const rows = getSpeciesList(SLUG, false);
    const harmonia = rows.filter((r) => r.scientificName === "Harmonia axyridis");
    expect(harmonia).toHaveLength(1);
    expect(harmonia[0]).toMatchObject({ count: 4, inatCount: 2, gbifCount: 2 });
    // No stray authorship-bearing row.
    expect(rows.some((r) => r.scientificName.includes("("))).toBe(false);
  });

  it("does not double-count species richness", async () => {
    const { getViewSummary } = await import("@/lib/queries");
    const summary = getViewSummary(SLUG, false);
    // Two species total: Harmonia axyridis + Chlaenius tomentosus.
    expect(summary?.speciesCount).toBe(2);
  });

  it("resolves the fallback photo for a GBIF-only species keyed by its authority name", async () => {
    const { getSpeciesList } = await import("@/lib/queries");
    const rows = getSpeciesList(SLUG, false);
    const chlaenius = rows.find((r) => r.scientificName === "Chlaenius tomentosus");
    expect(chlaenius?.representativePhoto).toBe("https://example.test/chlaenius.jpg");
  });
});
