import { checklistToCsv, getSpeciesChecklist } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const rows = getSpeciesChecklist(slug, researchOnly);
  const csv = checklistToCsv(rows);
  const filename = `${slug}-checklist${researchOnly ? "-rg" : ""}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
