import { NextResponse } from "next/server";
import { getAbundanceForAccumulation } from "@/lib/queries";
import { computeInext } from "@/lib/inext";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const knots = Math.max(5, Math.min(100, Number(url.searchParams.get("knots") ?? 40)));
  const abundances = getAbundanceForAccumulation(slug, researchOnly);
  const result = computeInext({ abundances, knots });
  return NextResponse.json(result);
}
