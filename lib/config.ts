import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const isoDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return undefined;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v;
  })
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
      .optional()
  );

const regionSourceSchema = z.object({
  kind: z.enum(["geojson", "shapefile-zip"]),
  path: z.string().min(1),
});

const regionSchema = z.object({
  name: z.string().min(1),
  source: regionSourceSchema,
});

const taxonSchema = z.object({
  name: z.string().min(1),
  inatTaxonId: z.number().int().positive().optional(),
  gbifTaxonKey: z.number().int().positive().optional(),
});

const dateRangeSchema = z
  .object({
    start: isoDate,
    end: isoDate,
  })
  .optional();

const viewSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "view.slug must be lowercase alphanumeric+dashes"),
  displayName: z.string().min(1),
  description: z.string().optional(),
  region: regionSchema,
  taxon: taxonSchema,
  dateRange: dateRangeSchema,
});

export const dashboardConfigSchema = z.object({
  contactEmail: z.string().email("contactEmail must be a valid email"),
  defaultBasemap: z.enum(["positron", "voyager", "dark"]).default("positron"),
  views: z.array(viewSchema).min(1, "config must define at least one view"),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardView = z.infer<typeof viewSchema>;

function configPath(): string {
  return (
    process.env.DASHBOARD_CONFIG_PATH ??
    path.join(process.cwd(), "config", "dashboard.config.yaml")
  );
}

let cached: DashboardConfig | null = null;

export function loadDashboardConfig(): DashboardConfig {
  if (cached) return cached;
  const cfgPath = configPath();
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `Dashboard config not found at ${cfgPath}. Copy config/dashboard.config.example.yaml to config/dashboard.config.yaml.`
    );
  }
  const raw = fs.readFileSync(cfgPath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Dashboard config: YAML parse error: ${msg}`);
  }
  const result = dashboardConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Dashboard config failed validation:\n${issues}`);
  }

  const slugs = new Set<string>();
  for (const v of result.data.views) {
    if (slugs.has(v.slug)) {
      throw new Error(
        `Dashboard config: duplicate view slug "${v.slug}" (views[].slug must be unique)`
      );
    }
    slugs.add(v.slug);
  }

  cached = result.data;
  return cached;
}

export function getViewBySlug(slug: string): DashboardView | undefined {
  return loadDashboardConfig().views.find((v) => v.slug === slug);
}

export function resetConfigCache() {
  cached = null;
}
