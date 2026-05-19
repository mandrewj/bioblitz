import { syncAllViews, syncView } from "@/lib/sync";

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const positional = args.filter((a) => !a.startsWith("--"));
  const slug = positional[0];

  if (slug) {
    const r = await syncView(slug, { full });
    console.log(r);
    return;
  }
  const results = await syncAllViews({ full });
  console.log("\nSummary:");
  for (const r of results) {
    console.log(
      `  ${r.slug}: +${r.inatKept} iNat, +${r.gbifKept} GBIF (dropped ${r.gbifDroppedAsInat} as iNat dup, ${r.outsidePolygon} outside polygon) — total ${r.totalAfter} in ${r.durationMs}ms`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
