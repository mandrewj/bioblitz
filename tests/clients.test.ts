import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import inatFixture from "@/lib/__fixtures__/inat-observations.json";
import gbifFixture from "@/lib/__fixtures__/gbif-occurrences.json";
import { iterateInatObservations, inatAttribution } from "@/lib/inat";
import {
  iterateGbifOccurrences,
  INAT_GBIF_DATASET_KEY,
} from "@/lib/gbif";

describe("iNat client (fixtures)", () => {
  beforeEach(() => {
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      // First page returns the fixture; second page returns empty so the
      // id_above loop terminates.
      const body = call === 1 ? inatFixture : { total_results: 0, results: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof global.fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields parsed observations and stops at end of results", async () => {
    const out = [];
    for await (const obs of iterateInatObservations({
      taxonId: 47208,
      bbox: [-86.4, 39.8, -86.2, 39.9],
      contactEmail: "test@example.com",
      perPage: 200,
    })) {
      out.push(obs);
    }
    expect(out.length).toBe(2);
    expect(out[0].id).toBe(1001);
    expect(out[0].quality_grade).toBe("research");
    expect(out[1].license_code).toBeNull();
  });

  it("builds attribution from observer + license", () => {
    const o = (inatFixture.results as unknown as Array<Record<string, unknown>>)[0];
    expect(inatAttribution(o as never)).toBe(
      "© First Observer, cc-by-nc, via iNaturalist"
    );
  });

  it("sends contact email in User-Agent", async () => {
    const it = iterateInatObservations({
      taxonId: 47208,
      bbox: [-86.4, 39.8, -86.2, 39.9],
      contactEmail: "me@example.com",
    });
    await it.next();
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/me@example\.com/);
  });
});

describe("GBIF client (fixtures)", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => {
      const body = gbifFixture; // endOfRecords true so single call terminates
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof global.fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks records from the iNat dataset as dropped", async () => {
    const out: Array<{ id: string | number; dropped: boolean; datasetKey: string | undefined }> = [];
    for await (const { raw, droppedAsInat } of iterateGbifOccurrences({
      taxonKey: 1470,
      geometry: "POLYGON((-86.4 39.8,-86.2 39.8,-86.2 39.9,-86.4 39.9,-86.4 39.8))",
      contactEmail: "me@example.com",
    })) {
      out.push({ id: raw.gbifID, dropped: droppedAsInat, datasetKey: raw.datasetKey });
    }
    expect(out.length).toBe(3);
    const dropped = out.find((r) => r.dropped);
    expect(dropped?.datasetKey).toBe(INAT_GBIF_DATASET_KEY);
    expect(out.filter((r) => !r.dropped).length).toBe(2);
  });
});
