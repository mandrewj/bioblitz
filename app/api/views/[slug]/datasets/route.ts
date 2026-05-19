import { NextResponse } from "next/server";
import { getDatasetsSummary } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const topN = Math.max(1, Math.min(25, Number(url.searchParams.get("topN") ?? 5)));
  const result = getDatasetsSummary(slug, researchOnly, topN);
  return NextResponse.json(result);
}
