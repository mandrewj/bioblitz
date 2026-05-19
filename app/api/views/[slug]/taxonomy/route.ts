import { NextResponse } from "next/server";
import { getTaxonomyBreakdown } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const rankParam = url.searchParams.get("rank") ?? "family";
  const rank = rankParam === "genus" ? "genus" : "family";
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 15)));
  const result = getTaxonomyBreakdown(slug, researchOnly, rank, limit);
  return NextResponse.json({ rank, ...result });
}
