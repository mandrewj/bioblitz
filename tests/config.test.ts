import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadDashboardConfig, resetConfigCache } from "@/lib/config";

function withConfig(yaml: string, run: () => void) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashcfg-"));
  const filePath = path.join(tmpDir, "dashboard.config.yaml");
  fs.writeFileSync(filePath, yaml);
  process.env.DASHBOARD_CONFIG_PATH = filePath;
  try {
    run();
  } finally {
    delete process.env.DASHBOARD_CONFIG_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("dashboard config", () => {
  beforeEach(() => resetConfigCache());
  afterEach(() => resetConfigCache());

  it("parses a valid config", () => {
    const yaml = `
contactEmail: dev@example.com
defaultBasemap: positron
views:
  - slug: a-view
    displayName: "A View"
    region:
      name: "Region"
      source:
        kind: geojson
        path: config/regions/example.geojson
    taxon:
      name: Coleoptera
      inatTaxonId: 47208
      gbifTaxonKey: 1470
`;
    withConfig(yaml, () => {
      const cfg = loadDashboardConfig();
      expect(cfg.contactEmail).toBe("dev@example.com");
      expect(cfg.views[0].taxon.inatTaxonId).toBe(47208);
    });
  });

  it("fails loudly naming the offending field on a malformed config", () => {
    const yaml = `
contactEmail: not-an-email
defaultBasemap: positron
views:
  - slug: a-view
    displayName: "A View"
    region:
      name: "Region"
      source:
        kind: geojson
        path: config/regions/example.geojson
    taxon:
      name: Coleoptera
`;
    withConfig(yaml, () => {
      expect(() => loadDashboardConfig()).toThrowError(/contactEmail/);
    });
  });

  it("rejects an invalid basemap value with field name in the error", () => {
    const yaml = `
contactEmail: dev@example.com
defaultBasemap: not-a-real-basemap
views:
  - slug: a-view
    displayName: "A View"
    region:
      name: "Region"
      source:
        kind: geojson
        path: x.geojson
    taxon:
      name: T
`;
    withConfig(yaml, () => {
      expect(() => loadDashboardConfig()).toThrowError(/defaultBasemap/);
    });
  });

  it("rejects duplicate view slugs", () => {
    const yaml = `
contactEmail: dev@example.com
views:
  - slug: dup
    displayName: A
    region:
      name: r
      source: { kind: geojson, path: x.geojson }
    taxon: { name: T }
  - slug: dup
    displayName: B
    region:
      name: r
      source: { kind: geojson, path: x.geojson }
    taxon: { name: T }
`;
    withConfig(yaml, () => {
      expect(() => loadDashboardConfig()).toThrowError(/duplicate view slug/);
    });
  });

  it("ships an Eagle Creek + Coleoptera default in the committed config", () => {
    // Use the actual committed config (no DASHBOARD_CONFIG_PATH override)
    delete process.env.DASHBOARD_CONFIG_PATH;
    resetConfigCache();
    const cfg = loadDashboardConfig();
    const ec = cfg.views.find((v) => v.slug === "eagle-creek-beetles");
    expect(ec).toBeDefined();
    expect(ec?.taxon.name).toBe("Coleoptera");
  });
});
